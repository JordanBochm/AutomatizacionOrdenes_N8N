"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  ChevronDown,
  MoreHorizontal,
  Info,
  Eye,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatLongDate } from "@/lib/trackingPdf";
import { useHistoryCapture } from "@/hooks/useHistoryCapture";

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
  initialTracking?: string;
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

function getStandardRastreoFileName(ext: "xlsx" | "csv" | "pdf"): string {
  const MESES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  const now = new Date();
  const dia = String(now.getDate()).padStart(2, "0");
  const mes = MESES[now.getMonth()] || "Mes";
  return `RASTREO_${dia}_${mes}.${ext}`;
}

const SHORT_MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function formatShortTrackingDate(rawDate?: string | null): string {
  if (!rawDate) return "";
  const match = String(rawDate).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return String(rawDate).trim();
  const monthIdx = parseInt(match[2], 10) - 1;
  const dayNum = parseInt(match[3], 10);
  const shortMonth = SHORT_MONTHS_ES[monthIdx];
  if (!shortMonth || Number.isNaN(dayNum)) return String(rawDate).slice(0, 10);
  return `${dayNum} ${shortMonth}`;
}

/**
 * Construye el documento PDF de Rastreo de Envíos replicando exactamente la geometría,
 * colores (#233762, #CE3A39, #D9E2F3), logotipo y pie de página de TRACKING_28_Octubre.pdf.
 */
