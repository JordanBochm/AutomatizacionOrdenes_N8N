"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  Home,
  Package,
  Search,
  Trash2,
  Truck,
  Upload,
} from "lucide-react";
import {
  getHistoryRepository,
  localDateId,
  type Carrier,
  type HistoryDay,
  type HistorySource,
  type HistoryStatus,
} from "@/lib/history";

interface HistoryViewProps {
  apiBase: string;
  onBack: () => void;
  onNavigateHome?: () => void;
  triggerToast: (message: string, type: "success" | "error" | "info") => void;
  userEmail?: string;
}

const MESES_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const STATUS_CONFIG: Record<
  HistoryStatus,
  { label: string; badge: string; dot: string; icon: React.ElementType }
> = {
  ok: {
    label: "Completo",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    icon: CheckCircle2,
  },
  partial: {
    label: "Con incidencias",
    badge: "bg-amber-50 text-amber-800 border-amber-200",
    dot: "bg-amber-500",
    icon: AlertTriangle,
  },
  error: {
    label: "Con errores",
    badge: "bg-red-50 text-red-700 border-red-200",
    dot: "bg-red-500",
    icon: AlertCircle,
  },
};

const SOURCE_LABELS: Record<HistorySource, string> = {
  tracking: "Rastreo",
  closing: "Cierre",
  batch: "Lote",
  archive: "Archivado",
};

const CARRIER_STYLES: Record<Carrier, string> = {
  FEDEX: "bg-[#EFF3F9] text-[#233762] border-[#233762]/20",
  ESTAFETA: "bg-[#FDF2F2] text-[#CE3A39] border-[#CE3A39]/20",
  DESCONOCIDO: "bg-slate-100 text-slate-600 border-slate-200",
};

