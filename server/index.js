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

// OAuth Configuration Storage
const oauthConfig = {
  google: { clientId: '', clientSecret: '', redirectUri: '' },
  onedrive: { clientId: '', clientSecret: '', redirectUri: '' },
  dropbox: { clientId: '', clientSecret: '', redirectUri: '' },
  aliyun: { refreshToken: '' },
  baidu: { appKey: '', secretKey: '', accessToken: '', refreshToken: '' }
};

// Store cloud clients
const webdavClients = new Map();
const googleDriveClients = new Map();
const onedriveClients = new Map();
const dropboxClients = new Map();
const aliyunClients = new Map();
const baiduClients = new Map();
const alistClients = new Map();
const quarkClients = new Map();

// CORS configuration
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

// Audio MIME types
const audioMimeTypes = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wma': 'audio/x-ms-wma'
};

const audioExtensions = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.wma'];

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
  const ext = path.extname(req.params.filename).toLowerCase();
  const contentType = audioMimeTypes[ext] || 'audio/mpeg';

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
      'Content-Type': contentType,
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes'
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

// ==================== WebDAV API ====================

app.post('/api/webdav/connect', async (req, res) => {
  try {
    if (!createClient) {
      return res.status(500).json({ success: false, error: 'WebDAV 模块尚未加载，请稍后重试' });
    }

    const { url, username, password } = req.body;
    const clientId = `webdav-${Date.now()}`;

    const client = createClient(url, { username, password });
    await client.getDirectoryContents('/');

    webdavClients.set(clientId, { client, url, username });
    res.json({ success: true, clientId });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/webdav/list', async (req, res) => {
  try {
    const { clientId, path: dirPath = '/' } = req.query;
    const clientInfo = webdavClients.get(clientId);

    if (!clientInfo) {
      return res.status(400).json({ success: false, error: 'WebDAV 未连接' });
    }

    const contents = await clientInfo.client.getDirectoryContents(dirPath);
    const items = contents.map(item => ({
      name: item.basename,
      path: item.filename,
      type: item.type,
      size: item.size,
      isAudio: item.type === 'file' && audioExtensions.some(ext => item.basename.toLowerCase().endsWith(ext))
    }));

    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/webdav/stream', async (req, res) => {
  try {
    const { clientId, path: filePath } = req.query;
    const clientInfo = webdavClients.get(clientId);

    if (!clientInfo) {
      return res.status(400).json({ success: false, error: 'WebDAV 未连接' });
    }

    const stat = await clientInfo.client.stat(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const ext = path.extname(filePath).toLowerCase();
    const contentType = audioMimeTypes[ext] || 'audio/mpeg';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      const stream = clientInfo.client.createReadStream(filePath, { range: { start, end } });
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

app.post('/api/webdav/disconnect', (req, res) => {
  const { clientId } = req.body;
  webdavClients.delete(clientId);
  res.json({ success: true });
});

// ==================== Google Drive API ====================

app.post('/api/gdrive/config', (req, res) => {
  const { clientId, clientSecret, redirectUri } = req.body;
  oauthConfig.google = { clientId, clientSecret, redirectUri };
  res.json({ success: true });
});

app.get('/api/gdrive/status', (req, res) => {
  res.json({
    success: true,
    configured: !!(oauthConfig.google.clientId && oauthConfig.google.clientSecret)
  });
});

app.get('/api/gdrive/auth-url', (req, res) => {
  const { clientId, clientSecret } = oauthConfig.google;
  if (!clientId || !clientSecret) {
    return res.status(400).json({ success: false, error: 'Google Drive 未配置' });
  }

  const redirectUri = oauthConfig.google.redirectUri || `${req.protocol}://${req.get('host')}/api/gdrive/callback`;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.readonly'],
    prompt: 'consent'
  });

  res.json({ success: true, authUrl });
});

app.get('/api/gdrive/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('授权码未提供');

  try {
    const { clientId, clientSecret, redirectUri } = oauthConfig.google;
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri || `${req.protocol}://${req.get('host')}/api/gdrive/callback`);

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const about = await drive.about.get({ fields: 'user' });
    const userEmail = about.data.user.emailAddress;

    const clientIdKey = `gdrive-${Date.now()}`;
    googleDriveClients.set(clientIdKey, { oauth2Client, drive, email: userEmail });

    res.send(`<!DOCTYPE html><html><head><title>已连接</title></head><body><script>
      window.opener.postMessage({ type: 'gdrive-connected', clientId: '${clientIdKey}', email: '${userEmail}' }, '*');
      window.close();
    </script><p>Google 云盘已连接！可以关闭此窗口。</p></body></html>`);
  } catch (error) {
    res.status(500).send(`认证失败: ${error.message}`);
  }
});

app.get('/api/gdrive/list', async (req, res) => {
  try {
    const { clientId, folderId = 'root' } = req.query;
    const clientInfo = googleDriveClients.get(clientId);
    if (!clientInfo) return res.status(400).json({ success: false, error: 'Google Drive 未连接' });

    const query = `'${folderId}' in parents and trashed = false`;
    const response = await clientInfo.drive.files.list({
      q: query,
      fields: 'files(id, name, mimeType, size)',
      orderBy: 'folder,name',
      pageSize: 1000
    });

    const items = response.data.files.map(file => {
      const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
      const isAudio = audioExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
      return {
        id: file.id,
        name: file.name,
        type: isFolder ? 'directory' : 'file',
        size: file.size ? parseInt(file.size) : 0,
        isAudio: !isFolder && isAudio
      };
    });

    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/gdrive/stream', async (req, res) => {
  try {
    const { clientId, fileId } = req.query;
    const clientInfo = googleDriveClients.get(clientId);
    if (!clientInfo) return res.status(400).json({ success: false, error: 'Google Drive 未连接' });

    const fileMeta = await clientInfo.drive.files.get({ fileId, fields: 'name, size, mimeType' });
    const fileSize = parseInt(fileMeta.data.size);
    const ext = path.extname(fileMeta.data.name).toLowerCase();
    const contentType = audioMimeTypes[ext] || 'audio/mpeg';
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      const response = await clientInfo.drive.files.get({ fileId, alt: 'media' }, {
        responseType: 'stream',
        headers: { Range: `bytes=${start}-${end}` }
      });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': contentType,
      });
      response.data.pipe(res);
    } else {
      const response = await clientInfo.drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
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

app.post('/api/gdrive/disconnect', (req, res) => {
  const { clientId } = req.body;
  googleDriveClients.delete(clientId);
  res.json({ success: true });
});

// ==================== OneDrive API ====================

app.post('/api/onedrive/config', (req, res) => {
  const { clientId, clientSecret, redirectUri } = req.body;
  oauthConfig.onedrive = { clientId, clientSecret, redirectUri };
  res.json({ success: true });
});

app.get('/api/onedrive/status', (req, res) => {
  res.json({ success: true, configured: !!oauthConfig.onedrive.clientId });
});

app.get('/api/onedrive/auth-url', (req, res) => {
  const { clientId } = oauthConfig.onedrive;
  if (!clientId) return res.status(400).json({ success: false, error: 'OneDrive 未配置' });

  const redirectUri = oauthConfig.onedrive.redirectUri || `${req.protocol}://${req.get('host')}/api/onedrive/callback`;
  const scope = 'files.read files.read.all offline_access';
  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;

  res.json({ success: true, authUrl });
});

app.get('/api/onedrive/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('授权码未提供');

  try {
    const { clientId, clientSecret, redirectUri } = oauthConfig.onedrive;
    const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri || `${req.protocol}://${req.get('host')}/api/onedrive/callback`,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await response.json();
    if (tokens.error) throw new Error(tokens.error_description);

    // Get user info
    const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const user = await userResponse.json();

    const clientIdKey = `onedrive-${Date.now()}`;
    onedriveClients.set(clientIdKey, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      email: user.mail || user.userPrincipalName
    });

    res.send(`<!DOCTYPE html><html><head><title>已连接</title></head><body><script>
      window.opener.postMessage({ type: 'onedrive-connected', clientId: '${clientIdKey}', email: '${user.mail || user.userPrincipalName}' }, '*');
      window.close();
    </script><p>OneDrive 已连接！可以关闭此窗口。</p></body></html>`);
  } catch (error) {
    res.status(500).send(`认证失败: ${error.message}`);
  }
});

app.get('/api/onedrive/list', async (req, res) => {
  try {
    const { clientId, folderId = 'root' } = req.query;
    const clientInfo = onedriveClients.get(clientId);
    if (!clientInfo) return res.status(400).json({ success: false, error: 'OneDrive 未连接' });

    const url = folderId === 'root'
      ? 'https://graph.microsoft.com/v1.0/me/drive/root/children'
      : `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${clientInfo.accessToken}` }
    });
    const data = await response.json();

    const items = (data.value || []).map(item => ({
      id: item.id,
      name: item.name,
      type: item.folder ? 'directory' : 'file',
      size: item.size || 0,
      isAudio: !item.folder && audioExtensions.some(ext => item.name.toLowerCase().endsWith(ext))
    }));

    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/onedrive/stream', async (req, res) => {
  try {
    const { clientId, fileId } = req.query;
    const clientInfo = onedriveClients.get(clientId);
    if (!clientInfo) return res.status(400).json({ success: false, error: 'OneDrive 未连接' });

    // Get download URL
    const metaResponse = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`, {
      headers: { Authorization: `Bearer ${clientInfo.accessToken}` }
    });
    const meta = await metaResponse.json();

    if (meta['@microsoft.graph.downloadUrl']) {
      res.redirect(meta['@microsoft.graph.downloadUrl']);
    } else {
      res.status(400).json({ success: false, error: '无法获取下载链接' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/onedrive/disconnect', (req, res) => {
  const { clientId } = req.body;
  onedriveClients.delete(clientId);
  res.json({ success: true });
});

// ==================== Dropbox API ====================

app.post('/api/dropbox/config', (req, res) => {
  const { clientId, clientSecret, redirectUri } = req.body;
  oauthConfig.dropbox = { clientId, clientSecret, redirectUri };
  res.json({ success: true });
});

app.get('/api/dropbox/status', (req, res) => {
  res.json({ success: true, configured: !!oauthConfig.dropbox.clientId });
});

app.get('/api/dropbox/auth-url', (req, res) => {
  const { clientId } = oauthConfig.dropbox;
  if (!clientId) return res.status(400).json({ success: false, error: 'Dropbox 未配置' });

  const redirectUri = oauthConfig.dropbox.redirectUri || `${req.protocol}://${req.get('host')}/api/dropbox/callback`;
  const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&token_access_type=offline`;

  res.json({ success: true, authUrl });
});

app.get('/api/dropbox/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('授权码未提供');

  try {
    const { clientId, clientSecret, redirectUri } = oauthConfig.dropbox;

    const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri || `${req.protocol}://${req.get('host')}/api/dropbox/callback`
      })
    });

    const tokens = await response.json();
    if (tokens.error) throw new Error(tokens.error_description);

    // Get user info
    const userResponse = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const user = await userResponse.json();

    const clientIdKey = `dropbox-${Date.now()}`;
    dropboxClients.set(clientIdKey, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      email: user.email
    });

    res.send(`<!DOCTYPE html><html><head><title>已连接</title></head><body><script>
      window.opener.postMessage({ type: 'dropbox-connected', clientId: '${clientIdKey}', email: '${user.email}' }, '*');
      window.close();
    </script><p>Dropbox 已连接！可以关闭此窗口。</p></body></html>`);
  } catch (error) {
    res.status(500).send(`认证失败: ${error.message}`);
  }
});

