
'use client'

import { SplineScene } from "@/components/ui/splite";
import { Card } from "@/components/ui/card";
import { Spotlight } from "@/components/ui/spotlight";
import { useState } from "react";
 
export function SplineSceneBasic() {
  const [showSimon, setShowSimon] = useState(true);
  const [welcomeVisible, setWelcomeVisible] = useState(true);

  return (
    <Card className="w-full h-screen bg-black border-none rounded-none relative overflow-hidden">
      <Spotlight
        className="-top-40 left-0 md:left-60 md:-top-20"
        fill="white"
      />
      
      {/* AI/Normal Switch */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <span className="text-xs text-neutral-400">Normal</span>
        <button 
          onClick={() => setShowSimon(!showSimon)}
          className="relative h-6 w-12 rounded-full bg-neutral-800 p-1 transition-colors duration-200"
        >
          <span 
            className={`absolute inset-y-1 left-1 h-4 w-4 rounded-full bg-white transition-transform duration-200 ${
              showSimon ? 'translate-x-6' : 'translate-x-0'
            }`}
          />
        </button>
        <span className="text-xs text-neutral-400">IA</span>
      </div>
      
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
          {showSimon ? (
            <>
              <div className="absolute top-4 left-4 z-20 text-white text-sm font-medium bg-blue-500/20 px-3 py-1 rounded-full">
                Simón
              </div>
              <SplineScene 
                scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
                className="w-full h-full"
              />
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-400">
              <p>Modo normal activado</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
