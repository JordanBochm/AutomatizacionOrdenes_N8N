import type { TrackingRow, Client } from "./trackingPdf";

export type EditableField =
  | "carrier"
  | "client"
  | "tracking_number"
  | "pick_order"
  | "customer_order"
  | "boxes";

export const EDITABLE_COLUMNS: EditableField[] = [
  "carrier",
  "client",
  "tracking_number",
  "pick_order",
  "customer_order",
  "boxes",
];

export const COLUMN_LABELS: Record<EditableField, string> = {
  carrier: "Carrier",
  client: "Client",
  tracking_number: "Tracking Number",
  pick_order: "Pick Order (RITM)",
  customer_order: "CUSTOMER ORDER",
  boxes: "Cajas",
};

/**
 * Diccionario de alias de encabezados para mapeo automático al pegar desde Excel
 */
const HEADER_ALIASES: Record<EditableField, string[]> = {
  carrier: ["carrier", "paquetería", "paqueteria"],
  client: ["client", "cliente", "cuenta", "account"],
  tracking_number: [
    "tracking",
    "tracking number",
    "guía",
    "guia",
    "no. guía",
    "no. guia",
    "no guia",
    "no guía",
    "numero de guia",
    "número de guía",
  ],
  pick_order: [
    "pick order",
    "pick order (ritm)",
    "pick",
    "ritm pick",
    "pick_order",
  ],
  customer_order: [
    "customer order",
    "custumer order",
    "orden cliente",
    "ritm",
    "customer_order",
  ],
  boxes: ["cajas", "boxes", "bultos"],
};

const IGNORED_HEADER_ALIASES = new Set(["#", "no", "no.", "num", "núm", "num.", "id"]);

/**
 * Genera un UUID compatible con entorno navegador y Node
 */
