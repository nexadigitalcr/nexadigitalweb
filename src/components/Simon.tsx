import { useRef, useState, useEffect, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { generateChatResponse, ChatMessage } from '@/services/openai';
import { textToSpeech, cacheAudio, getCachedAudio, clearAudioCache } from '@/services/elevenlabs';
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
const ELEVENLABS_VOICE_ID = "dlGxemPxFMTY7iXagmOj"; // Latin Spanish voice ID

export function Simon({ splineRef }: SimonProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [processingInput, setProcessingInput] = useState(false);
  const [status, setStatus] = useState<'idle' | 'listening' | 'processing' | 'speaking'>('idle');
  const [dots, setDots] = useState('');
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [pageFullyLoaded, setPageFullyLoaded] = useState(false);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const dotsIntervalRef = useRef<number | null>(null);
  const silenceTimeoutRef = useRef<number | null>(null);
  const lastAudioLevelRef = useRef<number>(0);
  const unfinishedResponseRef = useRef<string | null>(null);
  const speakingStartTimeRef = useRef<number | null>(null);

  // Main conversation context
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

  // Page load detection
  useEffect(() => {
    // Wait for page to fully load before interacting
    if (document.readyState === 'complete') {
      setTimeout(() => setPageFullyLoaded(true), 1500);
    } else {
      window.addEventListener('load', () => {
        setTimeout(() => setPageFullyLoaded(true), 1500);
      });
    }

    return () => {
      window.removeEventListener('load', () => setPageFullyLoaded(true));
    };
  }, []);

  // Improved speech detection with silence detection
  const detectSilence = useCallback(() => {
    if (!isListening || isSpeaking) return;
    
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
    }
    
    // If no audio activity for 1.5 seconds, consider the user finished speaking
    silenceTimeoutRef.current = window.setTimeout(() => {
      if (lastAudioLevelRef.current < 0.01 && userSpeaking) {
        console.log("Silence detected, user stopped speaking");
        setUserSpeaking(false);
        
        // If recognition is still running, stop it to process what was said
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch (error) {
            console.error("Error stopping recognition on silence", error);
          }
        }
      }
    }, 1500);
  }, [isListening, isSpeaking, userSpeaking]);

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
      
      // Setup audio level detection
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      microphone.connect(analyser);
      analyser.fftSize = 256;
      
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      const checkAudioLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        
        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength / 255;
        lastAudioLevelRef.current = average;
        
        // Detect if user is speaking (audio level above threshold)
        if (average > 0.05 && !isSpeaking) {
          if (!userSpeaking) {
            console.log("User started speaking", average);
            setUserSpeaking(true);
            
            // If Simon is speaking, stop him to let the user talk
            if (isSpeaking && audioRef.current) {
              console.log("Interrupting Simon to let user speak");
              // Store partial response if interrupted
              if (speakingStartTimeRef.current) {
                const speakingDuration = Date.now() - speakingStartTimeRef.current;
                // Only store if we're more than 1 second in but not almost done
                if (speakingDuration > 1000 && audioRef.current.currentTime < audioRef.current.duration * 0.85) {
                  unfinishedResponseRef.current = "Disculpa por la interrupción. Como estaba diciendo: ";
                  console.log("Stored context for later continuation");
                }
              }
              
              audioRef.current.pause();
              setIsSpeaking(false);
              triggerAnimation('idle');
              setStatus('idle');
            }
          }
        }
        
        // Use the silence detection
        detectSilence();
        
        // Continue checking audio levels if microphone permission is granted
        if (micPermissionGranted) {
          requestAnimationFrame(checkAudioLevel);
        }
      };
      
      requestAnimationFrame(checkAudioLevel);
      
      // Cerrar el stream para liberar el micrófono para el reconocimiento de voz
      // pero mantener el analyser funcionando
      const tracks = stream.getAudioTracks();
      if (tracks.length > 0) {
        const track = tracks[0];
        // Only keep the track we need for analysis
        setTimeout(() => {
          track.stop();
        }, 300);
      }
      
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
  }, [detectSilence, isSpeaking]);

  useEffect(() => {
    audioRef.current = new Audio();
    
    // Inicialización al cargar el componente
    const initializeSimon = async () => {
      if (!initialized && pageFullyLoaded) {
        console.log("Inicializando Simón");
        
        // Clear cache on initialization to prevent stale responses
        clearAudioCache();
        
        setTimeout(async () => {
          const hasPermission = await requestMicrophonePermission();
          
          if (hasPermission) {
            setInitialized(true);
            setTimeout(() => {
              playResponse(welcomeMessage);
            }, 800);
          }
        }, 1000);
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
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('click', unlockAudio);
    };
  }, [requestMicrophonePermission, pageFullyLoaded]);

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
          
          // Fallback animation handling
          if (animationName === 'thinking') {
            // Trigger blink animation and then idle
            setTimeout(() => {
              if (splineRef.current) {
                const blink = splineRef.current.findObjectByName('blink');
                if (blink) splineRef.current.emitEvent('mouseDown', blink);
                
                setTimeout(() => {
                  const idle = splineRef.current.findObjectByName('idle');
                  if (idle) splineRef.current.emitEvent('mouseDown', idle);
                }, 500);
              }
            }, 100);
          } else if (animationName === 'talking') {
            // Trigger mouth animation if available
            const mouth = splineRef.current.findObjectByName('mouth');
            if (mouth) splineRef.current.emitEvent('mouseDown', mouth);
          }
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
      recognitionRef.current.continuous = true; // Changed to true for better continuous listening
      recognitionRef.current.interimResults = true; // For real-time feedback
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
          .join(' ');
        
        console.log("Transcripción:", currentTranscript);
        
        // If we detect speech, update user speaking state
        if (currentTranscript.trim().length > 0) {
          setUserSpeaking(true);
        }
        
        // Process final results when there's meaningful content
        if (event.results[0].isFinal && currentTranscript.trim().length > 2) {
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
          }, 300);
        } else {
          if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = window.setTimeout(() => {
            if (!isSpeaking && micPermissionGranted && !processingInput) {
              startListening();
            }
          }, 500);
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
        }, 300);
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
      }, 1000);
    }
  }, [isSpeaking, micPermissionGranted, processingInput, requestMicrophonePermission, triggerAnimation]);

  const processSpeech = useCallback(async (text: string) => {
    if (!text.trim()) return;
    
    setProcessingInput(true);
    setStatus('processing');
    setUserSpeaking(false);
    
    try {
      triggerAnimation('thinking');
      
      // Build user message, potentially including continuation context
      let userMessage = text;
      if (unfinishedResponseRef.current) {
        // We don't need to modify user message, but we'll add continuation later
        console.log("User interrupted previous response, will add continuation context");
      }
      
      // Agregar mensaje del usuario al contexto de la conversación
      conversationContext.current.push({ role: 'user', content: userMessage });
      
      // Mantener solo los últimos 5 mensajes para contexto (para respuestas más rápidas)
      if (conversationContext.current.length > 6) { // sistema + 5 últimos mensajes
        conversationContext.current = [
          conversationContext.current[0], // Mantener mensaje del sistema
          ...conversationContext.current.slice(-5) // Últimos 5 mensajes
        ];
      }

      console.log("Enviando mensaje a OpenAI:", text);
      
      // If there's a continuation context, prepare the assistant for it
      if (unfinishedResponseRef.current) {
        // Add the continuation context to the beginning of the next response
        const aiResponse = await generateChatResponse(conversationContext.current, OPENAI_API_KEY);
        const continuedResponse = unfinishedResponseRef.current + aiResponse;
        conversationContext.current.push({ role: 'assistant', content: continuedResponse });
        
        // Clear the continuation context
        unfinishedResponseRef.current = null;
        
        playResponse(continuedResponse);
      } else {
        const aiResponse = await generateChatResponse(conversationContext.current, OPENAI_API_KEY);
        console.log("Respuesta recibida:", aiResponse);
        
        // Agregar respuesta del asistente al contexto
        conversationContext.current.push({ role: 'assistant', content: aiResponse });
        
        playResponse(aiResponse);
      }
    } catch (error) {
      console.error('Error al procesar:', error);
      triggerAnimation('idle');
      setProcessingInput(false);
      setStatus('idle');
      
      setTimeout(() => {
        if (!isListening && micPermissionGranted) {
          startListening();
        }
      }, 500);
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
      }, 300);
      return;
    }
    
    try {
      console.log("Reproduciendo respuesta");
      setIsSpeaking(true);
      setStatus('speaking');
      speakingStartTimeRef.current = Date.now();
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
          speakingStartTimeRef.current = null;
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
        
        // Mouth animation sync
        audioRef.current.ontimeupdate = () => {
          if (audioRef.current) {
            // This ensures mouth movement during speech
            if (audioRef.current.currentTime % 1 < 0.1) {
              triggerAnimation('talking');
            }
          }
        };
        
        try {
          const playPromise = audioRef.current.play();
          
          if (playPromise !== undefined) {
            playPromise.catch(error => {
              console.error("Error al reproducir:", error);
              setIsSpeaking(false);
              speakingStartTimeRef.current = null;
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
          speakingStartTimeRef.current = null;
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
        speakingStartTimeRef.current = null;
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
      speakingStartTimeRef.current = null;
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
      if (!pageFullyLoaded) {
        toast.info("Esperando a que la página cargue completamente...");
        return;
      }
      
      const hasPermission = await requestMicrophonePermission();
      if (hasPermission) {
        setInitialized(true);
        setTimeout(() => {
          playResponse(welcomeMessage);
        }, 500);
      }
    } else if (!isListening && !isSpeaking && !processingInput) {
      // Reset session if needed
      if (Math.random() < 0.1) {
        // Occasionally refresh session state
        console.log("Refrescando estado de sesión");
        clearAudioCache();
      }
      startListening();
    } else if (isSpeaking) {
      // If Simon is speaking and user clicks, stop and listen
      console.log("Interrumpiendo a Simón manualmente");
      if (audioRef.current) {
        audioRef.current.pause();
        setIsSpeaking(false);
        speakingStartTimeRef.current = null;
        triggerAnimation('idle');
        setProcessingInput(false);
        setStatus('idle');
        
        // Small delay before starting to listen
        setTimeout(() => {
          startListening();
        }, 300);
      }
    }
  }, [initialized, isListening, isSpeaking, processingInput, playResponse, requestMicrophonePermission, startListening, welcomeMessage, pageFullyLoaded]);

  const toggleMute = useCallback(() => {
    setMuted(!muted);
    if (isSpeaking && !muted) {
      if (audioRef.current) {
        audioRef.current.pause();
        setIsSpeaking(false);
        speakingStartTimeRef.current = null;
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
  const getStatusText = useCallback(() => {
    if (userSpeaking) {
      return `Usuario hablando${dots}`;
    }
    
    switch (status) {
      case 'listening':
        return `Escuchando${dots}`;
      case 'processing':
        return `Pensando${dots}`;
      case 'speaking':
        return `Hablando${dots}`;
      default:
        return micPermissionGranted ? 'Listo' : 'Necesita micrófono';
    }
  }, [status, dots, micPermissionGranted, userSpeaking]);

  return (
    <div className="flex flex-col gap-3 p-4" onClick={handleManualStart}>
      <div className="flex items-center justify-between">
        <div className={`rounded-full w-3 h-3 ${
          userSpeaking ? 'bg-green-500 animate-pulse' :
          status === 'listening' ? 'bg-blue-500 animate-pulse' : 
          status === 'speaking' ? 'bg-purple-500 animate-pulse' : 
          status === 'processing' ? 'bg-yellow-500 animate-pulse' : 
          'bg-slate-500'
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
