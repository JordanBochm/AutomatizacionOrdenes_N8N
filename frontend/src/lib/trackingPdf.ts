import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface TrackingRow {
  id: string; // uuid interno
  carrier: string; // default "ESTAFETAREST KYNDRYL"
  tracking_number: string;
  pick_order: string; // default `KYNDRYL_${ritm}`
  customer_order: string; // el RITM, ej. RITM0525572
  boxes: number; // default 1
  manual: boolean; // true si se agregó a mano
}

export interface TrackingHeaderInfo {
  title: string; // default: "GUÍAS PARA LAS ÓRDENES DEL DÍA"
  date: string; // YYYY-MM-DD
  clients: string; // default: "KYNDRYL & BASF"
}

// Colores institucionales SupplyChain México
const COLOR_NAVY: [number, number, number] = [35, 55, 98]; // #233762
const COLOR_RED: [number, number, number] = [206, 58, 57]; // #CE3A39
const COLOR_SLATE_DARK: [number, number, number] = [30, 41, 59]; // #1E293B
const COLOR_SLATE_MUTED: [number, number, number] = [100, 116, 139]; // #64748B
const COLOR_ZEBRA: [number, number, number] = [248, 250, 252]; // #F8FAFC
const COLOR_BORDER: [number, number, number] = [203, 213, 225]; // #CBD5E1

/**
 * Formatea una fecha YYYY-MM-DD en texto largo oficial (ej. "Jueves, 15 de octubre de 2026")
 */
export function formatLongDate(dateStr: string): string {
  try {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d, 12, 0, 0);
    const formatted = dateObj.toLocaleDateString("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  } catch {
    return dateStr;
  }
}

/**
 * Genera el nombre del archivo PDF de descarga según fecha (ej. TRACKING_15_OCTUBRE.pdf)
 */
export function getTrackingPdfFileName(dateStr: string): string {
  const MESES = [
    "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
    "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
  ];
  try {
    if (!dateStr) {
      const now = new Date();
      return `TRACKING_${String(now.getDate()).padStart(2, "0")}_${MESES[now.getMonth()]}.pdf`;
    }
    const [_, m, d] = dateStr.split("-").map(Number);
    const dia = String(d).padStart(2, "0");
    const mes = MESES[(m || 1) - 1] || "MES";
    return `TRACKING_${dia}_${mes}.pdf`;
  } catch {
    return `TRACKING_${dateStr || "ORDENES"}.pdf`;
  }
}

/**
 * Formatea fecha y hora local para la auditoría en el pie de página
 */
