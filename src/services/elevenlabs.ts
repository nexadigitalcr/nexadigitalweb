
import { toast } from "sonner";

export async function textToSpeech(text: string, voiceId: string, apiKey: string): Promise<ArrayBuffer | null> {
  try {
    console.log("Llamando a ElevenLabs API para síntesis de voz");
    
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
          stability: 0.3,          // Lower stability for more natural variations
          similarity_boost: 0.85,  // Higher similarity for better voice matching
          style: 0.5,              // Add some style variation
          use_speaker_boost: true  // Improve clarity
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('ElevenLabs API error:', errorData);
      throw new Error('Error generating speech');
    }

    console.log("Síntesis de voz exitosa");
    return await response.arrayBuffer();
  } catch (error) {
    console.error('Error llamando a ElevenLabs:', error);
    toast.error('Error generando voz');
    return null;
  }
}

// Cache para almacenar datos de audio y evitar llamadas API repetidas
const audioCache = new Map<string, ArrayBuffer>();

export function cacheAudio(text: string, audioData: ArrayBuffer) {
  console.log("Guardando audio en caché");
  audioCache.set(text, audioData);
}

export function getCachedAudio(text: string): ArrayBuffer | undefined {
  const cached = audioCache.get(text);
  if (cached) {
    console.log("Audio encontrado en caché");
  }
  return cached;
}
