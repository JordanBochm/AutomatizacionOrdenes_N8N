"use client";

import React, { useState, useMemo } from "react";
import {
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  Sparkles,
  ShieldCheck,
  Filter,
  Layers,
  BatteryCharging,
  HardDrive,
  FileBadge,
  X,
  ArrowLeft,
} from "lucide-react";
import { RefurbRecord, EstatusRefurb, GradoCosmetico } from "@/lib/reportes/types";
import { MOCK_REFURB_RECORDS, getRefurbKPIs } from "@/lib/reportes/submodulos-data";

const ESTATUS_CONFIG: Record<
  EstatusRefurb,
  { label: string; badgeBg: string; badgeText: string; badgeBorder: string; dotColor: string }
> = {
  RECEPCION: {
    label: "Recepción / Triage",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-700",
    badgeBorder: "border-slate-300",
    dotColor: "bg-slate-400",
  },
  BORRADO_DISCO: {
    label: "Borrado Seguro NIST",
    badgeBg: "bg-amber-50",
    badgeText: "text-amber-800",
    badgeBorder: "border-amber-300",
    dotColor: "bg-amber-500",
  },
  CARGA_IMAGEN: {
    label: "Carga Imagen SO",
    badgeBg: "bg-blue-50",
    badgeText: "text-blue-800",
    badgeBorder: "border-blue-300",
    dotColor: "bg-blue-500",
  },
  AUDITORIA_QC: {
    label: "Auditoría Calidad QC",
    badgeBg: "bg-purple-50",
    badgeText: "text-purple-800",
    badgeBorder: "border-purple-300",
    dotColor: "bg-purple-600",
  },
  LISTO_STOCK: {
    label: "Listo para Reingreso",
    badgeBg: "bg-emerald-50",
    badgeText: "text-emerald-800",
    badgeBorder: "border-emerald-300",
    dotColor: "bg-emerald-600",
  },
};

const GRADO_CONFIG: Record<GradoCosmetico, { label: string; badge: string }> = {
  GRADO_A: {
    label: "Grado A (Excelente)",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-300",
  },
  GRADO_B: {
    label: "Grado B (Buen Estado)",
    badge: "bg-blue-100 text-blue-800 border-blue-300",
  },
  GRADO_C: {
    label: "Grado C (Desgaste Menor)",
    badge: "bg-amber-100 text-amber-800 border-amber-300",
  },
  SCRAP: {
    label: "Scrap / Inviable",
    badge: "bg-rose-100 text-rose-800 border-rose-300",
  },
};

interface RefurbViewProps {
  onBack?: () => void;
}

