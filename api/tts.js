// Translation + Cartesia TTS API
const axios = require('axios');

const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY;
const CARTESIA_VOICE_ID = process.env.CARTESIA_VOICE_ID || 'eded3658-4f70-4420-b021-1e70e14a8203';
const CARTESIA_MODEL_ID = process.env.CARTESIA_MODEL_ID || 'sonic-3';

// Translation function (placeholder - returns original text)
// TODO: Replace with Google Translate API (paid) or other service
async function translateText(text, sourceLang = 'auto', targetLang = 'en') {
  // For now, return original text (translation will be added with Google API)
  console.log(`🌐 Translation placeholder: "${text.substring(0, 50)}..."`);
  return text;
}

// Cartesia TTS
async function generateTTS(text) {
  if (!CARTESIA_API_KEY) {
    throw new Error('CARTESIA_API_KEY not configured');
  }
  
  try {
    const response = await axios.post('https://api.cartesia.ai/tts/bytes', {
      model_id: CARTESIA_MODEL_ID,
      transcript: text,
      voice: {
        mode: 'id',
        id: CARTESIA_VOICE_ID
      },
      output_format: {
        container: 'mp3',
        encoding: 'mp3',
        sample_rate: 24000
      }
    }, {
      headers: {
        'X-API-Key': CARTESIA_API_KEY,
        'Content-Type': 'application/json',
        'Cartesia-Version': '2026-03-01'
      },
      responseType: 'arraybuffer',
      timeout: 15000
    });
    
    // Convert audio buffer to base64 data URL
    const base64Audio = Buffer.from(response.data).toString('base64');
    return `data:audio/mp3;base64,${base64Audio}`;
  } catch (error) {
    console.error('Cartesia TTS error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.status, error.response.data);
    }
    throw error;
  }
}

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { text, speaker, sourceLang = 'auto', targetLang = 'en' } = req.body;
  
  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }
  
  try {
    console.log(`🔊 TTS Request from ${speaker || 'Unknown'}: "${text.substring(0, 50)}..."`);
    
    // Step 1: Translate text
    const translatedText = await translateText(text, sourceLang, targetLang);
    console.log(`🌐 Translated: "${translatedText.substring(0, 50)}..."`);
    
    // Step 2: Generate TTS audio
    if (!CARTESIA_API_KEY) {
      // Return translated text without audio if no API key
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
      translatedText: text // Return original as fallback
    });
  }
};
