"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Truck,
  Search,
  RefreshCw,
  Download,
  FileSpreadsheet,
  Clock,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  ArrowRight,
  Copy,
  Trash2,
  X,
  History,
  Sparkles,
  Package,
  Filter,
  ShieldAlert,
  ChevronRight,
  Info,
} from "lucide-react";

export type UnifiedTrackingStatus =
  | "RECOLECTADO"
  | "EN_TRANSITO"
  | "EN_REPARTO"
  | "ENTREGADO"
  | "INCIDENCIA"
  | "DESCONOCIDO";

export interface TrackingEventItem {
  fecha: string;
  ubicacion: string;
  descripcion: string;
  estatus: UnifiedTrackingStatus;
  codigo_raw?: string | null;
}

export interface TrackingResultItem {
  carrier: string;
  guia: string;
  estatus_general: UnifiedTrackingStatus;
  fecha_estimada_entrega?: string | null;
  fecha_entrega_real?: string | null;
  origen?: string | null;
  destino?: string | null;
  eventos: TrackingEventItem[];
  ultima_actualizacion: string;
  es_ambiguo?: boolean;
  candidatos_carrier?: string[];
  retrasado?: boolean;
  modo_simulacion?: boolean;
  desde_cache?: boolean;
  error?: string | null;
  codigo_error?: string | null;
}

interface RecentGuideItem {
  guia: string;
  carrier: string;
  estatus: UnifiedTrackingStatus;
  consultado_en: string;
}

interface OrderItemLike {
  order_id: string;
  type?: string;
  carrier?: string;
  tracking_number?: string;
  city?: string;
  state?: string;
  [key: string]: any;
}

interface TransportTrackerProps {
  batchData: {
    orders?: OrderItemLike[];
    batch_filename?: string;
    [key: string]: any;
  } | null;
  apiBase: string;
  triggerToast: (message: string, type: "success" | "error" | "info") => void;
  userEmail?: string;
  userRole?: string;
}

const RECENT_STORAGE_KEY = "sc_transport_recent_guides_v1";
const MAX_RECENT_ITEMS = 15;
const MAX_BATCH_SIZE = 50;

/**
 * Extrae y limpia una lista de números de guía a partir de un texto libre.
 * Soporta guías pegadas por salto de línea, coma, punto y coma o espacio,
 * preservando guías pegadas con espacios internos como "8793 8866 3139".
 */
export function parseGuidesInput(rawText: string): string[] {
  if (!rawText || !rawText.trim()) return [];

  const results: string[] = [];
  const seen = new Set<string>();

  // 1. Dividir primero por saltos de línea, comas o punto y coma
  const lines = rawText.split(/[\r\n,;]+/);

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Si la línea contiene grupos de 3-4 dígitos separados por espacio que juntos suman 10, 12, 15 o 22 dígitos
    // (ej. "8793 8866 3139"), unirlos como una sola guía.
    const compactCandidate = trimmed.replace(/[\s\-]+/g, "").toUpperCase();
    const tokens = trimmed.split(/\s+/);

    if (
      tokens.length > 1 &&
      tokens.every((t) => /^\d{2,6}$/.test(t)) &&
      [10, 12, 15, 20, 22].includes(compactCandidate.length)
    ) {
      if (!seen.has(compactCandidate)) {
        seen.add(compactCandidate);
        results.push(compactCandidate);
      }
      continue;
    }

    // De lo contrario, cada token separado por espacio es una guía individual
    for (const token of tokens) {
      const cleaned = token.replace(/[\s\-_]+/g, "").toUpperCase();
      if (!cleaned) continue;
      if (!seen.has(cleaned)) {
        seen.add(cleaned);
        results.push(cleaned);
      }
    }
  }

  return results;
}

function getStandardRastreoFileName(ext: "xlsx" | "csv"): string {
  const MESES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  const now = new Date();
  const dia = String(now.getDate()).padStart(2, "0");
  const mes = MESES[now.getMonth()] || "Mes";
  return `RASTREO_${dia}_${mes}.${ext}`;
}

/**
 * Pre-detección ligera en cliente para mostrar vista previa inmediata mientras el usuario escribe.
 */
function previewDetectCarrier(guia: string): "FEDEX" | "ESTAFETA" | "AMBIGUO" {
  const clean = guia.replace(/[\s\-]+/g, "").toUpperCase();
  if (/^DT\d{12}$/.test(clean)) return "FEDEX";
  if (/^\d+$/.test(clean) && [12, 15, 20, 34].includes(clean.length)) return "FEDEX";
  if (clean.length === 22 && ! clean.startsWith("92") && !clean.startsWith("96")) return "ESTAFETA";
  return "AMBIGUO";
}

export const STATUS_UI_CONFIG: Record<
  UnifiedTrackingStatus,
  {
    label: string;
    badgeClass: string;
    dotClass: string;
  }
> = {
  ENTREGADO: {
    label: "Entregado",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dotClass: "bg-emerald-500",
  },
  EN_TRANSITO: {
    label: "En Tránsito",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    dotClass: "bg-blue-500",
  },
  RECOLECTADO: {
    label: "Recolectado",
    badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
    dotClass: "bg-indigo-500",
  },
  EN_REPARTO: {
    label: "En Reparto",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-300",
    dotClass: "bg-amber-500",
  },
  INCIDENCIA: {
    label: "Incidencia",
    badgeClass: "bg-red-50 text-[#CE3A39] border-red-200",
    dotClass: "bg-[#CE3A39]",
  },
  DESCONOCIDO: {
    label: "Desconocido",
    badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
    dotClass: "bg-slate-400",
  },
};

