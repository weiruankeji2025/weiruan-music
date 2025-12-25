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

// 歌曲元数据缓存目录
const metadataDir = path.join(__dirname, '../metadata');
if (!fs.existsSync(metadataDir)) {
  fs.mkdirSync(metadataDir, { recursive: true });
}

// 元数据缓存文件
const metadataCacheFile = path.join(metadataDir, 'songs.json');

// 加载元数据缓存
function loadMetadataCache() {
  try {
    if (fs.existsSync(metadataCacheFile)) {
      return JSON.parse(fs.readFileSync(metadataCacheFile, 'utf8'));
    }
  } catch (e) {
    console.error('加载元数据缓存失败:', e.message);
  }
  return {};
}

// 保存元数据缓存
function saveMetadataCache(cache) {
  try {
    fs.writeFileSync(metadataCacheFile, JSON.stringify(cache, null, 2), 'utf8');
  } catch (e) {
    console.error('保存元数据缓存失败:', e.message);
  }
}

// 全局元数据缓存
let songMetadataCache = loadMetadataCache();

// File upload configuration
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    // 清理文件名，移除特殊字符
    const safeName = originalName.replace(/[<>:"/\\|?*]/g, '_');
    cb(null, uniqueSuffix + '-' + safeName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB per file
    files: 100 // max 100 files
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.wma'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(null, false); // Skip unsupported files instead of error
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

// music-metadata for reading embedded covers
let musicMetadata = null;
(async () => {
  try {
    musicMetadata = await import('music-metadata');
  } catch (e) {
    console.log('music-metadata not available:', e.message);
  }
})();

// Upload local music files with better error handling
app.post('/api/upload', upload.array('files', 100), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: '没有上传文件' });
    }

    const files = req.files.map(file => {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      return {
        id: file.filename,
        name: originalName,
        path: `/api/music/${encodeURIComponent(file.filename)}`,
        size: file.size,
        type: 'local'
      };
    });

    console.log(`成功上传 ${files.length} 个文件`);
    res.json({ success: true, files });
  } catch (error) {
    console.error('上传失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get embedded cover from audio file
app.get('/api/cover/embedded/:filename', async (req, res) => {
  try {
    if (!musicMetadata) {
      return res.status(500).json({ success: false, error: 'music-metadata not available' });
    }

    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(uploadDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    const metadata = await musicMetadata.parseFile(filePath);
    const picture = metadata.common.picture?.[0];

    if (picture) {
      res.setHeader('Content-Type', picture.format);
      res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 days
      res.send(picture.data);
    } else {
      res.status(404).json({ success: false, error: 'No embedded cover' });
    }
  } catch (error) {
    console.error('读取内嵌封面失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stream local music files with range support (iOS compatible)
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

  // iOS Safari requires proper CORS headers for audio playback
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
    'Cache-Control': 'public, max-age=86400'
  };

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      ...corsHeaders,
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      ...corsHeaders,
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

    // iOS Safari requires proper CORS headers for audio playback
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Range',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
      'Cache-Control': 'public, max-age=86400'
    };

    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunkSize = (end - start) + 1;

      res.writeHead(206, {
        ...corsHeaders,
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });

      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        ...corsHeaders,
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

// 解析文件名获取歌曲名和歌手名
function parseFileName(filename) {
  // 移除扩展名
  let name = filename.replace(/\.(mp3|flac|wav|ogg|m4a|aac|wma)$/i, '');

  // 常见的文件名格式:
  // 1. "歌手 - 歌名"
  // 2. "歌名 - 歌手"
  // 3. "01. 歌手 - 歌名"
  // 4. "歌手-歌名"
  // 5. "歌名"

  // 移除开头的序号
  name = name.replace(/^(\d+\.?\s*[-_]?\s*)/g, '');

  // 移除括号内容
  name = name.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/【[^】]*】/g, '');

  let artist = null;
  let songName = name.trim();

  // 尝试用 " - " 分割
  if (name.includes(' - ')) {
    const parts = name.split(' - ').map(p => p.trim()).filter(p => p);
    if (parts.length >= 2) {
      // 判断哪个是歌手：通常歌手名较短，或者包含常见歌手名
      const part1 = parts[0];
      const part2 = parts.slice(1).join(' - ');

      // 简单规则：第一部分当作歌手
      artist = part1;
      songName = part2;
    }
  } else if (name.includes('-') && !name.includes(' ')) {
    // 紧凑格式 "歌手-歌名"
    const parts = name.split('-').map(p => p.trim()).filter(p => p);
    if (parts.length >= 2) {
      artist = parts[0];
      songName = parts.slice(1).join('-');
    }
  }

  return {
    songName: songName.trim(),
    artist: artist ? artist.trim() : null,
    original: filename
  };
}

// 内建歌手资料库
const artistDatabase = {
  '周杰伦': {
    name: '周杰伦',
    alias: ['Jay Chou', 'Jay'],
    avatar: 'https://p1.music.126.net/cpUh3AxzNVDuqJqoYHW_-A==/109951168477461650.jpg',
    description: '华语流行乐坛天王，台湾著名歌手、词曲创作人、导演、演员。2000年发行首张专辑《Jay》一炮而红，代表作有《双节棍》《青花瓷》《稻香》《晴天》《告白气球》等。音乐风格融合R&B、中国风、说唱等多种元素，被誉为"亚洲流行天王"。',
    tags: ['华语', 'R&B', '中国风', '说唱'],
    birthYear: 1979
  },
  '林俊杰': {
    name: '林俊杰',
    alias: ['JJ Lin', 'JJ'],
    avatar: 'https://p1.music.126.net/S2dcGZD7u_jB_yEZgqvFbg==/109951163020569640.jpg',
    description: '新加坡华语流行乐男歌手、词曲创作者、音乐制作人。代表作有《江南》《曹操》《小酒窝》《可惜没如果》《修炼爱情》等，以高超的唱功和优美的旋律著称。',
    tags: ['华语', '流行', '情歌'],
    birthYear: 1981
  },
  '陈奕迅': {
    name: '陈奕迅',
    alias: ['Eason Chan', 'Eason', '医生'],
    avatar: 'https://p1.music.126.net/y4JQOSHzrRbLPqMvWrSXdw==/109951163070235439.jpg',
    description: '香港著名歌手，被誉为"歌神"。代表作有《十年》《K歌之王》《浮夸》《富士山下》《孤勇者》等，声线独特，情感表达细腻，是华语乐坛最具影响力的歌手之一。',
    tags: ['粤语', '华语', '流行', '情歌'],
    birthYear: 1974
  },
  '邓紫棋': {
    name: '邓紫棋',
    alias: ['G.E.M.', 'GEM'],
    avatar: 'https://p1.music.126.net/i0brtBnJr0hgAadMmMGD8g==/109951168290806506.jpg',
    description: '香港创作女歌手，以强大的唱功和创作能力著称。代表作有《泡沫》《光年之外》《句号》《倒数》《平凡天使》等，被誉为"铁肺女王"。',
    tags: ['华语', '流行', '电子'],
    birthYear: 1991
  },
  '薛之谦': {
    name: '薛之谦',
    alias: ['Joker Xue'],
    avatar: 'https://p1.music.126.net/v5NdJWF1O6bh_ycI0S6qWQ==/109951165695748609.jpg',
    description: '中国内地流行男歌手、音乐制作人、演员。代表作有《演员》《丑八怪》《绅士》《认真的雪》《像风一样》等，以深情细腻的演唱风格著称。',
    tags: ['华语', '流行', '情歌'],
    birthYear: 1983
  },
  '周深': {
    name: '周深',
    alias: ['Charlie Zhou', 'Zhou Shen'],
    avatar: 'https://p1.music.126.net/r-b7DpF8UOx0K_nWQTmhsA==/109951166586194201.jpg',
    description: '中国内地男歌手，以独特的高音和空灵的声线著称。代表作有《大鱼》《起风了》《达拉崩吧》《光亮》《明月传说》等，被誉为"人间天籁"。',
    tags: ['华语', '流行', 'OST', '古风'],
    birthYear: 1992
  },
  '毛不易': {
    name: '毛不易',
    alias: ['Mao Buyi'],
    avatar: 'https://p1.music.126.net/EFfJSfz0xSJWP1aWYvIPYQ==/109951163254825398.jpg',
    description: '中国内地男歌手、音乐人。代表作有《消愁》《像我这样的人》《平凡的一天》《无问》等，以朴实真挚的词曲创作和温暖的歌声打动人心。',
    tags: ['华语', '民谣', '流行'],
    birthYear: 1994
  },
  '华晨宇': {
    name: '华晨宇',
    alias: ['Hua Chenyu'],
    avatar: 'https://p1.music.126.net/WwfRXIHqmMO0O8PNaWoJaA==/109951165792783096.jpg',
    description: '中国内地男歌手、词曲创作人。以独特的音乐风格和强大的现场演唱能力著称，代表作有《齐天》《烟火里的尘埃》《好想爱这个世界啊》《我们》等。',
    tags: ['华语', '流行', '摇滚'],
    birthYear: 1990
  },
  '李荣浩': {
    name: '李荣浩',
    alias: ['Li Ronghao'],
    avatar: 'https://p1.music.126.net/S_wRSMWkSTZOXvPJZCz6dQ==/109951164387049573.jpg',
    description: '中国内地男歌手、音乐制作人、吉他手。代表作有《李白》《模特》《年少有为》《麻雀》《不将就》等，以深情的嗓音和优秀的创作能力著称。',
    tags: ['华语', '流行', '摇滚'],
    birthYear: 1985
  },
  'Taylor Swift': {
    name: 'Taylor Swift',
    alias: ['泰勒·斯威夫特', '霉霉', 'Taylor'],
    avatar: 'https://p1.music.126.net/PFx-5t8l1_9J83EZZ5Ci_Q==/109951168538085393.jpg',
    description: '美国著名创作歌手，全球最具影响力的音乐人之一。从乡村音乐出道，逐渐转型为流行巨星。代表作有《Love Story》《Shake It Off》《Blank Space》《Anti-Hero》等。',
    tags: ['欧美', '流行', '乡村'],
    birthYear: 1989
  },
  'Ed Sheeran': {
    name: 'Ed Sheeran',
    alias: ['艾德·希兰'],
    avatar: 'https://p1.music.126.net/q-z_Rqe6m7pBp3f_s_1g2w==/109951163284940334.jpg',
    description: '英国创作歌手，以抒情民谣和流行音乐著称。代表作有《Shape of You》《Perfect》《Thinking Out Loud》《Photograph》等。',
    tags: ['欧美', '流行', '民谣'],
    birthYear: 1991
  },
  '五月天': {
    name: '五月天',
    alias: ['Mayday'],
    avatar: 'https://p1.music.126.net/FnB-4LMFtLjHl6GUqhsA2Q==/109951165898633787.jpg',
    description: '台湾著名摇滚乐团，华语乐坛最具影响力的乐队之一。代表作有《倔强》《突然好想你》《知足》《温柔》《伤心的人别听慢歌》等。',
    tags: ['华语', '摇滚', '流行'],
    birthYear: 1997
  },
  '蔡依林': {
    name: '蔡依林',
    alias: ['Jolin Tsai', 'Jolin'],
    avatar: 'https://p1.music.126.net/RCz8d8rZTYB9JFgY9dJ-Qw==/109951163191906315.jpg',
    description: '台湾著名女歌手，被誉为"亚洲流行天后"。代表作有《日不落》《舞娘》《说爱你》《玫瑰少年》等，以华丽的舞台表演和多变的音乐风格著称。',
    tags: ['华语', '流行', '电子', '舞曲'],
    birthYear: 1980
  },
  '王力宏': {
    name: '王力宏',
    alias: ['Leehom Wang', 'Leehom'],
    avatar: 'https://p1.music.126.net/gfx-_3d2F9mRUPVLPqFexQ==/109951167996283795.jpg',
    description: '美籍华裔创作歌手、音乐制作人、演员、导演。代表作有《唯一》《你不知道的事》《落叶归根》《改变自己》等，被誉为"优质偶像"。',
    tags: ['华语', 'R&B', '流行'],
    birthYear: 1976
  },
  '张学友': {
    name: '张学友',
    alias: ['Jacky Cheung', '歌神'],
    avatar: 'https://p1.music.126.net/63gmN3F0Sd6k_K5BrYJy2A==/109951163500574953.jpg',
    description: '香港著名歌手、演员，被誉为"四大天王"之一和"歌神"。代表作有《吻别》《一路上有你》《只想一生跟你走》《慢慢》等，是华语乐坛最成功的歌手之一。',
    tags: ['粤语', '华语', '流行', '情歌'],
    birthYear: 1961
  },
  'BTS': {
    name: 'BTS',
    alias: ['防弹少年团', 'Bangtan Boys'],
    avatar: 'https://p1.music.126.net/uolW9m8uu1XHxFZQMH4PqA==/109951167910983601.jpg',
    description: '韩国男子音乐组合，全球最具影响力的K-Pop团体之一。代表作有《Dynamite》《Butter》《Spring Day》《Boy With Luv》等。',
    tags: ['韩语', 'K-Pop', '流行'],
    birthYear: 2013
  },
  'BLACKPINK': {
    name: 'BLACKPINK',
    alias: ['블랙핑크'],
    avatar: 'https://p1.music.126.net/DvUC_D2B30oT_9RfIJD_cQ==/109951168542766098.jpg',
    description: '韩国女子音乐组合，全球最具影响力的K-Pop女团之一。代表作有《DDU-DU DDU-DU》《How You Like That》《Pink Venom》等。',
    tags: ['韩语', 'K-Pop', '流行'],
    birthYear: 2016
  }
};

// 搜索歌手信息
function findArtistInfo(artistName) {
  if (!artistName) return null;

  const name = artistName.trim();

  // 直接匹配
  if (artistDatabase[name]) {
    return artistDatabase[name];
  }

  // 别名匹配
  for (const key in artistDatabase) {
    const artist = artistDatabase[key];
    if (artist.alias && artist.alias.some(a =>
      a.toLowerCase() === name.toLowerCase() ||
      name.toLowerCase().includes(a.toLowerCase()) ||
      a.toLowerCase().includes(name.toLowerCase())
    )) {
      return artist;
    }
  }

  // 部分匹配
  for (const key in artistDatabase) {
    if (key.includes(name) || name.includes(key)) {
      return artistDatabase[key];
    }
  }

  return null;
}

// 获取歌手信息API
app.get('/api/artist/info', (req, res) => {
  const { name } = req.query;
  if (!name) {
    return res.json({ success: false, error: '缺少歌手名称' });
  }

  const artist = findArtistInfo(name);
  if (artist) {
    res.json({ success: true, artist });
  } else {
    res.json({ success: false, error: '未找到歌手信息' });
  }
});

// 解析文件名API
app.get('/api/parse/filename', (req, res) => {
  const { name } = req.query;
  if (!name) {
    return res.json({ success: false, error: '缺少文件名' });
  }

  const parsed = parseFileName(name);
  const artistInfo = parsed.artist ? findArtistInfo(parsed.artist) : null;

  res.json({
    success: true,
    songName: parsed.songName,
    artist: parsed.artist,
    artistInfo: artistInfo
  });
});

// ==================== 批量识别修正API ====================

// 扫描进度状态
let scanProgress = {
  isScanning: false,
  total: 0,
  current: 0,
  currentFile: '',
  results: [],
  startTime: null,
  errors: []
};

// 获取扫描状态
app.get('/api/scan/status', (req, res) => {
  res.json({
    success: true,
    ...scanProgress,
    elapsed: scanProgress.startTime ? Date.now() - scanProgress.startTime : 0
  });
});

// 获取已缓存的元数据
app.get('/api/metadata/list', (req, res) => {
  res.json({
    success: true,
    metadata: songMetadataCache,
    count: Object.keys(songMetadataCache).length
  });
});

// 获取单个歌曲的缓存元数据
app.get('/api/metadata/:id', (req, res) => {
  const id = decodeURIComponent(req.params.id);
  const metadata = songMetadataCache[id];
  if (metadata) {
    res.json({ success: true, metadata });
  } else {
    res.json({ success: false, error: '未找到元数据' });
  }
});

// 手动更新单个歌曲的元数据
app.post('/api/metadata/update', (req, res) => {
  const { id, songName, artist, cover, hasLyrics } = req.body;
  if (!id) {
    return res.json({ success: false, error: '缺少歌曲ID' });
  }

  songMetadataCache[id] = {
    ...songMetadataCache[id],
    songName: songName || songMetadataCache[id]?.songName,
    artist: artist || songMetadataCache[id]?.artist,
    cover: cover || songMetadataCache[id]?.cover,
    hasLyrics: hasLyrics !== undefined ? hasLyrics : songMetadataCache[id]?.hasLyrics,
    updatedAt: Date.now(),
    manual: true
  };

  saveMetadataCache(songMetadataCache);
  res.json({ success: true, metadata: songMetadataCache[id] });
});

// 识别单个歌曲
async function identifySong(filename, filePath, fileType) {
  const parsed = parseFileName(filename);
  const artistFromFile = parsed.artist;
  const songNameFromFile = parsed.songName;

  // 计算完整文件路径
  const fullPath = fileType === 'library'
    ? path.join(libraryDir, filePath)
    : path.join(uploadDir, filePath);

  let result = {
    id: fileType === 'library' ? `library:${filePath}` : filePath,
    originalName: filename,
    songName: songNameFromFile,
    artist: artistFromFile,
    artistInfo: artistFromFile ? findArtistInfo(artistFromFile) : null,
    cover: null,
    lyrics: null,  // 保存歌词内容
    hasLyrics: false,
    hasEmbeddedCover: false,
    filePath: fullPath,  // 保存完整文件路径用于写入
    fileType: fileType,
    identifiedAt: Date.now()
  };

  // 检查内嵌封面
  if (musicMetadata) {
    try {
      if (fs.existsSync(fullPath)) {
        const metadata = await musicMetadata.parseFile(fullPath);
        if (metadata.common.picture?.[0]) {
          result.hasEmbeddedCover = true;
        }
        // 从ID3标签获取更准确的信息
        if (metadata.common.title) {
          result.songName = metadata.common.title;
        }
        if (metadata.common.artist) {
          result.artist = metadata.common.artist;
          result.artistInfo = findArtistInfo(metadata.common.artist);
        }
        if (metadata.common.album) {
          result.album = metadata.common.album;
        }
      }
    } catch (e) {
      console.log(`读取元数据失败: ${filename}`, e.message);
    }
  }

  // 从网络获取信息
  const searchQuery = result.artist
    ? `${result.artist} ${result.songName}`
    : result.songName;

  try {
    const songs = await searchNetease(searchQuery);
    if (songs.length > 0) {
      const song = songs[0];
      const detail = await getNeteaseSongDetail(song.id);

      if (detail) {
        if (detail.cover && !result.hasEmbeddedCover) {
          result.cover = detail.cover;
        }
        if (detail.artist && !result.artist) {
          result.artist = detail.artist;
          result.artistInfo = findArtistInfo(detail.artist);
        }
      }

      // 获取歌词内容
      const lyrics = await getNeteaseLyrics(song.id);
      if (lyrics) {
        result.hasLyrics = true;
        result.lyrics = lyrics;  // 保存歌词内容
      }
      result.neteaseId = song.id;
    }
  } catch (e) {
    console.log(`网络识别失败: ${filename}`, e.message);
  }

  return result;
}

// 开始批量扫描识别
app.post('/api/scan/start', async (req, res) => {
  if (scanProgress.isScanning) {
    return res.json({ success: false, error: '扫描正在进行中' });
  }

  // 收集所有歌曲文件
  const allFiles = [];

  // 扫描音乐库
  if (fs.existsSync(libraryDir)) {
    const libraryFiles = scanMusicLibrary(libraryDir);
    libraryFiles.forEach(f => {
      allFiles.push({
        filename: f.name,
        path: f.id.replace('library:', ''),
        type: 'library'
      });
    });
  }

  // 扫描上传目录
  if (fs.existsSync(uploadDir)) {
    const uploadFiles = fs.readdirSync(uploadDir);
    uploadFiles.forEach(filename => {
      const ext = path.extname(filename).toLowerCase();
      if (audioExtensions.includes(ext)) {
        allFiles.push({
          filename: filename,
          path: filename,
          type: 'upload'
        });
      }
    });
  }

  if (allFiles.length === 0) {
    return res.json({ success: false, error: '没有找到音乐文件' });
  }

  // 初始化扫描状态
  scanProgress = {
    isScanning: true,
    total: allFiles.length,
    current: 0,
    currentFile: '',
    results: [],
    startTime: Date.now(),
    errors: []
  };

  res.json({ success: true, message: '扫描已开始', total: allFiles.length });

  // 后台执行扫描
  (async () => {
    for (let i = 0; i < allFiles.length; i++) {
      const file = allFiles[i];
      scanProgress.current = i + 1;
      scanProgress.currentFile = file.filename;

      try {
        const result = await identifySong(file.filename, file.path, file.type);
        scanProgress.results.push(result);

        // 保存到缓存
        songMetadataCache[result.id] = result;

        // 每10首歌保存一次缓存
        if ((i + 1) % 10 === 0) {
          saveMetadataCache(songMetadataCache);
        }

        // 添加延迟避免请求过快
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (e) {
        scanProgress.errors.push({ file: file.filename, error: e.message });
      }
    }

    // 扫描完成
    saveMetadataCache(songMetadataCache);
    scanProgress.isScanning = false;
    console.log(`扫描完成: ${scanProgress.results.length}/${allFiles.length} 首歌曲`);
  })();
});

// 停止扫描
app.post('/api/scan/stop', (req, res) => {
  if (scanProgress.isScanning) {
    scanProgress.isScanning = false;
    saveMetadataCache(songMetadataCache);
    res.json({ success: true, message: '扫描已停止' });
  } else {
    res.json({ success: false, error: '没有正在进行的扫描' });
  }
});

// 清除元数据缓存
app.post('/api/metadata/clear', (req, res) => {
  songMetadataCache = {};
  saveMetadataCache(songMetadataCache);
  res.json({ success: true, message: '元数据缓存已清除' });
});

// 写入元数据到音乐文件（封面和歌词）
app.post('/api/metadata/write', async (req, res) => {
  const { filepath, cover, lyrics, title, artist } = req.body;

  if (!filepath) {
    return res.status(400).json({ success: false, error: '缺少文件路径' });
  }

  // 确定完整文件路径
  let fullPath = filepath;
  if (!path.isAbsolute(filepath)) {
    // 检查是否是library或uploads中的文件
    const libraryPath = path.join(__dirname, '../library', filepath);
    const uploadsPath = path.join(__dirname, '../uploads', filepath);
    if (fs.existsSync(libraryPath)) {
      fullPath = libraryPath;
    } else if (fs.existsSync(uploadsPath)) {
      fullPath = uploadsPath;
    } else {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }
  }

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ success: false, error: '文件不存在' });
  }

  try {
    const { execSync } = require('child_process');
    const scriptPath = path.join(__dirname, '../scripts/write_metadata.py');

    const params = JSON.stringify({
      filepath: fullPath,
      cover: cover || null,
      lyrics: lyrics || null,
      title: title || null,
      artist: artist || null
    });

    const result = execSync(`python3 "${scriptPath}" '${params.replace(/'/g, "'\\''")}'`, {
      encoding: 'utf-8',
      timeout: 30000
    });

    const jsonResult = JSON.parse(result.trim());
    res.json(jsonResult);
  } catch (error) {
    console.error('写入元数据失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量写入元数据（使用缓存的扫描结果）
app.post('/api/metadata/write-all', async (req, res) => {
  const cache = Object.values(songMetadataCache);
  if (cache.length === 0) {
    return res.status(400).json({ success: false, error: '没有可写入的元数据，请先扫描歌曲' });
  }

  res.json({ success: true, message: '开始写入元数据', total: cache.length });

  // 后台执行写入
  const { execSync } = require('child_process');
  const scriptPath = path.join(__dirname, '../scripts/write_metadata.py');

  let successCount = 0;
  let errorCount = 0;

  for (const song of cache) {
    if (!song.filePath || (!song.cover && !song.lyrics)) continue;

    try {
      const params = JSON.stringify({
        filepath: song.filePath,
        cover: song.cover || null,
        lyrics: song.lyrics || null,
        title: song.songName || null,
        artist: song.artist || null
      });

      execSync(`python3 "${scriptPath}" '${params.replace(/'/g, "'\\''")}'`, {
        encoding: 'utf-8',
        timeout: 30000
      });
      successCount++;
      console.log(`写入成功: ${song.songName}`);
    } catch (error) {
      errorCount++;
      console.error(`写入失败 ${song.songName}:`, error.message);
    }
  }

  console.log(`批量写入完成: 成功 ${successCount}, 失败 ${errorCount}`);
});

// 清理歌曲名称的辅助函数
function cleanSongName(name) {
  return name
    .replace(/\.(mp3|flac|wav|ogg|m4a|aac|wma)$/i, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/【[^】]*】/g, '')
    .replace(/「[^」]*」/g, '')
    .replace(/^(\d+\s*[-._]\s*)/g, '')
    .replace(/\s*(feat\.|ft\.|featuring).*$/i, '')
    .replace(/\s*[-_]\s*(official|mv|music video|lyrics|lyric|audio|hd|hq|320k|flac).*$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 网易云音乐搜索 - 使用移动端API
async function searchNetease(keyword) {
  try {
    const url = `https://music.163.com/api/search/get?s=${encodeURIComponent(keyword)}&type=1&limit=10&offset=0`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Pixel 3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
        'Referer': 'https://music.163.com/',
      }
    });
    const data = await response.json();
    console.log('网易云搜索结果:', data.result?.songCount || 0, '首');
    return data.result?.songs || [];
  } catch (e) {
    console.error('网易云搜索失败:', e.message);
    return [];
  }
}

// 获取网易云歌词
async function getNeteaseLyrics(songId) {
  try {
    const url = `https://music.163.com/api/song/lyric?id=${songId}&lv=1&tv=-1`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
        'Referer': 'https://music.163.com/'
      }
    });
    const data = await response.json();
    return data.lrc?.lyric || null;
  } catch (e) {
    console.error('获取网易云歌词失败:', e.message);
    return null;
  }
}

// 获取网易云歌曲详情（封面）
async function getNeteaseSongDetail(songId) {
  try {
    const url = `https://music.163.com/api/song/detail?ids=[${songId}]`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
        'Referer': 'https://music.163.com/'
      }
    });
    const data = await response.json();
    const song = data.songs?.[0];
    if (song) {
      return {
        cover: song.album?.picUrl || song.al?.picUrl,
        artist: song.artists?.map(a => a.name).join(', ') || song.ar?.map(a => a.name).join(', ')
      };
    }
    return null;
  } catch (e) {
    console.error('获取网易云歌曲详情失败:', e.message);
    return null;
  }
}

