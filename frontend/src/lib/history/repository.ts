export type HistorySource = "tracking" | "closing" | "batch" | "archive";
export type HistoryStatus = "ok" | "partial" | "error";
export type Carrier = "FEDEX" | "ESTAFETA" | "DESCONOCIDO";

export interface HistoryMetrics {
  total_orders: number;
  confirmed: number;
  review: number;
  error_blocked: number;
  ready?: number;
  duplicates?: number;
}

export interface HistoryTrackingEntry {
  guia: string;
  carrier: Carrier;
  estatus: string;
  eventos?: number;
  consultado_en: string;
}

export interface HistoryClosingEntry {
  cierre_file?: string;
  etiquetas_file?: string;
  total_orders: number;
  assigned: number;
  errors: number;
  cp_alerts: number;
}

export interface HistoryDay {
  id: string;
  date: string;
  updated_at: string;
  batch_filename?: string;
  user_email?: string;
  metrics: HistoryMetrics;
  trackings: HistoryTrackingEntry[];
  closing?: HistoryClosingEntry;
  sources: HistorySource[];
  status: HistoryStatus;
}

export interface HistoryUpsertMeta {
  id?: string;
  date?: string;
  batch_filename?: string;
  user_email?: string;
  metrics?: Partial<HistoryMetrics>;
}

export interface HistoryRepository {
  list(): Promise<HistoryDay[]>;
  get(id: string): Promise<HistoryDay | null>;
  upsertTrackings(entries: HistoryTrackingEntry[], meta?: HistoryUpsertMeta): Promise<HistoryDay>;
  upsertClosing(payload: HistoryClosingEntry, meta?: HistoryUpsertMeta): Promise<HistoryDay>;
  upsertBatch(meta: HistoryUpsertMeta): Promise<HistoryDay>;
  markArchived(id?: string): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  exportJson(): Promise<string>;
  importJson(json: string, mode: "merge" | "replace"): Promise<number>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const HISTORY_STORAGE_KEY = "sc_asset_history_v1";
export const MAX_HISTORY_DAYS = 30;
const FALLBACK_HISTORY_DAYS = 7;

function emptyMetrics(): HistoryMetrics {
  return { total_orders: 0, confirmed: 0, review: 0, error_blocked: 0 };
}

export function localDateId(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeCarrier(value: string | null | undefined): Carrier {
  const raw = String(value || "").trim().toUpperCase();
  if (raw.includes("FEDEX")) return "FEDEX";
  if (raw.includes("ESTAFETA")) return "ESTAFETA";
  return "DESCONOCIDO";
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function addSource(day: HistoryDay, source: HistorySource): void {
  if (!day.sources.includes(source)) {
    day.sources = [...day.sources, source];
  }
}

function mergeMetrics(prev: HistoryMetrics, next?: Partial<HistoryMetrics>): HistoryMetrics {
  if (!next) return prev;
  const merged: HistoryMetrics = { ...prev };
  (Object.keys(next) as Array<keyof HistoryMetrics>).forEach((key) => {
    const value = next[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      merged[key] = value;
    }
  });
  return merged;
}

function mergeTrackings(
  prev: HistoryTrackingEntry[],
  incoming: HistoryTrackingEntry[]
): HistoryTrackingEntry[] {
  const map = new Map<string, HistoryTrackingEntry>();
  for (const entry of prev) {
    map.set(entry.guia, entry);
  }
  for (const entry of incoming) {
    const existing = map.get(entry.guia);
    if (!existing) {
      map.set(entry.guia, entry);
      continue;
    }
    const existingTime = Date.parse(existing.consultado_en) || 0;
    const incomingTime = Date.parse(entry.consultado_en) || 0;
    if (incomingTime >= existingTime) {
      map.set(entry.guia, entry);
    }
  }
  return Array.from(map.values());
}

function recomputeStatus(day: HistoryDay): HistoryStatus {
  if (day.closing && day.closing.errors > 0) return "partial";
  if (day.metrics.error_blocked > 0) return "partial";
  if (
    day.trackings.length > 0 &&
    day.trackings.every((t) => String(t.estatus).toUpperCase().includes("ERROR"))
  ) {
    return "error";
  }
  return "ok";
}

function createEmptyDay(id: string): HistoryDay {
  return {
    id,
    date: id,
    updated_at: new Date().toISOString(),
    metrics: emptyMetrics(),
    trackings: [],
    sources: [],
    status: "ok",
  };
}

function sanitizeDay(raw: unknown): HistoryDay | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const id = typeof source.id === "string" ? source.id : typeof source.date === "string" ? source.date : "";
  if (!id) return null;

  const day = createEmptyDay(id);
  day.date = typeof source.date === "string" ? source.date : id;
  day.updated_at = typeof source.updated_at === "string" ? source.updated_at : new Date().toISOString();
  if (typeof source.batch_filename === "string") day.batch_filename = source.batch_filename;
  if (typeof source.user_email === "string") day.user_email = source.user_email;
  day.metrics = mergeMetrics(emptyMetrics(), source.metrics as Partial<HistoryMetrics>);
  if (Array.isArray(source.sources)) {
    day.sources = source.sources.filter(
      (s): s is HistorySource =>
        s === "tracking" || s === "closing" || s === "batch" || s === "archive"
    );
  }
  if (Array.isArray(source.trackings)) {
    day.trackings = source.trackings
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const item = entry as Record<string, unknown>;
        const guia = typeof item.guia === "string" ? item.guia.trim() : "";
        if (!guia) return null;
        return {
          guia,
          carrier: normalizeCarrier(typeof item.carrier === "string" ? item.carrier : ""),
          estatus: typeof item.estatus === "string" ? item.estatus : "DESCONOCIDO",
          eventos: typeof item.eventos === "number" ? item.eventos : undefined,
          consultado_en:
            typeof item.consultado_en === "string" ? item.consultado_en : new Date().toISOString(),
        } as HistoryTrackingEntry;
      })
      .filter((entry): entry is HistoryTrackingEntry => entry !== null);
  }
  if (source.closing && typeof source.closing === "object") {
    const closing = source.closing as Record<string, unknown>;
    day.closing = {
      cierre_file: typeof closing.cierre_file === "string" ? closing.cierre_file : undefined,
      etiquetas_file: typeof closing.etiquetas_file === "string" ? closing.etiquetas_file : undefined,
      total_orders: Number(closing.total_orders) || 0,
      assigned: Number(closing.assigned) || 0,
      errors: Number(closing.errors) || 0,
      cp_alerts: Number(closing.cp_alerts) || 0,
    };
  }
  day.status = recomputeStatus(day);
  return day;
}