export default function TransportTracker({
  batchData,
  apiBase,
  triggerToast,
  userEmail = "operador@supplychain.mx",
  userRole = "ADMIN",
}: TransportTrackerProps) {
  // Entrada de búsqueda masiva / individual
  const [rawInput, setRawInput] = useState<string>("");
  const [forcedCarrier, setForcedCarrier] = useState<string>("AUTO");

  // Resultados de rastreo actuales
  const [results, setResults] = useState<TrackingResultItem[]>([]);
  const [isBatchLoading, setIsBatchLoading] = useState<boolean>(false);
  const [refreshingGuides, setRefreshingGuides] = useState<Set<string>>(new Set());
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);

  // Filtros de la tabla
  const [carrierFilter, setCarrierFilter] = useState<"ALL" | "FEDEX" | "ESTAFETA">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | UnifiedTrackingStatus | "DELAYED_OR_ISSUE">("ALL");
  const [tableSearch, setTableSearch] = useState<string>("");

  // Guía seleccionada para el panel lateral (línea de tiempo)
  const [selectedGuideKey, setSelectedGuideKey] = useState<string | null>(null);

  // Historial reciente en localStorage
  const [recentGuides, setRecentGuides] = useState<RecentGuideItem[]>([]);

  // Estado de configuración de carriers en el backend
  const [carrierConfig, setCarrierConfig] = useState<{
    FEDEX: boolean;
    ESTAFETA: boolean;
    mock_fallback: boolean;
  } | null>(null);

  // Cargar historial desde localStorage y consultar estado de configuración del backend
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(RECENT_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setRecentGuides(parsed.slice(0, MAX_RECENT_ITEMS));
          }
        }
      } catch {
        // Ignorar errores de parseo en localStorage
      }
    }

    fetch(`${apiBase}/api/tracking/config-status`, {
      headers: {
        "X-User-Email": userEmail,
        "X-User-Role": userRole,
      },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.carriers) {
          setCarrierConfig({
            FEDEX: Boolean(data.carriers.FEDEX?.configured),
            ESTAFETA: Boolean(data.carriers.ESTAFETA?.configured),
            mock_fallback: Boolean(data.mock_fallback_enabled),
          });
        }
      })
      .catch(() => {});
  }, [apiBase, userEmail, userRole]);

  // Guardar en historial de localStorage
  const saveToRecentHistory = useCallback((newItems: TrackingResultItem[]) => {
    setRecentGuides((prev) => {
      const nowStr = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
      const updatedMap = new Map<string, RecentGuideItem>();

      for (const item of newItems) {
        if (!item.guia) continue;
        updatedMap.set(item.guia, {
          guia: item.guia,
          carrier: item.carrier,
          estatus: item.estatus_general,
          consultado_en: nowStr,
        });
      }

      for (const old of prev) {
        if (!updatedMap.has(old.guia)) {
          updatedMap.set(old.guia, old);
        }
      }

      const nextList = Array.from(updatedMap.values()).slice(0, MAX_RECENT_ITEMS);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(nextList));
        } catch {}
      }
      return nextList;
    });
  }, []);

  const clearRecentHistory = () => {
    setRecentGuides([]);
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(RECENT_STORAGE_KEY);
      } catch {}
    }
    triggerToast("Historial de búsquedas recientes limpiado.", "info");
  };

  // Guías detectadas en tiempo real en el input
  const parsedInputGuides = useMemo(() => parseGuidesInput(rawInput), [rawInput]);

  const inputPreviewSummary = useMemo(() => {
    let fedex = 0;
    let estafeta = 0;
    let ambiguo = 0;
    for (const g of parsedInputGuides) {
      const det = previewDetectCarrier(g);
      if (det === "FEDEX") fedex++;
      else if (det === "ESTAFETA") estafeta++;
      else ambiguo++;
    }
    return { total: parsedInputGuides.length, fedex, estafeta, ambiguo };
  }, [parsedInputGuides]);

  // Guías disponibles en el lote activo de ServiceNow / Techship
  const activeBatchGuides = useMemo(() => {
    if (!batchData?.orders || !Array.isArray(batchData.orders)) return [];
    const seen = new Set<string>();
    const list: { guia: string; carrier?: string }[] = [];

    for (const order of batchData.orders) {
      const rawTn = order.tracking_number ? String(order.tracking_number).trim() : "";
      if (!rawTn || rawTn === "None" || rawTn === "null") continue;
      const clean = rawTn.replace(/[\s\-]+/g, "").toUpperCase();
      if (clean && !seen.has(clean)) {
        seen.add(clean);
        list.push({ guia: clean, carrier: order.carrier });
      }
    }
    return list;
  }, [batchData]);

  // Ejecutar consulta por lote al backend
  const executeBatchTracking = useCallback(
    async (guidesToTrack: string[], carrierOverride?: string | null, forceRefresh: boolean = false) => {
      if (guidesToTrack.length === 0) {
        triggerToast("Ingresa al menos un número de guía para rastrear.", "error");
        return;
      }

      if (guidesToTrack.length > MAX_BATCH_SIZE) {
        triggerToast(
          `Se procesarán las primeras ${MAX_BATCH_SIZE} guías (máximo permitido por consulta).`,
          "info"
        );
      }

      const slice = guidesToTrack.slice(0, MAX_BATCH_SIZE);
      setIsBatchLoading(true);

      try {
        const res = await fetch(`${apiBase}/api/tracking/batch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-Email": userEmail,
            "X-User-Role": userRole,
          },
          body: JSON.stringify({
            guias: slice,
            carrier: carrierOverride && carrierOverride !== "AUTO" ? carrierOverride : null,
            force_refresh: forceRefresh,
          }),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.detail || `Error al consultar el rastreo (HTTP ${res.status})`);
        }

        const data = await res.json();
        const incoming: TrackingResultItem[] = data.results || [];

        setResults((prev) => {
          const map = new Map<string, TrackingResultItem>();
          // Poner primero las recién consultadas y preservar el resto
          for (const item of incoming) {
            map.set(item.guia, item);
          }
          for (const old of prev) {
            if (!map.has(old.guia)) {
              map.set(old.guia, old);
            }
          }
          return Array.from(map.values());
        });

        saveToRecentHistory(incoming);
        triggerToast(
          `Rastreo completado: ${incoming.length} ${incoming.length === 1 ? "guía actualizada" : "guías actualizadas"}.`,
          "success"
        );
      } catch (err: any) {
        triggerToast(err.message || "Error de conexión al rastrear las guías.", "error");
      } finally {
        setIsBatchLoading(false);
      }
    },
    [apiBase, saveToRecentHistory, triggerToast, userEmail, userRole]
  );

  // Actualizar una sola guía
  const handleRefreshSingleGuide = async (guia: string, carrier?: string) => {
    setRefreshingGuides((prev) => new Set(prev).add(guia));
    try {
      const params = new URLSearchParams({ force_refresh: "true" });
      if (carrier && carrier !== "DESCONOCIDO") {
        params.set("carrier", carrier);
      }
      const res = await fetch(`${apiBase}/api/tracking/${encodeURIComponent(guia)}?${params.toString()}`, {
        headers: {
          "X-User-Email": userEmail,
          "X-User-Role": userRole,
        },
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.detail || `No se pudo actualizar la guía ${guia}`);
      }

      const updated: TrackingResultItem = await res.json();
      setResults((prev) => prev.map((item) => (item.guia === guia ? updated : item)));
      saveToRecentHistory([updated]);
      triggerToast(`Guía ${guia} actualizada desde ${updated.carrier}.`, "success");
    } catch (err: any) {
      triggerToast(err.message || "Error al actualizar la guía.", "error");
    } finally {
      setRefreshingGuides((prev) => {
        const next = new Set(prev);
        next.delete(guia);
        return next;
      });
    }
  };

  // Actualizar todas las guías actualmente en la tabla
  const handleRefreshAll = async () => {
    if (results.length === 0) return;
    const allGuides = results.map((r) => r.guia);
    await executeBatchTracking(allGuides, null, true);
  };

  // Rastrear guías desde la barra de búsqueda
  const handleSubmitSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (parsedInputGuides.length === 0) {
      triggerToast("Pega o escribe al menos un número de guía válido.", "error");
      return;
    }
    await executeBatchTracking(
      parsedInputGuides,
      forcedCarrier !== "AUTO" ? forcedCarrier : null,
      false
    );
  };

  // Rastrear lote activo de la operación del día
  const handleTrackActiveBatch = async () => {
    if (activeBatchGuides.length === 0) {
      triggerToast("El lote activo aún no tiene números de guía asignados.", "info");
      return;
    }
    const guides = activeBatchGuides.map((g) => g.guia);
    setRawInput(guides.join("\n"));
    await executeBatchTracking(guides, null, false);
  };

  // Cargar lote de demostración con todos los escenarios (Entregado, En Reparto, En Tránsito, Incidencia, Retrasado)
  const handleLoadDemoGuides = async () => {
    const demoGuides = [
      "879388663131", // FedEx 12 dígitos -> Entregado
      "0055987105810101025692", // Estafeta 22 dígitos -> En Reparto
      "879388663139", // FedEx 12 dígitos -> Incidencia + Retrasado
      "0055987105810101025698", // Estafeta 22 dígitos -> En Tránsito + Retrasado
      "794812345674", // FedEx 12 dígitos -> En Tránsito a tiempo
    ];
    setRawInput(demoGuides.join("\n"));
    await executeBatchTracking(demoGuides, null, false);
  };

  // Métricas / KPIs sobre los resultados actuales
  const metrics = useMemo(() => {
    const total = results.length;
    const entregados = results.filter((r) => r.estatus_general === "ENTREGADO").length;
    const enRuta = results.filter(
      (r) =>
        r.estatus_general === "EN_TRANSITO" ||
        r.estatus_general === "EN_REPARTO" ||
        r.estatus_general === "RECOLECTADO"
    ).length;
    const incidenciasORetrasos = results.filter(
      (r) => r.estatus_general === "INCIDENCIA" || r.retrasado || Boolean(r.error)
    ).length;
    return { total, entregados, enRuta, incidenciasORetrasos };
  }, [results]);

  // Filtrado de la tabla
  const filteredResults = useMemo(() => {
    return results.filter((item) => {
      if (carrierFilter !== "ALL" && item.carrier !== carrierFilter) {
        return false;
      }

      if (statusFilter === "DELAYED_OR_ISSUE") {
        if (item.estatus_general !== "INCIDENCIA" && !item.retrasado && !item.error) {
          return false;
        }
      } else if (statusFilter !== "ALL" && item.estatus_general !== statusFilter) {
        return false;
      }

      if (tableSearch.trim()) {
        const q = tableSearch.trim().toLowerCase();
        const lastDesc = item.eventos[0]?.descripcion?.toLowerCase() || "";
        const match =
          item.guia.toLowerCase().includes(q) ||
          item.carrier.toLowerCase().includes(q) ||
          (item.origen || "").toLowerCase().includes(q) ||
          (item.destino || "").toLowerCase().includes(q) ||
          lastDesc.includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [results, carrierFilter, statusFilter, tableSearch]);

  // Guía seleccionada para el Drawer de Línea de Tiempo
  const selectedItem = useMemo(
    () => results.find((r) => r.guia === selectedGuideKey) || null,
    [results, selectedGuideKey]
  );

  // Exportar a CSV en el navegador (con UTF-8 BOM para acentos en Excel)
  const handleExportCsv = () => {
    if (filteredResults.length === 0) {
      triggerToast("No hay resultados en la tabla para exportar.", "info");
      return;
    }

    const headers = [
      "Guia",
      "Carrier",
      "Estatus",
      "Retrasado",
      "Origen",
      "Destino",
      "Fecha Estimada Entrega",
      "Fecha Entrega Real",
      "Ultimo Evento",
      "Ubicacion Ultimo Evento",
      "Ultima Actualizacion",
    ];

    const escapeCsv = (val: string | null | undefined) => {
      const s = String(val ?? "").replace(/"/g, '""');
      return `"${s}"`;
    };

    const rows = filteredResults.map((r) => {
      const lastEv = r.eventos[0];
      return [
        escapeCsv(r.guia),
        escapeCsv(r.carrier),
        escapeCsv(STATUS_UI_CONFIG[r.estatus_general]?.label || r.estatus_general),
        escapeCsv(r.retrasado ? "SI" : "NO"),
        escapeCsv(r.origen || "—"),
        escapeCsv(r.destino || "—"),
        escapeCsv(r.fecha_estimada_entrega || "—"),
        escapeCsv(r.fecha_entrega_real || "—"),
        escapeCsv(lastEv ? lastEv.descripcion : r.error || "Sin eventos"),
        escapeCsv(lastEv ? lastEv.ubicacion : "—"),
        escapeCsv(r.ultima_actualizacion),
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.setAttribute("download", getStandardRastreoFileName("csv"));
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    triggerToast("Archivo CSV descargado correctamente.", "success");
  };

  // Exportar a Excel (.xlsx) institucional desde el backend
  const handleExportExcel = async () => {
    if (filteredResults.length === 0) {
      triggerToast("No hay resultados en la tabla para exportar.", "info");
      return;
    }

    try {
      setIsExportingExcel(true);
      const res = await fetch(`${apiBase}/api/tracking/export-excel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Email": userEmail,
          "X-User-Role": userRole,
        },
        body: JSON.stringify({ resultados: filteredResults }),
      });

      if (!res.ok) {
        throw new Error("No se pudo generar el archivo Excel (.xlsx)");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.setAttribute("download", getStandardRastreoFileName("xlsx"));
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      triggerToast("Reporte Excel (.xlsx) descargado correctamente.", "success");
    } catch (err: any) {
      triggerToast(err.message || "Error al exportar a Excel.", "error");
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleCopyGuide = (e: React.MouseEvent, guia: string) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(guia);
    triggerToast(`Guía ${guia} copiada al portapapeles.`, "info");
  };

  const handleRemoveGuideRow = (e: React.MouseEvent, guia: string) => {
    e.stopPropagation();
    setResults((prev) => prev.filter((r) => r.guia !== guia));
    if (selectedGuideKey === guia) {
      setSelectedGuideKey(null);
    }
  };

  return (
    <main className="w-full max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 flex flex-col gap-5">
      {/* ==================================================================== */}
      {/* ZONA 1: KPIs Y ESTADO DE CONEXIÓN DE CARRIERS                        */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => setStatusFilter("ALL")}
          className={`bg-white rounded-xl border p-4 text-left transition-all shadow-xs hover:shadow-md cursor-pointer ${
            statusFilter === "ALL" ? "border-[#233762] ring-1 ring-[#233762]/20" : "border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Guías Consultadas
            </span>
            <div className="w-8 h-8 rounded-lg bg-[#EFF3F9] text-[#233762] flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#233762] mt-2 font-mono">{metrics.total}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Clic para mostrar todas las guías</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter("ENTREGADO")}
          className={`bg-white rounded-xl border p-4 text-left transition-all shadow-xs hover:shadow-md cursor-pointer ${
            statusFilter === "ENTREGADO" ? "border-emerald-600 ring-1 ring-emerald-600/20" : "border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Entregados</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-emerald-700 mt-2 font-mono">{metrics.entregados}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Envíos finalizados con éxito</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter("EN_TRANSITO")}
          className={`bg-white rounded-xl border p-4 text-left transition-all shadow-xs hover:shadow-md cursor-pointer ${
            statusFilter === "EN_TRANSITO" ? "border-blue-600 ring-1 ring-blue-600/20" : "border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              En Tránsito / Reparto
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-blue-700 mt-2 font-mono">{metrics.enRuta}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Unidades en movimiento activo</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter("DELAYED_OR_ISSUE")}
          className={`bg-white rounded-xl border p-4 text-left transition-all shadow-xs hover:shadow-md cursor-pointer ${
            statusFilter === "DELAYED_OR_ISSUE"
              ? "border-[#CE3A39] ring-1 ring-[#CE3A39]/20"
              : "border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Incidencias / Retrasos
            </span>
            <div className="w-8 h-8 rounded-lg bg-red-50 text-[#CE3A39] flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#CE3A39] mt-2 font-mono">
            {metrics.incidenciasORetrasos}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Excepciones o fecha estimada vencida</p>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* ZONA 2: BARRA DE BÚSQUEDA ÚNICA MULTI-GUÍA + LOTES ACTIVOS           */}
      {/* ==================================================================== */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-bold text-[#233762] flex items-center gap-2">
              <Search className="w-4 h-4 text-[#CE3A39]" />
              <span>Rastreo Inteligente de Guías (FedEx y Estafeta)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pega una o hasta 50 guías separadas por salto de línea, coma o espacio. El sistema detecta el carrier automáticamente.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Indicadores de conexión API de cada Carrier */}
            {carrierConfig && (
              <div className="hidden xl:flex items-center gap-2 mr-2 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-[11px]">
                <span className="text-slate-500 font-semibold">APIs:</span>
                <span className="inline-flex items-center gap-1 font-mono font-bold text-[#233762]">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      carrierConfig.FEDEX ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                  FedEx {carrierConfig.FEDEX ? "Live" : "Simulador"}
                </span>
                <span className="text-slate-300">|</span>
                <span className="inline-flex items-center gap-1 font-mono font-bold text-[#CE3A39]">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      carrierConfig.ESTAFETA ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                  Estafeta {carrierConfig.ESTAFETA ? "Live" : "Simulador"}
                </span>
              </div>
            )}

            {/* Botón para rastrear el lote activo del día si tiene guías */}
            {activeBatchGuides.length > 0 && (
              <button
                type="button"
                onClick={handleTrackActiveBatch}
                disabled={isBatchLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EFF3F9] hover:bg-slate-200/80 text-[#233762] border border-[#233762]/20 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                title="Rastrear todas las guías del lote activo en Automatizador de Operación"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#CE3A39]" />
                <span>Rastrear lote actual ({activeBatchGuides.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleLoadDemoGuides}
              disabled={isBatchLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
              title="Cargar 5 guías de ejemplo de FedEx y Estafeta para probar estados y línea de tiempo"
            >
              <Truck className="w-3.5 h-3.5 text-[#233762]" />
              <span>Probar guías ejemplo</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmitSearch} className="flex flex-col lg:flex-row gap-3 items-stretch">
          <div className="relative flex-1">
            <textarea
              rows={2}
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleSubmitSearch();
                }
              }}
              placeholder="Ejemplo: 879388663139, 0055987105810101025695 (puedes pegar una columna directa desde Excel)..."
              className="w-full rounded-xl border border-slate-300 bg-slate-50/60 focus:bg-white px-3.5 py-2.5 text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#233762]/20 focus:border-[#233762] transition resize-y"
            />
            {rawInput && (
              <button
                type="button"
                onClick={() => setRawInput("")}
                className="absolute top-2.5 right-2.5 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
                title="Limpiar entrada"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
            <div className="flex flex-col justify-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 min-w-[175px]">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Carrier
              </label>
              <select
                value={forcedCarrier}
                onChange={(e) => setForcedCarrier(e.target.value)}
                className="text-xs font-bold text-[#233762] bg-transparent focus:outline-none cursor-pointer mt-0.5"
              >
                <option value="AUTO">Autodetectar (Recomendado)</option>
                <option value="FEDEX">Forzar FedEx</option>
                <option value="ESTAFETA">Forzar Estafeta</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={isBatchLoading || parsedInputGuides.length === 0}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#233762] hover:bg-[#1b2b4d] text-white text-xs font-bold shadow-sm transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed min-w-[160px]"
            >
              <RefreshCw className={`w-4 h-4 ${isBatchLoading ? "animate-spin" : ""}`} />
              <span>
                {isBatchLoading
                  ? "Rastreando..."
                  : parsedInputGuides.length > 0
                  ? `Rastrear (${Math.min(parsedInputGuides.length, MAX_BATCH_SIZE)})`
                  : "Rastrear Guías"}
              </span>
            </button>
          </div>
        </form>

        {/* Vista previa instantánea de detección + Historial reciente */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {inputPreviewSummary.total > 0 ? (
              <>
                <span className="text-[11px] font-bold text-slate-500">
                  Detectadas ({inputPreviewSummary.total}):
                </span>
                {inputPreviewSummary.fedex > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-[#EFF3F9] text-[#233762] font-mono text-[11px] font-bold border border-[#233762]/20">
                    {inputPreviewSummary.fedex} FedEx
                  </span>
                )}
                {inputPreviewSummary.estafeta > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-[#FDF2F2] text-[#CE3A39] font-mono text-[11px] font-bold border border-[#CE3A39]/20">
                    {inputPreviewSummary.estafeta} Estafeta
                  </span>
                )}
                {inputPreviewSummary.ambiguo > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-mono text-[11px] font-bold border border-amber-200">
                    {inputPreviewSummary.ambiguo} Ambigua(s) (se probarán ambos)
                  </span>
                )}
              </>
            ) : (
              <span className="text-[11px] text-slate-400">
                Tip: Presiona <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-[10px]">Ctrl + Enter</kbd> para consultar rápidamente.
              </span>
            )}
          </div>

          {/* Chips de historial reciente en localStorage */}
          {recentGuides.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 font-semibold mr-1">
                <History className="w-3 h-3" />
                Recientes:
              </span>
              {recentGuides.slice(0, 5).map((item) => (
                <button
                  key={item.guia}
                  type="button"
                  onClick={() => executeBatchTracking([item.guia], item.carrier, false)}
                  className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-[#EFF3F9] text-slate-700 hover:text-[#233762] border border-slate-200 text-[11px] font-mono transition cursor-pointer"
                  title={`Volver a consultar ${item.guia} (${item.carrier})`}
                >
                  {item.guia}
                </button>
              ))}
              <button
                type="button"
                onClick={clearRecentHistory}
                className="text-[11px] text-slate-400 hover:text-[#CE3A39] ml-1 underline cursor-pointer"
                title="Borrar historial reciente guardado en este navegador"
              >
                Limpiar
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ==================================================================== */}
      {/* ZONA 3: BARRA DE HERRAMIENTAS DE TABLA, FILTROS Y EXPORTACIÓN        */}
      {/* ==================================================================== */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex-1 flex flex-col">
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
          {/* Filtros por Carrier y por Estatus */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center p-1 rounded-xl bg-slate-200/70 text-xs font-bold">
              <button
                type="button"
                onClick={() => setCarrierFilter("ALL")}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  carrierFilter === "ALL"
                    ? "bg-[#233762] text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Todos ({results.length})
              </button>
              <button
                type="button"
                onClick={() => setCarrierFilter("FEDEX")}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer font-mono ${
                  carrierFilter === "FEDEX"
                    ? "bg-[#233762] text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                FEDEX ({results.filter((r) => r.carrier === "FEDEX").length})
              </button>
              <button
                type="button"
                onClick={() => setCarrierFilter("ESTAFETA")}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer font-mono ${
                  carrierFilter === "ESTAFETA"
                    ? "bg-[#CE3A39] text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                ESTAFETA ({results.filter((r) => r.carrier === "ESTAFETA").length})
              </button>
            </div>

            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="ALL">Todos los estatus</option>
                <option value="ENTREGADO">Entregado</option>
                <option value="EN_TRANSITO">En Tránsito</option>
                <option value="EN_REPARTO">En Reparto</option>
                <option value="RECOLECTADO">Recolectado</option>
                <option value="INCIDENCIA">Solo Incidencias</option>
                <option value="DELAYED_OR_ISSUE">Incidencias o Retrasados</option>
                <option value="DESCONOCIDO">Desconocido</option>
              </select>
            </div>

            {/* Buscador interno de la tabla */}
            <div className="relative min-w-[210px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Buscar guía, origen, destino..."
                className="w-full pl-8 pr-7 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-[#233762]"
              />
              {tableSearch && (
                <button
                  type="button"
                  onClick={() => setTableSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Botones Actualizar Todo y Exportación CSV / Excel */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRefreshAll}
              disabled={results.length === 0 || isBatchLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-[#EFF3F9] text-[#233762] text-xs font-bold transition shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Ignorar caché y consultar nuevamente todas las guías de la tabla"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isBatchLoading ? "animate-spin" : ""}`} />
              <span>Actualizar todo</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredResults.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Descargar vista actual en formato CSV compatible con Excel"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>CSV</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={filteredResults.length === 0 || isExportingExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#233762]/30 bg-[#EFF3F9] hover:bg-slate-200/80 text-[#233762] text-xs font-bold transition shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Descargar reporte institucional formateado en Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#233762]" />
              <span>{isExportingExcel ? "Generando..." : "Excel (.xlsx)"}</span>
            </button>

            {results.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setResults([]);
                  setSelectedGuideKey(null);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-red-200 bg-red-50/70 hover:bg-red-100 text-[#CE3A39] text-xs font-bold transition cursor-pointer"
                title="Limpiar tabla de resultados"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ==================================================================== */}
        {/* TABLA DE RESULTADOS DE RASTREO                                       */}
        {/* ==================================================================== */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#233762] text-white text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3 px-4">Guía</th>
                <th className="py-3 px-3">Carrier</th>
                <th className="py-3 px-3">Estatus</th>
                <th className="py-3 px-4">Origen → Destino</th>
                <th className="py-3 px-3">Entrega Estimada / Real</th>
                <th className="py-3 px-4">Último Movimiento</th>
                <th className="py-3 px-3">Actualizado</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {/* Skeletons durante carga inicial */}
              {isBatchLoading && results.length === 0 ? (
                Array.from({ length: 4 }).map((_, idx) => (
                  <tr key={`skel-${idx}`} className="animate-pulse">
                    <td className="py-4 px-4">
                      <div className="h-4 w-32 bg-slate-200 rounded" />
                    </td>
                    <td className="py-4 px-3">
                      <div className="h-5 w-20 bg-slate-200 rounded-full" />
                    </td>
                    <td className="py-4 px-3">
                      <div className="h-5 w-24 bg-slate-200 rounded-full" />
                    </td>
                    <td className="py-4 px-4">
                      <div className="h-4 w-44 bg-slate-200 rounded" />
                    </td>
                    <td className="py-4 px-3">
                      <div className="h-4 w-24 bg-slate-200 rounded" />
                    </td>
                    <td className="py-4 px-4">
                      <div className="h-4 w-56 bg-slate-200 rounded" />
                    </td>
                    <td className="py-4 px-3">
                      <div className="h-4 w-24 bg-slate-200 rounded" />
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="h-6 w-16 bg-slate-200 rounded ml-auto" />
                    </td>
                  </tr>
                ))
              ) : filteredResults.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 px-6 text-center">
                    <div className="max-w-md mx-auto flex flex-col items-center">
                      <div className="w-12 h-12 rounded-2xl bg-[#EFF3F9] text-[#233762] flex items-center justify-center mb-3">
                        <Truck className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-bold text-[#233762]">
                        {results.length === 0
                          ? "Aún no has consultado ninguna guía"
                          : "No hay guías que coincidan con el filtro seleccionado"}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {results.length === 0
                          ? "Pega uno o varios números de guía de FedEx o Estafeta arriba, o usa el botón 'Probar guías ejemplo' para ver el rastreador en acción."
                          : "Prueba cambiando el filtro de carrier o estatus para ver todos los resultados."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredResults.map((item) => {
                  const statusCfg = STATUS_UI_CONFIG[item.estatus_general] || STATUS_UI_CONFIG.DESCONOCIDO;
                  const isIssueOrDelayed =
                    item.estatus_general === "INCIDENCIA" || Boolean(item.retrasado);
                  const isRefreshing = refreshingGuides.has(item.guia);
                  const lastEvent = item.eventos[0];
                  const isSelected = selectedGuideKey === item.guia;

                  return (
                    <tr
                      key={item.guia}
                      onClick={() => setSelectedGuideKey(item.guia)}
                      className={`transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-blue-50/70 hover:bg-blue-100/60"
                          : isIssueOrDelayed
                          ? "bg-red-50/35 hover:bg-red-50/70"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      {/* Columna 1: Guía */}
                      <td className="py-3.5 px-4 font-mono font-bold text-[#233762]">
                        <div className="flex items-center gap-1.5">
                          {isIssueOrDelayed && (
                            <span
                              className="w-1.5 h-5 rounded-full bg-[#CE3A39] shrink-0"
                              title="Atención requerida: Incidencia o envío retrasado"
                            />
                          )}
                          <span>{item.guia}</span>
                          <button
                            type="button"
                            onClick={(e) => handleCopyGuide(e, item.guia)}
                            className="p-1 rounded hover:bg-slate-200/70 text-slate-400 hover:text-[#233762] transition cursor-pointer"
                            title="Copiar número de guía"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">
                          {item.desde_cache && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-500">
                              Caché 10m
                            </span>
                          )}
                          {item.modo_simulacion && (
                            <span
                              className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200"
                              title="Respuesta generada en modo simulador (configura tus API keys en .env para consulta en vivo)"
                            >
                              Simulación
                            </span>
                          )}
                          {item.es_ambiguo && (
                            <span
                              className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200"
                              title={`Formato compatible con: ${(item.candidatos_carrier || []).join(" / ")}`}
                            >
                              Ambiguo
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Columna 2: Carrier */}
                      <td className="py-3.5 px-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-md font-mono text-[11px] font-bold border ${
                            item.carrier === "FEDEX"
                              ? "bg-[#EFF3F9] text-[#233762] border-[#233762]/25"
                              : item.carrier === "ESTAFETA"
                              ? "bg-[#FDF2F2] text-[#CE3A39] border-[#CE3A39]/25"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          {item.carrier}
                        </span>
                      </td>

                      {/* Columna 3: Estatus */}
                      <td className="py-3.5 px-3">
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold border ${statusCfg.badgeClass}`}
                          >
                            <span className={`w-2 h-2 rounded-full ${statusCfg.dotClass}`} />
                            {statusCfg.label}
                          </span>
                          {item.retrasado && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#CE3A39] text-white font-mono text-[10px] font-bold">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              RETRASADO
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Columna 4: Origen -> Destino */}
                      <td className="py-3.5 px-4 text-slate-700">
                        {item.origen || item.destino ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-slate-700">{item.origen || "Origen s/d"}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-[#CE3A39] shrink-0" />
                            <span className="font-bold text-[#233762]">{item.destino || "Destino s/d"}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Sin ruta reportada</span>
                        )}
                      </td>

                      {/* Columna 5: Fecha estimada / real */}
                      <td className="py-3.5 px-3 font-mono text-xs">
                        {item.estatus_general === "ENTREGADO" && item.fecha_entrega_real ? (
                          <div>
                            <span className="text-[10px] uppercase font-sans font-bold text-emerald-700 block">
                              Entregado el:
                            </span>
                            <span className="text-emerald-800 font-bold">{item.fecha_entrega_real}</span>
                          </div>
                        ) : item.fecha_estimada_entrega ? (
                          <div>
                            <span className="text-[10px] uppercase font-sans font-bold text-slate-400 block">
                              Estimada:
                            </span>
                            <span
                              className={`font-bold ${
                                item.retrasado ? "text-[#CE3A39] underline" : "text-slate-700"
                              }`}
                            >
                              {item.fecha_estimada_entrega}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Columna 6: Último Movimiento */}
                      <td className="py-3.5 px-4 max-w-xs">
                        {lastEvent ? (
                          <div>
                            <p className="font-semibold text-slate-800 line-clamp-1">
                              {lastEvent.descripcion}
                            </p>
                            <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">{lastEvent.ubicacion}</span>
                              <span className="text-slate-300">•</span>
                              <span className="font-mono text-[10px]">{lastEvent.fecha}</span>
                            </p>
                          </div>
                        ) : item.error ? (
                          <p className="text-[#CE3A39] font-medium text-xs">{item.error}</p>
                        ) : (
                          <span className="text-slate-400 italic">Sin eventos registrados</span>
                        )}
                      </td>

                      {/* Columna 7: Última actualización */}
                      <td className="py-3.5 px-3 font-mono text-[11px] text-slate-500">
                        {item.ultima_actualizacion}
                      </td>

                      {/* Columna 8: Acciones */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRefreshSingleGuide(item.guia, item.carrier);
                            }}
                            disabled={isRefreshing}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-[#EFF3F9] text-[#233762] transition cursor-pointer disabled:opacity-40"
                            title="Actualizar esta guía ahora (ignorar caché)"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedGuideKey(item.guia);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#EFF3F9] hover:bg-[#233762] text-[#233762] hover:text-white text-xs font-bold transition cursor-pointer"
                            title="Ver línea de tiempo completa"
                          >
                            <span>Detalle</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleRemoveGuideRow(e, item.guia)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-[#CE3A39] hover:bg-red-50 transition cursor-pointer"
                            title="Quitar de la tabla"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* PANEL LATERAL (DRAWER) DE LÍNEA DE TIEMPO VERTICAL                   */}
      {/* ==================================================================== */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-end transition-opacity"
          onClick={() => setSelectedGuideKey(null)}
        >
          <div
            className="w-full max-w-lg bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Drawer */}
            <div className="p-5 bg-[#233762] text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-white/15 font-mono text-[11px] font-bold">
                    {selectedItem.carrier}
                  </span>
                  {selectedItem.retrasado && (
                    <span className="px-2 py-0.5 rounded bg-[#CE3A39] text-white font-mono text-[10px] font-bold">
                      ENVÍO RETRASADO
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-mono font-extrabold mt-1 tracking-wide">
                  {selectedItem.guia}
                </h3>
                <p className="text-[11px] text-slate-200 mt-0.5">
                  Última consulta: {selectedItem.ultima_actualizacion}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRefreshSingleGuide(selectedItem.guia, selectedItem.carrier)}
                  disabled={refreshingGuides.has(selectedItem.guia)}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                  title="Actualizar guía ahora"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${
                      refreshingGuides.has(selectedItem.guia) ? "animate-spin" : ""
                    }`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedGuideKey(null)}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                  title="Cerrar panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Resumen de ruta y estatus */}
            <div className="p-5 border-b border-slate-200 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">Estatus Actual:</span>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold border ${
                    STATUS_UI_CONFIG[selectedItem.estatus_general]?.badgeClass
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      STATUS_UI_CONFIG[selectedItem.estatus_general]?.dotClass
                    }`}
                  />
                  {STATUS_UI_CONFIG[selectedItem.estatus_general]?.label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-white p-3.5 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Origen</span>
                  <span className="font-bold text-slate-800 mt-0.5 block">
                    {selectedItem.origen || "No especificado"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Destino</span>
                  <span className="font-bold text-[#233762] mt-0.5 block">
                    {selectedItem.destino || "No especificado"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Fecha Estimada
                  </span>
                  <span
                    className={`font-mono font-bold mt-0.5 block ${
                      selectedItem.retrasado ? "text-[#CE3A39]" : "text-slate-700"
                    }`}
                  >
                    {selectedItem.fecha_estimada_entrega || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Entrega Real
                  </span>
                  <span className="font-mono font-bold text-emerald-700 mt-0.5 block">
                    {selectedItem.fecha_entrega_real || "Pendiente"}
                  </span>
                </div>
              </div>

              {/* Opción de cambiar carrier si la guía es ambigua */}
              {selectedItem.es_ambiguo && (
                <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-900">
                  <div className="flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Formato compatible con ambos carriers.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleRefreshSingleGuide(
                        selectedItem.guia,
                        selectedItem.carrier === "FEDEX" ? "ESTAFETA" : "FEDEX"
                      )
                    }
                    className="font-bold underline hover:text-[#CE3A39] cursor-pointer ml-2 shrink-0"
                  >
                    Probar en {selectedItem.carrier === "FEDEX" ? "Estafeta" : "FedEx"}
                  </button>
                </div>
              )}
            </div>

            {/* Cuerpo: Línea de tiempo vertical (evento más reciente arriba) */}
            <div className="p-5 overflow-y-auto flex-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#233762]" />
                <span>Historial de Movimientos ({selectedItem.eventos.length})</span>
              </h4>

              {selectedItem.eventos.length === 0 ? (
                <div className="text-center py-10 px-4 bg-slate-50 rounded-xl border border-slate-200">
                  <ShieldAlert className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-700">
                    {selectedItem.error || "No hay eventos de escaneo disponibles para esta guía."}
                  </p>
                </div>
              ) : (
                <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {selectedItem.eventos.map((ev, idx) => {
                    const evCfg = STATUS_UI_CONFIG[ev.estatus] || STATUS_UI_CONFIG.DESCONOCIDO;
                    const isLatest = idx === 0;
                    return (
                      <div key={`${ev.fecha}-${idx}`} className="relative">
                        <span
                          className={`absolute -left-[21px] top-1 w-3.5 h-3.5 rounded-full border-2 border-white shadow-xs ${
                            isLatest ? `${evCfg.dotClass} ring-4 ring-slate-100` : "bg-slate-300"
                          }`}
                        />
                        <div
                          className={`rounded-xl border p-3.5 transition ${
                            isLatest
                              ? "bg-[#EFF3F9]/60 border-[#233762]/30 shadow-2xs"
                              : "bg-white border-slate-200"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-bold text-[#233762]">
                              {ev.fecha}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold border ${evCfg.badgeClass}`}
                            >
                              {evCfg.label}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-800 mt-1.5">{ev.descripcion}</p>
                          <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-1">
                            <MapPin className="w-3 h-3 text-[#CE3A39] shrink-0" />
                            <span>{ev.ubicacion}</span>
                            {ev.codigo_raw && (
                              <span className="ml-auto font-mono text-[10px] text-slate-400">
                                [{ev.codigo_raw}]
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
