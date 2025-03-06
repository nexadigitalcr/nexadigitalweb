
'use client'

import { SplineScene } from "@/components/ui/splite";
import { Card } from "@/components/ui/card";
import { Spotlight } from "@/components/ui/spotlight";
import { useState, useRef, useEffect } from "react";
import { Simon } from "@/components/Simon";
import { toast } from 'sonner';
 
export function SplineSceneBasic() {
  const [welcomeVisible, setWelcomeVisible] = useState(true);
  const [splineLoaded, setSplineLoaded] = useState(false);
  const [pageReady, setPageReady] = useState(false);
  const splineRef = useRef(null);
  const cursorRef = useRef({ x: 0, y: 0 });
  const animationIntervalRef = useRef(null);
  const lastAnimationRef = useRef('idle');
  const animationQueue = useRef([]);
  const [conversationState, setConversationState] = useState('idle'); // idle, listening, speaking
  const availableAnimationsRef = useRef([]);

  // Track mouse position for responsive character movement
  useEffect(() => {
    const handleMouseMove = (e) => {
      cursorRef.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight
      };
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  useEffect(() => {
    // Adaptive page load detection - use real load event instead of fixed timeout
    const handlePageReady = () => {
      setPageReady(true);
      console.log("Page ready event triggered");
    };

    // Check if page is already loaded
    if (document.readyState === 'complete') {
      handlePageReady();
    } else {
      window.addEventListener('load', handlePageReady);
    }

    // Show user guide only once using localStorage
    const showUserGuide = () => {
      // Check if user has seen the guide before
      if (!localStorage.getItem("simonGuideShown")) {
        // Performance guide
        toast.info(
          'Haz clic para interactuar con Simón',
          { duration: 4000, id: 'start-guide' }
        );
        
        // Second toast - browser compatibility
        setTimeout(() => {
          toast.info(
            'Para mejor experiencia, usa Chrome, Edge o Safari',
            { duration: 3000, id: 'browser-guide' }
          );
        }, 4500);
        
        // Third toast - speak clearly
        setTimeout(() => {
          toast.info(
            'Puedes interrumpir a Simón para preguntar algo nuevo',
            { duration: 3000, id: 'interruption-guide' }
          );
        }, 8000);

        // Fourth toast - feature highlight
        setTimeout(() => {
          toast.info(
            'Simón puede escuchar, pensar y hablar de forma natural',
            { duration: 3000, id: 'feature-guide' }
          );
        }, 11500);
        
        // Mark guide as shown
        localStorage.setItem("simonGuideShown", "true");
      }
    };

    // Check HTTPS
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      toast.error(
        'Esta aplicación requiere HTTPS para funcionar correctamente',
        { duration: 8000 }
      );
    }
    
    showUserGuide();
    
    // One-time audio unlock for iOS/Safari
    const unlockAudio = () => {
      const audio = new Audio();
      audio.play().catch(() => {
        // Silence catch - just attempting to unlock
      });
      document.removeEventListener('click', unlockAudio);
    };
    
    document.addEventListener('click', unlockAudio, { once: true });
    
    return () => {
      window.removeEventListener('load', handlePageReady);
      document.removeEventListener('click', unlockAudio);
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current);
      }
    };
  }, []);

  // Function to discover available animations in the Spline scene
  const discoverAnimations = (spline) => {
    try {
      // Common animation names to check
      const animationNames = [
        'idle', 'blink', 'talking', 'thinking', 'listening', 
        'nod', 'headTilt', 'lookLeft', 'lookRight', 'standby',
        'speak', 'mouth', 'talk', 'process', 'listen', 'attentive',
        'agree', 'headNod', 'tilt', 'look', 'facial_movement',
        'lookDirection', 'turnHead', 'lookAround',
        // Try more animation names that might be in the model
        'face', 'head', 'eyes', 'smile', 'frown', 'gesture',
        'main', 'default', 'start', 'animate', 'animation',
        'base', 'idle1', 'idle2', 'talk1', 'talk2', 'blink1',
        'loop', 'cycle', 'active', 'interactive', 'response'
      ];
      
      // Check which animations are available
      const found = [];
      animationNames.forEach(name => {
        try {
          const obj = spline.findObjectByName(name);
          if (obj) {
            found.push(name);
            console.log(`Found animation: ${name}`);
          }
        } catch (e) {
          // Skip if error finding this animation
        }
      });
      
      console.log("Available animations:", found);
      availableAnimationsRef.current = found;
      return found;
    } catch (error) {
      console.error("Error discovering animations:", error);
      return [];
    }
  };

  // Enhanced function to find best animation match
  const findBestAnimationMatch = (desiredAnimation) => {
    const availableAnimations = availableAnimationsRef.current;
    if (!availableAnimations.length) return null;
    
    // Direct match
    if (availableAnimations.includes(desiredAnimation)) {
      return desiredAnimation;
    }
    
    // Mapping of animation types to potential matches
    const animationMap = {
      'idle': ['idle', 'base', 'default', 'main', 'loop', 'cycle', 'idle1', 'idle2'],
      'talking': ['talking', 'talk', 'speak', 'mouth', 'face', 'talk1', 'talk2', 'response'],
      'thinking': ['thinking', 'process', 'headTilt', 'lookAround', 'tilt', 'head'],
      'listening': ['listening', 'listen', 'attentive', 'headTilt', 'headNod', 'ears', 'attention'],
      'lookLeft': ['lookLeft', 'look', 'turnHead', 'lookDirection', 'head', 'eyes', 'face'],
      'lookRight': ['lookRight', 'look', 'turnHead', 'lookDirection', 'head', 'eyes', 'face'],
      'nod': ['nod', 'headNod', 'agree', 'yes', 'head', 'gesture'],
      'headTilt': ['headTilt', 'tilt', 'look', 'head', 'curious', 'gesture'],
      'blink': ['blink', 'blink1', 'eyes', 'face', 'facial_movement']
    };
    
    // Find potential matches for the desired animation
    const potentialMatches = animationMap[desiredAnimation] || [];
    
    // Return the first available match
    for (const match of potentialMatches) {
      if (availableAnimations.includes(match)) {
        return match;
      }
    }
    
    // If no specific match, return the first available animation as fallback
    console.log(`No match found for ${desiredAnimation}, using fallback: ${availableAnimations[0]}`);
    return availableAnimations[0];
  };

  // Function to manage animation queue and transitions
  const queueAnimation = (animationName, immediate = false) => {
    if (!splineRef.current) return;
    
    if (immediate) {
      // Clear queue and play immediately
      animationQueue.current = [];
      playAnimation(animationName);
    } else {
      // Add to queue
      animationQueue.current.push(animationName);
      
      // If this is the only animation in queue, play it
      if (animationQueue.current.length === 1) {
        playAnimation(animationName);
      }
    }
  };
  
  // Function to play animation with proper transitions
  const playAnimation = (animationName) => {
    if (!splineRef.current) return;
    
    try {
      console.log(`Attempting to play animation: ${animationName}`);
      
      // Find the best matching animation
      const bestMatch = findBestAnimationMatch(animationName);
      if (!bestMatch) {
        console.warn(`No matching animation found for: ${animationName}`);
        animationQueue.current.shift();
        
        // Try next animation in queue
        if (animationQueue.current.length > 0) {
          playAnimation(animationQueue.current[0]);
        }
        return;
      }
      
      const obj = splineRef.current.findObjectByName(bestMatch);
      
      if (obj) {
        console.log(`Playing animation: ${bestMatch} (requested: ${animationName})`);
        splineRef.current.emitEvent('mouseDown', obj);
        lastAnimationRef.current = bestMatch;
        
        // After animation completes, play next in queue
        // Animation durations are optimized for better responsiveness
        const animationDurations = {
          'idle': 2000,          // Reduced from 3000
          'blink': 300,
          'talking': 500,
          'thinking': 1500,      // Reduced from 2000
          'listening': 1500,     // Reduced from 2000
          'nod': 600,
          'headTilt': 500,
          'standby': 2500        // Reduced from 4000
        };
        
        setTimeout(() => {
          // Remove current animation from queue
          animationQueue.current.shift();
          
          // Play next animation if queue isn't empty
          if (animationQueue.current.length > 0) {
            playAnimation(animationQueue.current[0]);
          } else {
            // Default to idle if queue is empty
            const idleAnimation = findBestAnimationMatch('idle');
            if (idleAnimation && lastAnimationRef.current !== idleAnimation) {
              const idleObj = splineRef.current.findObjectByName(idleAnimation);
              if (idleObj) {
                splineRef.current.emitEvent('mouseDown', idleObj);
                lastAnimationRef.current = idleAnimation;
              }
            }
          }
        }, animationDurations[animationName] || 1500); // Default reduced from 2000
      } else {
        console.log(`Animation object not found: ${bestMatch}`);
        // Remove from queue and try next
        animationQueue.current.shift();
        if (animationQueue.current.length > 0) {
          playAnimation(animationQueue.current[0]);
        }
      }
    } catch (error) {
      console.error(`Error playing animation ${animationName}:`, error);
      animationQueue.current.shift();
      
      // Try next animation in queue
      if (animationQueue.current.length > 0) {
        playAnimation(animationQueue.current[0]);
      }
    }
  };

  // Enhanced natural idle behaviors with more variability and improved randomness
  const setupNaturalIdleBehavior = () => {
    if (!splineRef.current) return;
    
    // Clear any existing interval
    if (animationIntervalRef.current) {
      clearInterval(animationIntervalRef.current);
    }
    
    // More varied idle animation patterns with weighted probabilities
    const idleAnimations = [
      { name: 'blink', weight: 50 },
      { name: 'headTilt', weight: 20 },
      { name: 'lookLeft', weight: 10 },
      { name: 'lookRight', weight: 10 },
      { name: 'nod', weight: 10 }
    ];
    
    // Calculate total weight
    const totalWeight = idleAnimations.reduce((sum, anim) => sum + anim.weight, 0);
    
    // Set up random idle animations with varied intervals
    animationIntervalRef.current = setInterval(() => {
      // Only play idle animations if not in the middle of other animations
      if (animationQueue.current.length === 0 && conversationState === 'idle') {
        // Use weighted random selection
        const rand = Math.random() * totalWeight;
        let weightSum = 0;
        
        for (const animation of idleAnimations) {
          weightSum += animation.weight;
          if (rand <= weightSum) {
            queueAnimation(animation.name);
            break;
          }
        }
      }
    }, 2500 + Math.random() * 1500); // Random interval between 2.5-4 seconds
  };

  // Improved function to make Simon look at UI elements
  const createLookAtFunction = () => {
    return (elementId) => {
      try {
        const element = document.getElementById(elementId);
        if (element && splineRef.current) {
          const rect = element.getBoundingClientRect();
          const elementCenterX = rect.left + rect.width / 2;
          const windowCenterX = window.innerWidth / 2;
          
          // Determine direction based on element position
          const direction = elementCenterX > windowCenterX ? 'lookRight' : 'lookLeft';
          
          // Play immediate look animation
          queueAnimation(direction, true);
          
          // After looking, add a small nod for acknowledgment
          setTimeout(() => {
            queueAnimation('nod');
          }, 800);
        }
      } catch (e) {
        console.error("Error in lookAt function:", e);
      }
    };
  };

  // React to conversation state changes with improved visual feedback
  useEffect(() => {
    if (!splineRef.current) return;
    
    console.log(`Conversation state changed to: ${conversationState}`);
    
    // Sync animation with conversation state
    if (conversationState === 'listening') {
      queueAnimation('listening', true);
      
      // Occasional blinks while listening to appear more lifelike
      const blinkInterval = setInterval(() => {
        if (conversationState === 'listening') {
          queueAnimation('blink');
        } else {
          clearInterval(blinkInterval);
        }
      }, 3000);
      
      return () => clearInterval(blinkInterval);
    } else if (conversationState === 'speaking') {
      queueAnimation('talking', true);
      
      // Mix in occasional head movements while talking for expressiveness
      const movementInterval = setInterval(() => {
        if (conversationState === 'speaking') {
          const rand = Math.random();
          if (rand < 0.3) {
            queueAnimation('nod');
          } else if (rand < 0.5) {
            queueAnimation('headTilt');
          }
        } else {
          clearInterval(movementInterval);
        }
      }, 2500);
      
      return () => clearInterval(movementInterval);
    } else if (conversationState === 'thinking') {
      queueAnimation('thinking', true);
    }
  }, [conversationState]);

  const onLoad = (spline) => {
    splineRef.current = spline;
    setSplineLoaded(true);
    console.log("Spline scene cargada correctamente");
    
    // Discover available animations
    const availableAnimations = discoverAnimations(spline);
    console.log("Available animations:", availableAnimations);
    
    // Activate initial animation sequence with transitions
    try {
      // Start with idle as base state
      const idleAnimation = findBestAnimationMatch('idle');
      if (idleAnimation) {
        const idleObj = spline.findObjectByName(idleAnimation);
        if (idleObj) {
          console.log(`Activando animación inicial '${idleAnimation}'`);
          spline.emitEvent('mouseDown', idleObj);
          lastAnimationRef.current = idleAnimation;
          
          // Then do a blink to show life
          setTimeout(() => {
            const blinkAnimation = findBestAnimationMatch('blink');
            if (blinkAnimation) {
              const blinkObj = spline.findObjectByName(blinkAnimation);
              if (blinkObj) {
                spline.emitEvent('mouseDown', blinkObj);
                console.log("Blinking to show liveliness");
              }
            }
          }, 800);
          
          // Then do a subtle head movement
          setTimeout(() => {
            const headTiltAnimation = findBestAnimationMatch('headTilt');
            if (headTiltAnimation) {
              const headTiltObj = spline.findObjectByName(headTiltAnimation);
              if (headTiltObj) {
                spline.emitEvent('mouseDown', headTiltObj);
                console.log("Subtle head movement");
              }
            }
          }, 1500);
          
          // Return to idle
          setTimeout(() => {
            spline.emitEvent('mouseDown', idleObj);
          }, 2300);
        } else {
          console.log(`No se encontró la animación '${idleAnimation}'`);
        }
      } else {
        console.log("No suitable idle animation found");
      }
      
      // Setup natural idle behaviors with random animations
      setupNaturalIdleBehavior();
    } catch (error) {
      console.error("Error al activar animación inicial:", error);
    }
    
    // Create improved lookAt function
    const lookAtFunction = createLookAtFunction();
    
    // Expose enhanced animation functions to the window with better state awareness
    window.simonAnimations = {
      playAnimation: (name, immediate) => queueAnimation(name, immediate),
      idle: () => {
        setConversationState('idle');
        queueAnimation('idle', true);
      },
      blink: () => queueAnimation('blink'),
      talking: () => {
        setConversationState('speaking');
        queueAnimation('talking', true);
      },
      thinking: () => {
        setConversationState('thinking');
        queueAnimation('thinking', true);
      },
      listening: () => {
        setConversationState('listening');
        queueAnimation('listening', true);
      },
      nod: () => queueAnimation('nod'),
      headTilt: () => queueAnimation('headTilt'),
      // Enhanced lookAt function for UI element awareness
      lookAt: lookAtFunction,
      // Enhanced function to make Simon follow cursor with his gaze
      followCursor: (enabled) => {
        if (enabled) {
          const cursorInterval = setInterval(() => {
            const direction = cursorRef.current.x > 0.5 ? 'lookRight' : 'lookLeft';
            queueAnimation(direction, false);
          }, 1000);
          return () => clearInterval(cursorInterval);
        }
      },
      // Set conversation state with visual feedback
      setConversationState: (state) => {
        setConversationState(state);
      },
      // Get list of available animations for debugging
      getAvailableAnimations: () => [...availableAnimationsRef.current]
    };
    
    // Indicate when Spline is ready
    toast.success('Simón está listo para conversar', { 
      duration: 3000,
      id: 'spline-loaded'
    });
  };

  return (
    <Card className="w-full h-screen bg-black border-none rounded-none relative overflow-hidden">
      <Spotlight
        className="-top-40 left-0 md:left-60 md:-top-20"
        fill="white"
      />
      
      <div className="flex h-full flex-col md:flex-row">
        {/* Left content */}
        <div className="flex-1 p-8 relative z-10 flex flex-col justify-center">
          {welcomeVisible && (
            <div id="welcomeMessage" className="animate-fade-in">
              <h1 className="text-6xl md:text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400">
                NEXA DIGITAL
              </h1>
              <p className="mt-4 text-base text-neutral-300 max-w-lg">
                No mires el futuro desde lejos… camina con nosotros hacia él.
              </p>
            </div>
          )}
        </div>

        {/* Right content - Simón (3D interactive element) */}
        <div className="flex-1 relative">
          <div className="absolute top-4 left-4 z-20 text-white text-sm font-medium bg-blue-500/30 px-3 py-1 rounded-full backdrop-blur-sm">
            Simón
          </div>
          
          <SplineScene 
            scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
            className="w-full h-full"
            onLoad={onLoad}
          />
          
          {splineLoaded && pageReady && (
            <div id="simonInterface" className="absolute bottom-4 right-4 z-20 w-60 bg-black/60 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden border border-slate-800">
              <Simon 
                splineRef={splineRef} 
                onStateChange={(state) => setConversationState(state)}
              />
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
