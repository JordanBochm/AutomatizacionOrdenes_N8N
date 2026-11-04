import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import {
  CargaRecord,
  DevolucionRecord,
  ReportesFilters,
  ReportesKPIs,
} from "./types";
import {
  applySerialDuplicateDetection,
  normalizeRawRow,
} from "./normalize";
import { getAllCachedWarranties } from "./warranty-service";

const DATA_DIR = path.resolve(process.cwd(), "..", "data", "reportes");
const DB_FILE = path.join(DATA_DIR, "reportes_db.json");
const CARGAS_FILE = path.join(DATA_DIR, "cargas.json");

// Archivo semilla inicial
const DEFAULT_SOURCE_EXCEL = path.resolve(
  process.cwd(),
  "..",
  "Devoluciones KST 040326.xlsx"
);

function ensureDirectoryExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function safeAtomicWrite(filePath: string, data: unknown) {
  ensureDirectoryExists();
  const tmpPath = `${filePath}.tmp_${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
  try {
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "EPERM" || error.code === "EBUSY") {
      fs.copyFileSync(tmpPath, filePath);
      fs.unlinkSync(tmpPath);
    } else {
      throw err;
    }
  }
}

export class ReportesRepository {
  private records: DevolucionRecord[] = [];
  private cargas: CargaRecord[] = [];
  private isLoaded: boolean = false;

  constructor() {
    this.init();
  }

  private init() {
    if (this.isLoaded) return;
    ensureDirectoryExists();

    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, "utf8");
        this.records = JSON.parse(raw);
        if (fs.existsSync(CARGAS_FILE)) {
          this.cargas = JSON.parse(fs.readFileSync(CARGAS_FILE, "utf8"));
        }
        this.isLoaded = true;
        return;
      } catch (err) {
        console.error("Error leyendo reportes_db.json, reintentando carga semilla:", err);
      }
    }

    // Auto-semilla inicial si existe el archivo fuente
    this.seedFromDefaultExcel();
    this.isLoaded = true;
  }

  public seedFromDefaultExcel(): boolean {
    if (!fs.existsSync(DEFAULT_SOURCE_EXCEL)) {
      console.warn("Archivo inicial no encontrado:", DEFAULT_SOURCE_EXCEL);
      return false;
    }

    try {
      const buffer = fs.readFileSync(DEFAULT_SOURCE_EXCEL);
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames.includes("Hoja1") ? "Hoja1" : workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return false;

      const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const cargaId = "CARGA_INICIAL_KST_040326";

      const normalizedWithoutDups = rawRows.map((row, idx) =>
        normalizeRawRow(row, cargaId, idx + 1)
      );
      const normalized = applySerialDuplicateDetection(normalizedWithoutDups);

      this.records = normalized;

      const advertenciasCalidad = {
        serialesVacios: normalized.filter((r) => !r.serialNumber).length,
        serialesDuplicados: normalized.filter((r) => r.serialDuplicado).length,
        ritmInvalidos: normalized.filter((r) => !r.ritmValido).length,
        sinTracking: normalized.filter((r) => r.sinTracking).length,
        sinClasificar: normalized.filter((r) => r.estatus === "Sin clasificar").length,
      };

      const cargaRecord: CargaRecord = {
        id: cargaId,
        archivo: "Devoluciones KST 040326.xlsx",
        fecha: new Date().toISOString(),
        usuario: "Sistema (Auto-seed)",
        filasLeidas: rawRows.length,
        filasInsertadas: normalized.length,
        filasActualizadas: 0,
        filasRechazadas: 0,
        advertenciasCalidad,
      };

      this.cargas = [cargaRecord];
      safeAtomicWrite(DB_FILE, this.records);
      safeAtomicWrite(CARGAS_FILE, this.cargas);
      return true;
    } catch (err) {
      console.error("Error al sembrar archivo Excel:", err);
      return false;
    }
  }

  public getAll(): DevolucionRecord[] {
    this.init();
    return this.records;
  }

  public list(filters: ReportesFilters = {}): {
    items: DevolucionRecord[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  } {
    this.init();
    const warrantiesCache = getAllCachedWarranties();
    let result = this.records.map((r) => {
      const cleanSerial = r.serialNumber ? r.serialNumber.toUpperCase() : "";
      return {
        ...r,
        garantia: cleanSerial && warrantiesCache[cleanSerial] ? warrantiesCache[cleanSerial] : r.garantia,
      };
    });

    // 1. Búsqueda universal (q)
    if (filters.q && filters.q.trim()) {
      const q = filters.q.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      result = result.filter(
        (r) =>
          r.serialNumber.toLowerCase().includes(q) ||
          r.ritm.toLowerCase().includes(q) ||
          r.trackingNumber.toLowerCase().includes(q) ||
          r.noDevolucion.toLowerCase().includes(q) ||
          r.modelo.toLowerCase().includes(q) ||
          r.comentariosNorm.includes(q)
      );
    }

    // 2. Filtro de estatus
    if (filters.estatus && filters.estatus !== "TODOS") {
      result = result.filter((r) => r.estatus === filters.estatus);
    }

    // 3. Filtro de modelo
    if (filters.modelo && filters.modelo.trim()) {
      const mod = filters.modelo.trim().toLowerCase();
      result = result.filter((r) => r.modelo.toLowerCase().includes(mod));
    }

    // 4. Rango de fechas (fechaIngresoSistema)
    if (filters.desde) {
      result = result.filter((r) => r.fechaIngresoSistema && r.fechaIngresoSistema >= filters.desde!);
    }
    if (filters.hasta) {
      result = result.filter((r) => r.fechaIngresoSistema && r.fechaIngresoSistema <= filters.hasta!);
    }

    // 5. Filtros booleanos
    if (filters.soloDuplicados) {
      result = result.filter((r) => r.serialDuplicado);
    }
    if (filters.soloSinRitm) {
      result = result.filter((r) => !r.ritmValido || !r.ritm);
    }
    if (filters.soloSinTracking) {
      result = result.filter((r) => r.sinTracking);
    }
    if (filters.soloConGarantia) {
      result = result.filter((r) => r.garantia && r.garantia.vigente);
    }
    if (filters.soloGarantiaExpirada) {
      result = result.filter((r) => r.garantia && r.garantia.estado === "EXPIRADA");
    }

    // 6. Ordenamiento
    const sortField = filters.sort || "fechaIngresoSistema";
    const sortOrder = filters.order || "desc";

    result.sort((a, b) => {
      if (sortField === "garantia") {
        const valA = a.garantia?.vigente ? 1 : 0;
        const valB = b.garantia?.vigente ? 1 : 0;
        return sortOrder === "asc" ? valA - valB : valB - valA;
      }
      const valA = String(a[sortField as keyof DevolucionRecord] ?? "").toLowerCase();
      const valB = String(b[sortField as keyof DevolucionRecord] ?? "").toLowerCase();

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    const total = result.length;
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.max(1, filters.pageSize || 25);
    const totalPages = Math.ceil(total / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const paginatedItems = result.slice(startIndex, startIndex + pageSize);

    return {
      items: paginatedItems,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  public getKpis(filters: ReportesFilters = {}): ReportesKPIs {
    this.init();
    // Los KPIs se calculan sobre el conjunto con los mismos filtros (sin paginación)
    const { items: filteredItems } = this.list({ ...filters, page: 1, pageSize: 999999 });

    const totalDevueltos = filteredItems.length;
    const enEvaluacion = filteredItems.filter((r) => r.estatus === "En evaluación").length;
    const pendientesBaja = filteredItems.filter((r) => r.estatus === "Pendiente de baja").length;
    const inStockCerrado = filteredItems.filter((r) => r.estatus === "In Stock / Cerrado").length;
    const sinClasificar = filteredItems.filter((r) => r.estatus === "Sin clasificar").length;

    const conciliadosSnowCount = filteredItems.filter((r) => r.conciliadoSnow).length;
    const porcentajeConciliadosSnow =
      totalDevueltos > 0 ? Number(((conciliadosSnowCount / totalDevueltos) * 100).toFixed(1)) : 0;

    const totalSerialesDuplicados = filteredItems.filter((r) => r.serialDuplicado).length;
    const totalSinRitm = filteredItems.filter((r) => !r.ritmValido || !r.ritm).length;
    const totalSinTracking = filteredItems.filter((r) => r.sinTracking).length;

    const totalConGarantia = filteredItems.filter((r) => r.garantia && r.garantia.vigente).length;
    const totalGarantiaExpirada = filteredItems.filter((r) => r.garantia && r.garantia.estado === "EXPIRADA").length;
    const totalSinGarantiaInfo = filteredItems.filter(
      (r) => !r.garantia || r.garantia.estado === "DESCONOCIDO" || r.garantia.estado === "ERROR"
    ).length;

    return {
      totalDevueltos,
      enEvaluacion,
      pendientesBaja,
      inStockCerrado,
      sinClasificar,
      conciliadosSnowCount,
      porcentajeConciliadosSnow,
      totalSerialesDuplicados,
      totalSinRitm,
      totalSinTracking,
      totalConGarantia,
      totalGarantiaExpirada,
      totalSinGarantiaInfo,
    };
  }

  public getBySerial(serial: string): DevolucionRecord[] {
    this.init();
    const clean = serial.trim().toUpperCase();
    if (!clean) return [];
    return this.records.filter((r) => r.serialNumber.toUpperCase() === clean);
  }

  public upsertBatch(
    newRecords: DevolucionRecord[],
    carga: CargaRecord
  ): { insertadas: number; actualizadas: number } {
    this.init();
    const map = new Map<string, DevolucionRecord>();

    for (const r of this.records) {
      map.set(r.id, r);
    }

    let insertadas = 0;
    let actualizadas = 0;

    for (const record of newRecords) {
      if (map.has(record.id)) {
        actualizadas++;
      } else {
        insertadas++;
      }
      map.set(record.id, record);
    }

    const merged = Array.from(map.values());
    // Recalcular duplicados globales
    this.records = applySerialDuplicateDetection(merged);
    this.cargas.unshift(carga);

    safeAtomicWrite(DB_FILE, this.records);
    safeAtomicWrite(CARGAS_FILE, this.cargas);

    return { insertadas, actualizadas };
  }

  public getCargas(): CargaRecord[] {
    this.init();
    return this.cargas;
  }
}

let repositoryInstance: ReportesRepository | null = null;

export function getReportesRepository(): ReportesRepository {
  if (!repositoryInstance) {
    repositoryInstance = new ReportesRepository();
  }
  return repositoryInstance;
}
