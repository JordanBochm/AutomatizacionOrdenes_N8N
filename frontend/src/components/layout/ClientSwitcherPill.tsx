"use client";

import React, { useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronDown } from "lucide-react";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

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

  const activeLabel = activeClientMeta ? activeClientMeta.name : "Todos los clientes";

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setMenuOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        aria-label="Cambiar cliente activo de Asset Management"
        title={tooltipText}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border text-xs transition shadow-2xs cursor-pointer focus-visible:outline-2 focus-visible:outline-[#233762] ${
          menuOpen
            ? "border-[#233762] ring-2 ring-[#233762]/10"
            : "border-slate-200 hover:border-[#233762]/40 hover:bg-slate-50"
        }`}
      >
        <Building2 className="w-3.5 h-3.5 text-[#233762] shrink-0" />
        {showPrefix && (
          <span className="text-[11px] font-medium text-slate-400 hidden lg:inline">
            Cliente:
          </span>
        )}
        <span className="font-bold text-[#233762] whitespace-nowrap">{activeLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
            menuOpen ? "rotate-180 text-[#233762]" : ""
          }`}
        />
      </button>

      {menuOpen && (
        <div
          role="listbox"
          aria-label="Seleccionar cliente"
          className="absolute right-0 mt-1.5 w-52 rounded-xl bg-white border border-slate-200 shadow-lg py-1.5 z-50"
        >
          <button
            type="button"
            role="option"
            aria-selected={activeClientId === "ALL"}
            onClick={() => {
              handleSelectChange("ALL");
              setMenuOpen(false);
            }}
            className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition cursor-pointer ${
              activeClientId === "ALL"
                ? "bg-[#EFF3F9] text-[#233762] font-bold"
                : "text-slate-700 hover:bg-slate-50 font-medium"
            }`}
          >
            <span>Todos los clientes</span>
            {activeClientId === "ALL" && <Check className="w-3.5 h-3.5 text-[#233762] shrink-0" />}
          </button>

          <div className="my-1 border-t border-slate-100" />

          {availableClients.map((c) => {
            const selected = activeClientId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  handleSelectChange(c.id);
                  setMenuOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition cursor-pointer ${
                  selected
                    ? "bg-[#EFF3F9] text-[#233762]"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className={`truncate ${selected ? "font-bold" : "font-semibold"}`}>
                  {c.name}
                </span>
                {selected && <Check className="w-3.5 h-3.5 text-[#233762] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
