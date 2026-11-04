import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseFlexibleDate,
  validateRitm,
  normalizeModelo,
  sanitizeExcelFormula,
  normalizeRawRow,
  applySerialDuplicateDetection,
} from "../reportes/normalize";
import { resolveEstatusDevolucion } from "../reportes/status-map";
import { getReportesRepository } from "../reportes/repository";
import { generateReportesExcelBuffer } from "../reportes/export";
import { detectManufacturer, lookupWarranty } from "../reportes/warranty-service";

describe("Módulo Reportes - Reglas de Calidad y Normalización", () => {
  it("1. Mapeo estricto de estatus: pending evaluation, pedning disposal, available y sin clasificar", () => {
    // Erratas documentadas
    const eval1 = resolveEstatusDevolucion("pending evaluation", "");
    assert.equal(eval1.estatus, "En evaluación");

    const eval2 = resolveEstatusDevolucion("pedning evaluation ", "");
    assert.equal(eval2.estatus, "En evaluación");

    const disp1 = resolveEstatusDevolucion("pending disposal", "");
    assert.equal(disp1.estatus, "Pendiente de baja");

    const disp2 = resolveEstatusDevolucion("pedning disposal ", "");
    assert.equal(disp2.estatus, "Pendiente de baja");

    // In Stock / Cerrado vía available o Entry into Stock
    const stock1 = resolveEstatusDevolucion("available", "");
    assert.equal(stock1.estatus, "In Stock / Cerrado");

    const stock2 = resolveEstatusDevolucion("", "2026-10-25");
    assert.equal(stock2.estatus, "In Stock / Cerrado");

    // Exclusiones de Stock inválido (N/A, NA, -)
    const noStock = resolveEstatusDevolucion("", "N/A");
    assert.equal(noStock.estatus, "Sin clasificar");

    // Fechas en Substate ("Agosto 2022") o vacíos no deben inventar estatus
    const dateSubstate = resolveEstatusDevolucion("Agosto 2022", "");
    assert.equal(dateSubstate.estatus, "Sin clasificar");

    const emptySubstate = resolveEstatusDevolucion("", "");
    assert.equal(emptySubstate.estatus, "Sin clasificar");
  });

  it("2. Parseo flexible de fechas con fallback configurable (2026)", () => {
    // DD/MM sin año
    const res1 = parseFlexibleDate("28/10", 2026);
    assert.equal(res1.isoDate, "2026-10-28");
    assert.equal(res1.isParsed, true);

    // Texto natural en español
    const res2 = parseFlexibleDate("1 de noviembre", 2026);
    assert.equal(res2.isoDate, "2026-11-01");
    assert.equal(res2.isParsed, true);

    const res3 = parseFlexibleDate("8 de noviembre ", 2026);
    assert.equal(res3.isoDate, "2026-11-08");
    assert.equal(res3.isParsed, true);

    // Formato con año explícito
    const res4 = parseFlexibleDate("12/05/2023", 2026);
    assert.equal(res4.isoDate, "2023-05-12");

    // Fecha ISO
    const res5 = parseFlexibleDate("2026-03-04T12:00:00Z");
    assert.equal(res5.isoDate, "2026-03-04");

    // Valores no parseables
    const res6 = parseFlexibleDate("N/A");
    assert.equal(res6.isoDate, null);
    assert.equal(res6.isParsed, false);
  });

  it("3. Validación de ticket RITM: no corregir en silencio y marcar ritmValido", () => {
    const valid1 = validateRitm("RITM0129403-1");
    assert.equal(valid1.valido, true);
    assert.equal(valid1.ritm, "RITM0129403-1");

    const valid2 = validateRitm("ritm998877");
    assert.equal(valid2.valido, true);

    // Mal capturados
    const bad1 = validateRitm("RIM0129403");
    assert.equal(bad1.valido, false);
    assert.equal(bad1.ritm, "RIM0129403");

    const bad2 = validateRitm("ROTM001");
    assert.equal(bad2.valido, false);

    const bad3 = validateRitm("PHON");
    assert.equal(bad3.valido, false);

    const empty = validateRitm("");
    assert.equal(empty.valido, false);
  });

  it("4. Detección de serial duplicado: no marcar seriales vacíos como duplicados", () => {
    const row1 = normalizeRawRow({ "No. devolución": "1", "Serial Number": "PF123456" }, "C1", 1);
    const row2 = normalizeRawRow({ "No. devolución": "2", "Serial Number": "PF123456" }, "C1", 2);
    const row3 = normalizeRawRow({ "No. devolución": "3", "Serial Number": "   " }, "C1", 3);
    const row4 = normalizeRawRow({ "No. devolución": "4", "Serial Number": "" }, "C1", 4);
    const row5 = normalizeRawRow({ "No. devolución": "5", "Serial Number": "UNIQUE99" }, "C1", 5);

    const withDups = applySerialDuplicateDetection([row1, row2, row3, row4, row5]);

    const findByNo = (no: string) => withDups.find((r) => r.noDevolucion === no);

    // PF123456 aparece 2 veces -> duplicado true
    assert.equal(findByNo("1")?.serialDuplicado, true);
    assert.equal(findByNo("2")?.serialDuplicado, true);

    // Seriales vacíos -> duplicado false (no se agrupan entre sí)
    assert.equal(findByNo("3")?.serialDuplicado, false);
    assert.equal(findByNo("4")?.serialDuplicado, false);

    // Serial único -> duplicado false
    assert.equal(findByNo("5")?.serialDuplicado, false);
  });

  it("5. Sanitización contra inyección de fórmulas en Excel", () => {
    assert.equal(sanitizeExcelFormula("=SUM(A1:A10)"), "'=SUM(A1:A10)");
    assert.equal(sanitizeExcelFormula("+cmd|' /C calc'!A0"), "'+cmd|' /C calc'!A0");
    assert.equal(sanitizeExcelFormula("-100"), "'-100");
    assert.equal(sanitizeExcelFormula("@admin"), "'@admin");
    assert.equal(sanitizeExcelFormula("Texto Normal"), "Texto Normal");
    assert.equal(sanitizeExcelFormula(""), "");
  });

  it("6. Diccionario de alias de hardware", () => {
    assert.equal(normalizeModelo("Lenovo 20S1SFJH0Q"), "Lenovo ThinkPad T14 Gen 1");
    assert.equal(normalizeModelo("MacBook Air A2337"), "MacBook Air M1 (A2337)");
    assert.equal(normalizeModelo("Desconocido XYZ"), "Desconocido XYZ");
  });

  it("7. Integración con repositorio persistente y suma exacta de KPIs", () => {
    const repo = getReportesRepository();
    const all = repo.getAll();
    assert.equal(all.length, 1598, "El total de registros debe ser exactamente 1598");

    const kpis = repo.getKpis();
    assert.equal(kpis.totalDevueltos, 1598);

    // Suma de categorías debe ser idéntica al total: En evaluación + Pendiente de baja + In Stock + Sin clasificar = Total
    const sumaCategorias = kpis.enEvaluacion + kpis.pendientesBaja + kpis.inStockCerrado + kpis.sinClasificar;
    assert.equal(sumaCategorias, kpis.totalDevueltos, "La suma de estatus debe ser exactamente igual al total devueltos");

    // Búsqueda universal
    const searchRes = repo.list({ q: "MacBook", page: 1, pageSize: 10 });
    assert.ok(searchRes.total > 0, "Debe encontrar registros con búsqueda universal");
    assert.ok(searchRes.items.length <= 10, "Debe paginar correctamente");

    // Historial por serial
    const sampleSerial = all.find((r) => r.serialDuplicado)?.serialNumber;
    if (sampleSerial) {
      const history = repo.getBySerial(sampleSerial);
      assert.ok(history.length > 1, "Debe retornar más de una ocurrencia para un serial duplicado");
    }

    // Exportación a Buffer Excel
    const buffer = generateReportesExcelBuffer(all.slice(0, 10), kpis, {});
    assert.ok(buffer.length > 1000, "El buffer de Excel generado debe ser válido y contener bytes");
  });

  it("8. Módulo de Garantías: detección de fabricante, consulta y enriquecimiento", async () => {
    // Detección automática de fabricante
    assert.equal(detectManufacturer("PF3Z9EJB", "ThinkPad T14"), "LENOVO");
    assert.equal(detectManufacturer("PC123456", "Lenovo"), "LENOVO");
    assert.equal(detectManufacturer("4J2K8N2", "Dell Latitude 5420"), "DELL");
    assert.equal(detectManufacturer("C02F1234MD6R", "MacBook Air M1"), "APPLE");
    assert.equal(detectManufacturer("UNKNOWN999", "Equipo Genérico"), "OTRO");

    // Consulta con fallback o caché
    const wRes = await lookupWarranty("TEST_SERIAL_001", "ThinkPad T14");
    assert.ok(wRes);
    assert.equal(wRes.proveedor, "LENOVO");
    assert.ok(wRes.consultadoEn);

    // Repositorio con filtro de garantías
    const repo = getReportesRepository();
    const listRes = repo.list({ soloConGarantia: true });
    assert.ok(Array.isArray(listRes.items));

    const kpis = repo.getKpis();
    assert.ok(typeof kpis.totalConGarantia === "number");
    assert.ok(typeof kpis.totalGarantiaExpirada === "number");
  });
});