app.get('/api/dropbox/list', async (req, res) => {
  try {
    const { clientId, path: folderPath = '' } = req.query;
    const clientInfo = dropboxClients.get(clientId);
    if (!clientInfo) return res.status(400).json({ success: false, error: 'Dropbox 未连接' });

    const response = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clientInfo.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: folderPath || '', recursive: false })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error_summary);

    const items = (data.entries || []).map(item => ({
      id: item.id,
      name: item.name,
      path: item.path_lower,
      type: item['.tag'] === 'folder' ? 'directory' : 'file',
      size: item.size || 0,
      isAudio: item['.tag'] === 'file' && audioExtensions.some(ext => item.name.toLowerCase().endsWith(ext))
    }));

    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/dropbox/stream', async (req, res) => {
  try {
    const { clientId, path: filePath } = req.query;
    const clientInfo = dropboxClients.get(clientId);
    if (!clientInfo) return res.status(400).json({ success: false, error: 'Dropbox 未连接' });

    // Get temporary link
    const response = await fetch('https://api.dropboxapi.com/2/files/get_temporary_link', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clientInfo.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: filePath })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error_summary);

    res.redirect(data.link);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/dropbox/disconnect', (req, res) => {
  const { clientId } = req.body;
  dropboxClients.delete(clientId);
  res.json({ success: true });
});

