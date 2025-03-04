
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
    };
  }, []);

  const onLoad = (spline: any) => {
    splineRef.current = spline;
    setSplineLoaded(true);
    console.log("Spline scene cargada correctamente");
    
    // Intentar activar animación inicial
    try {
      if (spline) {
        const idleObj = spline.findObjectByName('idle');
        if (idleObj) {
          console.log("Activando animación inicial 'idle'");
          spline.emitEvent('mouseDown', idleObj);
        } else {
          console.log("No se encontró la animación 'idle'");
          
          // Try alternate animation objects if available
          const altAnimations = ['blink', 'standby', 'default'];
          for (const anim of altAnimations) {
            const obj = spline.findObjectByName(anim);
            if (obj) {
              console.log(`Activando animación alternativa '${anim}'`);
              spline.emitEvent('mouseDown', obj);
              break;
            }
          }
        }
      }
    } catch (error) {
      console.error("Error al activar animación inicial:", error);
    }
    
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
