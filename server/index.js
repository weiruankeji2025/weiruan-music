const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;

// WebDAV client loader (ESM module)
let createClient = null;
async function loadWebDAV() {
  const webdav = await import('webdav');
  createClient = webdav.createClient;
}
loadWebDAV();

// Google Drive OAuth2 Configuration
// Users need to set these environment variables or use the config endpoint
let GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
let GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
let GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || '';

// Store Google Drive clients
const googleDriveClients = new Map();

// CORS configuration - Allow all origins for development
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Content-Range', 'Content-Length', 'Accept-Ranges']
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// File upload configuration
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + Buffer.from(file.originalname, 'latin1').toString('utf8'));
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.wma'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported audio format'));
    }
  }
});

// Store WebDAV clients
const webdavClients = new Map();

// Upload local music files
app.post('/api/upload', upload.array('files', 50), async (req, res) => {
  try {
    const files = req.files.map(file => ({
      id: file.filename,
      name: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      path: `/api/music/${file.filename}`,
      size: file.size,
      type: 'local'
    }));
    res.json({ success: true, files });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stream local music files with range support
app.get('/api/music/:filename', (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'audio/mpeg',
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'audio/mpeg',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// Get list of uploaded files
app.get('/api/files', (req, res) => {
  try {
    if (!fs.existsSync(uploadDir)) {
      return res.json({ success: true, files: [] });
    }
    const files = fs.readdirSync(uploadDir).map(filename => {
      const stat = fs.statSync(path.join(uploadDir, filename));
      const originalName = filename.replace(/^\d+-\d+-/, '');
      return {
        id: filename,
        name: originalName,
        path: `/api/music/${filename}`,
        size: stat.size,
        type: 'local'
      };
    });
    res.json({ success: true, files });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete uploaded file
app.delete('/api/files/:filename', (req, res) => {
  try {
    const filePath = path.join(uploadDir, req.params.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, error: 'File not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// WebDAV connection
app.post('/api/webdav/connect', async (req, res) => {
  try {
    if (!createClient) {
      return res.status(500).json({ success: false, error: 'WebDAV module not loaded yet, please try again' });
    }

    const { url, username, password } = req.body;
    const clientId = `${url}-${username}`;

    const client = createClient(url, {
      username,
      password
    });

    // Test connection
    await client.getDirectoryContents('/');

    webdavClients.set(clientId, { client, url, username });

    res.json({
      success: true,
      clientId,
      message: 'WebDAV connected successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// List WebDAV directory
app.get('/api/webdav/list', async (req, res) => {
  try {
    const { clientId, path: dirPath = '/' } = req.query;
    const clientInfo = webdavClients.get(clientId);

    if (!clientInfo) {
      return res.status(400).json({ success: false, error: 'WebDAV client not connected' });
    }

    const contents = await clientInfo.client.getDirectoryContents(dirPath);
    const audioExtensions = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.wma'];

    const items = contents.map(item => ({
      name: item.basename,
      path: item.filename,
      type: item.type,
      size: item.size,
      isAudio: item.type === 'file' && audioExtensions.some(ext =>
        item.basename.toLowerCase().endsWith(ext)
      )
    }));

    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stream WebDAV file (proxy with range support)
app.get('/api/webdav/stream', async (req, res) => {
  try {
    const { clientId, path: filePath } = req.query;
    const clientInfo = webdavClients.get(clientId);

    if (!clientInfo) {
      return res.status(400).json({ success: false, error: 'WebDAV client not connected' });
    }

    const stat = await clientInfo.client.stat(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.flac': 'audio/flac',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.wma': 'audio/x-ms-wma'
    };
    const contentType = mimeTypes[ext] || 'audio/mpeg';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      const stream = clientInfo.client.createReadStream(filePath, {
        range: { start, end }
      });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': contentType,
      });
      stream.pipe(res);
    } else {
      const stream = clientInfo.client.createReadStream(filePath);
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes'
      });
      stream.pipe(res);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Disconnect WebDAV
app.post('/api/webdav/disconnect', (req, res) => {
  const { clientId } = req.body;
  webdavClients.delete(clientId);
  res.json({ success: true });
});

// Get all connected WebDAV clients
app.get('/api/webdav/clients', (req, res) => {
  const clients = Array.from(webdavClients.entries()).map(([id, info]) => ({
    id,
    url: info.url,
    username: info.username
  }));
  res.json({ success: true, clients });
});

// ==================== Google Drive API ====================

// Configure Google OAuth credentials
app.post('/api/gdrive/config', (req, res) => {
  const { clientId, clientSecret, redirectUri } = req.body;
  GOOGLE_CLIENT_ID = clientId;
  GOOGLE_CLIENT_SECRET = clientSecret;
  GOOGLE_REDIRECT_URI = redirectUri || `http://localhost:${PORT}/api/gdrive/callback`;
  res.json({ success: true, message: 'Google Drive configured' });
});

// Get Google OAuth URL
app.get('/api/gdrive/auth-url', (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(400).json({
      success: false,
      error: 'Google Drive not configured. Please set Client ID and Secret first.'
    });
  }

  const redirectUri = req.query.redirectUri || GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/gdrive/callback`;

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    redirectUri
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly'
    ],
    prompt: 'consent'
  });

  res.json({ success: true, authUrl, redirectUri });
});

// Google OAuth callback
app.get('/api/gdrive/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('Authorization code not provided');
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/gdrive/callback`
    );

    const { tokens } = await oauth2Client.getToken(code);
    const clientId = `gdrive-${Date.now()}`;

    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Get user info
    const about = await drive.about.get({ fields: 'user' });
    const userEmail = about.data.user.emailAddress;

    googleDriveClients.set(clientId, {
      oauth2Client,
      drive,
      tokens,
      email: userEmail
    });

    // Redirect back to the app with client ID
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Google Drive Connected</title></head>
      <body>
        <script>
          window.opener.postMessage({
            type: 'gdrive-connected',
            clientId: '${clientId}',
            email: '${userEmail}'
          }, '*');
          window.close();
        </script>
        <p>Google Drive connected successfully! You can close this window.</p>
      </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(`Authentication failed: ${error.message}`);
  }
});

// Connect with existing tokens
app.post('/api/gdrive/connect', async (req, res) => {
  const { accessToken, refreshToken } = req.body;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(400).json({
      success: false,
      error: 'Google Drive not configured'
    });
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const about = await drive.about.get({ fields: 'user' });
    const userEmail = about.data.user.emailAddress;

    const clientId = `gdrive-${Date.now()}`;
    googleDriveClients.set(clientId, {
      oauth2Client,
      drive,
      email: userEmail
    });

    res.json({ success: true, clientId, email: userEmail });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// List Google Drive files
app.get('/api/gdrive/list', async (req, res) => {
  try {
    const { clientId, folderId = 'root' } = req.query;
    const clientInfo = googleDriveClients.get(clientId);

    if (!clientInfo) {
      return res.status(400).json({ success: false, error: 'Google Drive not connected' });
    }

    const audioMimeTypes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/flac',
      'audio/ogg',
      'audio/mp4',
      'audio/aac',
      'audio/x-m4a',
      'application/octet-stream' // Sometimes audio files are stored as this
    ];

    // Query for folders and audio files
    const query = folderId === 'root'
      ? `'root' in parents and trashed = false`
      : `'${folderId}' in parents and trashed = false`;

    const response = await clientInfo.drive.files.list({
      q: query,
      fields: 'files(id, name, mimeType, size, modifiedTime)',
      orderBy: 'folder,name',
      pageSize: 1000
    });

    const audioExtensions = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.wma'];

    const items = response.data.files.map(file => {
      const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
      const isAudio = audioMimeTypes.includes(file.mimeType) ||
        audioExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

      return {
        id: file.id,
        name: file.name,
        type: isFolder ? 'directory' : 'file',
        size: file.size ? parseInt(file.size) : 0,
        mimeType: file.mimeType,
        isAudio: !isFolder && isAudio
      };
    });

    res.json({ success: true, items, folderId });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stream Google Drive file
app.get('/api/gdrive/stream', async (req, res) => {
  try {
    const { clientId, fileId } = req.query;
    const clientInfo = googleDriveClients.get(clientId);

    if (!clientInfo) {
      return res.status(400).json({ success: false, error: 'Google Drive not connected' });
    }

    // Get file metadata
    const fileMeta = await clientInfo.drive.files.get({
      fileId: fileId,
      fields: 'name, size, mimeType'
    });

    const fileSize = parseInt(fileMeta.data.size);
    const fileName = fileMeta.data.name;
    const range = req.headers.range;

    // Determine content type
    const ext = path.extname(fileName).toLowerCase();
    const mimeTypes = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.flac': 'audio/flac',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.wma': 'audio/x-ms-wma'
    };
    const contentType = mimeTypes[ext] || fileMeta.data.mimeType || 'audio/mpeg';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      const response = await clientInfo.drive.files.get({
        fileId: fileId,
        alt: 'media'
      }, {
        responseType: 'stream',
        headers: {
          Range: `bytes=${start}-${end}`
        }
      });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': contentType,
      });
      response.data.pipe(res);
    } else {
      const response = await clientInfo.drive.files.get({
        fileId: fileId,
        alt: 'media'
      }, {
        responseType: 'stream'
      });

      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes'
      });
      response.data.pipe(res);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Disconnect Google Drive
app.post('/api/gdrive/disconnect', (req, res) => {
  const { clientId } = req.body;
  googleDriveClients.delete(clientId);
  res.json({ success: true });
});

// Get connected Google Drive accounts
app.get('/api/gdrive/clients', (req, res) => {
  const clients = Array.from(googleDriveClients.entries()).map(([id, info]) => ({
    id,
    email: info.email
  }));
  res.json({ success: true, clients });
});

// Check if Google Drive is configured
app.get('/api/gdrive/status', (req, res) => {
  res.json({
    success: true,
    configured: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
    hasClients: googleDriveClients.size > 0
  });
});

// ==================== End Google Drive API ====================

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║   🎵 WeiRuan Music Player Server Started!                 ║
  ║                                                           ║
  ║   Local:    http://localhost:${PORT}                        ║
  ║   Network:  http://0.0.0.0:${PORT}                          ║
  ║                                                           ║
  ║   Features:                                               ║
  ║   • Local music upload & streaming                        ║
  ║   • WebDAV cloud storage support                          ║
  ║   • Google Drive support                                  ║
  ║   • Cross-origin resource sharing enabled                 ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
  `);
});
