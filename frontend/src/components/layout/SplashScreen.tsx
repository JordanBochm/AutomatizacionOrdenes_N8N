"use client";

import React, { useEffect, useState } from "react";

interface SplashScreenProps {
  ready: boolean;
  minDuration?: number;
}

type Phase = "loading" | "zooming" | "done";

const STORAGE_KEY = "sc_splash_seen";

export default function SplashScreen({
  ready,
  minDuration = 1200,
}: SplashScreenProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [minTimePassed, setMinTimePassed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // 1. Verificar prefers-reduced-motion y sessionStorage en mount
  useEffect(() => {
    // Verificar si el usuario ya vio el splash en esta sesión
    try {
      const seen = sessionStorage.getItem(STORAGE_KEY);
      if (seen === "true") {
        setPhase("done");
        return;
      }
    } catch {
      // Si sessionStorage no está disponible, continuar normalmente
    }

    // Detectar preferencia de reducción de movimiento
    try {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReducedMotion(mq.matches);
      const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    } catch {
      // Ignorar si matchMedia no está disponible
    }
  }, []);

  // 2. Garantizar duración mínima en pantalla
  useEffect(() => {
    const t = setTimeout(() => setMinTimePassed(true), minDuration);
    return () => clearTimeout(t);
  }, [minDuration]);

  // 3. Iniciar zoom cuando los datos estén listos Y haya transcurrido el tiempo mínimo
  useEffect(() => {
    if (ready && minTimePassed && phase === "loading") {
      setPhase("zooming");
    }
  }, [ready, minTimePassed, phase]);

  // 4. Temporizador de desmontaje y registro en sessionStorage al iniciar el zoom
  useEffect(() => {
    if (phase === "zooming") {
      try {
        sessionStorage.setItem(STORAGE_KEY, "true");
      } catch {
        // Ignorar
      }

      // Si el usuario prefiere movimiento reducido, fade rápido de 300ms
      // De lo contrario, esperar 1200ms para completar el zoom de 1150ms y desvanecido
      const timeoutDuration = reducedMotion ? 300 : 1200;
      const t = setTimeout(() => {
        setPhase("done");
      }, timeoutDuration);

      return () => clearTimeout(t);
    }
  }, [phase, reducedMotion]);

  // 5. Bloquear scroll mientras el splash esté activo y restaurarlo al terminar o desmontar
  useEffect(() => {
    if (phase !== "done") {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    } else {
      document.body.style.overflow = "";
    }
  }, [phase]);

  // Si ya terminó o ya había sido visto en la sesión, desmontar
  if (phase === "done") {
    return null;
  }

  const isZooming = phase === "zooming";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-white"
      style={{
        pointerEvents: isZooming ? "none" : "auto",
        opacity: isZooming ? 0 : 1,
        transition: reducedMotion
          ? "opacity 300ms ease-out"
          : isZooming
          ? "opacity 500ms ease-out 650ms"
          : "none",
        willChange: "opacity",
      }}
      aria-hidden={isZooming ? "true" : undefined}
    >
      <div
        className="relative flex items-center justify-center p-6"
        style={{
          transform: isZooming && !reducedMotion ? "scale(18)" : "scale(1)",
          transition:
            isZooming && !reducedMotion
              ? "transform 1150ms cubic-bezier(0.7, 0, 0.84, 0)"
              : "none",
          transformOrigin: "center center",
          willChange: "transform",
        }}
      >
        <img
          src="/logo-supplychain.png"
          alt="SupplyChain México"
          className={`h-20 sm:h-24 md:h-28 w-auto object-contain select-none ${
            phase === "loading" && !reducedMotion ? "animate-pulse" : ""
          }`}
          draggable={false}
          loading="eager"
          decoding="sync"
          onError={(e) => {
            // Fallback vectorial por si la imagen tarda en cargar
            e.currentTarget.style.display = "none";
            const fb = document.getElementById("splash-svg-fallback");
            if (fb) fb.style.display = "flex";
          }}
        />

        {/* Fallback vectorial de respaldo */}
        <div id="splash-svg-fallback" className="hidden items-center gap-3">
          <svg
            viewBox="0 0 48 48"
            className="w-12 h-12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M6 12L18 24L6 36L12 36L24 24L12 12H6Z" fill="#233762" />
            <path d="M20 12L32 24L20 36L26 36L38 24L26 12H20Z" fill="#CE3A39" />
          </svg>
          <div className="flex flex-col">
            <div className="flex items-baseline">
              <span className="text-3xl font-black italic tracking-tighter text-[#233762]">
                Supply
              </span>
              <span className="text-3xl font-black italic tracking-tighter text-[#CE3A39]">
                Chain
              </span>
            </div>
            <span className="text-xs font-extrabold tracking-[0.35em] text-[#233762] uppercase -mt-1">
              M É X I C O
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
