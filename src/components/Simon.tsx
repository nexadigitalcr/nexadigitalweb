
import { useRef, useState, useEffect } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { generateChatResponse, ChatMessage } from '@/services/openai';
import { textToSpeech, cacheAudio, getCachedAudio } from '@/services/elevenlabs';
import { toast } from 'sonner';
// Import types explicitly - this ensures TypeScript recognizes them
import type {} from '../types/speech-recognition.d.ts';

interface SimonProps {
  splineRef: React.MutableRefObject<any>;
}

export function Simon({ splineRef }: SimonProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [apiKeys, setApiKeys] = useState({
    openai: localStorage.getItem('openai_api_key') || '',
    elevenlabs: localStorage.getItem('elevenlabs_api_key') || ''
  });
  const [voiceId, setVoiceId] = useState(localStorage.getItem('elevenlabs_voice_id') || 'N2lVS1w4EtoT3dr4eOWO'); // Default to Callum voice
  
  // Use a more specific type to satisfy TypeScript
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio();
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Interaction with Spline object
  const triggerAnimation = (animationName: string) => {
    if (splineRef.current) {
      try {
        const obj = splineRef.current.findObjectByName(animationName);
        if (obj) {
          console.log("Triggering animation:", animationName);
          splineRef.current.emitEvent('mouseDown', obj);
        } else {
          console.log("Animation not found:", animationName);
        }
      } catch (error) {
        console.error("Error triggering Spline animation:", error);
      }
    }
  };

  const startListening = () => {
    if (!apiKeys.openai || !apiKeys.elevenlabs) {
      toast.error('Por favor, configura tus API keys primero');
      return;
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error('Tu navegador no soporta reconocimiento de voz');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.lang = 'es-ES';
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;

    recognitionRef.current.onstart = () => {
      setIsListening(true);
      setTranscript('');
      triggerAnimation('listening');
    };

    recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setTranscript(transcript);
      processSpeech(transcript);
    };

    recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      triggerAnimation('idle');
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      triggerAnimation('idle');
    }
  };

  const processSpeech = async (text: string) => {
    if (!text.trim()) return;

    try {
      triggerAnimation('thinking');
      
      const messages: ChatMessage[] = [
        { 
          role: 'system', 
          content: 'Eres Simón, un asistente virtual de Nexa Digital. Eres amigable, profesional y siempre dispuesto a ayudar. Mantén tus respuestas breves y concisas, ideales para ser leídas en voz alta. Usa un tono conversacional. Responde en español.'
        },
        { role: 'user', content: text }
      ];

      const aiResponse = await generateChatResponse(messages, apiKeys.openai);
      setResponse(aiResponse);
      
      // Play the response
      playResponse(aiResponse);
    } catch (error) {
      console.error('Error processing speech:', error);
      triggerAnimation('idle');
    }
  };

  const playResponse = async (text: string) => {
    try {
      setIsSpeaking(true);
      triggerAnimation('talking');
      
      let audioData = getCachedAudio(text);
      
      if (!audioData) {
        audioData = await textToSpeech(text, voiceId, apiKeys.elevenlabs);
        if (audioData) {
          cacheAudio(text, audioData);
        }
      }
      
      if (audioData && audioRef.current) {
        const blob = new Blob([audioData], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        
        audioRef.current.src = url;
        audioRef.current.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
          triggerAnimation('idle');
        };
        
        audioRef.current.play();
      } else {
        setIsSpeaking(false);
        triggerAnimation('idle');
      }
    } catch (error) {
      console.error('Error playing response:', error);
      setIsSpeaking(false);
      triggerAnimation('idle');
    }
  };

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setApiKeys(prev => ({ ...prev, [name]: value }));
    localStorage.setItem(`${name}_api_key`, value);
  };

  const handleVoiceIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVoiceId(e.target.value);
    localStorage.setItem('elevenlabs_voice_id', e.target.value);
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <Button 
          variant={isListening ? "destructive" : "default"}
          className="rounded-full w-12 h-12 flex items-center justify-center"
          onClick={isListening ? stopListening : startListening}
          disabled={isSpeaking}
        >
          {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </Button>
        
        <div className="text-sm text-white/80">
          {isListening ? 'Escuchando...' : isSpeaking ? 'Hablando...' : 'Listo para hablar'}
        </div>
      </div>
      
      {transcript && (
        <div className="mt-2 p-2 bg-neutral-800/50 rounded text-sm text-white/70">
          <strong>Tú:</strong> {transcript}
        </div>
      )}
      
      {response && (
        <div className="mt-2 p-2 bg-blue-900/30 rounded text-sm text-white/90">
          <strong>Simón:</strong> {response}
        </div>
      )}
      
      <div className="mt-4 space-y-2">
        <div className="text-xs text-neutral-400 mb-1">Configuración</div>
        <input
          type="password"
          name="openai"
          placeholder="OpenAI API Key"
          value={apiKeys.openai}
          onChange={handleApiKeyChange}
          className="w-full p-2 bg-neutral-800 rounded text-sm"
        />
        <input
          type="password"
          name="elevenlabs"
          placeholder="ElevenLabs API Key"
          value={apiKeys.elevenlabs}
          onChange={handleApiKeyChange}
          className="w-full p-2 bg-neutral-800 rounded text-sm"
        />
        <input
          type="text"
          placeholder="ElevenLabs Voice ID"
          value={voiceId}
          onChange={handleVoiceIdChange}
          className="w-full p-2 bg-neutral-800 rounded text-sm"
        />
      </div>
    </div>
  );
}
