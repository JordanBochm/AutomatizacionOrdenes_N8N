import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface TrackingRow {
  id: string; // uuid interno
  carrier: string; // default "ESTAFETAREST"
  account?: string; // "KYNDRYL" | "BASF"
  tracking_number: string;
  pick_order: string; // default `KYNDRYL_${ritm}` o `BASF_${britm}`
  customer_order: string; // el RITM/BRITM, ej. RITM0542434 o BRITM4083391
  boxes: number; // default 1
  manual: boolean; // true si se agregó a mano
}

export interface TrackingHeaderInfo {
  title: string; // default: "GUÍAS PARA LAS ÓRDENES DEL DÍA"
  date: string; // YYYY-MM-DD
  clients: string; // default: "KYNDRYL & BASF"
}

// Colores Oficiales SupplyChain México
const COLOR_NAVY: [number, number, number] = [35, 55, 98]; // #233762
const COLOR_RED: [number, number, number] = [206, 58, 57]; // #CE3A39
const COLOR_SUMMARY_FILL: [number, number, number] = [217, 226, 243]; // #D9E2F3 (azul claro de totales como en el ejemplo)
const COLOR_SLATE_DARK: [number, number, number] = [15, 23, 42]; // #0F172A
const COLOR_SLATE_MUTED: [number, number, number] = [100, 116, 139]; // #64748B
const COLOR_BLACK: [number, number, number] = [0, 0, 0];

/**
 * Separa o resuelve el Carrier principal (ej. "ESTAFETAREST") y la Cuenta/Cliente (ej. "KYNDRYL" o "BASF")
 */
export function resolveCarrierAndAccount(row: TrackingRow): {
  carrierName: string;
  accountName: string;
} {
  const rawCarrier = (row.carrier || "ESTAFETAREST").trim();
  const explicitAccount = (row.account || "").trim();

  if (explicitAccount) {
    const parts = rawCarrier.split(/\s+/);
    const baseCarrier = parts[0] || "ESTAFETAREST";
    return { carrierName: baseCarrier, accountName: explicitAccount };
  }

  const parts = rawCarrier.split(/\s+/);
  if (parts.length >= 2) {
    return {
      carrierName: parts[0],
      accountName: parts.slice(1).join(" "),
    };
  }

  // Inferir cuenta por prefijo de orden (BRITM -> BASF, RITM -> KYNDRYL)
  const coUpper = (row.customer_order || "").trim().toUpperCase();
  const poUpper = (row.pick_order || "").trim().toUpperCase();
  if (coUpper.startsWith("BRITM") || poUpper.startsWith("BASF")) {
    return { carrierName: rawCarrier || "ESTAFETAREST", accountName: "BASF" };
  }

  return { carrierName: rawCarrier || "ESTAFETAREST", accountName: "KYNDRYL" };
}

/**
 * Normaliza el nombre del carrier para el cuadro de resumen superior (ej. "ESTAFETAREST" -> "ESTAFETA")
 */
export function normalizeCarrierSummaryKey(carrier: string): string {
  const firstToken = (carrier || "ESTAFETA").trim().split(/[\s_-]+/)[0].toUpperCase();
  if (firstToken.startsWith("ESTAFETA")) return "ESTAFETA";
  return firstToken || "ESTAFETA";
}

/**
 * Formatea una fecha YYYY-MM-DD en texto largo oficial (ej. "Miércoles, 28 de octubre de 2026")
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
 * Genera el nombre del archivo PDF de descarga según fecha (ej. TRACKING_28_Octubre.pdf)
 */
export function getTrackingPdfFileName(dateStr: string): string {
  const MESES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  try {
    if (!dateStr) {
      const now = new Date();
      return `TRACKING_${String(now.getDate()).padStart(2, "0")}_${MESES[now.getMonth()]}.pdf`;
    }
    const [_, m, d] = dateStr.split("-").map(Number);
    const dia = String(d).padStart(2, "0");
    const mes = MESES[(m || 1) - 1] || "Mes";
    return `TRACKING_${dia}_${mes}.pdf`;
  } catch {
    return `TRACKING_${dateStr || "Ordenes"}.pdf`;
  }
}

/**
 * Formatea fecha y hora local para el pie de página
 */
