export type EstatusDevolucion =
  | "En evaluación"
  | "Pendiente de baja"
  | "In Stock / Cerrado"
  | "Sin clasificar";

export type ReporteStatusKey = "EVALUACION" | "BAJA" | "IN_STOCK" | "SIN_CLASIFICAR";

export type GarantiaEstado =
  | "VIGENTE"
  | "EXPIRADA"
  | "POR_VENCER"
  | "DESCONOCIDO"
  | "CONSULTANDO"
  | "ERROR";

export interface GarantiaInfo {
  vigente: boolean;
  estado: GarantiaEstado;
  fechaFin: string | null;
  fechaInicio?: string | null;
  diasRestantes?: number;
  tipoServicio?: string;
  proveedor: "LENOVO" | "DELL" | "APPLE" | "OTRO";
  productoNombre?: string;
  consultadoEn: string;
  error?: string;
}

export interface StatusBadgeConfig {
  key: ReporteStatusKey;
  label: EstatusDevolucion;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  dotColor: string;
}

export interface DevolucionRecord {
  id: string; // noDevolucion + serial + ritm o fingerprint
  noDevolucion: string;
  noDevolucionRaw: string;
  serialNumber: string;
  serialNumberRaw: string;
  serialDuplicado: boolean;
  descripcion: string;
  descripcionRaw: string;
  modelo: string;
  trackingNumber: string;
  trackingNumberRaw: string;
  sinTracking: boolean;
  ritm: string;
  ritmRaw: string;
  ritmValido: boolean;
  comentarios: string;
  comentariosNorm: string;
  fechaIngresoSistema: string | null;
  fechaIngresoSistemaRaw: string;
  substate: string;
  substateRaw: string;
  estatus: EstatusDevolucion;
  estatusKey: ReporteStatusKey;
  substateFecha: string | null;
  entryAtSnow: string | null;
  entryAtSnowRaw: string;
  entryIntoStock: string | null;
  entryIntoStockRaw: string;
  conciliadoSnow: boolean;
  calidadAdvertencias: string[];
  garantia?: GarantiaInfo;
  cargaId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportesKPIs {
  totalDevueltos: number;
  enEvaluacion: number;
  pendientesBaja: number;
  inStockCerrado: number;
  sinClasificar: number;
  conciliadosSnowCount: number;
  porcentajeConciliadosSnow: number; // (con Entry at SNOW / total) * 100
  totalSerialesDuplicados: number;
  totalSinRitm: number;
  totalSinTracking: number;
  totalConGarantia?: number;
  totalGarantiaExpirada?: number;
  totalSinGarantiaInfo?: number;
}

export interface ReportesFilters {
  page?: number;
  pageSize?: number;
  sort?: "fechaIngresoSistema" | "noDevolucion" | "serialNumber" | "modelo" | "estatus" | "ritm" | "garantia";
  order?: "asc" | "desc";
  q?: string;
  estatus?: EstatusDevolucion | "TODOS";
  modelo?: string;
  desde?: string;
  hasta?: string;
  soloDuplicados?: boolean;
  soloSinRitm?: boolean;
  soloSinTracking?: boolean;
  soloConGarantia?: boolean;
  soloGarantiaExpirada?: boolean;
}

export interface CargaRecord {
  id: string;
  archivo: string;
  fecha: string;
  usuario: string;
  filasLeidas: number;
  filasInsertadas: number;
  filasActualizadas: number;
  filasRechazadas: number;
  advertenciasCalidad: {
    serialesVacios: number;
    serialesDuplicados: number;
    ritmInvalidos: number;
    sinTracking: number;
    sinClasificar: number;
  };
}

export interface UploadPreviewResult {
  archivo: string;
  totalFilasLeidas: number;
  filasNuevas: number;
  filasActualizadas: number;
  filasRechazadas: number;
  advertencias: {
    fila: number;
    serial: string;
    campo: string;
    motivo: string;
  }[];
  resumenEstatus: Record<EstatusDevolucion, number>;
  muestras: DevolucionRecord[];
}


export type ReportesSubmodulo = "devoluciones" | "reparacion" | "outbound" | "refurb";

// ==========================================
// TIPOS SUBMÓDULO: EQUIPOS EN REPARACIÓN
// ==========================================
export type EstatusReparacion =
  | "DIAGNOSTICO"
  | "ESPERA_PARTES"
  | "EN_REPARACION"
  | "GARANTIA_LENOVO"
  | "GARANTIA_DELL"
  | "LISTO_QC"
  | "SCRAP";

export interface ReparacionRecord {
  id: string;
  serialNumber: string;
  modelo: string;
  ticketInc: string;
  fallaReportada: string;
  tecnicoAsignado: string;
  fechaIngreso: string;
  estatusReparacion: EstatusReparacion;
  garantiaAplica: boolean;
  proveedorGarantia: "LENOVO" | "DELL" | "APPLE" | "INTERNO";
  piezasRequeridas?: string;
  costoEstimado?: number;
  comentarios: string;
}

export interface ReparacionKPIs {
  totalEnTaller: number;
  enDiagnostico: number;
  esperaPartes: number;
  enGarantiaFabricante: number;
  listosQC: number;
  scrap: number;
}

// ==========================================
// TIPOS SUBMÓDULO: OUTBOUND (SALIDAS Y ENVÍOS)
// ==========================================
export type EstatusOutbound =
  | "PREPARANDO"
  | "LISTO_RECOLECCION"
  | "EN_TRANSITO"
  | "EN_REPARTO"
  | "ENTREGADO"
  | "INCIDENCIA";

export interface OutboundRecord {
  id: string;
  ordenId: string;
  serialNumber: string;
  modelo: string;
  destinatario: string;
  departamento: string;
  ciudadDestino: string;
  estadoDestino: string;
  carrier: "FEDEX" | "ESTAFETA" | "DHL" | "99MINUTOS";
  trackingNumber: string;
  fechaDespacho: string;
  fechaEstimadaEntrega: string;
  estatusOutbound: EstatusOutbound;
  notas: string;
}

export interface OutboundKPIs {
  totalOutbound: number;
  preparando: number;
  enTransito: number;
  entregados: number;
  incidencias: number;
}

// ==========================================
// TIPOS SUBMÓDULO: REFURB (REACONDICIONAMIENTO)
// ==========================================
export type GradoCosmetico = "GRADO_A" | "GRADO_B" | "GRADO_C" | "SCRAP";
export type EstatusRefurb =
  | "RECEPCION"
  | "BORRADO_DISCO"
  | "CARGA_IMAGEN"
  | "AUDITORIA_QC"
  | "LISTO_STOCK";

export interface RefurbRecord {
  id: string;
  serialNumber: string;
  modelo: string;
  gradoCosmetico: GradoCosmetico;
  borradoDisco: "NIST_800_88_COMPLETO" | "CERTIFICADO_BLANCCO" | "PENDIENTE" | "FALLIDO";
  imagenSO: "WINDOWS_11_PRO_KYNDRYL" | "MACOS_SONOMA_SEKO" | "PENDIENTE";
  saludBateria: number;
  limpiezaDetallada: boolean;
  pruebasHardware: "APROBADO_100" | "EN_PRUEBAS" | "FALLA_DETECTADA";
  fechaIngreso: string;
  fechaLiberacion?: string;
  estatusRefurb: EstatusRefurb;
  tecnico: string;
}

export interface RefurbKPIs {
  totalEnRefurb: number;
  enBorrado: number;
  enCargaImagen: number;
  enAuditoria: number;
  listosStock: number;
  gradoA_Count: number;
  gradoB_Count: number;
}
