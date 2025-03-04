
import { useRef, useState, useEffect, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
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

// Preloaded API Keys
const OPENAI_API_KEY = "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";

// ElevenLabs (Latin Spanish Voice)
const ELEVENLABS_API_KEY = "sk_45d3e665137c012665d22e754828f2e4451b6eca216b1bf6";
const ELEVENLABS_VOICE_ID = "dlGxemPxFMTY7iXagmOj"; // Updated to the Latin Spanish voice ID provided

// Added Assistant ID
const ASSISTANT_ID = "asst_2c09hq5g7hu4c6s4tSqy1suy";

export function Simon({ splineRef }: SimonProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [processingInput, setProcessingInput] = useState(false);
  const [status, setStatus] = useState<'idle' | 'listening' | 'processing' | 'speaking'>('idle');
  const [dots, setDots] = useState('');
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const dotsIntervalRef = useRef<number | null>(null);
  const conversationContext = useRef<ChatMessage[]>([
    { 
      role: 'system', 
      content: 'Eres Simón, un asistente virtual de Nexa Digital. Eres amigable, profesional y siempre dispuesto a ayudar. Mantén tus respuestas breves y concisas, ideales para ser leídas en voz alta (máximo 2-3 oraciones). Usa un tono conversacional y natural. Responde en español de América Latina, usando expresiones naturales y coloquiales.'
    }
  ]);

  // Mensaje de bienvenida corto y directo
  const welcomeMessage = "Hola, soy Simón de Nexa Digital. ¿En qué puedo ayudarte hoy?";

  // Animating dots for status indicators
  useEffect(() => {
    if (status !== 'idle') {
      if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
      
      dotsIntervalRef.current = window.setInterval(() => {
        setDots((prev) => {
          if (prev.length >= 3) return '';
          return prev + '.';
        });
      }, 500);
      
      return () => {
        if (dotsIntervalRef.current) clearInterval(dotsIntervalRef.current);
      };
    }
  }, [status]);

  // Comprobar y solicitar permisos de micrófono - mejorado para ser más rápido
  const requestMicrophonePermission = useCallback(async () => {
    try {
      console.log("Solicitando permisos de micrófono");
      toast.info("Conectando micrófono...");
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      // Cerrar el stream para liberar el micrófono
      stream.getTracks().forEach(track => track.stop());
      setMicPermissionGranted(true);
      console.log("Permisos de micrófono concedidos");
      return true;
    } catch (error) {
      console.error("Error al solicitar permisos de micrófono:", error);
      
      // Mostrar mensaje específico según el tipo de error
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          toast.error("Permiso de micrófono denegado");
        } else if (error.name === 'NotFoundError') {
          toast.error("No se detectó micrófono");
        } else {
          toast.error(`Error: ${error.name}`);
        }
      } else {
        toast.error("Error al acceder al micrófono");
      }
      
      return false;
    }
  }, []);

  useEffect(() => {
    audioRef.current = new Audio();
    
    // Inicialización al cargar el componente
    const initializeSimon = async () => {
      if (!initialized) {
        console.log("Inicializando Simón");
        
        setTimeout(async () => {
          const hasPermission = await requestMicrophonePermission();
          
          if (hasPermission) {
            setInitialized(true);
            setTimeout(() => {
              playResponse(welcomeMessage);
            }, 500);
          }
        }, 800);
      }
    };
    
    initializeSimon();
    
    // Función para verificar si estamos en HTTPS
    const checkHttps = () => {
      if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        toast.error('Esta aplicación requiere HTTPS');
      }
    };
    
    checkHttps();
    
    // Manejar el desbloqueo de audio en Safari/iOS
    const unlockAudio = () => {
      if (audioRef.current) {
        audioRef.current.play()
          .then(() => {
            audioRef.current?.pause();
            document.removeEventListener('touchstart', unlockAudio);
            document.removeEventListener('click', unlockAudio);
          })
          .catch(err => console.log("Audio no desbloqueado aún:", err));
      }
    };
    
    document.addEventListener('touchstart', unlockAudio, { once: true });
    document.addEventListener('click', unlockAudio, { once: true });
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (dotsIntervalRef.current) {
        clearInterval(dotsIntervalRef.current);
      }
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('click', unlockAudio);
    };
  }, [requestMicrophonePermission]);

  // Cuando termine de hablar, inicia la escucha - con mejor manejo de estados
  useEffect(() => {
    if (initialized && !isSpeaking && !isListening && micPermissionGranted && !processingInput) {
      console.log("Iniciando escucha después de hablar");
      const timer = setTimeout(() => {
        startListening();
      }, 300); // Reduced delay for more responsive interactions
      
      return () => clearTimeout(timer);
    }
  }, [initialized, isSpeaking, isListening, micPermissionGranted, processingInput]);

  const triggerAnimation = useCallback((animationName: string) => {
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
        console.error("Error al disparar animación:", error);
      }
    }
  }, [splineRef]);

  const startListening = useCallback(() => {
    // Verificar si el reconocimiento de voz está disponible
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error('Tu navegador no soporta reconocimiento de voz');
      return;
    }

    // Verificar si el micrófono está permitido
    if (!micPermissionGranted) {
      console.log("No hay permiso de micrófono, solicitando...");
      requestMicrophonePermission().then(granted => {
        if (granted) {
          setTimeout(() => startListening(), 300);
        }
      });
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    // Si ya existe una instancia, la detenemos primero
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.error("Error al detener reconocimiento previo:", e);
      }
    }
    
    try {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = 'es-ES';
      recognitionRef.current.continuous = false; // Changed to false for more immediate results
      recognitionRef.current.interimResults = true; // Changed to true for real-time feedback
      recognitionRef.current.maxAlternatives = 1;

      recognitionRef.current.onstart = () => {
        console.log("Reconocimiento de voz iniciado");
        setIsListening(true);
        setStatus('listening');
        triggerAnimation('listening');
      };

      recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        const currentTranscript = Array.from(event.results)
          .map(result => result[0].transcript)
          .join('');
        
        console.log("Transcripción:", currentTranscript);
        
        // Process final results immediately
        if (event.results[0].isFinal) {
          processSpeech(currentTranscript);
          recognitionRef.current?.stop(); // Stop to immediately process
        }
      };

      recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Error de reconocimiento:', event.error);
        setIsListening(false);
        setStatus('idle');
        triggerAnimation('idle');
        
        if (event.error === 'not-allowed') {
          toast.error("Permiso de micrófono denegado");
          setMicPermissionGranted(false);
          setTimeout(() => requestMicrophonePermission(), 2000);
        } else if (event.error === 'audio-capture') {
          toast.error("No se pudo capturar audio");
          setTimeout(() => requestMicrophonePermission(), 1500);
        } else if (event.error === 'no-speech') {
          console.log("No se detectó voz, reiniciando...");
          if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = window.setTimeout(() => {
            if (!isSpeaking && micPermissionGranted && !processingInput) {
              startListening();
            }
          }, 800);
        } else {
          if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = window.setTimeout(() => {
            if (!isSpeaking && micPermissionGranted && !processingInput) {
              startListening();
            }
          }, 1500);
        }
      };

      recognitionRef.current.onend = () => {
        console.log("Reconocimiento de voz finalizado");
        setIsListening(false);
        
        if (isSpeaking || processingInput) {
          console.log("No reiniciando escucha porque está procesando o hablando");
          return;
        }
        
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = window.setTimeout(() => {
          if (!isSpeaking && micPermissionGranted && !processingInput) {
            console.log("Reiniciando escucha automáticamente");
            startListening();
          }
        }, 800);
      };

      console.log("Iniciando reconocimiento de voz");
      recognitionRef.current.start();
    } catch (error) {
      console.error("Error crítico:", error);
      toast.error("Error de reconocimiento de voz");
      setStatus('idle');
      
      setTimeout(() => {
        if (!isSpeaking && micPermissionGranted && !processingInput) {
          startListening();
        }
      }, 2000);
    }
  }, [isSpeaking, micPermissionGranted, processingInput, requestMicrophonePermission, triggerAnimation]);

  const processSpeech = useCallback(async (text: string) => {
    if (!text.trim()) return;
    
    setProcessingInput(true);
    setStatus('processing');
    try {
      triggerAnimation('thinking');
      
      // Agregar mensaje del usuario al contexto de la conversación
      conversationContext.current.push({ role: 'user', content: text });
      
      // Mantener solo los últimos 5 mensajes para contexto (para respuestas más rápidas)
      if (conversationContext.current.length > 6) { // sistema + 5 últimos mensajes
        conversationContext.current = [
          conversationContext.current[0], // Mantener mensaje del sistema
          ...conversationContext.current.slice(-5) // Últimos 5 mensajes
        ];
      }

      console.log("Enviando mensaje a OpenAI:", text);
      const aiResponse = await generateChatResponse(conversationContext.current, OPENAI_API_KEY);
      console.log("Respuesta recibida:", aiResponse);
      
      // Agregar respuesta del asistente al contexto
      conversationContext.current.push({ role: 'assistant', content: aiResponse });
      
      playResponse(aiResponse);
    } catch (error) {
      console.error('Error al procesar:', error);
      triggerAnimation('idle');
      setProcessingInput(false);
      setStatus('idle');
      
      setTimeout(() => {
        if (!isListening && micPermissionGranted) {
          startListening();
        }
      }, 1000);
    }
  }, [triggerAnimation]);

  const playResponse = useCallback(async (text: string) => {
    if (muted) {
      console.log("Audio silenciado");
      setIsSpeaking(false);
      triggerAnimation('idle');
      setProcessingInput(false);
      setStatus('idle');
      
      setTimeout(() => {
        if (!isListening && micPermissionGranted) {
          startListening();
        }
      }, 500);
      return;
    }
    
    try {
      console.log("Reproduciendo respuesta");
      setIsSpeaking(true);
      setStatus('speaking');
      triggerAnimation('talking');
      
      let audioData = getCachedAudio(text);
      
      if (!audioData) {
        console.log("Generando nuevo audio");
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
          console.log("Reproducción finalizada");
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
          triggerAnimation('idle');
          setProcessingInput(false);
          setStatus('idle');
          
          setTimeout(() => {
            if (!isListening && micPermissionGranted) {
              startListening();
            }
          }, 300);
        };
        
        try {
          const playPromise = audioRef.current.play();
          
          if (playPromise !== undefined) {
            playPromise.catch(error => {
              console.error("Error al reproducir:", error);
              setIsSpeaking(false);
              triggerAnimation('idle');
              setProcessingInput(false);
              setStatus('idle');
              
              if (error.name === 'NotAllowedError') {
                toast.error("Haz clic para activar el audio", {
                  duration: 3000,
                });
                
                const unlockAudio = () => {
                  if (audioRef.current) {
                    audioRef.current.play()
                      .then(() => console.log("Audio desbloqueado"))
                      .catch(err => console.error("Error post-desbloqueo:", err));
                    document.removeEventListener('click', unlockAudio);
                  }
                };
                
                document.addEventListener('click', unlockAudio);
              } else {
                setTimeout(() => {
                  if (!isListening && micPermissionGranted) {
                    startListening();
                  }
                }, 800);
              }
            });
          }
        } catch (error) {
          console.error("Error crítico al reproducir:", error);
          setIsSpeaking(false);
          triggerAnimation('idle');
          setProcessingInput(false);
          setStatus('idle');
          
          setTimeout(() => {
            if (!isListening && micPermissionGranted) {
              startListening();
            }
          }, 800);
        }
      } else {
        console.error("No se pudo obtener audio");
        setIsSpeaking(false);
        triggerAnimation('idle');
        setProcessingInput(false);
        setStatus('idle');
        
        setTimeout(() => {
          if (!isListening && micPermissionGranted) {
            startListening();
          }
        }, 800);
      }
    } catch (error) {
      console.error('Error al reproducir respuesta:', error);
      setIsSpeaking(false);
      triggerAnimation('idle');
      setProcessingInput(false);
      setStatus('idle');
      
      setTimeout(() => {
        if (!isListening && micPermissionGranted) {
          startListening();
        }
      }, 800);
    }
  }, [muted, triggerAnimation, micPermissionGranted, isListening]);

  const handleManualStart = useCallback(async () => {
    if (!initialized) {
      const hasPermission = await requestMicrophonePermission();
      if (hasPermission) {
        setInitialized(true);
        playResponse(welcomeMessage);
      }
    } else if (!isListening && !isSpeaking && !processingInput) {
      startListening();
    }
  }, [initialized, isListening, isSpeaking, processingInput, playResponse, requestMicrophonePermission, startListening, welcomeMessage]);

  const toggleMute = useCallback(() => {
    setMuted(!muted);
    if (isSpeaking && !muted) {
      if (audioRef.current) {
        audioRef.current.pause();
        setIsSpeaking(false);
        triggerAnimation('idle');
        setProcessingInput(false);
        setStatus('idle');
        
        setTimeout(() => {
          if (!isListening && micPermissionGranted) {
            startListening();
          }
        }, 300);
      }
    }
    toast.info(muted ? "Audio activado" : "Audio silenciado", { duration: 1500 });
  }, [muted, isSpeaking, micPermissionGranted, isListening, triggerAnimation]);

  // Get status text with animated dots
  const getStatusText = () => {
    switch (status) {
      case 'listening':
        return `Escuchando${dots}`;
      case 'processing':
        return `Procesando${dots}`;
      case 'speaking':
        return `Hablando${dots}`;
      default:
        return micPermissionGranted ? 'Listo' : 'Necesita micrófono';
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4" onClick={handleManualStart}>
      <div className="flex items-center justify-between">
        <div className={`rounded-full w-3 h-3 ${
          status === 'listening' ? 'bg-red-500 animate-pulse' : 
          status === 'speaking' ? 'bg-blue-500 animate-pulse' : 
          status === 'processing' ? 'bg-yellow-500 animate-pulse' : 
          'bg-green-500'
        }`}></div>
        
        <div className="text-sm text-white/80">
          {getStatusText()}
        </div>
        
        <Button 
          onClick={(e) => {
            e.stopPropagation();
            toggleMute();
          }}
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 rounded-full p-0"
        >
          {muted ? <VolumeX className="h-4 w-4 text-white/70" /> : <Volume2 className="h-4 w-4 text-white/70" />}
        </Button>
      </div>
      
      {!micPermissionGranted && (
        <Button 
          onClick={(e) => {
            e.stopPropagation();
            requestMicrophonePermission();
          }}
          className="mt-2 bg-blue-600 hover:bg-blue-700"
        >
          <Mic className="w-4 h-4 mr-2" />
          Permitir micrófono
        </Button>
      )}
    </div>
  );
}
