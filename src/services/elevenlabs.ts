
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
const audioCache = new Map<string, {data: ArrayBuffer, timestamp: number, usageCount: number}>();

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

// Fallback responses in case of API failure
const FALLBACK_RESPONSES: Record<string, ArrayBuffer> = {};

// Stream audio chunks as they arrive to reduce latency
async function streamAudioResponse(
  response: Response, 
  onProgress?: (progress: number) => void
): Promise<ArrayBuffer> {
  if (!response.body) {
    throw new Error('No response body from ElevenLabs');
  }
  
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedLength = 0;
  let startedPlaying = false;
  
  if (onProgress) onProgress(60); // Audio generation started
  
  while (true) {
    const { done, value } = await reader.read();
    
    if (done) {
      break;
    }
    
    chunks.push(value);
    receivedLength += value.length;
    
    // When we have enough data to start playing, update progress
    if (!startedPlaying && chunks.length >= 2) {
      startedPlaying = true;
      if (onProgress) onProgress(80);
    }
  }
  
  // Concatenate chunks into a single ArrayBuffer
  const resultBuffer = new Uint8Array(receivedLength);
  let position = 0;
  
  for (const chunk of chunks) {
    resultBuffer.set(chunk, position);
    position += chunk.length;
  }
  
  if (onProgress) onProgress(95);
  return resultBuffer.buffer;
}

export async function textToSpeech(
  text: string, 
  voiceId: string, 
  apiKey: string,
  onProgress?: (progress: number) => void,
  retryCount = 0
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
    if (onProgress) onProgress(50);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('ElevenLabs API error:', errorData);
      throw new Error('Error generating speech');
    }

    // Use streaming to process audio as it arrives
    const audioData = await streamAudioResponse(response, onProgress);
    
    console.log("Voice synthesis successful");
    
    // Cache the response
    cacheAudio(text, audioData);
    
    // Complete progress
    if (onProgress) onProgress(100);
    
    return audioData;
  } catch (error) {
    console.error('Error calling ElevenLabs:', error);
    
    // Retry logic with exponential backoff
    if (retryCount < 2) {
      console.log(`Retrying ElevenLabs call... (Attempt ${retryCount + 1})`);
      const backoffTime = Math.pow(2, retryCount) * 500; // 500ms, 1000ms
      
      await new Promise(resolve => setTimeout(resolve, backoffTime));
      return textToSpeech(text, voiceId, apiKey, onProgress, retryCount + 1);
    }
    
    toast.error('Error generating voice');
    
    // Try to get a fallback response
    const fallbackMessage = "Disculpa, hay un problema con mi voz.";
    const fallbackAudio = getCachedAudio(fallbackMessage);
    
    if (fallbackAudio) {
      return fallbackAudio;
    }
    
    return null;
  }
}

export function cacheAudio(text: string, audioData: ArrayBuffer) {
  console.log("Saving audio to cache");
  
  // Remove least used entries if cache is too large
  if (audioCache.size >= MAX_CACHE_SIZE) {
    // Sort based on usage count first, then timestamp for ties
    const sortedEntries = [...audioCache.entries()]
      .sort((a, b) => {
        if (a[1].usageCount === b[1].usageCount) {
          return a[1].timestamp - b[1].timestamp;
        }
        return a[1].usageCount - b[1].usageCount;
      });
    
    // Remove the least used entry
    audioCache.delete(sortedEntries[0][0]);
  }
  
  audioCache.set(text, {
    data: audioData,
    timestamp: Date.now(),
    usageCount: 1
  });
}

export function getCachedAudio(text: string): ArrayBuffer | undefined {
  const cached = audioCache.get(text);
  if (cached) {
    console.log("Audio found in cache");
    // Update timestamp to keep frequently used responses fresh
    cached.timestamp = Date.now();
    cached.usageCount++;
    return cached.data;
  }
  return undefined;
}

// Function to clear cache - useful for clearing potential stuck responses
export function clearAudioCache() {
  audioCache.clear();
  console.log("Audio cache cleared");
}

// Store some emergency fallback responses in memory
export function initializeFallbackResponses(voiceId: string, apiKey: string) {
  const fallbackPhrases = [
    "Disculpa, hay un problema con mi voz.",
    "Un momento, estoy teniendo dificultades técnicas.",
    "Perdona la interrupción, estoy procesando tu solicitud."
  ];
  
  FALLBACK_RESPONSES["default"] = new ArrayBuffer(0); // Empty buffer as last resort
  
  fallbackPhrases.forEach(phrase => {
    if (getCachedAudio(phrase)) return; // Already cached
    
    // Add to pre-cache queue - will be processed in the background
    preloadCommonResponses(voiceId, apiKey);
  });
}

// Pre-buffer common responses for instant playback
export async function preloadCommonResponses(voiceId: string, apiKey: string) {
  const commonPhrases = [
    "Un momento, estoy pensando.",
    "¿Puedes repetir eso, por favor?",
    "No entendí bien, ¿puedes decirlo de otra manera?",
    "Hola, ¿en qué puedo ayudarte?",
    "Disculpa por la interrupción.",
    "Disculpa, hay un problema con mi voz." // Important fallback
  ];
  
  // Prioritize loading the fallback message first
  const priorityFirst = [...commonPhrases].sort((a, b) => {
    if (a.includes("hay un problema")) return -1;
    if (b.includes("hay un problema")) return 1;
    return 0;
  });
  
  for (const phrase of priorityFirst) {
    if (!getCachedAudio(phrase)) {
      try {
        const audioData = await textToSpeech(phrase, voiceId, apiKey);
        if (audioData) {
          cacheAudio(phrase, audioData);
          console.log(`Preloaded: "${phrase}"`);
          
          // Store essential fallbacks in the emergency collection
          if (phrase.includes("hay un problema")) {
            FALLBACK_RESPONSES["default"] = audioData;
          }
        }
      } catch (error) {
        console.error(`Failed to preload: "${phrase}"`, error);
      }
    }
  }
}
