// JaaS Webhook Server for meet.eburon.ai/webhook
// This handles both Settings Provisioning and Transcription Chunks

const express = require('express');
const crypto = require('crypto');
const app = express();

// JaaS Webhook Secret - Get this from JaaS Console > Webhooks > Reveal secret
const JAAS_WEBHOOK_SECRET = process.env.JAAS_WEBHOOK_SECRET || 'whsec_e1de07fd5bcb4112a2fbf0e8ea3eb5e3';

// Raw body middleware for signature verification (needed before express.json)
app.use(express.raw({ type: 'application/json' }));

// JaaS Webhook Signature Verification
function verifyJaaSSignature(payload, signatureHeader, secret) {
  if (!signatureHeader) {
    return { valid: false, error: 'Missing X-Jaas-Signature header' };
  }

  // Extract timestamp and signature from header
  // Format: t=1632490060,v1=xlzqEojlh4qb21sQpXYsWgyK8x9HVpz+RQldsv18rV0=
  const elements = signatureHeader.split(',');
  const timestamp = elements.find(e => e.startsWith('t='))?.split('=')[1];
  const signature = elements.find(e => e.startsWith('v1='))?.split('=')[1];

  if (!timestamp || !signature) {
    return { valid: false, error: 'Invalid signature header format' };
  }

  // Check timestamp tolerance (5 minutes)
  const now = Math.floor(Date.now() / 1000);
  const tolerance = 300; // 5 minutes
  if (Math.abs(now - parseInt(timestamp)) > tolerance) {
    return { valid: false, error: 'Timestamp too old' };
  }

  // Prepare signed_payload: timestamp.payload
  const signedPayload = `${timestamp}.${payload}`;

  // Compute expected signature using HMAC-SHA256
  const expectedSig = crypto
    .createHmac('sha256', secret)
 .update(signedPayload)
    .digest('base64');

  // Constant-time comparison to prevent timing attacks
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSig);

  if (sigBuf.length !== expectedBuf.length) {
    return { valid: false, error: 'Signature length mismatch' };
  }

  const match = crypto.timingSafeEqual(sigBuf, expectedBuf);

  return { valid: match, error: match ? null : 'Signature mismatch' };
}

// Parse JSON after raw body capture
app.use((req, res, next) => {
  if (req.body && Buffer.isBuffer(req.body)) {
    req.rawBody = req.body.toString('utf8');
    try {
      req.body = JSON.parse(req.rawBody);
    } catch (e) {
      req.body = {};
    }
  }
  next();
});

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
const eventsLog = []; // Log all webhook events for debugging

