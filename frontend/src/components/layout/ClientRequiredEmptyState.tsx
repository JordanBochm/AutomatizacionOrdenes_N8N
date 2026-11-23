"use client";

import React from "react";
import { Building2, Clock } from "lucide-react";
import {
  ASSET_CLIENTS,
  AssetClientId,
  ActiveClientFilter,
} from "@/lib/assetClients";

interface ClientRequiredEmptyStateProps {
  mode: "select_client" | "coming_soon";
  moduleName?: string;
  clientName?: string;
  onSelectClient: (clientId: AssetClientId) => void;
  activeClient?: ActiveClientFilter;
}

export default function ClientRequiredEmptyState({
  mode,
  moduleName,
  clientName,
  onSelectClient,
}: ClientRequiredEmptyStateProps) {
  // TODO(allowedClients): Filtrar ASSET_CLIENTS según los clientes permitidos para el usuario activo
  const availableClients = ASSET_CLIENTS;

  if (mode === "coming_soon") {
    return (
      <div className="w-full max-w-2xl mx-auto my-6 bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center flex flex-col items-center">
        <div className="w-14 h-14 rounded-2xl bg-[#EFF3F9] text-[#233762] flex items-center justify-center mb-4">
          <Clock className="w-7 h-7" />
        </div>
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 mb-2">
          En preparación
        </span>
        <h3 className="text-xl font-bold text-[#233762]">
          Próximamente para {clientName || "este cliente"}
        </h3>
        <p className="text-xs text-slate-500 mt-2 max-w-md leading-relaxed">
          Las herramientas de {moduleName || "Operación del día"} para{" "}
          <span className="font-semibold text-slate-700">{clientName}</span> se encuentran en
          definición. Puedes cambiar a otro cliente activo para continuar operando.
        </p>

        <div className="mt-6 pt-5 border-t border-slate-100 w-full">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Cambiar a otro cliente disponible
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {availableClients.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelectClient(c.id)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-[#EFF3F9] hover:border-[#233762]/30 text-slate-700 hover:text-[#233762] text-xs font-bold transition cursor-pointer"
              >
                <Building2 className="w-3.5 h-3.5 text-[#233762]" />
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto my-6 bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center flex flex-col items-center">
      <div className="w-14 h-14 rounded-2xl bg-[#EFF3F9] text-[#233762] flex items-center justify-center mb-4">
        <Building2 className="w-7 h-7" />
      </div>
      <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 mb-2">
        Selección requerida
      </span>
      <h3 className="text-xl font-bold text-[#233762]">
        Elige un cliente para ver este módulo
      </h3>
      <p className="text-xs text-slate-500 mt-2 max-w-md leading-relaxed">
        {moduleName
          ? `El módulo "${moduleName}" opera con información y herramientas específicas por cuenta.`
          : "Este módulo opera con información y herramientas específicas por cuenta."}{" "}
        Selecciona un cliente para continuar:
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3 w-full">
        {availableClients.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelectClient(c.id)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#233762]/30 bg-white hover:bg-[#233762] text-[#233762] hover:text-white text-xs font-bold transition shadow-2xs cursor-pointer group"
          >
            <Building2 className="w-4 h-4 text-[#233762] group-hover:text-white transition-colors" />
            <span>{c.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