function sortDays(days: HistoryDay[]): HistoryDay[] {
  return [...days].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

function trimDays(days: HistoryDay[], limit: number = MAX_HISTORY_DAYS): HistoryDay[] {
  return sortDays(days).slice(0, limit);
}

function mergeDays(prev: HistoryDay[], incoming: HistoryDay[]) {
  const map = new Map<string, HistoryDay>();
  for (const day of prev) map.set(day.id, clone(day));
  for (const day of incoming) {
    const existing = map.get(day.id);
    if (!existing) {
      map.set(day.id, clone(day));
      continue;
    }
    existing.trackings = mergeTrackings(existing.trackings, day.trackings);
    existing.metrics = mergeMetrics(existing.metrics, day.metrics);
    if (day.closing) existing.closing = { ...day.closing };
    if (day.batch_filename) existing.batch_filename = day.batch_filename;
    if (day.user_email) existing.user_email = day.user_email;
    for (const source of day.sources) addSource(existing, source);
    if ((Date.parse(day.updated_at) || 0) >= (Date.parse(existing.updated_at) || 0)) {
      existing.updated_at = day.updated_at;
    }
    existing.status = recomputeStatus(existing);
  }
  return Array.from(map.values());
}

let memoryValue: string | null = null;

const memoryStorage: StorageLike = {
  getItem: () => memoryValue,
  setItem: (_key: string, value: string) => {
    memoryValue = value;
  },
  removeItem: () => {
    memoryValue = null;
  },
};

function resolveStorage(): StorageLike {
  if (typeof window !== "undefined") {
    try {
      if (window.localStorage) return window.localStorage;
    } catch {
      return memoryStorage;
    }
  }
  return memoryStorage;
}

export function createLocalStorageHistoryRepository(
  storage: StorageLike = resolveStorage()
): HistoryRepository {
  function readDays(): HistoryDay[] {
    let raw: string | null = null;
    try {
      raw = storage.getItem(HISTORY_STORAGE_KEY);
    } catch {
      return [];
    }
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.days) ? parsed.days : [];
      return trimDays(
        list
          .map((item: unknown) => sanitizeDay(item))
          .filter((item: HistoryDay | null): item is HistoryDay => item !== null)
      );
    } catch {
      try {
        storage.removeItem(HISTORY_STORAGE_KEY);
      } catch {
        // Almacenamiento no disponible: se ignora y se reinicia en memoria.
      }
      return [];
    }
  }

  function writeDays(days: HistoryDay[]): void {
    const normalized = trimDays(days);
    const payload = JSON.stringify({ version: 1, days: normalized });
    try {
      storage.setItem(HISTORY_STORAGE_KEY, payload);
    } catch {
      try {
        storage.setItem(
          HISTORY_STORAGE_KEY,
          JSON.stringify({ version: 1, days: normalized.slice(0, FALLBACK_HISTORY_DAYS) })
        );
      } catch {
        // Cuota agotada: se conserva el estado en memoria de la sesión.
      }
    }
  }

  function ensureDay(days: HistoryDay[], id: string, meta?: HistoryUpsertMeta): HistoryDay {
    let day = days.find((item) => item.id === id);
    if (!day) {
      day = createEmptyDay(id);
      days.push(day);
    }
    if (meta?.batch_filename) day.batch_filename = meta.batch_filename;
    if (meta?.user_email) day.user_email = meta.user_email;
    if (meta?.metrics) day.metrics = mergeMetrics(day.metrics, meta.metrics);
    return day;
  }

  return {
    async list() {
      return sortDays(readDays()).map((day) => clone(day));
    },

    async get(id: string) {
      const day = readDays().find((item) => item.id === id);
      return day ? clone(day) : null;
    },

    async upsertTrackings(entries, meta) {
      const days = readDays();
      const id = meta?.date || meta?.id || localDateId();
      const day = ensureDay(days, id, meta);
      const incoming = entries
        .filter((entry) => entry && String(entry.guia).trim())
        .map((entry) => ({
          ...entry,
          guia: String(entry.guia).trim(),
          consultado_en: entry.consultado_en || new Date().toISOString(),
        }));
      day.trackings = mergeTrackings(day.trackings, incoming);
      addSource(day, "tracking");
      day.updated_at = new Date().toISOString();
      day.status = recomputeStatus(day);
      writeDays(days);
      return clone(day);
    },

    async upsertClosing(payload, meta) {
      const days = readDays();
      const id = meta?.date || meta?.id || localDateId();
      const day = ensureDay(days, id, meta);
      day.closing = { ...payload };
      addSource(day, "closing");
      if (payload.total_orders > 0) {
        day.metrics = mergeMetrics(day.metrics, { total_orders: payload.total_orders });
      }
      day.updated_at = new Date().toISOString();
      day.status = recomputeStatus(day);
      writeDays(days);
      return clone(day);
    },

    async upsertBatch(meta) {
      const days = readDays();
      const id = meta.date || meta.id || localDateId();
      const day = ensureDay(days, id, meta);
      addSource(day, "batch");
      day.updated_at = new Date().toISOString();
      day.status = recomputeStatus(day);
      writeDays(days);
      return clone(day);
    },

    async markArchived(id?: string) {
      const days = readDays();
      const targetId = id || localDateId();
      const day = ensureDay(days, targetId, { date: targetId });
      addSource(day, "archive");
      day.updated_at = new Date().toISOString();
      writeDays(days);
    },

    async remove(id: string) {
      const days = readDays().filter((day) => day.id !== id);
      writeDays(days);
    },

    async clear() {
      try {
        storage.removeItem(HISTORY_STORAGE_KEY);
      } catch {
        // Sin almacenamiento persistente: se limpia la copia en memoria.
      }
      memoryValue = null;
    },

    async exportJson() {
      return JSON.stringify(
        { version: 1, exported_at: new Date().toISOString(), days: sortDays(readDays()) },
        null,
        2
      );
    },

    async importJson(json: string, mode: "merge" | "replace") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        return 0;
      }
      const list = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as { days?: unknown }).days)
          ? (parsed as { days: unknown[] }).days
          : [];
      const imported = list
        .map((item) => sanitizeDay(item))
        .filter((item): item is HistoryDay => item !== null);
      if (imported.length === 0) return 0;

      if (mode === "replace") {
        writeDays(imported);
        return imported.length;
      }
      const merged = mergeDays(readDays(), imported);
      writeDays(merged);
      return imported.length;
    },
  };
}

let repositorySingleton: HistoryRepository | null = null;

export function getHistoryRepository(): HistoryRepository {
  if (!repositorySingleton) {
    repositorySingleton = createLocalStorageHistoryRepository();
  }
  return repositorySingleton;
}
