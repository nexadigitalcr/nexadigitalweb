
import { toast } from "sonner";

export async function textToSpeech(text: string, voiceId: string, apiKey: string): Promise<ArrayBuffer | null> {
  try {
    console.log("Calling ElevenLabs API for voice synthesis");
    
    // Optimize text for speech synthesis
    const optimizedText = text
      .replace(/\s+/g, ' ')        // Replace multiple spaces with a single space
      .replace(/\n+/g, ' ')        // Replace newlines with spaces
      .trim();                     // Remove leading/trailing whitespace
    
    // Use smaller chunks for faster response
    const maxChunkLength = 300;
    
    // If text is too long, only synthesize the first part
    const speechText = optimizedText.length > maxChunkLength 
      ? optimizedText.substring(0, maxChunkLength) + '...' 
      : optimizedText;
    
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        text: speechText,
        model_id: 'eleven_turbo_v2',  // Using faster Turbo model for quicker synthesis
        voice_settings: {
          stability: 0.4,          // Higher stability for more consistent output
          similarity_boost: 0.75,  // Good balance of similarity and performance
          style: 0.2,              // Lower style for more natural speech
          use_speaker_boost: true  // Improve clarity
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('ElevenLabs API error:', errorData);
      throw new Error('Error generating speech');
    }

    console.log("Voice synthesis successful");
    return await response.arrayBuffer();
  } catch (error) {
    console.error('Error calling ElevenLabs:', error);
    toast.error('Error generating voice');
    return null;
  }
}

// Audio cache with size limit to prevent memory issues
const MAX_CACHE_SIZE = 20;
const audioCache = new Map<string, {data: ArrayBuffer, timestamp: number}>();

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
    return cached.data;
  }
  return undefined;
}
