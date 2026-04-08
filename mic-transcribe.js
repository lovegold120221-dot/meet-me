// Real-time microphone transcription using Deepgram
// Usage: node mic-transcribe.js

const { DeepgramClient } = require('@deepgram/sdk');
const recorder = require('node-record-lpcm16');

// API Key - using the one from your code example
const DEEPGRAM_API_KEY = 'bc97222ef387c2ec2c5aeaf43ce93a7af74ad103';

const transcribeMic = async () => {
  const deepgram = new DeepgramClient({ apiKey: DEEPGRAM_API_KEY });

  // Create live transcription connection
  const socket = await deepgram.listen.v1.createConnection({
    model: 'nova-2',
    language: 'multi',
    smart_format: true,
    interim_results: true,
    endpointing: 10,
    diarize: true,
    vad_events: true,
    encoding: 'linear16',
    sample_rate: 16000,
    channels: 1,
  });

  socket.on('message', (data) => {
    if (data.type === 'SpeechStarted') {
      console.log(`[Event  ] SpeechStarted (${data.timestamp}s)`);
      return;
    }
    if (data.type === 'Results' && data.channel?.alternatives?.[0]) {
      const transcript = data.channel.alternatives[0].transcript;
      const prefix = data.is_final ? '[ FINAL ]' : '[Interim]';
      const words = data.channel.alternatives[0].words;
      const speakers = new Set(words.map(w => w.speaker).filter(s => s !== undefined));
      const speaker = speakers.size > 1 ? `${words[0]?.speaker}+` : words[0]?.speaker;
      
      if (transcript) {
        console.log(`${prefix} [Speaker ${speaker}] ${transcript}`);
      }
    }
  });

  socket.on('close', () => {
    console.log('\nConnection closed.');
    process.exit(0);
  });

  socket.on('error', (err) => {
    console.error('Deepgram Error:', err);
  });

  await socket.connect();
  await socket.waitForOpen();

  console.log('🎤 Transcribing from microphone... Press Ctrl+C to stop\n');

  // Start recording from microphone
  const recording = recorder.record({
    sampleRate: 16000,
    channels: 1,
    audioType: 'linear16',
  });

  recording.stream().on('data', (chunk) => {
    socket.sendMedia(chunk);
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping...');
    recording.stop();
    socket.disconnect();
  });
};

transcribeMic().catch(console.error);
