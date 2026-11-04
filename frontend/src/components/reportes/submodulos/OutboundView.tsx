"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Truck,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Filter,
  Layers,
  MapPin,
  PackageCheck,
  X,
} from "lucide-react";
import { OutboundRecord, EstatusOutbound } from "@/lib/reportes/types";
import { MOCK_OUTBOUND_RECORDS, getOutboundKPIs } from "@/lib/reportes/submodulos-data";

const ESTATUS_CONFIG: Record<
  EstatusOutbound,
  { label: string; badgeBg: string; badgeText: string; badgeBorder: string; dotColor: string }
> = {
  PREPARANDO: {
    label: "En Empaque / Timbrado",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-700",
    badgeBorder: "border-slate-300",
    dotColor: "bg-slate-400",
  },
  LISTO_RECOLECCION: {
    label: "Listo para Recolección",
    badgeBg: "bg-blue-50",
    badgeText: "text-blue-800",
    badgeBorder: "border-blue-300",
    dotColor: "bg-blue-500",
  },
  EN_TRANSITO: {
    label: "En Tránsito Carrier",
    badgeBg: "bg-indigo-50",
    badgeText: "text-indigo-800",
    badgeBorder: "border-indigo-300",
    dotColor: "bg-indigo-600",
  },
  EN_REPARTO: {
    label: "En Reparto Local",
    badgeBg: "bg-purple-50",
    badgeText: "text-purple-800",
    badgeBorder: "border-purple-300",
    dotColor: "bg-purple-600",
  },
  ENTREGADO: {
    label: "Entregado a Usuario",
    badgeBg: "bg-emerald-50",
    badgeText: "text-emerald-800",
    badgeBorder: "border-emerald-300",
    dotColor: "bg-emerald-600",
  },
  INCIDENCIA: {
    label: "Incidencia en Destino",
    badgeBg: "bg-rose-50",
    badgeText: "text-rose-800",
    badgeBorder: "border-rose-300",
    dotColor: "bg-rose-600",
  },
};

interface OutboundViewProps {
  onBack?: () => void;
}

