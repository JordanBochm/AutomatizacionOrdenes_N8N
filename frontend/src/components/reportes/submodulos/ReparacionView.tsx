"use client";

import React, { useState, useMemo } from "react";
import {
  Wrench,
  Search,
  Download,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Filter,
  Layers,
  ArrowUpDown,
  X,
  Plus,
  ArrowLeft,
} from "lucide-react";
import { ReparacionRecord, EstatusReparacion } from "@/lib/reportes/types";
import { MOCK_REPARACION_RECORDS, getReparacionKPIs } from "@/lib/reportes/submodulos-data";

const ESTATUS_CONFIG: Record<
  EstatusReparacion,
  { label: string; badgeBg: string; badgeText: string; badgeBorder: string; dotColor: string }
> = {
  DIAGNOSTICO: {
    label: "En Diagnóstico",
    badgeBg: "bg-blue-50",
    badgeText: "text-blue-800",
    badgeBorder: "border-blue-200",
    dotColor: "bg-blue-500",
  },
  ESPERA_PARTES: {
    label: "Espera de Partes",
    badgeBg: "bg-amber-50",
    badgeText: "text-amber-800",
    badgeBorder: "border-amber-300",
    dotColor: "bg-amber-500",
  },
  EN_REPARACION: {
    label: "En Banco de Trabajo",
    badgeBg: "bg-purple-50",
    badgeText: "text-purple-800",
    badgeBorder: "border-purple-300",
    dotColor: "bg-purple-500",
  },
  GARANTIA_LENOVO: {
    label: "RMA Lenovo",
    badgeBg: "bg-indigo-50",
    badgeText: "text-indigo-800",
    badgeBorder: "border-indigo-300",
    dotColor: "bg-indigo-600",
  },
  GARANTIA_DELL: {
    label: "RMA Dell",
    badgeBg: "bg-sky-50",
    badgeText: "text-sky-800",
    badgeBorder: "border-sky-300",
    dotColor: "bg-sky-600",
  },
  LISTO_QC: {
    label: "Reparado / Listo QC",
    badgeBg: "bg-emerald-50",
    badgeText: "text-emerald-800",
    badgeBorder: "border-emerald-300",
    dotColor: "bg-emerald-600",
  },
  SCRAP: {
    label: "Dictamen Scrap",
    badgeBg: "bg-rose-50",
    badgeText: "text-rose-800",
    badgeBorder: "border-rose-300",
    dotColor: "bg-rose-600",
  },
};

interface ReparacionViewProps {
  onBack?: () => void;
}

