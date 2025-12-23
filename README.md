# 威软音乐 (WeiRuan Music) Beta

一款现代化的网页音乐播放器，支持多种云盘存储，具有赛博朋克风格界面。

## 功能特点

### 播放功能
- 高品质音频播放，支持多种格式 (MP3, FLAC, WAV, OGG, M4A, AAC)
- 10段均衡器，支持多种预设模式
- 实时音频可视化效果
- 歌词同步显示（自动从网易云获取）
- 专辑封面自动获取
- 播放次数统计

### 云盘支持
- **WebDAV** - 支持任意 WebDAV 服务
- **Alist** - 支持 Alist 网盘聚合
- **Google Drive** - Google 云端硬盘
- **OneDrive** - 微软 OneDrive
- **Dropbox** - Dropbox 云盘
- **阿里云盘** - 支持 Token 认证
- **百度网盘** - 支持 Cookie 认证
- **夸克网盘** - 支持 Cookie 认证
- **本地扫描** - 扫描服务器本地目录

### 界面特性
- 赛博朋克风格 UI
- 深色/浅色双主题切换
- 响应式设计，完美适配手机端
- 迷你播放器模式
- 拖拽排序播放列表

---

## 系统要求

- **Node.js** 16.0 或更高版本
- **npm** 或 **yarn** 包管理器
- 现代浏览器 (Chrome, Firefox, Safari, Edge)

---

## 安装步骤

### 1. 安装 Node.js

**Ubuntu/Debian：**
```bash
# 使用 NodeSource 安装 Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node -v
npm -v
```

**CentOS/RHEL：**
```bash
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs
```

**macOS：**
```bash
# 使用 Homebrew
brew install node

# 或使用 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

**Windows：**
- 访问 [Node.js 官网](https://nodejs.org/) 下载 LTS 版本
- 运行安装程序，按提示完成安装

### 2. 克隆项目

```bash
git clone https://github.com/weiruankeji2025/weiruan-music.git
cd weiruan-music
```

### 3. 安装依赖

```bash
npm install
```

这将安装以下依赖：
- `express` - Web 服务器框架
- `cors` - 跨域资源共享
- `multer` - 文件上传处理
- `webdav` - WebDAV 客户端
- `googleapis` - Google API 客户端
- `music-metadata` - 音频元数据解析

### 4. 启动服务

**开发模式：**
```bash
npm run dev
```

**生产模式：**
```bash
npm start
```

服务默认运行在 `http://localhost:3000`

### 5. 访问应用

打开浏览器访问：
- 本地访问：`http://localhost:3000`
- 局域网访问：`http://你的IP地址:3000`

---

## 生产环境部署

### 使用 PM2 进程管理（推荐）

**1. 安装 PM2：**
```bash
sudo npm install -g pm2
```

**2. 启动应用：**
```bash
cd /path/to/weiruan-music
pm2 start server/index.js --name weiruan-music
```

**3. 设置开机自启：**
```bash
pm2 startup
pm2 save
```

**4. 常用 PM2 命令：**
```bash
pm2 status                 # 查看运行状态
pm2 logs weiruan-music     # 查看日志
pm2 logs weiruan-music --lines 100  # 查看最近100行日志
pm2 restart weiruan-music  # 重启应用
pm2 stop weiruan-music     # 停止应用
pm2 delete weiruan-music   # 删除应用
pm2 monit                  # 监控面板
```

### 使用 Nginx 反向代理

**1. 安装 Nginx：**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx

# CentOS/RHEL
sudo yum install epel-release
sudo yum install nginx
```

**2. 创建 Nginx 配置文件：**
```bash
sudo nano /etc/nginx/sites-available/weiruan-music
```

写入以下配置：
```nginx
server {
    listen 80;
    server_name your-domain.com;  # 替换为你的域名或IP

    # 大文件上传支持
    client_max_body_size 500M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # 超时设置（音频流传输需要）
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

**3. 启用配置：**
```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/weiruan-music /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### 配置 HTTPS（可选但推荐）

使用 Let's Encrypt 免费 SSL 证书：

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx

# 获取并安装证书
sudo certbot --nginx -d your-domain.com

# 自动续期（certbot 会自动配置）
sudo certbot renew --dry-run
```

### 配置防火墙

```bash
# Ubuntu/Debian (ufw)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp  # 如果直接访问Node服务

# CentOS/RHEL (firewalld)
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

---

## 更新升级

```bash
cd /path/to/weiruan-music

# 拉取最新代码
git pull origin main

# 如果有新依赖，重新安装
npm install

# 重启服务
pm2 restart weiruan-music
```

---

## 云盘配置指南

### WebDAV 配置

1. 点击侧边栏 "云端" 按钮
2. 选择 "WebDAV" 标签
3. 填写以下信息：
   - **服务器地址**：如 `https://dav.example.com/dav`
   - **用户名**：WebDAV 账号
   - **密码**：WebDAV 密码
4. 点击 "连接" 按钮

**常见 WebDAV 服务地址格式：**
- Nextcloud: `https://your-cloud.com/remote.php/dav/files/username/`
- ownCloud: `https://your-cloud.com/remote.php/webdav/`
- 坚果云: `https://dav.jianguoyun.com/dav/`

### Alist 配置

1. 选择 "Alist" 标签
2. 填写以下信息：
   - **服务器地址**：如 `https://alist.example.com`
   - **用户名**：Alist 账号（可选，访客模式可不填）
   - **密码**：Alist 密码（可选）
3. 点击 "连接" 按钮

### 阿里云盘配置

1. 选择 "阿里云盘" 标签
2. 获取 Refresh Token：
   - 访问 [阿里云盘网页版](https://www.aliyundrive.com)
   - 登录后按 F12 打开开发者工具
   - 切换到 Application → Local Storage → `https://www.aliyundrive.com`
   - 找到 `token` 项，展开后复制 `refresh_token` 值
3. 粘贴 Token 并点击连接

### 百度网盘配置

1. 选择 "百度网盘" 标签
2. 获取 Cookie：
   - 访问 [百度网盘网页版](https://pan.baidu.com)
   - 登录后按 F12 打开开发者工具
   - 切换到 Network (网络) 标签
   - 刷新页面，点击任意一个请求
   - 在 Headers 中找到 Cookie，复制完整值
3. 粘贴 Cookie 并点击连接

### 夸克网盘配置

1. 选择 "夸克网盘" 标签
2. 获取 Cookie：
   - 访问 [夸克网盘网页版](https://pan.quark.cn)
   - 登录后按 F12 打开开发者工具
   - 切换到 Network (网络) 标签
   - 刷新页面，点击任意一个请求
   - 在 Headers 中找到 Cookie，复制完整值
3. 粘贴 Cookie 并点击连接

### 本地扫描配置

1. 选择 "本地扫描" 标签
2. 输入服务器上的音乐目录路径：
   - Linux: `/home/user/music` 或 `/mnt/music`
   - Windows: `C:\Users\User\Music`
3. 选择要扫描的音频格式
4. 点击 "扫描目录" 按钮

---

## 使用指南

### 基本操作

| 操作 | 方法 |
|------|------|
| 播放/暂停 | 点击播放按钮或按空格键 |
| 上一曲 | 点击上一曲按钮或按 ← |
| 下一曲 | 点击下一曲按钮或按 → |
| 调整进度 | 点击或拖动进度条 |
| 调整音量 | 拖动音量滑块或按 ↑/↓ |
| 静音 | 点击音量图标或按 M |

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Space` | 播放/暂停 |
| `←` | 快退 5 秒 |
| `→` | 快进 5 秒 |
| `↑` | 增加音量 |
| `↓` | 减少音量 |
| `M` | 静音/取消静音 |
| `S` | 切换随机播放 |
| `R` | 切换循环模式 |

### 均衡器

1. 点击右下角均衡器图标
2. 选择预设模式：平坦、摇滚、流行、爵士、古典、电子、低音增强、人声
3. 或手动拖动各频段滑块
4. 调节完成后点击关闭

### 歌词显示

1. 点击播放器右侧歌词图标打开歌词面板
2. 歌词会自动从网易云音乐获取
3. 播放时歌词会自动同步滚动高亮

### 主题切换

点击右上角主题切换按钮，在深色和浅色主题间切换。

---

## 支持的音频格式

- MP3 (.mp3)
- FLAC (.flac)
- WAV (.wav)
- OGG (.ogg)
- M4A (.m4a)
- AAC (.aac)
- WMA (.wma)

---

## 项目结构

```
weiruan-music/
├── server/
│   └── index.js           # Express 服务器（API、代理）
├── public/
│   ├── index.html         # 主页面
│   ├── css/
│   │   └── style.css      # 样式文件
│   ├── js/
│   │   └── app.js         # 播放器逻辑
│   └── img/
│       └── default-cover.svg  # 默认封面
├── uploads/               # 本地上传文件目录
├── package.json
├── LICENSE
└── README.md
```

---

## 常见问题

### Q: 封面和歌词无法获取？

A: 封面和歌词通过网易云音乐 API 获取，可能的原因：
- 歌曲名称格式特殊（包含特殊字符），搜索不到匹配结果
- 服务器网络无法访问网易云 API
- 网易云 API 访问限制

### Q: 云盘连接失败？

A: 请检查：
- 服务器地址是否正确（需包含 http:// 或 https://）
- 账号密码或 Token/Cookie 是否正确
- 服务器网络是否能访问目标云盘
- Cookie 可能已过期，需重新获取

### Q: 音频无法播放？

A: 可能原因：
- 音频格式不被浏览器支持
- 云盘授权过期
- 文件损坏或路径错误

### Q: 如何修改端口？

A: 编辑 `server/index.js`，找到以下代码修改端口：
```javascript
const PORT = process.env.PORT || 3000;
```

或使用环境变量：
```bash
PORT=8080 npm start
```

### Q: PM2 启动后无法访问？

A: 检查：
```bash
# 查看进程状态
pm2 status

# 查看错误日志
pm2 logs weiruan-music --err

# 检查端口占用
netstat -tlnp | grep 3000
```

---

## 技术栈

- **前端**：原生 JavaScript + CSS3 + HTML5
- **后端**：Node.js + Express
- **音频处理**：Web Audio API
- **云存储**：WebDAV / 各云盘 API

---

## 开源协议

MIT License

---

## 反馈与支持

如有问题或建议，欢迎提交 Issue。

---

**威软音乐 - 让音乐触手可及**