function formatDayLabel(id: string): string {
  const parts = id.split("-").map(Number);
  if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) return id;
  const [year, month, day] = parts;
  return `${day} de ${MESES_ES[month - 1] || month} de ${year}`;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export default function HistoryView({
  apiBase,
  onBack,
  onNavigateHome,
  triggerToast,
  userEmail,
}: HistoryViewProps) {
  const repository = useMemo(() => getHistoryRepository(), []);
  const importInputRef = useRef<HTMLInputElement>(null);

  const [days, setDays] = useState<HistoryDay[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");
  const [carrierFilter, setCarrierFilter] = useState<"ALL" | Carrier>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | HistoryStatus>("ALL");
  const [busy, setBusy] = useState<boolean>(false);

  const todayId = localDateId();

  const refresh = useCallback(
    async (preferredId?: string | null) => {
      const list = await repository.list();
      setDays(list);
      const target = preferredId && list.some((day) => day.id === preferredId) ? preferredId : list[0]?.id || null;
      setSelectedId(target);
      setLoading(false);
    },
    [repository]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await repository.list();
      if (cancelled) return;
      setDays(list);
      setSelectedId(list[0]?.id || null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const filteredDays = useMemo(() => {
    const query = search.trim().toLowerCase();
    return days.filter((day) => {
      const matchesSearch =
        !query ||
        (day.batch_filename || "").toLowerCase().includes(query) ||
        day.trackings.some((tracking) => tracking.guia.toLowerCase().includes(query));
      const matchesCarrier =
        carrierFilter === "ALL" || day.trackings.some((tracking) => tracking.carrier === carrierFilter);
      const matchesStatus = statusFilter === "ALL" || day.status === statusFilter;
      return matchesSearch && matchesCarrier && matchesStatus;
    });
  }, [days, search, carrierFilter, statusFilter]);

  const selectedDay = useMemo(() => {
    if (selectedId) {
      const match = days.find((day) => day.id === selectedId);
      if (match) return match;
    }
    return filteredDays[0] || null;
  }, [days, filteredDays, selectedId]);

  const visibleTrackings = useMemo(() => {
    if (!selectedDay) return [];
    const query = search.trim().toLowerCase();
    return selectedDay.trackings.filter((tracking) => {
      const matchesCarrier = carrierFilter === "ALL" || tracking.carrier === carrierFilter;
      const matchesSearch = !query || tracking.guia.toLowerCase().includes(query);
      return matchesCarrier && matchesSearch;
    });
  }, [selectedDay, carrierFilter, search]);

  const totals = useMemo(
    () => ({
      days: days.length,
      trackings: days.reduce((acc, day) => acc + day.trackings.length, 0),
      closings: days.filter((day) => Boolean(day.closing)).length,
    }),
    [days]
  );

  const handleExport = async () => {
    try {
      const json = await repository.exportJson();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `historial_${todayId}.json`;
      link.click();
      URL.revokeObjectURL(url);
      triggerToast("Historial exportado en JSON.", "success");
    } catch {
      triggerToast("No se pudo exportar el historial.", "error");
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const count = await repository.importJson(text, "merge");
      if (count === 0) {
        triggerToast("El archivo no contiene un historial válido.", "error");
        return;
      }
      await refresh();
      triggerToast(`Historial importado: ${count} día(s) fusionado(s).`, "success");
    } catch {
      triggerToast("No se pudo importar el archivo seleccionado.", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if (typeof window !== "undefined" && !window.confirm("¿Eliminar todo el historial local de este navegador?")) {
      return;
    }
    setBusy(true);
    try {
      await repository.clear();
      await refresh(null);
      triggerToast("Historial local eliminado.", "info");
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveDay = async (id: string) => {
    if (typeof window !== "undefined" && !window.confirm(`¿Eliminar el historial del ${formatDayLabel(id)}?`)) {
      return;
    }
    setBusy(true);
    try {
      await repository.remove(id);
      await refresh(null);
      triggerToast("Día eliminado del historial.", "info");
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = (fileType: "cierre_excel" | "etiquetas_pdf") => {
    if (!selectedDay || selectedDay.id !== todayId) {
      triggerToast("Solo el cierre de hoy se puede descargar desde el backend activo.", "info");
      return;
    }
    window.open(`${apiBase}/api/files/download/${fileType}`, "_blank");
  };

  const selectedStatus = selectedDay ? STATUS_CONFIG[selectedDay.status] : null;
  const SelectedStatusIcon = selectedStatus?.icon;
  const canDownloadToday = Boolean(selectedDay && selectedDay.id === todayId);

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-slate-500 hover:text-[#233762] hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
            title="Volver"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          {onNavigateHome && (
            <button
              onClick={onNavigateHome}
              className="p-2 text-slate-500 hover:text-[#233762] hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
              title="Ir al Menú Principal"
            >
              <Home className="w-5 h-5" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-[#EFF3F9] text-[#233762] rounded-lg">
                <Archive className="w-5 h-5" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold text-[#233762] tracking-tight">
                Historial de Trackings y Cierres
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Consulta de trackings rastreados, cierres generados y movimientos por día.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            Local (este navegador)
          </span>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-[#EFF3F9] border border-slate-200 text-[#233762] text-xs font-bold rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar JSON
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-[#EFF3F9] border border-slate-200 text-[#233762] text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            Importar
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            onClick={handleClear}
            disabled={busy || days.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 text-slate-600 hover:text-[#CE3A39] text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Limpiar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-[#EFF3F9] text-[#233762] flex items-center justify-center">
            <Archive className="w-5 h-5" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Días registrados</p>
            <p className="text-xl font-bold text-[#233762]">{totals.days}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-[#FDF2F2] text-[#CE3A39] flex items-center justify-center">
            <Truck className="w-5 h-5" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Trackings</p>
            <p className="text-xl font-bold text-[#233762]">{totals.trackings}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cierres</p>
            <p className="text-xl font-bold text-[#233762]">{totals.closings}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por guía o lote..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#233762]/20"
          />
        </div>
        <select
          value={carrierFilter}
          onChange={(event) => setCarrierFilter(event.target.value as "ALL" | Carrier)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#233762]/20"
        >
          <option value="ALL">Todos los carriers</option>
          <option value="FEDEX">FedEx</option>
          <option value="ESTAFETA">Estafeta</option>
          <option value="DESCONOCIDO">Desconocido</option>
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as "ALL" | HistoryStatus)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#233762]/20"
        >
          <option value="ALL">Todos los estatus</option>
          <option value="ok">Completo</option>
          <option value="partial">Con incidencias</option>
          <option value="error">Con errores</option>
        </select>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-sm text-slate-500">
          Cargando historial...
        </div>
      ) : filteredDays.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <Archive className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700">Sin historial para mostrar</p>
          <p className="text-xs text-slate-500 mt-1">
            Sube un lote, rastrea guías o genera un cierre para empezar a registrar el día.
          </p>
          <p className="text-[10px] text-slate-400 mt-3">
            {userEmail ? `Sesión: ${userEmail}` : "El historial vive solo en este navegador."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col gap-2 max-h-[620px] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h2 className="text-sm font-bold text-[#233762]">Días registrados</h2>
              <span className="text-[10px] font-mono text-slate-400">{filteredDays.length}</span>
            </div>
            {filteredDays.map((day) => {
              const status = STATUS_CONFIG[day.status];
              const StatusIcon = status.icon;
              const isSelected = selectedDay?.id === day.id;
              return (
                <button
                  key={day.id}
                  onClick={() => setSelectedId(day.id)}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    isSelected
                      ? "border-[#233762] bg-[#EFF3F9]/60 ring-2 ring-[#233762]/20"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#233762]">{formatDayLabel(day.id)}</span>
                    <span className="flex items-center gap-1.5">
                      {day.id === todayId && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#CE3A39] text-white">
                          Hoy
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${status.badge}`}>
                        <StatusIcon className="w-2.5 h-2.5" />
                        {status.label}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500 font-medium">
                    <span className="inline-flex items-center gap-1">
                      <Truck className="w-3 h-3" />
                      {day.trackings.length} trackings
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <FileSpreadsheet className="w-3 h-3" />
                      {day.closing ? "1 cierre" : "sin cierre"}
                    </span>
                  </div>
                  {day.batch_filename && (
                    <p className="mt-1.5 text-[10px] text-slate-400 font-mono truncate">{day.batch_filename}</p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {day.sources.map((source) => (
                      <span
                        key={source}
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200"
                      >
                        {SOURCE_LABELS[source]}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-2 flex flex-col gap-4">
            {!selectedDay || !selectedStatus ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-sm text-slate-500">
                Selecciona un día para ver el detalle.
              </div>
            ) : (
              <>
                <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Detalle del día
                      </span>
                      <h3 className="text-lg font-bold text-[#233762]">{formatDayLabel(selectedDay.id)}</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Actualizado {formatTime(selectedDay.updated_at)}
                        {selectedDay.user_email ? ` · ${selectedDay.user_email}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border ${selectedStatus.badge}`}>
                        {SelectedStatusIcon && <SelectedStatusIcon className="w-3 h-3" />}
                        {selectedStatus.label}
                      </span>
                      <button
                        onClick={() => handleRemoveDay(selectedDay.id)}
                        disabled={busy}
                        className="p-1.5 text-slate-400 hover:text-[#CE3A39] hover:bg-red-50 rounded-lg transition-colors border border-slate-200 disabled:opacity-50"
                        title="Eliminar este día del historial"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                    <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Órdenes</p>
                      <p className="text-lg font-bold text-[#233762]">{selectedDay.metrics.total_orders}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-600">Confirmadas</p>
                      <p className="text-lg font-bold text-emerald-700">{selectedDay.metrics.confirmed}</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-amber-700">Revisar</p>
                      <p className="text-lg font-bold text-amber-800">{selectedDay.metrics.review}</p>
                    </div>
                    <div className="rounded-lg bg-red-50 border border-red-100 p-3">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-red-600">Bloqueadas</p>
                      <p className="text-lg font-bold text-red-700">{selectedDay.metrics.error_blocked}</p>
                    </div>
                  </div>

                  {typeof selectedDay.metrics.ready === "number" && (
                    <p className="mt-2 text-[10px] text-slate-500 font-medium">
                      Listas para timbrar: {selectedDay.metrics.ready} · Duplicadas:{" "}
                      {selectedDay.metrics.duplicates ?? 0}
                    </p>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-[#233762] inline-flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-[#CE3A39]" />
                      Cierre del día
                    </h3>
                    {selectedDay.id !== todayId && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        Solo lectura
                      </span>
                    )}
                  </div>
                  {selectedDay.closing ? (
                    <div className="mt-3 flex flex-col gap-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
                          <p className="text-[9px] font-bold uppercase text-slate-400">Órdenes</p>
                          <p className="text-sm font-bold text-[#233762]">{selectedDay.closing.total_orders}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
                          <p className="text-[9px] font-bold uppercase text-slate-400">Asignadas</p>
                          <p className="text-sm font-bold text-[#233762]">{selectedDay.closing.assigned}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
                          <p className="text-[9px] font-bold uppercase text-slate-400">Errores</p>
                          <p className="text-sm font-bold text-[#233762]">{selectedDay.closing.errors}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
                          <p className="text-[9px] font-bold uppercase text-slate-400">Alertas CP</p>
                          <p className="text-sm font-bold text-[#233762]">{selectedDay.closing.cp_alerts}</p>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 border border-slate-100 rounded-lg p-3">
                        <div className="text-[10px] text-slate-600 font-mono truncate">
                          <p>{selectedDay.closing.cierre_file || "Cierre sin nombre registrado"}</p>
                          <p className="text-slate-400">
                            {selectedDay.closing.etiquetas_file || "Sin PDF de etiquetas registrado"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleDownload("cierre_excel")}
                            disabled={!canDownloadToday}
                            title={canDownloadToday ? "Descargar cierre" : "Requiere backend de archivo para días pasados"}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 text-[#233762] text-[10px] font-bold rounded-lg transition-colors hover:bg-[#EFF3F9] disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Download className="w-3 h-3" />
                            Cierre
                          </button>
                          <button
                            onClick={() => handleDownload("etiquetas_pdf")}
                            disabled={!canDownloadToday}
                            title={canDownloadToday ? "Descargar etiquetas" : "Requiere backend de archivo para días pasados"}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 text-[#233762] text-[10px] font-bold rounded-lg transition-colors hover:bg-[#EFF3F9] disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Download className="w-3 h-3" />
                            Etiquetas
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-slate-500">
                      Aún no hay un cierre registrado para este día.
                    </p>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-[#233762] inline-flex items-center gap-2">
                      <Package className="w-4 h-4 text-[#233762]" />
                      Trackings del día
                    </h3>
                    <span className="text-[10px] font-mono text-slate-400">
                      {visibleTrackings.length} / {selectedDay.trackings.length}
                    </span>
                  </div>

                  {visibleTrackings.length === 0 ? (
                    <p className="mt-3 text-xs text-slate-500">Sin trackings que coincidan con los filtros.</p>
                  ) : (
                    <div className="mt-3 overflow-x-auto max-h-[320px] overflow-y-auto rounded-lg border border-slate-100">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] tracking-wider sticky top-0">
                          <tr>
                            <th className="px-3 py-2 font-bold">Guía</th>
                            <th className="px-3 py-2 font-bold">Carrier</th>
                            <th className="px-3 py-2 font-bold">Estatus</th>
                            <th className="px-3 py-2 font-bold text-center">Eventos</th>
                            <th className="px-3 py-2 font-bold text-right">Consultado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {visibleTrackings.map((tracking) => (
                            <tr key={tracking.guia} className="hover:bg-slate-50/70">
                              <td className="px-3 py-2 font-mono font-bold text-[#233762]">{tracking.guia}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded border ${CARRIER_STYLES[tracking.carrier]}`}>
                                  {tracking.carrier}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-slate-600 font-medium">{tracking.estatus}</td>
                              <td className="px-3 py-2 text-center text-slate-500">
                                {typeof tracking.eventos === "number" ? tracking.eventos : "—"}
                              </td>
                              <td className="px-3 py-2 text-right text-slate-400 inline-flex items-center gap-1 justify-end">
                                <Clock className="w-3 h-3" />
                                {formatTime(tracking.consultado_en)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