app.get('/api/music/info', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) {
      return res.json({ success: false, error: '缺少歌曲名称' });
    }

    const cleanName = cleanSongName(name);
    console.log(`搜索音乐信息: "${name}" -> "${cleanName}"`);

    let cover = null;
    let lyrics = null;
    let artist = '未知';
    let songName = cleanName;

    // 搜索歌曲
    let songs = await searchNetease(cleanName);

    // 如果没找到，尝试简化搜索词
    if (songs.length === 0) {
      const simpleName = cleanName.split(' ')[0];
      if (simpleName.length >= 2 && simpleName !== cleanName) {
        console.log('简化搜索:', simpleName);
        songs = await searchNetease(simpleName);
      }
    }

    if (songs.length > 0) {
      const song = songs[0];
      const songId = song.id;
      songName = song.name || cleanName;
      artist = song.artists?.map(a => a.name).join(', ') || song.ar?.map(a => a.name).join(', ') || '未知';

      // 获取封面
      if (song.album?.picUrl || song.al?.picUrl) {
        cover = (song.album?.picUrl || song.al?.picUrl).replace('http://', 'https://');
      } else {
        // 尝试获取详情
        const detail = await getNeteaseSongDetail(songId);
        if (detail?.cover) {
          cover = detail.cover.replace('http://', 'https://');
        }
        if (detail?.artist) {
          artist = detail.artist;
        }
      }

      // 获取歌词
      lyrics = await getNeteaseLyrics(songId);

      console.log(`找到歌曲: ${songName} - ${artist}, 封面: ${cover ? '有' : '无'}, 歌词: ${lyrics ? '有' : '无'}`);
    }

    if (!cover && !lyrics) {
      return res.json({ success: false, error: '未找到歌曲信息' });
    }

    res.json({
      success: true,
      songName,
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

// ===== 歌单持久化存储（基于IP地址） =====
const playlistDir = path.join(__dirname, '../playlists');
if (!fs.existsSync(playlistDir)) {
  fs.mkdirSync(playlistDir, { recursive: true });
}

// 获取客户端IP
function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
  // 清理IP地址中的特殊字符，用于文件名
  return ip.replace(/[.:]/g, '_');
}

// 保存歌单
app.post('/api/playlist/save', (req, res) => {
  try {
    const clientIP = getClientIP(req);
    const { playlist } = req.body;

    if (!playlist || !Array.isArray(playlist)) {
      return res.json({ success: false, error: '无效的歌单数据' });
    }

    const filePath = path.join(playlistDir, `${clientIP}.json`);
    fs.writeFileSync(filePath, JSON.stringify(playlist, null, 2), 'utf8');

    res.json({ success: true, message: '歌单已保存' });
  } catch (error) {
    console.error('保存歌单失败:', error);
    res.json({ success: false, error: error.message });
  }
});

// 加载歌单
app.get('/api/playlist/load', (req, res) => {
  try {
    const clientIP = getClientIP(req);
    const filePath = path.join(playlistDir, `${clientIP}.json`);

    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const playlist = JSON.parse(data);
      res.json({ success: true, playlist });
    } else {
      res.json({ success: true, playlist: [] });
    }
  } catch (error) {
    console.error('加载歌单失败:', error);
    res.json({ success: false, error: error.message, playlist: [] });
  }
});