function formatDateTimeStamp(date: Date): string {
  return date.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Construye el documento jsPDF con formato idéntico al reporte de órdenes oficial
 */
export function buildTrackingPdf(
  rows: TrackingRow[],
  header: TrackingHeaderInfo,
  logoDataUrl?: string | null,
  userName: string = "Usuario Seko"
): jsPDF {
  // Hoja carta (Letter) en orientación horizontal (Landscape)
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "letter",
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 279.4 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 215.9 mm
  const centerX = pageWidth / 2;

  // -------------------------------------------------------------
  // 1. ENCABEZADO INSTITUCIONAL
  // -------------------------------------------------------------
  // Logotipo en esquina superior izquierda
  let logoPlaced = false;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", 14, 8, 48, 14);
      logoPlaced = true;
    } catch {
      logoPlaced = false;
    }
  }

  // Fallback si no hay logoDataUrl o falló
  if (!logoPlaced) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...COLOR_NAVY);
    doc.text("Supply", 14, 17);
    doc.setTextColor(...COLOR_RED);
    doc.text("Chain", 31, 17);
    doc.setFontSize(10);
    doc.setTextColor(...COLOR_SLATE_MUTED);
    doc.text("México", 46, 17);
  }

  // Título centrado (negrita, azul #233762)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14.5);
  doc.setTextColor(...COLOR_NAVY);
  const mainTitle = header.title || "GUÍAS PARA LAS ÓRDENES DEL DÍA";
  doc.text(mainTitle, centerX, 14, { align: "center" });

  // Fecha larga debajo del título
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  const dateFormatted = formatLongDate(header.date);
  doc.text(dateFormatted, centerX, 19, { align: "center" });

  // Clientes
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  const clientsText = header.clients || "KYNDRYL & BASF";
  doc.text(clientsText, centerX, 23.5, { align: "center" });

  // -------------------------------------------------------------
  // 2. TABLA AUTOTABLE (COLUMNAS OFICIALES)
  // -------------------------------------------------------------
  const tableData = rows.map((r, idx) => [
    idx + 1,
    r.carrier || "ESTAFETAREST KYNDRYL",
    r.tracking_number ? r.tracking_number : "Sin guía",
    r.pick_order || `KYNDRYL_${r.customer_order}`,
    r.customer_order,
    r.boxes || 1,
  ]);

  autoTable(doc, {
    startY: 27,
    margin: { top: 27, bottom: 20, left: 14, right: 14 },
    head: [["#", "Carrier", "Tracking Number", "Pick Order (RITM)", "CUSTOMER ORDER", "Cajas"]],
    body: tableData,
    theme: "plain",
    showHead: "everyPage",
    headStyles: {
      fillColor: COLOR_NAVY,
      textColor: [255, 255, 255],
      font: "helvetica",
      fontStyle: "bold",
      fontSize: 8.5,
      halign: "left",
      cellPadding: 2.2,
      lineWidth: 0.1,
      lineColor: COLOR_NAVY,
    },
    bodyStyles: {
      textColor: COLOR_SLATE_DARK,
      font: "helvetica",
      fontSize: 8,
      cellPadding: 2,
      lineWidth: 0.1,
      lineColor: COLOR_BORDER,
    },
    alternateRowStyles: {
      fillColor: COLOR_ZEBRA,
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 12, fontStyle: "bold" },
      1: { cellWidth: 46 },
      2: { font: "courier", fontStyle: "bold", cellWidth: 64 },
      3: { cellWidth: 54 },
      4: { fontStyle: "bold", cellWidth: 57 },
      5: { halign: "center", fontStyle: "bold", cellWidth: 18 },
    },
    didParseCell: (data) => {
      // Cabecera centrada en columnas # y Cajas
      if (data.section === "head" && (data.column.index === 0 || data.column.index === 5)) {
        data.cell.styles.halign = "center";
      }
      // Resaltar en ámbar si la celda de tracking no tiene guía
      if (data.section === "body" && data.column.index === 2) {
        const val = String(data.cell.raw || "");
        if (!val || val === "Sin guía") {
          data.cell.styles.textColor = [180, 83, 9]; // Amber-700
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  // -------------------------------------------------------------
  // 3. RESUMEN DE TOTALES Y CARRIERS
  // -------------------------------------------------------------
  const lastTableY = (doc as any).lastAutoTable?.finalY || 40;
  let summaryY = lastTableY + 5;

  // Si no cabe el resumen antes del pie, agregar página
  if (summaryY + 22 > pageHeight - 16) {
    doc.addPage();
    summaryY = 16;
  }

  // Agrupación por carrier (primer token, ej. "ESTAFETA: 15")
  const carrierCounts: Record<string, number> = {};
  let totalBoxes = 0;
  rows.forEach((r) => {
    const rawCarrier = (r.carrier || "ESTAFETA").trim();
    const token = rawCarrier.split(/[\s_-]+/)[0].toUpperCase() || "CARRIER";
    carrierCounts[token] = (carrierCounts[token] || 0) + 1;
    totalBoxes += Number(r.boxes || 1);
  });

  const carrierSummaryText = Object.entries(carrierCounts)
    .map(([carrierName, count]) => `${carrierName}: ${count}`)
    .join("   •   ");

  // Caja de desglose por carrier a la izquierda
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLOR_NAVY);
  doc.text("Desglose por Carrier:", 14, summaryY + 4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLOR_SLATE_DARK);
  doc.text(carrierSummaryText || "ESTAFETA: 0", 52, summaryY + 4);

  // Cuadro de Totales a la derecha
  const boxWidth = 74;
  const boxHeight = 12;
  const boxX = pageWidth - 14 - boxWidth;
  const boxY = summaryY - 1;

  doc.setFillColor(...COLOR_ZEBRA);
  doc.setDrawColor(...COLOR_BORDER);
  doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLOR_NAVY);
  doc.text(`Total Órdenes: ${rows.length}`, boxX + 6, boxY + 7.5);

  doc.setTextColor(...COLOR_RED);
  doc.text(`# de Cajas: ${totalBoxes}`, boxX + 42, boxY + 7.5);

  // -------------------------------------------------------------
  // 4. PIE DE PÁGINA EN CADA HOJA (LÍNEA BICOLOR + AUDITORÍA)
  // -------------------------------------------------------------
  const totalPages = doc.getNumberOfPages();
  const nowStamp = formatDateTimeStamp(new Date());

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Franja Bicolor Institucional (mitad #233762, mitad #CE3A39)
    const ribbonY = pageHeight - 11;
    doc.setFillColor(...COLOR_NAVY);
    doc.rect(0, ribbonY, pageWidth / 2, 0.8, "F");

    doc.setFillColor(...COLOR_RED);
    doc.rect(pageWidth / 2, ribbonY, pageWidth / 2, 0.8, "F");

    // Texto de auditoría y paginación
    const textY = pageHeight - 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_SLATE_MUTED);

    // Izquierda
    doc.text("SupplyChain México • Operación SEKO Logistics / KST", 14, textY);

    // Centro
    doc.text(`Generado por ${userName} el ${nowStamp}`, centerX, textY, { align: "center" });

    // Derecha
    doc.setFont("helvetica", "bold");
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - 14, textY, { align: "right" });
  }

  return doc;
}

/**
 * Descarga directamente el archivo PDF generado en el navegador
 */
export function downloadTrackingPdf(
  rows: TrackingRow[],
  header: TrackingHeaderInfo,
  logoDataUrl?: string | null,
  userName: string = "Usuario Seko"
): void {
  const doc = buildTrackingPdf(rows, header, logoDataUrl, userName);
  const fileName = getTrackingPdfFileName(header.date);
  doc.save(fileName);
}
