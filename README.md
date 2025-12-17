# WeiRuan Music Player

A modern, feature-rich web music player with a futuristic cyberpunk interface.

## Features

### Core Features
- **Local Music Upload** - Upload and play music from your device
- **WebDAV Cloud Storage** - Connect to Nextcloud, ownCloud, or any WebDAV-compatible cloud storage
- **Cross-Origin Support** - Full CORS configuration for seamless streaming
- **Range Requests** - Efficient audio streaming with seek support

### Player Features
- **Multiple Play Modes**
  - Sequential playback
  - Shuffle mode
  - Repeat all / Repeat one
- **Audio Visualizer**
  - Frequency bars
  - Waveform
  - Circular visualization
  - Particle effects
- **10-Band Equalizer** with presets:
  - Flat, Rock, Pop, Jazz, Classical, Electronic, Bass Boost, Vocal
- **Audio Effects**
  - Stereo widener
  - Bass boost
  - Reverb control

### Interface
- **Modern Cyberpunk Design** - Neon colors, glowing effects, animated backgrounds
- **4 Color Themes**
  - Cyber Neon (default)
  - Midnight Blue
  - Sunset Glow
  - Matrix Green
- **Responsive Design** - Works on desktop and mobile devices
- **Mini Player** - Always visible playback controls

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| Space | Play/Pause |
| ← | Previous track |
| → | Next track |
| ↑ | Volume up |
| ↓ | Volume down |
| M | Mute/Unmute |
| S | Toggle shuffle |
| R | Toggle repeat |

## Quick Start

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd weiruan-music

# Install dependencies
npm install

# Start the server
npm start
```

### Running

```bash
npm start
```

Open your browser and navigate to `http://localhost:3000`

## Usage

### Playing Local Music
1. Go to the "Playlist" tab
2. Click "Upload Music" button
3. Select audio files from your device
4. Click on a track to play

### Connecting to Cloud Storage (WebDAV)
1. Go to the "Cloud" tab
2. Enter your WebDAV server URL
   - Example for Nextcloud: `https://your-cloud.com/remote.php/dav/files/username/`
3. Enter your username and password
4. Click "Connect"
5. Browse folders and click audio files to add them to playlist

### Using the Equalizer
1. Go to the "Equalizer" tab
2. Select a preset (Rock, Pop, Jazz, etc.)
3. Or manually adjust the 10 frequency bands
4. Adjust audio effects as needed

## Supported Audio Formats
- MP3 (.mp3)
- WAV (.wav)
- FLAC (.flac)
- OGG (.ogg)
- M4A (.m4a)
- AAC (.aac)
- WMA (.wma)

## Project Structure

```
weiruan-music/
├── server/
│   └── index.js        # Express server with CORS, WebDAV proxy
├── public/
│   ├── index.html      # Main HTML structure
│   ├── css/
│   │   └── style.css   # Modern cyberpunk styles
│   └── js/
│       └── app.js      # Player logic, visualizer, equalizer
├── uploads/            # Local music storage (auto-created)
└── package.json
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/upload | Upload music files |
| GET | /api/files | List uploaded files |
| GET | /api/music/:filename | Stream local music |
| DELETE | /api/files/:filename | Delete uploaded file |
| POST | /api/webdav/connect | Connect to WebDAV |
| GET | /api/webdav/list | List WebDAV directory |
| GET | /api/webdav/stream | Stream from WebDAV |
| POST | /api/webdav/disconnect | Disconnect WebDAV |

## Technologies Used

- **Frontend**: Vanilla JavaScript, CSS3, HTML5 Audio API, Web Audio API
- **Backend**: Node.js, Express
- **Storage**: WebDAV protocol, Local file system
- **Audio**: Web Audio API for equalizer and visualizer

## Browser Support

- Chrome (recommended)
- Firefox
- Edge
- Safari

## License

MIT License
