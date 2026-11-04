import { resolveEstatusDevolucion } from "./status-map";
import { DevolucionRecord } from "./types";

export const DEFAULT_FALLBACK_YEAR = 2026;

export const HARDWARE_ALIAS_MAP: Record<string, string> = {
  "20S1SFJH0Q": "Lenovo ThinkPad T14 Gen 1",
  "20S0": "Lenovo ThinkPad T14 Gen 1",
  "20UD": "Lenovo ThinkPad T14 Gen 1 AMD",
  "20W0": "Lenovo ThinkPad T14 Gen 2",
  "21AH": "Lenovo ThinkPad T14 Gen 3",
  "21CH": "Lenovo ThinkPad T14 Gen 3 AMD",
  "21HD": "Lenovo ThinkPad T14 Gen 4",
  "A2337": "MacBook Air M1 (A2337)",
  "A2338": "MacBook Pro M1 (A2338)",
  "LATITUDE 5420": "Dell Latitude 5420",
  "LATITUDE 5430": "Dell Latitude 5430",
};

const RITM_REGEX = /^RITM\d+(-\d+)?$/i;

const MESES_MAP: Record<string, string> = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
};

/**
 * Sanitiza valores para evitar inyección de fórmulas en Excel.
 * Si el valor empieza por =, +, -, @, se prefija con comilla simple (').
 */
export function sanitizeExcelFormula(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value).trim();
  if (/^[=\+\-@]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Normaliza la descripción del equipo al modelo canónico utilizando el diccionario de alias.
 */
export function normalizeModelo(descRaw: string | undefined | null): string {
  if (!descRaw || !descRaw.trim()) return "Sin descripción";
  const clean = descRaw.trim();
  const upper = clean.toUpperCase();
  for (const [key, val] of Object.entries(HARDWARE_ALIAS_MAP)) {
    if (upper.includes(key.toUpperCase())) return val;
  }
  return clean;
}

/**
 * Valida el formato del ticket RITM (^RITM\d+(-\d+)?$).
 * Preserva el original sin corregirlo en silencio.
 */
export function validateRitm(ritmRaw: string | undefined | null): { ritm: string; valido: boolean } {
  if (!ritmRaw || !String(ritmRaw).trim()) {
    return { ritm: "", valido: false };
  }
  const clean = String(ritmRaw).trim();
  return { ritm: clean, valido: RITM_REGEX.test(clean) };
}

/**
 * Parseador flexible de fechas. Admite:
 * - Número serial Excel (ej. 45228)
 * - ISO (YYYY-MM-DD)
 * - DD/MM/YYYY o DD/MM (ej. 28/10 -> 2026-10-28)
 * - Texto natural en español: "1 de noviembre", "8 de noviembre " -> 2026-11-01 / 2026-11-08
 */
export function parseFlexibleDate(
  raw: string | number | undefined | null,
  fallbackYear = DEFAULT_FALLBACK_YEAR
): { isoDate: string | null; isParsed: boolean } {
  if (raw === null || raw === undefined) return { isoDate: null, isParsed: false };

  // 1. Número serial de Excel
  if (typeof raw === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const target = new Date(excelEpoch.getTime() + raw * 86400000);
    if (!isNaN(target.getTime())) {
      return { isoDate: target.toISOString().slice(0, 10), isParsed: true };
    }
  }

  const str = String(raw).trim();
  if (!str || str.toLowerCase() === "n/a" || str === "-") {
    return { isoDate: null, isParsed: false };
  }

  // 2. ISO o YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return { isoDate: str.slice(0, 10), isParsed: true };
  }

  // 3. DD/MM/YYYY o DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, "0");
    const m = dmyMatch[2].padStart(2, "0");
    let y = dmyMatch[3];
    if (y.length === 2) y = `20${y}`;
    return { isoDate: `${y}-${m}-${d}`, isParsed: true };
  }

  // 4. DD/MM sin año (ej. "28/10")
  const dmMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (dmMatch) {
    const d = dmMatch[1].padStart(2, "0");
    const m = dmMatch[2].padStart(2, "0");
    return { isoDate: `${fallbackYear}-${m}-${d}`, isParsed: true };
  }

  // 5. Formatos en texto: "1 de noviembre", "8 de noviembre "
  const textMatch = str.toLowerCase().match(/^(\d{1,2})\s+de\s+([a-z]+)(?:\s+(?:de\s+)?(\d{4}))?/i);
  if (textMatch) {
    const d = textMatch[1].padStart(2, "0");
    const mesNombre = textMatch[2].toLowerCase();
    const m = MESES_MAP[mesNombre];
    const y = textMatch[3] ? textMatch[3] : String(fallbackYear);
    if (m) {
      return { isoDate: `${y}-${m}-${d}`, isParsed: true };
    }
  }

  return { isoDate: null, isParsed: false };
}

/**
 * Normaliza una fila individual proveniente del archivo Excel.
 * Limpia los encabezados con trim().
 */
