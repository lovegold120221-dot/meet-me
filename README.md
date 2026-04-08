# Eburon Meeting - Orbit Conference

Jitsi/8x8 JaaS video conferencing with real-time transcription.

## Project Structure

```
├── index.html              # Main meeting page (frontend)
├── settings.json           # Client-side Jitsi configuration
├── orbit.json              # Branding & toolbar configuration
├── provisioning-response.json  # JaaS server settings template
├── webhook-server.js       # Node.js webhook server for transcription
├── package.json            # Node dependencies
├── Dockerfile              # Docker container config
└── docker-compose.yml      # Docker orchestration
```

## Quick Start

### Frontend Only (Local Testing)
```bash
python3 -m http.server 8080
# Open http://localhost:8080
```

### Webhook Server (Local)
```bash
npm install
npm start
# Server runs on http://localhost:3000
```

### Deploy with Docker
```bash
docker-compose up -d
```

## JaaS Configuration

### 1. Settings Provisioning URL
In JaaS Admin Panel → API Keys → Settings Provisioning:
```
https://meet.eburon.ai/webhook/provision
```

### 2. Webhook Events
In JaaS Admin Panel → Webhooks:
```
URL: https://meet.eburon.ai/webhook/transcription
Events: TRANSCRIPTION_CHUNK_RECEIVED
```

### 3. Required JWT Features
Your JWT must have:
```json
{
  "context": {
    "features": {
      "transcription": true
    }
  }
}
```

## Webhook Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook/provision` | POST | Returns room config with EGHT_WHISPER transcriber |
| `/webhook/transcription` | POST | Receives live transcription chunks |
| `/webhook/transcriptions` | GET | Retrieve all saved transcriptions |
| `/webhook/health` | GET | Health check |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `NODE_ENV` | production | Environment mode |

## License

Private - Eburon Meeting
