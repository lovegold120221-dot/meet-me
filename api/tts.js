// Translation + Cartesia TTS API
const axios = require('axios');

const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY;
const CARTESIA_VOICE_ID = process.env.CARTESIA_VOICE_ID || '9c7e6604-52c6-424a-9f9f-2c4ad89f3bb9';

// Simple translation using LibreTranslate (free, no API key needed for basic use)
// Or you can use Google Translate, DeepL, etc.
async function translateText(text, sourceLang = 'auto', targetLang = 'en') {
  try {
    // Using LibreTranslate public instance (rate limited, for production use your own)
    const response = await axios.post('https://libretranslate.de/translate', {
      q: text,
      source: sourceLang,
      target: targetLang,
      format: 'text'
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });
    
    return response.data.translatedText;
  } catch (error) {
    console.error('Translation error:', error.message);
    return text; // Fallback to original text
  }
}

// Cartesia TTS
async function generateTTS(text) {
  if (!CARTESIA_API_KEY) {
    throw new Error('CARTESIA_API_KEY not configured');
  }
  
  try {
    const response = await axios.post('https://api.cartesia.ai/tts/bytes', {
      transcript: text,
      voice: {
        mode: 'id',
        id: CARTESIA_VOICE_ID
      },
      output_format: {
        container: 'mp3',
        encoding: 'mp3',
        sample_rate: 24000
      },
      model: process.env.CARTESIA_MODEL_ID || 'sonic-3-latest'
    }, {
      headers: {
        'X-API-Key': CARTESIA_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
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
