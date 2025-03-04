
'use client'

import { SplineScene } from "@/components/ui/splite";
import { Card } from "@/components/ui/card";
import { Spotlight } from "@/components/ui/spotlight";
import { useState } from "react";
import { Bot } from "lucide-react";
 
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
        {/* Left content - Simon will appear here */}
        <div className="flex-1 p-8 relative z-10 flex flex-col justify-center">
          {showSimon && (
            <div className="absolute left-8 bottom-1/3 z-10 animate-fade-in">
              <div className="relative">
                <div className="h-16 w-16 rounded-full bg-blue-500 flex items-center justify-center hover:scale-105 transition-transform duration-300">
                  <Bot className="text-white h-8 w-8" />
                </div>
                <div className="absolute -bottom-2 -right-2 h-4 w-4 rounded-full bg-green-500 border-2 border-black"></div>
              </div>
              <div className="mt-2 text-center text-sm text-white font-medium">Simón</div>
            </div>
          )}
          
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

        {/* Right content */}
        <div className="flex-1 relative">
          <SplineScene 
            scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
            className="w-full h-full"
          />
        </div>
      </div>
    </Card>
  )
}
