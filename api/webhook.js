const crypto = require('crypto');

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'whsec_238a704aaf54476c844e9e662f715ba1';

// Webhook signature verification (8x8 JaaS format)
function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!signatureHeader) return false;
  
  const elements = signatureHeader.split(',');
  let timestamp = null;
  let signature = null;
  
  for (const element of elements) {
    const [prefix, value] = element.split('=');
    if (prefix === 't') timestamp = value;
    else if (prefix === 'v1') signature = value;
  }
  
  if (!timestamp || !signature) return false;
  
  const signedPayload = `${timestamp}.${rawBody}`;
  
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(signedPayload)
    .digest('base64');
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (e) {
    return false;
  }
}

module.exports = (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-jaas-signature');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const rawBody = JSON.stringify(req.body);
  const signatureHeader = req.headers['x-jaas-signature'];
  
  // Verify signature
  if (!verifyWebhookSignature(rawBody, signatureHeader)) {
    console.log('⚠️ Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  const event = req.body;
  const eventType = event.eventType || 'UNKNOWN';
  
  console.log(`📨 Webhook: ${eventType}`);
  console.log('   Room:', event.fqn || 'N/A');
  
  // Handle events
  switch (eventType) {
    case 'PARTICIPANT_JOINED':
      console.log(`   👤 Joined: ${event.data?.name || 'Anonymous'}`);
      break;
    case 'PARTICIPANT_LEFT':
      console.log(`   👋 Left: ${event.data?.name || 'Anonymous'}`);
      break;
    case 'ROOM_CREATED':
      console.log('   🏠 Room created');
      break;
    case 'ROOM_DESTROYED':
      console.log('   🗑️ Room destroyed');
      break;
    case 'RECORDING_STARTED':
      console.log('   🔴 Recording started');
      break;
    case 'RECORDING_ENDED':
      console.log('   ⏹️ Recording ended');
      break;
    default:
      console.log(`   ℹ️ Event: ${eventType}`);
  }
  
  res.status(200).json({ received: true });
};
