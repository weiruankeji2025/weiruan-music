const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// WebDAV client loader (ESM module)
let createClient = null;
async function loadWebDAV() {
  const webdav = await import('webdav');
  createClient = webdav.createClient;
}
loadWebDAV();

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
  ║   • Cross-origin resource sharing enabled                 ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
  `);
});
