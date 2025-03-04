
import { useRef, useState, useEffect } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { generateChatResponse, ChatMessage } from '@/services/openai';
import { textToSpeech, cacheAudio, getCachedAudio } from '@/services/elevenlabs';
import { toast } from 'sonner';
import type { 
  SpeechRecognition, 
  SpeechRecognitionEvent, 
  SpeechRecognitionErrorEvent 
} from '../types/speech-recognition.d.ts';

interface SimonProps {
  splineRef: React.MutableRefObject<any>;
}

// Claves API precargadas
const OPENAI_API_KEY = "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";
const ELEVENLABS_API_KEY = "sk_45d3e665137c012665d22e754828f2e4451b6eca216b1bf6";
const ELEVENLABS_VOICE_ID = "N2lVS1w4EtoT3dr4eOWO"; // Callum por defecto

export function Simon({ splineRef }: SimonProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [initialized, setInitialized] = useState(false);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Mensaje de bienvenida
  const welcomeMessage = "Hola, bienvenido a Nexa Digital. Mi nombre es Simón, ¿cómo puedo ayudarte hoy?";

  useEffect(() => {
    audioRef.current = new Audio();
    
    // Iniciar automáticamente al cargar el componente
    if (!initialized) {
      setTimeout(() => {
        setInitialized(true);
        playResponse(welcomeMessage);
        // Después de que termine de hablar, iniciará la escucha
      }, 1000);
    }
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Cuando termine de hablar, inicia la escucha
  useEffect(() => {
    if (initialized && !isSpeaking && !isListening) {
      startListening();
    }
  }, [initialized, isSpeaking, isListening]);

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
      
      // Reintentar la escucha después de un error
      setTimeout(() => {
        if (!isSpeaking) {
          startListening();
        }
      }, 1000);
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
      
      // Reiniciar la escucha automáticamente si no está hablando
      setTimeout(() => {
        if (!isSpeaking) {
          startListening();
        }
      }, 500);
    };

    recognitionRef.current.start();
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

      const aiResponse = await generateChatResponse(messages, OPENAI_API_KEY);
      setResponse(aiResponse);
      
      playResponse(aiResponse);
    } catch (error) {
      console.error('Error processing speech:', error);
      triggerAnimation('idle');
      
      // Si hay un error, reiniciamos la escucha
      setTimeout(() => {
        if (!isListening) {
          startListening();
        }
      }, 1000);
    }
  };

  const playResponse = async (text: string) => {
    try {
      setIsSpeaking(true);
      triggerAnimation('talking');
      
      let audioData = getCachedAudio(text);
      
      if (!audioData) {
        audioData = await textToSpeech(text, ELEVENLABS_VOICE_ID, ELEVENLABS_API_KEY);
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
          
          // Reiniciar la escucha después de hablar
          setTimeout(() => {
            if (!isListening) {
              startListening();
            }
          }, 500);
        };
        
        audioRef.current.play();
      } else {
        setIsSpeaking(false);
        triggerAnimation('idle');
        
        // Si hay un error al reproducir, reiniciamos la escucha
        setTimeout(() => {
          if (!isListening) {
            startListening();
          }
        }, 500);
      }
    } catch (error) {
      console.error('Error playing response:', error);
      setIsSpeaking(false);
      triggerAnimation('idle');
      
      // Si hay un error, reiniciamos la escucha
      setTimeout(() => {
        if (!isListening) {
          startListening();
        }
      }, 1000);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div className={`rounded-full w-3 h-3 ${isListening ? 'bg-red-500 animate-pulse' : isSpeaking ? 'bg-blue-500 animate-pulse' : 'bg-green-500'}`}></div>
        
        <div className="text-sm text-white/80">
          {isListening ? 'Escuchando...' : isSpeaking ? 'Hablando...' : 'Listo para escuchar'}
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
    </div>
  );
}
