// JaaS Webhook Server for meet.eburon.ai/webhook
// This handles both Settings Provisioning and Transcription Chunks

const express = require('express');
const app = express();

app.use(express.json());

// CORS headers for JaaS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Store transcriptions in memory (use database for production)
const transcriptions = [];

// 1. SETTINGS PROVISIONING ENDPOINT
// JaaS calls this BEFORE each meeting to get room configuration
// Configure this URL in JaaS Admin Panel: https://meet.eburon.ai/webhook/provision
app.post('/webhook/provision', (req, res) => {
  const { fqn } = req.body;
  console.log('Provisioning request for:', fqn);

  // Return room configuration with EGHT_WHISPER transcription
  res.json({
    lobbyEnabled: false,
    maxOccupants: 100,
    transcriberType: 'EGHT_WHISPER',  // Enable 8x8 Whisper transcription
    visitorsEnabled: false
  });
});

// 2. TRANSCRIPTION WEBHOOK ENDPOINT
// JaaS sends transcription chunks here during meetings
// Configure this in JaaS Admin Panel Webhooks: https://meet.eburon.ai/webhook/transcription
app.post('/webhook/transcription', (req, res) => {
  const { eventType, data, fqn, timestamp } = req.body;

  if (eventType === 'TRANSCRIPTION_CHUNK_RECEIVED') {
    const entry = {
      timestamp: new Date(timestamp).toISOString(),
      room: fqn,
      text: data.final,
      language: data.language,
      participant: {
        id: data.participant.id,
        name: data.participant.name,
        email: data.participant.email
      }
    };

    transcriptions.push(entry);
    console.log('Transcription:', entry);

    // TODO: Save to database, send to client via WebSocket, etc.
  }

  res.sendStatus(200);
});

// 3. GET ALL TRANSCRIPTIONS (for retrieval)
app.get('/webhook/transcriptions', (req, res) => {
  res.json(transcriptions);
});

// 4. HEALTH CHECK
app.get('/webhook/health', (req, res) => {
  res.json({ status: 'ok', transcriptionsCount: transcriptions.length });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`JaaS Webhook Server running on port ${PORT}`);
  console.log('');
  console.log('Endpoints:');
  console.log('  POST /webhook/provision      - Settings provisioning for JaaS');
  console.log('  POST /webhook/transcription  - Receive transcription chunks');
  console.log('  GET  /webhook/transcriptions - Retrieve all transcriptions');
  console.log('  GET  /webhook/health         - Health check');
});