function formatDateTimeStamp(date: Date): string {
  return date.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Construye el documento jsPDF replicando el formato exacto de TRACKING_28_Octubre.pdf
 * con el logotipo y colores oficiales de SupplyChain México (#233762 y #CE3A39).
 */
export function buildTrackingPdf(
  rows: TrackingRow[],
  header: TrackingHeaderInfo,
  logoDataUrl?: string | null,
  userName: string = "Usuario Seko"
): jsPDF {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "letter",
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 279.4 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 215.9 mm

  // Geometría exacta de las 7 columnas (suma = 263.4 mm, márgenes izq/der = 8 mm)
  const marginLeft = 8;
  const colWidths = [9.4, 38, 25, 46, 46, 57, 42];
  const tableWidth = colWidths.reduce((acc, w) => acc + w, 0); // 263.4 mm
  const colX: number[] = [marginLeft];
  for (let i = 0; i < colWidths.length; i++) {
    colX.push(colX[i] + colWidths[i]);
  }
  const centerX = marginLeft + tableWidth / 2;

  // -------------------------------------------------------------
  // 1. LOGOTIPO OFICIAL SUPPLYCHAIN MÉXICO (ESQUINA SUPERIOR IZQ)
  // -------------------------------------------------------------
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

  // -------------------------------------------------------------
  // 2. FRANJA AZUL MARINO DE TÍTULO (ESTILO TRACKING_28_Octubre)
  // -------------------------------------------------------------
  const bannerY = 19.5;
  const bannerH = 8.2;
  doc.setFillColor(...COLOR_NAVY);
  doc.rect(marginLeft, bannerY, tableWidth, bannerH, "F");

  // Pequeño acento rojo oficial en el borde inferior de la barra de título
  doc.setFillColor(...COLOR_RED);
  doc.rect(marginLeft + tableWidth / 2, bannerY + bannerH - 0.6, tableWidth / 2, 0.6, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13.5);
  doc.setTextColor(255, 255, 255);
  const mainTitle = (header.title || "GUÍAS PARA LAS ÓRDENES DEL DÍA").toUpperCase();
  doc.text(mainTitle, centerX, bannerY + 5.7, { align: "center" });

  // -------------------------------------------------------------
  // 3. FECHA EN CURSIVA Y CLIENTES CENTRADOS
  // -------------------------------------------------------------
  const dateY = bannerY + bannerH + 4.5; // ~32.2 mm
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9.5);
  doc.setTextColor(80, 90, 105);
  const dateFormatted = formatLongDate(header.date);
  doc.text(dateFormatted, centerX, dateY, { align: "center" });

  const clientsY = dateY + 5.5; // ~37.7 mm
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLOR_NAVY);
  const clientsText = (header.clients || "KYNDRYL & BASF").toUpperCase();
  doc.text(clientsText, centerX, clientsY, { align: "center" });

  // Línea divisoria horizontal de extremo a extremo bajo Clientes
  const dividerY = clientsY + 2.2; // ~39.9 mm
  doc.setDrawColor(...COLOR_NAVY);
  doc.setLineWidth(0.45);
  doc.line(marginLeft, dividerY, marginLeft + tableWidth, dividerY);

  // -------------------------------------------------------------
  // 4. BLOQUE DE RESUMEN SUPERIOR ALINEADO A LAS COLUMNAS
  //    - Fila 1: Total Órdenes: [ N ]          # de Cajas: [ M ]
  //    - Fila 2: ESTAFETA:      [ N ]
  // -------------------------------------------------------------
  const carrierCounts: Record<string, number> = {};
  let totalBoxes = 0;

  rows.forEach((r) => {
    const { carrierName } = resolveCarrierAndAccount(r);
    const key = normalizeCarrierSummaryKey(carrierName);
    carrierCounts[key] = (carrierCounts[key] || 0) + 1;
    totalBoxes += Number(r.boxes || 1);
  });

  const carrierEntries = Object.entries(carrierCounts);
  if (carrierEntries.length === 0) {
    carrierEntries.push(["ESTAFETA", 0]);
  }

  const summaryRowH = 6.2;
  let currentSummaryY = dividerY + 0.4;

  // Fila 1 de Resumen: "Total Órdenes:" (Col 0..1) + Caja Valor (Col 2..3) | "# de Cajas:" (Col 5) + Caja Valor (Col 6)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...COLOR_NAVY);
  doc.text("Total Órdenes:", colX[2] - 2, currentSummaryY + 4.3, { align: "right" });

  // Caja de valor Total Órdenes (abarca exactamente Col 2 + Col 3)
  const totalBoxX = colX[2];
  const totalBoxW = colWidths[2] + colWidths[3];
  doc.setFillColor(...COLOR_SUMMARY_FILL);
  doc.setDrawColor(...COLOR_BLACK);
  doc.setLineWidth(0.25);
  doc.rect(totalBoxX, currentSummaryY, totalBoxW, summaryRowH, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLOR_SLATE_DARK);
  doc.text(String(rows.length), totalBoxX + totalBoxW / 2, currentSummaryY + 4.4, { align: "center" });

  // "# de Cajas:" alineado a la derecha de Col 5 y caja en Col 6
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...COLOR_NAVY);
  doc.text("# de Cajas:", colX[6] - 2, currentSummaryY + 4.3, { align: "right" });

  const cajasBoxX = colX[6];
  const cajasBoxW = colWidths[6];
  doc.setFillColor(...COLOR_SUMMARY_FILL);
  doc.setDrawColor(...COLOR_BLACK);
  doc.setLineWidth(0.25);
  doc.rect(cajasBoxX, currentSummaryY, cajasBoxW, summaryRowH, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLOR_SLATE_DARK);
  doc.text(String(totalBoxes), cajasBoxX + cajasBoxW / 2, currentSummaryY + 4.4, { align: "center" });

  currentSummaryY += summaryRowH;

  // Filas por Carrier (ej. "ESTAFETA: 20")
  carrierEntries.forEach(([carrierLabel, count]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...COLOR_SLATE_DARK);
    doc.text(`${carrierLabel}:`, colX[2] - 2, currentSummaryY + 4.3, { align: "right" });

    doc.setFillColor(...COLOR_SUMMARY_FILL);
    doc.setDrawColor(...COLOR_BLACK);
    doc.setLineWidth(0.25);
    doc.rect(totalBoxX, currentSummaryY, totalBoxW, summaryRowH, "FD");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...COLOR_SLATE_DARK);
    doc.text(String(count), totalBoxX + totalBoxW / 2, currentSummaryY + 4.4, { align: "center" });

    currentSummaryY += summaryRowH;
  });

  // -------------------------------------------------------------
  // 5. TABLA PRINCIPAL DE 7 COLUMNAS (ESTILO TRACKING_28_Octubre)
  // -------------------------------------------------------------
  const tableStartY = currentSummaryY + 1.4;

  const tableBody = rows.map((r, idx) => {
    const { carrierName, accountName } = resolveCarrierAndAccount(r);
    const defaultPickPrefix = accountName.toUpperCase() === "BASF" ? "BASF_" : "KYNDRYL_";
    return [
      String(idx + 1),
      carrierName,
      accountName,
      r.tracking_number ? r.tracking_number : "Sin guía",
      r.pick_order || (r.customer_order ? `${defaultPickPrefix}${r.customer_order}` : ""),
      r.customer_order || "",
      String(r.boxes || 1),
    ];
  });

  autoTable(doc, {
    startY: tableStartY,
    margin: { top: 18, bottom: 15, left: marginLeft, right: marginLeft },
    head: [["#", "Carrier", "", "Tracking Number", "Pick Order (RITM)", "CUSTOMER ORDER", "Cajas"]],
    body: tableBody,
    theme: "plain",
    showHead: "everyPage",
    headStyles: {
      fillColor: COLOR_NAVY,
      textColor: [255, 255, 255],
      font: "helvetica",
      fontStyle: "bold",
      fontSize: 9,
      cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
      lineWidth: 0.25,
      lineColor: COLOR_BLACK,
    },
    bodyStyles: {
      fillColor: [255, 255, 255],
      textColor: COLOR_SLATE_DARK,
      font: "helvetica",
      fontSize: 8.5,
      halign: "center",
      valign: "middle",
      cellPadding: { top: 2.35, bottom: 2.35, left: 1.5, right: 1.5 },
      lineWidth: 0, // Los bordes se controlan por columna igual que en el PDF de referencia
      lineColor: COLOR_BLACK,
    },
    columnStyles: {
      0: { cellWidth: colWidths[0], halign: "center", lineWidth: 0.25 },
      1: { cellWidth: colWidths[1], halign: "center", lineWidth: 0.25 },
      2: { cellWidth: colWidths[2], halign: "center", lineWidth: 0.25 },
      3: { cellWidth: colWidths[3], halign: "center", lineWidth: 0 },
      4: { cellWidth: colWidths[4], halign: "center", lineWidth: 0 },
      5: { cellWidth: colWidths[5], halign: "center", lineWidth: 0 },
      6: { cellWidth: colWidths[6], halign: "center", lineWidth: 0.25 },
    },
    didParseCell: (data) => {
      if (data.section === "head") {
        if (data.column.index === 3 || data.column.index === 4) {
          data.cell.styles.halign = "left";
        } else {
          data.cell.styles.halign = "center";
        }
      }
      if (data.section === "body" && data.column.index === 3) {
        const val = String(data.cell.raw || "");
        if (!val || val === "Sin guía") {
          data.cell.styles.textColor = [180, 83, 9];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
    didDrawCell: (data) => {
      // Cerrar con línea inferior las columnas centrales (3, 4, 5) en la última fila de la tabla
      if (
        data.section === "body" &&
        (data.column.index === 3 || data.column.index === 4 || data.column.index === 5) &&
        data.row.index === tableBody.length - 1
      ) {
        doc.setDrawColor(...COLOR_BLACK);
        doc.setLineWidth(0.25);
        const yBottom = data.cell.y + data.cell.height;
        doc.line(data.cell.x, yBottom, data.cell.x + data.cell.width, yBottom);
      }
    },
  });

  // -------------------------------------------------------------
  // 6. PIE DE PÁGINA INSTITUCIONAL EN CADA HOJA
  // -------------------------------------------------------------
  const totalPages = doc.getNumberOfPages();
  const nowStamp = formatDateTimeStamp(new Date());

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

    doc.text("SupplyChain México • Operación SEKO Logistics / KST", marginLeft, textY);
    doc.text(`Generado por ${userName} el ${nowStamp}`, centerX, textY, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.text(`Página ${i} de ${totalPages}`, marginLeft + tableWidth, textY, { align: "right" });
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