function buildTransportTrackingPdf(
  items: TrackingResultItem[],
  logoDataUrl?: string | null
): jsPDF {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "letter",
  });

  const pageHeight = doc.internal.pageSize.getHeight(); // 215.9 mm
  const COLOR_NAVY: [number, number, number] = [35, 55, 98]; // #233762
  const COLOR_RED: [number, number, number] = [206, 58, 57]; // #CE3A39
  const COLOR_SUMMARY_FILL: [number, number, number] = [217, 226, 243]; // #D9E2F3
  const COLOR_SLATE_DARK: [number, number, number] = [15, 23, 42]; // #0F172A
  const COLOR_SLATE_MUTED: [number, number, number] = [100, 116, 139]; // #64748B
  const COLOR_BLACK: [number, number, number] = [0, 0, 0];

  // 7 columnas que suman exactamente 263.4 mm (márgenes izq/der = 8 mm, igual que trackingPdf.ts)
  const marginLeft = 8;
  const colWidths = [9.4, 26, 44, 34, 52, 36, 62];
  const tableWidth = colWidths.reduce((acc, w) => acc + w, 0); // 263.4 mm
  const colX: number[] = [marginLeft];
  for (let i = 0; i < colWidths.length; i++) {
    colX.push(colX[i] + colWidths[i]);
  }
  const centerX = marginLeft + tableWidth / 2;

  // 1. Logotipo Oficial SupplyChain México
  let logoPlaced = false;
  if (logoDataUrl) {
    try {
      const props = doc.getImageProperties(logoDataUrl);
      const targetH = 12.5;
      const targetW = (props.width / props.height) * targetH;
      doc.addImage(logoDataUrl, "PNG", marginLeft, 5.5, targetW, targetH);
      logoPlaced = true;
    } catch {
      logoPlaced = false;
    }
  }

  if (!logoPlaced) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...COLOR_NAVY);
    doc.text("Supply", marginLeft, 13);
    doc.setTextColor(...COLOR_RED);
    doc.text("Chain", marginLeft + 16, 13);
    doc.setFontSize(8.5);
    doc.setTextColor(...COLOR_SLATE_MUTED);
    doc.text("MÉXICO", marginLeft + 30.5, 13);
  }

  // 2. Título "Asset Management" y Franja Azul Marino #233762
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...COLOR_NAVY);
  doc.text("Asset Management", centerX, 16.2, { align: "center" });

  const bannerY = 19.5;
  const bannerH = 8.2;
  doc.setFillColor(...COLOR_NAVY);
  doc.rect(marginLeft, bannerY, tableWidth, bannerH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13.5);
  doc.setTextColor(255, 255, 255);
  doc.text("REPORTE DE RASTREO DE ENVÍOS DEL DÍA", centerX, bannerY + 5.7, { align: "center" });

  // Línea bicolor oficial (#233762 / #CE3A39)
  const officialLineY = bannerY + bannerH + 1.4;
  const officialLineH = 0.75;
  doc.setFillColor(...COLOR_NAVY);
  doc.rect(marginLeft, officialLineY, tableWidth / 2, officialLineH, "F");
  doc.setFillColor(...COLOR_RED);
  doc.rect(marginLeft + tableWidth / 2, officialLineY, tableWidth / 2, officialLineH, "F");

  // 3. Fecha larga en cursiva y Clientes centrados
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const dateY = officialLineY + officialLineH + 4.2;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9.5);
  doc.setTextColor(80, 90, 105);
  doc.text(formatLongDate(todayIso), centerX, dateY, { align: "center" });

  const clientsY = dateY + 5.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLOR_NAVY);
  doc.text("KYNDRYL & BASF", centerX, clientsY, { align: "center" });

  const dividerY = clientsY + 2.2;
  doc.setDrawColor(...COLOR_NAVY);
  doc.setLineWidth(0.45);
  doc.line(marginLeft, dividerY, marginLeft + tableWidth, dividerY);

  // 4. Bloque de Resumen Superior con Cajas #D9E2F3 (Idéntico a trackingPdf.ts)
  const countFedex = items.filter((r) => r.carrier === "FEDEX").length;
  const countEstafeta = items.filter((r) => r.carrier === "ESTAFETA").length;
  const countDelivered = items.filter((r) => r.estatus_general === "ENTREGADO").length;
  const countInTransit = items.filter(
    (r) =>
      r.estatus_general === "EN_TRANSITO" ||
      r.estatus_general === "EN_REPARTO" ||
      r.estatus_general === "RECOLECTADO"
  ).length;
  const countIssues = items.filter(
    (r) => r.estatus_general === "INCIDENCIA" || r.retrasado || Boolean(r.error)
  ).length;

  const summaryRowH = 6.2;
  let currentSummaryY = dividerY + 0.4;
  const leftBoxX = colX[2];
  const leftBoxW = colWidths[2] + colWidths[3];
  const rightBoxX = colX[6];
  const rightBoxW = colWidths[6];

  const summaryRows: Array<{
    leftLabel: string;
    leftVal: number;
    leftBold: boolean;
    rightLabel: string;
    rightVal: number;
    rightAlert?: boolean;
  }> = [
    {
      leftLabel: "Total Guías:",
      leftVal: items.length,
      leftBold: true,
      rightLabel: "Entregadas:",
      rightVal: countDelivered,
    },
    {
      leftLabel: "FEDEX:",
      leftVal: countFedex,
      leftBold: false,
      rightLabel: "En Tránsito / Reparto:",
      rightVal: countInTransit,
    },
    {
      leftLabel: "ESTAFETA:",
      leftVal: countEstafeta,
      leftBold: false,
      rightLabel: "Incidencias / Retrasos:",
      rightVal: countIssues,
      rightAlert: countIssues > 0,
    },
  ];

  summaryRows.forEach((sr) => {
    doc.setFont("helvetica", sr.leftBold ? "bold" : "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...(sr.leftBold ? COLOR_NAVY : COLOR_SLATE_DARK));
    doc.text(sr.leftLabel, colX[2] - 2, currentSummaryY + 4.3, { align: "right" });

    doc.setFillColor(...COLOR_SUMMARY_FILL);
    doc.setDrawColor(...COLOR_BLACK);
    doc.setLineWidth(0.25);
    doc.rect(leftBoxX, currentSummaryY, leftBoxW, summaryRowH, "FD");

    doc.setFont("helvetica", sr.leftBold ? "bold" : "normal");
    doc.setFontSize(10);
    doc.setTextColor(...COLOR_SLATE_DARK);
    doc.text(String(sr.leftVal), leftBoxX + leftBoxW / 2, currentSummaryY + 4.4, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...(sr.rightAlert ? COLOR_RED : COLOR_NAVY));
    doc.text(sr.rightLabel, colX[6] - 2, currentSummaryY + 4.3, { align: "right" });

    doc.setFillColor(...COLOR_SUMMARY_FILL);
    doc.setDrawColor(...COLOR_BLACK);
    doc.setLineWidth(0.25);
    doc.rect(rightBoxX, currentSummaryY, rightBoxW, summaryRowH, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...(sr.rightAlert ? COLOR_RED : COLOR_SLATE_DARK));
    doc.text(String(sr.rightVal), rightBoxX + rightBoxW / 2, currentSummaryY + 4.4, { align: "center" });

    currentSummaryY += summaryRowH;
  });

  // 5. Tabla Principal de 7 Columnas
  const tableStartY = currentSummaryY + 1.4;
  const tableBody = items.map((r, idx) => {
    const baseLabel = STATUS_UI_CONFIG[r.estatus_general]?.label || r.estatus_general;
    const statusText = r.retrasado && r.estatus_general !== "ENTREGADO" ? `${baseLabel} (RETRASADO)` : baseLabel;
    const routeText =
      r.origen || r.destino ? `${r.origen || "S/D"} -> ${r.destino || "S/D"}` : "Sin ruta reportada";
    const dateText =
      r.estatus_general === "ENTREGADO" && r.fecha_entrega_real
        ? `Entregado: ${r.fecha_entrega_real}`
        : r.fecha_estimada_entrega || "—";
    const lastEv = r.eventos[0];
    const lastMoveText = lastEv
      ? `${lastEv.descripcion} (${lastEv.ubicacion})`
      : r.error || "Sin eventos registrados";

    return [
      String(idx + 1),
      r.carrier,
      r.guia,
      statusText,
      routeText,
      dateText,
      lastMoveText,
    ];
  });

  autoTable(doc, {
    startY: tableStartY,
    margin: { top: 18, bottom: 15, left: marginLeft, right: marginLeft },
    head: [
      [
        "#",
        "Carrier",
        "Tracking Number",
        "Estatus",
        "Origen -> Destino",
        "Fecha Estimada / Entrega",
        "Último Movimiento / Ubicación",
      ],
    ],
    body: tableBody,
    theme: "plain",
    showHead: "everyPage",
    headStyles: {
      fillColor: COLOR_NAVY,
      textColor: [255, 255, 255],
      font: "helvetica",
      fontStyle: "bold",
      fontSize: 8.8,
      cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
      lineWidth: 0.25,
      lineColor: COLOR_BLACK,
      halign: "center",
    },
    bodyStyles: {
      fillColor: [255, 255, 255],
      textColor: COLOR_SLATE_DARK,
      font: "helvetica",
      fontSize: 8.2,
      halign: "center",
      valign: "middle",
      cellPadding: { top: 2.2, bottom: 2.2, left: 1.5, right: 1.5 },
      lineWidth: 0.25,
      lineColor: COLOR_BLACK,
    },
    columnStyles: {
      0: { cellWidth: colWidths[0], halign: "center" },
      1: { cellWidth: colWidths[1], halign: "center" },
      2: { cellWidth: colWidths[2], halign: "center", fontStyle: "bold" },
      3: { cellWidth: colWidths[3], halign: "center", fontStyle: "bold" },
      4: { cellWidth: colWidths[4], halign: "center" },
      5: { cellWidth: colWidths[5], halign: "center" },
      6: { cellWidth: colWidths[6], halign: "left" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 3) {
        const val = String(data.cell.raw || "").toUpperCase();
        if (val.includes("INCIDENCIA") || val.includes("RETRASADO")) {
          data.cell.styles.textColor = COLOR_RED;
        } else if (val.includes("ENTREGADO")) {
          data.cell.styles.textColor = [21, 128, 61];
        } else {
          data.cell.styles.textColor = COLOR_NAVY;
        }
      }
    },
  });

  // 6. Pie de página institucional en cada hoja
  const totalPages = doc.getNumberOfPages();
  const nowStamp = now.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const ribbonY = pageHeight - 9.5;
    doc.setFillColor(...COLOR_NAVY);
    doc.rect(marginLeft, ribbonY, tableWidth / 2, 0.7, "F");
    doc.setFillColor(...COLOR_RED);
    doc.rect(marginLeft + tableWidth / 2, ribbonY, tableWidth / 2, 0.7, "F");

    const textY = pageHeight - 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(...COLOR_SLATE_MUTED);
    doc.text("SupplyChain México", marginLeft, textY);
    doc.text(`Generado el ${nowStamp}`, centerX, textY, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.text(`Página ${i} de ${totalPages}`, marginLeft + tableWidth, textY, { align: "right" });
  }

  return doc;
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
    badgeClass: "bg-slate-50 text-slate-700 border-slate-200",
    dotClass: "bg-emerald-500",
  },
  EN_TRANSITO: {
    label: "En Tránsito",
    badgeClass: "bg-slate-50 text-slate-700 border-slate-200",
    dotClass: "bg-[#233762]",
  },
  RECOLECTADO: {
    label: "Recolectado",
    badgeClass: "bg-slate-50 text-slate-700 border-slate-200",
    dotClass: "bg-slate-500",
  },
  EN_REPARTO: {
    label: "En Reparto",
    badgeClass: "bg-slate-50 text-slate-700 border-slate-200",
    dotClass: "bg-[#233762]",
  },
  INCIDENCIA: {
    label: "Incidencia",
    badgeClass: "bg-slate-50 text-slate-700 border-slate-200",
    dotClass: "bg-[#CE3A39]",
  },
  DESCONOCIDO: {
    label: "Desconocido",
    badgeClass: "bg-slate-50 text-slate-600 border-slate-200",
    dotClass: "bg-slate-400",
  },
};

