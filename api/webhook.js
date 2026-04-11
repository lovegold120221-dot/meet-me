const crypto = require('crypto');

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'whsec_bb49fdafa1c4408c8dfdf09b3a3bbbda';

function verifySignature(req) {
    const signature = req.headers['x-jaas-signature'];
    if (!signature) {
        return false;
    }

    const timestamp = signature.split(',').find(s => s.startsWith('t='))?.split('=')[1];
    const sigV1 = signature.split(',').find(s => s.startsWith('v1='))?.split('=')[1];

    if (!timestamp || !sigV1) {
        return false;
    }

    const signedPayload = `${timestamp}.${JSON.stringify(req.body)}`;
    const expectedSignature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(signedPayload, 'utf8')
        .digest('base64');

    return crypto.timingSafeEqual(Buffer.from(sigV1), Buffer.from(expectedSignature));
}

function handleTranscriptionChunk(data) {
    console.log('Transcription chunk received:', data.final);
    console.log('Speaker:', data.participant?.name);
    console.log('Language:', data.language);
}

function handleParticipantJoined(data) {
    console.log('Participant joined:', data.name, data.email);
}

function handleRoomCreated(data) {
    console.log('Room created:', data.conference);
}

async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!verifySignature(req)) {
        console.log('Invalid signature');
        return res.status(401).json({ error: 'Invalid signature' });
    }

    const { eventType, sessionId, timestamp, fqn, data } = req.body;

    console.log(`Received event: ${eventType} for session: ${sessionId}`);

    try {
        switch (eventType) {
            case 'TRANSCRIPTION_CHUNK_RECEIVED':
                handleTranscriptionChunk(data);
                break;
            case 'TRANSCRIPTION_UPLOADED':
                console.log('Full transcription available at:', data.preAuthenticatedLink);
                break;
            case 'PARTICIPANT_JOINED':
                handleParticipantJoined(data);
                break;
            case 'ROOM_CREATED':
                handleRoomCreated(data);
                break;
            case 'ROOM_DESTROYED':
                console.log('Room destroyed');
                break;
            case 'PARTICIPANT_LEFT':
                console.log('Participant left:', data.name);
                break;
            default:
                console.log(`Unhandled event: ${eventType}`);
        }

        return res.status(200).json({ received: true });
    } catch (error) {
        console.error('Error processing webhook:', error);
        return res.status(500).json({ error: 'Internal error' });
    }
}

module.exports = handler;