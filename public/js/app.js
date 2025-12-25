/**
 * WeiRuan Music Player - Modern Web Music Player
 * Features: Local music, WebDAV cloud storage, Equalizer, Visualizer, Multiple play modes
 */

class MusicPlayer {
  constructor() {
    // Audio Context and Nodes
    this.audioContext = null;
    this.audioElement = new Audio();
    this.sourceNode = null;
    this.gainNode = null;
    this.analyserNode = null;
    this.eqFilters = [];

    // State
    this.playlist = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    this.isShuffle = false;
    this.repeatMode = 'none'; // none, one, all
    this.volume = 0.8;
    this.isMuted = false;

    // WebDAV
    this.webdavClientId = null;
    this.currentPath = '/';
    this.pathHistory = ['/'];

    // Google Drive
    this.gdriveClientId = null;
    this.gdriveConfigured = false;
    this.gdriveFolderId = 'root';
    this.gdriveFolderHistory = ['root'];

    // OneDrive
    this.onedriveClientId = null;
    this.onedriveConfigured = false;
    this.onedriveFolderId = 'root';
    this.onedriveFolderHistory = ['root'];

    // Dropbox
    this.dropboxClientId = null;
    this.dropboxConfigured = false;
    this.dropboxPath = '';
    this.dropboxPathHistory = [''];

    // 阿里云盘
    this.aliyunClientId = null;
    this.aliyunFolderId = 'root';
    this.aliyunFolderHistory = ['root'];

    // 百度网盘
    this.baiduClientId = null;
    this.baiduConfigured = false;
    this.baiduPath = '/';
    this.baiduPathHistory = ['/'];

    // Alist
    this.alistClientId = null;
    this.alistPath = '/';
    this.alistPathHistory = ['/'];

    // 夸克网盘
    this.quarkClientId = null;
    this.quarkPath = '/';
    this.quarkPathHistory = ['/'];

    // 播放次数统计
    this.playCounts = {};

    // 歌词
    this.currentLyrics = null;
    this.lyricsVisible = false;

    // Visualizer
    this.visualizerStyle = 'bars';
    this.visualizerCanvas = null;
    this.visualizerCtx = null;
    this.animationId = null;

    // Settings
    this.settings = {
      autoplay: true,
      notifications: true,
      shortcuts: true,
      theme: 'dark'
    };

    // EQ Presets
    this.eqPresets = {
      flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      rock: [5, 4, 3, 1, -1, -1, 0, 2, 3, 4],
      pop: [-1, 1, 3, 4, 3, 0, -1, -1, -1, -1],
      jazz: [3, 2, 1, 2, -2, -2, 0, 1, 2, 3],
      classical: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4],
      electronic: [4, 3, 1, 0, -2, 2, 1, 2, 4, 4],
      bass: [6, 5, 4, 2, 0, -1, -1, 0, 0, 0],
      vocal: [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1]
    };