// ==================== 阿里云盘 API ====================

app.post('/api/aliyun/config', (req, res) => {
  const { refreshToken } = req.body;
  oauthConfig.aliyun = { refreshToken };
  res.json({ success: true });
});

app.get('/api/aliyun/status', (req, res) => {
  res.json({ success: true, configured: !!oauthConfig.aliyun.refreshToken });
});

app.post('/api/aliyun/connect', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    // Get access token
    const response = await fetch('https://auth.aliyundrive.com/v2/account/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken })
    });

    const data = await response.json();
    if (data.code) throw new Error(data.message || '刷新令牌无效');

    const clientId = `aliyun-${Date.now()}`;
    aliyunClients.set(clientId, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      driveId: data.default_drive_id,
      userId: data.user_id,
      userName: data.nick_name || data.user_name
    });

    res.json({ success: true, clientId, userName: data.nick_name || data.user_name });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/aliyun/list', async (req, res) => {
  try {
    const { clientId, folderId = 'root' } = req.query;
    const clientInfo = aliyunClients.get(clientId);
    if (!clientInfo) return res.status(400).json({ success: false, error: '阿里云盘未连接' });

    const response = await fetch('https://api.aliyundrive.com/adrive/v3/file/list', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clientInfo.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        drive_id: clientInfo.driveId,
        parent_file_id: folderId,
        limit: 200,
        order_by: 'name',
        order_direction: 'ASC'
      })
    });

    const data = await response.json();
    if (data.code) throw new Error(data.message);

    const items = (data.items || []).map(item => ({
      id: item.file_id,
      name: item.name,
      type: item.type === 'folder' ? 'directory' : 'file',
      size: item.size || 0,
      isAudio: item.type === 'file' && audioExtensions.some(ext => item.name.toLowerCase().endsWith(ext))
    }));

    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/aliyun/stream', async (req, res) => {
  try {
    const { clientId, fileId } = req.query;
    const clientInfo = aliyunClients.get(clientId);
    if (!clientInfo) return res.status(400).json({ success: false, error: '阿里云盘未连接' });

    const response = await fetch('https://api.aliyundrive.com/v2/file/get_download_url', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clientInfo.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ drive_id: clientInfo.driveId, file_id: fileId })
    });

    const data = await response.json();
    if (data.code) throw new Error(data.message);

    res.redirect(data.url);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/aliyun/disconnect', (req, res) => {
  const { clientId } = req.body;
  aliyunClients.delete(clientId);
  res.json({ success: true });
});