export default function OutboundView({ onBack }: OutboundViewProps = {}) {
  const [records, setRecords] = useState<OutboundRecord[]>(MOCK_OUTBOUND_RECORDS);
  const [search, setSearch] = useState("");
  const [selectedEstatus, setSelectedEstatus] = useState<EstatusOutbound | "TODOS">("TODOS");
  const [selectedRecord, setSelectedRecord] = useState<OutboundRecord | null>(null);

  const kpis = useMemo(() => getOutboundKPIs(records), [records]);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        r.serialNumber.toLowerCase().includes(q) ||
        r.ordenId.toLowerCase().includes(q) ||
        r.modelo.toLowerCase().includes(q) ||
        r.destinatario.toLowerCase().includes(q) ||
        r.ciudadDestino.toLowerCase().includes(q) ||
        r.trackingNumber.toLowerCase().includes(q);

      const matchEstatus = selectedEstatus === "TODOS" || r.estatusOutbound === selectedEstatus;
      return matchSearch && matchEstatus;
    });
  }, [records, search, selectedEstatus]);

  return (
    <div className="space-y-6">
      {/* Barra de Navegación Superior / Volver */}
      {onBack && (
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:text-[#233762] hover:border-slate-300 shadow-2xs transition-all group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform text-[#CE3A39]" />
            <span>Volver a Módulos de Reportes</span>
          </button>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EFF3F9] text-[#233762] text-xs font-semibold">
            <span>Asset Management</span>
            <span className="text-slate-400">/</span>
            <span>Reportes</span>
            <span className="text-slate-400">/</span>
            <span className="text-blue-600 font-bold">Outbound</span>
          </div>
        </div>
      )}

      {/* Header del Submódulo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#233762] flex items-center gap-3">
            <Truck className="w-8 h-8 text-blue-600" />
            Reportes de Outbound y Despacho de Órdenes
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Trazabilidad de equipos asignados a usuarios, empaque, carriers, números de guía y confirmación de entrega.
          </p>
        </div>
      </div>

      {/* KPIs Outbound */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Despachos</div>
          <div className="text-2xl font-black text-[#233762] mt-1.5">{kpis.totalOutbound}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <Layers className="w-3 h-3 text-blue-500" /> Órdenes generadas
          </div>
        </div>

        <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200 shadow-sm">
          <div className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">Preparando / Andén</div>
          <div className="text-2xl font-black text-amber-700 mt-1.5">{kpis.preparando}</div>
          <div className="text-[11px] text-amber-600 mt-1 flex items-center gap-1">
            <PackageCheck className="w-3 h-3" /> Timbrado y empaque
          </div>
        </div>

        <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-200 shadow-sm">
          <div className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider">En Tránsito</div>
          <div className="text-2xl font-black text-indigo-700 mt-1.5">{kpis.enTransito}</div>
          <div className="text-[11px] text-indigo-600 mt-1 flex items-center gap-1">
            <Truck className="w-3 h-3" /> FedEx / Estafeta
          </div>
        </div>

        <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-200 shadow-sm">
          <div className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider">Entregados</div>
          <div className="text-2xl font-black text-emerald-700 mt-1.5">{kpis.entregados}</div>
          <div className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Recepción confirmada
          </div>
        </div>

        <div className="bg-rose-50/50 p-4 rounded-xl border border-rose-200 shadow-sm">
          <div className="text-[11px] font-bold text-rose-900 uppercase tracking-wider">Incidencias</div>
          <div className="text-2xl font-black text-rose-700 mt-1.5">{kpis.incidencias}</div>
          <div className="text-[11px] text-rose-600 mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Requiere atención CSM
          </div>
        </div>
      </section>

      {/* Barra de Filtros y Búsqueda */}
      <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por orden, serial, destinatario, ciudad o guía..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-[#233762] outline-none"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <span className="text-slate-400 font-semibold flex items-center gap-1">
              <Filter className="w-3 h-3" /> Estatus:
            </span>
            <button
              onClick={() => setSelectedEstatus("TODOS")}
              className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                selectedEstatus === "TODOS"
                  ? "bg-[#233762] text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Todos ({records.length})
            </button>
            {Object.entries(ESTATUS_CONFIG).map(([key, cfg]) => {
              const count = records.filter((r) => r.estatusOutbound === key).length;
              if (count === 0) return null;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedEstatus(key as EstatusOutbound)}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all flex items-center gap-1.5 ${
                    selectedEstatus === key
                      ? "bg-[#CE3A39] text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor}`} />
                  {cfg.label} ({count})
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Tabla Outbound */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#233762] text-white uppercase text-[11px] font-bold tracking-wider">
                <th className="py-3 px-4">Orden Outbound</th>
                <th className="py-3 px-4">Serial Number</th>
                <th className="py-3 px-4">Modelo</th>
                <th className="py-3 px-4">Destinatario / Depto</th>
                <th className="py-3 px-4">Destino</th>
                <th className="py-3 px-4">Carrier & Guía</th>
                <th className="py-3 px-4">Estatus Despacho</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    No se encontraron órdenes outbound con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const conf = ESTATUS_CONFIG[item.estatusOutbound];
                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-700">{item.ordenId}</td>
                      <td className="py-3 px-4 font-mono font-bold text-[#233762]">{item.serialNumber}</td>
                      <td className="py-3 px-4 font-medium text-slate-800">{item.modelo}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{item.destinatario}</div>
                        <div className="text-[10px] text-slate-400">{item.departamento}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 text-slate-700 font-medium">
                          <MapPin className="w-3 h-3 text-[#CE3A39]" /> {item.ciudadDestino}, {item.estadoDestino}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {item.trackingNumber ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-slate-700 font-bold">{item.trackingNumber}</span>
                            <Link
                              href={`/?module=transporte&tracking=${encodeURIComponent(item.trackingNumber)}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-[#233762] hover:bg-[#233762] hover:text-white transition-all text-[10px] font-bold"
                              title="Rastrear en módulo de Transporte"
                            >
                              Rastrear <ArrowRight className="w-2.5 h-2.5" />
                            </Link>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Por asignar</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${conf.badgeBg} ${conf.badgeText} ${conf.badgeBorder}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${conf.dotColor}`} />
                          {conf.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setSelectedRecord(item)}
                          className="px-2.5 py-1 rounded bg-slate-100 text-[#233762] hover:bg-[#233762] hover:text-white transition-all text-[11px] font-bold"
                        >
                          Ver Detalle
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal Detalle Outbound */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-[#233762] text-white px-6 py-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-blue-200 font-bold uppercase tracking-wider">Orden de Despacho</div>
                <h3 className="text-base font-bold font-mono">{selectedRecord.ordenId}</h3>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-400 block font-medium">Serial Asignado</span>
                  <strong className="text-[#233762] font-mono text-sm">{selectedRecord.serialNumber}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Modelo</span>
                  <strong className="text-slate-800">{selectedRecord.modelo}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Destinatario</span>
                  <strong className="text-slate-800">{selectedRecord.destinatario}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Destino</span>
                  <strong className="text-slate-800">{selectedRecord.ciudadDestino}, {selectedRecord.estadoDestino}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Fecha Despacho</span>
                  <strong className="text-slate-800">{selectedRecord.fechaDespacho}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Fecha Estimada Entrega</span>
                  <strong className="text-slate-800">{selectedRecord.fechaEstimadaEntrega}</strong>
                </div>
              </div>

              {selectedRecord.trackingNumber && (
                <div className="p-3 bg-blue-50/60 rounded-lg border border-blue-200 flex items-center justify-between">
                  <div>
                    <span className="text-blue-900 font-bold block">Carrier: {selectedRecord.carrier}</span>
                    <span className="font-mono text-xs text-slate-700">Guía: {selectedRecord.trackingNumber}</span>
                  </div>
                  <Link
                    href={`/?module=transporte&tracking=${encodeURIComponent(selectedRecord.trackingNumber)}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#233762] text-white font-bold text-xs hover:bg-[#1b2b4d]"
                  >
                    Rastrear Envío <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              )}

              <div>
                <span className="text-slate-500 font-bold block mb-1">Notas de Despacho:</span>
                <p className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-700">
                  {selectedRecord.notas}
                </p>
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-100 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedRecord(null)}
                className="px-4 py-2 rounded-lg bg-slate-700 text-white text-xs font-semibold hover:bg-slate-800"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

