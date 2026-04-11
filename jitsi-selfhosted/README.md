# Jitsi Meet Self-Hosted with Transcription & Translation

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Jitsi Meet Docker Stack                   │
├─────────────────────────────────────────────────────────────┤
│  web (nginx)  │  prosody (XMPP)  │  jicofo  │  jvb        │
└────────────────┴──────────────────┴──────────┴─────────────┘
                              │
              ┌───────────────┴───────────────┐
              │       transcriber (Jigasi)     │
              │   Custom fork from:            │
              │   github.com/lovegold120221-dot/jigasi │
              └───────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
    ┌────┴────┐        ┌─────┴─────┐        ┌────┴────┐
    │  Vosk   │        │LibreTranslate│       │ TURN   │
    │ (STT)   │        │ (Translate)  │       │ Server │
    └─────────┘        └─────────────┘        └────────┘
```

## Quick Start

### 1. Prerequisites
- Docker & Docker Compose
- Domain with SSL (or use self-signed for testing)

### 2. Clone and Setup
```bash
# The configuration is in /Users/eburon/pizza/jitsi-selfhosted/
cd /Users/eburon/pizza/jitsi-selfhosted
```

### 3. Edit .env
Key settings:
- `PUBLIC_URL` = your domain (e.g., https://meet.yourdomain.com)
- `JIGASI_TRANSCRIBER_PASSWORD` = secure password

### 4. Generate Passwords
```bash
./gen-passwords.sh
```

### 5. Start Services
```bash
# Start core + transcriber + Vosk + LibreTranslate
docker compose -f docker-compose.yml -f transcriber.yml -f transcription-services.yml up -d
```

### 6. Test Transcription
1. Open your Jitsi Meet URL
2. Join a meeting
3. Click **three-dot menu** → **Subtitles**
4. Enable subtitles and select language
5. Speak - you should see captions appear

## Custom Jigasi Fork

Using your custom Jigasi from: `https://github.com/lovegold120221-dot/jigasi`

The transcriber.yml builds from your fork:
```yaml
transcriber:
  build:
    context: https://github.com/lovegold120221-dot/jigasi.git
    dockerfile: DebianDockerfile
  image: jigasi:custom
```

## Transcription Services

### Option 1: Vosk (FREE - Recommended)
```env
JIGASI_TRANSCRIBER_CUSTOM_SERVICE=org.jitsi.jigasi.transcription.VoskTranscriptionService
JIGASI_TRANSCRIBER_VOSK_URL=ws://vosk:2700
JIGASI_TRANSCRIBER_ENABLE_TRANSLATION=1
JIGASI_TRANSCRIBER_LIBRETRANSLATE_URL=http://libretranslate:5000
```

### Option 2: Whisper (FREE)
```env
JIGASI_TRANSCRIBER_CUSTOM_SERVICE=org.jitsi.jigasi.transcription.WhisperTranscriptionService
JIGASI_TRANSCRIBER_WHISPER_URL=http://whisper:8000
```

### Option 3: Google Cloud (NOT FREE)
Uses your GCP credentials for speech-to-text and translation

## Frontend Integration

```javascript
const api = new JitsiMeetExternalAPI("meet.yourdomain.com", {
    roomName: "test-room",
    transcription: {
        enabled: true,
        translationLanguages: ['en', 'es', 'de', 'fr', 'it'],
        preferredLanguage: 'en'
    }
});
```

## Files

- `.env` - Configuration
- `docker-compose.yml` - Core Jitsi services
- `transcriber.yml` - Transcription service (builds from your Jigasi fork)
- `transcription-services.yml` - Vosk + LibreTranslate
- `index.html` - Frontend example