require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Webhook signing secret
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'whsec_238a704aaf54476c844e9e662f715ba1';

// Parse JSON bodies for webhooks
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// Read private key from file
const PRIVATE_KEY_PATH = process.env.PRIVATE_KEY_PATH || path.join(__dirname, 'key.pk');
let PRIVATE_KEY = null;
let hasValidKey = false;

try {
  PRIVATE_KEY = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
  hasValidKey = PRIVATE_KEY && (
    PRIVATE_KEY.includes('BEGIN RSA PRIVATE KEY') ||
    PRIVATE_KEY.includes('BEGIN PRIVATE KEY')
  );
  if (hasValidKey) {
    console.log('✅ Private key loaded from:', PRIVATE_KEY_PATH);
  } else {
    console.error('❌ File does not contain a valid private key header');
  }
} catch (error) {
  console.error('❌ Failed to load private key:', error.message);
  console.log('   Looking for key at:', PRIVATE_KEY_PATH);
}

// JaaS credentials
const APP_ID = process.env.JAAS_APP_ID || 'vpaas-magic-cookie-b78ef1cd37804b878fe1c9d83b168da3';
const KID = process.env.JAAS_KID || 'vpaas-magic-cookie-b78ef1cd37804b878fe1c9d83b168da3/9e218f';

// Cartesia TTS config
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY;
const CARTESIA_VOICE_ID = process.env.CARTESIA_VOICE_ID || 'eded3658-4f70-4420-b021-1e70e14a8203';
const CARTESIA_MODEL_ID = process.env.CARTESIA_MODEL_ID || 'sonic-2';

// Translation function (placeholder - returns original text)
// TODO: Replace with actual translation service (Google Translate, DeepL, etc.)
async function translateText(text, sourceLang = 'auto', targetLang = 'en') {
  // For now, return original text
  // In production, integrate with a translation API
  console.log(`🌐 Translation skipped (same language or placeholder): "${text.substring(0, 50)}..."`);
  return text;
}

// Cartesia TTS function
async function generateTTS(text) {
  if (!CARTESIA_API_KEY) throw new Error('CARTESIA_API_KEY not configured');
  
  console.log(`🎙️ Generating TTS for: "${text.substring(0, 50)}..."`);
  console.log(`   Voice ID: ${CARTESIA_VOICE_ID}`);
  console.log(`   Model ID: ${CARTESIA_MODEL_ID}`);
  console.log(`   API Key: ${CARTESIA_API_KEY.substring(0, 10)}...`);
  
  const requestPayload = {
    model_id: CARTESIA_MODEL_ID,
    transcript: text,
    voice: { mode: 'id', id: CARTESIA_VOICE_ID },
    output_format: { container: 'mp3', encoding: 'mp3', sample_rate: 24000 }
  };
  
  console.log('   Request payload:', JSON.stringify(requestPayload, null, 2));
  
  try {
    const response = await axios.post('https://api.cartesia.ai/tts/bytes', requestPayload, {
      headers: { 
        'X-API-Key': CARTESIA_API_KEY, 
        'Content-Type': 'application/json',
        'Cartesia-Version': '2025-04-16'
      },
      responseType: 'arraybuffer',
      timeout: 30000
    });
    
    console.log('✅ TTS audio generated');
    const base64Audio = Buffer.from(response.data).toString('base64');
    return `data:audio/mp3;base64,${base64Audio}`;
  } catch (error) {
    if (error.response) {
      console.error('Cartesia API error:', error.response.status);
      // Convert arraybuffer error response to string
      const errorData = error.response.data;
      if (errorData) {
        const errorText = Buffer.isBuffer(errorData) ? errorData.toString() : JSON.stringify(errorData);
        console.error('Error response:', errorText);
      }
    }
    throw error;
  }
}

// Serve static files
app.use(express.static(path.join(__dirname)));

// Webhook signature verification (8x8 JaaS format)
// Header format: t=timestamp,v1=signature
function verifyWebhookSignature(req) {
  const signatureHeader = req.headers['x-jaas-signature'];
  if (!signatureHeader) {
    console.log('⚠️  Missing x-jaas-signature header');
    return false;
  }
  
  // Parse header: t=timestamp,v1=signature
  const elements = signatureHeader.split(',');
  let timestamp = null;
  let signature = null;
  
  for (const element of elements) {
    const [prefix, value] = element.split('=');
    if (prefix === 't') {
      timestamp = value;
    } else if (prefix === 'v1') {
      signature = value;
    }
  }
  
  if (!timestamp || !signature) {
    console.log('⚠️  Invalid signature header format');
    return false;
  }
  
  // Create signed_payload: timestamp.body
  const signedPayload = `${timestamp}.${req.rawBody}`;
  
  // Compute expected signature
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(signedPayload)
    .digest('base64');
  
  // Constant-time comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (e) {
    return false;
  }
}