// ==================== 百度网盘 API ====================

app.post('/api/baidu/config', (req, res) => {
  const { appKey, secretKey, redirectUri } = req.body;
  oauthConfig.baidu = { ...oauthConfig.baidu, appKey, secretKey, redirectUri };
  res.json({ success: true });
});

app.get('/api/baidu/status', (req, res) => {
  res.json({ success: true, configured: !!oauthConfig.baidu.appKey });
});

app.get('/api/baidu/auth-url', (req, res) => {
  const { appKey } = oauthConfig.baidu;
  if (!appKey) return res.status(400).json({ success: false, error: '百度网盘未配置' });

  const redirectUri = oauthConfig.baidu.redirectUri || `${req.protocol}://${req.get('host')}/api/baidu/callback`;
  const authUrl = `https://openapi.baidu.com/oauth/2.0/authorize?response_type=code&client_id=${appKey}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=basic,netdisk`;

  res.json({ success: true, authUrl });
});

app.get('/api/baidu/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('授权码未提供');

  try {
    const { appKey, secretKey, redirectUri } = oauthConfig.baidu;

    const response = await fetch(`https://openapi.baidu.com/oauth/2.0/token?grant_type=authorization_code&code=${code}&client_id=${appKey}&client_secret=${secretKey}&redirect_uri=${encodeURIComponent(redirectUri || `${req.protocol}://${req.get('host')}/api/baidu/callback`)}`);

    const tokens = await response.json();
    if (tokens.error) throw new Error(tokens.error_description);

    // Get user info
    const userResponse = await fetch(`https://pan.baidu.com/rest/2.0/xpan/nas?method=uinfo&access_token=${tokens.access_token}`);
    const user = await userResponse.json();

    const clientId = `baidu-${Date.now()}`;
    baiduClients.set(clientId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      userName: user.baidu_name || user.netdisk_name
    });

    res.send(`<!DOCTYPE html><html><head><title>已连接</title></head><body><script>
      window.opener.postMessage({ type: 'baidu-connected', clientId: '${clientId}', userName: '${user.baidu_name || user.netdisk_name}' }, '*');
      window.close();
    </script><p>百度网盘已连接！可以关闭此窗口。</p></body></html>`);
  } catch (error) {
    res.status(500).send(`认证失败: ${error.message}`);
  }
});