export default function ReparacionView({ onBack }: ReparacionViewProps = {}) {
  const [records, setRecords] = useState<ReparacionRecord[]>(MOCK_REPARACION_RECORDS);
  const [search, setSearch] = useState("");
  const [selectedEstatus, setSelectedEstatus] = useState<EstatusReparacion | "TODOS">("TODOS");
  const [selectedRecord, setSelectedRecord] = useState<ReparacionRecord | null>(null);

  const kpis = useMemo(() => getReparacionKPIs(records), [records]);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        r.serialNumber.toLowerCase().includes(q) ||
        r.modelo.toLowerCase().includes(q) ||
        r.ticketInc.toLowerCase().includes(q) ||
        r.fallaReportada.toLowerCase().includes(q) ||
        r.tecnicoAsignado.toLowerCase().includes(q);

      const matchEstatus = selectedEstatus === "TODOS" || r.estatusReparacion === selectedEstatus;
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
            <span className="text-amber-600 font-bold">Equipos en Reparación</span>
          </div>
        </div>
      )}

      {/* Header del Submódulo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#233762] flex items-center gap-3">
            <Wrench className="w-8 h-8 text-amber-500" />
            Control de Equipos en Reparación y Taller
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Monitoreo de diagnósticos técnicos, piezas solicitadas, garantías RMA Lenovo/Dell y dictámenes.
          </p>
        </div>
      </div>

      {/* KPIs Submódulo Reparación */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total en Taller</div>
          <div className="text-2xl font-black text-[#233762] mt-1.5">{kpis.totalEnTaller}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <Layers className="w-3 h-3 text-blue-500" /> Órdenes activas
          </div>
        </div>

        <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-200 shadow-sm">
          <div className="text-[11px] font-bold text-blue-900 uppercase tracking-wider">En Diagnóstico</div>
          <div className="text-2xl font-black text-blue-700 mt-1.5">{kpis.enDiagnostico}</div>
          <div className="text-[11px] text-blue-600 mt-1 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Revisión inicial
          </div>
        </div>

        <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200 shadow-sm">
          <div className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">Espera Partes</div>
          <div className="text-2xl font-black text-amber-700 mt-1.5">{kpis.esperaPartes}</div>
          <div className="text-[11px] text-amber-600 mt-1 flex items-center gap-1">
            <Wrench className="w-3 h-3" /> Refacciones solicitadas
          </div>
        </div>

        <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-200 shadow-sm">
          <div className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider">Garantía RMA</div>
          <div className="text-2xl font-black text-indigo-700 mt-1.5">{kpis.enGarantiaFabricante}</div>
          <div className="text-[11px] text-indigo-600 mt-1 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> Lenovo / Dell Oficial
          </div>
        </div>

        <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-200 shadow-sm">
          <div className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider">Reparado / QC</div>
          <div className="text-2xl font-black text-emerald-700 mt-1.5">{kpis.listosQC}</div>
          <div className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Listo para stock
          </div>
        </div>

        <div className="bg-rose-50/50 p-4 rounded-xl border border-rose-200 shadow-sm">
          <div className="text-[11px] font-bold text-rose-900 uppercase tracking-wider">Dictamen Scrap</div>
          <div className="text-2xl font-black text-rose-700 mt-1.5">{kpis.scrap}</div>
          <div className="text-[11px] text-rose-600 mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Baja técnica
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
              placeholder="Buscar por serial, ticket INC, modelo, falla o técnico..."
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
              const count = records.filter((r) => r.estatusReparacion === key).length;
              if (count === 0) return null;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedEstatus(key as EstatusReparacion)}
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

      {/* Tabla de Reparaciones */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#233762] text-white uppercase text-[11px] font-bold tracking-wider">
                <th className="py-3 px-4">Ticket INC</th>
                <th className="py-3 px-4">Serial Number</th>
                <th className="py-3 px-4">Modelo</th>
                <th className="py-3 px-4">Falla Reportada</th>
                <th className="py-3 px-4">Garantía Fabricante</th>
                <th className="py-3 px-4">Técnico / Laboratorio</th>
                <th className="py-3 px-4">Estatus Reparación</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    No se encontraron equipos en reparación con los criterios seleccionados.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const conf = ESTATUS_CONFIG[item.estatusReparacion];
                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-700">{item.ticketInc}</td>
                      <td className="py-3 px-4 font-mono font-bold text-[#233762]">{item.serialNumber}</td>
                      <td className="py-3 px-4 font-medium text-slate-800">{item.modelo}</td>
                      <td className="py-3 px-4 max-w-xs text-slate-600 line-clamp-2" title={item.fallaReportada}>
                        {item.fallaReportada}
                      </td>
                      <td className="py-3 px-4">
                        {item.garantiaAplica ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" /> {item.proveedorGarantia} Oficial
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-medium">Reparación Local</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{item.tecnicoAsignado}</td>
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

      {/* Modal Detalle de Reparación */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-[#233762] text-white px-6 py-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-blue-200 font-bold uppercase tracking-wider">Orden de Taller</div>
                <h3 className="text-base font-bold font-mono">{selectedRecord.ticketInc} - {selectedRecord.serialNumber}</h3>
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
                  <span className="text-slate-400 block font-medium">Modelo</span>
                  <strong className="text-slate-800">{selectedRecord.modelo}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Fecha Ingreso</span>
                  <strong className="text-slate-800">{selectedRecord.fechaIngreso}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Técnico</span>
                  <strong className="text-slate-800">{selectedRecord.tecnicoAsignado}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Cobertura</span>
                  <strong className="text-slate-800">{selectedRecord.garantiaAplica ? `Garantía ${selectedRecord.proveedorGarantia}` : "Fuera de Garantía"}</strong>
                </div>
              </div>

              <div>
                <span className="text-slate-500 font-bold block mb-1">Diagnóstico y Falla:</span>
                <p className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-700 leading-relaxed">
                  {selectedRecord.fallaReportada}
                </p>
              </div>

              {selectedRecord.piezasRequeridas && (
                <div>
                  <span className="text-slate-500 font-bold block mb-1">Refacciones:</span>
                  <div className="bg-amber-50/50 p-3 rounded-lg border border-amber-200 text-amber-900 font-medium">
                    {selectedRecord.piezasRequeridas}
                  </div>
                </div>
              )}

              <div>
                <span className="text-slate-500 font-bold block mb-1">Bitácora / Comentarios:</span>
                <p className="bg-blue-50/40 p-3 rounded-lg border border-blue-200 text-blue-950">
                  {selectedRecord.comentarios}
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

