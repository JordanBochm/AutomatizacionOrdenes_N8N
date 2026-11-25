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
    badgeBg: "bg-slate-50",
    badgeText: "text-slate-700",
    badgeBorder: "border-slate-200",
    dotColor: "bg-[#233762]",
  },
  ESPERA_PARTES: {
    label: "Espera de Partes",
    badgeBg: "bg-slate-50",
    badgeText: "text-slate-700",
    badgeBorder: "border-slate-200",
    dotColor: "bg-amber-500",
  },
  EN_REPARACION: {
    label: "En Banco de Trabajo",
    badgeBg: "bg-slate-50",
    badgeText: "text-slate-700",
    badgeBorder: "border-slate-200",
    dotColor: "bg-amber-500",
  },
  GARANTIA_LENOVO: {
    label: "RMA Lenovo",
    badgeBg: "bg-slate-50",
    badgeText: "text-slate-700",
    badgeBorder: "border-slate-200",
    dotColor: "bg-[#233762]",
  },
  GARANTIA_DELL: {
    label: "RMA Dell",
    badgeBg: "bg-slate-50",
    badgeText: "text-slate-700",
    badgeBorder: "border-slate-200",
    dotColor: "bg-[#233762]",
  },
  LISTO_QC: {
    label: "Reparado / Listo QC",
    badgeBg: "bg-slate-50",
    badgeText: "text-slate-700",
    badgeBorder: "border-slate-200",
    dotColor: "bg-emerald-500",
  },
  SCRAP: {
    label: "Dictamen Scrap",
    badgeBg: "bg-slate-50",
    badgeText: "text-slate-700",
    badgeBorder: "border-slate-200",
    dotColor: "bg-[#CE3A39]",
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
    <div className="space-y-4">
      {/* Barra de Navegación Superior / Volver */}
      {onBack && (
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-[#233762] transition shadow-2xs font-semibold cursor-pointer group text-xs"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform text-[#CE3A39]" />
            <span>Volver a Módulos de Reportes</span>
          </button>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EFF3F9] text-[#233762] text-xs font-semibold">
            <span>Asset Management</span>
            <span className="text-slate-400">/</span>
            <span>Reportes</span>
            <span className="text-slate-400">/</span>
            <span className="text-[#CE3A39] font-bold">Equipos en Reparación</span>
          </div>
        </div>
      )}

      {/* Cabecera Operativa Estandarizada del Submódulo */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 flex items-center gap-3">
        <span className="p-2 bg-[#EFF3F9] text-[#233762] rounded-lg shrink-0">
          <Wrench className="w-5 h-5" />
        </span>
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[#233762] tracking-tight">
            Control de Equipos en Reparación y Taller
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitoreo de diagnósticos técnicos, piezas solicitadas, garantías RMA Lenovo/Dell y dictámenes.
          </p>
        </div>
      </div>

      {/* KPIs Submódulo Reparación */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total en Taller</span>
            <span className="w-2 h-2 rounded-full bg-[#233762]" />
          </div>
          <div className="text-3xl font-bold font-mono text-[#233762] mt-2">{kpis.totalEnTaller}</div>
          <div className="text-xs text-slate-400 mt-1">Órdenes activas</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">En Diagnóstico</span>
            <span className="w-2 h-2 rounded-full bg-[#233762]" />
          </div>
          <div className="text-3xl font-bold font-mono text-[#233762] mt-2">{kpis.enDiagnostico}</div>
          <div className="text-xs text-slate-400 mt-1">Revisión inicial</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Espera Partes</span>
            <span className="w-2 h-2 rounded-full bg-amber-500" />
          </div>
          <div className="text-3xl font-bold font-mono text-[#233762] mt-2">{kpis.esperaPartes}</div>
          <div className="text-xs text-slate-400 mt-1">Refacciones solicitadas</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Garantía RMA</span>
            <span className="w-2 h-2 rounded-full bg-[#233762]" />
          </div>
          <div className="text-3xl font-bold font-mono text-[#233762] mt-2">{kpis.enGarantiaFabricante}</div>
          <div className="text-xs text-slate-400 mt-1">Lenovo / Dell Oficial</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Reparado / QC</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <div className="text-3xl font-bold font-mono text-[#233762] mt-2">{kpis.listosQC}</div>
          <div className="text-xs text-slate-400 mt-1">Listo para stock</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Dictamen Scrap</span>
            <span className="w-2 h-2 rounded-full bg-[#CE3A39]" />
          </div>
          <div className="text-3xl font-bold font-mono text-[#233762] mt-2">{kpis.scrap}</div>
          <div className="text-xs text-slate-400 mt-1">Baja técnica</div>
        </div>
      </section>

      {/* Barra de Filtros y Búsqueda */}
      <section className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
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
                      ? "bg-[#233762] text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${selectedEstatus === key ? "bg-white" : cfg.dotColor}`} />
                  {cfg.label} ({count})
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Tabla de Reparaciones */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
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
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
                      <div className="w-14 h-14 rounded-2xl bg-[#FDF2F2] border border-[#CE3A39]/15 flex items-center justify-center text-[#CE3A39]">
                        <Wrench className="w-7 h-7 text-[#CE3A39]" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">Módulo de Reparación Limpio</h4>
                        <p className="text-xs text-slate-500 mt-1">
                          No hay equipos registrados en taller o banco de trabajo actualmente.
                        </p>
                      </div>
                    </div>
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
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {item.proveedorGarantia} Oficial
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-medium">Reparación Local</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{item.tecnicoAsignado}</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${conf.dotColor}`} />
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
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

