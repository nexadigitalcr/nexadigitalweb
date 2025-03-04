
'use client'

import { SplineScene } from "@/components/ui/splite";
import { Card } from "@/components/ui/card";
import { Spotlight } from "@/components/ui/spotlight";
import { useState, useRef } from "react";
import { Simon } from "@/components/Simon";
 
export function SplineSceneBasic() {
  const [showSimon, setShowSimon] = useState(true);
  const [welcomeVisible, setWelcomeVisible] = useState(true);
  const splineRef = useRef(null);

  const onLoad = (spline: any) => {
    splineRef.current = spline;
    console.log("Spline scene loaded", spline);
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
          <div className="absolute top-4 left-4 z-20 text-white text-sm font-medium bg-blue-500/20 px-3 py-1 rounded-full">
            Simón
          </div>
          <SplineScene 
            scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
            className="w-full h-full"
            onLoad={onLoad}
          />
          <div className="absolute bottom-4 right-4 z-20 w-80 bg-black/60 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden">
            <Simon splineRef={splineRef} />
          </div>
        </div>
      </div>
    </Card>
  )
}