// ==================== 服务器音乐库 ====================
// 服务器本地音乐目录（可以通过环境变量配置）
const libraryDir = process.env.MUSIC_LIBRARY || path.join(__dirname, '../library');

// 确保音乐库目录存在
if (!fs.existsSync(libraryDir)) {
  fs.mkdirSync(libraryDir, { recursive: true });
  console.log(`音乐库目录已创建: ${libraryDir}`);
}

// 递归扫描目录获取所有音乐文件
function scanMusicLibrary(dir, baseDir = dir) {
  const results = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  try {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      try {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          // 递归扫描子目录
          results.push(...scanMusicLibrary(fullPath, baseDir));
        } else {
          // 检查是否是音乐文件
          const ext = path.extname(item).toLowerCase();
          if (audioExtensions.includes(ext)) {
            const relativePath = path.relative(baseDir, fullPath);
            // 对路径的每个部分分别编码，保留目录分隔符
            const encodedPath = relativePath.split(path.sep).map(p => encodeURIComponent(p)).join('/');
            results.push({
              id: `library:${relativePath}`,
              name: item,
              path: `/api/library/stream/${encodedPath}`,
              size: stat.size,
              type: 'library',
              folder: path.dirname(relativePath) === '.' ? '' : path.dirname(relativePath),
              mtime: stat.mtime.getTime()
            });
          }
        }
      } catch (fileError) {
        console.error(`扫描文件失败: ${item}`, fileError.message);
      }
    }
  } catch (dirError) {
    console.error(`扫描目录失败: ${dir}`, dirError.message);
  }

  return results;
}

