
import { toast } from "sonner";

export async function textToSpeech(text: string, voiceId: string, apiKey: string): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('ElevenLabs API error:', errorData);
      throw new Error('Error generating speech');
    }

    return await response.arrayBuffer();
  } catch (error) {
    console.error('Error calling ElevenLabs:', error);
    toast.error('Error generando voz');
    return null;
  }
}

// Cache to store audio data and avoid repeated API calls
const audioCache = new Map<string, ArrayBuffer>();

export function cacheAudio(text: string, audioData: ArrayBuffer) {
  audioCache.set(text, audioData);
}

export function getCachedAudio(text: string): ArrayBuffer | undefined {
  return audioCache.get(text);
}
