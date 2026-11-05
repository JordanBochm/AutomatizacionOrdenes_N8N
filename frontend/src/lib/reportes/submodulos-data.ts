import {
  ReparacionRecord,
  ReparacionKPIs,
  OutboundRecord,
  OutboundKPIs,
  RefurbRecord,
  RefurbKPIs,
} from "./types";

export const MOCK_REPARACION_RECORDS: ReparacionRecord[] = [];

export const MOCK_OUTBOUND_RECORDS: OutboundRecord[] = [];

export const MOCK_REFURB_RECORDS: RefurbRecord[] = [];

export function getReparacionKPIs(records = MOCK_REPARACION_RECORDS): ReparacionKPIs {
  return {
    totalEnTaller: records.length,
    enDiagnostico: records.filter((r) => r.estatusReparacion === "DIAGNOSTICO").length,
    esperaPartes: records.filter((r) => r.estatusReparacion === "ESPERA_PARTES").length,
    enGarantiaFabricante: records.filter((r) =>
      ["GARANTIA_LENOVO", "GARANTIA_DELL"].includes(r.estatusReparacion)
    ).length,
    listosQC: records.filter((r) => r.estatusReparacion === "LISTO_QC").length,
    scrap: records.filter((r) => r.estatusReparacion === "SCRAP").length,
  };
}

export function getOutboundKPIs(records = MOCK_OUTBOUND_RECORDS): OutboundKPIs {
  return {
    totalOutbound: records.length,
    preparando: records.filter((r) => ["PREPARANDO", "LISTO_RECOLECCION"].includes(r.estatusOutbound)).length,
    enTransito: records.filter((r) => ["EN_TRANSITO", "EN_REPARTO"].includes(r.estatusOutbound)).length,
    entregados: records.filter((r) => r.estatusOutbound === "ENTREGADO").length,
    incidencias: records.filter((r) => r.estatusOutbound === "INCIDENCIA").length,
  };
}

export function getRefurbKPIs(records = MOCK_REFURB_RECORDS): RefurbKPIs {
  return {
    totalEnRefurb: records.length,
    enBorrado: records.filter((r) => r.estatusRefurb === "BORRADO_DISCO").length,
    enCargaImagen: records.filter((r) => r.estatusRefurb === "CARGA_IMAGEN").length,
    enAuditoria: records.filter((r) => r.estatusRefurb === "AUDITORIA_QC").length,
    listosStock: records.filter((r) => r.estatusRefurb === "LISTO_STOCK").length,
    gradoA_Count: records.filter((r) => r.gradoCosmetico === "GRADO_A").length,
    gradoB_Count: records.filter((r) => r.gradoCosmetico === "GRADO_B").length,
  };
}