// 获取音乐库列表
app.get('/api/library/list', (req, res) => {
  try {
    const files = scanMusicLibrary(libraryDir);
    // 按修改时间排序，最新的在前
    files.sort((a, b) => b.mtime - a.mtime);
    res.json({
      success: true,
      files,
      libraryPath: libraryDir,
      count: files.length
    });
  } catch (error) {
    console.error('扫描音乐库失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 流式播放音乐库文件
app.get('/api/library/stream/:filepath(*)', (req, res) => {
  try {
    // 解码路径（处理中文和特殊字符）
    let filepath;
    try {
      filepath = decodeURIComponent(req.params.filepath);
    } catch (e) {
      filepath = req.params.filepath;
    }

    const fullPath = path.join(libraryDir, filepath);

    // 安全检查：确保路径在音乐库目录内
    const normalizedPath = path.normalize(fullPath);
    if (!normalizedPath.startsWith(path.normalize(libraryDir))) {
      console.error(`安全检查失败: ${filepath}`);
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(fullPath)) {
      console.error(`文件不存在: ${fullPath}`);
      return res.status(404).json({ error: 'File not found', path: filepath });
    }

    const stat = fs.statSync(fullPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = audioMimeTypes[ext] || 'audio/mpeg';

    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const stream = fs.createReadStream(fullPath, { start, end });

      stream.on('error', (err) => {
        console.error(`流读取错误: ${filepath}`, err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Stream error' });
        }
      });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType
      });
      stream.pipe(res);
    } else {
      const stream = fs.createReadStream(fullPath);

      stream.on('error', (err) => {
        console.error(`流读取错误: ${filepath}`, err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Stream error' });
        }
      });

      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes'
      });
      stream.pipe(res);
    }
  } catch (error) {
    console.error('流式播放失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取音乐库文件的内嵌封面
app.get('/api/library/cover/:filepath(*)', async (req, res) => {
  try {
    if (!musicMetadata) {
      return res.status(500).json({ success: false, error: 'music-metadata not available' });
    }

    const filepath = decodeURIComponent(req.params.filepath);
    const fullPath = path.join(libraryDir, filepath);

    // 安全检查
    const normalizedPath = path.normalize(fullPath);
    if (!normalizedPath.startsWith(path.normalize(libraryDir))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    const metadata = await musicMetadata.parseFile(fullPath);
    const picture = metadata.common.picture?.[0];

    if (picture) {
      res.setHeader('Content-Type', picture.format);
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.send(picture.data);
    } else {
      res.status(404).json({ success: false, error: 'No embedded cover' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  // 扫描并显示音乐库信息
  const libraryFiles = scanMusicLibrary(libraryDir);
  const libraryCount = libraryFiles.length;

  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║   🎵 微软音乐播放器服务已启动！                              ║
  ║                                                           ║
  ║   本地:    http://localhost:${PORT}                          ║
  ║   网络:    http://0.0.0.0:${PORT}                            ║
  ║                                                           ║
  ║   📁 音乐库目录: ${libraryDir.padEnd(39)}║
  ║   🎶 音乐库歌曲: ${String(libraryCount).padEnd(39)}║
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