// Webhook endpoint for JaaS events
app.post('/webhook', (req, res) => {
  // Verify signature
  if (!verifyWebhookSignature(req)) {
    console.log('⚠️  Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  const event = req.body;
  const eventType = event.eventType || 'UNKNOWN';
  
  console.log(`📨 Webhook received: ${eventType}`);
  console.log('   FQN:', event.fqn || 'N/A');
  console.log('   Timestamp:', new Date(event.timestamp || Date.now()).toISOString());
  
  // Handle different event types
  switch (eventType) {
    case 'PARTICIPANT_JOINED':
      console.log(`   👤 Participant joined: ${event.data?.name || 'Anonymous'}`);
      console.log(`      ID: ${event.data?.id || 'N/A'}`);
      console.log(`      Moderator: ${event.data?.moderator ? 'Yes' : 'No'}`);
      break;
    case 'PARTICIPANT_LEFT':
      console.log(`   👋 Participant left: ${event.data?.name || 'Anonymous'}`);
      break;
    case 'ROOM_CREATED':
      console.log('   🏠 Room created');
      break;
    case 'ROOM_DESTROYED':
      console.log('   🗑️  Room destroyed');
      break;
    case 'RECORDING_STARTED':
      console.log('   🔴 Recording started');
      break;
    case 'RECORDING_ENDED':
      console.log('   ⏹️  Recording ended');
      console.log(`      Recording URL: ${event.data?.url || 'N/A'}`);
      break;
    case 'LIVE_STREAM_STARTED':
      console.log('   📺 Live stream started');
      break;
    case 'LIVE_STREAM_ENDED':
      console.log('   📴 Live stream ended');
      break;
    case 'TRANSCRIPTION_CHUNK_RECEIVED':
      console.log('   📝 Transcription chunk received');
      break;
    case 'TRANSCRIPTION_UPLOADED':
      console.log('   📝 Transcription uploaded');
      console.log(`      URL: ${event.data?.url || 'N/A'}`);
      break;
    default:
      console.log(`   ℹ️  Event data:`, JSON.stringify(event.data, null, 2).substring(0, 200));
  }
  
  // Log full event for debugging (optional)
  // fs.appendFileSync('webhooks.log', JSON.stringify({ receivedAt: new Date().toISOString(), event }) + '\n');
  
  res.status(200).json({ received: true });
});

// Get recent events (for debugging)
app.get('/api/events', (req, res) => {
  res.json({ message: 'Webhook events endpoint - events are logged to console' });
});

// Check if private key is configured
function checkKeyConfigured() {
  if (!hasValidKey) {
    return false;
  }
  return true;
}

// Generate JWT endpoint
app.get('/api/token', (req, res) => {
  if (!checkKeyConfigured()) {
    return res.status(500).json({ 
      error: 'JWT not configured',
      message: 'Private key not set. Create a .env file with JAAS_PRIVATE_KEY from your 8x8 JaaS dashboard.',
      room: req.query.room || 'conference',
      token: null 
    });
  }

  const room = req.query.room || 'conference';
  const userName = req.query.name || 'Guest';
  const userEmail = req.query.email || '';
  const isModerator = req.query.moderator === 'true';

  const now = Math.floor(Date.now() / 1000);
  
  const payload = {
    aud: 'jitsi',
    iss: 'chat',
    iat: now,
    exp: now + (24 * 60 * 60), // 24 hours validity
    nbf: now,
    sub: APP_ID,
    context: {
      features: {
        livestreaming: isModerator,
        'file-upload': isModerator,
        'outbound-call': isModerator,
        'sip-outbound-call': isModerator,
        transcription: isModerator,
        'list-visitors': isModerator,
        recording: isModerator,
        flip: false
      },
      user: {
        'hidden-from-recorder': false,
        moderator: isModerator,
        name: userName,
        id: `user-${Date.now()}`,
        avatar: '',
        email: userEmail
      }
    },
    room: room
  };

  try {
    const token = jwt.sign(payload, PRIVATE_KEY, {
      algorithm: 'RS256',
      header: {
        kid: KID,
        typ: 'JWT',
        alg: 'RS256'
      }
    });
    res.json({ token, room });
  } catch (error) {
    console.error('JWT signing error:', error.message);
    res.status(500).json({ 
      error: 'Failed to generate JWT', 
      message: error.message,
      room,
      token: null 
    });
  }
});

// Translation + TTS endpoint
app.post('/api/tts', async (req, res) => {
  console.log('📥 TTS request received:', req.body);
  
  const { text, speaker, sourceLang = 'auto', targetLang = 'en' } = req.body || {};
  
  if (!text) {
    console.log('❌ No text provided in request body');
    return res.status(400).json({ error: 'Text is required', received: req.body });
  }
  
  try {
    console.log(`🔊 TTS Request from ${speaker || 'Unknown'}: "${text.substring(0, 50)}..."`);
    
    // Step 1: Translate text
    const translatedText = await translateText(text, sourceLang, targetLang);
    console.log(`🌐 Translated: "${translatedText.substring(0, 50)}..."`);
    
    // Step 2: Generate TTS audio
    if (!CARTESIA_API_KEY) {
      return res.status(200).json({
        translatedText,
        audioUrl: null,
        warning: 'CARTESIA_API_KEY not configured - translation only'
      });
    }
    
    const audioUrl = await generateTTS(translatedText);
    console.log('✅ TTS generated successfully');
    
    res.status(200).json({
      translatedText,
      audioUrl,
      originalText: text,
      speaker: speaker || 'Unknown'
    });
    
  } catch (error) {
    console.error('TTS endpoint error:', error.message);
    res.status(500).json({
      error: 'Failed to generate TTS',
      message: error.message,
      translatedText: text
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (!hasValidKey) {
    console.log('\n⚠️  WARNING: Private key not found or invalid.');
    console.log('   Expected file: key.pk with PRIVATE KEY');
    console.log('   JWT generation will fail.\n');
  } else {
    console.log('✅ JWT generation ready (KID:', KID + ')');
  }
  console.log('📁 Private key file:', PRIVATE_KEY_PATH);
  console.log('📡 Webhook endpoint: POST /webhook');
  console.log('🔊 TTS endpoint: POST /api/tts');
  console.log('   Events will be logged to console\n');
});
