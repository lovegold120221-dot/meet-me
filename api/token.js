const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const APP_ID = process.env.JAAS_APP_ID || 'vpaas-magic-cookie-b78ef1cd37804b878fe1c9d83b168da3';
const KID = process.env.JAAS_KID || 'vpaas-magic-cookie-b78ef1cd37804b878fe1c9d83b168da3/9e218f';

// Load private key from env var or file
function loadPrivateKey() {
  // First try environment variable
  if (process.env.JAAS_PRIVATE_KEY) {
    return process.env.JAAS_PRIVATE_KEY.replace(/\\n/g, '\n');
  }
  
  // Then try file
  const keyPath = process.env.PRIVATE_KEY_PATH || path.join(process.cwd(), 'key.pk');
  try {
    return fs.readFileSync(keyPath, 'utf8');
  } catch (err) {
    console.error('Failed to load private key:', err.message);
    return null;
  }
}

module.exports = (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Load private key
  const PRIVATE_KEY = loadPrivateKey();
  if (!PRIVATE_KEY) {
    return res.status(500).json({ 
      error: 'Private key not configured',
      message: 'Add JAAS_PRIVATE_KEY to environment variables'
    });
  }
  
  const room = req.query.room || 'conference';
  const userName = req.query.name || 'Guest';
  const isModerator = req.query.moderator === 'true';
  
  const now = Math.floor(Date.now() / 1000);
  
  const payload = {
    aud: 'jitsi',
    iss: 'chat',
    iat: now,
    exp: now + (24 * 60 * 60),
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
        email: ''
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
    
    res.status(200).json({ token, room });
  } catch (error) {
    console.error('JWT signing error:', error.message);
    res.status(500).json({ 
      error: 'Failed to generate JWT', 
      message: error.message,
      room,
      token: null 
    });
  }
};
