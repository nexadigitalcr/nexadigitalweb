
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
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Mensaje de bienvenida
  const welcomeMessage = "Hola, bienvenido a Nexa Digital. Mi nombre es Simón, ¿cómo puedo ayudarte hoy?";

  // Comprobar y solicitar permisos de micrófono
  const requestMicrophonePermission = async () => {
    try {
      console.log("Solicitando permisos de micrófono");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Cerrar el stream para liberar el micrófono
      stream.getTracks().forEach(track => track.stop());
      setMicPermissionGranted(true);
      console.log("Permisos de micrófono concedidos");
      return true;
    } catch (error) {
      console.error("Error al solicitar permisos de micrófono:", error);
      toast.error("Para que Simón pueda escucharte, necesitas permitir el acceso al micrófono");
      return false;
    }
  };

  useEffect(() => {
    audioRef.current = new Audio();
    
    // Inicialización al cargar el componente
    const initializeSimon = async () => {
      if (!initialized) {
        console.log("Inicializando Simón");
        const hasPermission = await requestMicrophonePermission();
        
        if (hasPermission) {
          setInitialized(true);
          setTimeout(() => {
            playResponse(welcomeMessage);
          }, 1000);
        } else {
          toast.error("Para interactuar con Simón, por favor permite el acceso al micrófono");
        }
      }
    };
    
    initializeSimon();
    
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
    if (initialized && !isSpeaking && !isListening && micPermissionGranted) {
      console.log("Iniciando escucha después de hablar");
      startListening();
    }
  }, [initialized, isSpeaking, isListening, micPermissionGranted]);

  const triggerAnimation = (animationName: string) => {
    if (splineRef.current) {
      try {
        console.log("Buscando animación:", animationName);
        const obj = splineRef.current.findObjectByName(animationName);
        if (obj) {
          console.log("Animación encontrada, disparando:", animationName);
          splineRef.current.emitEvent('mouseDown', obj);
        } else {
          console.log("Animación no encontrada:", animationName);
        }
      } catch (error) {
        console.error("Error al disparar animación Spline:", error);
      }
    } else {
      console.log("splineRef.current no está disponible");
    }
  };

  const startListening = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error('Tu navegador no soporta reconocimiento de voz');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    // Si ya existe una instancia, la detenemos primero
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.lang = 'es-ES';
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;

    recognitionRef.current.onstart = () => {
      console.log("Reconocimiento de voz iniciado");
      setIsListening(true);
      setTranscript('');
      triggerAnimation('listening');
    };

    recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      console.log("Texto reconocido:", transcript);
      setTranscript(transcript);
      processSpeech(transcript);
    };

    recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Error de reconocimiento de voz:', event.error);
      setIsListening(false);
      triggerAnimation('idle');
      
      // Reintentar la escucha después de un error
      if (event.error === 'not-allowed') {
        toast.error("Permiso de micrófono denegado. Por favor, permite el acceso al micrófono.");
        setMicPermissionGranted(false);
        // Intentar solicitar permisos de micrófono de nuevo
        setTimeout(() => requestMicrophonePermission(), 2000);
      } else {
        setTimeout(() => {
          if (!isSpeaking && micPermissionGranted) {
            startListening();
          }
        }, 1000);
      }
    };

    recognitionRef.current.onend = () => {
      console.log("Reconocimiento de voz finalizado");
      setIsListening(false);
      
      // Reiniciar la escucha automáticamente si no está hablando
      setTimeout(() => {
        if (!isSpeaking && micPermissionGranted) {
          console.log("Reiniciando escucha automáticamente");
          startListening();
        }
      }, 500);
    };

    try {
      console.log("Iniciando reconocimiento de voz");
      recognitionRef.current.start();
    } catch (error) {
      console.error("Error al iniciar reconocimiento de voz:", error);
      // Si hay un error al iniciar, intentamos reiniciar después de un tiempo
      setTimeout(() => {
        if (!isSpeaking && micPermissionGranted) {
          startListening();
        }
      }, 1000);
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

      console.log("Enviando mensaje a OpenAI:", text);
      const aiResponse = await generateChatResponse(messages, OPENAI_API_KEY);
      console.log("Respuesta recibida de OpenAI:", aiResponse);
      setResponse(aiResponse);
      
      playResponse(aiResponse);
    } catch (error) {
      console.error('Error al procesar el texto:', error);
      triggerAnimation('idle');
      
      // Si hay un error, reiniciamos la escucha
      setTimeout(() => {
        if (!isListening && micPermissionGranted) {
          startListening();
        }
      }, 1000);
    }
  };

  const playResponse = async (text: string) => {
    try {
      console.log("Reproduciendo respuesta:", text);
      setIsSpeaking(true);
      triggerAnimation('talking');
      
      let audioData = getCachedAudio(text);
      
      if (!audioData) {
        console.log("Audio no en caché, generando nuevo...");
        audioData = await textToSpeech(text, ELEVENLABS_VOICE_ID, ELEVENLABS_API_KEY);
        if (audioData) {
          cacheAudio(text, audioData);
        }
      } else {
        console.log("Usando audio en caché");
      }
      
      if (audioData && audioRef.current) {
        const blob = new Blob([audioData], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        
        audioRef.current.src = url;
        audioRef.current.onended = () => {
          console.log("Reproducción de audio finalizada");
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
          triggerAnimation('idle');
          
          // Reiniciar la escucha después de hablar
          setTimeout(() => {
            if (!isListening && micPermissionGranted) {
              startListening();
            }
          }, 500);
        };
        
        try {
          await audioRef.current.play();
        } catch (error) {
          console.error("Error al reproducir audio:", error);
          setIsSpeaking(false);
          triggerAnimation('idle');
          
          if (error instanceof DOMException && error.name === 'NotAllowedError') {
            console.log("Reproducción automática bloqueada. Solicitando interacción del usuario.");
            toast.error("Haz clic en la pantalla para permitir que Simón hable");
            
            // Agregar un listener para iniciar la reproducción con interacción del usuario
            const unlockAudio = () => {
              document.removeEventListener('click', unlockAudio);
              if (audioRef.current) {
                audioRef.current.play()
                  .then(() => console.log("Audio desbloqueado y reproduciendo"))
                  .catch(err => console.error("Error después de desbloqueo:", err));
              }
            };
            
            document.addEventListener('click', unlockAudio);
          } else {
            // Si hay un error al reproducir, reiniciamos la escucha
            setTimeout(() => {
              if (!isListening && micPermissionGranted) {
                startListening();
              }
            }, 500);
          }
        }
      } else {
        console.error("No se pudo obtener audio para reproducir");
        setIsSpeaking(false);
        triggerAnimation('idle');
        
        // Si hay un error al reproducir, reiniciamos la escucha
        setTimeout(() => {
          if (!isListening && micPermissionGranted) {
            startListening();
          }
        }, 500);
      }
    } catch (error) {
      console.error('Error al reproducir respuesta:', error);
      setIsSpeaking(false);
      triggerAnimation('idle');
      
      // Si hay un error, reiniciamos la escucha
      setTimeout(() => {
        if (!isListening && micPermissionGranted) {
          startListening();
        }
      }, 1000);
    }
  };

  const handleManualStart = async () => {
    if (!initialized) {
      const hasPermission = await requestMicrophonePermission();
      if (hasPermission) {
        setInitialized(true);
        playResponse(welcomeMessage);
      }
    } else if (!isListening && !isSpeaking) {
      startListening();
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4" onClick={handleManualStart}>
      <div className="flex items-center justify-between">
        <div className={`rounded-full w-3 h-3 ${isListening ? 'bg-red-500 animate-pulse' : isSpeaking ? 'bg-blue-500 animate-pulse' : 'bg-green-500'}`}></div>
        
        <div className="text-sm text-white/80">
          {isListening ? 'Escuchando...' : isSpeaking ? 'Hablando...' : micPermissionGranted ? 'Listo para escuchar' : 'Necesita permiso de micrófono'}
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
      
      {!micPermissionGranted && (
        <Button 
          onClick={requestMicrophonePermission}
          className="mt-2 bg-blue-600 hover:bg-blue-700"
        >
          <Mic className="w-4 h-4 mr-2" />
          Permitir micrófono
        </Button>
      )}
    </div>
  );
}