    this.init();
  }

  async init() {
    this.loadSettings();
    this.setupAudioElement();
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
    this.initVisualizer();
    this.loadPlaylist();
    this.createParticles();
    this.applyTheme(this.settings.theme);

    // Load files from server
    await this.loadServerFiles();

    // Initialize Google Drive
    this.initGoogleDrive();
  }

  loadSettings() {
    const saved = localStorage.getItem('weiruan-music-settings');
    if (saved) {
      this.settings = { ...this.settings, ...JSON.parse(saved) };
    }

    const savedVolume = localStorage.getItem('weiruan-music-volume');
    if (savedVolume) {
      this.volume = parseFloat(savedVolume);
    }

    const savedPlayCounts = localStorage.getItem('weiruan-music-playcounts');
    if (savedPlayCounts) {
      this.playCounts = JSON.parse(savedPlayCounts);
    }

    // 从服务器加载歌单（基于IP地址）
    this.loadPlaylistFromServer();
  }

  saveSettings() {
    localStorage.setItem('weiruan-music-settings', JSON.stringify(this.settings));
    localStorage.setItem('weiruan-music-volume', this.volume.toString());
    localStorage.setItem('weiruan-music-playcounts', JSON.stringify(this.playCounts));
  }

  // 从服务器加载歌单
  async loadPlaylistFromServer() {
    try {
      const response = await fetch('/api/playlist/load');
      const result = await response.json();
      if (result.success && result.playlist && result.playlist.length > 0) {
        this.playlist = result.playlist;
        this.updatePlaylistUI();
        console.log(`已从服务器加载 ${result.playlist.length} 首歌曲`);
      }
    } catch (error) {
      console.error('从服务器加载歌单失败:', error);
      // 如果服务器加载失败，尝试从本地加载
      const savedPlaylist = localStorage.getItem('weiruan-music-playlist');
      if (savedPlaylist) {
        this.playlist = JSON.parse(savedPlaylist);
        this.updatePlaylistUI();
      }
    }
  }

  // 保存歌单到服务器
  async savePlaylistToServer() {
    try {
      const response = await fetch('/api/playlist/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlist: this.playlist })
      });
      const result = await response.json();
      if (result.success) {
        console.log('歌单已保存到服务器');
      }
    } catch (error) {
      console.error('保存歌单到服务器失败:', error);
    }
    // 同时保存到本地作为备份
    localStorage.setItem('weiruan-music-playlist', JSON.stringify(this.playlist));
  }

  setupAudioElement() {
    this.audioElement.crossOrigin = 'anonymous';
    this.audioElement.preload = 'auto';
    this.audioElement.volume = this.volume;
    this.pendingPlay = false;

    // iOS 后台播放支持 - 关键属性
    this.audioElement.setAttribute('playsinline', '');
    this.audioElement.setAttribute('webkit-playsinline', '');
    this.audioElement.setAttribute('x-webkit-airplay', 'allow');

    this.audioElement.addEventListener('loadedmetadata', () => this.onMetadataLoaded());
    this.audioElement.addEventListener('timeupdate', () => this.onTimeUpdate());
    this.audioElement.addEventListener('ended', () => this.onTrackEnded());
    this.audioElement.addEventListener('play', () => this.onPlay());
    this.audioElement.addEventListener('pause', () => this.onPause());
    this.audioElement.addEventListener('error', (e) => this.onError(e));

    // 优化播放延迟：数据可播放时立即开始
    this.audioElement.addEventListener('canplay', () => {
      if (this.pendingPlay) {
        this.audioElement.play().catch(() => {});
        this.pendingPlay = false;
      }
    });

    // 预加载下一首的音频元素
    this.preloadAudio = new Audio();
    this.preloadAudio.preload = 'auto';

    // 设置 Media Session API (iOS/Android 锁屏控制)
    this.setupMediaSession();

    // iOS 后台播放增强
    this.setupiOSBackgroundAudio();
  }

  // iOS 后台播放增强处理
  setupiOSBackgroundAudio() {
    // 检测是否是 iOS
    this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                 (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // 页面可见性变化处理 - 恢复播放
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // 页面重新可见时，如果之前在播放，尝试恢复
        if (this.isPlaying && this.audioElement.paused) {
          console.log('Page visible, resuming playback...');
          this.audioElement.play().catch(e => {
            console.log('Resume failed:', e);
          });
        }
        // 恢复 AudioContext
        if (this.audioContext && this.audioContext.state === 'suspended') {
          this.audioContext.resume();
        }
      } else if (document.visibilityState === 'hidden') {
        // 页面隐藏时，尝试保持播放
        if (this.isPlaying && this.isIOS) {
          this.keepAudioAlive();
        }
      }
    });

    // iOS Safari 音频中断处理（如来电）
    this.audioElement.addEventListener('pause', () => {
      // 记录是否是用户主动暂停
      this.userPaused = !this.isPlaying;

      // iOS: 如果不是用户暂停，尝试恢复播放
      if (this.isIOS && this.isPlaying && !this.userPaused) {
        setTimeout(() => {
          if (this.isPlaying && this.audioElement.paused) {
            console.log('iOS auto-pause detected, trying to resume...');
            this.audioElement.play().catch(() => {});
          }
        }, 100);
      }
    });

    // 监听 iOS 音频会话中断
    if (this.isIOS) {
      // 当音频被系统中断后恢复时
      this.audioElement.addEventListener('play', () => {
        // 确保 AudioContext 活跃
        if (this.audioContext && this.audioContext.state === 'suspended') {
          this.audioContext.resume();
        }
      });

      // 使用 stalled 事件检测播放卡住
      this.audioElement.addEventListener('stalled', () => {
        console.log('Audio stalled, attempting recovery...');
        if (this.isPlaying) {
          setTimeout(() => {
            if (this.audioElement.paused && this.isPlaying) {
              this.audioElement.play().catch(() => {});
            }
          }, 1000);
        }
      });

      // 使用 waiting 事件
      this.audioElement.addEventListener('waiting', () => {
        console.log('Audio waiting for data...');
      });
    }

    // 使用 Wake Lock API 防止屏幕休眠（如果可用）
    this.requestWakeLock();

    // 创建静音音频保持会话（iOS 特殊处理）
    if (this.isIOS) {
      this.setupSilentAudio();

      // 显示 iOS 提示
      const iosTips = document.getElementById('iosTipsSection');
      if (iosTips) {
        iosTips.style.display = 'block';
      }
    }

    console.log('iOS background audio setup complete, isIOS:', this.isIOS);
  }

  // 静音音频保持会话活跃（iOS）
  setupSilentAudio() {
    // 创建一个非常短的静音音频用于保持音频会话
    // 这是一个 0.1 秒的静音 MP3
    const silentMp3 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwmHAAAAAAD/+xBkAA/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQZB4P8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';

    this.silentAudio = new Audio(silentMp3);
    this.silentAudio.loop = true;
    this.silentAudio.volume = 0.001; // 几乎静音
    this.silentAudio.setAttribute('playsinline', '');
    this.silentAudio.setAttribute('webkit-playsinline', '');
  }

  // 开始播放时激活静音音频
  activateSilentAudio() {
    if (this.isIOS && this.silentAudio) {
      this.silentAudio.play().catch(() => {
        // 忽略错误
      });
    }
  }

  // 停止静音音频
  deactivateSilentAudio() {
    if (this.silentAudio) {
      this.silentAudio.pause();
    }
  }

  // 保持音频活跃（iOS 后台播放关键）
  keepAudioAlive() {
    if (!this.isIOS) return;

    console.log('Keeping audio alive for background playback...');

    // 1. 确保静音音频在播放
    this.activateSilentAudio();

    // 2. 定期检查并恢复主音频播放
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    this.keepAliveInterval = setInterval(() => {
      if (this.isPlaying && this.audioElement.paused) {
        console.log('Audio paused unexpectedly, resuming...');
        this.audioElement.play().catch(() => {});
      }

      // 保持 AudioContext 活跃
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      // 更新 Media Session 位置状态以保持活跃
      this.updatePositionState();
    }, 1000);

    // 3. 使用 Web Audio API 生成微弱信号保持活跃
    this.startSilentOscillator();
  }

  // 使用 Web Audio API 生成静音信号
  startSilentOscillator() {
    if (!this.audioContext) return;

    try {
      // 创建一个几乎听不到的振荡器
      if (this.silentOscillator) {
        this.silentOscillator.stop();
      }

      this.silentOscillator = this.audioContext.createOscillator();
      const silentGain = this.audioContext.createGain();
      silentGain.gain.value = 0.001; // 几乎静音

      this.silentOscillator.connect(silentGain);
      silentGain.connect(this.audioContext.destination);
      this.silentOscillator.frequency.value = 1; // 1Hz，人耳听不到
      this.silentOscillator.start();

      console.log('Silent oscillator started');
    } catch (e) {
      console.log('Failed to start silent oscillator:', e);
    }
  }

  // 停止静音振荡器
  stopSilentOscillator() {
    if (this.silentOscillator) {
      try {
        this.silentOscillator.stop();
        this.silentOscillator = null;
      } catch (e) {}
    }
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  // Wake Lock 请求（防止屏幕休眠）
  async requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        console.log('Wake Lock activated');

        this.wakeLock.addEventListener('release', () => {
          console.log('Wake Lock released');
        });

        // 页面重新可见时重新请求
        document.addEventListener('visibilitychange', async () => {
          if (document.visibilityState === 'visible' && this.isPlaying) {
            try {
              this.wakeLock = await navigator.wakeLock.request('screen');
            } catch (e) {
              // 忽略
            }
          }
        });
      } catch (err) {
        console.log('Wake Lock not available:', err);
      }
    }
  }

  // 释放 Wake Lock
  releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release();
      this.wakeLock = null;
    }
  }

  // Media Session API - 实现 iOS/Android 后台播放和锁屏控制
  setupMediaSession() {
    if (!('mediaSession' in navigator)) {
      console.log('Media Session API not supported');
      return;
    }

    // 设置媒体控制按钮处理
    navigator.mediaSession.setActionHandler('play', () => {
      this.audioElement.play();
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      this.audioElement.pause();
    });

    navigator.mediaSession.setActionHandler('previoustrack', () => {
      this.playPrevious();
    });

    navigator.mediaSession.setActionHandler('nexttrack', () => {
      this.playNext();
    });

    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const skipTime = details.seekOffset || 10;
      this.audioElement.currentTime = Math.max(0, this.audioElement.currentTime - skipTime);
      this.updatePositionState();
    });

    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const skipTime = details.seekOffset || 10;
      this.audioElement.currentTime = Math.min(
        this.audioElement.duration || 0,
        this.audioElement.currentTime + skipTime
      );
      this.updatePositionState();
    });

    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        this.audioElement.currentTime = details.seekTime;
        this.updatePositionState();
      }
    });

    navigator.mediaSession.setActionHandler('stop', () => {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    });

    console.log('Media Session API initialized');
  }

  // 更新锁屏界面的歌曲信息
  updateMediaSessionMetadata(track) {
    if (!('mediaSession' in navigator)) return;

    // 获取封面图片
    let artworkUrl = '/img/default-cover.svg';
    const albumArt = document.getElementById('albumArt');
    if (albumArt) {
      const img = albumArt.querySelector('img');
      if (img && img.src && !img.src.includes('default-cover')) {
        artworkUrl = img.src;
      }
    }

    // 解析歌曲名和歌手
    let title = track.name || 'Unknown';
    let artist = 'Unknown Artist';

    // 尝试从文件名解析
    const parsed = this.parseFileName(track.name);
    if (parsed.artist) {
      artist = parsed.artist;
      title = parsed.songName;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: title,
      artist: artist,
      album: 'WeiRuan Music',
      artwork: [
        { src: artworkUrl, sizes: '96x96', type: 'image/png' },
        { src: artworkUrl, sizes: '128x128', type: 'image/png' },
        { src: artworkUrl, sizes: '192x192', type: 'image/png' },
        { src: artworkUrl, sizes: '256x256', type: 'image/png' },
        { src: artworkUrl, sizes: '384x384', type: 'image/png' },
        { src: artworkUrl, sizes: '512x512', type: 'image/png' }
      ]
    });

    console.log('Media Session metadata updated:', title, '-', artist);
  }

  // 更新播放位置状态（用于锁屏进度条）
  updatePositionState() {
    if (!('mediaSession' in navigator)) return;
    if (!this.audioElement.duration || isNaN(this.audioElement.duration)) return;

    try {
      navigator.mediaSession.setPositionState({
        duration: this.audioElement.duration,
        playbackRate: this.audioElement.playbackRate,
        position: this.audioElement.currentTime
      });
    } catch (e) {
      // Ignore errors on some browsers
    }
  }

  initAudioContext() {
    if (this.audioContext) return;

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement);
    this.gainNode = this.audioContext.createGain();
    this.analyserNode = this.audioContext.createAnalyser();

    this.analyserNode.fftSize = 256;
    this.analyserNode.smoothingTimeConstant = 0.8;

    // Create EQ filters
    const frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    frequencies.forEach((freq, i) => {
      const filter = this.audioContext.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1;
      filter.gain.value = 0;
      this.eqFilters.push(filter);
    });

    // Connect nodes
    this.sourceNode.connect(this.eqFilters[0]);
    for (let i = 0; i < this.eqFilters.length - 1; i++) {
      this.eqFilters[i].connect(this.eqFilters[i + 1]);
    }
    this.eqFilters[this.eqFilters.length - 1].connect(this.gainNode);
    this.gainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.audioContext.destination);

    this.gainNode.gain.value = this.volume;
  }

  setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });

    // Player controls
    document.getElementById('playBtn').addEventListener('click', () => this.togglePlay());
    document.getElementById('prevBtn').addEventListener('click', () => this.playPrevious());
    document.getElementById('nextBtn').addEventListener('click', () => this.playNext());
    document.getElementById('shuffleBtn').addEventListener('click', () => this.toggleShuffle());
    document.getElementById('repeatBtn').addEventListener('click', () => this.toggleRepeat());

    // Mini player controls
    document.getElementById('miniPlay').addEventListener('click', () => this.togglePlay());
    document.getElementById('miniPrev').addEventListener('click', () => this.playPrevious());
    document.getElementById('miniNext').addEventListener('click', () => this.playNext());

    // Progress bar
    const progressBar = document.getElementById('progressBar');
    progressBar.addEventListener('click', (e) => this.seekTo(e));

    // Mini progress bar - 使用父容器扩大触摸区域
    const miniProgressContainer = document.querySelector('.mini-progress');
    if (miniProgressContainer) {
      miniProgressContainer.addEventListener('click', (e) => this.seekToMini(e));
      miniProgressContainer.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.seekToMini(e);
      }, { passive: false });
    }

    // Volume
    const volumeSlider = document.getElementById('volumeSlider');
    volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value / 100));
    document.getElementById('volumeBtn').addEventListener('click', () => this.toggleMute());
    this.updateVolumeUI();

    // File upload
    document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileUpload(e));
    document.getElementById('clearPlaylistBtn').addEventListener('click', () => this.clearPlaylist());

    // WebDAV form
    document.getElementById('webdavForm').addEventListener('submit', (e) => this.connectWebDAV(e));
    document.getElementById('disconnectBtn')?.addEventListener('click', () => this.disconnectWebDAV());
    document.getElementById('backBtn')?.addEventListener('click', () => this.navigateBack());

    // Settings
    document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
    document.querySelector('.close-modal').addEventListener('click', () => this.closeSettings());
    document.getElementById('settingsModal').addEventListener('click', (e) => {
      if (e.target.id === 'settingsModal') this.closeSettings();
    });

    // Theme select
    document.getElementById('themeSelect').addEventListener('change', (e) => {
      this.settings.theme = e.target.value;
      this.applyTheme(e.target.value);
      this.saveSettings();
    });

    // Visualizer select
    document.getElementById('visualizerSelect').addEventListener('change', (e) => {
      this.visualizerStyle = e.target.value;
    });

    // Settings toggles
    document.getElementById('autoplayToggle').addEventListener('change', (e) => {
      this.settings.autoplay = e.target.checked;
      this.saveSettings();
    });
    document.getElementById('notifyToggle').addEventListener('change', (e) => {
      this.settings.notifications = e.target.checked;
      this.saveSettings();
    });
    document.getElementById('shortcutsToggle').addEventListener('change', (e) => {
      this.settings.shortcuts = e.target.checked;
      this.saveSettings();
    });

    // EQ presets
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => this.applyEQPreset(btn.dataset.preset));
    });

    // EQ sliders
    document.querySelectorAll('.eq-slider').forEach((slider, i) => {
      slider.addEventListener('input', (e) => this.setEQBand(i, parseFloat(e.target.value)));
    });

    // Effect sliders
    document.getElementById('stereoWidth').addEventListener('input', (e) => {
      document.getElementById('stereoWidthValue').textContent = e.target.value + '%';
    });
    document.getElementById('bassBoost').addEventListener('input', (e) => {
      document.getElementById('bassBoostValue').textContent = e.target.value + '%';
      this.setBassBoost(e.target.value / 100);
    });
    document.getElementById('reverb').addEventListener('input', (e) => {
      document.getElementById('reverbValue').textContent = e.target.value + '%';
    });

    // Initialize settings UI
    document.getElementById('themeSelect').value = this.settings.theme;
    document.getElementById('autoplayToggle').checked = this.settings.autoplay;
    document.getElementById('notifyToggle').checked = this.settings.notifications;
    document.getElementById('shortcutsToggle').checked = this.settings.shortcuts;

    // Cloud type selector
    document.querySelectorAll('.cloud-type-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchCloudType(btn.dataset.type));
    });

    // Google Drive
    document.getElementById('gdriveConfigForm')?.addEventListener('submit', (e) => this.configureGoogleDrive(e));
    document.getElementById('gdriveSignInBtn')?.addEventListener('click', () => this.signInGoogleDrive());
    document.getElementById('gdriveReconfigure')?.addEventListener('click', () => this.showGdriveConfig());
    document.getElementById('gdriveBackBtn')?.addEventListener('click', () => this.navigateGdriveBack());
    document.getElementById('gdriveDisconnect')?.addEventListener('click', () => this.disconnectGoogleDrive());

    // WebDAV
    document.getElementById('webdavBackBtn')?.addEventListener('click', () => this.navigateWebdavBack());
    document.getElementById('webdavDisconnect')?.addEventListener('click', () => this.disconnectWebDAV());

    // OneDrive
    document.getElementById('onedriveConfigForm')?.addEventListener('submit', (e) => this.configureOneDrive(e));
    document.getElementById('onedriveSignInBtn')?.addEventListener('click', () => this.signInOneDrive());
    document.getElementById('onedriveReconfigure')?.addEventListener('click', () => this.showOnedriveConfig());
    document.getElementById('onedriveBackBtn')?.addEventListener('click', () => this.navigateOnedriveBack());
    document.getElementById('onedriveDisconnect')?.addEventListener('click', () => this.disconnectOneDrive());

    // Dropbox
    document.getElementById('dropboxConfigForm')?.addEventListener('submit', (e) => this.configureDropbox(e));
    document.getElementById('dropboxSignInBtn')?.addEventListener('click', () => this.signInDropbox());
    document.getElementById('dropboxReconfigure')?.addEventListener('click', () => this.showDropboxConfig());
    document.getElementById('dropboxBackBtn')?.addEventListener('click', () => this.navigateDropboxBack());
    document.getElementById('dropboxDisconnect')?.addEventListener('click', () => this.disconnectDropbox());

    // 阿里云盘
    document.getElementById('aliyunConfigForm')?.addEventListener('submit', (e) => this.connectAliyun(e));
    document.getElementById('aliyunBackBtn')?.addEventListener('click', () => this.navigateAliyunBack());
    document.getElementById('aliyunDisconnect')?.addEventListener('click', () => this.disconnectAliyun());

    // 百度网盘
    document.getElementById('baiduConfigForm')?.addEventListener('submit', (e) => this.configureBaidu(e));
    document.getElementById('baiduSignInBtn')?.addEventListener('click', () => this.signInBaidu());
    document.getElementById('baiduReconfigure')?.addEventListener('click', () => this.showBaiduConfig());
    document.getElementById('baiduBackBtn')?.addEventListener('click', () => this.navigateBaiduBack());
    document.getElementById('baiduDisconnect')?.addEventListener('click', () => this.disconnectBaidu());

    // Alist
    document.getElementById('alistConfigForm')?.addEventListener('submit', (e) => this.connectAlist(e));
    document.getElementById('alistBackBtn')?.addEventListener('click', () => this.navigateAlistBack());
    document.getElementById('alistDisconnect')?.addEventListener('click', () => this.disconnectAlist());

    // 夸克网盘
    document.getElementById('quarkConfigForm')?.addEventListener('submit', (e) => this.connectQuark(e));
    document.getElementById('quarkBackBtn')?.addEventListener('click', () => this.navigateQuarkBack());
    document.getElementById('quarkDisconnect')?.addEventListener('click', () => this.disconnectQuark());

    // 歌词切换
    document.getElementById('lyricsToggle')?.addEventListener('click', () => this.toggleLyrics());

    // 本地扫描
    document.getElementById('localScanForm')?.addEventListener('submit', (e) => this.scanLocalDirectory(e));
    document.getElementById('localRescan')?.addEventListener('click', () => this.rescanLocalDirectory());
    document.getElementById('localBackBtn')?.addEventListener('click', () => this.showLocalConfig());

    // 设置重定向URI
    const baseUrl = `${window.location.protocol}//${window.location.host}`;
    document.getElementById('gdriveRedirectUri').textContent = `${baseUrl}/api/gdrive/callback`;
    document.getElementById('onedriveRedirectUri').textContent = `${baseUrl}/api/onedrive/callback`;
    document.getElementById('dropboxRedirectUri').textContent = `${baseUrl}/api/dropbox/callback`;
    document.getElementById('baiduRedirectUri').textContent = `${baseUrl}/api/baidu/callback`;

    // Listen for OAuth callbacks
    window.addEventListener('message', (e) => {
      if (e.data) {
        switch (e.data.type) {
          case 'gdrive-connected':
            this.onGoogleDriveConnected(e.data.clientId, e.data.email);
            break;
          case 'onedrive-connected':
            this.onOneDriveConnected(e.data.clientId, e.data.email);
            break;
          case 'dropbox-connected':
            this.onDropboxConnected(e.data.clientId, e.data.email);
            break;
          case 'baidu-connected':
            this.onBaiduConnected(e.data.clientId, e.data.userName);
            break;
        }
      }
    });
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (!this.settings.shortcuts) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          this.togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey) {
            this.seek(-10);
          } else {
            this.playPrevious();
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) {
            this.seek(10);
          } else {
            this.playNext();
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.setVolume(Math.min(1, this.volume + 0.05));
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.setVolume(Math.max(0, this.volume - 0.05));
          break;
        case 'KeyM':
          this.toggleMute();
          break;
        case 'KeyS':
          this.toggleShuffle();
          break;
        case 'KeyR':
          this.toggleRepeat();
          break;
      }
    });
  }

  // Tab Navigation
  switchTab(tabId) {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `${tabId}-tab`);
    });
  }

  // Playback Controls
  togglePlay() {
    if (!this.audioContext) {
      this.initAudioContext();
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    if (this.isPlaying) {
      this.audioElement.pause();
    } else {
      if (this.currentIndex === -1 && this.playlist.length > 0) {
        this.playTrack(0);
      } else {
        this.audioElement.play();
      }
    }
  }

  playTrack(index) {
    if (index < 0 || index >= this.playlist.length) return;

    if (!this.audioContext) {
      this.initAudioContext();
    }

    this.currentIndex = index;
    const track = this.playlist[index];

    // 更新播放次数
    this.playCounts[track.id] = (this.playCounts[track.id] || 0) + 1;
    this.saveSettings();

    // 优化播放：先设置src，等canplay事件再播放
    this.pendingPlay = true;
    this.audioElement.src = track.path;

    // 尝试立即播放，如果失败会在canplay事件中重试
    this.audioElement.play().catch(() => {
      // 播放失败，等待canplay事件
    });

    this.updateTrackInfo(track);
    this.updatePlaylistUI();

    // 更新锁屏媒体信息 (iOS/Android 后台播放)
    this.updateMediaSessionMetadata(track);

    // 获取封面和歌词
    this.fetchCoverAndLyrics(track);

    // 预加载下一首歌曲
    this.preloadNextTrack();

    if (this.settings.notifications) {
      this.showNotification(`正在播放：${track.name}`, 'info');
    }
  }

  // 预加载下一首歌曲
  preloadNextTrack() {
    if (this.playlist.length <= 1) return;

    let nextIndex;
    if (this.isShuffle) {
      // 随机模式下不预加载
      return;
    } else {
      nextIndex = (this.currentIndex + 1) % this.playlist.length;
    }

    const nextTrack = this.playlist[nextIndex];
    if (nextTrack && this.preloadAudio) {
      this.preloadAudio.src = nextTrack.path;
    }
  }

  playNext() {
    if (this.playlist.length === 0) return;

    let nextIndex;
    if (this.isShuffle) {
      nextIndex = Math.floor(Math.random() * this.playlist.length);
    } else {
      nextIndex = (this.currentIndex + 1) % this.playlist.length;
    }
    this.playTrack(nextIndex);
  }

  playPrevious() {
    if (this.playlist.length === 0) return;

    // If more than 3 seconds in, restart track
    if (this.audioElement.currentTime > 3) {
      this.audioElement.currentTime = 0;
      return;
    }

    let prevIndex;
    if (this.isShuffle) {
      prevIndex = Math.floor(Math.random() * this.playlist.length);
    } else {
      prevIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
    }
    this.playTrack(prevIndex);
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    document.getElementById('shuffleBtn').classList.toggle('active', this.isShuffle);
    this.updatePlayModeIndicator();
    this.showNotification(`随机播放：${this.isShuffle ? '开启' : '关闭'}`, 'info');
  }

  toggleRepeat() {
    const modes = ['none', 'all', 'one'];
    const currentModeIndex = modes.indexOf(this.repeatMode);
    this.repeatMode = modes[(currentModeIndex + 1) % modes.length];

    const btn = document.getElementById('repeatBtn');
    const repeatLabel = document.getElementById('repeatLabel');
    btn.classList.toggle('active', this.repeatMode !== 'none');

    // 更新按钮图标和标签
    const repeatAll = btn.querySelector('.repeat-all');
    const repeatOne = btn.querySelector('.repeat-one');

    if (this.repeatMode === 'one') {
      if (repeatAll) repeatAll.style.display = 'none';
      if (repeatOne) repeatOne.style.display = 'block';
      if (repeatLabel) repeatLabel.textContent = '单曲';
    } else if (this.repeatMode === 'all') {
      if (repeatAll) repeatAll.style.display = 'block';
      if (repeatOne) repeatOne.style.display = 'none';
      if (repeatLabel) repeatLabel.textContent = '循环';
    } else {
      if (repeatAll) repeatAll.style.display = 'block';
      if (repeatOne) repeatOne.style.display = 'none';
      if (repeatLabel) repeatLabel.textContent = '顺序';
    }

    this.updatePlayModeIndicator();

    const modeNames = { none: '顺序播放', all: '列表循环', one: '单曲循环' };
    this.showNotification(`播放模式：${modeNames[this.repeatMode]}`, 'info');
  }

  // 更新播放模式指示器
  updatePlayModeIndicator() {
    const indicator = document.getElementById('playModeText');
    if (!indicator) return;

    let modeText = '';
    if (this.isShuffle) {
      modeText = '随机播放';
    } else if (this.repeatMode === 'one') {
      modeText = '单曲循环';
    } else if (this.repeatMode === 'all') {
      modeText = '列表循环';
    } else {
      modeText = '顺序播放';
    }
    indicator.textContent = modeText;
  }

  seek(seconds) {
    this.audioElement.currentTime = Math.max(0, Math.min(
      this.audioElement.duration,
      this.audioElement.currentTime + seconds
    ));
  }

  seekTo(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    this.audioElement.currentTime = percent * this.audioElement.duration;
  }

  seekToMini(e) {
    if (!this.audioElement.duration || isNaN(this.audioElement.duration)) return;

    // 获取进度条内部元素的位置
    const progressBar = document.getElementById('miniProgressBar');
    const rect = progressBar ? progressBar.getBoundingClientRect() : e.currentTarget.getBoundingClientRect();

    // 支持触摸事件
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

    this.audioElement.currentTime = percent * this.audioElement.duration;
  }

  // Volume Control
  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    this.audioElement.volume = this.isMuted ? 0 : this.volume;
    if (this.gainNode) {
      this.gainNode.gain.value = this.isMuted ? 0 : this.volume;
    }
    this.updateVolumeUI();
    this.saveSettings();
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.audioElement.volume = this.isMuted ? 0 : this.volume;
    if (this.gainNode) {
      this.gainNode.gain.value = this.isMuted ? 0 : this.volume;
    }
    this.updateVolumeUI();
  }

  updateVolumeUI() {
    const slider = document.getElementById('volumeSlider');
    const fill = document.getElementById('volumeFill');
    const value = document.getElementById('volumeValue');
    const btn = document.getElementById('volumeBtn');

    const displayVolume = this.isMuted ? 0 : Math.round(this.volume * 100);
    slider.value = displayVolume;
    fill.style.width = `${displayVolume}%`;
    value.textContent = `${displayVolume}%`;

    const highIcon = btn.querySelector('.volume-high');
    const muteIcon = btn.querySelector('.volume-mute');

    if (this.isMuted || this.volume === 0) {
      highIcon.style.display = 'none';
      muteIcon.style.display = 'block';
    } else {
      highIcon.style.display = 'block';
      muteIcon.style.display = 'none';
    }
  }

  // Audio Event Handlers
  onMetadataLoaded() {
    const duration = document.getElementById('duration');
    duration.textContent = this.formatTime(this.audioElement.duration);
  }

  onTimeUpdate() {
    const current = this.audioElement.currentTime;
    const duration = this.audioElement.duration;

    // 确保有有效的时长
    if (!duration || isNaN(duration)) return;

    const percent = (current / duration) * 100;

    document.getElementById('currentTime').textContent = this.formatTime(current);
    document.getElementById('progressFill').style.width = `${percent}%`;
    document.getElementById('progressHandle').style.left = `${percent}%`;
    document.getElementById('miniProgressFill').style.width = `${percent}%`;

    // 更新锁屏播放位置 (每5秒更新一次以节省性能)
    if (Math.floor(current) % 5 === 0) {
      this.updatePositionState();
    }

    // 更新歌词显示
    if (this.lyricsVisible && this.currentLyrics) {
      this.updateLyricsDisplay();
    }
  }

  onTrackEnded() {
    if (this.repeatMode === 'one') {
      this.audioElement.currentTime = 0;
      this.audioElement.play();
    } else if (this.repeatMode === 'all' || this.currentIndex < this.playlist.length - 1) {
      this.playNext();
    } else if (this.settings.autoplay && this.isShuffle) {
      this.playNext();
    }
  }

  onPlay() {
    this.isPlaying = true;
    this.updatePlayButtons(true);
    document.getElementById('albumArt').classList.add('playing');
    this.startVisualizer();

    // 更新媒体会话播放状态 (iOS/Android 锁屏)
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
    this.updatePositionState();

    // iOS 后台播放: 激活所有保活机制
    if (this.isIOS) {
      this.activateSilentAudio();
      this.keepAudioAlive();
    }

    // 请求 Wake Lock
    if (this.isIOS || 'wakeLock' in navigator) {
      this.requestWakeLock();
    }
  }

  onPause() {
    this.isPlaying = false;
    this.updatePlayButtons(false);
    document.getElementById('albumArt').classList.remove('playing');

    // 更新媒体会话播放状态 (iOS/Android 锁屏)
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
    this.stopVisualizer();

    // iOS 后台播放: 停用静音音频和振荡器
    this.deactivateSilentAudio();
    this.stopSilentOscillator();
  }

  onError(e) {
    const track = this.playlist[this.currentIndex];
    const errorCode = this.audioElement.error?.code || 'unknown';
    const errorMessages = {
      1: '用户中止',
      2: '网络错误',
      3: '解码错误',
      4: '不支持的格式'
    };
    const errorMsg = errorMessages[errorCode] || '未知错误';

    console.error(`播放错误 [${errorCode}]: ${errorMsg}`, track?.name);

    // 显示错误通知
    this.showNotification(`播放出错: ${errorMsg} - ${track?.name || '未知'}`, 'error');

    // 3秒后自动跳到下一首
    if (this.playlist.length > 1) {
      setTimeout(() => {
        console.log('自动跳到下一首...');
        this.playNext();
      }, 2000);
    }
  }

  updatePlayButtons(playing) {
    const btns = [document.getElementById('playBtn'), document.getElementById('miniPlay')];
    btns.forEach(btn => {
      btn.querySelector('.play-icon').style.display = playing ? 'none' : 'block';
      btn.querySelector('.pause-icon').style.display = playing ? 'block' : 'none';
    });
  }

  // Track Info
  updateTrackInfo(track) {
    const name = track.name.replace(/\.[^/.]+$/, ''); // Remove extension
    document.getElementById('trackTitle').textContent = name;
    document.getElementById('trackArtist').textContent = track.artist || '未知艺术家';
    document.getElementById('miniTitle').textContent = name;
    document.getElementById('miniArtist').textContent = track.artist || '-';

    // 显示播放次数
    const playCount = this.playCounts[track.id] || 0;
    const trackPlaysEl = document.getElementById('trackPlays');
    if (trackPlaysEl) {
      trackPlaysEl.textContent = playCount > 0 ? `已播放 ${playCount} 次` : '';
    }

    // 重置封面为默认
    const albumArt = document.getElementById('albumArt');
    albumArt.innerHTML = `<img src="/img/default-cover.svg" alt="Album Art" class="default-cover">`;

    // 重置mini播放器封面
    const miniArt = document.getElementById('miniArt');
    if (miniArt) {
      miniArt.innerHTML = `<img src="/img/default-cover.svg" alt="Album Art" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`;
    }
  }

  // Playlist Management
  async handleFileUpload(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    // 显示进度条
    const progressContainer = document.getElementById('uploadProgressContainer');
    const progressText = document.getElementById('uploadProgressText');
    const progressPercent = document.getElementById('uploadProgressPercent');
    const progressFill = document.getElementById('uploadProgressFill');
    const uploadBtn = document.getElementById('uploadBtn');

    progressContainer.style.display = 'block';
    uploadBtn.classList.add('uploading');
    progressText.textContent = `正在上传 ${files.length} 个文件...`;
    progressPercent.textContent = '0%';
    progressFill.style.width = '0%';

    // 使用 XMLHttpRequest 支持进度监控
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        progressPercent.textContent = `${percent}%`;
        progressFill.style.width = `${percent}%`;

        if (percent === 100) {
          progressText.textContent = '处理中，请稍候...';
        }
      }
    });

    xhr.addEventListener('load', () => {
      uploadBtn.classList.remove('uploading');

      if (xhr.status === 200) {
        try {
          const result = JSON.parse(xhr.responseText);
          if (result.success) {
            result.files.forEach(file => {
              if (!this.playlist.find(t => t.id === file.id)) {
                this.playlist.push(file);
              }
            });
            this.updatePlaylistUI();
            this.savePlaylistToServer();
            this.showNotification(`已添加 ${result.files.length} 首曲目`, 'success');
            this.switchTab('playlist');
          }
        } catch (err) {
          this.showNotification('上传失败：解析响应出错', 'error');
        }
      } else {
        this.showNotification('上传失败', 'error');
      }

      // 隐藏进度条
      setTimeout(() => {
        progressContainer.style.display = 'none';
        progressFill.style.width = '0%';
      }, 1000);
    });

    xhr.addEventListener('error', () => {
      uploadBtn.classList.remove('uploading');
      progressContainer.style.display = 'none';
      this.showNotification('上传失败：网络错误', 'error');
    });

    xhr.open('POST', '/api/upload');
    xhr.send(formData);

    e.target.value = '';
  }

  async loadServerFiles() {
    try {
      // 首先加载服务器音乐库（所有IP都能访问）
      await this.loadMusicLibrary();

      // 然后加载用户上传的文件
      const response = await fetch('/api/files');
      const result = await response.json();
      if (result.success && result.files.length > 0) {
        result.files.forEach(file => {
          if (!this.playlist.find(t => t.id === file.id)) {
            this.playlist.push(file);
          }
        });
        this.updatePlaylistUI();
      }
    } catch (error) {
      console.error('Failed to load server files:', error);
    }
  }

  // 加载服务器音乐库（固定音乐，所有IP都能访问）
  async loadMusicLibrary() {
    try {
      const response = await fetch('/api/library/list');
      const result = await response.json();

      if (result.success && result.files.length > 0) {
        console.log(`发现 ${result.count} 首音乐库歌曲`);

        result.files.forEach(file => {
          // 检查是否已存在
          if (!this.playlist.find(t => t.id === file.id)) {
            this.playlist.push({
              id: file.id,
              name: file.name,
              path: file.path,
              type: 'library',
              folder: file.folder,
              size: file.size
            });
          }
        });

        this.updatePlaylistUI();

        if (result.count > 0) {
          this.showNotification(`已加载 ${result.count} 首音乐库歌曲`, 'info');
        }
      }
    } catch (error) {
      console.error('加载音乐库失败:', error);
    }
  }

  clearPlaylist() {
    this.playlist = [];
    this.currentIndex = -1;
    this.audioElement.pause();
    this.audioElement.src = '';
    this.updatePlaylistUI();
    this.saveSettings();
    this.savePlaylistToServer();
    document.getElementById('trackTitle').textContent = '未选择曲目';
    document.getElementById('trackArtist').textContent = '选择一首歌曲播放';
    this.showNotification('播放列表已清空', 'info');
  }

  removeTrack(index) {
    this.playlist.splice(index, 1);
    if (index === this.currentIndex) {
      this.currentIndex = -1;
      this.audioElement.pause();
      this.audioElement.src = '';
    } else if (index < this.currentIndex) {
      this.currentIndex--;
    }
    this.updatePlaylistUI();
    this.saveSettings();
    this.savePlaylistToServer();
  }

  loadPlaylist() {
    this.updatePlaylistUI();
  }

  updatePlaylistUI() {
    const container = document.getElementById('playlistContainer');
    const trackCount = document.getElementById('trackCount');
    const totalDuration = document.getElementById('totalDuration');

    trackCount.textContent = `${this.playlist.length} 首曲目`;

    if (this.playlist.length === 0) {
      container.innerHTML = `
        <div class="empty-playlist">
          <div class="empty-icon">
            <svg viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="2" opacity="0.3"/>
              <path d="M30 35 L30 65 L50 50 Z" fill="currentColor" opacity="0.3"/>
              <path d="M55 35 L55 65 L75 50 Z" fill="currentColor" opacity="0.3"/>
            </svg>
          </div>
          <p>播放列表为空</p>
          <span>上传音乐或连接云存储</span>
        </div>
      `;
      return;
    }

    container.innerHTML = this.playlist.map((track, index) => {
      const playCount = this.playCounts[track.id] || 0;
      return `
      <div class="playlist-item ${index === this.currentIndex ? 'active playing' : ''}" data-index="${index}">
        <span class="item-number">${index + 1}</span>
        <div class="item-art">
          ${track.cover ? `<img src="${track.cover}" alt="cover">` : `
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
          </svg>`}
        </div>
        <div class="item-info">
          <div class="item-title">${track.name.replace(/\.[^/.]+$/, '')}</div>
          <div class="item-artist">${track.artist || '未知'}</div>
        </div>
        ${playCount > 0 ? `<span class="item-plays"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>${playCount}</span>` : ''}
        <span class="item-duration">${track.duration || '--:--'}</span>
        <div class="item-actions">
          <button class="btn-item" onclick="player.removeTrack(${index})" title="移除">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
    `}).join('');

    // Add click handlers
    container.querySelectorAll('.playlist-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.btn-item')) {
          this.playTrack(parseInt(item.dataset.index));
        }
      });
    });
  }

  // WebDAV
  async connectWebDAV(e) {
    e.preventDefault();

    const url = document.getElementById('webdavUrl').value;
    const username = document.getElementById('webdavUser').value;
    const password = document.getElementById('webdavPass').value;

    try {
      const response = await fetch('/api/webdav/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, username, password })
      });

      const result = await response.json();
      if (result.success) {
        this.webdavClientId = result.clientId;
        document.querySelector('.connect-form').style.display = 'none';
        document.getElementById('cloudBrowser').style.display = 'block';
        this.loadWebDAVDirectory('/');
        this.showNotification('已连接到 WebDAV', 'success');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      this.showNotification(`连接失败：${error.message}`, 'error');
    }
  }

  async loadWebDAVDirectory(path) {
    try {
      const response = await fetch(`/api/webdav/list?clientId=${encodeURIComponent(this.webdavClientId)}&path=${encodeURIComponent(path)}`);
      const result = await response.json();

      if (result.success) {
        this.currentPath = path;
        document.getElementById('currentPath').textContent = path;
        this.renderFileList(result.items);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      this.showNotification(`加载目录失败：${error.message}`, 'error');
    }
  }

  renderFileList(items) {
    const container = document.getElementById('fileList');

    // Sort: folders first, then files
    items.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });

    container.innerHTML = items.map(item => `
      <div class="file-item" data-type="${item.type}" data-path="${item.path}" data-audio="${item.isAudio}">
        <div class="file-icon ${item.type === 'directory' ? 'folder' : item.isAudio ? 'audio' : ''}">
          ${item.type === 'directory' ? `
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
            </svg>
          ` : `
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
            </svg>
          `}
        </div>
        <span class="file-name">${item.name}</span>
        <span class="file-size">${item.type === 'directory' ? '' : this.formatFileSize(item.size)}</span>
      </div>
    `).join('');

    // Add click handlers
    container.querySelectorAll('.file-item').forEach(item => {
      item.addEventListener('click', () => {
        const type = item.dataset.type;
        const path = item.dataset.path;
        const isAudio = item.dataset.audio === 'true';

        if (type === 'directory') {
          this.pathHistory.push(path);
          this.loadWebDAVDirectory(path);
        } else if (isAudio) {
          this.addWebDAVTrack(path, item.querySelector('.file-name').textContent);
        }
      });
    });
  }

  navigateBack() {
    if (this.pathHistory.length > 1) {
      this.pathHistory.pop();
      const previousPath = this.pathHistory[this.pathHistory.length - 1];
      this.loadWebDAVDirectory(previousPath);
    }
  }

  addWebDAVTrack(path, name) {
    const track = {
      id: `webdav-${Date.now()}`,
      name: name,
      path: `/api/webdav/stream?clientId=${encodeURIComponent(this.webdavClientId)}&path=${encodeURIComponent(path)}`,
      type: 'webdav'
    };

    if (!this.playlist.find(t => t.path === track.path)) {
      this.playlist.push(track);
      this.updatePlaylistUI();
      this.saveSettings();
      this.showNotification(`已添加：${name}`, 'success');
    }
  }

  disconnectWebDAV() {
    if (this.webdavClientId) {
      fetch('/api/webdav/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: this.webdavClientId })
      });
    }
    this.webdavClientId = null;
    this.currentPath = '/';
    this.pathHistory = ['/'];
    document.querySelector('.connect-form').style.display = 'block';
    document.getElementById('cloudBrowser').style.display = 'none';
    this.showNotification('已断开 WebDAV 连接', 'info');
  }

  // Equalizer
  applyEQPreset(preset) {
    const values = this.eqPresets[preset];
    if (!values) return;

    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === preset);
    });

    const sliders = document.querySelectorAll('.eq-slider');
    values.forEach((value, i) => {
      sliders[i].value = value;
      this.setEQBand(i, value);
      document.querySelector(`[data-for="${sliders[i].id}"]`).textContent = `${value}dB`;
    });
  }

  setEQBand(index, value) {
    if (this.eqFilters[index]) {
      this.eqFilters[index].gain.value = value;
    }
    const slider = document.querySelectorAll('.eq-slider')[index];
    if (slider) {
      document.querySelector(`[data-for="${slider.id}"]`).textContent = `${value}dB`;
    }
  }

  setBassBoost(value) {
    // Boost low frequencies
    if (this.eqFilters.length > 0) {
      this.eqFilters[0].gain.value += value * 6;
      this.eqFilters[1].gain.value += value * 4;
    }
  }

  // Visualizer
  initVisualizer() {
    this.visualizerCanvas = document.getElementById('visualizer');
    this.visualizerCtx = this.visualizerCanvas.getContext('2d');
    this.resizeVisualizer();
    window.addEventListener('resize', () => this.resizeVisualizer());
  }

  resizeVisualizer() {
    const container = this.visualizerCanvas.parentElement;
    this.visualizerCanvas.width = container.offsetWidth;
    this.visualizerCanvas.height = container.offsetHeight;
  }

  startVisualizer() {
    if (this.animationId) return;
    this.drawVisualizer();
  }

  stopVisualizer() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  drawVisualizer() {
    if (!this.analyserNode || !this.isPlaying) {
      this.animationId = null;
      return;
    }

    const bufferLength = this.analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyserNode.getByteFrequencyData(dataArray);

    const ctx = this.visualizerCtx;
    const width = this.visualizerCanvas.width;
    const height = this.visualizerCanvas.height;

    ctx.clearRect(0, 0, width, height);

    switch (this.visualizerStyle) {
      case 'bars':
        this.drawBars(ctx, dataArray, width, height);
        break;
      case 'wave':
        this.drawWave(ctx, dataArray, width, height);
        break;
      case 'circular':
        this.drawCircular(ctx, dataArray, width, height);
        break;
      case 'particles':
        this.drawParticles(ctx, dataArray, width, height);
        break;
    }

    this.animationId = requestAnimationFrame(() => this.drawVisualizer());
  }

  drawBars(ctx, dataArray, width, height) {
    const barCount = 64;
    const barWidth = width / barCount;
    const barGap = 2;

    for (let i = 0; i < barCount; i++) {
      const dataIndex = Math.floor(i * dataArray.length / barCount);
      const barHeight = (dataArray[dataIndex] / 255) * height * 0.8;

      const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
      gradient.addColorStop(0, 'rgba(0, 245, 255, 0.8)');
      gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.8)');
      gradient.addColorStop(1, 'rgba(244, 114, 182, 0.8)');

      ctx.fillStyle = gradient;
      ctx.fillRect(
        i * barWidth + barGap / 2,
        height - barHeight,
        barWidth - barGap,
        barHeight
      );
    }
  }

  drawWave(ctx, dataArray, width, height) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 245, 255, 0.8)';
    ctx.lineWidth = 2;

    const sliceWidth = width / dataArray.length;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
      const v = dataArray[i] / 128.0;
      const y = v * height / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    ctx.lineTo(width, height / 2);
    ctx.stroke();
  }

  drawCircular(ctx, dataArray, width, height) {
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.3;

    for (let i = 0; i < dataArray.length; i++) {
      const angle = (i / dataArray.length) * Math.PI * 2 - Math.PI / 2;
      const barLength = (dataArray[i] / 255) * radius * 0.5;

      const x1 = centerX + Math.cos(angle) * radius;
      const y1 = centerY + Math.sin(angle) * radius;
      const x2 = centerX + Math.cos(angle) * (radius + barLength);
      const y2 = centerY + Math.sin(angle) * (radius + barLength);

      const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
      gradient.addColorStop(0, 'rgba(0, 245, 255, 0.8)');
      gradient.addColorStop(1, 'rgba(244, 114, 182, 0.8)');

      ctx.beginPath();
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  drawParticles(ctx, dataArray, width, height) {
    const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    const particles = Math.floor(avg / 10);

    for (let i = 0; i < particles; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const size = Math.random() * 3 + 1;
      const alpha = Math.random() * 0.5 + 0.3;

      ctx.beginPath();
      ctx.fillStyle = `rgba(0, 245, 255, ${alpha})`;
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Background Particles
  createParticles() {
    const container = document.getElementById('particles');
    const particleCount = 50;

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      particle.style.cssText = `
        position: absolute;
        width: ${Math.random() * 3 + 1}px;
        height: ${Math.random() * 3 + 1}px;
        background: rgba(0, 245, 255, ${Math.random() * 0.5 + 0.2});
        border-radius: 50%;
        left: ${Math.random() * 100}%;
        top: ${Math.random() * 100}%;
        animation: float ${Math.random() * 10 + 10}s ease-in-out infinite;
        animation-delay: ${Math.random() * -10}s;
      `;
      container.appendChild(particle);
    }

    // Add float animation
    if (!document.getElementById('particle-style')) {
      const style = document.createElement('style');
      style.id = 'particle-style';
      style.textContent = `
        @keyframes float {
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0.3; }
          25% { transform: translateY(-20px) translateX(10px); opacity: 0.6; }
          50% { transform: translateY(-10px) translateX(-10px); opacity: 0.4; }
          75% { transform: translateY(-30px) translateX(5px); opacity: 0.5; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  // Theme
  applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
  }

  // Settings Modal
  openSettings() {
    document.getElementById('settingsModal').classList.add('active');
  }

  closeSettings() {
    document.getElementById('settingsModal').classList.remove('active');
  }

  // Notifications
  showNotification(message, type = 'info') {
    if (!this.settings.notifications) return;

    const container = document.getElementById('notifications');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        ${type === 'success' ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' :
        type === 'error' ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' :
          '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'}
      </svg>
      <span>${message}</span>
    `;

    container.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // Utility Functions
  formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  formatFileSize(bytes) {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024;
      i++;
    }
    return `${bytes.toFixed(1)} ${units[i]}`;
  }

  // ==================== Google Drive Methods ====================

  async initGoogleDrive() {
    // Set redirect URI in the help section
    const redirectUri = `${window.location.origin}/api/gdrive/callback`;
    const redirectUriEl = document.getElementById('redirectUri');
    if (redirectUriEl) {
      redirectUriEl.textContent = redirectUri;
    }

    // Check if Google Drive is configured
    try {
      const response = await fetch('/api/gdrive/status');
      const result = await response.json();
      if (result.configured) {
        this.gdriveConfigured = true;
        this.showGdriveConnect();
      }
    } catch (error) {
      console.error('Failed to check Google Drive status:', error);
    }
  }

  switchCloudType(type) {
    document.querySelectorAll('.cloud-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });

    // 隐藏所有云存储区域
    const sections = ['local', 'webdav', 'gdrive', 'onedrive', 'dropbox', 'aliyun', 'baidu', 'alist', 'quark'];
    sections.forEach(section => {
      const el = document.getElementById(`${section}-section`);
      if (el) el.style.display = section === type ? 'block' : 'none';
    });
  }

  async configureGoogleDrive(e) {
    e.preventDefault();

    const clientId = document.getElementById('gdriveClientId').value;
    const clientSecret = document.getElementById('gdriveClientSecret').value;
    const redirectUri = `${window.location.origin}/api/gdrive/callback`;

    try {
      const response = await fetch('/api/gdrive/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret, redirectUri })
      });

      const result = await response.json();
      if (result.success) {
        this.gdriveConfigured = true;
        this.showGdriveConnect();
        this.showNotification('Google 云盘配置成功', 'success');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      this.showNotification(`配置失败：${error.message}`, 'error');
    }
  }

  showGdriveConfig() {
    document.getElementById('gdriveConfig').style.display = 'block';
    document.getElementById('gdriveConnect').style.display = 'none';
    document.getElementById('gdriveBrowser').style.display = 'none';
  }

  showGdriveConnect() {
    document.getElementById('gdriveConfig').style.display = 'none';
    document.getElementById('gdriveConnect').style.display = 'block';
    document.getElementById('gdriveBrowser').style.display = 'none';
  }

  async signInGoogleDrive() {
    try {
      const response = await fetch('/api/gdrive/auth-url');
      const result = await response.json();

      if (result.success) {
        // Open OAuth popup
        const width = 600;
        const height = 700;
        const left = (window.innerWidth - width) / 2;
        const top = (window.innerHeight - height) / 2;
        window.open(
          result.authUrl,
          'Google Sign In',
          `width=${width},height=${height},left=${left},top=${top}`
        );
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      this.showNotification(`登录失败：${error.message}`, 'error');
    }
  }

  onGoogleDriveConnected(clientId, email) {
    this.gdriveClientId = clientId;
    document.getElementById('gdriveEmail').textContent = email;
    document.getElementById('gdriveConfig').style.display = 'none';
    document.getElementById('gdriveConnect').style.display = 'none';
    document.getElementById('gdriveBrowser').style.display = 'block';
    this.loadGoogleDriveFolder('root');
    this.showNotification(`已登录：${email}`, 'success');
  }

  async loadGoogleDriveFolder(folderId) {
    try {
      const response = await fetch(`/api/gdrive/list?clientId=${encodeURIComponent(this.gdriveClientId)}&folderId=${encodeURIComponent(folderId)}`);
      const result = await response.json();

      if (result.success) {
        this.gdriveFolderId = folderId;
        this.renderGdriveFileList(result.items);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      this.showNotification(`加载文件夹失败：${error.message}`, 'error');
    }
  }

  renderGdriveFileList(items) {
    const container = document.getElementById('gdriveFileList');

    // Sort: folders first, then files
    items.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-folder" style="padding: 2rem; text-align: center; color: var(--text-muted);">
          <p>此文件夹为空</p>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => `
      <div class="file-item" data-type="${item.type}" data-id="${item.id}" data-audio="${item.isAudio}">
        <div class="file-icon ${item.type === 'directory' ? 'folder' : item.isAudio ? 'audio' : ''}">
          ${item.type === 'directory' ? `
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
            </svg>
          ` : `
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
            </svg>
          `}
        </div>
        <span class="file-name">${item.name}</span>
        <span class="file-size">${item.type === 'directory' ? '' : this.formatFileSize(item.size)}</span>
      </div>
    `).join('');

    // Add click handlers
    container.querySelectorAll('.file-item').forEach(item => {
      item.addEventListener('click', () => {
        const type = item.dataset.type;
        const id = item.dataset.id;
        const isAudio = item.dataset.audio === 'true';
        const name = item.querySelector('.file-name').textContent;

        if (type === 'directory') {
          this.gdriveFolderHistory.push(id);
          this.loadGoogleDriveFolder(id);
        } else if (isAudio) {
          this.addGoogleDriveTrack(id, name);
        }
      });
    });
  }

  navigateGdriveBack() {
    if (this.gdriveFolderHistory.length > 1) {
      this.gdriveFolderHistory.pop();
      const previousFolder = this.gdriveFolderHistory[this.gdriveFolderHistory.length - 1];
      this.loadGoogleDriveFolder(previousFolder);
    }
  }

  addGoogleDriveTrack(fileId, name) {
    const track = {
      id: `gdrive-${fileId}`,
      name: name,
      path: `/api/gdrive/stream?clientId=${encodeURIComponent(this.gdriveClientId)}&fileId=${encodeURIComponent(fileId)}`,
      type: 'gdrive'
    };

    if (!this.playlist.find(t => t.id === track.id)) {
      this.playlist.push(track);
      this.updatePlaylistUI();
      this.saveSettings();
      this.showNotification(`已添加：${name}`, 'success');
    }
  }

  async disconnectGoogleDrive() {
    if (this.gdriveClientId) {
      try {
        await fetch('/api/gdrive/disconnect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: this.gdriveClientId })
        });
      } catch (error) {
        console.error('Failed to disconnect:', error);
      }
    }
    this.gdriveClientId = null;
    this.gdriveFolderId = 'root';
    this.gdriveFolderHistory = ['root'];
    this.showGdriveConnect();
    this.showNotification('已断开 Google 云盘连接', 'info');
  }

  // WebDAV navigation
  navigateWebdavBack() {
    if (this.pathHistory.length > 1) {
      this.pathHistory.pop();
      const previousPath = this.pathHistory[this.pathHistory.length - 1];
      this.loadWebDAVDirectory(previousPath);
    }
  }

  // ==================== OneDrive ====================
  async configureOneDrive(e) {
    e.preventDefault();
    const clientId = document.getElementById('onedriveClientId').value;
    const clientSecret = document.getElementById('onedriveClientSecret').value;
    const redirectUri = `${window.location.protocol}//${window.location.host}/api/onedrive/callback`;

    try {
      const response = await fetch('/api/onedrive/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret, redirectUri })
      });
      const result = await response.json();
      if (result.success) {
        this.onedriveConfigured = true;
        document.getElementById('onedriveConfig').style.display = 'none';
        document.getElementById('onedriveConnect').style.display = 'block';
        this.showNotification('OneDrive 配置成功', 'success');
      }
    } catch (error) {
      this.showNotification(`配置失败：${error.message}`, 'error');
    }
  }

  showOnedriveConfig() {
    document.getElementById('onedriveConfig').style.display = 'block';
    document.getElementById('onedriveConnect').style.display = 'none';
    document.getElementById('onedriveBrowser').style.display = 'none';
  }

  async signInOneDrive() {
    try {
      const response = await fetch('/api/onedrive/auth-url');
      const result = await response.json();
      if (result.success) {
        window.open(result.authUrl, 'OneDrive Sign In', 'width=600,height=700');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      this.showNotification(`登录失败：${error.message}`, 'error');
    }
  }

  onOneDriveConnected(clientId, email) {
    this.onedriveClientId = clientId;
    document.getElementById('onedriveEmail').textContent = email;
    document.getElementById('onedriveConfig').style.display = 'none';
    document.getElementById('onedriveConnect').style.display = 'none';
    document.getElementById('onedriveBrowser').style.display = 'block';
    this.loadOneDriveFolder('root');
    this.showNotification(`已登录：${email}`, 'success');
  }

  async loadOneDriveFolder(folderId) {
    try {
      const response = await fetch(`/api/onedrive/list?clientId=${encodeURIComponent(this.onedriveClientId)}&folderId=${encodeURIComponent(folderId)}`);
      const result = await response.json();
      if (result.success) {
        this.onedriveFolderId = folderId;
        this.renderOnedriveFileList(result.items);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      this.showNotification(`加载失败：${error.message}`, 'error');
    }
  }

  renderOnedriveFileList(items) {
    const container = document.getElementById('onedriveFileList');
    items.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });
    container.innerHTML = items.map(item => `
      <div class="file-item" data-type="${item.type}" data-id="${item.id}" data-audio="${item.isAudio}">
        <div class="file-icon ${item.type === 'directory' ? 'folder' : item.isAudio ? 'audio' : ''}">
          ${item.type === 'directory' ? '📁' : item.isAudio ? '🎵' : '📄'}
        </div>
        <span class="file-name">${item.name}</span>
      </div>
    `).join('') || '<div class="empty-folder">文件夹为空</div>';

    container.querySelectorAll('.file-item').forEach(el => {
      el.addEventListener('click', () => {
        if (el.dataset.type === 'directory') {
          this.onedriveFolderHistory.push(el.dataset.id);
          this.loadOneDriveFolder(el.dataset.id);
        } else if (el.dataset.audio === 'true') {
          this.addOnedriveTrack(el.dataset.id, el.querySelector('.file-name').textContent);
        }
      });
    });
  }

  navigateOnedriveBack() {
    if (this.onedriveFolderHistory.length > 1) {
      this.onedriveFolderHistory.pop();
      this.loadOneDriveFolder(this.onedriveFolderHistory[this.onedriveFolderHistory.length - 1]);
    }
  }

  addOnedriveTrack(fileId, name) {
    const track = {
      id: `onedrive-${fileId}`,
      name,
      path: `/api/onedrive/stream?clientId=${encodeURIComponent(this.onedriveClientId)}&fileId=${encodeURIComponent(fileId)}`,
      type: 'onedrive'
    };
    if (!this.playlist.find(t => t.id === track.id)) {
      this.playlist.push(track);
      this.updatePlaylistUI();
      this.saveSettings();
      this.showNotification(`已添加：${name}`, 'success');
    }
  }

  async disconnectOneDrive() {
    if (this.onedriveClientId) {
      await fetch('/api/onedrive/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: this.onedriveClientId }) });
    }
    this.onedriveClientId = null;
    this.onedriveFolderHistory = ['root'];
    this.showOnedriveConfig();
    this.showNotification('已断开 OneDrive 连接', 'info');
  }

  // ==================== Dropbox ====================
  async configureDropbox(e) {
    e.preventDefault();
    const clientId = document.getElementById('dropboxClientId').value;
    const clientSecret = document.getElementById('dropboxClientSecret').value;
    const redirectUri = `${window.location.protocol}//${window.location.host}/api/dropbox/callback`;

    try {
      const response = await fetch('/api/dropbox/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret, redirectUri })
      });
      if ((await response.json()).success) {
        this.dropboxConfigured = true;
        document.getElementById('dropboxConfig').style.display = 'none';
        document.getElementById('dropboxConnect').style.display = 'block';
        this.showNotification('Dropbox 配置成功', 'success');
      }
    } catch (error) {
      this.showNotification(`配置失败：${error.message}`, 'error');
    }
  }

  showDropboxConfig() {
    document.getElementById('dropboxConfig').style.display = 'block';
    document.getElementById('dropboxConnect').style.display = 'none';
    document.getElementById('dropboxBrowser').style.display = 'none';
  }

  async signInDropbox() {
    try {
      const response = await fetch('/api/dropbox/auth-url');
      const result = await response.json();
      if (result.success) {
        window.open(result.authUrl, 'Dropbox Sign In', 'width=600,height=700');
      }
    } catch (error) {
      this.showNotification(`登录失败：${error.message}`, 'error');
    }
  }

  onDropboxConnected(clientId, email) {
    this.dropboxClientId = clientId;
    document.getElementById('dropboxEmail').textContent = email;
    document.getElementById('dropboxConfig').style.display = 'none';
    document.getElementById('dropboxConnect').style.display = 'none';
    document.getElementById('dropboxBrowser').style.display = 'block';
    this.loadDropboxFolder('');
    this.showNotification(`已登录：${email}`, 'success');
  }

  async loadDropboxFolder(path) {
    try {
      const response = await fetch(`/api/dropbox/list?clientId=${encodeURIComponent(this.dropboxClientId)}&path=${encodeURIComponent(path)}`);
      const result = await response.json();
      if (result.success) {
        this.dropboxPath = path;
        this.renderDropboxFileList(result.items);
      }
    } catch (error) {
      this.showNotification(`加载失败：${error.message}`, 'error');
    }
  }

  renderDropboxFileList(items) {
    const container = document.getElementById('dropboxFileList');
    items.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });
    container.innerHTML = items.map(item => `
      <div class="file-item" data-type="${item.type}" data-path="${item.path}" data-audio="${item.isAudio}">
        <div class="file-icon ${item.type === 'directory' ? 'folder' : item.isAudio ? 'audio' : ''}">
          ${item.type === 'directory' ? '📁' : item.isAudio ? '🎵' : '📄'}
        </div>
        <span class="file-name">${item.name}</span>
      </div>
    `).join('') || '<div class="empty-folder">文件夹为空</div>';

    container.querySelectorAll('.file-item').forEach(el => {
      el.addEventListener('click', () => {
        if (el.dataset.type === 'directory') {
          this.dropboxPathHistory.push(el.dataset.path);
          this.loadDropboxFolder(el.dataset.path);
        } else if (el.dataset.audio === 'true') {
          this.addDropboxTrack(el.dataset.path, el.querySelector('.file-name').textContent);
        }
      });
    });
  }

  navigateDropboxBack() {
    if (this.dropboxPathHistory.length > 1) {
      this.dropboxPathHistory.pop();
      this.loadDropboxFolder(this.dropboxPathHistory[this.dropboxPathHistory.length - 1]);
    }
  }

  addDropboxTrack(filePath, name) {
    const track = {
      id: `dropbox-${filePath}`,
      name,
      path: `/api/dropbox/stream?clientId=${encodeURIComponent(this.dropboxClientId)}&path=${encodeURIComponent(filePath)}`,
      type: 'dropbox'
    };
    if (!this.playlist.find(t => t.id === track.id)) {
      this.playlist.push(track);
      this.updatePlaylistUI();
      this.saveSettings();
      this.showNotification(`已添加：${name}`, 'success');
    }
  }

  async disconnectDropbox() {
    if (this.dropboxClientId) {
      await fetch('/api/dropbox/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: this.dropboxClientId }) });
    }
    this.dropboxClientId = null;
    this.dropboxPathHistory = [''];
    this.showDropboxConfig();
    this.showNotification('已断开 Dropbox 连接', 'info');
  }

  // ==================== 阿里云盘 ====================
  async connectAliyun(e) {
    e.preventDefault();
    const refreshToken = document.getElementById('aliyunRefreshToken').value;

    try {
      const response = await fetch('/api/aliyun/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });
      const result = await response.json();
      if (result.success) {
        this.aliyunClientId = result.clientId;
        document.getElementById('aliyunUserName').textContent = result.userName;
        document.getElementById('aliyunConfig').style.display = 'none';
        document.getElementById('aliyunBrowser').style.display = 'block';
        this.loadAliyunFolder('root');
        this.showNotification(`已登录：${result.userName}`, 'success');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      this.showNotification(`连接失败：${error.message}`, 'error');
    }
  }

  async loadAliyunFolder(folderId) {
    try {
      const response = await fetch(`/api/aliyun/list?clientId=${encodeURIComponent(this.aliyunClientId)}&folderId=${encodeURIComponent(folderId)}`);
      const result = await response.json();
      if (result.success) {
        this.aliyunFolderId = folderId;
        this.renderAliyunFileList(result.items);
      }
    } catch (error) {
      this.showNotification(`加载失败：${error.message}`, 'error');
    }
  }

  renderAliyunFileList(items) {
    const container = document.getElementById('aliyunFileList');
    items.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });
    container.innerHTML = items.map(item => `
      <div class="file-item" data-type="${item.type}" data-id="${item.id}" data-audio="${item.isAudio}">
        <div class="file-icon ${item.type === 'directory' ? 'folder' : item.isAudio ? 'audio' : ''}">
          ${item.type === 'directory' ? '📁' : item.isAudio ? '🎵' : '📄'}
        </div>
        <span class="file-name">${item.name}</span>
      </div>
    `).join('') || '<div class="empty-folder">文件夹为空</div>';

    container.querySelectorAll('.file-item').forEach(el => {
      el.addEventListener('click', () => {
        if (el.dataset.type === 'directory') {
          this.aliyunFolderHistory.push(el.dataset.id);
          this.loadAliyunFolder(el.dataset.id);
        } else if (el.dataset.audio === 'true') {
          this.addAliyunTrack(el.dataset.id, el.querySelector('.file-name').textContent);
        }
      });
    });
  }

  navigateAliyunBack() {
    if (this.aliyunFolderHistory.length > 1) {
      this.aliyunFolderHistory.pop();
      this.loadAliyunFolder(this.aliyunFolderHistory[this.aliyunFolderHistory.length - 1]);
    }
  }

  addAliyunTrack(fileId, name) {
    const track = {
      id: `aliyun-${fileId}`,
      name,
      path: `/api/aliyun/stream?clientId=${encodeURIComponent(this.aliyunClientId)}&fileId=${encodeURIComponent(fileId)}`,
      type: 'aliyun'
    };
    if (!this.playlist.find(t => t.id === track.id)) {
      this.playlist.push(track);
      this.updatePlaylistUI();
      this.saveSettings();
      this.showNotification(`已添加：${name}`, 'success');
    }
  }

  async disconnectAliyun() {
    if (this.aliyunClientId) {
      await fetch('/api/aliyun/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: this.aliyunClientId }) });
    }
    this.aliyunClientId = null;
    this.aliyunFolderHistory = ['root'];
    document.getElementById('aliyunConfig').style.display = 'block';
    document.getElementById('aliyunBrowser').style.display = 'none';
    this.showNotification('已断开阿里云盘连接', 'info');
  }

  // ==================== 百度网盘 ====================
  async configureBaidu(e) {
    e.preventDefault();
    const appKey = document.getElementById('baiduAppKey').value;
    const secretKey = document.getElementById('baiduSecretKey').value;
    const redirectUri = `${window.location.protocol}//${window.location.host}/api/baidu/callback`;

    try {
      const response = await fetch('/api/baidu/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appKey, secretKey, redirectUri })
      });
      if ((await response.json()).success) {
        this.baiduConfigured = true;
        document.getElementById('baiduConfig').style.display = 'none';
        document.getElementById('baiduConnect').style.display = 'block';
        this.showNotification('百度网盘配置成功', 'success');
      }
    } catch (error) {
      this.showNotification(`配置失败：${error.message}`, 'error');
    }
  }

  showBaiduConfig() {
    document.getElementById('baiduConfig').style.display = 'block';
    document.getElementById('baiduConnect').style.display = 'none';
    document.getElementById('baiduBrowser').style.display = 'none';
  }

  async signInBaidu() {
    try {
      const response = await fetch('/api/baidu/auth-url');
      const result = await response.json();
      if (result.success) {
        window.open(result.authUrl, '百度网盘登录', 'width=600,height=700');
      }
    } catch (error) {
      this.showNotification(`登录失败：${error.message}`, 'error');
    }
  }

  onBaiduConnected(clientId, userName) {
    this.baiduClientId = clientId;
    document.getElementById('baiduUserName').textContent = userName;
    document.getElementById('baiduConfig').style.display = 'none';
    document.getElementById('baiduConnect').style.display = 'none';
    document.getElementById('baiduBrowser').style.display = 'block';
    this.loadBaiduFolder('/');
    this.showNotification(`已登录：${userName}`, 'success');
  }

  async loadBaiduFolder(path) {
    try {
      const response = await fetch(`/api/baidu/list?clientId=${encodeURIComponent(this.baiduClientId)}&path=${encodeURIComponent(path)}`);
      const result = await response.json();
      if (result.success) {
        this.baiduPath = path;
        this.renderBaiduFileList(result.items);
      }
    } catch (error) {
      this.showNotification(`加载失败：${error.message}`, 'error');
    }
  }

  renderBaiduFileList(items) {
    const container = document.getElementById('baiduFileList');
    items.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });
    container.innerHTML = items.map(item => `
      <div class="file-item" data-type="${item.type}" data-id="${item.id}" data-path="${item.path}" data-audio="${item.isAudio}">
        <div class="file-icon ${item.type === 'directory' ? 'folder' : item.isAudio ? 'audio' : ''}">
          ${item.type === 'directory' ? '📁' : item.isAudio ? '🎵' : '📄'}
        </div>
        <span class="file-name">${item.name}</span>
      </div>
    `).join('') || '<div class="empty-folder">文件夹为空</div>';

    container.querySelectorAll('.file-item').forEach(el => {
      el.addEventListener('click', () => {
        if (el.dataset.type === 'directory') {
          this.baiduPathHistory.push(el.dataset.path);
          this.loadBaiduFolder(el.dataset.path);
        } else if (el.dataset.audio === 'true') {
          this.addBaiduTrack(el.dataset.id, el.dataset.path, el.querySelector('.file-name').textContent);
        }
      });
    });
  }

  navigateBaiduBack() {
    if (this.baiduPathHistory.length > 1) {
      this.baiduPathHistory.pop();
      this.loadBaiduFolder(this.baiduPathHistory[this.baiduPathHistory.length - 1]);
    }
  }

  addBaiduTrack(fsId, filePath, name) {
    const track = {
      id: `baidu-${fsId}`,
      name,
      path: `/api/baidu/stream?clientId=${encodeURIComponent(this.baiduClientId)}&fsId=${encodeURIComponent(fsId)}&path=${encodeURIComponent(filePath)}`,
      type: 'baidu'
    };
    if (!this.playlist.find(t => t.id === track.id)) {
      this.playlist.push(track);
      this.updatePlaylistUI();
      this.saveSettings();
      this.showNotification(`已添加：${name}`, 'success');
    }
  }

  async disconnectBaidu() {
    if (this.baiduClientId) {
      await fetch('/api/baidu/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: this.baiduClientId }) });
    }
    this.baiduClientId = null;
    this.baiduPathHistory = ['/'];
    this.showBaiduConfig();
    this.showNotification('已断开百度网盘连接', 'info');
  }

  // ==================== Alist ====================
  async connectAlist(e) {
    e.preventDefault();
    const url = document.getElementById('alistUrl').value;
    const username = document.getElementById('alistUser').value;
    const password = document.getElementById('alistPass').value;

    try {
      const response = await fetch('/api/alist/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, username, password })
      });
      const result = await response.json();
      if (result.success) {
        this.alistClientId = result.clientId;
        document.getElementById('alistConfig').style.display = 'none';
        document.getElementById('alistBrowser').style.display = 'block';
        this.loadAlistFolder('/');
        this.showNotification('已连接 Alist 服务器', 'success');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      this.showNotification(`连接失败：${error.message}`, 'error');
    }
  }

  async loadAlistFolder(path) {
    try {
      const response = await fetch(`/api/alist/list?clientId=${encodeURIComponent(this.alistClientId)}&path=${encodeURIComponent(path)}`);
      const result = await response.json();
      if (result.success) {
        this.alistPath = path;
        document.getElementById('alistPath').textContent = path || '/';
        this.renderAlistFileList(result.items);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      this.showNotification(`加载失败：${error.message}`, 'error');
    }
  }

  renderAlistFileList(items) {
    const container = document.getElementById('alistFileList');
    items.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });

    container.innerHTML = items.map(item => `
      <div class="file-item" data-type="${item.type}" data-path="${item.path}" data-audio="${item.isAudio}">
        <div class="file-icon ${item.type === 'directory' ? 'folder' : item.isAudio ? 'audio' : ''}">
          ${item.type === 'directory' ? `
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
            </svg>
          ` : `
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
            </svg>
          `}
        </div>
        <span class="file-name">${item.name}</span>
        <span class="file-size">${item.type === 'directory' ? '' : this.formatFileSize(item.size)}</span>
      </div>
    `).join('') || '<div class="empty-folder" style="padding: 2rem; text-align: center;">文件夹为空</div>';

    container.querySelectorAll('.file-item').forEach(el => {
      el.addEventListener('click', () => {
        if (el.dataset.type === 'directory') {
          this.alistPathHistory.push(el.dataset.path);
          this.loadAlistFolder(el.dataset.path);
        } else if (el.dataset.audio === 'true') {
          this.addAlistTrack(el.dataset.path, el.querySelector('.file-name').textContent);
        }
      });
    });
  }

  navigateAlistBack() {
    if (this.alistPathHistory.length > 1) {
      this.alistPathHistory.pop();
      this.loadAlistFolder(this.alistPathHistory[this.alistPathHistory.length - 1]);
    }
  }

  addAlistTrack(filePath, name) {
    const track = {
      id: `alist-${filePath}`,
      name,
      path: `/api/alist/stream?clientId=${encodeURIComponent(this.alistClientId)}&path=${encodeURIComponent(filePath)}`,
      type: 'alist'
    };
    if (!this.playlist.find(t => t.id === track.id)) {
      this.playlist.push(track);
      this.updatePlaylistUI();
      this.saveSettings();
      this.showNotification(`已添加：${name}`, 'success');
    }
  }

  async disconnectAlist() {
    if (this.alistClientId) {
      await fetch('/api/alist/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: this.alistClientId }) });
    }
    this.alistClientId = null;
    this.alistPathHistory = ['/'];
    document.getElementById('alistConfig').style.display = 'block';
    document.getElementById('alistBrowser').style.display = 'none';
    this.showNotification('已断开 Alist 连接', 'info');
  }

  // ==================== 夸克网盘 ====================
  async connectQuark(e) {
    e.preventDefault();
    const cookie = document.getElementById('quarkCookie').value;

    try {
      const response = await fetch('/api/quark/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie })
      });
      const result = await response.json();
      if (result.success) {
        this.quarkClientId = result.clientId;
        document.getElementById('quarkConfig').style.display = 'none';
        document.getElementById('quarkBrowser').style.display = 'block';
        this.loadQuarkFolder('0');
        this.showNotification('已连接夸克网盘', 'success');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      this.showNotification(`连接失败：${error.message}`, 'error');
    }
  }

  async loadQuarkFolder(folderId) {
    try {
      const response = await fetch(`/api/quark/list?clientId=${encodeURIComponent(this.quarkClientId)}&folderId=${encodeURIComponent(folderId)}`);
      const result = await response.json();
      if (result.success) {
        this.quarkPath = result.path || '/';
        document.getElementById('quarkPath').textContent = this.quarkPath;
        this.renderQuarkFileList(result.items, folderId);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      this.showNotification(`加载失败：${error.message}`, 'error');
    }
  }

  renderQuarkFileList(items, currentFolderId) {
    const container = document.getElementById('quarkFileList');
    items.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });

    container.innerHTML = items.map(item => `
      <div class="file-item" data-type="${item.type}" data-id="${item.id}" data-audio="${item.isAudio}">
        <div class="file-icon ${item.type === 'directory' ? 'folder' : item.isAudio ? 'audio' : ''}">
          ${item.type === 'directory' ? `
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
            </svg>
          ` : `
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
            </svg>
          `}
        </div>
        <span class="file-name">${item.name}</span>
        <span class="file-size">${item.type === 'directory' ? '' : this.formatFileSize(item.size)}</span>
      </div>
    `).join('') || '<div class="empty-folder" style="padding: 2rem; text-align: center;">文件夹为空</div>';

    container.querySelectorAll('.file-item').forEach(el => {
      el.addEventListener('click', () => {
        if (el.dataset.type === 'directory') {
          this.quarkPathHistory.push(el.dataset.id);
          this.loadQuarkFolder(el.dataset.id);
        } else if (el.dataset.audio === 'true') {
          this.addQuarkTrack(el.dataset.id, el.querySelector('.file-name').textContent);
        }
      });
    });
  }

  navigateQuarkBack() {
    if (this.quarkPathHistory.length > 1) {
      this.quarkPathHistory.pop();
      this.loadQuarkFolder(this.quarkPathHistory[this.quarkPathHistory.length - 1]);
    }
  }

  addQuarkTrack(fileId, name) {
    const track = {
      id: `quark-${fileId}`,
      name,
      path: `/api/quark/stream?clientId=${encodeURIComponent(this.quarkClientId)}&fileId=${encodeURIComponent(fileId)}`,
      type: 'quark'
    };
    if (!this.playlist.find(t => t.id === track.id)) {
      this.playlist.push(track);
      this.updatePlaylistUI();
      this.saveSettings();
      this.showNotification(`已添加：${name}`, 'success');
    }
  }

  async disconnectQuark() {
    if (this.quarkClientId) {
      await fetch('/api/quark/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: this.quarkClientId }) });
    }
    this.quarkClientId = null;
    this.quarkPathHistory = ['/'];
    document.getElementById('quarkConfig').style.display = 'block';
    document.getElementById('quarkBrowser').style.display = 'none';
    this.showNotification('已断开夸克网盘连接', 'info');
  }

  // ==================== 本地扫描 ====================
  async scanLocalDirectory(e) {
    e.preventDefault();
    const scanPath = document.getElementById('localScanPath').value;
    const recursive = document.getElementById('localScanRecursive').checked;

    // 显示扫描进度
    const scanResult = document.getElementById('scanResult');
    const scanStatus = document.getElementById('scanStatus');
    const scanCount = document.getElementById('scanCount');
    const scanProgressBar = document.getElementById('scanProgressBar');

    scanResult.style.display = 'block';
    scanStatus.textContent = '正在扫描...';
    scanCount.textContent = '0 首';
    scanProgressBar.classList.add('scanning');
    scanProgressBar.style.width = '0%';

    // 保存扫描路径
    this.lastScanPath = scanPath;
    this.lastScanRecursive = recursive;

    try {
      const response = await fetch('/api/local/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: scanPath, recursive })
      });

      const result = await response.json();
      scanProgressBar.classList.remove('scanning');

      if (result.success) {
        scanStatus.textContent = '扫描完成';
        scanCount.textContent = `${result.count} 首`;
        scanProgressBar.style.width = '100%';

        if (result.files.length > 0) {
          // 显示文件列表
          this.renderLocalFileList(result.files);
          document.getElementById('localConfig').style.display = 'none';
          document.getElementById('localBrowser').style.display = 'block';
          document.getElementById('localPath').textContent = scanPath;

          // 自动添加所有扫描到的歌曲到歌单并永久保存
          this.autoAddLocalTracks(result.files);

          this.showNotification(`找到 ${result.count} 首音乐文件，已自动添加到歌单`, 'success');
        } else {
          this.showNotification('未找到音乐文件', 'info');
        }
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      scanProgressBar.classList.remove('scanning');
      scanStatus.textContent = '扫描失败';
      scanProgressBar.style.width = '0%';
      this.showNotification(`扫描失败：${error.message}`, 'error');
    }
  }

  renderLocalFileList(files) {
    const container = document.getElementById('localFileList');

    container.innerHTML = files.map(file => `
      <div class="file-item" data-id="${file.id}" data-path="${file.path}" data-name="${file.name}">
        <div class="file-icon audio">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
          </svg>
        </div>
        <span class="file-name">${file.name}</span>
        <span class="file-size">${this.formatFileSize(file.size)}</span>
      </div>
    `).join('') || '<div class="empty-folder" style="padding: 2rem; text-align: center;">未找到音乐文件</div>';

    // 添加点击事件
    container.querySelectorAll('.file-item').forEach(el => {
      el.addEventListener('click', () => {
        this.addLocalTrack(el.dataset.id, el.dataset.path, el.dataset.name);
      });
    });

    // 添加全部添加按钮
    if (files.length > 0) {
      const addAllBtn = document.createElement('div');
      addAllBtn.className = 'add-all-btn';
      addAllBtn.innerHTML = `
        <button class="btn-primary full-width" id="addAllLocalBtn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          <span>添加全部 (${files.length} 首)</span>
        </button>
      `;
      addAllBtn.style.cssText = 'padding: 1rem; border-top: 1px solid var(--border-color);';
      container.appendChild(addAllBtn);

      document.getElementById('addAllLocalBtn')?.addEventListener('click', () => {
        this.addAllLocalTracks(files);
      });
    }
  }

  addLocalTrack(id, path, name) {
    const track = { id, name, path, type: 'local' };
    if (!this.playlist.find(t => t.id === track.id)) {
      this.playlist.push(track);
      this.updatePlaylistUI();
      this.saveSettings();
      this.savePlaylistToServer();
      this.showNotification(`已添加：${name}`, 'success');
    } else {
      this.showNotification(`已在列表中：${name}`, 'info');
    }
  }

  addAllLocalTracks(files) {
    let addedCount = 0;
    files.forEach(file => {
      if (!this.playlist.find(t => t.id === file.id)) {
        this.playlist.push({
          id: file.id,
          name: file.name,
          path: file.path,
          type: 'local'
        });
        addedCount++;
      }
    });

    if (addedCount > 0) {
      this.updatePlaylistUI();
      this.saveSettings();
      this.savePlaylistToServer();
      this.showNotification(`已添加 ${addedCount} 首音乐`, 'success');
      this.switchTab('playlist');
    } else {
      this.showNotification('所有音乐已在列表中', 'info');
    }
  }

  // 扫描后自动添加歌曲到歌单并永久保存
  autoAddLocalTracks(files) {
    let addedCount = 0;
    files.forEach(file => {
      if (!this.playlist.find(t => t.id === file.id)) {
        this.playlist.push({
          id: file.id,
          name: file.name,
          path: file.path,
          type: 'local'
        });
        addedCount++;
      }
    });

    if (addedCount > 0) {
      this.updatePlaylistUI();
      this.saveSettings();
      this.savePlaylistToServer();
    }
  }

  rescanLocalDirectory() {
    if (this.lastScanPath) {
      document.getElementById('localScanPath').value = this.lastScanPath;
      document.getElementById('localScanRecursive').checked = this.lastScanRecursive;
      this.showLocalConfig();
      // 自动开始扫描
      document.getElementById('localScanForm').dispatchEvent(new Event('submit'));
    }
  }

  showLocalConfig() {
    document.getElementById('localConfig').style.display = 'block';
    document.getElementById('localBrowser').style.display = 'none';
  }

  // ==================== 封面和歌词 ====================
  setDefaultCover(albumArt, miniArt) {
    const defaultCover = '/img/default-cover.svg';
    if (albumArt) {
      albumArt.innerHTML = `<img src="${defaultCover}" alt="Album Art" class="default-cover">`;
    }
    if (miniArt) {
      miniArt.innerHTML = `<img src="${defaultCover}" alt="Album Art" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`;
    }
  }

  // 解析文件名获取歌曲名和歌手
  parseFileName(filename) {
    let name = filename.replace(/\.(mp3|flac|wav|ogg|m4a|aac|wma)$/i, '');
    name = name.replace(/^(\d+\.?\s*[-_]?\s*)/g, '');
    name = name.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/【[^】]*】/g, '');

    let artist = null;
    let songName = name.trim();

    if (name.includes(' - ')) {
      const parts = name.split(' - ').map(p => p.trim()).filter(p => p);
      if (parts.length >= 2) {
        artist = parts[0];
        songName = parts.slice(1).join(' - ');
      }
    } else if (name.includes('-') && !name.includes(' ')) {
      const parts = name.split('-').map(p => p.trim()).filter(p => p);
      if (parts.length >= 2) {
        artist = parts[0];
        songName = parts.slice(1).join('-');
      }
    }

    return { songName: songName.trim(), artist: artist ? artist.trim() : null };
  }

  // 显示歌手介绍
  async showArtistInfo(artistName) {
    if (!artistName) return;

    try {
      const response = await fetch(`/api/artist/info?name=${encodeURIComponent(artistName)}`);
      const result = await response.json();

      if (result.success && result.artist) {
        this.currentArtistInfo = result.artist;
        this.updateArtistInfoUI(result.artist);
      } else {
        this.currentArtistInfo = null;
        this.hideArtistInfo();
      }
    } catch (e) {
      console.error('获取歌手信息失败:', e);
    }
  }

  updateArtistInfoUI(artist) {
    const container = document.getElementById('artistInfoContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="artist-info-card">
        <div class="artist-avatar">
          <img src="${artist.avatar}" alt="${artist.name}" onerror="this.src='/img/default-cover.svg'">
        </div>
        <div class="artist-details">
          <h4>${artist.name}</h4>
          <div class="artist-tags">${artist.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
          <p class="artist-desc">${artist.description}</p>
        </div>
      </div>
    `;
    container.style.display = 'block';
  }

  hideArtistInfo() {
    const container = document.getElementById('artistInfoContainer');
    if (container) {
      container.style.display = 'none';
    }
  }

  async fetchCoverAndLyrics(track) {
    const albumArt = document.getElementById('albumArt');
    const miniArt = document.getElementById('miniArt');

    // 清空当前歌词
    this.currentLyrics = null;
    document.getElementById('lyricsText').innerHTML = '<p class="lyrics-placeholder">正在获取歌词...</p>';

    // 1. 首先解析文件名获取歌曲名和歌手
    const parsed = this.parseFileName(track.name);
    const songName = parsed.songName;
    const artistFromFile = parsed.artist;

    // 更新显示的歌曲名和歌手
    if (songName) {
      document.getElementById('trackTitle').textContent = songName;
      document.getElementById('miniTitle').textContent = songName;
    }

    if (artistFromFile && !track.artist) {
      track.artist = artistFromFile;
      document.getElementById('trackArtist').textContent = artistFromFile;
      document.getElementById('miniArtist').textContent = artistFromFile;
    }

    // 2. 获取歌手详细介绍
    const artistName = track.artist || artistFromFile;
    if (artistName) {
      this.showArtistInfo(artistName);
    } else {
      this.hideArtistInfo();
    }

    let coverLoaded = false;

    // 3. 优先尝试读取内嵌封面（本地上传文件和音乐库文件）
    if ((track.type === 'local' || track.type === 'library') && track.id) {
      try {
        let embeddedUrl;
        if (track.type === 'library') {
          const relativePath = track.id.replace('library:', '');
          // 对路径每部分分别编码，保留目录分隔符
          const encodedPath = relativePath.split(/[\/\\]/).map(p => encodeURIComponent(p)).join('/');
          embeddedUrl = `/api/library/cover/${encodedPath}`;
        } else {
          embeddedUrl = `/api/cover/embedded/${encodeURIComponent(track.id)}`;
        }

        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = () => {
            albumArt.innerHTML = `<img src="${embeddedUrl}" alt="Album Art">`;
            if (miniArt) {
              miniArt.innerHTML = `<img src="${embeddedUrl}" alt="Album Art" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`;
            }
            track.cover = embeddedUrl;
            coverLoaded = true;
            console.log('使用内嵌封面');
            // 更新锁屏封面
            this.updateMediaSessionMetadata(track);
            resolve();
          };
          img.onerror = () => reject();
          img.src = embeddedUrl;
        });
      } catch (e) {
        // 没有内嵌封面，继续网络获取
      }
    }

    // 4. 从网络获取封面和歌词（使用解析后的歌曲名搜索更准确）
    const searchName = artistName ? `${artistName} ${songName}` : songName;

    try {
      const response = await fetch(`/api/music/info?name=${encodeURIComponent(searchName)}`);
      const result = await response.json();

      if (result.success) {
        // 如果没有内嵌封面，使用网络封面
        if (!coverLoaded && result.cover) {
          const proxyUrl = `/api/cover/proxy?url=${encodeURIComponent(result.cover)}`;
          const img = new Image();
          img.onload = () => {
            albumArt.innerHTML = `<img src="${proxyUrl}" alt="Album Art">`;
            if (miniArt) {
              miniArt.innerHTML = `<img src="${proxyUrl}" alt="Album Art" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`;
            }
            track.cover = proxyUrl;
            this.updatePlaylistUI();
            // 更新锁屏封面
            this.updateMediaSessionMetadata(track);
          };
          img.onerror = () => {
            if (!coverLoaded) {
              console.log('网络封面加载失败，使用默认封面');
              this.setDefaultCover(albumArt, miniArt);
            }
          };
          img.src = proxyUrl;
        } else if (!coverLoaded) {
          this.setDefaultCover(albumArt, miniArt);
        }

        // 更新歌词
        if (result.lyrics) {
          this.currentLyrics = this.parseLyrics(result.lyrics);
          this.updateLyricsDisplay();
        } else {
          document.getElementById('lyricsText').innerHTML = '<p class="lyrics-placeholder">暂无歌词</p>';
        }

        // 更新艺术家信息（优先使用网络获取的）
        if (result.artist && !track.artist) {
          track.artist = result.artist;
          document.getElementById('trackArtist').textContent = result.artist;
          document.getElementById('miniArtist').textContent = result.artist;
          // 重新获取歌手介绍
          this.showArtistInfo(result.artist);
        }
      } else {
        if (!coverLoaded) {
          this.setDefaultCover(albumArt, miniArt);
        }
        document.getElementById('lyricsText').innerHTML = '<p class="lyrics-placeholder">暂无歌词</p>';
      }
    } catch (error) {
      console.error('获取音乐信息失败:', error);
      document.getElementById('lyricsText').innerHTML = '<p class="lyrics-placeholder">暂无歌词</p>';
      if (!coverLoaded) {
        this.setDefaultCover(albumArt, miniArt);
      }
      if (miniArt && !coverLoaded) {
        miniArt.innerHTML = `<img src="/img/default-cover.svg" alt="Album Art" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`;
      }
    }
  }

  parseLyrics(lrcText) {
    const lines = lrcText.split('\n');
    const lyrics = [];

    for (const line of lines) {
      const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
      if (match) {
        const minutes = parseInt(match[1]);
        const seconds = parseInt(match[2]);
        const milliseconds = parseInt(match[3].padEnd(3, '0'));
        const time = minutes * 60 + seconds + milliseconds / 1000;
        const text = match[4].trim();
        if (text) {
          lyrics.push({ time, text });
        }
      }
    }

    return lyrics.sort((a, b) => a.time - b.time);
  }

  toggleLyrics() {
    this.lyricsVisible = !this.lyricsVisible;
    const content = document.getElementById('lyricsContent');
    const toggle = document.getElementById('lyricsToggle');

    content.style.display = this.lyricsVisible ? 'block' : 'none';
    toggle.classList.toggle('active', this.lyricsVisible);
  }

  updateLyricsDisplay() {
    if (!this.currentLyrics || this.currentLyrics.length === 0) {
      document.getElementById('lyricsText').innerHTML = '<p class="lyrics-placeholder">暂无歌词</p>';
      return;
    }

    const currentTime = this.audioElement.currentTime;
    let activeIndex = -1;

    for (let i = 0; i < this.currentLyrics.length; i++) {
      if (this.currentLyrics[i].time <= currentTime) {
        activeIndex = i;
      } else {
        break;
      }
    }

    const container = document.getElementById('lyricsText');
    container.innerHTML = this.currentLyrics.map((lyric, index) =>
      `<p class="${index === activeIndex ? 'active' : ''}" data-time="${lyric.time}">${lyric.text}</p>`
    ).join('');

    // 滚动到当前歌词
    if (activeIndex >= 0) {
      const activeLine = container.querySelector('p.active');
      if (activeLine) {
        activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  // ===== 歌曲批量识别扫描功能 =====

  async startScan() {
    const startBtn = document.getElementById('startScanBtn');
    const stopBtn = document.getElementById('stopScanBtn');
    const progressDiv = document.getElementById('scanProgress');
    const resultsDiv = document.getElementById('scanResults');

    // 更新UI状态
    startBtn.disabled = true;
    startBtn.style.opacity = '0.5';
    stopBtn.disabled = false;
    stopBtn.style.display = 'inline-flex';
    stopBtn.style.opacity = '1';
    progressDiv.style.display = 'block';
    resultsDiv.style.display = 'none';

    // 初始化进度显示
    document.getElementById('scanStatusText').textContent = '正在启动扫描...';
    document.getElementById('scanCount').textContent = '0/0';
    document.getElementById('scanPercent').textContent = '0%';
    document.getElementById('scanProgressFill').style.width = '0%';
    document.getElementById('scanCurrentFile').textContent = '';
    document.getElementById('scanSuccessCount').textContent = '0';
    document.getElementById('scanErrorCount').textContent = '0';
    document.getElementById('scanTimeInfo').textContent = '';

    // 记录开始时间
    this.scanStartTime = Date.now();

    try {
      const response = await fetch('/api/scan/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        // 开始轮询扫描状态
        this.scanPolling = setInterval(() => this.pollScanStatus(), 1000);
      } else {
        const error = await response.json();
        this.showScanError(error.error || '启动扫描失败');
      }
    } catch (error) {
      console.error('启动扫描失败:', error);
      this.showScanError('网络错误，无法启动扫描');
    }
  }

  async stopScan() {
    const startBtn = document.getElementById('startScanBtn');
    const stopBtn = document.getElementById('stopScanBtn');

    try {
      await fetch('/api/scan/stop', { method: 'POST' });

      // 停止轮询
      if (this.scanPolling) {
        clearInterval(this.scanPolling);
        this.scanPolling = null;
      }

      document.getElementById('scanStatusText').textContent = '扫描已停止';

      // 恢复按钮状态
      startBtn.disabled = false;
      startBtn.style.opacity = '1';
      stopBtn.disabled = true;
      stopBtn.style.opacity = '0.5';
    } catch (error) {
      console.error('停止扫描失败:', error);
    }
  }

  async pollScanStatus() {
    try {
      const response = await fetch('/api/scan/status');
      const status = await response.json();

      const progressFill = document.getElementById('scanProgressFill');
      const progressGlow = document.getElementById('scanProgressGlow');
      const statusText = document.getElementById('scanStatusText');
      const countText = document.getElementById('scanCount');
      const percentText = document.getElementById('scanPercent');
      const currentFile = document.getElementById('scanCurrentFile');
      const successCount = document.getElementById('scanSuccessCount');
      const errorCount = document.getElementById('scanErrorCount');
      const timeInfo = document.getElementById('scanTimeInfo');

      // 更新进度条
      const percent = status.total > 0 ? (status.processed / status.total * 100) : 0;
      const percentRounded = Math.round(percent);
      progressFill.style.width = percent + '%';
      percentText.textContent = percentRounded + '%';

      // 更新发光位置
      if (progressGlow) {
        progressGlow.style.left = `calc(${percent}% - 10px)`;
      }

      // 更新计数
      countText.textContent = `${status.processed}/${status.total}`;

      // 更新成功/失败数
      const errorNum = status.errors ? status.errors.length : 0;
      const successNum = status.processed - errorNum;
      successCount.textContent = successNum;
      errorCount.textContent = errorNum;

      // 计算预估时间
      if (status.isScanning && status.processed > 0 && this.scanStartTime) {
        const elapsed = (Date.now() - this.scanStartTime) / 1000;
        const avgTime = elapsed / status.processed;
        const remaining = (status.total - status.processed) * avgTime;

        if (remaining > 60) {
          timeInfo.textContent = `预计剩余: ${Math.ceil(remaining / 60)} 分钟`;
        } else if (remaining > 0) {
          timeInfo.textContent = `预计剩余: ${Math.ceil(remaining)} 秒`;
        }
      }

      // 更新状态文字
      if (status.isScanning) {
        statusText.textContent = '正在识别中...';
        if (status.currentFile) {
          // 截断长文件名
          const fileName = status.currentFile.length > 40
            ? '...' + status.currentFile.slice(-37)
            : status.currentFile;
          currentFile.textContent = `🎵 ${fileName}`;
          currentFile.style.display = 'block';
        }
      } else {
        // 扫描完成
        statusText.textContent = '✓ 扫描完成';
        currentFile.style.display = 'none';

        // 显示总用时
        if (this.scanStartTime) {
          const totalTime = Math.round((Date.now() - this.scanStartTime) / 1000);
          if (totalTime > 60) {
            timeInfo.textContent = `总用时: ${Math.floor(totalTime / 60)} 分 ${totalTime % 60} 秒`;
          } else {
            timeInfo.textContent = `总用时: ${totalTime} 秒`;
          }
        }

        // 停止轮询
        if (this.scanPolling) {
          clearInterval(this.scanPolling);
          this.scanPolling = null;
        }

        // 恢复按钮状态
        const startBtn = document.getElementById('startScanBtn');
        const stopBtn = document.getElementById('stopScanBtn');
        startBtn.disabled = false;
        startBtn.style.opacity = '1';
        stopBtn.disabled = true;
        stopBtn.style.opacity = '0.5';

        // 显示结果摘要
        this.showScanResults(status);
      }
    } catch (error) {
      console.error('获取扫描状态失败:', error);
    }
  }

  showScanResults(status) {
    const resultsDiv = document.getElementById('scanResults');
    const summaryDiv = document.getElementById('scanSummary');

    resultsDiv.style.display = 'block';

    let html = `<div class="scan-summary-item success">✓ 成功识别: ${status.processed - status.errors.length} 首</div>`;

    if (status.errors.length > 0) {
      html += `<div class="scan-summary-item error">✗ 识别失败: ${status.errors.length} 首</div>`;
      html += '<div class="scan-error-list">';
      status.errors.slice(0, 10).forEach(err => {
        html += `<div class="scan-error-item">${err.file}: ${err.error}</div>`;
      });
      if (status.errors.length > 10) {
        html += `<div class="scan-error-item">...还有 ${status.errors.length - 10} 个错误</div>`;
      }
      html += '</div>';
    }

    summaryDiv.innerHTML = html;
  }

  showScanError(message) {
    const startBtn = document.getElementById('startScanBtn');
    const stopBtn = document.getElementById('stopScanBtn');

    document.getElementById('scanStatusText').textContent = message;

    startBtn.disabled = false;
    startBtn.style.opacity = '1';
    stopBtn.disabled = true;
    stopBtn.style.opacity = '0.5';

    if (this.scanPolling) {
      clearInterval(this.scanPolling);
      this.scanPolling = null;
    }
  }

  // ===== 写入元数据到音乐文件 =====

  async writeAllMetadata() {
    const writeBtn = document.getElementById('writeMetadataBtn');
    const writeProgress = document.getElementById('writeProgress');
    const writeProgressFill = document.getElementById('writeProgressFill');
    const writeStatusText = document.getElementById('writeStatusText');
    const writeCount = document.getElementById('writeCount');

    // 禁用按钮
    writeBtn.disabled = true;
    writeBtn.style.opacity = '0.5';
    writeProgress.style.display = 'block';
    writeStatusText.textContent = '正在获取元数据列表...';
    writeProgressFill.style.width = '0%';

    try {
      // 首先获取元数据列表
      const listResponse = await fetch('/api/metadata/list');
      const listData = await listResponse.json();

      if (!listData.success || !listData.metadata || Object.keys(listData.metadata).length === 0) {
        writeStatusText.textContent = '没有可写入的元数据，请先扫描歌曲';
        writeBtn.disabled = false;
        writeBtn.style.opacity = '1';
        return;
      }

      const songs = Object.values(listData.metadata);
      const songsToWrite = songs.filter(s => s.cover || s.lyrics);
      const total = songsToWrite.length;

      if (total === 0) {
        writeStatusText.textContent = '没有需要写入的封面或歌词';
        writeBtn.disabled = false;
        writeBtn.style.opacity = '1';
        return;
      }

      writeCount.textContent = `0/${total}`;
      writeStatusText.textContent = '正在写入...';

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < songsToWrite.length; i++) {
        const song = songsToWrite[i];

        try {
          const response = await fetch('/api/metadata/write', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filepath: song.filePath,
              cover: song.cover,
              lyrics: song.lyrics,
              title: song.songName,
              artist: song.artist
            })
          });

          const result = await response.json();
          if (result.success) {
            successCount++;
          } else {
            errorCount++;
            console.error(`写入失败 ${song.songName}:`, result.error);
          }
        } catch (e) {
          errorCount++;
          console.error(`写入失败 ${song.songName}:`, e.message);
        }

        // 更新进度
        const progress = ((i + 1) / total * 100);
        writeProgressFill.style.width = progress + '%';
        writeCount.textContent = `${i + 1}/${total}`;
      }

      // 完成
      writeStatusText.textContent = `写入完成: 成功 ${successCount} 首, 失败 ${errorCount} 首`;
      writeBtn.disabled = false;
      writeBtn.style.opacity = '1';

      // 显示通知
      this.showNotification(`元数据写入完成: 成功 ${successCount} 首`, 'success');

    } catch (error) {
      console.error('写入元数据失败:', error);
      writeStatusText.textContent = '写入失败: ' + error.message;
      writeBtn.disabled = false;
      writeBtn.style.opacity = '1';
    }
  }

  showNotification(message, type = 'info') {
    const container = document.getElementById('notifications');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    container.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}

// Initialize player
const player = new MusicPlayer();
