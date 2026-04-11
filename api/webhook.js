const crypto = require('crypto');

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'whsec_bb49fdafa1c4408c8dfdf09b3a3bbbda';

const processedKeys = new Set();

function verifySignature(req) {
    const signature = req.headers['x-jaas-signature'];
    if (!signature) {
        console.log('No signature header found');
        return false;
    }

    const parts = signature.split(',');
    let timestamp = '';
    let sigV1 = '';

    for (const part of parts) {
        if (part.startsWith('t=')) {
            timestamp = part.substring(2);
        } else if (part.startsWith('v1=')) {
            sigV1 = part.substring(3);
        }
    }

    if (!timestamp || !sigV1) {
        console.log('Missing timestamp or signature');
        return false;
    }

    const bodyStr = JSON.stringify(req.body);
    const signedPayload = `${timestamp}.${bodyStr}`;

    const expectedSignature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(signedPayload, 'utf8')
        .digest('base64');

    try {
        const matches = crypto.timingSafeEqual(Buffer.from(sigV1), Buffer.from(expectedSignature));
        return matches;
    } catch (e) {
        console.log('Signature verification failed:', e.message);
        return false;
    }
}

function handleEvent(eventType, data, sessionId, fqn) {
    switch (eventType) {
        case 'ROOM_CREATED':
            console.log(`[ROOM_CREATED] Conference: ${data?.conference}`);
            break;
        case 'ROOM_DESTROYED':
            console.log(`[ROOM_DESTROYED] Conference: ${data?.conference}`);
            break;
        case 'PARTICIPANT_JOINED':
            console.log(`[PARTICIPANT_JOINED] ${data?.name} (${data?.email})`);
            break;
        case 'PARTICIPANT_LEFT':
            console.log(`[PARTICIPANT_LEFT] ${data?.name} - Reason: ${data?.disconnectReason}`);
            break;
        case 'TRANSCRIPTION_CHUNK_RECEIVED':
            console.log(`[TRANSCRIPTION] ${data?.participant?.name}: ${data?.final}`);
            break;
        case 'TRANSCRIPTION_UPLOADED':
            console.log(`[TRANSCRIPTION_UPLOADED] Transcript available at: ${data?.preAuthenticatedLink}`);
            break;
        case 'RECORDING_STARTED':
            console.log(`[RECORDING_STARTED] Conference: ${data?.conference}`);
            break;
        case 'RECORDING_ENDED':
            console.log(`[RECORDING_ENDED] Conference: ${data?.conference}`);
            break;
        case 'RECORDING_UPLOADED':
            console.log(`[RECORDING_UPLOADED] Recording: ${data?.preAuthenticatedLink}`);
            break;
        case 'CHAT_UPLOADED':
            console.log(`[CHAT_UPLOADED] Chat: ${data?.preAuthenticatedLink}`);
            break;
        case 'FEEDBACK':
            console.log(`[FEEDBACK] Rating: ${data?.rating}, Comments: ${data?.comments}`);
            break;
        default:
            console.log(`[${eventType}] Unhandled event`);
    }
}

module.exports = async function handler(req, res) {
    console.log('Webhook received:', req.method);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const body = req.body;
    const { idempotencyKey, eventType, sessionId, fqn, data } = body;

    if (!idempotencyKey) {
        console.log('Missing idempotency key');
        return res.status(400).json({ error: 'Missing idempotencyKey' });
    }

    if (processedKeys.has(idempotencyKey)) {
        console.log(`Duplicate request: ${idempotencyKey}`);
        return res.status(200).json({ received: true, duplicate: true });
    }

    processedKeys.add(idempotencyKey);
    if (processedKeys.size > 1000) {
        const keys = Array.from(processedKeys);
        keys.slice(0, 500).forEach(k => processedKeys.delete(k));
    }

    if (!verifySignature(req)) {
        console.log('Invalid signature');
        return res.status(401).json({ error: 'Invalid signature' });
    }

    console.log(`Processing: ${eventType} for session: ${sessionId}`);

    try {
        handleEvent(eventType, data, sessionId, fqn);
        return res.status(200).json({ received: true });
    } catch (error) {
        console.error('Error processing webhook:', error);
        return res.status(500).json({ error: 'Internal error' });
    }
};