export default function TransportTracker({
  batchData,
  apiBase,
  triggerToast,
  userEmail = "operador@supplychain.mx",
  userRole = "ADMIN",
  initialTracking,
}: TransportTrackerProps) {
  // Entrada de búsqueda masiva / individual
  const [rawInput, setRawInput] = useState<string>(initialTracking || "");

  // Soporte para precargar tracking desde navegación cruzada (Reportes)
  useEffect(() => {
    if (initialTracking && initialTracking.trim()) {
      setRawInput(initialTracking.trim());
    }
  }, [initialTracking]);
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

  // Modal de Vista Previa del PDF y logotipo institucional
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  // Historial reciente en localStorage
  const [recentGuides, setRecentGuides] = useState<RecentGuideItem[]>([]);

  // Estados mínimos de UI para menús desplegables y autoajuste de textarea
  const [moreOptionsOpen, setMoreOptionsOpen] = useState<boolean>(false);
  const [recentsMenuOpen, setRecentsMenuOpen] = useState<boolean>(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState<boolean>(false);
  const [statusPopoverOpen, setStatusPopoverOpen] = useState<boolean>(false);
  const [confirmClearAll, setConfirmClearAll] = useState<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const moreOptionsRef = useRef<HTMLDivElement | null>(null);
  const recentsMenuRef = useRef<HTMLDivElement | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const statusPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 56), 168)}px`;
  }, [rawInput]);

  useEffect(() => {
    if (!moreOptionsOpen && !recentsMenuOpen && !actionsMenuOpen && !statusPopoverOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (moreOptionsOpen && moreOptionsRef.current && !moreOptionsRef.current.contains(target)) {
        setMoreOptionsOpen(false);
      }
      if (recentsMenuOpen && recentsMenuRef.current && !recentsMenuRef.current.contains(target)) {
        setRecentsMenuOpen(false);
      }
      if (actionsMenuOpen && actionsMenuRef.current && !actionsMenuRef.current.contains(target)) {
        setActionsMenuOpen(false);
        setConfirmClearAll(false);
      }
      if (statusPopoverOpen && statusPopoverRef.current && !statusPopoverRef.current.contains(target)) {
        setStatusPopoverOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMoreOptionsOpen(false);
        setRecentsMenuOpen(false);
        setActionsMenuOpen(false);
        setStatusPopoverOpen(false);
        setConfirmClearAll(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [moreOptionsOpen, recentsMenuOpen, actionsMenuOpen, statusPopoverOpen]);

  // Captura del historial de Asset Management (trackings del día)
  const { captureTrackings } = useHistoryCapture(userEmail);

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

    // Precargar logotipo institucional para el PDF estandarizado
    fetch("/logo-supplychain.png")
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob) return;
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === "string") {
            setLogoDataUrl(reader.result);
          }
        };
        reader.readAsDataURL(blob);
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
        void captureTrackings(incoming);
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
    [apiBase, saveToRecentHistory, captureTrackings, triggerToast, userEmail, userRole]
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
      void captureTrackings([updated]);
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

  // Abrir Vista Previa en vivo del PDF (mismo patrón que Generador de Tracking)
  const handleOpenPdfPreview = () => {
    if (filteredResults.length === 0) {
      triggerToast("Consulta al menos una guía para abrir la vista previa del PDF.", "info");
      return;
    }
    try {
      const doc = buildTransportTrackingPdf(filteredResults, logoDataUrl);
      const blob = doc.output("blob");
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
      const url = URL.createObjectURL(blob);
      setPdfBlobUrl(url);
      setShowPreviewModal(true);
    } catch (err: any) {
      triggerToast(err.message || "Error al generar la vista previa del PDF.", "error");
    }
  };

  // Descargar PDF estandarizado (RASTREO_DD_Mes.pdf)
  const handleDownloadPdf = () => {
    if (filteredResults.length === 0) {
      triggerToast("No hay resultados en la tabla para generar el PDF.", "error");
      return;
    }
    try {
      const doc = buildTransportTrackingPdf(filteredResults, logoDataUrl);
      const fileName = getStandardRastreoFileName("pdf");
      doc.save(fileName);
      triggerToast(`Archivo ${fileName} generado y descargado exitosamente.`, "success");
    } catch (err: any) {
      triggerToast(err.message || "Error al descargar el PDF.", "error");
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

  const hasResultsOrLoading = results.length > 0 || isBatchLoading;
  const hasMultipleCarriers = useMemo(
    () => new Set(results.map((r) => r.carrier)).size > 1,
    [results]
  );

  const apiTooltipText = carrierConfig
    ? `Conexión de APIs — FedEx: ${carrierConfig.FEDEX ? "Live" : "Simulador"} · Estafeta: ${
        carrierConfig.ESTAFETA ? "Live" : "Simulador"
      }`
    : "Verificando estado de conexión con FedEx y Estafeta...";

  const apiAllLive = Boolean(carrierConfig?.FEDEX && carrierConfig?.ESTAFETA);
  const apiAnyLive = Boolean(carrierConfig?.FEDEX || carrierConfig?.ESTAFETA);

  const inlineDetectedText = useMemo(() => {
    if (inputPreviewSummary.total === 0) return "";
    const parts: string[] = [];
    if (
      inputPreviewSummary.fedex === inputPreviewSummary.total &&
      inputPreviewSummary.estafeta === 0 &&
      inputPreviewSummary.ambiguo === 0
    ) {
      parts.push("FedEx");
    } else if (
      inputPreviewSummary.estafeta === inputPreviewSummary.total &&
      inputPreviewSummary.fedex === 0 &&
      inputPreviewSummary.ambiguo === 0
    ) {
      parts.push("Estafeta");
    } else {
      if (inputPreviewSummary.fedex > 0) parts.push(`${inputPreviewSummary.fedex} FedEx`);
      if (inputPreviewSummary.estafeta > 0) parts.push(`${inputPreviewSummary.estafeta} Estafeta`);
      if (inputPreviewSummary.ambiguo > 0) parts.push(`${inputPreviewSummary.ambiguo} por autodetectar`);
    }
    const countLabel = `${inputPreviewSummary.total} ${
      inputPreviewSummary.total === 1 ? "guía" : "guías"
    }`;
    return parts.length > 0 ? `${countLabel} · ${parts.join(", ")}` : countLabel;
  }, [inputPreviewSummary]);

  const renderCaptureSection = (centeredEmpty: boolean) => (
    <section
      className={`bg-white rounded-2xl border border-slate-200 shadow-xs ${
        centeredEmpty ? "p-6 sm:p-8 w-full max-w-3xl mx-auto" : "p-4 sm:p-5"
      }`}
    >
      {/* Encabezado discreto: punto de estado de APIs + menú Recientes */}
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          {carrierConfig && (
            <span
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 select-none"
              title={apiTooltipText}
              aria-label={apiTooltipText}
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  apiAllLive ? "bg-emerald-500" : apiAnyLive ? "bg-emerald-500" : "bg-slate-400"
                }`}
              />
              {centeredEmpty && (
                <span className="font-medium text-slate-600">
                  Rastrea tus envíos de FedEx y Estafeta en segundos
                </span>
              )}
            </span>
          )}
          {!carrierConfig && centeredEmpty && (
            <span className="text-xs font-medium text-slate-600">
              Rastrea tus envíos de FedEx y Estafeta en segundos
            </span>
          )}
          {!centeredEmpty && (
            <span className="text-xs font-semibold text-slate-500">Agregar o consultar guías</span>
          )}
        </div>

        {/* Enlace desplegable "Recientes" */}
        {recentGuides.length > 0 && (
          <div ref={recentsMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setRecentsMenuOpen((prev) => !prev)}
              aria-expanded={recentsMenuOpen}
              aria-haspopup="menu"
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-[#233762] transition cursor-pointer focus-visible:outline-2 focus-visible:outline-[#233762] rounded-md px-1.5 py-0.5"
            >
              <History className="w-3.5 h-3.5" />
              <span>Recientes ({recentGuides.length})</span>
              <ChevronDown
                className={`w-3 h-3 transition-transform ${recentsMenuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {recentsMenuOpen && (
              <div
                role="menu"
                aria-label="Guías consultadas recientemente"
                className="absolute right-0 mt-1.5 w-64 rounded-xl bg-white border border-slate-200 shadow-lg py-1.5 z-30"
              >
                <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {recentGuides.map((item) => (
                    <button
                      key={item.guia}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setRecentsMenuOpen(false);
                        void executeBatchTracking([item.guia], item.carrier, false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center justify-between gap-2 text-xs transition cursor-pointer"
                    >
                      <span className="font-mono font-semibold text-[#233762] truncate">
                        {item.guia}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        {item.carrier}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="border-t border-slate-100 mt-1 pt-1 px-2 flex justify-end">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      clearRecentHistory();
                      setRecentsMenuOpen(false);
                    }}
                    className="px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-[#CE3A39] rounded-md hover:bg-red-50 transition cursor-pointer"
                  >
                    Limpiar recientes
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fila única: textarea autoajustable + selector Auto + botón Rastrear + menú Más opciones */}
      <form onSubmit={handleSubmitSearch} className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-start">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            rows={2}
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void handleSubmitSearch();
              }
            }}
            placeholder="Pega hasta 50 guías (una por línea, coma o espacio)"
            aria-label="Números de guía a rastrear"
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white px-3.5 py-2.5 pr-8 text-xs font-mono text-slate-800 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#233762]/15 focus:border-[#233762] transition resize-none overflow-y-auto"
          />
          {rawInput && (
            <button
              type="button"
              onClick={() => setRawInput("")}
              aria-label="Limpiar texto de guías"
              className="absolute top-2.5 right-2.5 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-[#233762]"
              title="Limpiar entrada"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Selector compacto de carrier ("Auto" por defecto) */}
          <select
            value={forcedCarrier}
            onChange={(e) => setForcedCarrier(e.target.value)}
            aria-label="Seleccionar carrier"
            title="Detección de carrier (Automático por defecto)"
            className="h-10 px-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#233762] cursor-pointer"
          >
            <option value="AUTO">Auto</option>
            <option value="FEDEX">FedEx</option>
            <option value="ESTAFETA">Estafeta</option>
          </select>

          {/* Acción principal: Rastrear (N) */}
          <button
            type="submit"
            disabled={isBatchLoading || parsedInputGuides.length === 0}
            className="h-10 inline-flex items-center justify-center gap-2 px-4 sm:px-5 rounded-xl bg-[#233762] hover:bg-[#1b2b4d] text-white text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#233762] whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isBatchLoading ? "animate-spin" : ""}`} />
            <span>
              {isBatchLoading
                ? "Rastreando..."
                : parsedInputGuides.length > 0
                ? `Rastrear (${Math.min(parsedInputGuides.length, MAX_BATCH_SIZE)})`
                : "Rastrear"}
            </span>
          </button>

          {/* Menú ⋯ Más opciones */}
          <div ref={moreOptionsRef} className="relative">
            <button
              type="button"
              onClick={() => setMoreOptionsOpen((prev) => !prev)}
              aria-label="Más opciones de carga"
              aria-expanded={moreOptionsOpen}
              aria-haspopup="menu"
              title="Más opciones"
              className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-[#233762] transition cursor-pointer focus-visible:outline-2 focus-visible:outline-[#233762]"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {moreOptionsOpen && (
              <div
                role="menu"
                aria-label="Más opciones"
                className="absolute right-0 mt-1.5 w-60 rounded-xl bg-white border border-slate-200 shadow-lg py-1.5 z-30"
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={isBatchLoading || activeBatchGuides.length === 0}
                  onClick={() => {
                    setMoreOptionsOpen(false);
                    void handleTrackActiveBatch();
                  }}
                  title={
                    activeBatchGuides.length > 0
                      ? "Rastrear las guías del lote activo en Automatizador de operación"
                      : "No hay un lote activo con números de guía asignados"
                  }
                  className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-[#233762] flex items-center gap-2.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>
                    Rastrear lote actual
                    {activeBatchGuides.length > 0 ? ` (${activeBatchGuides.length})` : ""}
                  </span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  disabled={isBatchLoading}
                  onClick={() => {
                    setMoreOptionsOpen(false);
                    void handleLoadDemoGuides();
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-[#233762] flex items-center gap-2.5 transition cursor-pointer disabled:opacity-40"
                >
                  <Truck className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>Probar guías ejemplo</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </form>

      {/* Detección inline discreta: solo visible si hay texto en el textarea */}
      {inlineDetectedText && (
        <p className="mt-2 text-[11px] font-mono text-slate-500">{inlineDetectedText}</p>
      )}
    </section>
  );

  return (
    <main className="w-full max-w-[1540px] mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 py-6 flex-1 flex flex-col gap-5">
      {/* ZONA 1: FILA COMPACTA DE 4 CHIPS KPI */}
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Resumen y filtros rápidos de rastreo"
      >
            {(
              [
                {
                  key: "ALL" as const,
                  label: "Consultadas",
                  value: metrics.total,
                  dotClass: "bg-[#233762]",
                  tooltip: "Mostrar todas las guías consultadas",
                  isAlert: false,
                },
                {
                  key: "ENTREGADO" as const,
                  label: "Entregadas",
                  value: metrics.entregados,
                  dotClass: "bg-emerald-500",
                  tooltip: "Envíos finalizados con éxito",
                  isAlert: false,
                },
                {
                  key: "EN_TRANSITO" as const,
                  label: "En tránsito",
                  value: metrics.enRuta,
                  dotClass: "bg-[#233762]",
                  tooltip: "Unidades en movimiento activo",
                  isAlert: false,
                },
                {
                  key: "DELAYED_OR_ISSUE" as const,
                  label: "Incidencias",
                  value: metrics.incidenciasORetrasos,
                  dotClass: metrics.incidenciasORetrasos > 0 ? "bg-[#CE3A39]" : "bg-slate-300",
                  tooltip: "Excepciones o fecha estimada vencida",
                  isAlert: metrics.incidenciasORetrasos > 0,
                },
              ]
            ).map((chip) => {
              const active = statusFilter === chip.key;
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setStatusFilter(chip.key)}
                  title={chip.tooltip}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs transition cursor-pointer focus-visible:outline-2 focus-visible:outline-[#233762] ${
                    active
                      ? "bg-[#233762] text-white border-[#233762] font-bold shadow-2xs"
                      : chip.isAlert
                      ? "bg-white text-[#CE3A39] border-red-200 hover:border-[#CE3A39]/50 font-semibold"
                      : "bg-white text-slate-700 border-slate-200 hover:border-[#233762]/40 font-medium"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      active && chip.dotClass === "bg-[#233762]" ? "bg-white" : chip.dotClass
                    }`}
                  />
                  <span>{chip.label}</span>
                  <span
                    className={`font-mono font-bold ${
                      active ? "text-white" : chip.isAlert ? "text-[#CE3A39]" : "text-[#233762]"
                    }`}
                  >
                    {chip.value}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ZONA 2: ÁREA DE CAPTURA COMPACTA */}
          {renderCaptureSection(false)}

      {/* ==================================================================== */}
      {/* ZONA 3: BARRA DE HERRAMIENTAS DE TABLA, FILTROS Y EXPORTACIÓN        */}
      {/* ==================================================================== */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-xs flex-1 flex flex-col">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          {/* Izquierda: Tabs de Carrier + Buscador con embudo de estatus integrado */}
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
            <div
              className="inline-flex items-center p-1 rounded-xl bg-slate-100 text-xs font-semibold"
              role="tablist"
              aria-label="Filtrar por paquetería"
            >
              {(
                [
                  { id: "ALL" as const, label: `Todos (${results.length})` },
                  {
                    id: "FEDEX" as const,
                    label: `FedEx (${results.filter((r) => r.carrier === "FEDEX").length})`,
                  },
                  {
                    id: "ESTAFETA" as const,
                    label: `Estafeta (${results.filter((r) => r.carrier === "ESTAFETA").length})`,
                  },
                ]
              ).map((tab) => {
                const active = carrierFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setCarrierFilter(tab.id)}
                    className={`px-2.5 py-1 rounded-lg transition cursor-pointer focus-visible:outline-2 focus-visible:outline-[#233762] ${
                      active
                        ? "bg-[#233762] text-white font-bold shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Buscador con botón de filtro (embudo) integrado */}
            <div ref={statusPopoverRef} className="relative flex-1 min-w-[210px] max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Buscar guía, origen, destino..."
                aria-label="Buscar en resultados de rastreo"
                className="w-full pl-8 pr-14 py-1.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-[#233762] transition"
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                {tableSearch && (
                  <button
                    type="button"
                    onClick={() => setTableSearch("")}
                    aria-label="Limpiar búsqueda"
                    title="Limpiar búsqueda"
                    className="p-1 rounded-md text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setStatusPopoverOpen((prev) => !prev)}
                  aria-label="Filtrar por estatus"
                  aria-expanded={statusPopoverOpen}
                  aria-haspopup="listbox"
                  title="Filtrar por estatus específico"
                  className={`relative p-1 rounded-lg transition cursor-pointer focus-visible:outline-2 focus-visible:outline-[#233762] ${
                    statusFilter !== "ALL"
                      ? "text-[#233762] bg-[#EFF3F9]"
                      : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  {statusFilter !== "ALL" && (
                    <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-[#233762]" />
                  )}
                </button>
              </div>

              {statusPopoverOpen && (
                <div
                  role="listbox"
                  aria-label="Seleccionar filtro de estatus"
                  className="absolute left-0 mt-1.5 w-52 rounded-xl bg-white border border-slate-200 shadow-lg py-1.5 z-30"
                >
                  {(
                    [
                      { value: "ALL", label: "Todos los estatus" },
                      { value: "ENTREGADO", label: "Entregado" },
                      { value: "EN_TRANSITO", label: "En Tránsito" },
                      { value: "EN_REPARTO", label: "En Reparto" },
                      { value: "RECOLECTADO", label: "Recolectado" },
                      { value: "INCIDENCIA", label: "Solo Incidencias" },
                      { value: "DELAYED_OR_ISSUE", label: "Incidencias o Retrasados" },
                      { value: "DESCONOCIDO", label: "Desconocido" },
                    ] as const
                  ).map((opt) => {
                    const selected = statusFilter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          setStatusFilter(opt.value as any);
                          setStatusPopoverOpen(false);
                        }}
                        className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition cursor-pointer ${
                          selected
                            ? "bg-[#EFF3F9] text-[#233762] font-bold"
                            : "text-slate-700 hover:bg-slate-50 font-medium"
                        }`}
                      >
                        <span>{opt.label}</span>
                        {selected && <span className="w-1.5 h-1.5 rounded-full bg-[#233762]" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Acción contextual discreta solo cuando hay algún filtro activo */}
            {(carrierFilter !== "ALL" || statusFilter !== "ALL" || tableSearch.trim() !== "") && (
              <button
                type="button"
                onClick={() => {
                  setCarrierFilter("ALL");
                  setStatusFilter("ALL");
                  setTableSearch("");
                }}
                className="text-xs font-medium text-slate-500 hover:text-[#233762] underline underline-offset-2 cursor-pointer px-1"
              >
                Restablecer filtros
              </button>
            )}
          </div>

          {/* Derecha: Sello discreto "Actualizado HH:MM" + Menú desplegable "Acciones" */}
          <div className="flex items-center gap-3">
            {results[0]?.ultima_actualizacion && (
              <span
                className="hidden sm:inline text-[11px] font-mono text-slate-400"
                title={`Última consulta: ${results[0].ultima_actualizacion}`}
              >
                Actualizado{" "}
                {results[0].ultima_actualizacion.length >= 16
                  ? results[0].ultima_actualizacion.slice(11, 16)
                  : results[0].ultima_actualizacion}
              </span>
            )}

            <div ref={actionsMenuRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setActionsMenuOpen((prev) => !prev);
                  setConfirmClearAll(false);
                }}
                aria-expanded={actionsMenuOpen}
                aria-haspopup="menu"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-[#233762] text-xs font-semibold transition cursor-pointer focus-visible:outline-2 focus-visible:outline-[#233762]"
              >
                <span>Acciones</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                    actionsMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {actionsMenuOpen && (
                <div
                  role="menu"
                  aria-label="Acciones de la tabla de rastreo"
                  className="absolute right-0 mt-1.5 w-56 rounded-xl bg-white border border-slate-200 shadow-lg py-1.5 z-30"
                >
                  <button
                    type="button"
                    role="menuitem"
                    disabled={results.length === 0 || isBatchLoading}
                    onClick={() => {
                      setActionsMenuOpen(false);
                      void handleRefreshAll();
                    }}
                    title="Ignorar caché y consultar nuevamente todas las guías"
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-[#233762] flex items-center gap-2.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isBatchLoading ? "animate-spin" : ""}`} />
                    <span>Actualizar todo</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    disabled={filteredResults.length === 0 || isExportingExcel}
                    onClick={() => {
                      setActionsMenuOpen(false);
                      void handleExportExcel();
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-[#233762] flex items-center gap-2.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
                    <span>{isExportingExcel ? "Generando Excel..." : "Exportar Excel"}</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    disabled={filteredResults.length === 0}
                    onClick={() => {
                      setActionsMenuOpen(false);
                      handleOpenPdfPreview();
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-[#233762] flex items-center gap-2.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Eye className="w-3.5 h-3.5 text-slate-500" />
                    <span>Vista previa PDF</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    disabled={filteredResults.length === 0}
                    onClick={() => {
                      setActionsMenuOpen(false);
                      handleDownloadPdf();
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-[#233762] flex items-center gap-2.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Generar PDF</span>
                  </button>

                  {results.length > 0 && (
                    <>
                      <div className="my-1 border-t border-slate-100" />
                      {!confirmClearAll ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => setConfirmClearAll(true)}
                          className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-600 hover:bg-red-50 hover:text-[#CE3A39] flex items-center gap-2.5 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Vaciar lista</span>
                        </button>
                      ) : (
                        <div className="px-3.5 py-2 bg-red-50/70 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-[#CE3A39]">¿Vaciar todo?</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setConfirmClearAll(false)}
                              className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[11px] font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                            >
                              No
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setResults([]);
                                setSelectedGuideKey(null);
                                setConfirmClearAll(false);
                                setActionsMenuOpen(false);
                              }}
                              className="px-2 py-0.5 rounded bg-[#CE3A39] text-white text-[11px] font-bold hover:bg-[#B02E2D] cursor-pointer"
                            >
                              Sí, vaciar
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* TABLA DE 5 COLUMNAS (ESCRITORIO) + LISTA DE TARJETAS (MÓVIL)         */}
        {/* ==================================================================== */}
        {isBatchLoading && results.length === 0 ? (
          <div className="divide-y divide-slate-100 p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={`skel-${idx}`} className="py-3 flex items-center justify-between gap-4 animate-pulse">
                <div className="h-4 w-40 bg-slate-200 rounded" />
                <div className="h-4 w-24 bg-slate-200 rounded hidden sm:block" />
                <div className="h-4 w-48 bg-slate-200 rounded hidden md:block" />
                <div className="h-4 w-28 bg-slate-200 rounded hidden lg:block" />
                <div className="h-4 w-56 bg-slate-200 rounded flex-1 max-w-xs" />
              </div>
            ))}
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="py-16 px-6 text-center flex-1 flex flex-col items-center justify-center">
            <div className="w-11 h-11 rounded-2xl bg-[#EFF3F9] text-[#233762] flex items-center justify-center mb-3">
              <Truck className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-[#233762]">
              {results.length === 0
                ? "Aún no has consultado ninguna guía"
                : "No hay guías que coincidan con el filtro aplicado"}
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              {results.length === 0
                ? "Pega tus guías arriba y presiona Rastrear, o usa el menú ⋯ para probar guías de ejemplo."
                : "Ajusta el buscador o cambia de pestaña para ver todos los envíos."}
            </p>
          </div>
        ) : (
          <>
            {/* Vista Escritorio / Tablet: 5 columnas limpias */}
            <div className="hidden md:block overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Guía</th>
                    <th className="py-3 px-3">Estatus</th>
                    <th className="py-3 px-4">Origen → Destino</th>
                    <th className="py-3 px-3">Entrega</th>
                    <th className="py-3 px-4">Último movimiento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredResults.map((item) => {
                    const statusCfg =
                      STATUS_UI_CONFIG[item.estatus_general] || STATUS_UI_CONFIG.DESCONOCIDO;
                    const isDelayedActive =
                      Boolean(item.retrasado) && item.estatus_general !== "ENTREGADO";
                    const isRefreshing = refreshingGuides.has(item.guia);
                    const lastEvent = item.eventos[0];
                    const isSelected = selectedGuideKey === item.guia;

                    const guideMetaParts: string[] = [`Carrier: ${item.carrier}`];
                    if (item.desde_cache) guideMetaParts.push("Desde caché (10m)");
                    if (item.modo_simulacion) guideMetaParts.push("Modo simulación");
                    if (item.es_ambiguo && item.candidatos_carrier?.length) {
                      guideMetaParts.push(
                        `Formato compatible con ${item.candidatos_carrier.join(" / ")}`
                      );
                    }
                    const guideTooltip = guideMetaParts.join(" · ");

                    const routeFull =
                      item.origen || item.destino
                        ? `${item.origen || "Origen s/d"} → ${item.destino || "Destino s/d"}`
                        : "Sin ruta reportada";

                    const deliveryShort =
                      item.estatus_general === "ENTREGADO" && item.fecha_entrega_real
                        ? `Entregado ${formatShortTrackingDate(item.fecha_entrega_real)}`
                        : item.fecha_estimada_entrega
                        ? `Estimada ${formatShortTrackingDate(item.fecha_estimada_entrega)}`
                        : "—";

                    const deliveryFullTooltip =
                      item.estatus_general === "ENTREGADO" && item.fecha_entrega_real
                        ? `Entregado: ${item.fecha_entrega_real}`
                        : item.fecha_estimada_entrega
                        ? `Entrega estimada: ${item.fecha_estimada_entrega}`
                        : undefined;

                    const movementText = lastEvent
                      ? lastEvent.descripcion
                      : item.error || "Sin eventos registrados";
                    const movementTooltip = lastEvent
                      ? `${lastEvent.descripcion} — ${lastEvent.ubicacion} (${lastEvent.fecha})`
                      : item.error || undefined;

                    return (
                      <tr
                        key={item.guia}
                        onClick={() => setSelectedGuideKey(item.guia)}
                        className={`group transition-colors cursor-pointer ${
                          isSelected ? "bg-[#EFF3F9]/60" : "hover:bg-slate-50/80"
                        }`}
                      >
                        {/* 1. Guía (+ etiqueta discreta de carrier solo si coexisten varios + copiar en hover) */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <span
                              className="font-mono font-semibold text-[#233762]"
                              title={guideTooltip}
                            >
                              {item.guia}
                            </span>
                            {hasMultipleCarriers && (
                              <span className="text-[10px] font-mono font-semibold text-slate-400 uppercase">
                                {item.carrier === "FEDEX" ? "FDX" : "EST"}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => handleCopyGuide(e, item.guia)}
                              aria-label={`Copiar guía ${item.guia}`}
                              title="Copiar guía"
                              className="p-1 rounded-md text-slate-400 hover:text-[#233762] hover:bg-slate-200/60 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-[#233762]"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </td>

                        {/* 2. Estatus (punto semántico + texto, sin fondos de fila) */}
                        <td className="py-4 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                isDelayedActive ? "bg-[#CE3A39]" : statusCfg.dotClass
                              }`}
                            />
                            <span>{statusCfg.label}</span>
                            {isDelayedActive && (
                              <span className="text-[#CE3A39] font-medium">· Retrasado</span>
                            )}
                          </span>
                        </td>

                        {/* 3. Origen → Destino */}
                        <td
                          className="py-4 px-4 max-w-[230px] truncate text-slate-600"
                          title={routeFull}
                        >
                          {item.origen || item.destino ? (
                            <span className="truncate">
                              <span className="text-slate-600">{item.origen || "S/D"}</span>
                              <span className="mx-1.5 text-slate-300">→</span>
                              <span className="font-medium text-slate-800">
                                {item.destino || "S/D"}
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* 4. Entrega (formato corto en 1 línea, completo en tooltip) */}
                        <td
                          className="py-4 px-3 whitespace-nowrap"
                          title={deliveryFullTooltip}
                        >
                          <span
                            className={`text-xs ${
                              isDelayedActive
                                ? "text-[#CE3A39] font-semibold"
                                : "text-slate-600"
                            }`}
                          >
                            {deliveryShort}
                          </span>
                        </td>

                        {/* 5. Último movimiento (truncado 1 línea) + acciones derechas (Detalle › + hover) */}
                        <td className="py-4 px-4">
                          <div className="flex items-center justify-between gap-4 min-w-0">
                            <span
                              className={`truncate max-w-xs lg:max-w-md ${
                                !lastEvent && item.error
                                  ? "text-[#CE3A39]"
                                  : "text-slate-600"
                              }`}
                              title={movementTooltip}
                            >
                              {movementText}
                            </span>

                            <div className="inline-flex items-center gap-1 shrink-0">
                              <div className="inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleRefreshSingleGuide(item.guia, item.carrier);
                                  }}
                                  disabled={isRefreshing}
                                  aria-label={`Actualizar guía ${item.guia}`}
                                  title={
                                    item.desde_cache
                                      ? "Respuesta desde caché (10m) · Clic para consultar en vivo"
                                      : "Actualizar esta guía ahora"
                                  }
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-[#233762] hover:bg-slate-200/60 transition cursor-pointer disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-[#233762]"
                                >
                                  <RefreshCw
                                    className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                                  />
                                </button>

                                <button
                                  type="button"
                                  onClick={(e) => handleRemoveGuideRow(e, item.guia)}
                                  aria-label={`Quitar guía ${item.guia} de la lista`}
                                  title="Quitar de la lista"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-[#CE3A39] hover:bg-red-50 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-[#233762]"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedGuideKey(item.guia);
                                }}
                                aria-label={`Ver detalle de guía ${item.guia}`}
                                className="inline-flex items-center gap-0.5 pl-2 pr-1 py-1 rounded-lg text-xs font-semibold text-[#233762] hover:bg-[#EFF3F9] transition cursor-pointer focus-visible:outline-2 focus-visible:outline-[#233762]"
                              >
                                <span>Detalle</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Vista Móvil: Lista limpia de tarjetas simples */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredResults.map((item) => {
                const statusCfg =
                  STATUS_UI_CONFIG[item.estatus_general] || STATUS_UI_CONFIG.DESCONOCIDO;
                const isDelayedActive =
                  Boolean(item.retrasado) && item.estatus_general !== "ENTREGADO";
                const deliveryShort =
                  item.estatus_general === "ENTREGADO" && item.fecha_entrega_real
                    ? `Entregado ${formatShortTrackingDate(item.fecha_entrega_real)}`
                    : item.fecha_estimada_entrega
                    ? `Estimada ${formatShortTrackingDate(item.fecha_estimada_entrega)}`
                    : "";

                return (
                  <div
                    key={`mob-${item.guia}`}
                    onClick={() => setSelectedGuideKey(item.guia)}
                    className="p-4 hover:bg-slate-50/80 transition cursor-pointer space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono text-xs font-bold text-[#233762] truncate">
                          {item.guia}
                        </span>
                        {hasMultipleCarriers && (
                          <span className="text-[10px] font-mono text-slate-400 shrink-0">
                            {item.carrier === "FEDEX" ? "FDX" : "EST"}
                          </span>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 shrink-0">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isDelayedActive ? "bg-[#CE3A39]" : statusCfg.dotClass
                          }`}
                        />
                        <span>{statusCfg.label}</span>
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                      <span className="truncate">
                        {item.destino || item.origen || "Sin destino reportado"}
                        {deliveryShort ? ` · ${deliveryShort}` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedGuideKey(item.guia);
                        }}
                        className="inline-flex items-center gap-0.5 text-xs font-semibold text-[#233762] shrink-0"
                      >
                        <span>Detalle</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
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
                <div className="flex items-center justify-between bg-[#EFF3F9] border border-[#233762]/20 rounded-xl px-3 py-2 text-xs text-[#233762]">
                  <div className="flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-[#233762] shrink-0" />
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
      {/* ==================================================================== */}
      {/* MODAL DE VISTA PREVIA DEL PDF ESTANDARIZADO (IGUAL A TRACKING)       */}
      {/* ==================================================================== */}
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
                    Vista Previa &bull; {getStandardRastreoFileName("pdf")}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {filteredResults.length} guía(s) en el reporte &bull; Formato institucional SupplyChain México
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportExcel}
                  disabled={isExportingExcel}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-[#233762]/30 bg-[#EFF3F9] hover:bg-slate-200/80 text-[#233762] text-xs font-bold transition cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[#233762]" />
                  <span>Descargar Excel (.xlsx)</span>
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
                  src={pdfBlobUrl}
                  title="Vista previa del PDF de Rastreo"
                  className="w-full h-full rounded-xl border border-slate-300 shadow-inner bg-white"
                />
              ) : (
                <p className="text-xs text-slate-500 font-semibold">Cargando documento PDF...</p>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
