import * as XLSX from "xlsx";
import { DevolucionRecord, ReportesFilters, ReportesKPIs } from "./types";
import { sanitizeExcelFormula } from "./normalize";

export function generateReportesExcelBuffer(
  records: DevolucionRecord[],
  kpis: ReportesKPIs,
  filters: ReportesFilters
): Buffer {
  const wb = XLSX.utils.book_new();

  // 1. Hoja "Devoluciones"
  const devolucionesData = records.map((r, index) => ({
    "No.": index + 1,
    "No. Devolución": sanitizeExcelFormula(r.noDevolucion),
    "Serial Number": sanitizeExcelFormula(r.serialNumber),
    "Serial Duplicado": r.serialDuplicado ? "SÍ (DUPLICADO)" : "NO",
    "Modelo": sanitizeExcelFormula(r.modelo),
    "Descripción Original": sanitizeExcelFormula(r.descripcionRaw),
    "Tracking Retorno": sanitizeExcelFormula(r.trackingNumber),
    "Ticket RITM": sanitizeExcelFormula(r.ritm),
    "RITM Válido": r.ritmValido ? "VÁLIDO" : "INVÁLIDO / NO FORMATO",
    "Estatus Devolución": r.estatus,
    "Substate (Raw)": sanitizeExcelFormula(r.substateRaw),
    "Fecha Ingreso": r.fechaIngresoSistema || r.fechaIngresoSistemaRaw,
    "Entry at SNOW": r.entryAtSnow || r.entryAtSnowRaw,
    "Entry into Stock": r.entryIntoStock || r.entryIntoStockRaw,
    "Conciliado SNOW": r.conciliadoSnow ? "CONCILIADO" : "PENDIENTE",
    "Comentarios": sanitizeExcelFormula(r.comentarios),
    "Advertencias Calidad": r.calidadAdvertencias.join(" | "),
  }));

  const wsDevoluciones = XLSX.utils.json_to_sheet(devolucionesData);

  // Anchos de columna automáticos
  wsDevoluciones["!cols"] = [
    { wch: 6 },  // No.
    { wch: 16 }, // No. Devolución
    { wch: 18 }, // Serial Number
    { wch: 16 }, // Serial Duplicado
    { wch: 28 }, // Modelo
    { wch: 32 }, // Descripción Original
    { wch: 24 }, // Tracking Retorno
    { wch: 18 }, // Ticket RITM
    { wch: 22 }, // RITM Válido
    { wch: 20 }, // Estatus Devolución
    { wch: 22 }, // Substate (Raw)
    { wch: 15 }, // Fecha Ingreso
    { wch: 15 }, // Entry at SNOW
    { wch: 15 }, // Entry into Stock
    { wch: 16 }, // Conciliado SNOW
    { wch: 35 }, // Comentarios
    { wch: 35 }, // Advertencias
  ];

  XLSX.utils.book_append_sheet(wb, wsDevoluciones, "Devoluciones");

  // 2. Hoja "Resumen" (KPIs + Filtros)
  const resumenRows = [
    { "Sección": "MÉTRICA KPI", "Detalle": "VALOR CONJUNTO FILTRADO" },
    { "Sección": "Total Equipos Devueltos", "Detalle": kpis.totalDevueltos },
    { "Sección": "En evaluación técnica", "Detalle": kpis.enEvaluacion },
    { "Sección": "Pendientes de baja / Scrap", "Detalle": kpis.pendientesBaja },
    { "Sección": "In Stock / Cerrado", "Detalle": kpis.inStockCerrado },
    { "Sección": "Sin clasificar (Revisión requerida)", "Detalle": kpis.sinClasificar },
    { "Sección": "Conciliados ServiceNow (SNOW)", "Detalle": `${kpis.conciliadosSnowCount} (${kpis.porcentajeConciliadosSnow}%)` },
    { "Sección": "Equipos con Serial Duplicado", "Detalle": kpis.totalSerialesDuplicados },
    { "Sección": "Registros sin RITM o Mal Capturados", "Detalle": kpis.totalSinRitm },
    { "Sección": "Registros sin Guía de Retorno", "Detalle": kpis.totalSinTracking },
    { "Sección": "", "Detalle": "" },
    { "Sección": "FILTRO APLICADO", "Detalle": "VALOR CONFIGURADO" },
    { "Sección": "Búsqueda texto (q)", "Detalle": filters.q || "(ninguno)" },
    { "Sección": "Estatus filtrado", "Detalle": filters.estatus || "TODOS" },
    { "Sección": "Modelo filtrado", "Detalle": filters.modelo || "(todos)" },
    { "Sección": "Rango de fechas", "Detalle": `${filters.desde || "*"} hasta ${filters.hasta || "*"}` },
    { "Sección": "Solo duplicados", "Detalle": filters.soloDuplicados ? "SÍ" : "NO" },
    { "Sección": "Solo sin RITM", "Detalle": filters.soloSinRitm ? "SÍ" : "NO" },
    { "Sección": "Solo sin Tracking", "Detalle": filters.soloSinTracking ? "SÍ" : "NO" },
    { "Sección": "Fecha de Generación", "Detalle": new Date().toLocaleString("es-MX") },
  ];

  const wsResumen = XLSX.utils.json_to_sheet(resumenRows);
  wsResumen["!cols"] = [{ wch: 36 }, { wch: 36 }];
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen y KPIs");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buffer;
}
