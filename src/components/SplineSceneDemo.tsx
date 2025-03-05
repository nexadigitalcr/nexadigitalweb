
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
    // Adaptive page load detection for optimal experience
    const readyTimer = setTimeout(() => {
      setPageReady(true);
    }, 2500);

    // User guide messages
    const showUserGuide = () => {
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
      document.removeEventListener('click', unlockAudio);
      clearTimeout(readyTimer);
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current);
      }
    };
  }, []);

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
      const obj = splineRef.current.findObjectByName(animationName);
      
      if (obj) {
        console.log(`Playing animation: ${animationName}`);
        splineRef.current.emitEvent('mouseDown', obj);
        lastAnimationRef.current = animationName;
        
        // After animation completes, play next in queue
        // Animation durations are approximated
        const animationDurations = {
          'idle': 3000,
          'blink': 300,
          'talking': 500,
          'thinking': 2000,
          'listening': 2000,
          'nod': 600,
          'headTilt': 500,
          'standby': 4000
        };
        
        setTimeout(() => {
          // Remove current animation from queue
          animationQueue.current.shift();
          
          // Play next animation if queue isn't empty
          if (animationQueue.current.length > 0) {
            playAnimation(animationQueue.current[0]);
          } else {
            // Default to idle if queue is empty
            const idleObj = splineRef.current.findObjectByName('idle');
            if (idleObj && lastAnimationRef.current !== 'idle') {
              splineRef.current.emitEvent('mouseDown', idleObj);
              lastAnimationRef.current = 'idle';
            }
          }
        }, animationDurations[animationName] || 2000);
      } else {
        console.log(`Animation not found: ${animationName}`);
        // Try fallback animations
        handleMissingAnimation(animationName);
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
  
  // Handle missing animations gracefully
  const handleMissingAnimation = (animationName) => {
    if (!splineRef.current) return;
    
    // Map requested animations to available ones
    const fallbackMap = {
      'talking': ['speak', 'mouth', 'talk'],
      'thinking': ['process', 'blink', 'headTilt'],
      'listening': ['listen', 'attentive', 'headTilt'],
      'nod': ['agree', 'headNod', 'headTilt'],
      'headTilt': ['tilt', 'look', 'blink']
    };
    
    const fallbacks = fallbackMap[animationName] || ['blink', 'idle'];
    
    // Try each fallback animation
    for (const fallback of fallbacks) {
      try {
        const obj = splineRef.current.findObjectByName(fallback);
        if (obj) {
          console.log(`Using fallback animation: ${fallback} for ${animationName}`);
          splineRef.current.emitEvent('mouseDown', obj);
          lastAnimationRef.current = fallback;
          return;
        }
      } catch (e) {
        // Continue to next fallback
      }
    }
    
    // If all fallbacks fail, remove from queue
    console.log(`No fallback found for: ${animationName}, removing from queue`);
    animationQueue.current.shift();
    
    // Try next animation in queue
    if (animationQueue.current.length > 0) {
      playAnimation(animationQueue.current[0]);
    }
  };

  // Setup natural idle behaviors
  const setupNaturalIdleBehavior = () => {
    if (!splineRef.current) return;
    
    // Clear any existing interval
    if (animationIntervalRef.current) {
      clearInterval(animationIntervalRef.current);
    }
    
    // Set up random idle animations
    animationIntervalRef.current = setInterval(() => {
      // Only play idle animations if not in the middle of other animations
      if (animationQueue.current.length === 0) {
        const rand = Math.random();
        
        if (rand < 0.6) {
          // 60% chance to blink
          queueAnimation('blink');
        } else if (rand < 0.8) {
          // 20% chance to do a head tilt
          queueAnimation('headTilt');
        } else {
          // 20% chance to do a subtle looking animation
          // Use cursor position to determine where to look
          const lookDirection = cursorRef.current.x > 0.5 ? 'lookRight' : 'lookLeft';
          queueAnimation(lookDirection);
        }
      }
    }, 3000 + Math.random() * 2000); // Random interval between 3-5 seconds
  };

  const onLoad = (spline) => {
    splineRef.current = spline;
    setSplineLoaded(true);
    console.log("Spline scene cargada correctamente");
    
    // Comprehensive animation discovery
    const availableAnimations = [];
    try {
      // Common animation names to look for
      const animationNames = [
        'idle', 'blink', 'talking', 'thinking', 'listening', 
        'nod', 'headTilt', 'lookLeft', 'lookRight', 'standby',
        'speak', 'mouth', 'talk', 'process', 'listen', 'attentive',
        'agree', 'headNod', 'tilt', 'look'
      ];
      
      // Check which animations are available
      animationNames.forEach(name => {
        const obj = spline.findObjectByName(name);
        if (obj) {
          availableAnimations.push(name);
          console.log(`Found animation: ${name}`);
        }
      });
      
      console.log("Available animations:", availableAnimations);
    } catch (error) {
      console.error("Error discovering animations:", error);
    }
    
    // Activate initial animation sequence with transitions
    try {
      // Start with idle as base state
      const idleObj = spline.findObjectByName('idle');
      if (idleObj) {
        console.log("Activando animación inicial 'idle'");
        spline.emitEvent('mouseDown', idleObj);
        lastAnimationRef.current = 'idle';
        
        // Then do a blink to show life
        setTimeout(() => {
          const blinkObj = spline.findObjectByName('blink');
          if (blinkObj) {
            spline.emitEvent('mouseDown', blinkObj);
            console.log("Blinking to show liveliness");
          }
        }, 1000);
        
        // Then do a subtle head movement
        setTimeout(() => {
          const headTiltObj = spline.findObjectByName('headTilt') || 
                            spline.findObjectByName('lookLeft') ||
                            spline.findObjectByName('tilt');
          if (headTiltObj) {
            spline.emitEvent('mouseDown', headTiltObj);
            console.log("Subtle head movement");
          }
        }, 2000);
        
        // Return to idle
        setTimeout(() => {
          spline.emitEvent('mouseDown', idleObj);
        }, 3000);
      } else {
        console.log("No se encontró la animación 'idle'");
        
        // Try alternate animation objects if available
        for (const anim of availableAnimations) {
          const obj = spline.findObjectByName(anim);
          if (obj) {
            console.log(`Activando animación alternativa '${anim}'`);
            spline.emitEvent('mouseDown', obj);
            lastAnimationRef.current = anim;
            break;
          }
        }
      }
      
      // Setup natural idle behaviors with random animations
      setupNaturalIdleBehavior();
    } catch (error) {
      console.error("Error al activar animación inicial:", error);
    }
    
    // Expose animation functions to the window for other components to use
    window.simonAnimations = {
      playAnimation: (name, immediate) => queueAnimation(name, immediate),
      idle: () => queueAnimation('idle', true),
      blink: () => queueAnimation('blink'),
      talking: () => queueAnimation('talking', true),
      thinking: () => queueAnimation('thinking', true),
      listening: () => queueAnimation('listening', true),
      nod: () => queueAnimation('nod'),
      headTilt: () => queueAnimation('headTilt')
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
            <div className="animate-fade-in">
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
            <div className="absolute bottom-4 right-4 z-20 w-60 bg-black/60 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden border border-slate-800">
              <Simon splineRef={splineRef} />
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
