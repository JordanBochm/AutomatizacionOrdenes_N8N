import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseTsv,
  serializeToTsv,
  normalizeFieldValue,
  isScientificNotation,
  detectAndMapHeaders,
  applyPastedMatrixToRows,
  createEmptyTrackingRow,
  formatPickOrderWithClientPrefix,
  // @ts-expect-error Extensión .ts para ejecución directa con node --test
} from "../tableClipboard.ts";

describe("tableClipboard - Parser TSV, Normalizadores y Mapeo de Encabezados", () => {
  it("1. Parsea celda con salto de línea entre comillas sin dividir la fila", () => {
    const tsvWithNewlineInQuotes =
      'ESTAFETAREST\tBASF\t8793 8866 3139\tBASF_100\t"32120 -\r\nAndares"\t1\r\n';
    const parsed = parseTsv(tsvWithNewlineInQuotes);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0][4], "32120 -\nAndares");
  });

  it('2. Parsea comillas dobles escapadas ("") dentro de celdas entrecomilladas', () => {
    const tsvEscapedQuotes =
      'ESTAFETAREST\tKYNDRYL\t001554094741\tKYNDRYL_RITM01\t"Sucursal ""Centro"" MX"\t1';
    const parsed = parseTsv(tsvEscapedQuotes);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0][4], 'Sucursal "Centro" MX');
  });

  it("3. Elimina automáticamente la fila final vacía que Excel siempre agrega", () => {
    const excelBlock =
      "ESTAFETAREST\tBASF\t8793 8866 3139\tBASF_01\t32120 - Andares\t1\r\n" +
      "ESTAFETAREST\tKYNDRYL\t001554094741C600000025\tKYNDRYL_RITM0525572\tRITM0525572\t1\r\n";
    const parsed = parseTsv(excelBlock);
    assert.equal(parsed.length, 2);
  });

  it('4. Conserva el formato original del tracking "8793 8866 3139" limpiando solo espacios dobles', () => {
    const normalized = normalizeFieldValue("tracking_number", "  8793 8866  3139 \u00A0 ");
    assert.equal(normalized, "8793 8866 3139");
  });

  it('5. Detecta notación científica como "8.79E+11" generada por Excel', () => {
    assert.equal(isScientificNotation("8.79E+11"), true);
    assert.equal(isScientificNotation("8,79e+11"), true);
    assert.equal(isScientificNotation("001554094741C600000025"), false);
    assert.equal(isScientificNotation("8793 8866 3139"), false);
  });

  it("6. Mapea encabezados en otro orden (incluyendo columna #) por nombre y aplica autocompletado", () => {
    const outOfOrderTsv = [
      "#\tCUSTOMER ORDER\tNo. Guía\tCliente\tPaquetería\tBultos\tPick Order",
      "1\tritm0525572\t8793 8866 3139\tKST\testafetarest\t3\t",
    ].join("\r\n");

    const matrix = parseTsv(outOfOrderTsv);
    const headerCheck = detectAndMapHeaders(matrix[0]);
    assert.equal(headerCheck.isHeaderRow, true);
    assert.equal(headerCheck.allRecognized, true);

    const initialRows = [createEmptyTrackingRow("BASF")];
    const result = applyPastedMatrixToRows({
      rows: initialRows,
      matrix,
      startRow: 0,
      startCol: 0,
    });

    assert.equal(result.pastedRowCount, 1);
    const pastedRow = result.nextRows[0];
    assert.equal(pastedRow.carrier, "ESTAFETAREST");
    assert.equal(pastedRow.client, "KYNDRYL");
    assert.equal(pastedRow.tracking_number, "8793 8866 3139");
    assert.equal(pastedRow.customer_order, "RITM0525572");
    assert.equal(pastedRow.pick_order, "RITM0525572");
    assert.equal(
      formatPickOrderWithClientPrefix(pastedRow.client, pastedRow.pick_order, pastedRow.customer_order),
      "KYNDRYL_RITM0525572"
    );
    assert.equal(pastedRow.boxes, 3);

    const serialized = serializeToTsv([
      [pastedRow.carrier, pastedRow.client, pastedRow.tracking_number],
    ]);
    assert.equal(serialized, "ESTAFETAREST\tKYNDRYL\t8793 8866 3139");
  });
});
