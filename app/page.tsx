"use client";

import { useState, useEffect } from "react";

export default function Home() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="min-h-screen text-white flex flex-col overflow-hidden" style={{ backgroundColor: '#111111' }}>
      {/* Navigation */}
      <nav 
        className="backdrop-blur-xl flex-shrink-0 transition-all duration-500"
        style={{ 
          backgroundColor: 'rgba(17, 17, 17, 0.8)',
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(-20px)'
        }}
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-lg sm:text-2xl">
              <div 
                className="rounded-full flex-shrink-0"
                style={{
                  width: '0.7em',
                  height: '0.7em',
                  backgroundColor: '#DE3333'
                }}
              />
              <span 
                className="font-bold text-white"
                style={{ fontFamily: '"Special Gothic Expanded One", sans-serif' }}
              >
                Live !
              </span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center overflow-y-auto">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 w-full">
          <div className="max-w-3xl mx-auto w-full">
            {/* Hero */}
            <div className="text-center">
              {/* Title with staggered animation */}
              <div className="mb-5 sm:mb-6">
                <h1 
                  className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-7xl font-bold leading-[1.08] text-white uppercase"
                  style={{ fontFamily: '"Special Gothic Expanded One", sans-serif' }}
                >
                  <span
                    className="inline-block transition-all duration-700 ease-out"
                    style={{
                      opacity: mounted ? 1 : 0,
                      transform: mounted ? 'translateY(0)' : 'translateY(30px)',
                      transitionDelay: '200ms'
                    }}
                  >
                    Il se passe quoi
                  </span>
                  <br />
                  <span 
                    className="inline-block transition-all duration-700 ease-out"
                    style={{
                      opacity: mounted ? 1 : 0,
                      transform: mounted ? 'translateY(0)' : 'translateY(30px)',
                      transitionDelay: '400ms'
                    }}
                  >
                    à <span style={{ color: '#DE3333' }}>Orléans</span> ?
                  </span>
                </h1>
              </div>

              {/* Description */}
              <p 
                className="text-base sm:text-lg text-white/60 mb-8 sm:mb-10 max-w-lg mx-auto leading-relaxed px-2 transition-all duration-700 ease-out"
                style={{ 
                  fontFamily: 'var(--font-inter), Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? 'translateY(0)' : 'translateY(20px)',
                  transitionDelay: '600ms'
                }}
              >
                Tous les événements, lieux et organisateurs de votre ville dans une seule app.
              </p>

              {/* CTA Buttons */}
              <div 
                className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 mb-6 sm:mb-8 transition-all duration-700 ease-out"
                style={{
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? 'translateY(0)' : 'translateY(20px)',
                  transitionDelay: '1000ms'
                }}
              >
                <button
                  className="group relative px-6 sm:px-7 py-3.5 sm:py-4 rounded-2xl cursor-pointer transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] w-full sm:w-auto min-h-[56px] touch-manipulation font-medium"
                  style={{ 
                    backgroundColor: '#FFFFFF', 
                    color: '#111111',
                    boxShadow: '0 4px 20px rgba(255, 255, 255, 0.1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
                    e.currentTarget.style.boxShadow = '0 8px 30px rgba(255, 255, 255, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#FFFFFF';
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(255, 255, 255, 0.1)';
                  }}
                  onClick={() => {
                    window.open("https://apps.apple.com/app/live-orleans", "_blank");
                  }}
                >
                  <div className="flex items-center justify-center sm:justify-start gap-3">
                    {/* App Store Icon */}
                    <svg 
                      className="w-7 h-7 flex-shrink-0 transition-transform duration-300 group-hover:scale-110" 
                      viewBox="0 0 24 24" 
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                    </svg>
                    <div className="text-left">
                      <div className="text-[10px] uppercase tracking-wider opacity-70 leading-tight">
                        Télécharger sur
                      </div>
                      <div className="text-sm sm:text-base font-semibold leading-tight -mt-0.5" style={{ fontFamily: 'var(--font-inter), Inter, sans-serif' }}>
                        App Store
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  className="group relative border px-6 sm:px-7 py-3.5 sm:py-4 rounded-2xl cursor-pointer transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] w-full sm:w-auto min-h-[56px] touch-manipulation text-white font-medium"
                  style={{ 
                    backgroundColor: '#111111', 
                    borderColor: 'rgba(255, 255, 255, 0.25)',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
                    e.currentTarget.style.boxShadow = '0 8px 30px rgba(255, 255, 255, 0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#111111';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
                  }}
                  onClick={() => {
                    window.open("https://play.google.com/store/apps/details?id=com.live.orleans", "_blank");
                  }}
                >
                  <div className="flex items-center justify-center sm:justify-start gap-3">
                    {/* Google Play Icon */}
                    <svg 
                      className="w-7 h-7 flex-shrink-0 transition-transform duration-300 group-hover:scale-110" 
                      viewBox="0 0 24 24" 
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z"/>
                    </svg>
                    <div className="text-left">
                      <div className="text-[10px] uppercase tracking-wider opacity-70 leading-tight">
                        Disponible sur
                      </div>
                      <div className="text-sm sm:text-base font-semibold leading-tight -mt-0.5" style={{ fontFamily: 'var(--font-inter), Inter, sans-serif' }}>
                        Google Play
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer 
        className="flex-shrink-0 transition-all duration-700 ease-out"
        style={{
          opacity: mounted ? 1 : 0,
          transitionDelay: '1200ms'
        }}
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <p className="text-center text-xs sm:text-sm text-white/40">
            Made with ♥ by a concerned citizen.
          </p>
        </div>
      </footer>
    </div>
  );
}
