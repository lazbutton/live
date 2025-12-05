"use client";

import Image from "next/image";
import { Star } from "lucide-react";

export default function Home() {
  return (
    <div className="h-screen bg-black text-white flex flex-col">
      {/* Navigation */}
      <nav className="bg-black/80 backdrop-blur-xl border-b border-white/5 flex-shrink-0">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Image
                src="/logo.png"
                alt="Live Orléans"
                width={100}
                height={100}
                className="w-10 h-10 sm:w-12 sm:h-12"
                priority
              />
              <span 
                className="text-xl sm:text-2xl font-bold"
                style={{ fontFamily: 'var(--font-inter), Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
              >
                Live
              </span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center overflow-hidden">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="max-w-4xl mx-auto w-full">
            {/* Hero */}
            <div className="text-center px-2 sm:px-0">
              <h1 
                className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 sm:mb-4 leading-[1.1] tracking-[-0.02em] text-white px-2 sm:px-0"
                style={{ fontFamily: 'var(--font-inter), Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
              >
                Il se passe quoi
                <br />
                <span className="text-white">à Orléans ?</span>
              </h1>
              <p 
                className="text-base sm:text-lg text-white/60 mb-8 sm:mb-6 max-w-xl mx-auto leading-relaxed px-2 sm:px-0"
                style={{ fontFamily: 'var(--font-inter), Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
              >
                Tous les événements, lieux et organisateurs de votre ville dans une seule app.
              </p>

              {/* Stats */}
              <div className="flex items-center justify-center gap-6 sm:gap-8 mb-10 sm:mb-8">
                <div className="text-center">
                  <div className="text-lg sm:text-xl font-bold text-white">500+</div>
                  <div className="text-xs text-white/50 mt-0.5">Événements</div>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Star className="h-3 w-3 sm:h-3.5 sm:w-3.5 fill-white text-white" />
                    <span className="text-lg sm:text-xl font-bold text-white">4.8</span>
                  </div>
                  <div className="text-xs text-white/50 mt-0.5">Note</div>
                </div>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-4 sm:gap-3 mb-8 sm:mb-8 px-4 sm:px-0">
                <button
                  className="group relative bg-white hover:bg-white/90 text-black px-5 sm:px-6 py-3 rounded-2xl cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-white/10 active:scale-[0.98] w-full sm:w-auto min-h-[52px] touch-manipulation"
                  onClick={() => {
                    window.open("https://apps.apple.com/app/live-orleans", "_blank");
                  }}
                >
                  <div className="flex items-center justify-center sm:justify-start gap-3">
                    {/* App Store Icon */}
                    <svg 
                      className="w-6 h-6 flex-shrink-0" 
                      viewBox="0 0 24 24" 
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                    </svg>
                    <div className="text-left">
                      <div className="text-[10px] uppercase tracking-wider opacity-60 leading-tight">
                        Télécharger sur
                      </div>
                      <div className="text-sm font-semibold leading-tight -mt-0.5" style={{ fontFamily: 'var(--font-inter), Inter, sans-serif' }}>
                        App Store
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  className="group relative bg-black border border-white/20 hover:bg-white/5 hover:border-white/30 text-white px-5 sm:px-6 py-3 rounded-2xl cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-white/5 active:scale-[0.98] w-full sm:w-auto min-h-[52px] touch-manipulation"
                  onClick={() => {
                    window.open("https://play.google.com/store/apps/details?id=com.live.orleans", "_blank");
                  }}
                >
                  <div className="flex items-center justify-center sm:justify-start gap-3">
                    {/* Google Play Icon */}
                    <svg 
                      className="w-6 h-6 flex-shrink-0" 
                      viewBox="0 0 24 24" 
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z"/>
                    </svg>
                    <div className="text-left">
                      <div className="text-[10px] uppercase tracking-wider opacity-60 leading-tight">
                        Disponible sur
                      </div>
                      <div className="text-sm font-semibold leading-tight -mt-0.5" style={{ fontFamily: 'var(--font-inter), Inter, sans-serif' }}>
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
      <footer className="border-t border-white/5 flex-shrink-0">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <p className="text-center text-xs text-white/40 px-2 sm:px-0">
            Made with ♥ by a concerned citizen.
          </p>
        </div>
      </footer>
    </div>
  );
}