app.get('/api/baidu/list', async (req, res) => {
  try {
    const { clientId, path: folderPath = '/' } = req.query;
    const clientInfo = baiduClients.get(clientId);
    if (!clientInfo) return res.status(400).json({ success: false, error: '百度网盘未连接' });

    const response = await fetch(`https://pan.baidu.com/rest/2.0/xpan/file?method=list&dir=${encodeURIComponent(folderPath)}&access_token=${clientInfo.accessToken}&web=1`);
    const data = await response.json();

    if (data.errno) throw new Error(`错误代码: ${data.errno}`);

    const items = (data.list || []).map(item => ({
      id: item.fs_id.toString(),
      name: item.server_filename,
      path: item.path,
      type: item.isdir ? 'directory' : 'file',
      size: item.size || 0,
      isAudio: !item.isdir && audioExtensions.some(ext => item.server_filename.toLowerCase().endsWith(ext))
    }));

    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/baidu/stream', async (req, res) => {
  try {
    const { clientId, fsId, path: filePath } = req.query;
    const clientInfo = baiduClients.get(clientId);
    if (!clientInfo) return res.status(400).json({ success: false, error: '百度网盘未连接' });

    // Get download link
    const response = await fetch(`https://pan.baidu.com/rest/2.0/xpan/multimedia?method=filemetas&access_token=${clientInfo.accessToken}&fsids=[${fsId}]&dlink=1`);
    const data = await response.json();

    if (data.errno || !data.list || !data.list[0]) throw new Error('无法获取下载链接');

    const downloadUrl = `${data.list[0].dlink}&access_token=${clientInfo.accessToken}`;
    res.redirect(downloadUrl);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/baidu/disconnect', (req, res) => {
  const { clientId } = req.body;
  baiduClients.delete(clientId);
  res.json({ success: true });
});

// ==================== Alist API (with CORS proxy) ====================

app.post('/api/alist/connect', async (req, res) => {
  try {
    const { url, username, password } = req.body;
    let baseUrl = url.replace(/\/+$/, ''); // Remove trailing slashes
    let token = '';

    // Try to login if credentials provided
    if (username && password) {
      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const loginData = await loginResponse.json();
      if (loginData.code === 200 && loginData.data && loginData.data.token) {
        token = loginData.data.token;
      } else if (loginData.code !== 200) {
        throw new Error(loginData.message || '登录失败');
      }
    }

    // Test connection by listing root
    const testResponse = await fetch(`${baseUrl}/api/fs/list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': token } : {})
      },
      body: JSON.stringify({ path: '/', page: 1, per_page: 1 })
    });
    const testData = await testResponse.json();
    if (testData.code !== 200) {
      throw new Error(testData.message || '无法访问 Alist 服务器');
    }

    const clientId = `alist-${Date.now()}`;
    alistClients.set(clientId, { baseUrl, token });

    res.json({ success: true, clientId });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/alist/list', async (req, res) => {
  try {
    const { clientId, path: dirPath = '/' } = req.query;
    const clientInfo = alistClients.get(clientId);
    if (!clientInfo) return res.status(400).json({ success: false, error: 'Alist 未连接' });

    const response = await fetch(`${clientInfo.baseUrl}/api/fs/list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(clientInfo.token ? { 'Authorization': clientInfo.token } : {})
      },
      body: JSON.stringify({ path: dirPath, page: 1, per_page: 1000, refresh: false })
    });

    const data = await response.json();
    if (data.code !== 200) throw new Error(data.message || '获取文件列表失败');

    const items = (data.data?.content || []).map(item => {
      const fullPath = dirPath === '/' ? `/${item.name}` : `${dirPath}/${item.name}`;
      return {
        name: item.name,
        path: fullPath,
        type: item.is_dir ? 'directory' : 'file',
        size: item.size || 0,
        isAudio: !item.is_dir && audioExtensions.some(ext => item.name.toLowerCase().endsWith(ext))
      };
    });

    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/alist/stream', async (req, res) => {
  try {
    const { clientId, path: filePath } = req.query;
    const clientInfo = alistClients.get(clientId);
    if (!clientInfo) return res.status(400).json({ success: false, error: 'Alist 未连接' });

    // Get file info and download link
    const response = await fetch(`${clientInfo.baseUrl}/api/fs/get`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(clientInfo.token ? { 'Authorization': clientInfo.token } : {})
      },
      body: JSON.stringify({ path: filePath })
    });

    const data = await response.json();
    if (data.code !== 200) throw new Error(data.message || '获取文件信息失败');

    const rawUrl = data.data?.raw_url;
    if (!rawUrl) throw new Error('无法获取下载链接');

    // Proxy the stream to handle CORS
    const ext = path.extname(filePath).toLowerCase();
    const contentType = audioMimeTypes[ext] || 'audio/mpeg';
    const range = req.headers.range;

    const headers = {
      ...(range ? { Range: range } : {}),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    // For some Alist sources, we need to use the sign parameter
    if (data.data?.sign) {
      const signedUrl = rawUrl.includes('?') ? `${rawUrl}&sign=${data.data.sign}` : `${rawUrl}?sign=${data.data.sign}`;
      const proxyResponse = await fetch(signedUrl, { headers });

      if (range && proxyResponse.status === 206) {
        res.writeHead(206, {
          'Content-Range': proxyResponse.headers.get('content-range'),
          'Accept-Ranges': 'bytes',
          'Content-Length': proxyResponse.headers.get('content-length'),
          'Content-Type': contentType,
        });
      } else {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Content-Length': proxyResponse.headers.get('content-length'),
        });
      }

      const nodeStream = require('stream');
      const readableStream = nodeStream.Readable.fromWeb(proxyResponse.body);
      readableStream.pipe(res);
    } else {
      // For direct links, redirect
      res.redirect(rawUrl);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/alist/disconnect', (req, res) => {
  const { clientId } = req.body;
  alistClients.delete(clientId);
  res.json({ success: true });
});

