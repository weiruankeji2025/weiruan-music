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

    const savedPlaylist = localStorage.getItem('weiruan-music-playlist');
    if (savedPlaylist) {
      this.playlist = JSON.parse(savedPlaylist);
    }

    const savedVolume = localStorage.getItem('weiruan-music-volume');
    if (savedVolume) {
      this.volume = parseFloat(savedVolume);
    }
  }

  saveSettings() {
    localStorage.setItem('weiruan-music-settings', JSON.stringify(this.settings));
    localStorage.setItem('weiruan-music-playlist', JSON.stringify(this.playlist));
    localStorage.setItem('weiruan-music-volume', this.volume.toString());
  }

  setupAudioElement() {
    this.audioElement.crossOrigin = 'anonymous';
    this.audioElement.preload = 'metadata';
    this.audioElement.volume = this.volume;

    this.audioElement.addEventListener('loadedmetadata', () => this.onMetadataLoaded());
    this.audioElement.addEventListener('timeupdate', () => this.onTimeUpdate());
    this.audioElement.addEventListener('ended', () => this.onTrackEnded());
    this.audioElement.addEventListener('play', () => this.onPlay());
    this.audioElement.addEventListener('pause', () => this.onPause());
    this.audioElement.addEventListener('error', (e) => this.onError(e));
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
    document.getElementById('miniProgressBar').addEventListener('click', (e) => this.seekToMini(e));

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

    this.audioElement.src = track.path;
    this.audioElement.play();

    this.updateTrackInfo(track);
    this.updatePlaylistUI();

    if (this.settings.notifications) {
      this.showNotification(`正在播放：${track.name}`, 'info');
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
    this.showNotification(`随机播放：${this.isShuffle ? '开启' : '关闭'}`, 'info');
  }

  toggleRepeat() {
    const modes = ['none', 'all', 'one'];
    const currentModeIndex = modes.indexOf(this.repeatMode);
    this.repeatMode = modes[(currentModeIndex + 1) % modes.length];

    const btn = document.getElementById('repeatBtn');
    btn.classList.toggle('active', this.repeatMode !== 'none');

    if (this.repeatMode === 'one') {
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 1l4 4-4 4"/>
          <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
          <path d="M7 23l-4-4 4-4"/>
          <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
          <text x="12" y="14" font-size="8" fill="currentColor" text-anchor="middle">1</text>
        </svg>
      `;
    } else {
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 1l4 4-4 4"/>
          <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
          <path d="M7 23l-4-4 4-4"/>
          <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
        </svg>
      `;
    }

    const modeNames = { none: '关闭', all: '全部循环', one: '单曲循环' };
    this.showNotification(`重复模式：${modeNames[this.repeatMode]}`, 'info');
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
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
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
  }

  onPause() {
    this.isPlaying = false;
    this.updatePlayButtons(false);
    document.getElementById('albumArt').classList.remove('playing');
    this.stopVisualizer();
  }

  onError(e) {
    console.error('Audio error:', e);
    this.showNotification('播放出错', 'error');
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
  }

  // Playlist Management
  async handleFileUpload(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      if (result.success) {
        result.files.forEach(file => {
          if (!this.playlist.find(t => t.id === file.id)) {
            this.playlist.push(file);
          }
        });
        this.updatePlaylistUI();
        this.saveSettings();
        this.showNotification(`已添加 ${result.files.length} 首曲目`, 'success');
      }
    } catch (error) {
      console.error('Upload error:', error);
      this.showNotification('上传失败', 'error');
    }

    e.target.value = '';
  }

  async loadServerFiles() {
    try {
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

  clearPlaylist() {
    this.playlist = [];
    this.currentIndex = -1;
    this.audioElement.pause();
    this.audioElement.src = '';
    this.updatePlaylistUI();
    this.saveSettings();
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

    container.innerHTML = this.playlist.map((track, index) => `
      <div class="playlist-item ${index === this.currentIndex ? 'active playing' : ''}" data-index="${index}">
        <span class="item-number">${index + 1}</span>
        <div class="item-art">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
          </svg>
        </div>
        <div class="item-info">
          <div class="item-title">${track.name.replace(/\.[^/.]+$/, '')}</div>
          <div class="item-artist">${track.artist || '未知'}</div>
        </div>
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
    `).join('');

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
    const sections = ['webdav', 'gdrive', 'onedrive', 'dropbox', 'aliyun', 'baidu', 'alist'];
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
}

// Initialize player
const player = new MusicPlayer();
