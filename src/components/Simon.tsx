import { useRef, useState, useEffect, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { generateChatResponse, ChatMessage } from '@/services/openai';
import { textToSpeech, cacheAudio, getCachedAudio, clearAudioCache, preloadCommonResponses } from '@/services/elevenlabs';
import { toast } from 'sonner';
import type { 
  SpeechRecognition, 
  SpeechRecognitionEvent, 
  SpeechRecognitionErrorEvent 
} from '../types/speech-recognition.d.ts';

interface SimonProps {
  splineRef: React.MutableRefObject<any>;
  onStateChange?: (state: 'idle' | 'listening' | 'processing' | 'speaking') => void;
}

// Preloaded API Keys
const OPENAI_API_KEY = "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";

// ElevenLabs (Latin Spanish Voice)
const ELEVENLABS_API_KEY = "sk_45d3e665137c012665d22e754828f2e4451b6eca216b1bf6";
const ELEVENLABS_VOICE_ID = "dlGxemPxFMTY7iXagmOj"; // Latin Spanish voice ID

export function Simon({ splineRef, onStateChange }: SimonProps) {
  // State variables
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
  const [partialResponse, setPartialResponse] = useState<string | null>(null);
  const [speechProgress, setSpeechProgress] = useState(0);
  
  // Update status setter to also call onStateChange prop
  const setStatusWithCallback = (newStatus: 'idle' | 'listening' | 'processing' | 'speaking') => {
    setStatus(newStatus);
    if (onStateChange) {
      onStateChange(newStatus);
    }
  };
  
  // Refs
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const dotsIntervalRef = useRef<number | null>(null);
  const silenceTimeoutRef = useRef<number | null>(null);
  const lastAudioLevelRef = useRef<number>(0);
  const unfinishedResponseRef = useRef<string | null>(null);
  const speakingStartTimeRef = useRef<number | null>(null);
  const audioLevelCheckIntervalRef = useRef<number | null>(null);
  const streamingResponseRef = useRef<string | null>(null);
  const lastUserInputTimeRef = useRef<number>(Date.now());
  const consecutiveSilencesRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

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

  // Improved silence detection with better parameters
  const detectSilence = useCallback(() => {
    if (!isListening || isSpeaking) return;
    
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
    }
    
    // Calculate time since last user input
    const timeSinceLastInput = Date.now() - lastUserInputTimeRef.current;
    
    // Dynamically adjust silence threshold based on conversation context
    const silenceThreshold = userSpeaking ? 1500 : 800; // Longer if user was just speaking
    
    // If no audio activity for the threshold time, consider the user finished speaking
    silenceTimeoutRef.current = window.setTimeout(() => {
      if (lastAudioLevelRef.current < 0.05) { // Increased threshold for better detection
        if (userSpeaking) {
          console.log("Silence detected, user stopped speaking");
          setUserSpeaking(false);
          
          // If recognition is still running, stop it to process what was said
          if (recognitionRef.current) {
            try {
              // Small delay to catch trailing words
              setTimeout(() => {
                recognitionRef.current?.stop();
              }, 250);
            } catch (error) {
              console.error("Error stopping recognition on silence", error);
              // Attempt recovery
              startListening();
            }
          }
          // Reset consecutive silences when user speaks
          consecutiveSilencesRef.current = 0;
        } else if (timeSinceLastInput > 5000) {
          // If no input for a while, increment consecutive silences
          consecutiveSilencesRef.current += 1;
          
          // After 3 consecutive silences, return to idle to save resources
          if (consecutiveSilencesRef.current >= 3) {
            console.log("Multiple consecutive silences detected, returning to idle");
            triggerAnimation('idle');
            
            // Every 3rd silence, restart listening to refresh connection
            if (recognitionRef.current) {
              try {
                recognitionRef.current.stop();
                setTimeout(() => startListening(), 300);
              } catch (error) {
                console.error("Error restarting recognition", error);
              }
            }
          }
        }
      } else {
        // Reset silence counter if we detect audio
        consecutiveSilencesRef.current = 0;
      }
    }, silenceThreshold);
  }, [isListening, isSpeaking, userSpeaking]);

  // Audio level monitoring with improved frequency
  const setupAudioLevelMonitoring = useCallback(async () => {
    try {
      // Clean up any existing monitoring
      if (audioLevelCheckIntervalRef.current) {
        clearInterval(audioLevelCheckIntervalRef.current);
        audioLevelCheckIntervalRef.current = null;
      }
      
      if (audioContextRef.current) {
        await audioContextRef.current.close();
        audioContextRef.current = null;
        analyserRef.current = null;
      }
      
      // Set up new audio context and analyser
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const microphone = audioContextRef.current.createMediaStreamSource(stream);
      microphone.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;
      
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      // Check audio levels more frequently (50ms instead of animation frame)
      audioLevelCheckIntervalRef.current = window.setInterval(() => {
        if (!analyserRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength / 255;
        lastAudioLevelRef.current = average;
        
        // Detect if user is speaking (audio level above threshold)
        if (average > 0.08) { // Increased from 0.05 for better detection
          if (!userSpeaking && !isSpeaking) {
            console.log("User started speaking", average);
            setUserSpeaking(true);
            lastUserInputTimeRef.current = Date.now();
            
            // If Simon is speaking, stop to let user talk
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
              setStatusWithCallback('idle');
            }
          }
        }
        
        // Use the silence detection
        detectSilence();
      }, 50); // Check every 50ms instead of animation frame
      
      return stream;
    } catch (error) {
      console.error("Error setting up audio monitoring:", error);
      return null;
    }
  }, [detectSilence, isSpeaking]);

  // Comprobar y solicitar permisos de micrófono - mejorado para ser más rápido
  const requestMicrophonePermission = useCallback(async () => {
    try {
      console.log("Solicitando permisos de micrófono");
      toast.info("Conectando micrófono...", { duration: 2000 });
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      // Setup audio level monitoring using new method
      await setupAudioLevelMonitoring();
      
      // Cerrar el stream para liberar el micrófono para el reconocimiento de voz
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
  }, [setupAudioLevelMonitoring]);

  useEffect(() => {
    audioRef.current = new Audio();
    
    // Initialize audio element
    audioRef.current.onended = () => {
      console.log("Audio playback ended naturally");
      setIsSpeaking(false);
      speakingStartTimeRef.current = null;
      triggerAnimation('idle');
      setProcessingInput(false);
      setStatusWithCallback('idle');
      
      // Small delay before starting to listen again
      setTimeout(() => {
        if (!isListening && micPermissionGranted) {
          startListening();
        }
      }, 400); // Slightly longer delay for better rhythm
    };
    
    audioRef.current.onerror = (e) => {
      console.error("Audio playback error:", e);
      setIsSpeaking(false);
      speakingStartTimeRef.current = null;
      triggerAnimation('idle');
      setProcessingInput(false);
      setStatusWithCallback('idle');
    };
    
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
            
            // Preload common responses in the background
            setTimeout(() => {
              preloadCommonResponses(ELEVENLABS_VOICE_ID, ELEVENLABS_API_KEY)
                .then(() => console.log("Preloaded common responses"))
                .catch(err => console.error("Error preloading responses:", err));
            }, 2000);
            
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
      if (audioLevelCheckIntervalRef.current) {
        clearInterval(audioLevelCheckIntervalRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('click', unlockAudio);
    };
  }, [requestMicrophonePermission, pageFullyLoaded, initialized, micPermissionGranted, isListening]);

  // Cuando termine de hablar, inicia la escucha - con mejor manejo de estados
  useEffect(() => {
    if (initialized && !isSpeaking && !isListening && micPermissionGranted && !processingInput) {
      console.log("Iniciando escucha después de hablar");
      const timer = setTimeout(() => {
        startListening();
      }, 350); // Slightly increased from 300ms for better natural flow
      
      return () => clearTimeout(timer);
    }
  }, [initialized, isSpeaking, isListening, micPermissionGranted, processingInput]);

  const triggerAnimation = useCallback((animationName: string) => {
    if (window.simonAnimations && window.simonAnimations[animationName]) {
      console.log("Triggering animation via global method:", animationName);
      window.simonAnimations[animationName]();
    } else if (splineRef.current) {
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

    // If already listening, don't restart
    if (isListening) {
      console.log("Already listening, skipping restart");
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
      recognitionRef.current.continuous = true; // Keep true for continuous listening
      recognitionRef.current.interimResults = true; // For real-time feedback
      recognitionRef.current.maxAlternatives = 1;

      recognitionRef.current.onstart = () => {
        console.log("Reconocimiento de voz iniciado");
        setIsListening(true);
        setStatusWithCallback('listening');
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
          lastUserInputTimeRef.current = Date.now();
        }
        
        // Process final results when there's meaningful content
        // Added minimum length check of 3 characters to avoid processing too short inputs
        if (event.results[0].isFinal && currentTranscript.trim().length > 3) {
          processSpeech(currentTranscript);
          // Only stop if we actually process the speech
          recognitionRef.current?.stop();
        }
      };

      recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Error de reconocimiento:', event.error);
        setIsListening(false);
        setStatusWithCallback('idle');
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
          }, 400); // Increased from 300ms
        } else {
          if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = window.setTimeout(() => {
            if (!isSpeaking && micPermissionGranted && !processingInput) {
              startListening();
            }
          }, 600); // Increased from 500ms
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
        }, 400); // Increased from 300ms
      };

      console.log("Iniciando reconocimiento de voz");
      recognitionRef.current.start();
    } catch (error) {
      console.error("Error crítico:", error);
      toast.error("Error de reconocimiento de voz");
      setStatusWithCallback('idle');
      
      setTimeout(() => {
        if (!isSpeaking && micPermissionGranted && !processingInput) {
          startListening();
        }
      }, 1000);
    }
  }, [isSpeaking, micPermissionGranted, processingInput, requestMicrophonePermission, triggerAnimation, isListening]);

  // Handle streaming response updates
  const handleStreamingResponse = useCallback((partialText: string) => {
    streamingResponseRef.current = partialText;
    setPartialResponse(partialText);
    
    // Update animation to show thinking or talking based on content
    if (partialText && partialText.length > 0) {
      if (status !== 'speaking') {
        triggerAnimation('talking');
        setStatusWithCallback('speaking');
      }
    }
  }, [status, triggerAnimation]);

  const processSpeech = useCallback(async (text: string) => {
    if (!text.trim()) return;
    
    setProcessingInput(true);
    setStatusWithCallback('processing');
    setUserSpeaking(false);
    streamingResponseRef.current = null;
    setPartialResponse(null);
    
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
        const aiResponse = await generateChatResponse(
          conversationContext.current, 
          OPENAI_API_KEY,
          handleStreamingResponse
        );
        
        const continuedResponse = unfinishedResponseRef.current + aiResponse;
        conversationContext.current.push({ role: 'assistant', content: continuedResponse });
        
        // Clear the continuation context
        unfinishedResponseRef.current = null;
        
        // Use final response instead of partial one
        streamingResponseRef.current = null;
        setPartialResponse(null);
        
        playResponse(continuedResponse);
      } else {
        const aiResponse = await generateChatResponse(
          conversationContext.current, 
          OPENAI_API_KEY,
          handleStreamingResponse
        );
        
        console.log("Respuesta completa recibida:", aiResponse);
        
        // Agregar respuesta del asistente al contexto
        conversationContext.current.push({ role: 'assistant', content: aiResponse });
        
        // Use final response instead of partial one
        streamingResponseRef.current = null;
        setPartialResponse(null);
        
        playResponse(aiResponse);
      }
    } catch (error) {
      console.error('Error al procesar:', error);
      triggerAnimation('idle');
      setProcessingInput(false);
      setStatusWithCallback('idle');
      streamingResponseRef.current = null;
      setPartialResponse(null);
      
      setTimeout(() => {
        if (!isListening && micPermissionGranted) {
          startListening();
        }
      }, 500);
    }
  }, [triggerAnimation, handleStreamingResponse]);

  const playResponse = useCallback(async (text: string) => {
    if (muted) {
      console.log("Audio silenciado");
      setIsSpeaking(false);
      triggerAnimation('idle');
      setProcessingInput(false);
      setStatusWithCallback('idle');
      
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
      setStatusWithCallback('speaking');
      speakingStartTimeRef.current = Date.now();
      triggerAnimation('talking');
      
      // Reset progress
      setSpeechProgress(0);
      
      let audioData = getCachedAudio(text);
      
      if (!audioData) {
        console.log("Generando nuevo audio");
        
        // Use progress callback
        audioData = await textToSpeech(
          text, 
          ELEVENLABS_VOICE_ID, 
          ELEVENLABS_API_KEY,
          (progress) => setSpeechProgress(progress)
        );
        
        if (audioData) {
          cacheAudio(text, audioData);
        }
      } else {
        // Set progress to 100 immediately for cached audio
        setSpeechProgress(100);
      }
      
      if (audioData && audioRef.current) {
        const blob = new Blob([audioData], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        
        audioRef.current.src = url;
        
        // Expanded onended handler is set in the useEffect
        
        // Mouth animation sync with improved frequency
        audioRef.current.ontimeupdate = () => {
          if (audioRef.current) {
            // Sync mouth movement with audio - more frequent updates
            if (Math.random() < 0.3) { // 30% chance each update
              triggerAnimation('talking');
            }
          }
        };
        
        try {
          // Pre-buffer before playing
          audioRef.current.load();
          
          // Short delay to allow buffering
          setTimeout(() => {
            const playPromise = audioRef.current?.play();
            
            if (playPromise !== undefined) {
              playPromise.catch(error => {
                console.error("Error al reproducir:", error);
                setIsSpeaking(false);
                speakingStartTimeRef.current = null;
                triggerAnimation('idle');
                setProcessingInput(false);
                setStatusWithCallback('idle');
                
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
          }, 100);
        } catch (error) {
          console.error("Error crítico al reproducir:", error);
          setIsSpeaking(false);
          speakingStartTimeRef.current = null;
          triggerAnimation('idle');
          setProcessingInput(false);
          setStatusWithCallback('idle');
          
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
        setStatusWithCallback('idle');
        
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
      setStatusWithCallback('idle');
      
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
        setStatusWithCallback('idle');
        
        // Small delay before starting to listen
        setTimeout(() => {
          startListening();
        }, 400); // Increased from 300ms
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
        setStatusWithCallback('idle');
        
        setTimeout(() => {
          if (!isListening && micPermissionGranted) {
            startListening();
          }
        }, 400); // Increased from 300ms
      }
    }
    toast.info(muted ? "Audio activado" : "Audio silenciado", { duration: 1500 });
  }, [muted, isSpeaking, micPermissionGranted, isListening, triggerAnimation]);

  // Get status text with animated dots and partial response
  const getStatusText = useCallback(() => {
    if (userSpeaking) {
      return `Usuario hablando${dots}`;
    }
    
    // If we have a streaming response, show "Respondiendo" instead of "Hablando"
    if (partialResponse && status === 'speaking') {
      return `Respondiendo${dots}`;
    }
    
    // Show speech progress during synthesis
    if (status === 'speaking' && speechProgress > 0 && speechProgress < 100) {
      return `Generando voz (${speechProgress}%)`;
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
  }, [status, dots, micPermissionGranted, userSpeaking, partialResponse, speechProgress]);

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
