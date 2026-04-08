// Supabase Edge Function: Transcription Webhook with LiveKit, Cartesia, Deepgram
// Deploy with: supabase functions deploy transcription-webhook

import { createClient } from '@supabase/supabase-js';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-jaas-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Environment configuration (set in Supabase Dashboard > Edge Functions > Secrets)
interface EnvConfig {
  LIVEKIT_API_KEY: string;
  LIVEKIT_API_SECRET: string;
  LIVEKIT_URL: string;
  CARTESIA_API_KEY: string;
  CARTESIA_VOICE_ID: string;
  CARTESIA_MODEL_ID: string;
  CARTESIA_VERSION: string;
  DEEPGRAM_API_KEY: string;
  ORBIT_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  JAAS_WEBHOOK_SECRET?: string;
}

// Main handler
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get environment variables
    const env = Deno.env.toObject() as unknown as EnvConfig;
    
    // Initialize Supabase client
    const supabase = createClient(
      env.SUPABASE_URL || 'https://crynxtqmltbcpwscxoda.supabase.co',
      env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Get raw body for signature verification
    const rawBody = await req.text();
    const signature = req.headers.get('x-jaas-signature');

    // Verify JaaS webhook signature if secret is configured
    if (env.JAAS_WEBHOOK_SECRET && signature) {
      const isValid = await verifyJaaSSignature(rawBody, signature, env.JAAS_WEBHOOK_SECRET);
      if (!isValid) {
        return new Response(
          JSON.stringify({ error: 'Invalid signature' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Parse webhook payload
    const payload = JSON.parse(rawBody);
    const { eventType, data, fqn, timestamp, sessionId } = payload;

    console.log(`[${eventType}] Session: ${sessionId}, Room: ${fqn}`);

    // Handle different event types
    switch (eventType) {
      case 'TRANSCRIPTION_CHUNK_RECEIVED':
        await handleTranscriptionChunk({
          data,
          fqn,
          timestamp,
          sessionId,
          supabase,
          env
        });
        break;

      case 'PARTICIPANT_JOINED':
        await handleParticipantJoined({ data, fqn, sessionId, supabase, env });
        break;

      case 'PARTICIPANT_LEFT':
        await handleParticipantLeft({ data, fqn, sessionId, supabase });
        break;

      case 'RECORDING_ENDED':
        await handleRecordingEnded({ data, fqn, sessionId, supabase, env });
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    // Store event in database for audit trail
    await supabase.from('webhook_events').insert({
      event_type: eventType,
      session_id: sessionId,
      room_fqn: fqn,
      payload: payload,
      received_at: new Date().toISOString()
    });

    return new Response(
      JSON.stringify({ success: true, event: eventType }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Verify JaaS webhook signature
async function verifyJaaSSignature(payload: string, signatureHeader: string | null, secret: string): Promise<boolean> {
  if (!signatureHeader) return false;

  const elements = signatureHeader.split(',');
  const timestamp = elements.find(e => e.startsWith('t='))?.split('=')[1];
  const signature = elements.find(e => e.startsWith('v1='))?.split('=')[1];

  if (!timestamp || !signature) return false;

  // Check timestamp tolerance (5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  // Compute HMAC-SHA256
  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const expectedSig = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

  // Timing-safe comparison
  if (signature.length !== expectedSig.length) return false;
  
  let result = 0;
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  
  return result === 0;
}

// Handle transcription chunk
async function handleTranscriptionChunk({
  data,
  fqn,
  timestamp,
  sessionId,
  supabase,
  env
}: {
  data: any;
  fqn: string;
  timestamp: number;
  sessionId: string;
  supabase: any;
  env: EnvConfig;
}) {
  if (!data?.final) return;

  const entry = {
    session_id: sessionId,
    room_fqn: fqn,
    transcript_text: data.final,
    language: data.language || 'en',
    participant_id: data.participant?.id,
    participant_name: data.participant?.name,
    participant_email: data.participant?.email,
    timestamp: new Date(timestamp).toISOString(),
    created_at: new Date().toISOString()
  };

  // Save to Supabase
  const { error } = await supabase.from('transcriptions').insert(entry);
  
  if (error) {
    console.error('Failed to save transcription:', error);
  } else {
    console.log('Transcription saved:', data.final.substring(0, 100) + '...');
  }

  // Optional: Generate TTS response using Cartesia
  if (data.final.length > 50 && env.CARTESIA_API_KEY) {
    await generateTTSResponse(data.final, env);
  }
}

// Handle participant joined
async function handleParticipantJoined({
  data,
  fqn,
  sessionId,
  supabase,
  env
}: {
  data: any;
  fqn: string;
  sessionId: string;
  supabase: any;
  env: EnvConfig;
}) {
  console.log(`Participant joined: ${data?.name} (${data?.email})`);

  // Store participant info
  await supabase.from('participants').upsert({
    session_id: sessionId,
    room_fqn: fqn,
    participant_id: data?.id,
    name: data?.name,
    email: data?.email,
    avatar: data?.avatar,
    moderator: data?.moderator || false,
    joined_at: new Date().toISOString()
  }, {
    onConflict: 'session_id,participant_id'
  });

  // Optional: Send welcome message via LiveKit
  if (env.LIVEKIT_API_KEY && env.LIVEKIT_URL) {
    await sendLiveKitMessage(sessionId, `Welcome ${data?.name}!`, env);
  }
}

// Handle participant left
async function handleParticipantLeft({
  data,
  fqn,
  sessionId,
  supabase
}: {
  data: any;
  fqn: string;
  sessionId: string;
  supabase: any;
}) {
  console.log(`Participant left: ${data?.name}`);

  // Update participant record
  await supabase
    .from('participants')
    .update({ left_at: new Date().toISOString() })
    .match({ session_id: sessionId, participant_id: data?.id });
}

// Handle recording ended
async function handleRecordingEnded({
  data,
  fqn,
  sessionId,
  supabase,
  env
}: {
  data: any;
  fqn: string;
  sessionId: string;
  supabase: any;
  env: EnvConfig;
}) {
  console.log(`Recording ended for session: ${sessionId}`);

  // Store recording info
  await supabase.from('recordings').insert({
    session_id: sessionId,
    room_fqn: fqn,
    recording_url: data?.url,
    duration: data?.duration,
    file_size: data?.fileSize,
    created_at: new Date().toISOString()
  });

  // Optional: Process with Deepgram for transcription if not already done
  if (data?.url && env.DEEPGRAM_API_KEY) {
    await processRecordingWithDeepgram(data.url, sessionId, supabase, env);
  }
}

// Generate TTS using Cartesia
async function generateTTSResponse(text: string, env: EnvConfig) {
  try {
    const response = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': env.CARTESIA_API_KEY,
        'Cartesia-Version': env.CARTESIA_VERSION || '2026-03-01'
      },
      body: JSON.stringify({
        model_id: env.CARTESIA_MODEL_ID || 'sonic-3-latest',
        transcript: text.substring(0, 500), // Limit length
        voice: {
          mode: 'id',
          id: env.CARTESIA_VOICE_ID
        },
        output_format: {
          container: 'mp3',
          encoding: 'mp3',
          sample_rate: 44100
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Cartesia TTS failed: ${response.status}`);
    }

    console.log('TTS generated successfully');
    return await response.arrayBuffer();
  } catch (error) {
    console.error('TTS generation failed:', error);
  }
}

// Send message via LiveKit
async function sendLiveKitMessage(roomName: string, message: string, env: EnvConfig) {
  try {
    // Generate LiveKit token
    const token = await generateLiveKitToken(roomName, 'system-bot', env);
    
    // Send message via LiveKit API
    const response = await fetch(`${env.LIVEKIT_URL.replace('wss://', 'https://')}/twirp/livekit.RoomService/SendData`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        room: roomName,
        data: new TextEncoder().encode(JSON.stringify({ type: 'welcome', message })),
        kind: 'RELIABLE'
      })
    });

    if (!response.ok) {
      throw new Error(`LiveKit message failed: ${response.status}`);
    }

    console.log('LiveKit message sent successfully');
  } catch (error) {
    console.error('LiveKit message failed:', error);
  }
}

// Generate LiveKit token
async function generateLiveKitToken(roomName: string, identity: string, env: EnvConfig): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: env.LIVEKIT_API_KEY,
    sub: identity,
    video: { room: roomName, roomJoin: true },
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600
  };

  const encoder = new TextEncoder();
  
  const headerB64 = btoa(JSON.stringify(header));
  const payloadB64 = btoa(JSON.stringify(payload));
  const signatureInput = `${headerB64}.${payloadB64}`;
  
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(env.LIVEKIT_API_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signatureInput));
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  return `${signatureInput}.${signatureB64}`;
}

// Process recording with Deepgram
async function processRecordingWithDeepgram(recordingUrl: string, sessionId: string, supabase: any, env: EnvConfig) {
  try {
    const response = await fetch('https://api.deepgram.com/v1/listen', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: recordingUrl,
        model: 'nova-3',
        smart_format: true,
        diarize: true,
        punctuate: true
      })
    });

    if (!response.ok) {
      throw new Error(`Deepgram processing failed: ${response.status}`);
    }

    const result = await response.json();
    
    // Store Deepgram transcription
    await supabase.from('deepgram_transcriptions').insert({
      session_id: sessionId,
      recording_url: recordingUrl,
      transcription: result,
      created_at: new Date().toISOString()
    });

    console.log('Deepgram processing completed');
  } catch (error) {
    console.error('Deepgram processing failed:', error);
  }
}