export function generateRowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `trk-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Elimina cualquier prefijo KYNDRYL_ o BASF_ para que en la tabla editable solo se vea el valor limpio
 */
export function stripClientPickPrefix(rawPickOrder: string): string {
  return (rawPickOrder || "").trim().replace(/^(KYNDRYL_|BASF_)+/i, "");
}

/**
 * Formatea el Pick Order para el PDF agregando KYNDRYL_ o BASF_ según el cliente escrito por el usuario
 */
export function formatPickOrderWithClientPrefix(
  clientValue: string,
  rawPickOrder: string,
  customerOrder: string = ""
): string {
  const cleanPick = stripClientPickPrefix(rawPickOrder) || stripClientPickPrefix(customerOrder);
  const normClient = normalizeClientValue(clientValue).toUpperCase();

  if (normClient === "KYNDRYL") {
    return cleanPick ? `KYNDRYL_${cleanPick}` : "";
  }
  if (normClient === "BASF") {
    return cleanPick ? `BASF_${cleanPick}` : "";
  }
  return cleanPick;
}

/**
 * Crea una fila vacía lista para captura al final de la hoja (sin pre-seleccionar cliente ni mostrar prefijo en tabla)
 */
export function createEmptyTrackingRow(defaultClient: Client | string = ""): TrackingRow {
  const clientNorm = defaultClient ? normalizeClientValue(String(defaultClient)) : "";
  return {
    id: generateRowId(),
    carrier: "ESTAFETAREST",
    client: clientNorm,
    account: clientNorm,
    tracking_number: "",
    pick_order: "",
    customer_order: "",
    boxes: 1,
    manual: true,
  };
}

/**
 * Determina si una fila está vacía (sin datos reales capturados de tracking/pick/customer/client)
 */
export function isRowEmptyData(row: TrackingRow): boolean {
  const hasTrk = Boolean((row.tracking_number || "").trim());
  const hasCo = Boolean((row.customer_order || "").trim());
  const hasPick = Boolean(stripClientPickPrefix(row.pick_order));
  const hasCli = Boolean((row.client || row.account || "").trim());
  return !hasTrk && !hasCo && !hasPick && !hasCli;
}

/**
 * Garantiza que siempre exista exactamente una fila vacía al final de la tabla (como hoja de cálculo)
 */
export function ensureTrailingEmptyRow(
  rows: TrackingRow[],
  defaultClient: Client | string = ""
): TrackingRow[] {
  if (rows.length === 0) {
    return [createEmptyTrackingRow(defaultClient)];
  }
  const lastRow = rows[rows.length - 1];
  if (!isRowEmptyData(lastRow)) {
    return [...rows, createEmptyTrackingRow("")];
  }
  return rows;
}

/**
 * Parser real de TSV desde Excel:
 * - Soporta celdas entre comillas con saltos de línea (\n, \r\n) o tabuladores (\t) internos
 * - Soporta comillas dobles escapadas ("") dentro de celdas entrecomilladas
 * - Normaliza \r\n y elimina la fila vacía final que Excel siempre agrega al copiar
 */
export function parseTsv(rawText: string): string[][] {
  if (!rawText) return [];

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;
  let i = 0;
  const len = rawText.length;

  while (i < len) {
    const ch = rawText[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < len && rawText[i + 1] === '"') {
          currentCell += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        if (ch === "\r" && i + 1 < len && rawText[i + 1] === "\n") {
          currentCell += "\n";
          i += 2;
          continue;
        }
        currentCell += ch;
        i++;
        continue;
      }
    } else {
      if (ch === '"' && currentCell.length === 0) {
        inQuotes = true;
        i++;
        continue;
      }

      if (ch === "\t") {
        currentRow.push(currentCell);
        currentCell = "";
        i++;
        continue;
      }

      if (ch === "\r" && i + 1 < len && rawText[i + 1] === "\n") {
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = "";
        i += 2;
        continue;
      }

      if (ch === "\n" || ch === "\r") {
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = "";
        i++;
        continue;
      }

      currentCell += ch;
      i++;
    }
  }

  // Agregar última celda/fila
  currentRow.push(currentCell);
  rows.push(currentRow);

  // Eliminar la fila vacía final que Excel siempre agrega después del último salto de línea
  if (
    rows.length > 1 &&
    rows[rows.length - 1].length === 1 &&
    rows[rows.length - 1][0] === ""
  ) {
    rows.pop();
  } else if (rows.length === 1 && rows[0].length === 1 && rows[0][0] === "") {
    return [];
  }

  return rows;
}

/**
 * Serializa una matriz 2D de valores a formato TSV (compatible con pegado directo en Excel)
 */
export function serializeToTsv(matrix: (string | number)[][]): string {
  return matrix
    .map((row) =>
      row
        .map((cell) => {
          const str = cell === null || cell === undefined ? "" : String(cell);
          if (str.includes("\t") || str.includes("\n") || str.includes("\r") || str.includes('"')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join("\t")
    )
    .join("\r\n");
}

/**
 * Limpia espacios no separables (\u00A0), saltos internos, comillas sobrantes y colapsa espacios múltiples
 */
export function cleanBaseString(raw: string): string {
  if (!raw) return "";
  let s = String(raw)
    .replace(/\u00A0/g, " ")
    .replace(/[\r\n]+/g, " ")
    .trim();

  // Quitar comillas envolventes sobrantes si las hubiera
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    s = s.slice(1, -1).trim();
  }

  return s.replace(/\s{2,}/g, " ");
}

/**
 * Detecta si un valor de tracking fue convertido a notación científica por Excel (ej. "8.79E+11" o "8,79E+11")
 */
export function isScientificNotation(value: string): boolean {
  const clean = (value || "").trim();
  if (!clean) return false;
  return /^[+-]?\d+(?:[.,]\d+)?[eE][+-]?\d+$/.test(clean);
}

/**
 * Normaliza el campo Client según reglas de negocio:
 * - Si contiene "BASF" (en cualquier combinación de mayúsculas/minúsculas) -> "BASF"
 * - Si contiene "KYNDRYL", "KYNDRY", "KYN" o "KST" -> "KYNDRYL"
 * - Si no, deja el texto limpio tal cual
 */
export function normalizeClientValue(raw: string): string {
  const cleaned = cleanBaseString(raw);
  if (!cleaned) return "";
  const upper = cleaned.toUpperCase();
  if (upper.includes("BASF")) return "BASF";
  if (upper.includes("KYNDRYL") || upper.includes("KYNDRY") || upper === "KYN" || upper.includes("KST")) {
    return "KYNDRYL";
  }
  return cleaned;
}

/**
 * Verifica si el cliente es desconocido (distinto de BASF y KYNDRYL)
 */
export function isUnknownClient(clientValue: string): boolean {
  const cleaned = (clientValue || "").trim().toUpperCase();
  if (!cleaned) return true;
  return cleaned !== "BASF" && cleaned !== "KYNDRYL";
}

/**
 * Normaliza cualquier campo editable de acuerdo a su columna
 */
export function normalizeFieldValue(
  field: EditableField,
  rawValue: string | number
): string | number {
  if (field === "boxes") {
    const cleaned = cleanBaseString(String(rawValue));
    const parsed = parseInt(cleaned, 10);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
  }

  const str = cleanBaseString(String(rawValue ?? ""));

  switch (field) {
    case "carrier":
      return str.toUpperCase();

    case "client":
      return normalizeClientValue(str);

    case "tracking_number":
      // Conserva espacios simples internos (ej. "8793 8866 3139") y solo colapsa espacios dobles
      return str;

    case "pick_order": {
      // En la tabla editable no se muestra el prefijo KYNDRYL_ ni BASF_ (se agrega en el PDF/Vista Previa)
      const withoutPrefix = stripClientPickPrefix(str);
      return /ritm/i.test(withoutPrefix) ? withoutPrefix.toUpperCase() : withoutPrefix;
    }

    case "customer_order":
      return /ritm/i.test(str) ? str.toUpperCase() : str;

    default:
      return str;
  }
}

/**
 * Normaliza un encabezado para compararlo con el diccionario de alias
 */
function normalizeHeaderKey(headerCell: string): string {
  return cleanBaseString(headerCell)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Identifica a qué campo EditableField corresponde un texto de encabezado,
 * o "IGNORE" si es una columna como "#", o undefined si no se reconoce.
 */
export function matchHeaderAlias(
  headerText: string
): EditableField | "IGNORE" | undefined {
  const norm = normalizeHeaderKey(headerText);
  if (!norm) return undefined;

  if (IGNORED_HEADER_ALIASES.has(norm)) {
    return "IGNORE";
  }

  for (const field of EDITABLE_COLUMNS) {
    const aliases = HEADER_ALIASES[field];
    for (const alias of aliases) {
      const normAlias = normalizeHeaderKey(alias);
      if (norm === normAlias) {
        return field;
      }
    }
  }

  // Coincidencia parcial por palabra clave contenida
  if (norm.includes("tracking") || norm.includes("guia")) return "tracking_number";
  if (norm.includes("pick")) return "pick_order";
  if (norm.includes("customer") || norm.includes("custumer") || norm.includes("orden cliente")) {
    return "customer_order";
  }
  if (norm.includes("carrier") || norm.includes("paqueteria")) return "carrier";
  if (norm.includes("client") || norm.includes("cliente")) return "client";
  if (norm.includes("caja") || norm.includes("boxes") || norm.includes("bulto")) return "boxes";

  return undefined;
}

export interface HeaderDetectionResult {
  isHeaderRow: boolean;
  allRecognized: boolean;
  /** Mapea índice de columna del TSV -> EditableField o null si debe ignorarse (ej. "#") */
  columnMap: Record<number, EditableField | null> | null;
}

/**
 * Detecta si la primera fila pegada es de encabezados y, si TODOS los encabezados son reconocidos,
 * devuelve un mapa de columnas por nombre (incluso si vienen en otro orden o incluyen "#").
 */
export function detectAndMapHeaders(firstRow: string[]): HeaderDetectionResult {
  if (!firstRow || firstRow.length === 0) {
    return { isHeaderRow: false, allRecognized: false, columnMap: null };
  }

  const matches: (EditableField | "IGNORE" | undefined)[] = firstRow.map((cell) =>
    matchHeaderAlias(cell)
  );

  const nonEmptyCount = firstRow.filter((c) => cleanBaseString(c).length > 0).length;
  if (nonEmptyCount === 0) {
    return { isHeaderRow: false, allRecognized: false, columnMap: null };
  }

  const recognizedCount = matches.filter((m) => m !== undefined).length;
  const recognizedFieldCount = matches.filter(
    (m) => m !== undefined && m !== "IGNORE"
  ).length;

  // Es fila de encabezado si al menos 1 campo editable coincide y (hay >= 2 coincidencias o es 1 sola columna)
  const isHeaderRow =
    recognizedFieldCount >= 1 && (recognizedCount >= 2 || nonEmptyCount === 1);

  const allRecognized =
    isHeaderRow &&
    firstRow.every((cell, idx) => {
      if (cleanBaseString(cell).length === 0) return true;
      return matches[idx] !== undefined;
    });

  if (!isHeaderRow) {
    return { isHeaderRow: false, allRecognized: false, columnMap: null };
  }

  if (allRecognized) {
    const columnMap: Record<number, EditableField | null> = {};
    firstRow.forEach((_, idx) => {
      const m = matches[idx];
      columnMap[idx] = m && m !== "IGNORE" ? m : null;
    });
    return { isHeaderRow: true, allRecognized: true, columnMap };
  }

  return { isHeaderRow: true, allRecognized: false, columnMap: null };
}

/**
 * Aplica autocompletado por cliente e inferencia sin sobrescribir valores ya capturados por el usuario:
 * - Mantiene pick_order en la tabla SIN el prefijo KYNDRYL_ / BASF_ (el prefijo se inyecta en la Vista Previa / PDF)
 * - Si customer_order tiene un RITM y pick_order está vacío, autocompleta el valor limpio en pick_order
 */
export function applyRowSmartDefaults(
  row: TrackingRow,
  changedField?: EditableField,
  isCustomMode: boolean = false
): TrackingRow {
  const cleanClient = normalizeClientValue(row.client || row.account || "");
  const cleanPick = stripClientPickPrefix(row.pick_order);
  const coClean = (row.customer_order || "").trim();

  const next: TrackingRow = {
    ...row,
    client: cleanClient,
    account: cleanClient,
    pick_order: cleanPick,
    boxes: isCustomMode ? Math.max(1, Number(row.boxes) || 1) : Math.max(1, Number(row.boxes) || 1),
  };

  if (!changedField || changedField === "customer_order") {
    if (!next.pick_order && coClean) {
      if (/^RITM/i.test(coClean)) {
        if (!next.client) {
          next.client = "KYNDRYL";
          next.account = "KYNDRYL";
        }
        next.pick_order = coClean.toUpperCase();
      } else if (/^BRITM/i.test(coClean)) {
        if (!next.client) {
          next.client = "BASF";
          next.account = "BASF";
        }
        next.pick_order = coClean.toUpperCase();
      }
    }
  }

  next.account = next.client;
  return next;
}

/**
 * Incrementa el número final de una cadena para el arrastre del Fill Handle (ej. "RITM0532001" + 1 -> "RITM0532002").
 * Si no termina en número (o es un tracking largo de 12+ dígitos), repite el valor original.
 */
export function incrementFillValue(
  baseValue: string | number,
  stepOffset: number,
  field?: EditableField
): string | number {
  if (stepOffset === 0) return baseValue;
  if (typeof baseValue === "number" || field === "boxes") {
    return baseValue;
  }

  const str = String(baseValue ?? "");
  // No auto-incrementar carrier ni client
  if (field === "carrier" || field === "client") {
    return str;
  }

  const match = str.match(/^(.*?)(\d{1,9})$/);
  if (!match) {
    return str;
  }

  const prefix = match[1];
  const digits = match[2];
  // Si toda la cadena son solo dígitos o espacios (como un tracking), repetir salvo que tenga prefijo alfanumérico (como RITM)
  if (!prefix.trim() && digits.length >= 8) {
    return str;
  }

  const num = parseInt(digits, 10);
  if (!Number.isFinite(num)) return str;

  const nextNum = Math.max(0, num + stepOffset);
  const padded = String(nextNum).padStart(digits.length, "0");
  return `${prefix}${padded}`;
}

export interface ApplyPasteResult {
  nextRows: TrackingRow[];
  pastedRowCount: number;
  ignoredExtraCols: boolean;
  selectionRange: {
    start: { row: number; col: number };
    end: { row: number; col: number };
  };
}

/**
 * Aplica una matriz TSV parseada sobre las filas de la tabla a partir de la celda o rango activo
 */
export function applyPastedMatrixToRows(params: {
  rows: TrackingRow[];
  matrix: string[][];
  startRow: number;
  startCol: number;
  selection?: {
    start: { row: number; col: number };
    end: { row: number; col: number };
  } | null;
  defaultClient?: Client | string;
}): ApplyPasteResult {
  const {
    rows,
    matrix,
    startRow,
    startCol,
    selection,
    defaultClient = "BASF",
  } = params;

  if (!matrix || matrix.length === 0) {
    return {
      nextRows: rows,
      pastedRowCount: 0,
      ignoredExtraCols: false,
      selectionRange: {
        start: { row: startRow, col: startCol },
        end: { row: startRow, col: startCol },
      },
    };
  }

  // Determinar esquina superior izquierda si hay rango seleccionado
  const minSelRow = selection
    ? Math.min(selection.start.row, selection.end.row)
    : startRow;
  const maxSelRow = selection
    ? Math.max(selection.start.row, selection.end.row)
    : startRow;
  const minSelCol = selection
    ? Math.min(selection.start.col, selection.end.col)
    : startCol;
  const maxSelCol = selection
    ? Math.max(selection.start.col, selection.end.col)
    : startCol;

  // Caso especial: se pega 1 sola celda sobre un rango seleccionado (> 1 celda) -> rellenar todo el rango
  if (
    matrix.length === 1 &&
    matrix[0].length === 1 &&
    selection &&
    (minSelRow !== maxSelRow || minSelCol !== maxSelCol)
  ) {
    const singleRaw = matrix[0][0];
    const cloned = rows.map((r) => ({ ...r }));
    while (cloned.length <= maxSelRow) {
      cloned.push(createEmptyTrackingRow(defaultClient));
    }

    for (let rIdx = minSelRow; rIdx <= maxSelRow; rIdx++) {
      let rowObj = { ...cloned[rIdx] };
      for (let cIdx = minSelCol; cIdx <= maxSelCol; cIdx++) {
        const field = EDITABLE_COLUMNS[cIdx];
        if (!field) continue;
        const normVal = normalizeFieldValue(field, singleRaw);
        (rowObj as any)[field] = normVal;
        rowObj = applyRowSmartDefaults(rowObj, field);
      }
      cloned[rIdx] = rowObj;
    }

    return {
      nextRows: ensureTrailingEmptyRow(cloned, defaultClient),
      pastedRowCount: maxSelRow - minSelRow + 1,
      ignoredExtraCols: false,
      selectionRange: {
        start: { row: minSelRow, col: minSelCol },
        end: { row: maxSelRow, col: maxSelCol },
      },
    };
  }

  // Detectar si la primera fila es de encabezados
  const headerInfo = detectAndMapHeaders(matrix[0]);
  const dataRows = headerInfo.isHeaderRow ? matrix.slice(1) : matrix;

  if (dataRows.length === 0) {
    return {
      nextRows: rows,
      pastedRowCount: 0,
      ignoredExtraCols: false,
      selectionRange: {
        start: { row: minSelRow, col: minSelCol },
        end: { row: minSelRow, col: minSelCol },
      },
    };
  }

  const targetStartRow = minSelRow;
  const targetStartCol = headerInfo.columnMap ? 0 : minSelCol;

  const cloned = rows.map((r) => ({ ...r }));
  const requiredTotalRows = targetStartRow + dataRows.length;
  while (cloned.length < requiredTotalRows) {
    cloned.push(createEmptyTrackingRow(defaultClient));
  }

  let ignoredExtraCols = false;
  let minTouchedCol = EDITABLE_COLUMNS.length - 1;
  let maxTouchedCol = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const srcCells = dataRows[i];
    const targetRowIdx = targetStartRow + i;
    let rowObj: TrackingRow = {
      ...cloned[targetRowIdx],
      manual: cloned[targetRowIdx]?.manual ?? true,
    };

    if (headerInfo.columnMap) {
      // Mapeo por nombre de columna
      for (let srcColIdx = 0; srcColIdx < srcCells.length; srcColIdx++) {
        const mappedField = headerInfo.columnMap[srcColIdx];
        if (!mappedField) continue;
        const colPosition = EDITABLE_COLUMNS.indexOf(mappedField);
        if (colPosition !== -1) {
          minTouchedCol = Math.min(minTouchedCol, colPosition);
          maxTouchedCol = Math.max(maxTouchedCol, colPosition);
        }
        const normVal = normalizeFieldValue(mappedField, srcCells[srcColIdx]);
        (rowObj as any)[mappedField] = normVal;
      }
      rowObj = applyRowSmartDefaults(rowObj);
    } else {
      // Mapeo posicional desde targetStartCol
      for (let srcColIdx = 0; srcColIdx < srcCells.length; srcColIdx++) {
        const destColIdx = targetStartCol + srcColIdx;
        if (destColIdx >= EDITABLE_COLUMNS.length) {
          ignoredExtraCols = true;
          continue;
        }
        const field = EDITABLE_COLUMNS[destColIdx];
        minTouchedCol = Math.min(minTouchedCol, destColIdx);
        maxTouchedCol = Math.max(maxTouchedCol, destColIdx);
        const normVal = normalizeFieldValue(field, srcCells[srcColIdx]);
        (rowObj as any)[field] = normVal;
        rowObj = applyRowSmartDefaults(rowObj, field);
      }
    }

    cloned[targetRowIdx] = rowObj;
  }

  if (minTouchedCol > maxTouchedCol) {
    minTouchedCol = targetStartCol;
    maxTouchedCol = targetStartCol;
  }

  const finalRows = ensureTrailingEmptyRow(cloned, defaultClient);

  return {
    nextRows: finalRows,
    pastedRowCount: dataRows.length,
    ignoredExtraCols,
    selectionRange: {
      start: { row: targetStartRow, col: minTouchedCol },
      end: { row: targetStartRow + dataRows.length - 1, col: maxTouchedCol },
    },
  };
}
