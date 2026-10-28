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
  FileText,
  RotateCcw,
  SlidersHorizontal,
  Lock,
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

/**
 * Obtiene el prefijo obligatorio de Pick Order según la cuenta ("KYNDRYL_" o "BASF_")
 */
function getPickPrefix(account: string): string {
  const clean = (account || "").trim().toUpperCase();
  return clean === "BASF" ? "BASF_" : "KYNDRYL_";
}

/**
 * Extrae únicamente lo que agregó el usuario después del prefijo KYNDRYL_ o BASF_
 */
function extractUserSuffix(rawPickOrder: string): string {
  const val = rawPickOrder || "";
  if (/^(KYNDRYL|BASF)$/i.test(val.trim())) {
    return "";
  }
  return val.replace(/^(KYNDRYL_|BASF_)+/i, "");
}

/**
 * Garantiza que pick_order siempre comience con KYNDRYL_ o BASF_ según la columna Cuenta
 */
function ensurePickOrderPrefix(account: string, rawPickOrder: string): string {
  const prefix = getPickPrefix(account);
  const suffix = extractUserSuffix(rawPickOrder);
  return `${prefix}${suffix}`;
}

/**
 * Valida que todas las columnas de una fila estén llenadas correctamente antes de permitir agregar otra
 */
function getMissingRowFields(row: TrackingRow, isCustomMode: boolean): string[] {
  const missing: string[] = [];
  const { carrierName, accountName } = resolveCarrierAndAccount(row);
  if (!carrierName.trim()) {
    missing.push("Carrier");
  }
  if (!accountName.trim()) {
    missing.push("Cuenta");
  }
  if (!(row.tracking_number || "").trim()) {
    missing.push("Tracking Number");
  }
  if (isCustomMode) {
    if (!(row.pick_order || "").trim()) {
      missing.push("Pick Order");
    }
  } else {
    if (!extractUserSuffix(row.pick_order).trim()) {
      missing.push("Pick Order (RITM)");
    }
  }
  if (!(row.customer_order || "").trim()) {
    missing.push("CUSTOMER ORDER");
  }
  if (isCustomMode && (!row.boxes || Number(row.boxes) < 1)) {
    missing.push("Cajas");
  }
  return missing;
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

  // Modo Tracking Ajeno / Libre (permite clientes fuera de Kyndryl & BASF y edición total)
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);

  // Encabezado del PDF (título y clientes fijos en modo oficial; editables en modo libre)
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
    isCustomMode?: boolean;
  } | null>(null);

  // Modal de Vista Previa bajo demanda
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  // Modal de confirmación antes de eliminar
  const [deleteDialog, setDeleteDialog] = useState<{
    mode: "single" | "selected" | "reset";
    targetRowId?: string;
    targetLabel?: string;
    count?: number;
  } | null>(null);

  // Fila resaltada cuando el usuario intenta agregar otra sin completar la anterior
  const [incompleteRowId, setIncompleteRowId] = useState<string | null>(null);

  // Referencia al iframe para impresión directa
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

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
        const isBasf = o.order_id.trim().toUpperCase().startsWith("BRITM");
        const account = isBasf ? "BASF" : "KYNDRYL";
        const baseCarrier = (o.carrier || "ESTAFETAREST").trim().split(/\s+/)[0] || "ESTAFETAREST";

        return {
          id: `trk-${o.order_id}-${Math.random().toString(36).substring(2, 7)}`,
          carrier: baseCarrier,
          account,
          tracking_number: trk,
          pick_order: ensurePickOrderPrefix(account, o.order_id),
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
    try {
      const rawDraft = localStorage.getItem(draftStorageKey);
      if (rawDraft) {
        const parsed = JSON.parse(rawDraft);
        if (parsed && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
          const customFlag = Boolean(parsed.isCustomMode);
          const normalizedRows: TrackingRow[] = parsed.rows.map((r: TrackingRow) => {
            const { carrierName, accountName } = resolveCarrierAndAccount(r);
            if (customFlag) {
              return {
                ...r,
                carrier: carrierName,
                account: accountName,
                boxes: Math.max(1, Number(r.boxes) || 1),
              };
            }
            const cleanAcc = accountName.toUpperCase() === "BASF" ? "BASF" : "KYNDRYL";
            return {
              ...r,
              carrier: carrierName,
              account: cleanAcc,
              pick_order: ensurePickOrderPrefix(cleanAcc, r.pick_order || r.customer_order || ""),
              boxes: 1,
            };
          });
          setDraftDataToRestore({
            ...parsed,
            rows: normalizedRows,
            isCustomMode: customFlag,
          });
          setDraftPrompt(true);
          return;
        }
      }
    } catch (e) {
      console.warn("Error leyendo borrador de tracking de localStorage:", e);
    }

    initFromActiveBatch(includeReturns);
  }, []);

  const initFromActiveBatch = async (withReturns: boolean) => {
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
    } catch {
      // Continuar con batchData si el endpoint aún no responde
    }

    const initialOrders = batchData?.orders || [];
    const generatedRows = buildRowsFromBatch(initialOrders, withReturns, trackingLookup);
    setRows(generatedRows);
    setSelectedIds(new Set());
    setIncompleteRowId(null);
  };

  // Restaurar borrador guardado
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

  // Alternar entre Modo Oficial (Kyndryl & BASF) y Modo Tracking Ajeno / Libre
  const handleToggleCustomMode = () => {
    setIncompleteRowId(null);
    setIsCustomMode((prev) => {
      const next = !prev;
      if (!next) {
        // Al regresar al modo oficial Kyndryl & BASF, restauramos encabezado fijo y normalizamos filas
        setHeaderInfo((h) => ({
          ...h,
          title: "GUÍAS PARA LAS ÓRDENES DEL DÍA",
          clients: "KYNDRYL & BASF",
        }));
        setRows((currentRows) =>
          currentRows.map((r) => {
            const cleanAcc = (r.account || "").trim().toUpperCase() === "BASF" ? "BASF" : "KYNDRYL";
            return {
              ...r,
              account: cleanAcc,
              pick_order: ensurePickOrderPrefix(cleanAcc, r.pick_order || r.customer_order || ""),
              boxes: 1,
            };
          })
        );
        triggerToast("Modo Oficial KYNDRYL & BASF activado.", "info");
      } else {
        triggerToast(
          "Modo Tracking Ajeno activado: ahora puedes modificar clientes, título, cuenta, pick order y cajas libremente.",
          "success"
        );
      }
      return next;
    });
  };

  // ---------------------------------------------------------------------------
  // 3. PERSISTENCIA EN LOCALSTORAGE CON DEBOUNCE
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (draftPrompt) return;
    const timer = setTimeout(() => {
      try {
        if (rows.length > 0) {
          const payload = {
            header: headerInfo,
            rows,
            includeReturns,
            isCustomMode,
            savedAt: new Date().toISOString(),
          };
          localStorage.setItem(draftStorageKey, JSON.stringify(payload));
        }
      } catch (e) {
        console.warn("Error guardando borrador en localStorage:", e);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [rows, headerInfo, includeReturns, isCustomMode, draftPrompt, draftStorageKey]);

  // Limpieza de URL blob al desmontar
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, [pdfBlobUrl]);

  // ---------------------------------------------------------------------------
  // 4. GENERACIÓN BAJO DEMANDA DE LA VISTA PREVIA DEL PDF
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

  const handleOpenPreview = () => {
    if (rows.length === 0) {
      triggerToast("Agrega al menos una orden para abrir la vista previa.", "info");
      return;
    }
    const url = generatePreviewUrl();
    if (url) {
      setShowPreviewModal(true);
    }
  };

  const handleClosePreview = () => {
    setShowPreviewModal(false);
  };

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
      totalBoxes += isCustomMode ? Math.max(1, Number(r.boxes) || 1) : 1;
      const { carrierName } = resolveCarrierAndAccount(r);
      const key = normalizeCarrierSummaryKey(carrierName);
      carrierMap[key] = (carrierMap[key] || 0) + 1;
    });

    return {
      totalOrders: rows.length,
      totalBoxes,
      carrierMap,
    };
  }, [rows, isCustomMode]);

  // ---------------------------------------------------------------------------
  // 7. MANEJO DE ACCIONES EN LA TABLA
  // ---------------------------------------------------------------------------
  const handleAddRow = () => {
    if (rows.length > 0) {
      const lastIndex = rows.length - 1;
      const lastRow = rows[lastIndex];
      const lastRowMissing = getMissingRowFields(lastRow, isCustomMode);

      if (lastRowMissing.length > 0) {
        setIncompleteRowId(lastRow.id);
        triggerToast(
          `Completa todos los datos de la Fila #${lastIndex + 1} antes de agregar otra (${lastRowMissing.join(", ")}).`,
          "error"
        );
        return;
      }

      for (let i = 0; i < rows.length; i++) {
        const missing = getMissingRowFields(rows[i], isCustomMode);
        if (missing.length > 0) {
          setIncompleteRowId(rows[i].id);
          triggerToast(
            `Completa todos los datos de la Fila #${i + 1} antes de agregar otra (${missing.join(", ")}).`,
            "error"
          );
          return;
        }
      }
    }

    setIncompleteRowId(null);
    const defaultAccount = isCustomMode
      ? headerInfo.clients !== "KYNDRYL & BASF" && headerInfo.clients.trim()
        ? headerInfo.clients.trim().toUpperCase()
        : ""
      : "KYNDRYL";

    const newRow: TrackingRow = {
      id: `trk-manual-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      carrier: "ESTAFETAREST",
      account: defaultAccount,
      tracking_number: "",
      pick_order: isCustomMode ? "" : "KYNDRYL_",
      customer_order: "",
      boxes: 1,
      manual: true,
    };
    setRows((prev) => [...prev, newRow]);
    triggerToast("Fila agregada. Captura la información correspondiente.", "info");
  };

  // Edición directa de una celda (estricta en modo oficial; libre en modo tracking ajeno)
  const handleCellChange = (id: string, field: keyof TrackingRow, value: any) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;

        if (isCustomMode) {
          const updatedCustom: TrackingRow = {
            ...row,
            [field]: field === "boxes" ? Math.max(1, parseInt(String(value), 10) || 1) : value,
          };
          if (incompleteRowId === id && getMissingRowFields(updatedCustom, true).length === 0) {
            setIncompleteRowId(null);
          }
          return updatedCustom;
        }

        // Modo Oficial KYNDRYL & BASF
        const currentAcc = (row.account || "KYNDRYL").trim().toUpperCase() === "BASF" ? "BASF" : "KYNDRYL";
        const updated: TrackingRow = { ...row, [field]: value, boxes: 1 };

        if (field === "account") {
          const nextAcc = String(value).trim().toUpperCase() === "BASF" ? "BASF" : "KYNDRYL";
          updated.account = nextAcc;
          updated.pick_order = ensurePickOrderPrefix(nextAcc, row.pick_order);
        } else if (field === "pick_order") {
          updated.pick_order = ensurePickOrderPrefix(currentAcc, String(value));
        } else if (field === "customer_order") {
          const valStr = String(value).trim();
          const isBasf = valStr.toUpperCase().startsWith("BRITM");
          const isKyndryl = valStr.toUpperCase().startsWith("RITM");
          const nextAcc = isBasf ? "BASF" : isKyndryl ? "KYNDRYL" : currentAcc;
          updated.account = nextAcc;
          const prevSuffix = extractUserSuffix(row.pick_order);
          if (!prevSuffix || prevSuffix === (row.customer_order || "").trim()) {
            updated.pick_order = `${getPickPrefix(nextAcc)}${valStr}`;
          } else {
            updated.pick_order = ensurePickOrderPrefix(nextAcc, row.pick_order);
          }
        }

        if (incompleteRowId === id && getMissingRowFields(updated, false).length === 0) {
          setIncompleteRowId(null);
        }

        return updated;
      })
    );
  };

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

  const handleToggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  // Solicitar confirmación para eliminar una sola fila
  const requestDeleteSingleRow = (row: TrackingRow, index: number) => {
    const label =
      row.customer_order?.trim() ||
      (isCustomMode ? row.pick_order?.trim() : extractUserSuffix(row.pick_order)) ||
      row.tracking_number?.trim() ||
      `Fila #${index + 1}`;
    setDeleteDialog({
      mode: "single",
      targetRowId: row.id,
      targetLabel: label,
      count: 1,
    });
  };

  // Solicitar confirmación para eliminar las filas seleccionadas
  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    setDeleteDialog({
      mode: "selected",
      count: selectedIds.size,
    });
  };

  // Solicitar confirmación para restaurar órdenes del día (reemplazando lo actual)
  const handleResetFromBatch = () => {
    setDeleteDialog({
      mode: "reset",
    });
  };

  // Ejecutar la acción confirmada en la ventana modal
  const confirmDeleteAction = () => {
    if (!deleteDialog) return;

    if (deleteDialog.mode === "single" && deleteDialog.targetRowId) {
      const idToRemove = deleteDialog.targetRowId;
      setRows((prev) => prev.filter((r) => r.id !== idToRemove));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(idToRemove);
        return next;
      });
      if (incompleteRowId === idToRemove) {
        setIncompleteRowId(null);
      }
      triggerToast(`Orden ${deleteDialog.targetLabel || ""} eliminada correctamente.`, "info");
    } else if (deleteDialog.mode === "selected") {
      const count = selectedIds.size;
      setRows((prev) => prev.filter((r) => !selectedIds.has(r.id)));
      setSelectedIds(new Set());
      setIncompleteRowId(null);
      triggerToast(`${count} orden(es) eliminada(s) correctamente.`, "info");
    } else if (deleteDialog.mode === "reset") {
      try {
        localStorage.removeItem(draftStorageKey);
      } catch {}
      initFromActiveBatch(includeReturns);
      triggerToast("Tabla restaurada desde el lote del día.", "success");
    }

    setDeleteDialog(null);
  };

  const handleToggleReturns = (checked: boolean) => {
    setIncludeReturns(checked);
    initFromActiveBatch(checked);
    triggerToast(
      checked ? "Retornos (-1) incluidos en la lista." : "Mostrando solo órdenes de ida (Outbound).",
      "info"
    );
  };

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

  const handlePrint = () => {
    if (rows.length === 0) {
      triggerToast("No hay órdenes en la lista para imprimir.", "error");
      return;
    }
    const url = generatePreviewUrl();
    if (!url) return;

    if (showPreviewModal && iframeRef.current) {
      try {
        iframeRef.current.contentWindow?.print();
        return;
      } catch {
        // Fallback a ventana nueva
      }
    }
    const printWin = window.open(url, "_blank");
    if (printWin) {
      printWin.addEventListener("load", () => {
        try {
          printWin.print();
        } catch {}
      });
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
      {/* BARRA SUPERIOR: FECHA DE CIERRE Y MODO TRACKING AJENO / LIBRE      */}
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

            {/* Campos adicionales desbloqueados solo cuando está activo el modo Tracking Ajeno */}
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

          {/* Botón para habilitar Tracking Ajeno a Kyndryl & BASF */}
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
        {/* BARRA DE ACCIONES PRINCIPALES Y VALIDACIONES                     */}
        {/* ---------------------------------------------------------------- */}
        <div className="pt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAddRow}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#233762] hover:bg-[#1B2A4A] text-white text-xs font-bold transition shadow-xs cursor-pointer"
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
          </div>

          {/* Botones de Vista Previa, Impresión y Descarga */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleOpenPreview}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#233762] hover:bg-[#1B2A4A] text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Vista previa</span>
            </button>

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

      {/* ------------------------------------------------------------------ */}
      {/* TABLA EDITABLE DE ANCHO COMPLETO (7 COLUMNAS OFICIALES)            */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden min-h-[480px]">
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 font-bold text-[#233762]">
            <Edit3 className="w-4 h-4" />
            <span>Órdenes del día ({rows.length})</span>
            {isCustomMode && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-red-100 text-[#CE3A39] text-[10px] font-extrabold uppercase tracking-wider">
                Modo Tracking Ajeno (Edición Libre)
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-500">
            {isCustomMode
              ? "Modo libre: puedes modificar Cuenta, Pick Order, Cajas y Encabezado para cualquier cliente"
              : "Estructura oficial de 7 columnas (KYNDRYL & BASF) • Presiona \"Vista previa\" para revisar el documento"}
          </span>
        </div>

        <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[680px]">
          {rows.length === 0 ? (
            <div className="h-full min-h-[360px] flex flex-col items-center justify-center p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#EFF3F9] text-[#233762] flex items-center justify-center mb-3">
                <FileText className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-800">No hay órdenes en la lista</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Carga un lote en Asset Management o haz clic en &quot;Agregar fila&quot; para capturar guías manualmente.
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
                  <th className="py-3 px-3 w-11 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === rows.length && rows.length > 0}
                      onChange={handleToggleSelectAll}
                      aria-label="Seleccionar todas las filas"
                      className="w-3.5 h-3.5 rounded text-[#233762] focus:ring-0 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-2 w-12 text-center">#</th>
                  <th className="py-3 px-3 w-40 text-center">Carrier</th>
                  <th className="py-3 px-3 w-36 text-center">Client</th>
                  <th className="py-3 px-3">Tracking Number</th>
                  <th className="py-3 px-3">Pick Order (RITM)</th>
                  <th className="py-3 px-3 w-48 text-center">CUSTOMER ORDER</th>
                  <th className="py-3 px-3 w-24 text-center">Cajas</th>
                  <th className="py-3 px-2 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((row, index) => {
                  const isSelected = selectedIds.has(row.id);
                  const trkClean = (row.tracking_number || "").trim();
                  const ritmClean = (row.customer_order || "").trim();
                  const { carrierName, accountName } = resolveCarrierAndAccount(row);
                  const normalizedAccount = accountName.toUpperCase() === "BASF" ? "BASF" : "KYNDRYL";
                  const pickOrderValue = isCustomMode
                    ? row.pick_order || ""
                    : ensurePickOrderPrefix(normalizedAccount, row.pick_order);
                  const pickOrderSuffixClean = isCustomMode
                    ? (row.pick_order || "").trim()
                    : extractUserSuffix(row.pick_order).trim();

                  const isIncompleteHighlighted = incompleteRowId === row.id;
                  const isMissingCarrier = !carrierName.trim();
                  const isMissingAccount = !(isCustomMode ? (row.account || "").trim() : normalizedAccount);
                  const isMissingTrk = !trkClean;
                  const isMissingPickSuffix = !pickOrderSuffixClean;
                  const isMissingCustomerOrder = !ritmClean;

                  const isDuplicateTrk = validationSummary.duplicateTrkSet.has(trkClean);
                  const isDuplicateRitm = validationSummary.duplicateRitmSet.has(ritmClean);

                  const hasError = isDuplicateTrk || isDuplicateRitm || isIncompleteHighlighted;
                  const hasWarning = isMissingTrk && !hasError;

                  const rowBgClass = isSelected
                    ? "bg-blue-50/70"
                    : hasError
                    ? "bg-red-50/60"
                    : hasWarning
                    ? "bg-amber-50/40"
                    : "bg-white";

                  return (
                    <tr key={row.id} className={`transition-colors hover:bg-slate-50 ${rowBgClass}`}>
                      {/* Checkbox de selección */}
                      <td className="py-2 px-3 text-center border-r border-slate-200">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectRow(row.id)}
                          aria-label={`Seleccionar orden ${row.customer_order}`}
                          className="w-3.5 h-3.5 rounded text-[#233762] focus:ring-0 cursor-pointer"
                        />
                      </td>

                      {/* Columna 1: # (1..N) */}
                      <td className="py-2 px-2 text-center font-bold text-slate-700 font-mono text-xs border-r border-slate-200">
                        {index + 1}
                      </td>

                      {/* Columna 2: Carrier */}
                      <td className="py-2 px-2 border-r border-slate-200">
                        <input
                          type="text"
                          value={isCustomMode ? row.carrier : carrierName}
                          onChange={(e) => handleCellChange(row.id, "carrier", e.target.value)}
                          className={`w-full px-2 py-1.5 text-xs text-center rounded-lg border font-semibold focus:outline-none transition ${
                            isIncompleteHighlighted && isMissingCarrier
                              ? "bg-red-50 border-red-400 text-red-900 focus:border-red-500"
                              : "bg-transparent hover:bg-slate-50 focus:bg-white border-transparent focus:border-[#233762] text-slate-800"
                          }`}
                          placeholder="ESTAFETAREST"
                        />
                      </td>

                      {/* Columna 3: Cuenta (Selector KYNDRYL/BASF en modo oficial; Texto libre en modo ajeno) */}
                      <td className="py-2 px-2 border-r border-slate-200">
                        {isCustomMode ? (
                          <input
                            type="text"
                            value={row.account ?? ""}
                            onChange={(e) => handleCellChange(row.id, "account", e.target.value)}
                            placeholder="Ej. CLIENTE..."
                            className={`w-full px-2 py-1.5 text-xs text-center rounded-lg border font-bold focus:outline-none transition ${
                              isIncompleteHighlighted && isMissingAccount
                                ? "bg-red-50 border-red-400 text-red-900 focus:border-red-500"
                                : "bg-transparent hover:bg-slate-50 focus:bg-white border-transparent focus:border-[#233762] text-[#233762]"
                            }`}
                          />
                        ) : (
                          <select
                            value={normalizedAccount}
                            onChange={(e) => handleCellChange(row.id, "account", e.target.value)}
                            aria-label="Seleccionar cuenta"
                            className="w-full px-2 py-1.5 text-xs text-center rounded-lg bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent focus:border-[#233762] font-bold text-[#233762] focus:outline-none transition cursor-pointer"
                          >
                            <option value="KYNDRYL">KYNDRYL</option>
                            <option value="BASF">BASF</option>
                          </select>
                        )}
                      </td>

                      {/* Columna 4: Tracking Number */}
                      <td className="py-2 px-3">
                        <div className="relative flex items-center">
                          <input
                            type="text"
                            value={row.tracking_number}
                            onChange={(e) => handleCellChange(row.id, "tracking_number", e.target.value)}
                            className={`w-full px-3 py-1.5 text-xs font-mono text-center rounded-lg border transition focus:outline-none ${
                              isDuplicateTrk || (isIncompleteHighlighted && isMissingTrk)
                                ? "bg-red-50 border-red-400 text-red-800 focus:border-red-500 font-bold pr-20"
                                : isMissingTrk
                                ? "bg-amber-50 border-amber-300 text-amber-800 focus:border-amber-500 pr-16"
                                : "bg-transparent hover:bg-slate-50 focus:bg-white border-transparent focus:border-[#233762] text-slate-900"
                            }`}
                            placeholder="Capturar número de guía..."
                          />
                          {isMissingTrk && (
                            <span className="absolute right-2.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 pointer-events-none">
                              Sin guía
                            </span>
                          )}
                          {isDuplicateTrk && (
                            <span className="absolute right-2.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-200 pointer-events-none">
                              Duplicado
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Columna 5: Pick Order (RITM) */}
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={pickOrderValue}
                          onChange={(e) => handleCellChange(row.id, "pick_order", e.target.value)}
                          placeholder={isCustomMode ? "Pick Order libre..." : undefined}
                          className={`w-full px-3 py-1.5 text-xs font-mono text-center rounded-lg border focus:outline-none transition ${
                            isIncompleteHighlighted && isMissingPickSuffix
                              ? "bg-red-50 border-red-400 text-red-900 focus:border-red-500 font-bold"
                              : "bg-transparent hover:bg-slate-50 focus:bg-white border-transparent focus:border-[#233762] text-slate-800"
                          }`}
                        />
                      </td>

                      {/* Columna 6: CUSTOMER ORDER */}
                      <td className="py-2 px-3 border-r border-slate-200">
                        <div className="relative flex items-center">
                          <input
                            type="text"
                            value={row.customer_order}
                            onChange={(e) => handleCellChange(row.id, "customer_order", e.target.value)}
                            className={`w-full px-3 py-1.5 text-xs font-mono text-center rounded-lg border transition focus:outline-none ${
                              isDuplicateRitm
                                ? "bg-red-50 border-red-300 text-red-800 focus:border-red-500 font-bold pr-14"
                                : isIncompleteHighlighted && isMissingCustomerOrder
                                ? "bg-red-50 border-red-400 text-red-900 focus:border-red-500 font-bold"
                                : "bg-transparent hover:bg-slate-50 focus:bg-white border-transparent focus:border-[#233762] text-slate-900"
                            }`}
                            placeholder={
                              isCustomMode
                                ? "Orden / Referencia..."
                                : normalizedAccount === "BASF"
                                ? "BRITM..."
                                : "RITM..."
                            }
                          />
                          {isDuplicateRitm && (
                            <span className="absolute right-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-200 pointer-events-none">
                              Dup
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Columna 7: Cajas (Fijo en 1 en modo oficial; Editable en modo ajeno) */}
                      <td className="py-2 px-2 text-center border-r border-slate-200">
                        {isCustomMode ? (
                          <input
                            type="number"
                            min="1"
                            max="999"
                            value={row.boxes || 1}
                            onChange={(e) => handleCellChange(row.id, "boxes", e.target.value)}
                            className="w-16 text-center px-1.5 py-1.5 text-xs font-bold text-slate-900 rounded-lg bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-[#233762] focus:outline-none transition"
                          />
                        ) : (
                          <span className="inline-block w-14 text-center py-1.5 text-xs font-bold text-slate-900 select-none">
                            1
                          </span>
                        )}
                      </td>

                      {/* Eliminar fila individual (abre ventana de confirmación) */}
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => requestDeleteSingleRow(row, index)}
                          title="Eliminar esta fila"
                          aria-label="Eliminar fila"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
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
                    {deleteDialog.mode === "selected" &&
                      `¿Estás seguro de eliminar ${deleteDialog.count} orden(es)?`}
                    {deleteDialog.mode === "reset" && "¿Estás seguro de restaurar las órdenes del día?"}
                  </h3>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    {deleteDialog.mode === "single" && (
                      <>
                        Se eliminará la fila{" "}
                        <span className="font-bold text-slate-800">{deleteDialog.targetLabel}</span> de la lista de
                        tracking del día.
                      </>
                    )}
                    {deleteDialog.mode === "selected" && (
                      <>
                        Estás a punto de eliminar{" "}
                        <span className="font-bold text-slate-800">{deleteDialog.count} fila(s) seleccionada(s)</span>{" "}
                        de la tabla.
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
      {/* MODAL DE VISTA PREVIA DEL PDF (SE ABRE AL PRESIONAR EL BOTÓN)      */}
      {/* ------------------------------------------------------------------ */}
      {showPreviewModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
          onClick={handleClosePreview}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera del Modal */}
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
                    {totals.totalOrders} orden(es) &bull; {totals.totalBoxes} caja(s) &bull; {formatLongDate(headerInfo.date)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition shadow-2xs cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir</span>
                </button>

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
                  onClick={handleClosePreview}
                  aria-label="Cerrar vista previa"
                  className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition cursor-pointer ml-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Visor PDF embebido */}
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
