# AGENTS.md

## Project Overview
Simple static HTML app that embeds JaaS (Jitsi as a Service) video conferencing at `meet.eburon.ai`. No build system—just open `index.html` directly in browser or deploy to any static host.

## JaaS Architecture (Critical)
- **Domain**: Always use `8x8.vc` — NOT `meet.jit.si` (different infrastructure)
- **AppID (tenant)**: `vpaas-magic-cookie-b78ef1cd37804b878fe1c9d83b168da3`
- **Room name format**: `<AppID>/<room>` (e.g., `vpaas-magic-cookie-.../SampleAppNativeChemicalsPowerWhen`)
- **API script**: Load from `https://8x8.vc/<AppID>/external_api.js`

## Key Files
- `index.html` — Main app, embeds Jitsi iframe via 8x8.vc
- `.env` — Contains JaaS app ID, key ID, webhook secret, Cartesia TTS API key
- `key.pk` / `key.pub` — JWT signing keypair (DO NOT commit or expose)

## JWT Authentication
- JWTs must be signed with your private key (`key.pk`) for premium features
- JWT in index.html is a demo token; production needs server-side JWT generation
- JWT structure: header (RS256), payload with `context.features` and `context.user`

## Webhooks
- Configure in JaaS console at https://jaas.8x8.vc/
- Events: `PARTICIPANT_JOINED`, `TRANSCRIPTION_CHUNK_RECEIVED`, `ROOM_CREATED`, etc.
- Verify signatures using `X-Jaas-Signature` header with HMAC-SHA256

### Transcription Webhooks
Enable via JWT: `context.features.transcription: true`

**TRANSCRIPTION_CHUNK_RECEIVED** — Real-time transcription during meeting:
```json
{
  "eventType": "TRANSCRIPTION_CHUNK_RECEIVED",
  "data": {
    "final": "transcribed text",
    "language": "en",
    "messageID": "uuid",
    "participant": {
      "id": "jitsi-id",
      "name": "Jane Doe",
      "userId": "jwt-user-id",
      "email": "jane@example.com"
    }
  }
}
```

**TRANSCRIPTION_UPLOADED** — Full transcript after meeting ends:
```json
{
  "eventType": "TRANSCRIPTION_UPLOADED",
  "data": {
    "preAuthenticatedLink": "https://.../transcript-file"
  }
}
```

## Local Development
1. Open `index.html` directly in browser for basic testing
2. For full functionality (JWT auth, TTS), serve via local server:
   ```bash
   npx serve .
   ```
3. Ensure `.env` is present (copy from `.env.example`)

## Deployment
- Deploys to Vercel automatically (see commit history for config)
- Production URL: `https://meet.eburon.ai`
- Vercel reads `JAAS_PRIVATE_KEY` from env for JWT signing

## Security
- Never commit `.env`, `key.pk`, or secrets
- The `.env` file contains live API keys and webhook secrets—treat as sensitive

## Testing
- No test suite exists
- Manual verification: open index.html, join video room, test translation/TTS features if configured

## Relevant Docs
- JaaS dashboard: https://jaas.8x8.vc/
- JaaS docs: https://developer.8x8.com/jaas/docs/jaas-onboarding
- Cartesia TTS: https://cartesia.ai/