// MAIN WEBHOOK ENDPOINT - Handles all JaaS events
// JaaS Console is configured to send to: https://meet.eburon.ai/webhook
app.post('/webhook', (req, res) => {
  // Verify JaaS webhook signature
  const signature = req.headers['x-jaas-signature'];
  const verification = verifyJaaSSignature(req.rawBody, signature, JAAS_WEBHOOK_SECRET);

  if (!verification.valid) {
    console.log('Webhook signature verification failed:', verification.error);
    return res.status(401).json({ error: 'Invalid signature', details: verification.error });
  }

  const { eventType, data, fqn, timestamp, sessionId, customerId } = req.body;

  // Log all events for debugging
  const eventEntry = {
    receivedAt: new Date().toISOString(),
    eventType,
    sessionId,
    fqn,
    timestamp: timestamp ? new Date(timestamp).toISOString() : null,
    customerId
  };
  eventsLog.unshift(eventEntry);
  if (eventsLog.length > 100) eventsLog.pop(); // Keep last 100 events

  console.log(`[${eventType}] Session: ${sessionId}, Room: ${fqn}`);

  // Handle specific event types
  switch (eventType) {
    // ==================== TRANSCRIPTION EVENTS ====================
    case 'TRANSCRIPTION_CHUNK_RECEIVED':
      if (data && data.final) {
        const entry = {
          timestamp: new Date(timestamp).toISOString(),
          room: fqn,
          text: data.final,
          language: data.language,
          messageId: data.messageID,
          participant: {
            id: data.participant?.id,
            name: data.participant?.name,
            userId: data.participant?.userId,
            email: data.participant?.email,
            avatarUrl: data.participant?.avatarUrl
          }
        };
        transcriptions.push(entry);
        console.log('✓ Transcription:', entry.text.substring(0, 80) + (entry.text.length > 80 ? '...' : ''));
      }
      break;

    case 'TRANSCRIPTION_UPLOADED':
      console.log('✓ Transcription uploaded:', data?.fileName);
      break;

    // ==================== PARTICIPANT EVENTS ====================
    case 'PARTICIPANT_JOINED':
      console.log('✓ Joined:', data?.name || 'Unknown', `(${data?.email || 'no email'})`, '[JWT:', data?.userId || 'none', ']');
      break;

    case 'PARTICIPANT_LEFT':
      console.log('✓ Left:', data?.name || 'Unknown');
      break;

    case 'PARTICIPANT_JOINED_LOBBY':
      console.log('⏳ Lobby:', data?.name || 'Unknown');
      break;

    case 'PARTICIPANT_LEFT_LOBBY':
      console.log('⏳ Left lobby:', data?.name || 'Unknown');
      break;

    case 'ROLE_CHANGED':
      console.log('🔄 Role change:', data?.participantId, '→', data?.role);
      break;

    // ==================== ROOM LIFECYCLE ====================
    case 'ROOM_CREATED':
      console.log('🏠 Room created:', fqn);
      break;

    case 'ROOM_DESTROYED':
      console.log('🏠 Room destroyed:', fqn);
      break;

    // ==================== RECORDING EVENTS ====================
    case 'RECORDING_STARTED':
      console.log('🔴 Recording started:', fqn);
      break;

    case 'RECORDING_ENDED':
      console.log('🔴 Recording ended:', fqn, 'Duration:', data?.duration, 'ms');
      break;

    case 'RECORDING_UPLOADED':
      console.log('🔴 Recording uploaded:', data?.preAuthenticatedLink?.substring(0, 60) + '...');
      break;

    case 'VIDEO_SEGMENT_UPLOADED':
      console.log('🎬 Video segment:', data?.fileName);
      break;

    // ==================== LIVE STREAMING ====================
    case 'LIVE_STREAM_STARTED':
      console.log('📡 Live stream started:', fqn, '→', data?.liveStreamKey);
      break;

    case 'LIVE_STREAM_ENDED':
      console.log('📡 Live stream ended:', fqn);
      break;

    // ==================== DOCUMENT/FILE EVENTS ====================
    case 'DOCUMENT_ADDED':
      console.log('📄 Document added:', data?.fileName, `(${(data?.fileSize / 1024).toFixed(1)} KB)`);
      console.log('   Link expires:', new Date(data?.linkExpiration).toLocaleString());
      break;

    case 'DOCUMENT_DELETED':
      console.log('🗑️ Document deleted:', data?.fileName, 'by', data?.initiatorId);
      break;

    // ==================== CHAT & MESSAGING ====================
    case 'CHAT_UPLOADED':
      console.log('💬 Chat history uploaded');
      break;

    case 'REACTIONS':
      console.log('😀 Reaction:', data?.reaction, 'from', data?.participantName);
      break;

    case 'AGGREGATED_REACTIONS':
      console.log('📊 Aggregated reactions:', JSON.stringify(data?.reactions));
      break;

    // ==================== POLLS ====================
    case 'POLL_CREATED':
      console.log('📊 Poll created:', data?.question);
      break;

    case 'POLL_ANSWER':
      console.log('📊 Poll answer:', data?.answer, 'from', data?.participantName);
      break;

    // ==================== CALL EVENTS ====================
    case 'SIP_CALL_IN_STARTED':
    case 'DIAL_IN_STARTED':
      console.log('📞 Dial-in started:', data?.callerNumber);
      break;

    case 'SIP_CALL_IN_ENDED':
    case 'DIAL_IN_ENDED':
      console.log('📞 Dial-in ended:', data?.callerNumber, 'Duration:', data?.duration, 's');
      break;

    case 'SIP_CALL_OUT_STARTED':
    case 'DIAL_OUT_STARTED':
      console.log('📤 Dial-out started:', data?.destinationNumber);
      break;

    case 'SIP_CALL_OUT_ENDED':
    case 'DIAL_OUT_ENDED':
      console.log('📤 Dial-out ended:', data?.destinationNumber, 'Duration:', data?.duration, 's');
      break;

    // ==================== ANALYTICS & STATS ====================
    case 'SPEAKER_STATS':
      console.log('📈 Speaker stats:', data?.dominantSpeakerId, 'talked for', data?.totalDominantSpeakerTime, 'ms');
      break;

    case 'RTCSTATS_UPLOADED':
      console.log('📊 RTC stats uploaded for session:', sessionId);
      break;

    case 'USAGE':
      console.log('📊 Usage metrics:', JSON.stringify(data));
      break;

    case 'SCREEN_SHARING_HISTORY':
      console.log('🖥️ Screen sharing sessions:', data?.sessions?.length || 0);
      break;

    // ==================== FEEDBACK ====================
    case 'FEEDBACK':
      console.log('💭 Feedback:', data?.score, 'stars -', data?.comment);
      break;

    // ==================== SETTINGS ====================
    case 'SETTINGS_PROVISIONING':
      console.log('⚙️ Settings provisioning request:', fqn);
      break;

    // ==================== DEFAULT ====================
    default:
      console.log('📨 Event:', eventType, '- Session:', sessionId?.substring(0, 8));
  }

  // Always return 200 OK to acknowledge receipt
  res.sendStatus(200);
});

// GET endpoint to view recent events (for debugging)
app.get('/webhook/events', (req, res) => {
  res.json({
    totalEvents: eventsLog.length,
    events: eventsLog.slice(0, 20) // Last 20 events
  });
});

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
  // Verify JaaS webhook signature
  const signature = req.headers['x-jaas-signature'];
  const verification = verifyJaaSSignature(req.rawBody, signature, JAAS_WEBHOOK_SECRET);

  if (!verification.valid) {
    console.log('Webhook signature verification failed:', verification.error);
    return res.status(401).json({ error: 'Invalid signature', details: verification.error });
  }

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
  console.log('  POST /webhook                - Main JaaS webhook (all events, signature verified)');
  console.log('  GET  /webhook/events         - View recent webhook events (debug)');
  console.log('  POST /webhook/provision      - Settings provisioning for JaaS');
  console.log('  POST /webhook/transcription  - Transcription only endpoint');
  console.log('  GET  /webhook/transcriptions - Retrieve all transcriptions');
  console.log('  GET  /webhook/health         - Health check');
  console.log('');
  console.log('Security:');
  console.log(`  Webhook signature verification: ${JAAS_WEBHOOK_SECRET ? 'ENABLED' : 'DISABLED'}`);
  console.log(`  Secret: ${JAAS_WEBHOOK_SECRET.substring(0, 10)}...`);
});