export default function RefurbView({ onBack }: RefurbViewProps = {}) {
  const [records, setRecords] = useState<RefurbRecord[]>(MOCK_REFURB_RECORDS);
  const [search, setSearch] = useState("");
  const [selectedEstatus, setSelectedEstatus] = useState<EstatusRefurb | "TODOS">("TODOS");
  const [selectedGrado, setSelectedGrado] = useState<GradoCosmetico | "TODOS">("TODOS");
  const [selectedRecord, setSelectedRecord] = useState<RefurbRecord | null>(null);

  const kpis = useMemo(() => getRefurbKPIs(records), [records]);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        r.serialNumber.toLowerCase().includes(q) ||
        r.modelo.toLowerCase().includes(q) ||
        r.tecnico.toLowerCase().includes(q);

      const matchEstatus = selectedEstatus === "TODOS" || r.estatusRefurb === selectedEstatus;
      const matchGrado = selectedGrado === "TODOS" || r.gradoCosmetico === selectedGrado;
      return matchSearch && matchEstatus && matchGrado;
    });
  }, [records, search, selectedEstatus, selectedGrado]);

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
            <span className="text-purple-600 font-bold">Refurb</span>
          </div>
        </div>
      )}

      {/* Header del Submódulo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#233762] flex items-center gap-3">
            <RefreshCw className="w-8 h-8 text-purple-600" />
            Línea de Reacondicionamiento (Refurb) y Stock
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Borrado seguro de datos (NIST 800-88 / Blancco), reinstalación de imagen, auditoría cosmética y reingreso a almacén.
          </p>
        </div>
      </div>

      {/* KPIs Refurb */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total en Refurb</div>
          <div className="text-2xl font-black text-[#233762] mt-1.5">{kpis.totalEnRefurb}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <Layers className="w-3 h-3 text-blue-500" /> Línea de acondicionamiento
          </div>
        </div>

        <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200 shadow-sm">
          <div className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">Borrado Seguro</div>
          <div className="text-2xl font-black text-amber-700 mt-1.5">{kpis.enBorrado}</div>
          <div className="text-[11px] text-amber-600 mt-1 flex items-center gap-1">
            <HardDrive className="w-3 h-3" /> NIST 800-88 / Blancco
          </div>
        </div>

        <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-200 shadow-sm">
          <div className="text-[11px] font-bold text-blue-900 uppercase tracking-wider">Carga Imagen SO</div>
          <div className="text-2xl font-black text-blue-700 mt-1.5">{kpis.enCargaImagen}</div>
          <div className="text-[11px] text-blue-600 mt-1 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Windows 11 / macOS
          </div>
        </div>

        <div className="bg-purple-50/50 p-4 rounded-xl border border-purple-200 shadow-sm">
          <div className="text-[11px] font-bold text-purple-900 uppercase tracking-wider">Auditoría QC</div>
          <div className="text-2xl font-black text-purple-700 mt-1.5">{kpis.enAuditoria}</div>
          <div className="text-[11px] text-purple-600 mt-1 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> Pruebas funcionales
          </div>
        </div>

        <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-200 shadow-sm">
          <div className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider">Listos para Stock</div>
          <div className="text-2xl font-black text-emerald-700 mt-1.5">{kpis.listosStock}</div>
          <div className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Liberados a almacén
          </div>
        </div>

        <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-200 shadow-sm">
          <div className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider">Grado A (Top)</div>
          <div className="text-2xl font-black text-indigo-700 mt-1.5">{kpis.gradoA_Count}</div>
          <div className="text-[11px] text-indigo-600 mt-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Estética impecable
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
              placeholder="Buscar por serial, modelo, técnico..."
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
              const count = records.filter((r) => r.estatusRefurb === key).length;
              if (count === 0) return null;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedEstatus(key as EstatusRefurb)}
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

      {/* Tabla Refurb */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#233762] text-white uppercase text-[11px] font-bold tracking-wider">
                <th className="py-3 px-4">Serial Number</th>
                <th className="py-3 px-4">Modelo</th>
                <th className="py-3 px-4">Grado Cosmético</th>
                <th className="py-3 px-4">Borrado Seguro</th>
                <th className="py-3 px-4">Imagen SO</th>
                <th className="py-3 px-4">Batería (%)</th>
                <th className="py-3 px-4">Técnico QC</th>
                <th className="py-3 px-4">Estatus Refurb</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-400">
                    No se encontraron equipos en reacondicionamiento con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const conf = ESTATUS_CONFIG[item.estatusRefurb];
                  const grado = GRADO_CONFIG[item.gradoCosmetico];
                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-[#233762]">{item.serialNumber}</td>
                      <td className="py-3 px-4 font-medium text-slate-800">{item.modelo}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${grado.badge}`}>
                          {grado.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-700">
                          <HardDrive className="w-3 h-3 text-blue-600" />
                          {item.borradoDisco === "NIST_800_88_COMPLETO"
                            ? "NIST 800-88"
                            : item.borradoDisco === "CERTIFICADO_BLANCCO"
                            ? "Blancco Cert."
                            : "Pendiente"}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                        {item.imagenSO === "WINDOWS_11_PRO_KYNDRYL"
                          ? "Win 11 Pro Kyndryl"
                          : item.imagenSO === "MACOS_SONOMA_SEKO"
                          ? "macOS Sonoma"
                          : "Pendiente"}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 font-bold ${
                            item.saludBateria >= 90
                              ? "text-emerald-700"
                              : item.saludBateria >= 80
                              ? "text-blue-700"
                              : "text-amber-700"
                          }`}
                        >
                          <BatteryCharging className="w-3.5 h-3.5" /> {item.saludBateria}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-700">{item.tecnico}</td>
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
                          Ver QC
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

      {/* Modal Detalle Refurb */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-[#233762] text-white px-6 py-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-blue-200 font-bold uppercase tracking-wider">Auditoría Refurb & QC</div>
                <h3 className="text-base font-bold font-mono">{selectedRecord.serialNumber}</h3>
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
                  <span className="text-slate-400 block font-medium">Grado Cosmético</span>
                  <strong className="text-emerald-700 font-bold">{GRADO_CONFIG[selectedRecord.gradoCosmetico].label}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Salud Batería</span>
                  <strong className="text-blue-900 font-bold">{selectedRecord.saludBateria}%</strong>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Limpieza Detallada</span>
                  <strong className="text-slate-800">{selectedRecord.limpiezaDetallada ? "Completada" : "Pendiente"}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Ingreso a Refurb</span>
                  <strong className="text-slate-800">{selectedRecord.fechaIngreso}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Liberación Stock</span>
                  <strong className="text-slate-800">{selectedRecord.fechaLiberacion || "En proceso"}</strong>
                </div>
              </div>

              <div className="p-3 bg-emerald-50/60 rounded-lg border border-emerald-200 space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-900 font-bold">
                  <FileBadge className="w-4 h-4 text-emerald-600" />
                  Certificación de Borrado de Datos
                </div>
                <p className="text-[11px] text-emerald-800">
                  Método aplicado: <strong>{selectedRecord.borradoDisco}</strong>. Discos sin remanencia conforme a políticas de seguridad Kyndryl.
                </p>
              </div>

              <div>
                <span className="text-slate-500 font-bold block mb-1">Técnico Responsable:</span>
                <p className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-700">
                  {selectedRecord.tecnico} - Laboratorio Central de Reacondicionamiento
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

