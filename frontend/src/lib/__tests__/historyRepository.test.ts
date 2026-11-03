import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HISTORY_STORAGE_KEY,
  createLocalStorageHistoryRepository,
  localDateId,
  type StorageLike,
  // @ts-expect-error Extensión .ts para ejecución directa con node --test
} from "../history/repository.ts";

function createFakeStorage(): StorageLike & { dump: () => string | null } {
  let value: string | null = null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
    removeItem: () => {
      value = null;
    },
    dump: () => value,
  };
}

function makeEntry(guia: string, estatus: string, consultadoEn: string) {
  return {
    guia,
    carrier: "ESTAFETA" as const,
    estatus,
    eventos: 2,
    consultado_en: consultadoEn,
  };
}

describe("historyRepository - persistencia local", () => {
  it("1. Crea el día, deduplica guías y conserva el registro más reciente", async () => {
    const storage = createFakeStorage();
    const repo = createLocalStorageHistoryRepository(storage);

    await repo.upsertTrackings([makeEntry("GUIA-1", "EN_TRANSITO", "2026-11-03T10:00:00.000Z")]);
    await repo.upsertTrackings([makeEntry("GUIA-1", "ENTREGADO", "2026-11-03T12:00:00.000Z")]);

    const days = await repo.list();
    assert.equal(days.length, 1);
    assert.equal(days[0].trackings.length, 1);
    assert.equal(days[0].trackings[0].estatus, "ENTREGADO");
    assert.ok(days[0].sources.includes("tracking"));
  });

  it("2. Un cierre con errores marca el día como parcial", async () => {
    const storage = createFakeStorage();
    const repo = createLocalStorageHistoryRepository(storage);

    const day = await repo.upsertClosing({
      cierre_file: "Cierre_3_Noviembre_2026.xlsx",
      etiquetas_file: "Etiquetas_Lote_3_Noviembre_2026.pdf",
      total_orders: 20,
      assigned: 18,
      errors: 2,
      cp_alerts: 1,
    });

    assert.equal(day.status, "partial");
    assert.equal(day.closing?.total_orders, 20);
    assert.ok(day.sources.includes("closing"));
  });

  it("3. Ordena por fecha descendente y recorta a 30 días", async () => {
    const storage = createFakeStorage();
    const repo = createLocalStorageHistoryRepository(storage);

    for (let index = 0; index < 35; index++) {
      const day = String((index % 28) + 1).padStart(2, "0");
      const month = String(Math.floor(index / 28) + 1).padStart(2, "0");
      await repo.upsertBatch({ date: `2026-${month}-${day}` });
    }

    const days = await repo.list();
    assert.equal(days.length, 30);
    assert.ok(days[0].id >= days[days.length - 1].id);
  });

  it("4. Tolera JSON corrupto y reinicia el almacenamiento", async () => {
    const storage = createFakeStorage();
    storage.setItem(HISTORY_STORAGE_KEY, "{ esto no es json");
    const repo = createLocalStorageHistoryRepository(storage);

    const days = await repo.list();
    assert.deepEqual(days, []);
    assert.equal(storage.getItem(HISTORY_STORAGE_KEY), null);
  });

  it("5. Exporta e importa en modo merge sin duplicar días", async () => {
    const storage = createFakeStorage();
    const repo = createLocalStorageHistoryRepository(storage);
    const today = localDateId();

    await repo.upsertTrackings([makeEntry("GUIA-A", "EN_TRANSITO", "2026-11-03T09:00:00.000Z")], {
      date: today,
    });
    const exported = await repo.exportJson();

    const otherStorage = createFakeStorage();
    const otherRepo = createLocalStorageHistoryRepository(otherStorage);
    const imported = await otherRepo.importJson(exported, "merge");
    const merged = await otherRepo.importJson(exported, "merge");

    assert.equal(imported, 1);
    assert.equal(merged, 1);
    const days = await otherRepo.list();
    assert.equal(days.length, 1);
    assert.equal(days[0].trackings.length, 1);
  });

  it("6. Limpia el historial por completo", async () => {
    const storage = createFakeStorage();
    const repo = createLocalStorageHistoryRepository(storage);
    await repo.upsertBatch({ date: "2026-11-03" });
    await repo.clear();
    assert.deepEqual(await repo.list(), []);
  });
});
