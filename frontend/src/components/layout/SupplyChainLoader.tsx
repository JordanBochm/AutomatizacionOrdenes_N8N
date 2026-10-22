"use client";

import React from "react";

interface SupplyChainLoaderProps {
  active: boolean;
  message?: string;
  subMessage?: string;
}

export default function SupplyChainLoader({
  active,
  message = "Procesando operación...",
  subMessage = "Por favor espera un momento",
}: SupplyChainLoaderProps) {
  if (!active) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm transition-all duration-300"
    >
      <style>{`
        /* Rotación dinámica continua y rápida para estado de carga */
        .sc-spinner-rotate {
          transform-origin: 573px 124px;
          animation: sc-spin-fast 1.35s cubic-bezier(0.5, 0.1, 0.4, 0.95) infinite;
        }

        @keyframes sc-spin-fast {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(-360deg);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .sc-spinner-rotate {
            animation: none !important;
          }
        }
      `}</style>

      {/* Tarjeta Flotante Translúcida que Enmarca el Logo */}
      <div className="relative p-7 sm:p-9 rounded-3xl bg-white/95 border border-white/70 shadow-2xl flex flex-col items-center gap-5 max-w-sm w-full text-center backdrop-blur-xl ring-1 ring-slate-900/10 animate-in fade-in zoom-in-95 duration-200">
        {/* Glow de acento suave en el fondo de la tarjeta */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-tr from-[#233762]/8 via-transparent to-[#CE3A39]/8"
        />

        {/* LOGO ANIMADO (SÓLO ASPAS, SIN TEXTO INFERIOR) */}
        <div className="w-24 h-24 sm:w-28 sm:h-28 relative flex items-center justify-center">
          <svg
            viewBox="383 -66 380 380"
            role="img"
            aria-label="Cargando..."
            className="w-full h-full overflow-visible block"
          >
            <defs>
              <clipPath id="sc-loader-clip">
                <circle cx="584.5" cy="186.1" r="75" />
              </clipPath>
            </defs>

            {/* GRUPO EN ROTACIÓN RÁPIDA: ASPA AZUL Y ASPA ROJA GIRANDO JUNTAS */}
            <g className="sc-spinner-rotate">
              {/* Aspa Azul (#233762) */}
              <g>
                <path
                  fill="#233762"
                  d="M490.0 242.0C452.2 238.5 418.8 212.8 406.9 178.0C403.2 167.0 401.9 167.5 432.9 167.2L459.1 167.0L465.4 173.4C476.7 184.8 485.9 189.1 500.0 189.2C517.5 189.4 524.7 186.2 539.9 171.5C573.9 138.7 582.7 126.5 583.6 111.2C583.9 107.0 584.3 102.6 584.5 101.4C585.1 98.4 614.7 69.4 620.8 65.8C627.5 62.0 628.0 62.2 631.3 71.6C644.1 108.7 635.4 146.2 607.2 174.9C595.0 187.3 562.5 218.7 556.5 223.7C541.6 236.3 513.2 244.1 490.0 242.0ZM403.2 137.4L401.0 135.9L401.0 88.2C401.0 62.0 401.4 40.0 401.8 39.4C403.7 36.6 407.4 36.0 424.3 36.0C446.5 36.0 447.0 36.3 447.0 47.6C447.0 51.7 447.3 55.0 447.6 55.0C447.9 55.0 454.7 48.7 462.6 41.1C477.8 26.4 483.6 22.1 496.0 15.8C522.8 2.4 559.0 3.3 586.1 18.2C593.1 22.1 593.1 21.7 587.4 25.9C584.9 27.8 575.7 36.4 567.0 45.1L551.1 60.8L543.6 59.7C525.8 57.1 514.3 61.8 496.8 78.8C482.7 92.5 482.5 93.0 492.3 93.0C503.2 93.0 503.0 92.5 503.0 116.3C503.0 135.4 502.9 135.9 500.8 137.4C498.8 138.8 492.5 139.0 452.0 139.0C411.5 139.0 405.2 138.8 403.2 137.4Z"
                />
              </g>

              {/* Aspa Roja (#CE3A39) */}
              <g>
                <path
                  fill="#CE3A39"
                  d="M595.5 242.0C588.3 241.2 580.1 239.5 574.5 237.5C569.8 235.8 554.0 227.7 554.0 227.0C554.0 226.5 555.5 225.1 557.2 223.9C559.0 222.7 568.4 213.8 578.1 204.3C595.0 187.7 595.8 187.0 598.4 188.0C603.5 189.9 616.9 189.2 624.2 186.7C633.9 183.2 639.3 179.4 651.0 167.3L661.5 156.5L653.9 156.2C642.3 155.8 642.5 156.1 642.5 132.5C642.5 114.9 642.7 113.0 644.4 111.1C646.3 109.0 646.8 109.0 694.0 109.0L741.7 109.0L743.8 111.3C747.0 114.7 747.3 206.2 744.1 210.1C742.2 212.4 741.8 212.5 723.3 212.8C699.4 213.2 699.0 213.0 699.0 201.4C699.0 197.3 698.7 194.0 698.2 194.0C697.8 194.0 691.9 199.7 685.0 206.6C656.1 235.6 631.1 245.5 595.5 242.0ZM517.0 183.9C510.0 170.9 506.8 142.0 510.5 125.3C515.8 101.4 524.7 86.0 542.8 69.0C547.8 64.3 558.1 54.4 565.7 46.9C573.3 39.5 582.2 31.2 585.5 28.6C588.8 26.0 592.0 23.3 592.5 22.6C594.0 20.9 602.8 15.7 608.0 13.6C610.5 12.6 613.4 11.4 614.5 10.9C629.0 4.9 672.6 5.0 679.5 11.1C680.0 11.6 681.0 12.0 681.8 12.0C682.6 12.0 686.8 13.8 691.2 16.0C714.4 27.7 732.5 48.5 740.4 72.4C743.4 81.4 744.8 81.0 713.0 81.0L685.1 81.0L681.4 76.5C671.5 64.3 653.9 57.5 639.0 60.0C620.4 63.1 620.9 62.8 600.5 83.4C566.6 117.7 562.0 124.9 562.0 143.4L562.0 148.6L545.8 164.6C526.1 184.0 519.4 188.5 517.0 183.9Z"
                />
              </g>

              {/* Entrelazado con clipPath para profundidad */}
              <g clipPath="url(#sc-loader-clip)">
                <path
                  fill="#233762"
                  d="M490.0 242.0C452.2 238.5 418.8 212.8 406.9 178.0C403.2 167.0 401.9 167.5 432.9 167.2L459.1 167.0L465.4 173.4C476.7 184.8 485.9 189.1 500.0 189.2C517.5 189.4 524.7 186.2 539.9 171.5C573.9 138.7 582.7 126.5 583.6 111.2C583.9 107.0 584.3 102.6 584.5 101.4C585.1 98.4 614.7 69.4 620.8 65.8C627.5 62.0 628.0 62.2 631.3 71.6C644.1 108.7 635.4 146.2 607.2 174.9C595.0 187.3 562.5 218.7 556.5 223.7C541.6 236.3 513.2 244.1 490.0 242.0ZM403.2 137.4L401.0 135.9L401.0 88.2C401.0 62.0 401.4 40.0 401.8 39.4C403.7 36.6 407.4 36.0 424.3 36.0C446.5 36.0 447.0 36.3 447.0 47.6C447.0 51.7 447.3 55.0 447.6 55.0C447.9 55.0 454.7 48.7 462.6 41.1C477.8 26.4 483.6 22.1 496.0 15.8C522.8 2.4 559.0 3.3 586.1 18.2C593.1 22.1 593.1 21.7 587.4 25.9C584.9 27.8 575.7 36.4 567.0 45.1L551.1 60.8L543.6 59.7C525.8 57.1 514.3 61.8 496.8 78.8C482.7 92.5 482.5 93.0 492.3 93.0C503.2 93.0 503.0 92.5 503.0 116.3C503.0 135.4 502.9 135.9 500.8 137.4C498.8 138.8 492.5 139.0 452.0 139.0C411.5 139.0 405.2 138.8 403.2 137.4Z"
                />
              </g>
            </g>
          </svg>
        </div>

        {/* Textos descriptivos de la operación */}
        <div className="flex flex-col items-center gap-1 z-10">
          <span className="text-sm font-bold text-[#233762] tracking-wide">
            {message}
          </span>
          <span className="text-xs font-medium text-slate-500">
            {subMessage}
          </span>
        </div>
      </div>
    </div>
  );
}