export function normalizeRawRow(
  rawRow: Record<string, unknown>,
  cargaId: string,
  rowIndex: number
): Omit<DevolucionRecord, "serialDuplicado"> {
  // Búsqueda insensible a mayúsculas y tolerante a espacios en el encabezado
  const getCol = (key: string): string => {
    const target = key.trim().toLowerCase();
    for (const [k, v] of Object.entries(rawRow)) {
      if (k.trim().toLowerCase() === target) {
        return v !== null && v !== undefined ? String(v).trim() : "";
      }
    }
    return "";
  };

  const noDevRaw = getCol("No. devolución") || getCol("No. devolucion");
  const serialRaw = getCol("Serial Number");
  const descRaw = getCol("Descripción") || getCol("Descripcion");
  const trackRaw = getCol("Tracking #");
  const ritmRaw = getCol("Number");
  const comRaw = getCol("Comentarios");
  const fechaIngresoRaw = getCol("Fecha de ingreso a sistema");
  const substateRaw = getCol("Substate");
  const snowRaw = getCol("Entry at SNOW");
  const stockRaw = getCol("Entry into Stock");

  const warnings: string[] = [];

  const cleanSerial = serialRaw.toUpperCase().replace(/\s+/g, "");
  if (!cleanSerial) warnings.push("Serial Number vacío");

  const cleanTrack = trackRaw.replace(/\s+/g, "").toUpperCase();
  if (!cleanTrack) warnings.push("Tracking vacío");

  const ritmInfo = validateRitm(ritmRaw);
  if (!ritmRaw) {
    warnings.push("Ticket RITM vacío");
  } else if (!ritmInfo.valido) {
    warnings.push(`RITM mal capturado: "${ritmRaw}"`);
  }

  const { estatus, key } = resolveEstatusDevolucion(substateRaw, stockRaw);
  if (estatus === "Sin clasificar") {
    warnings.push(`Substate sin clasificar: "${substateRaw || "(vacío)"}"`);
  }

  const parsedSnow = parseFlexibleDate(snowRaw);
  const parsedStock = parseFlexibleDate(stockRaw);
  const parsedSubstate = parseFlexibleDate(substateRaw);
  const parsedIngreso = parseFlexibleDate(fechaIngresoRaw);

  const cleanNoDev = noDevRaw.replace(/\s+/g, "");

  // Generación de identificador único determinista
  // Si falta alguno de los 3 valores, se añade el índice de fila para evitar colisión en nulos
  const isCompleteKey = Boolean(cleanNoDev && cleanSerial && ritmInfo.ritm);
  const id = isCompleteKey
    ? `${cleanNoDev}_${cleanSerial}_${ritmInfo.ritm}`
    : `${cleanNoDev || "NODEV"}_${cleanSerial || "NOSERIAL"}_${ritmInfo.ritm || "NORITM"}_row${rowIndex}`;

  return {
    id,
    noDevolucion: cleanNoDev,
    noDevolucionRaw: noDevRaw,
    serialNumber: cleanSerial,
    serialNumberRaw: serialRaw,
    descripcion: descRaw,
    descripcionRaw: descRaw,
    modelo: normalizeModelo(descRaw),
    trackingNumber: cleanTrack,
    trackingNumberRaw: trackRaw,
    sinTracking: cleanTrack === "",
    ritm: ritmInfo.ritm,
    ritmRaw,
    ritmValido: ritmInfo.valido,
    comentarios: comRaw,
    comentariosNorm: comRaw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    fechaIngresoSistema: parsedIngreso.isoDate,
    fechaIngresoSistemaRaw: fechaIngresoRaw,
    substate: substateRaw,
    substateRaw,
    estatus,
    estatusKey: key,
    substateFecha: parsedSubstate.isoDate,
    entryAtSnow: parsedSnow.isoDate,
    entryAtSnowRaw: snowRaw,
    entryIntoStock: parsedStock.isoDate,
    entryIntoStockRaw: stockRaw,
    conciliadoSnow: parsedSnow.isoDate !== null || (snowRaw.length > 0 && snowRaw.toUpperCase() !== "N/A"),
    calidadAdvertencias: warnings,
    cargaId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Marca serialDuplicado = true únicamente para seriales no vacíos cuya frecuencia > 1.
 */
export function applySerialDuplicateDetection(
  records: Omit<DevolucionRecord, "serialDuplicado">[]
): DevolucionRecord[] {
  const serialCounts = new Map<string, number>();

  for (const r of records) {
    const s = r.serialNumber.trim();
    if (s) {
      serialCounts.set(s, (serialCounts.get(s) || 0) + 1);
    }
  }

  return records.map((r) => {
    const s = r.serialNumber.trim();
    const isDup = Boolean(s && (serialCounts.get(s) || 0) > 1);
    return {
      ...r,
      serialDuplicado: isDup,
    };
  });
}