// ==================== 夸克网盘 API ====================

app.post('/api/quark/connect', async (req, res) => {
  try {
    const { cookie } = req.body;
    if (!cookie) {
      throw new Error('请提供 Cookie');
    }

    // 验证 Cookie 是否有效
    const testResponse = await fetch('https://drive-pc.quark.cn/1/clouddrive/file/sort?pr=ucpro&fr=pc&pdir_fid=0&_page=1&_size=1', {
      headers: {
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const testData = await testResponse.json();
    if (testData.status !== 200) {
      throw new Error(testData.message || 'Cookie 无效或已过期');
    }

    const clientId = `quark-${Date.now()}`;
    quarkClients.set(clientId, { cookie });

    res.json({ success: true, clientId });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/quark/list', async (req, res) => {
  try {
    const { clientId, folderId = '0' } = req.query;
    const clientInfo = quarkClients.get(clientId);
    if (!clientInfo) return res.status(400).json({ success: false, error: '夸克网盘未连接' });

    const response = await fetch(`https://drive-pc.quark.cn/1/clouddrive/file/sort?pr=ucpro&fr=pc&pdir_fid=${folderId}&_page=1&_size=200&_fetch_total=1`, {
      headers: {
        'Cookie': clientInfo.cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const data = await response.json();
    if (data.status !== 200) throw new Error(data.message || '获取文件列表失败');

    const items = (data.data?.list || []).map(item => ({
      id: item.fid,
      name: item.file_name,
      type: item.file ? 'file' : 'directory',
      size: item.size || 0,
      isAudio: item.file && audioExtensions.some(ext => item.file_name.toLowerCase().endsWith(ext))
    }));

    res.json({ success: true, items, path: '/' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/quark/stream', async (req, res) => {
  try {
    const { clientId, fileId } = req.query;
    const clientInfo = quarkClients.get(clientId);
    if (!clientInfo) return res.status(400).json({ success: false, error: '夸克网盘未连接' });

    // 获取下载链接
    const downloadResponse = await fetch('https://drive-pc.quark.cn/1/clouddrive/file/download?pr=ucpro&fr=pc', {
      method: 'POST',
      headers: {
        'Cookie': clientInfo.cookie,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({ fids: [fileId] })
    });

    const downloadData = await downloadResponse.json();
    if (downloadData.status !== 200 || !downloadData.data?.[0]?.download_url) {
      throw new Error('无法获取下载链接');
    }

    const downloadUrl = downloadData.data[0].download_url;

    // 代理流式传输
    const range = req.headers.range;
    const headers = {
      'Cookie': clientInfo.cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      ...(range ? { Range: range } : {})
    };

    const proxyResponse = await fetch(downloadUrl, { headers });

    const contentType = proxyResponse.headers.get('content-type') || 'audio/mpeg';

    if (range && proxyResponse.status === 206) {
      res.writeHead(206, {
        'Content-Range': proxyResponse.headers.get('content-range'),
        'Accept-Ranges': 'bytes',
        'Content-Length': proxyResponse.headers.get('content-length'),
        'Content-Type': contentType,
      });
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Content-Length': proxyResponse.headers.get('content-length'),
      });
    }

    const nodeStream = require('stream');
    const readableStream = nodeStream.Readable.fromWeb(proxyResponse.body);
    readableStream.pipe(res);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/quark/disconnect', (req, res) => {
  const { clientId } = req.body;
  quarkClients.delete(clientId);
  res.json({ success: true });
});

// ==================== 本地扫描 API ====================

// 递归扫描目录
async function scanDirectory(dirPath, recursive = true) {
  const results = [];

  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory() && recursive) {
        const subResults = await scanDirectory(fullPath, recursive);
        results.push(...subResults);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (audioExtensions.includes(ext)) {
          const stats = await fs.promises.stat(fullPath);
          results.push({
            id: `local-${Buffer.from(fullPath).toString('base64')}`,
            name: entry.name,
            path: `/api/local/stream?file=${encodeURIComponent(fullPath)}`,
            fullPath: fullPath,
            size: stats.size,
            type: 'local'
          });
        }
      }
    }
  } catch (error) {
    console.error(`扫描目录失败 ${dirPath}:`, error.message);
  }

  return results;
}

app.post('/api/local/scan', async (req, res) => {
  try {
    const { path: scanPath, recursive = true } = req.body;

    if (!scanPath) {
      return res.status(400).json({ success: false, error: '请提供扫描路径' });
    }

    // 检查路径是否存在
    try {
      await fs.promises.access(scanPath, fs.constants.R_OK);
    } catch {
      return res.status(400).json({ success: false, error: '路径不存在或无法访问' });
    }

    const stats = await fs.promises.stat(scanPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ success: false, error: '路径不是有效目录' });
    }

    const files = await scanDirectory(scanPath, recursive);

    res.json({
      success: true,
      files: files,
      count: files.length,
      path: scanPath
    });
  } catch (error) {
    console.error('扫描失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/local/stream', async (req, res) => {
  try {
    const { file: filePath } = req.query;

    if (!filePath) {
      return res.status(400).json({ success: false, error: '缺少文件路径' });
    }

    // 检查文件是否存在
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }

    const stats = await fs.promises.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = audioMimeTypes[ext] || 'audio/mpeg';

    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunkSize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });

      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stats.size,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      });

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    }
  } catch (error) {
    console.error('流式传输失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== 音乐信息API (封面/歌词) ====================

app.get('/api/music/info', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) {
      return res.json({ success: false, error: '缺少歌曲名称' });
    }

    // 清理歌曲名称（去除括号内容、特殊字符等）
    const cleanName = name
      .replace(/\([^)]*\)/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/[-_]/g, ' ')
      .trim();

    // 搜索歌曲信息 (使用网易云音乐 API - POST 方法)
    const searchUrl = 'https://music.163.com/api/search/get/web';
    const searchParams = new URLSearchParams({
      s: cleanName,
      type: '1',
      limit: '5',
      offset: '0'
    });

    const searchResponse = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://music.163.com/',
        'Origin': 'https://music.163.com',
        'Cookie': 'appver=2.0.2'
      },
      body: searchParams.toString()
    });

    const searchData = await searchResponse.json();

    if (!searchData.result?.songs?.[0]) {
      // 尝试简化搜索词再搜索一次
      const simpleName = cleanName.split(' ')[0];
      if (simpleName !== cleanName) {
        const retryParams = new URLSearchParams({
          s: simpleName,
          type: '1',
          limit: '3',
          offset: '0'
        });

        const retryResponse = await fetch(searchUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://music.163.com/',
            'Cookie': 'appver=2.0.2'
          },
          body: retryParams.toString()
        });

        const retryData = await retryResponse.json();
        if (!retryData.result?.songs?.[0]) {
          return res.json({ success: false, error: '未找到歌曲' });
        }
        searchData.result = retryData.result;
      } else {
        return res.json({ success: false, error: '未找到歌曲' });
      }
    }

    const song = searchData.result.songs[0];
    const songId = song.id;
    const artist = song.artists?.map(a => a.name).join(', ') || song.ar?.map(a => a.name).join(', ') || '未知';

    // 获取封面（使用更高清的图片）
    let cover = null;
    if (song.album?.picUrl || song.al?.picUrl) {
      const picUrl = song.album?.picUrl || song.al?.picUrl;
      cover = picUrl.replace('http://', 'https://') + '?param=500y500';
    }

    // 获取歌词
    let lyrics = null;
    try {
      const lyricUrl = `https://music.163.com/api/song/lyric?id=${songId}&lv=1&kv=1&tv=-1`;
      const lyricResponse = await fetch(lyricUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://music.163.com/',
          'Cookie': 'appver=2.0.2'
        }
      });
      const lyricData = await lyricResponse.json();
      if (lyricData.lrc?.lyric) {
        lyrics = lyricData.lrc.lyric;
      }
    } catch (e) {
      console.error('获取歌词失败:', e);
    }

    res.json({
      success: true,
      songId,
      artist,
      cover,
      lyrics
    });
  } catch (error) {
    console.error('获取音乐信息失败:', error);
    res.json({ success: false, error: error.message });
  }
});

// 封面图片代理（解决跨域问题）
app.get('/api/cover/proxy', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ success: false, error: '缺少图片URL' });
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://music.163.com/'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ success: false, error: '获取图片失败' });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 缓存1天

    const nodeStream = require('stream');
    const readableStream = nodeStream.Readable.fromWeb(response.body);
    readableStream.pipe(res);
  } catch (error) {
    console.error('代理图片失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║   🎵 微软音乐播放器服务已启动！                              ║
  ║                                                           ║
  ║   本地:    http://localhost:${PORT}                          ║
  ║   网络:    http://0.0.0.0:${PORT}                            ║
  ║                                                           ║
  ║   支持的云存储:                                            ║
  ║   • WebDAV (Nextcloud, ownCloud, 坚果云)                  ║
  ║   • Google Drive                                          ║
  ║   • OneDrive                                              ║
  ║   • Dropbox                                               ║
  ║   • 阿里云盘                                               ║
  ║   • 百度网盘                                               ║
  ║   • Alist (多网盘聚合)                                     ║
  ║   • 夸克网盘                                               ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
  `);
});
