"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Plus,
  Trash2,
  RefreshCw,
  Download,
  Printer,
  Eye,
  Edit3,
  AlertTriangle,
  CheckCircle2,
  Truck,
  Box,
  Layers,
  FileText,
  Check,
  RotateCcw,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import {
  TrackingRow,
  TrackingHeaderInfo,
  buildTrackingPdf,
  downloadTrackingPdf,
  formatLongDate,
  getTrackingPdfFileName,
} from "@/lib/trackingPdf";

interface OrderItemLike {
  order_id: string;
  type: string;
  carrier?: string;
  tracking_number?: string;
  [key: string]: any;
}

interface TrackingGeneratorProps {
  batchData: {
    orders?: OrderItemLike[];
    batch_filename?: string;
    [key: string]: any;
  } | null;
  apiBase: string;
  triggerToast: (message: string, type: "success" | "error" | "info") => void;
  userName?: string;
}

export default function TrackingGenerator({
  batchData,
  apiBase,
  triggerToast,
  userName = "Usuario Seko",
}: TrackingGeneratorProps) {
  // Fecha actual en formato YYYY-MM-DD
  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  const draftStorageKey = useMemo(() => `sc_tracking_draft_${todayStr}`, [todayStr]);

  // Estados del encabezado editable
  const [headerInfo, setHeaderInfo] = useState<TrackingHeaderInfo>({
    title: "GUÍAS PARA LAS ÓRDENES DEL DÍA",
    date: todayStr,
    clients: "KYNDRYL & BASF",
  });

  // Filas de tracking
  const [rows, setRows] = useState<TrackingRow[]>([]);
  const [includeReturns, setIncludeReturns] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Estado de borrador disponible
  const [draftPrompt, setDraftPrompt] = useState<boolean>(false);
  const [draftDataToRestore, setDraftDataToRestore] = useState<{
    header: TrackingHeaderInfo;
    rows: TrackingRow[];
    includeReturns: boolean;
  } | null>(null);

  // Vista activa en pantallas chicas
  const [mobileTab, setMobileTab] = useState<"edit" | "preview">("edit");

  // Vista previa PDF (blob URL)
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isPdfRendering, setIsPdfRendering] = useState<boolean>(false);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  // Referencia al iframe para impresión directa
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ---------------------------------------------------------------------------
  // 1. CARGA DEL LOGOTIPO OFICIAL COMO DATA-URL (CANVAS FALLBACK SEGURO)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let isMounted = true;
    const loadLogo = async () => {
      try {
        const response = await fetch("/logo-supplychain.png");
        if (!response.ok) return;
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          if (isMounted && typeof reader.result === "string") {
            setLogoDataUrl(reader.result);
          }
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        console.warn("No se pudo precargar /logo-supplychain.png para el PDF:", err);
      }
    };
    loadLogo();
    return () => {
      isMounted = false;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 2. INICIALIZACIÓN DE FILAS DESDE BATCHDATA O API DE TRACKING
  // ---------------------------------------------------------------------------
  const buildRowsFromBatch = useCallback(
    (orders: OrderItemLike[], withReturns: boolean, trackingLookup: Record<string, string> = {}): TrackingRow[] => {
      if (!orders || orders.length === 0) return [];

      const filtered = orders.filter((o) => {
        if (!withReturns) {
          return o.type === "OUTBOUND" && !o.order_id.endsWith("-1");
        }
        return true;
      });

      return filtered.map((o) => {
        const trk = o.tracking_number || trackingLookup[o.order_id] || "";
        return {
          id: `trk-${o.order_id}-${Math.random().toString(36).substring(2, 7)}`,
          carrier: o.carrier || "ESTAFETAREST KYNDRYL",
          tracking_number: trk,
          pick_order: `KYNDRYL_${o.order_id}`,
          customer_order: o.order_id,
          boxes: 1,
          manual: false,
        };
      });
    },
    []
  );

  // Carga inicial y verificación de borrador existente
  useEffect(() => {
    // 1. Verificar si existe borrador del día
    try {
      const rawDraft = localStorage.getItem(draftStorageKey);
      if (rawDraft) {
        const parsed = JSON.parse(rawDraft);
        if (parsed && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
          setDraftDataToRestore(parsed);
          setDraftPrompt(true);
          return; // Esperar decisión del usuario
        }
      }
    } catch (e) {
      console.warn("Error leyendo borrador de tracking de localStorage:", e);
    }

    // 2. Si no hay borrador, cargar desde batchData
    initFromActiveBatch(includeReturns);
  }, []);

  const initFromActiveBatch = async (withReturns: boolean) => {
    let trackingLookup: Record<string, string> = {};

    // Intentar consultar GET /api/techship/tracking para traer las guías de Techship o Cierre
    try {
      const res = await fetch(`${apiBase}/api/techship/tracking`);
      if (res.ok) {
        const trackingList = await res.json();
        if (Array.isArray(trackingList)) {
          trackingList.forEach((item: any) => {
            if (item.order_id && item.tracking_number) {
              trackingLookup[item.order_id] = item.tracking_number;
            }
          });
        }
      }
    } catch {
      // Si la API falla, continuar con los datos disponibles en batchData
    }

    const initialOrders = batchData?.orders || [];
    const generatedRows = buildRowsFromBatch(initialOrders, withReturns, trackingLookup);
    setRows(generatedRows);
    setSelectedIds(new Set());
  };

  // Restaurar borrador guardado
  const handleRestoreDraft = () => {
    if (draftDataToRestore) {
      setHeaderInfo(draftDataToRestore.header || headerInfo);
      setRows(draftDataToRestore.rows || []);
      setIncludeReturns(Boolean(draftDataToRestore.includeReturns));
      triggerToast("Borrador del día restaurado correctamente.", "success");
    }
    setDraftPrompt(false);
  };

  // Descartar borrador y recargar desde el lote
  const handleDiscardDraft = () => {
    try {
      localStorage.removeItem(draftStorageKey);
    } catch {}
    setDraftPrompt(false);
    initFromActiveBatch(includeReturns);
    triggerToast("Cargando órdenes originales del lote activo.", "info");
  };

  // ---------------------------------------------------------------------------
  // 3. PERSISTENCIA EN LOCALSTORAGE CON DEBOUNCE
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (draftPrompt) return; // No sobreescribir antes de que el usuario decida
    const timer = setTimeout(() => {
      try {
        if (rows.length > 0) {
          const payload = {
            header: headerInfo,
            rows,
            includeReturns,
            savedAt: new Date().toISOString(),
          };
          localStorage.setItem(draftStorageKey, JSON.stringify(payload));
        }
      } catch (e) {
        console.warn("Error guardando borrador en localStorage:", e);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [rows, headerInfo, includeReturns, draftPrompt, draftStorageKey]);

  // ---------------------------------------------------------------------------
  // 4. GENERACIÓN DE VISTA PREVIA EN VIVO CON DEBOUNCE (400ms)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setIsPdfRendering(true);
    debounceTimerRef.current = setTimeout(() => {
      try {
        const doc = buildTrackingPdf(rows, headerInfo, logoDataUrl, userName);
        const blob = doc.output("blob");
        const nextUrl = URL.createObjectURL(blob);

        setPdfBlobUrl((prevUrl) => {
          if (prevUrl) {
            URL.revokeObjectURL(prevUrl);
          }
          return nextUrl;
        });
      } catch (err) {
        console.error("Error al generar vista previa del PDF:", err);
      } finally {
        setIsPdfRendering(false);
      }
    }, 400);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [rows, headerInfo, logoDataUrl, userName]);

  // Limpieza al desmontar el componente
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 5. VALIDACIONES VISUALES Y DETECCIÓN DE PROBLEMAS
  // ---------------------------------------------------------------------------
  const validationSummary = useMemo(() => {
    const trkCounts: Record<string, number> = {};
    const ritmCounts: Record<string, number> = {};
    let emptyCount = 0;

    rows.forEach((r) => {
      const trk = (r.tracking_number || "").trim();
      const ritm = (r.customer_order || "").trim();

      if (!trk) {
        emptyCount++;
      } else {
        trkCounts[trk] = (trkCounts[trk] || 0) + 1;
      }

      if (ritm) {
        ritmCounts[ritm] = (ritmCounts[ritm] || 0) + 1;
      }
    });

    const duplicateTrkSet = new Set(
      Object.keys(trkCounts).filter((k) => (trkCounts[k] || 0) > 1)
    );
    const duplicateRitmSet = new Set(
      Object.keys(ritmCounts).filter((k) => (ritmCounts[k] || 0) > 1)
    );

    return {
      emptyCount,
      duplicateTrkSet,
      duplicateRitmSet,
      totalIssues: emptyCount + duplicateTrkSet.size + duplicateRitmSet.size,
    };
  }, [rows]);

  // ---------------------------------------------------------------------------
  // 6. TOTALES Y CARRIERS
  // ---------------------------------------------------------------------------
  const totals = useMemo(() => {
    let totalBoxes = 0;
    const carrierMap: Record<string, number> = {};

    rows.forEach((r) => {
      totalBoxes += Number(r.boxes || 1);
      const raw = (r.carrier || "ESTAFETA").trim();
      const token = raw.split(/[\s_-]+/)[0].toUpperCase() || "ESTAFETA";
      carrierMap[token] = (carrierMap[token] || 0) + 1;
    });

    return {
      totalOrders: rows.length,
      totalBoxes,
      carrierMap,
    };
  }, [rows]);

  // ---------------------------------------------------------------------------
  // 7. MANEJO DE ACCIONES EN LA TABLA
  // ---------------------------------------------------------------------------
  // Agregar fila manual
  const handleAddRow = () => {
    const newRow: TrackingRow = {
      id: `trk-manual-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      carrier: "ESTAFETAREST KYNDRYL",
      tracking_number: "",
      pick_order: "",
      customer_order: "",
      boxes: 1,
      manual: true,
    };
    setRows((prev) => [...prev, newRow]);
    triggerToast("Fila agregada. Captura la información correspondiente.", "info");
  };

  // Edición directa de una celda
  const handleCellChange = (id: string, field: keyof TrackingRow, value: any) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const updated = { ...row, [field]: value };
        // Si se modifica el customer_order y el pick_order estaba vacío o generado automáticamente
        if (field === "customer_order") {
          const valStr = String(value).trim();
          if (!row.pick_order || row.pick_order.startsWith("KYNDRYL_")) {
            updated.pick_order = valStr ? `KYNDRYL_${valStr}` : "";
          }
        }
        return updated;
      })
    );
  };

  // Selección individual
  const handleToggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Seleccionar todas / deseleccionar todas
  const handleToggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  // Eliminar filas seleccionadas
  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    setRows((prev) => prev.filter((r) => !selectedIds.has(r.id)));
    setSelectedIds(new Set());
    triggerToast(`${count} orden(es) eliminada(s).`, "info");
  };

  // Restaurar desde el lote del día
  const handleResetFromBatch = () => {
    const confirmed = window.confirm(
      "¿Deseas restaurar la lista de órdenes desde el lote activo del día? Los cambios manuales no guardados se perderán."
    );
    if (!confirmed) return;

    try {
      localStorage.removeItem(draftStorageKey);
    } catch {}
    initFromActiveBatch(includeReturns);
    triggerToast("Tabla restaurada desde el lote del día.", "success");
  };

  // Toggle de inclusión de retornos
  const handleToggleReturns = (checked: boolean) => {
    setIncludeReturns(checked);
    initFromActiveBatch(checked);
    triggerToast(
      checked ? "Retornos (-1) incluidos en la lista." : "Mostrando solo órdenes de ida (Outbound).",
      "info"
    );
  };

  // Descarga del PDF
  const handleDownloadPdf = () => {
    if (rows.length === 0) {
      triggerToast("No hay órdenes en la lista para generar el PDF.", "error");
      return;
    }

    if (validationSummary.duplicateTrkSet.size > 0 || validationSummary.duplicateRitmSet.size > 0) {
      const confirmDup = window.confirm(
        "Se detectaron números de guía o RITMs duplicados en la lista. ¿Deseas generar el PDF de todos modos?"
      );
      if (!confirmDup) return;
    }

    try {
      downloadTrackingPdf(rows, headerInfo, logoDataUrl, userName);
      const fileName = getTrackingPdfFileName(headerInfo.date);
      triggerToast(`Archivo ${fileName} generado y descargado exitosamente.`, "success");
    } catch (e: any) {
      triggerToast(e.message || "Error al generar el archivo PDF.", "error");
    }
  };

  // Imprimir directo
  const handlePrint = () => {
    if (!iframeRef.current || !pdfBlobUrl) {
      triggerToast("La vista previa del PDF no está lista para imprimir.", "error");
      return;
    }
    try {
      iframeRef.current.contentWindow?.print();
    } catch {
      window.open(pdfBlobUrl, "_blank");
    }
  };

  return (
    <div className="flex-1 flex flex-col w-full max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 py-5">
      {/* ------------------------------------------------------------------ */}
      {/* AVISO DE BORRADOR DISPONIBLE                                      */}
      {/* ------------------------------------------------------------------ */}
      {draftPrompt && (
        <div className="mb-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-300">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 text-amber-700">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold">Borrador de hoy encontrado en el navegador</p>
              <p className="text-xs text-amber-700">
                Se detectaron cambios guardados localmente para la fecha de hoy. ¿Deseas restaurar tu sesión de trabajo?
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="px-3 py-1.5 rounded-xl border border-amber-300 hover:bg-amber-100 text-amber-800 text-xs font-semibold transition cursor-pointer"
            >
              Descartar y recargar lote
            </button>
            <button
              type="button"
              onClick={handleRestoreDraft}
              className="px-3.5 py-1.5 rounded-xl bg-[#233762] hover:bg-[#1B2A4A] text-white text-xs font-bold transition shadow-xs cursor-pointer"
            >
              Restaurar borrador
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* BARRA SUPERIOR: CAMPOS DE ENCABEZADO Y TOTALES                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5 mb-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          {/* Campos editables del encabezado */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 max-w-4xl">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Título del Reporte
              </label>
              <input
                type="text"
                value={headerInfo.title}
                onChange={(e) => setHeaderInfo({ ...headerInfo, title: e.target.value })}
                className="w-full px-3 py-1.5 text-xs font-bold text-[#233762] rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:border-[#233762] transition"
                placeholder="Título del encabezado"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Fecha del Cierre
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={headerInfo.date}
                  onChange={(e) => setHeaderInfo({ ...headerInfo, date: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs font-semibold text-slate-800 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:border-[#233762] transition"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5 truncate">{formatLongDate(headerInfo.date)}</p>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Clientes / Cuenta
              </label>
              <input
                type="text"
                value={headerInfo.clients}
                onChange={(e) => setHeaderInfo({ ...headerInfo, clients: e.target.value })}
                className="w-full px-3 py-1.5 text-xs font-semibold text-slate-800 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:border-[#233762] transition"
                placeholder="Clientes"
              />
            </div>
          </div>

          {/* Totales Automáticos */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="px-3.5 py-2 rounded-xl bg-[#EFF3F9] border border-[#233762]/10 flex items-center gap-2.5">
              <Box className="w-4 h-4 text-[#233762]" />
              <div>
                <p className="text-[10px] font-bold text-[#233762] uppercase tracking-wider">Total Órdenes</p>
                <p className="text-base font-extrabold text-[#233762] leading-none">{totals.totalOrders}</p>
              </div>
            </div>

            <div className="px-3.5 py-2 rounded-xl bg-red-50 border border-[#CE3A39]/20 flex items-center gap-2.5">
              <Layers className="w-4 h-4 text-[#CE3A39]" />
              <div>
                <p className="text-[10px] font-bold text-[#CE3A39] uppercase tracking-wider"># de Cajas</p>
                <p className="text-base font-extrabold text-[#CE3A39] leading-none">{totals.totalBoxes}</p>
              </div>
            </div>

            {/* Conteo por Carrier */}
            <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2 text-xs">
              <Truck className="w-3.5 h-3.5 text-slate-500" />
              <div className="flex items-center gap-2 text-slate-700 font-mono font-semibold">
                {Object.entries(totals.carrierMap).length > 0 ? (
                  Object.entries(totals.carrierMap).map(([carrierName, count]) => (
                    <span key={carrierName} className="inline-flex items-center gap-1">
                      <span className="text-slate-500">{carrierName}:</span>
                      <span className="font-bold text-[#233762]">{count}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-slate-400">Sin órdenes</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* BARRA DE ACCIONES PRINCIPALES Y VALIDACIONES                     */}
        {/* ---------------------------------------------------------------- */}
        <div className="pt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAddRow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#233762] hover:bg-[#1B2A4A] text-white text-xs font-bold transition shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Agregar fila</span>
            </button>

            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={selectedIds.size === 0}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition shadow-2xs ${
                selectedIds.size > 0
                  ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer"
                  : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Eliminar seleccionadas {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}</span>
            </button>

            <button
              type="button"
              onClick={handleResetFromBatch}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-[#EFF3F9] text-slate-700 hover:text-[#233762] text-xs font-semibold transition shadow-2xs cursor-pointer"
              title="Restaurar órdenes desde el lote original"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Restaurar órdenes del día</span>
            </button>

            {/* Toggle de Retornos */}
            <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 cursor-pointer hover:bg-slate-100 transition select-none">
              <input
                type="checkbox"
                checked={includeReturns}
                onChange={(e) => handleToggleReturns(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-[#233762] focus:ring-[#233762]"
              />
              <span>Incluir retornos (-1)</span>
            </label>
          </div>

          {/* Botones de Descarga e Impresión */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#CE3A39] hover:bg-[#B02E2D] text-white text-xs font-bold transition shadow-sm shadow-red-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Generar PDF</span>
            </button>
          </div>
        </div>

        {/* Alerta de problemas / validaciones visuales */}
        {validationSummary.totalIssues > 0 && (
          <div className="mt-3 px-3.5 py-2 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Atención:</strong>{" "}
                {validationSummary.emptyCount > 0 && `${validationSummary.emptyCount} orden(es) sin guía timbrada. `}
                {validationSummary.duplicateTrkSet.size > 0 &&
                  `${validationSummary.duplicateTrkSet.size} tracking(s) duplicado(s). `}
                {validationSummary.duplicateRitmSet.size > 0 &&
                  `${validationSummary.duplicateRitmSet.size} RITM(s) duplicado(s). `}
              </span>
            </div>
            <span className="text-[11px] font-semibold text-amber-700">Verifica las filas resaltadas</span>
          </div>
        )}
      </div>

      {/* Pestañas para móviles / tabletas */}
      <div className="flex lg:hidden items-center justify-center gap-2 mb-4 bg-slate-200/70 p-1 rounded-xl">
        <button
          type="button"
          onClick={() => setMobileTab("edit")}
          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
            mobileTab === "edit" ? "bg-white text-[#233762] shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <Edit3 className="w-3.5 h-3.5" />
            <span>Editar tabla ({rows.length})</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("preview")}
          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
            mobileTab === "preview" ? "bg-white text-[#233762] shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" />
            <span>Vista previa en vivo</span>
          </span>
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* PANELES DE TRABAJO: TABLA EDITABLE (IZQ) Y VISTA PREVIA PDF (DER)  */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-[580px]">
        {/* PANEL IZQUIERDO: TABLA EDITABLE DIRECTA (Col 7) */}
        <div
          className={`lg:col-span-7 flex flex-col bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden ${
            mobileTab === "edit" ? "flex" : "hidden lg:flex"
          }`}
        >
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 font-bold text-[#233762]">
              <Edit3 className="w-4 h-4" />
              <span>Órdenes del día a timbrar ({rows.length})</span>
            </div>
            <span className="text-[11px] text-slate-500">Edición en línea sin modales</span>
          </div>

          <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[640px]">
            {rows.length === 0 ? (
              <div className="h-full min-h-[320px] flex flex-col items-center justify-center p-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#EFF3F9] text-[#233762] flex items-center justify-center mb-3">
                  <FileText className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-slate-800">No hay órdenes en la lista</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Carga un lote en Asset Management o haz clic en "Agregar fila" para capturar guías manualmente.
                </p>
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#233762] hover:bg-[#1B2A4A] text-white text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Agregar primera orden</span>
                </button>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-[#233762] text-white sticky top-0 z-10 font-bold select-none text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === rows.length && rows.length > 0}
                        onChange={handleToggleSelectAll}
                        aria-label="Seleccionar todas las filas"
                        className="w-3.5 h-3.5 rounded text-[#233762] focus:ring-0 cursor-pointer"
                      />
                    </th>
                    <th className="py-2.5 px-2 w-10 text-center">#</th>
                    <th className="py-2.5 px-3 w-40">Carrier</th>
                    <th className="py-2.5 px-3 w-52">Tracking Number</th>
                    <th className="py-2.5 px-3 w-44">Pick Order (RITM)</th>
                    <th className="py-2.5 px-3 w-36">Customer Order</th>
                    <th className="py-2.5 px-2 w-16 text-center">Cajas</th>
                    <th className="py-2.5 px-2 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rows.map((row, index) => {
                    const isSelected = selectedIds.has(row.id);
                    const trkClean = (row.tracking_number || "").trim();
                    const ritmClean = (row.customer_order || "").trim();

                    const isMissingTrk = !trkClean;
                    const isDuplicateTrk = validationSummary.duplicateTrkSet.has(trkClean);
                    const isDuplicateRitm = validationSummary.duplicateRitmSet.has(ritmClean);

                    const hasError = isDuplicateTrk || isDuplicateRitm;
                    const hasWarning = isMissingTrk && !hasError;

                    const rowBgClass = isSelected
                      ? "bg-blue-50/70"
                      : hasError
                      ? "bg-red-50/60"
                      : hasWarning
                      ? "bg-amber-50/40"
                      : index % 2 === 0
                      ? "bg-white"
                      : "bg-[#F8FAFC]";

                    return (
                      <tr
                        key={row.id}
                        className={`transition-colors hover:bg-slate-100/70 ${rowBgClass}`}
                      >
                        {/* Checkbox de selección */}
                        <td className="py-2 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectRow(row.id)}
                            aria-label={`Seleccionar orden ${row.customer_order}`}
                            className="w-3.5 h-3.5 rounded text-[#233762] focus:ring-0 cursor-pointer"
                          />
                        </td>

                        {/* Índice # (1..N) */}
                        <td className="py-2 px-2 text-center font-bold text-slate-500 font-mono text-[11px]">
                          {index + 1}
                        </td>

                        {/* Carrier editable */}
                        <td className="py-1.5 px-2">
                          <input
                            type="text"
                            value={row.carrier}
                            onChange={(e) => handleCellChange(row.id, "carrier", e.target.value)}
                            className="w-full px-2 py-1 text-xs rounded-lg bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-[#233762] font-semibold text-slate-800 focus:outline-none transition"
                            placeholder="Carrier"
                          />
                        </td>

                        {/* Tracking Number editable */}
                        <td className="py-1.5 px-2">
                          <div className="relative">
                            <input
                              type="text"
                              value={row.tracking_number}
                              onChange={(e) => handleCellChange(row.id, "tracking_number", e.target.value)}
                              className={`w-full px-2 py-1 text-xs font-mono font-bold rounded-lg border transition focus:outline-none ${
                                isDuplicateTrk
                                  ? "bg-red-50 border-red-300 text-red-800 focus:border-red-500"
                                  : isMissingTrk
                                  ? "bg-amber-50 border-amber-300 text-amber-800 focus:border-amber-500"
                                  : "bg-transparent hover:bg-white focus:bg-white border-transparent focus:border-[#233762] text-slate-900"
                              }`}
                              placeholder="Sin guía timbrada"
                            />
                            {isMissingTrk && (
                              <span className="absolute right-2 top-1.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200 pointer-events-none">
                                Sin guía
                              </span>
                            )}
                            {isDuplicateTrk && (
                              <span className="absolute right-2 top-1.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-red-100 text-red-800 border border-red-200 pointer-events-none">
                                Duplicado
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Pick Order editable */}
                        <td className="py-1.5 px-2">
                          <input
                            type="text"
                            value={row.pick_order}
                            onChange={(e) => handleCellChange(row.id, "pick_order", e.target.value)}
                            className="w-full px-2 py-1 text-xs font-mono text-slate-700 rounded-lg bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-[#233762] focus:outline-none transition"
                            placeholder="KYNDRYL_RITM..."
                          />
                        </td>

                        {/* Customer Order (RITM) editable */}
                        <td className="py-1.5 px-2">
                          <div className="relative">
                            <input
                              type="text"
                              value={row.customer_order}
                              onChange={(e) => handleCellChange(row.id, "customer_order", e.target.value)}
                              className={`w-full px-2 py-1 text-xs font-mono font-bold rounded-lg border transition focus:outline-none ${
                                isDuplicateRitm
                                  ? "bg-red-50 border-red-300 text-red-800 focus:border-red-500"
                                  : "bg-transparent hover:bg-white focus:bg-white border-transparent focus:border-[#233762] text-slate-900"
                              }`}
                              placeholder="RITM..."
                            />
                            {isDuplicateRitm && (
                              <span className="absolute right-2 top-1.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-red-100 text-red-800 border border-red-200 pointer-events-none">
                                Dup
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Cajas (Number) editable */}
                        <td className="py-1.5 px-2 text-center">
                          <input
                            type="number"
                            min="1"
                            max="99"
                            value={row.boxes}
                            onChange={(e) =>
                              handleCellChange(row.id, "boxes", Math.max(1, parseInt(e.target.value, 10) || 1))
                            }
                            className="w-12 text-center px-1.5 py-1 text-xs font-bold text-[#CE3A39] rounded-lg bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-[#233762] focus:outline-none transition"
                          />
                        </td>

                        {/* Eliminar fila individual */}
                        <td className="py-1.5 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setRows((prev) => prev.filter((r) => r.id !== row.id));
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                next.delete(row.id);
                                return next;
                              });
                            }}
                            title="Eliminar esta fila"
                            className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* PANEL DERECHO: VISTA PREVIA EN VIVO (IFRAME) (Col 5) */}
        <div
          className={`lg:col-span-5 flex flex-col bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden ${
            mobileTab === "preview" ? "flex" : "hidden lg:flex"
          }`}
        >
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 font-bold text-[#233762]">
              <Eye className="w-4 h-4" />
              <span>Vista previa en vivo del documento PDF</span>
            </div>
            {isPdfRendering ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#233762]">
                <RefreshCw className="w-3 h-3 animate-spin text-[#CE3A39]" />
                <span>Actualizando...</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <Check className="w-3 h-3" />
                <span>Sincronizado</span>
              </span>
            )}
          </div>

          <div className="flex-1 bg-slate-100 flex items-center justify-center min-h-[500px] relative p-2">
            {pdfBlobUrl ? (
              <iframe
                ref={iframeRef}
                src={pdfBlobUrl}
                title="Vista previa del PDF de Tracking"
                className="w-full h-full min-h-[540px] rounded-xl border border-slate-300 shadow-inner bg-white"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                <RefreshCw className="w-8 h-8 animate-spin text-[#233762] mb-3" />
                <p className="text-xs font-semibold">Generando vista previa en vivo...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
