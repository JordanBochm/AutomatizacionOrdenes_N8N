"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Plus,
  Trash2,
  RefreshCw,
  Download,
  Eye,
  AlertTriangle,
  RotateCcw,
  SlidersHorizontal,
  Lock,
  Undo2,
  Redo2,
  ClipboardPaste,
  Copy,
  X,
} from "lucide-react";
import {
  TrackingRow,
  TrackingHeaderInfo,
  buildTrackingPdf,
  downloadTrackingPdf,
  formatLongDate,
  getTrackingPdfFileName,
  resolveCarrierAndAccount,
  normalizeCarrierSummaryKey,
} from "@/lib/trackingPdf";
import {
  EDITABLE_COLUMNS,
  COLUMN_LABELS,
  ensureTrailingEmptyRow,
  isRowEmptyData,
  isScientificNotation,
  isUnknownClient,
  serializeToTsv,
  generateRowId,
  stripClientPickPrefix,
} from "@/lib/tableClipboard";
import { useSheetGrid } from "@/hooks/useSheetGrid";
import TrackingGrid, { GridValidationInfo } from "./TrackingGrid";

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

  // Modo Tracking Ajeno / Libre
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);

  // Encabezado del PDF
  const [headerInfo, setHeaderInfo] = useState<TrackingHeaderInfo>({
    title: "GUÍAS PARA LAS ÓRDENES DEL DÍA",
    date: todayStr,
    clients: "KYNDRYL & BASF",
  });

  // Filas de la hoja de cálculo (siempre termina con una fila vacía lista para escribir/pegar)
  const [rows, setRows] = useState<TrackingRow[]>(() => ensureTrailingEmptyRow([], ""));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Borrador en localStorage
  const [draftPrompt, setDraftPrompt] = useState<boolean>(false);
  const [draftDataToRestore, setDraftDataToRestore] = useState<{
    header: TrackingHeaderInfo;
    rows: TrackingRow[];
    isCustomMode?: boolean;
  } | null>(null);

  // Modal de Vista Previa del PDF
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  // Modal de pegado manual (fallback cuando el navegador bloquea navigator.clipboard.readText)
  const [pasteModalOpen, setPasteModalOpen] = useState<boolean>(false);
  const [pasteModalText, setPasteModalText] = useState<string>("");

  // Modal de confirmación antes de eliminar
  const [deleteDialog, setDeleteDialog] = useState<{
    mode: "single" | "selected" | "range" | "reset";
    targetRowIds?: string[];
    targetLabel?: string;
    count?: number;
  } | null>(null);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Solicitar eliminación de filas desde atajo de teclado (Ctrl+Shift+Delete)
  const handleRequestDeleteRowsFromHook = useCallback((rowIds: string[], label: string) => {
    if (!rowIds || rowIds.length === 0) return;
    setDeleteDialog({
      mode: "range",
      targetRowIds: rowIds,
      targetLabel: label,
      count: rowIds.length,
    });
  }, []);

  // Hook principal de hoja de cálculo (selección, teclado, deshacer/rehacer, portapapeles)
  const sheet = useSheetGrid({
    rows,
    setRows,
    triggerToast,
    onRequestDeleteRows: handleRequestDeleteRowsFromHook,
    defaultClient: "",
  });

  // ---------------------------------------------------------------------------
  // 1. CARGA DEL LOGOTIPO OFICIAL COMO DATA-URL
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
    (orders: OrderItemLike[], trackingLookup: Record<string, string> = {}): TrackingRow[] => {
      if (!orders || orders.length === 0) {
        return ensureTrailingEmptyRow([], "");
      }

      const filtered = orders.filter(
        (o) => o.type === "OUTBOUND" && !o.order_id.endsWith("-1")
      );

      const mapped: TrackingRow[] = filtered.map((o) => {
        const trk = o.tracking_number || trackingLookup[o.order_id] || "";
        const isBasf = o.order_id.trim().toUpperCase().startsWith("BRITM");
        const client = isBasf ? "BASF" : "KYNDRYL";
        const baseCarrier =
          (o.carrier || "ESTAFETAREST").trim().split(/\s+/)[0]?.toUpperCase() || "ESTAFETAREST";

        return {
          id: generateRowId(),
          carrier: baseCarrier,
          client,
          account: client,
          tracking_number: trk,
          pick_order: stripClientPickPrefix(o.order_id),
          customer_order: o.order_id,
          boxes: 1,
          manual: false,
        };
      });

      return ensureTrailingEmptyRow(mapped, "");
    },
    []
  );

  // Carga inicial y verificación de borrador existente
  useEffect(() => {
    try {
      const rawDraft = localStorage.getItem(draftStorageKey);
      if (rawDraft) {
        const parsed = JSON.parse(rawDraft);
        if (parsed && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
          const normalizedRows: TrackingRow[] = parsed.rows.map((r: any) => {
            const { carrierName, accountName } = resolveCarrierAndAccount(r);
            const resolvedClient = r.client ?? accountName ?? "";
            return {
              ...r,
              id: r.id || generateRowId(),
              carrier: carrierName,
              client: resolvedClient,
              account: resolvedClient,
              pick_order: stripClientPickPrefix(r.pick_order || "", resolvedClient),
              boxes: Math.max(1, Number(r.boxes) || 1),
            };
          });
          const nonBlankCount = normalizedRows.filter((r) => !isRowEmptyData(r)).length;
          if (nonBlankCount > 0) {
            setDraftDataToRestore({
              ...parsed,
              rows: ensureTrailingEmptyRow(normalizedRows, ""),
            });
            setDraftPrompt(true);
            return;
          }
        }
      }
    } catch (e) {
      console.warn("Error leyendo borrador de tracking de localStorage:", e);
    }

    initFromActiveBatch();
  }, []);

  const initFromActiveBatch = async () => {
    const trackingLookup: Record<string, string> = {};

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
    } catch {}

    const initialOrders = batchData?.orders || [];
    const generatedRows = buildRowsFromBatch(initialOrders, trackingLookup);
    setRows(generatedRows);
    setSelectedIds(new Set());
  };

  const handleRestoreDraft = () => {
    if (draftDataToRestore) {
      const customFlag = Boolean(draftDataToRestore.isCustomMode);
      setIsCustomMode(customFlag);
      setHeaderInfo({
        title: customFlag
          ? draftDataToRestore.header?.title || "GUÍAS PARA LAS ÓRDENES DEL DÍA"
          : "GUÍAS PARA LAS ÓRDENES DEL DÍA",
        date: draftDataToRestore.header?.date || todayStr,
        clients: customFlag
          ? draftDataToRestore.header?.clients || "KYNDRYL & BASF"
          : "KYNDRYL & BASF",
      });
      setRows(ensureTrailingEmptyRow(draftDataToRestore.rows || [], ""));
      triggerToast("Borrador del día restaurado correctamente.", "success");
    }
    setDraftPrompt(false);
  };

  const handleDiscardDraft = () => {
    try {
      localStorage.removeItem(draftStorageKey);
    } catch {}
    setDraftPrompt(false);
    initFromActiveBatch();
    triggerToast("Cargando órdenes originales del lote activo.", "info");
  };

  const handleToggleCustomMode = () => {
    const next = !isCustomMode;
    setIsCustomMode(next);
    if (!next) {
      setHeaderInfo((h) => ({
        ...h,
        title: "GUÍAS PARA LAS ÓRDENES DEL DÍA",
        clients: "KYNDRYL & BASF",
      }));
      triggerToast("Modo Oficial KYNDRYL & BASF activado.", "info");
    } else {
      triggerToast(
        "Modo Tracking Ajeno activado: puedes personalizar el encabezado del reporte libremente.",
        "success"
      );
    }
  };

  // ---------------------------------------------------------------------------
  // 3. PERSISTENCIA EN LOCALSTORAGE CON DEBOUNCE
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (draftPrompt) return;
    const timer = setTimeout(() => {
      try {
        const nonEmptyRows = rows.filter((r) => !isRowEmptyData(r));
        if (nonEmptyRows.length > 0) {
          const payload = {
            header: headerInfo,
            rows,
            isCustomMode,
            savedAt: new Date().toISOString(),
          };
          localStorage.setItem(draftStorageKey, JSON.stringify(payload));
        }
      } catch (e) {
        console.warn("Error guardando borrador en localStorage:", e);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [rows, headerInfo, isCustomMode, draftPrompt, draftStorageKey]);

  // ---------------------------------------------------------------------------
  // 4. REGENERACIÓN DEL PDF CON DEBOUNCE DE 400 MS
  // ---------------------------------------------------------------------------
  const generatePreviewUrl = useCallback(() => {
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
      return nextUrl;
    } catch (err) {
      console.error("Error al generar el PDF:", err);
      triggerToast("No se pudo generar la vista previa del PDF.", "error");
      return null;
    }
  }, [rows, headerInfo, logoDataUrl, userName, triggerToast]);

  useEffect(() => {
    if (!showPreviewModal) return;
    const timer = setTimeout(() => {
      generatePreviewUrl();
    }, 400);
    return () => clearTimeout(timer);
  }, [rows, headerInfo, showPreviewModal, generatePreviewUrl]);

  useEffect(() => {
    return () => {
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, [pdfBlobUrl]);

  // ---------------------------------------------------------------------------
  // 5. VALIDACIONES VISUALES EN VIVO (SIN BLOQUEAR EDICIÓN)
  // ---------------------------------------------------------------------------
  const validationInfo = useMemo<GridValidationInfo>(() => {
    const emptyTrackingRowIndices = new Set<number>();
    const scientificRowIndices = new Set<number>();
    const unknownClientRowIndices = new Set<number>();

    const trkCounts: Record<string, number[]> = {};
    const pickCounts: Record<string, number[]> = {};
    const custCounts: Record<string, number[]> = {};

    rows.forEach((r, idx) => {
      // Omitir la fila vacía plantilla del final
      if (idx === rows.length - 1 && isRowEmptyData(r)) {
        return;
      }

      const trk = (r.tracking_number || "").trim();
      const pick = (r.pick_order || "").trim();
      const cust = (r.customer_order || "").trim();
      const cli = (r.client || r.account || "").trim();

      if (!trk) {
        emptyTrackingRowIndices.add(idx);
      } else {
        if (isScientificNotation(trk)) {
          scientificRowIndices.add(idx);
        }
        trkCounts[trk] = trkCounts[trk] || [];
        trkCounts[trk].push(idx);
      }

      if (pick && !/^(KYNDRYL_|BASF_)$/i.test(pick)) {
        pickCounts[pick] = pickCounts[pick] || [];
        pickCounts[pick].push(idx);
      }

      if (cust) {
        custCounts[cust] = custCounts[cust] || [];
        custCounts[cust].push(idx);
      }

      if (!isCustomMode && isUnknownClient(cli)) {
        unknownClientRowIndices.add(idx);
      }
    });

    const duplicateTrackingSet = new Set(
      Object.keys(trkCounts).filter((k) => trkCounts[k].length > 1)
    );
    const duplicatePickSet = new Set(
      Object.keys(pickCounts).filter((k) => pickCounts[k].length > 1)
    );
    const duplicateCustomerSet = new Set(
      Object.keys(custCounts).filter((k) => custCounts[k].length > 1)
    );

    const dupRowIndices = new Set<number>();
    duplicateTrackingSet.forEach((k) => trkCounts[k].forEach((i) => dupRowIndices.add(i)));
    duplicatePickSet.forEach((k) => pickCounts[k].forEach((i) => dupRowIndices.add(i)));
    duplicateCustomerSet.forEach((k) => custCounts[k].forEach((i) => dupRowIndices.add(i)));

    const errorRowIndices = new Set<number>([
      ...scientificRowIndices,
      ...unknownClientRowIndices,
    ]);

    let firstIssueRowIndex: number | null = null;
    for (let i = 0; i < rows.length; i++) {
      if (
        errorRowIndices.has(i) ||
        dupRowIndices.has(i) ||
        emptyTrackingRowIndices.has(i)
      ) {
        firstIssueRowIndex = i;
        break;
      }
    }

    return {
      emptyTrackingRowIndices,
      duplicateTrackingSet,
      duplicatePickSet,
      duplicateCustomerSet,
      scientificRowIndices,
      unknownClientRowIndices,
      emptyCount: emptyTrackingRowIndices.size,
      duplicateCount: dupRowIndices.size,
      errorCount: errorRowIndices.size,
      firstIssueRowIndex,
    };
  }, [rows, isCustomMode]);

  // ---------------------------------------------------------------------------
  // 6. TOTALES PARA MODAL DE VISTA PREVIA
  // ---------------------------------------------------------------------------
  const totals = useMemo(() => {
    const activeRows = rows.filter((r, i) => !(i === rows.length - 1 && isRowEmptyData(r)));
    let totalBoxes = 0;
    const carrierMap: Record<string, number> = {};

    activeRows.forEach((r) => {
      totalBoxes += Math.max(1, Number(r.boxes) || 1);
      const { carrierName } = resolveCarrierAndAccount(r);
      const key = normalizeCarrierSummaryKey(carrierName);
      carrierMap[key] = (carrierMap[key] || 0) + 1;
    });

    return {
      totalOrders: activeRows.length,
      totalBoxes,
      carrierMap,
    };
  }, [rows]);

  // ---------------------------------------------------------------------------
  // 7. BOTONES DE PORTAPAPELES Y ACCIONES DE FILAS
  // ---------------------------------------------------------------------------
  const handlePasteFromExcelButton = async () => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.readText === "function") {
        const clipText = await navigator.clipboard.readText();
        if (clipText && clipText.trim()) {
          sheet.pasteTsvText(clipText);
          return;
        }
      }
      // Si está vacío o no disponible, abrir modal de pegado manual
      setPasteModalText("");
      setPasteModalOpen(true);
    } catch {
      // Si el navegador niega el permiso de lectura del portapapeles, abrir modal con textarea
      setPasteModalText("");
      setPasteModalOpen(true);
    }
  };

  const handleConfirmPasteModal = () => {
    if (!pasteModalText.trim()) {
      triggerToast("Pega primero las celdas copiadas desde Excel.", "info");
      return;
    }
    sheet.pasteTsvText(pasteModalText);
    setPasteModalOpen(false);
    setPasteModalText("");
  };

  const handleCopyToExcelButton = async () => {
    const activeRows = rows.filter((r, i) => !(i === rows.length - 1 && isRowEmptyData(r)));
    const targetRows =
      selectedIds.size > 0
        ? activeRows.filter((r) => selectedIds.has(r.id))
        : activeRows;

    if (targetRows.length === 0) {
      triggerToast("No hay filas con datos para copiar a Excel.", "info");
      return;
    }

    const headerLine = EDITABLE_COLUMNS.map((f) => COLUMN_LABELS[f]);
    const bodyLines = targetRows.map((r) =>
      EDITABLE_COLUMNS.map((f) => (f === "client" ? r.client || r.account || "" : (r as any)[f] ?? ""))
    );
    const tsv = serializeToTsv([headerLine, ...bodyLines]);

    try {
      await navigator.clipboard.writeText(tsv);
      triggerToast(
        `${targetRows.length} fila(s) copiada(s) con encabezados para pegar en Excel.`,
        "success"
      );
    } catch {
      triggerToast("No se pudo copiar al portapapeles.", "error");
    }
  };

  const handleToggleSelectRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === rows.length && rows.length > 0) {
        return new Set();
      }
      return new Set(rows.map((r) => r.id));
    });
  }, [rows]);

  const requestDeleteSingleRow = useCallback((row: TrackingRow, index: number) => {
    const label =
      row.customer_order?.trim() ||
      row.tracking_number?.trim() ||
      `Fila #${index + 1}`;
    setDeleteDialog({
      mode: "single",
      targetRowIds: [row.id],
      targetLabel: label,
      count: 1,
    });
  }, []);

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    setDeleteDialog({
      mode: "selected",
      targetRowIds: Array.from(selectedIds),
      count: selectedIds.size,
    });
  };

  const handleResetFromBatch = () => {
    setDeleteDialog({
      mode: "reset",
    });
  };

  const confirmDeleteAction = () => {
    if (!deleteDialog) return;

    if (
      (deleteDialog.mode === "single" ||
        deleteDialog.mode === "selected" ||
        deleteDialog.mode === "range") &&
      deleteDialog.targetRowIds
    ) {
      const idSet = new Set(deleteDialog.targetRowIds);
      const filtered = rows.filter((r) => !idSet.has(r.id));
      sheet.commitRows(filtered, true);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        idSet.forEach((id) => next.delete(id));
        return next;
      });
      triggerToast(
        deleteDialog.mode === "single"
          ? `Orden ${deleteDialog.targetLabel || ""} eliminada.`
          : `${idSet.size} fila(s) eliminada(s) correctamente.`,
        "info"
      );
    } else if (deleteDialog.mode === "reset") {
      try {
        localStorage.removeItem(draftStorageKey);
      } catch {}
      initFromActiveBatch();
      triggerToast("Tabla restaurada desde el lote del día.", "success");
    }

    setDeleteDialog(null);
  };

  const handleOpenPreview = () => {
    if (totals.totalOrders === 0) {
      triggerToast("Captura o pega al menos una orden para abrir la vista previa.", "info");
      return;
    }
    const url = generatePreviewUrl();
    if (url) {
      setShowPreviewModal(true);
    }
  };

  const handleDownloadPdf = () => {
    if (totals.totalOrders === 0) {
      triggerToast("No hay órdenes con datos para generar el PDF.", "error");
      return;
    }

    if (validationInfo.duplicateCount > 0) {
      const confirmDup = window.confirm(
        "Se detectaron números de guía o pedidos duplicados en la tabla. ¿Deseas generar el PDF de todos modos?"
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

  return (
    <div className="flex-1 flex flex-col w-full max-w-[1540px] mx-auto px-6 sm:px-8 lg:px-12 py-6">
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
      {/* BARRA SUPERIOR: FECHA DE CIERRE Y ACCIONES DE HOJA DE CÁLCULO      */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5 mb-5">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex flex-wrap items-end gap-3 flex-1">
            {/* Selector de Fecha del Cierre */}
            <div className="w-52">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Fecha del Cierre
              </label>
              <input
                type="date"
                value={headerInfo.date}
                onChange={(e) => setHeaderInfo({ ...headerInfo, date: e.target.value })}
                className="w-full px-3 py-1.5 text-xs font-semibold text-slate-800 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:border-[#233762] transition"
              />
            </div>
            <div>
              <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-600">
                {formatLongDate(headerInfo.date)}
              </span>
            </div>

            {isCustomMode && (
              <>
                <div className="w-full sm:w-72">
                  <label className="block text-[11px] font-bold text-[#CE3A39] uppercase tracking-wider mb-1">
                    Título del Reporte (Editable)
                  </label>
                  <input
                    type="text"
                    value={headerInfo.title}
                    onChange={(e) => setHeaderInfo({ ...headerInfo, title: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs font-semibold text-slate-800 rounded-xl bg-red-50/40 border border-red-200 focus:bg-white focus:outline-none focus:border-[#CE3A39] transition"
                    placeholder="GUÍAS PARA LAS ÓRDENES DEL DÍA"
                  />
                </div>

                <div className="w-full sm:w-60">
                  <label className="block text-[11px] font-bold text-[#CE3A39] uppercase tracking-wider mb-1">
                    Cliente / Cuenta del Reporte
                  </label>
                  <input
                    type="text"
                    value={headerInfo.clients}
                    onChange={(e) => setHeaderInfo({ ...headerInfo, clients: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs font-semibold text-slate-800 rounded-xl bg-red-50/40 border border-red-200 focus:bg-white focus:outline-none focus:border-[#CE3A39] transition"
                    placeholder="Ej. OTROS CLIENTES / SEKO"
                  />
                </div>
              </>
            )}
          </div>

          {/* Botón para habilitar Tracking Ajeno */}
          <div className="flex items-center gap-2 self-start lg:self-end shrink-0">
            <button
              type="button"
              onClick={handleToggleCustomMode}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer ${
                isCustomMode
                  ? "bg-[#CE3A39] hover:bg-[#B02E2D] text-white"
                  : "bg-[#EFF3F9] hover:bg-[#E2E8F4] text-[#233762] border border-[#233762]/20"
              }`}
            >
              {isCustomMode ? (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>Volver a Modo KYNDRYL &amp; BASF</span>
                </>
              ) : (
                <>
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Tracking Ajeno / Modificar Todo</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* BARRA DE ACCIONES: FILAS, DESHACER/REHACER, EXCEL Y PDF          */}
        {/* ---------------------------------------------------------------- */}
        <div className="pt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={sheet.addRowAtEndAndFocus}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#233762] hover:bg-[#1B2A4A] text-white text-xs font-bold transition shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Agregar fila</span>
            </button>

            {/* Deshacer / Rehacer */}
            <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={sheet.undo}
                disabled={!sheet.canUndo}
                title="Deshacer (Ctrl+Z)"
                aria-label="Deshacer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-700 hover:bg-white hover:text-[#233762] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Deshacer</span>
              </button>
              <div className="w-px h-4 bg-slate-200" />
              <button
                type="button"
                onClick={sheet.redo}
                disabled={!sheet.canRedo}
                title="Rehacer (Ctrl+Y)"
                aria-label="Rehacer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-700 hover:bg-white hover:text-[#233762] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <Redo2 className="w-3.5 h-3.5" />
                <span>Rehacer</span>
              </button>
            </div>

            {/* Pegar desde Excel / Copiar a Excel */}
            <button
              type="button"
              onClick={handlePasteFromExcelButton}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#233762]/25 bg-[#EFF3F9] hover:bg-[#E2E8F4] text-[#233762] text-xs font-bold transition shadow-2xs cursor-pointer"
              title="Pegar bloque copiado desde Excel (Ctrl+V)"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>Pegar desde Excel</span>
            </button>

            <button
              type="button"
              onClick={handleCopyToExcelButton}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition shadow-2xs cursor-pointer"
              title="Copiar filas a Excel en formato TSV"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>
                Copiar a Excel {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
              </span>
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
          </div>

          {/* Botones de Vista Previa y Descarga */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleOpenPreview}
              disabled={totals.totalOrders === 0}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#233762] hover:bg-[#1B2A4A] text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Vista previa</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={totals.totalOrders === 0}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#CE3A39] hover:bg-[#B02E2D] text-white text-xs font-bold transition shadow-sm shadow-red-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Generar PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* TABLA TIPO HOJA DE CÁLCULO (TrackingGrid)                          */}
      {/* ------------------------------------------------------------------ */}
      <TrackingGrid
        rows={rows}
        selectedIds={selectedIds}
        onToggleSelectRow={handleToggleSelectRow}
        onToggleSelectAll={handleToggleSelectAll}
        onRequestDeleteSingleRow={requestDeleteSingleRow}
        validationInfo={validationInfo}
        gridContainerRef={sheet.gridContainerRef}
        activeCell={sheet.activeCell}
        selection={sheet.selection}
        editingCell={sheet.editingCell}
        editingValue={sheet.editingValue}
        setEditingValue={sheet.setEditingValue}
        fillDragEndRow={sheet.fillDragEndRow}
        startEditing={sheet.startEditing}
        cancelEditing={sheet.cancelEditing}
        commitCellEdit={sheet.commitCellEdit}
        moveActiveCell={sheet.moveActiveCell}
        handleGridKeyDown={sheet.handleGridKeyDown}
        handleGridPaste={sheet.handleGridPaste}
        handleCellMouseDown={sheet.handleCellMouseDown}
        handleCellMouseEnter={sheet.handleCellMouseEnter}
        selectEntireColumn={sheet.selectEntireColumn}
        selectEntireRow={sheet.selectEntireRow}
        startFillHandleDrag={sheet.startFillHandleDrag}
        insertRowAt={sheet.insertRowAt}
        duplicateRowAt={sheet.duplicateRowAt}
        copySelectionToClipboard={sheet.copySelectionToClipboard}
        onOpenPasteHelper={handlePasteFromExcelButton}
      />

      {/* ------------------------------------------------------------------ */}
      {/* MODAL DE PEGADO MANUAL DESDE EXCEL (FALLBACK DE PORTAPAPELES)      */}
      {/* ------------------------------------------------------------------ */}
      {pasteModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPasteModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2 font-extrabold text-[#233762] text-sm">
                <ClipboardPaste className="w-4 h-4" />
                <span>Pegar bloque desde Excel</span>
              </div>
              <button
                type="button"
                onClick={() => setPasteModalOpen(false)}
                aria-label="Cerrar ventana de pegado"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5">
              <p className="text-xs text-slate-600 mb-3">
                Pega aquí (<kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[10px]">Ctrl+V</kbd>) las celdas copiadas desde tu hoja de Excel (con o sin fila de encabezados):
              </p>
              <textarea
                rows={7}
                autoFocus
                value={pasteModalText}
                onChange={(e) => setPasteModalText(e.target.value)}
                placeholder={"Carrier\tClient\tTracking Number\tPick Order\tCUSTOMER ORDER\tCajas\nESTAFETAREST\tBASF\t8793 8866 3139\tBASF_...\t32120 - Andares\t1"}
                className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-[#233762] focus:outline-none text-xs font-mono text-slate-800"
              />
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPasteModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPasteModal}
                  className="px-4 py-2 rounded-xl bg-[#233762] hover:bg-[#1B2A4A] text-white text-xs font-bold transition cursor-pointer"
                >
                  Procesar y Pegar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* VENTANA MODAL DE CONFIRMACIÓN ANTES DE ELIMINAR                    */}
      {/* ------------------------------------------------------------------ */}
      {deleteDialog && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setDeleteDialog(null)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-2xl bg-red-50 border border-red-100 text-[#CE3A39] flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-extrabold text-slate-900">
                    {deleteDialog.mode === "single" && "¿Estás seguro de eliminar esta orden?"}
                    {(deleteDialog.mode === "selected" || deleteDialog.mode === "range") &&
                      `¿Estás seguro de eliminar ${deleteDialog.count} orden(es)?`}
                    {deleteDialog.mode === "reset" && "¿Estás seguro de restaurar las órdenes del día?"}
                  </h3>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    {deleteDialog.mode === "single" && (
                      <>
                        Se eliminará la fila{" "}
                        <span className="font-bold text-slate-800">{deleteDialog.targetLabel}</span> de la hoja de
                        tracking.
                      </>
                    )}
                    {(deleteDialog.mode === "selected" || deleteDialog.mode === "range") && (
                      <>
                        Estás a punto de eliminar{" "}
                        <span className="font-bold text-slate-800">{deleteDialog.count} fila(s)</span> de la tabla.
                        Puedes revertirlo después con <kbd className="px-1 rounded bg-slate-100 font-mono">Ctrl+Z</kbd>.
                      </>
                    )}
                    {deleteDialog.mode === "reset" && (
                      <>
                        Se eliminarán los cambios o filas manuales actuales para recargar las órdenes originales del
                        lote activo.
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setDeleteDialog(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteAction}
                  className="px-4 py-2 rounded-xl bg-[#CE3A39] hover:bg-[#B02E2D] text-white text-xs font-bold transition shadow-sm shadow-red-200 cursor-pointer"
                >
                  {deleteDialog.mode === "reset" ? "Sí, restaurar" : "Sí, eliminar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODAL DE VISTA PREVIA DEL PDF                                      */}
      {/* ------------------------------------------------------------------ */}
      {showPreviewModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
          onClick={() => setShowPreviewModal(false)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#EFF3F9] text-[#233762] flex items-center justify-center">
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#233762]">
                    Vista Previa &bull; {getTrackingPdfFileName(headerInfo.date)}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {totals.totalOrders} orden(es) &bull; {totals.totalBoxes} caja(s) &bull;{" "}
                    {formatLongDate(headerInfo.date)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#CE3A39] hover:bg-[#B02E2D] text-white text-xs font-bold transition shadow-sm shadow-red-200 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  aria-label="Cerrar vista previa"
                  className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition cursor-pointer ml-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-100 p-3 flex items-center justify-center">
              {pdfBlobUrl ? (
                <iframe
                  ref={iframeRef}
                  src={pdfBlobUrl}
                  title="Vista previa del PDF de Tracking"
                  className="w-full h-full rounded-xl border border-slate-300 shadow-inner bg-white"
                />
              ) : (
                <p className="text-xs text-slate-500 font-semibold">Cargando documento PDF...</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
