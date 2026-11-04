import { EstatusDevolucion, ReporteStatusKey, StatusBadgeConfig } from "./types";

export const STATUS_CONFIG: Record<EstatusDevolucion, StatusBadgeConfig> = {
  "En evaluación": {
    key: "EVALUACION",
    label: "En evaluación",
    badgeBg: "bg-amber-50",
    badgeText: "text-amber-800",
    badgeBorder: "border-amber-300",
    dotColor: "bg-amber-500",
  },
  "Pendiente de baja": {
    key: "BAJA",
    label: "Pendiente de baja",
    badgeBg: "bg-red-50",
    badgeText: "text-[#CE3A39]",
    badgeBorder: "border-red-200",
    dotColor: "bg-[#CE3A39]",
  },
  "In Stock / Cerrado": {
    key: "IN_STOCK",
    label: "In Stock / Cerrado",
    badgeBg: "bg-emerald-50",
    badgeText: "text-emerald-800",
    badgeBorder: "border-emerald-300",
    dotColor: "bg-emerald-600",
  },
  "Sin clasificar": {
    key: "SIN_CLASIFICAR",
    label: "Sin clasificar",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-600",
    badgeBorder: "border-slate-300",
    dotColor: "bg-slate-400",
  },
};

const INVALID_STOCK_VALUES = new Set(["", "N/A", "NA", "NO", "PENDIENTE", "SIN ENTRADA", "-"]);

/**
 * Resuelve el estatus de la devolución según las reglas de negocio estrictas:
 * 1. pending evaluation / pedning evaluation -> "En evaluación" (ámbar)
 * 2. pending disposal / pedning disposal -> "Pendiente de baja" (rojo)
 * 3. available, o Entry into Stock con valor -> "In Stock / Cerrado" (verde)
 * 4. Substate con fecha, vacío u otro valor -> "Sin clasificar" (gris).
 */
export function resolveEstatusDevolucion(
  substateRaw: string | undefined | null,
  entryIntoStockRaw: string | undefined | null
): { estatus: EstatusDevolucion; key: ReporteStatusKey } {
  const sub = String(substateRaw || "").trim().toLowerCase();
  const stock = String(entryIntoStockRaw || "").trim().toUpperCase();

  // 1. En evaluación
  if (sub === "pending evaluation" || sub === "pedning evaluation") {
    return { estatus: "En evaluación", key: "EVALUACION" };
  }

  // 2. Pendiente de baja
  if (sub === "pending disposal" || sub === "pedning disposal") {
    return { estatus: "Pendiente de baja", key: "BAJA" };
  }

  // 3. In Stock / Cerrado (available o Entry into Stock con valor válido)
  const hasValidStock = stock.length > 0 && !INVALID_STOCK_VALUES.has(stock);
  if (sub === "available" || hasValidStock) {
    return { estatus: "In Stock / Cerrado", key: "IN_STOCK" };
  }

  // 4. Sin clasificar (fechas en Substate, vacío u otro valor)
  return { estatus: "Sin clasificar", key: "SIN_CLASIFICAR" };
}
