import { toast } from "sonner";

// Optimized settings for more natural Latin Spanish voice
const VOICE_SETTINGS = {
  stability: 0.35,        // Reduced for more natural inflection
  similarity_boost: 0.75, // Increased for more consistent voice
  style: 0.45,            // Slightly increased for more expressiveness
  use_speaker_boost: true // Improve clarity
};

// Improved audio cache with size limit and TTL
const MAX_CACHE_SIZE = 30; // Increased from 20
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes in milliseconds
const audioCache = new Map<string, {data: ArrayBuffer, timestamp: number}>();

// Function to clear expired cache entries
function cleanExpiredCache() {
  const now = Date.now();
  const expiredTime = now - CACHE_TTL;
  
  // Remove entries older than TTL
  for (const [key, value] of audioCache.entries()) {
    if (value.timestamp < expiredTime) {
      audioCache.delete(key);
    }
  }
}

export async function textToSpeech(
  text: string, 
  voiceId: string, 
  apiKey: string,
  onProgress?: (progress: number) => void
): Promise<ArrayBuffer | null> {
  try {
    console.log("Calling ElevenLabs API for voice synthesis");
    
    // Check cache first (clean expired entries periodically)
    if (audioCache.size > 0) {
      cleanExpiredCache();
      const cached = getCachedAudio(text);
      if (cached) {
        if (onProgress) onProgress(100);
        return cached;
      }
    }
    
    // If not in cache, notify 10% progress
    if (onProgress) onProgress(10);
    
    // Optimize text for speech synthesis
    const optimizedText = text
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .trim();
    
    // Break longer text into smaller chunks for faster response
    const maxChunkLength = 300; // Increased from 250 for more natural sentences
    
    // If text is too long, only synthesize the first part
    const speechText = optimizedText.length > maxChunkLength 
      ? optimizedText.substring(0, maxChunkLength) + '...' 
      : optimizedText;
    
    // Progress update
    if (onProgress) onProgress(30);
    
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        text: speechText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: VOICE_SETTINGS
      })
    });

    // Progress update
    if (onProgress) onProgress(70);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('ElevenLabs API error:', errorData);
      throw new Error('Error generating speech');
    }

    // Final progress update
    if (onProgress) onProgress(90);

    const audioData = await response.arrayBuffer();
    
    console.log("Voice synthesis successful");
    
    // Cache the response
    cacheAudio(text, audioData);
    
    // Complete progress
    if (onProgress) onProgress(100);
    
    return audioData;
  } catch (error) {
    console.error('Error calling ElevenLabs:', error);
    toast.error('Error generating voice');
    return null;
  }
}

export function cacheAudio(text: string, audioData: ArrayBuffer) {
  console.log("Saving audio to cache");
  
  // Remove oldest entries if cache is too large
  if (audioCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = [...audioCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
    audioCache.delete(oldestKey);
  }
  
  audioCache.set(text, {
    data: audioData,
    timestamp: Date.now()
  });
}

export function getCachedAudio(text: string): ArrayBuffer | undefined {
  const cached = audioCache.get(text);
  if (cached) {
    console.log("Audio found in cache");
    // Update timestamp to keep frequently used responses fresh
    cached.timestamp = Date.now();
    return cached.data;
  }
  return undefined;
}

// Function to clear cache - useful for clearing potential stuck responses
export function clearAudioCache() {
  audioCache.clear();
  console.log("Audio cache cleared");
}

// Pre-buffer common responses for instant playback
export async function preloadCommonResponses(voiceId: string, apiKey: string) {
  const commonPhrases = [
    "Un momento, estoy pensando.",
    "¿Puedes repetir eso, por favor?",
    "No entendí bien, ¿puedes decirlo de otra manera?",
    "Hola, ¿en qué puedo ayudarte?",
    "Disculpa por la interrupción."
  ];
  
  for (const phrase of commonPhrases) {
    if (!getCachedAudio(phrase)) {
      try {
        const audioData = await textToSpeech(phrase, voiceId, apiKey);
        if (audioData) {
          cacheAudio(phrase, audioData);
          console.log(`Preloaded: "${phrase}"`);
        }
      } catch (error) {
        console.error(`Failed to preload: "${phrase}"`, error);
      }
    }
  }
}
