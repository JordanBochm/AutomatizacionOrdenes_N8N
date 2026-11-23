export type AssetClientId = "KYNDRYL" | "BASF" | "LULULEMON" | "BURBERRY";

export type ActiveClientFilter = AssetClientId | "ALL";

export type ModuleScope = "global" | "per_client" | "client_specific";

export type AssetModuleId =
  | "operacion_dia"
  | "transporte"
  | "facturacion"
  | "reportes"
  | "calendario"
  | "historial"
  | "sop";

export type OperationToolId = "automatizador" | "generador_tracking" | "historial";

export const ACTIVE_CLIENT_STORAGE_KEY = "sc_active_asset_client";

export interface AssetModuleDefinition {
  id: AssetModuleId;
  name: string;
  scope: ModuleScope;
}

export const MODULES: AssetModuleDefinition[] = [
  { id: "operacion_dia", name: "Operación del día", scope: "client_specific" },
  { id: "transporte", name: "Transporte", scope: "global" },
  { id: "facturacion", name: "Facturación", scope: "per_client" },
  { id: "reportes", name: "Reportes", scope: "per_client" },
  { id: "calendario", name: "Calendario", scope: "global" },
  { id: "historial", name: "Historial de lotes", scope: "global" },
  { id: "sop", name: "Mesa de ayuda (SOP)", scope: "per_client" },
];

export const MODULES_MAP: Record<AssetModuleId, AssetModuleDefinition> = {
  operacion_dia: MODULES[0],
  transporte: MODULES[1],
  facturacion: MODULES[2],
  reportes: MODULES[3],
  calendario: MODULES[4],
  historial: MODULES[5],
  sop: MODULES[6],
};

// Herramientas habilitadas en "Operación del día" por cliente (por confirmar con negocio)
export const OPERATION_TOOLS: Record<AssetClientId, OperationToolId[]> = {
  KYNDRYL: ["automatizador", "generador_tracking", "historial"], // por confirmar con negocio
  BASF: ["generador_tracking"], // por confirmar con negocio
  LULULEMON: [], // por confirmar con negocio
  BURBERRY: [], // por confirmar con negocio
};

export interface AssetClientDefinition {
  id: AssetClientId;
  name: string;
  shortBadge: string;
  segment: string;
  description: string;
  tone: "navy" | "red";
  statusBadge: "Activo" | "En desarrollo";
  enabledModules: string[];
  enabledOperacionSubmodules: string[];
  enabledTransporteSubmodules: string[];
}

const ALL_MODULES = [
  "operacion_dia",
  "transporte",
  "facturacion",
  "reportes",
  "calendario",
  "historial",
  "sop",
];

const ALL_OPERACION_SUBMODULES = [
  "asset_management",
  "generador_tracking",
  "historial",
];

const ALL_TRANSPORTE_SUBMODULES = ["rastreo_envios"];

export const ASSET_CLIENTS: AssetClientDefinition[] = [
  {
    id: "KYNDRYL",
    name: "Kyndryl",
    shortBadge: "KST / Kyndryl",
    segment: "IT & Infraestructura",
    description:
      "Operación del día, despacho y recolección de equipos de cómputo, validación SEPOMEX y timbrado Techship.",
    tone: "navy",
    statusBadge: "Activo",
    enabledModules: ALL_MODULES,
    enabledOperacionSubmodules: ALL_OPERACION_SUBMODULES,
    enabledTransporteSubmodules: ALL_TRANSPORTE_SUBMODULES,
  },
  {
    id: "BASF",
    name: "BASF",
    shortBadge: "BASF México",
    segment: "Química & Corporativo",
    description:
      "Gestión de activos, programación de envíos y retornos, generación de guías, rastreo multi-carrier y reportes.",
    tone: "red",
    statusBadge: "Activo",
    enabledModules: ALL_MODULES,
    enabledOperacionSubmodules: ALL_OPERACION_SUBMODULES,
    enabledTransporteSubmodules: ALL_TRANSPORTE_SUBMODULES,
  },
  {
    id: "LULULEMON",
    name: "Lululemon",
    shortBadge: "Lululemon",
    segment: "Retail & Boutiques",
    description:
      "Operación logística para tiendas y corporativo, control de envíos, retornos de equipos, calendario y trazabilidad.",
    tone: "navy",
    statusBadge: "Activo",
    enabledModules: ALL_MODULES,
    enabledOperacionSubmodules: ALL_OPERACION_SUBMODULES,
    enabledTransporteSubmodules: ALL_TRANSPORTE_SUBMODULES,
  },
  {
    id: "BURBERRY",
    name: "Burberry",
    shortBadge: "Burberry",
    segment: "Luxury Retail",
    description:
      "Administración y logística de activos, seguimiento de guías, programación de entregas, reportes y cierres diarios.",
    tone: "red",
    statusBadge: "Activo",
    enabledModules: ALL_MODULES,
    enabledOperacionSubmodules: ALL_OPERACION_SUBMODULES,
    enabledTransporteSubmodules: ALL_TRANSPORTE_SUBMODULES,
  },
];

export const ASSET_CLIENTS_MAP: Record<AssetClientId, AssetClientDefinition> = {
  KYNDRYL: ASSET_CLIENTS[0],
  BASF: ASSET_CLIENTS[1],
  LULULEMON: ASSET_CLIENTS[2],
  BURBERRY: ASSET_CLIENTS[3],
};

export function isSpecificAssetClient(
  client: ActiveClientFilter
): client is AssetClientId {
  return client !== "ALL" && client in ASSET_CLIENTS_MAP;
}

export function loadActiveClientFromStorage(): ActiveClientFilter {
  if (typeof window === "undefined") return "ALL";
  try {
    // Ignorar y limpiar cualquier valor legado en localStorage
    localStorage.removeItem(ACTIVE_CLIENT_STORAGE_KEY);
    const raw = sessionStorage.getItem(ACTIVE_CLIENT_STORAGE_KEY) as ActiveClientFilter | null;
    if (raw === "ALL") {
      return "ALL";
    }
    if (raw && raw in ASSET_CLIENTS_MAP) {
      return raw;
    }
  } catch { }
  return "ALL";
}

export function saveActiveClientToStorage(clientId: ActiveClientFilter): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ACTIVE_CLIENT_STORAGE_KEY);
    sessionStorage.setItem(ACTIVE_CLIENT_STORAGE_KEY, clientId);
  } catch { }
}
