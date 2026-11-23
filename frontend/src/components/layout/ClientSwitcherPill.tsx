"use client";

import React, { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import {
  ASSET_CLIENTS,
  ASSET_CLIENTS_MAP,
  ActiveClientFilter,
  isSpecificAssetClient,
  loadActiveClientFromStorage,
  saveActiveClientToStorage,
} from "@/lib/assetClients";

interface ClientSwitcherPillProps {
  value?: ActiveClientFilter;
  onChange?: (clientId: ActiveClientFilter) => void;
  showPrefix?: boolean;
}

export default function ClientSwitcherPill({
  value,
  onChange,
  showPrefix = true,
}: ClientSwitcherPillProps) {
  const [internalClient, setInternalClient] = useState<ActiveClientFilter>("ALL");

  // Sincronización con sessionStorage y evento global solo como respaldo para vistas
  // que viven fuera de page.tsx (ej. /reportes) hasta que todas reciban value/onChange por props.
  useEffect(() => {
    if (value !== undefined) return;
    setInternalClient(loadActiveClientFromStorage());
    const handleStorage = (e: CustomEvent<ActiveClientFilter>) => {
      const next = e.detail;
      if (next === "ALL" || (next && next in ASSET_CLIENTS_MAP)) {
        setInternalClient(next);
      }
    };
    window.addEventListener("sc-asset-client-changed" as any, handleStorage as any);
    return () => {
      window.removeEventListener("sc-asset-client-changed" as any, handleStorage as any);
    };
  }, [value]);

  const activeClientId: ActiveClientFilter = value !== undefined ? value : internalClient;
  const activeClientMeta = isSpecificAssetClient(activeClientId)
    ? ASSET_CLIENTS_MAP[activeClientId]
    : null;

  // TODO(allowedClients): Restringir la lista de clientes mostrados según currentUser.allowedClients
  const availableClients = ASSET_CLIENTS;

  const handleSelectChange = (nextId: ActiveClientFilter) => {
    if (value === undefined) {
      setInternalClient(nextId);
    }
    saveActiveClientToStorage(nextId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sc-asset-client-changed", { detail: nextId }));
    }
    if (onChange) {
      onChange(nextId);
    }
  };

  const tooltipText = activeClientMeta
    ? `Cliente activo: ${activeClientMeta.name} (${activeClientMeta.segment}). Usa el selector para cambiar.`
    : "Filtro activo: Todos los clientes. Usa el selector para elegir un cliente específico.";

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 hover:border-[#233762]/30 transition text-xs"
      title={tooltipText}
    >
      <span className="inline-flex items-center gap-1 text-[#233762]">
        <Building2 className="w-3.5 h-3.5" />
        {showPrefix && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 hidden lg:inline">
            Cliente:
          </span>
        )}
      </span>

      <select
        aria-label="Cambiar cliente activo de Asset Management"
        value={activeClientId}
        onChange={(e) => handleSelectChange(e.target.value as ActiveClientFilter)}
        className="bg-transparent font-mono font-bold text-[11px] text-[#233762] focus:outline-none cursor-pointer pr-1"
      >
        <option value="ALL" className="text-slate-800 font-sans font-semibold">
          Todos los clientes
        </option>
        {availableClients.map((c) => (
          <option key={c.id} value={c.id} className="text-slate-800 font-sans font-semibold">
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
