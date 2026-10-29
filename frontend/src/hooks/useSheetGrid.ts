"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { TrackingRow, Client } from "@/lib/trackingPdf";
import {
  EDITABLE_COLUMNS,
  EditableField,
  parseTsv,
  serializeToTsv,
  normalizeFieldValue,
  applyRowSmartDefaults,
  applyPastedMatrixToRows,
  createEmptyTrackingRow,
  ensureTrailingEmptyRow,
  incrementFillValue,
  generateRowId,
  isRowEmptyData,
} from "@/lib/tableClipboard";

export interface CellCoord {
  row: number;
  col: number;
}

export interface CellRange {
  start: CellCoord;
  end: CellCoord;
}

export interface NormalizedBounds {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

export function getNormalizedBounds(range: CellRange | null): NormalizedBounds | null {
  if (!range) return null;
  return {
    minRow: Math.min(range.start.row, range.end.row),
    maxRow: Math.max(range.start.row, range.end.row),
    minCol: Math.min(range.start.col, range.end.col),
    maxCol: Math.max(range.start.col, range.end.col),
  };
}

interface UseSheetGridParams {
  rows: TrackingRow[];
  setRows: React.Dispatch<React.SetStateAction<TrackingRow[]>>;
  triggerToast: (message: string, type: "success" | "error" | "info") => void;
  onRequestDeleteRows?: (rowIds: string[], label: string) => void;
  defaultClient?: Client | string;
}

const MAX_HISTORY = 50;

export function useSheetGrid({
  rows,
  setRows,
  triggerToast,
  onRequestDeleteRows,
  defaultClient = "BASF",
}: UseSheetGridParams) {
  const [activeCell, setActiveCell] = useState<CellCoord | null>({ row: 0, col: 0 });
  const [selection, setSelection] = useState<CellRange | null>({
    start: { row: 0, col: 0 },
    end: { row: 0, col: 0 },
  });

  const [editingCell, setEditingCell] = useState<CellCoord | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");

  // Historial Deshacer / Rehacer (máx 50 pasos)
  const [undoStack, setUndoStack] = useState<TrackingRow[][]>([]);
  const [redoStack, setRedoStack] = useState<TrackingRow[][]>([]);

  // Selección por arrastre de mouse y Fill Handle
  const isMouseSelectingRef = useRef<boolean>(false);
  const [fillDragEndRow, setFillDragEndRow] = useState<number | null>(null);
  const isFillDraggingRef = useRef<boolean>(false);

  // Referencia al contenedor de la tabla para gestionar foco y scrollIntoView
  const gridContainerRef = useRef<HTMLDivElement | null>(null);

  // Mantener ref actualizada de rows para handlers rápidos de teclado
  const rowsRef = useRef<TrackingRow[]>(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // Asegurar que la celda activa sea visible al cambiar con teclado
  useEffect(() => {
    if (!activeCell || !gridContainerRef.current) return;
    const selector = `[data-cell="${activeCell.row}-${activeCell.col}"]`;
    const cellEl = gridContainerRef.current.querySelector<HTMLElement>(selector);
    if (cellEl && typeof cellEl.scrollIntoView === "function") {
      cellEl.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [activeCell]);

  // Cerrar arrastre de mouse o fill handle al soltar el botón en cualquier parte de la ventana
  useEffect(() => {
    const handleMouseUp = () => {
      if (isMouseSelectingRef.current) {
        isMouseSelectingRef.current = false;
      }
    };
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, []);

  /**
   * Registra un paso en el historial y actualiza `rows` garantizando la fila vacía final
   */
  const commitRows = useCallback(
    (nextRowsRaw: TrackingRow[], withTrailingEmpty: boolean = true) => {
      const prevRows = rowsRef.current;
      const nextRows = withTrailingEmpty
        ? ensureTrailingEmptyRow(nextRowsRaw, defaultClient)
        : nextRowsRaw;

      setUndoStack((prev) => {
        const updated = [...prev, prevRows];
        return updated.length > MAX_HISTORY ? updated.slice(updated.length - MAX_HISTORY) : updated;
      });
      setRedoStack([]);
      setRows(nextRows);
    },
    [defaultClient, setRows]
  );

  /**
   * Deshacer (Ctrl+Z)
   */
  const undo = useCallback(() => {
    setEditingCell(null);
    setUndoStack((prevUndo) => {
      if (prevUndo.length === 0) return prevUndo;
      const previousState = prevUndo[prevUndo.length - 1];
      const currentRows = rowsRef.current;
      setRedoStack((prevRedo) => [...prevRedo, currentRows]);
      setRows(previousState);
      triggerToast("Acción deshecha (Ctrl+Z).", "info");
      return prevUndo.slice(0, -1);
    });
  }, [setRows, triggerToast]);

  /**
   * Rehacer (Ctrl+Y / Ctrl+Shift+Z)
   */
  const redo = useCallback(() => {
    setEditingCell(null);
    setRedoStack((prevRedo) => {
      if (prevRedo.length === 0) return prevRedo;
      const nextState = prevRedo[prevRedo.length - 1];
      const currentRows = rowsRef.current;
      setUndoStack((prevUndo) => {
        const updated = [...prevUndo, currentRows];
        return updated.length > MAX_HISTORY ? updated.slice(updated.length - MAX_HISTORY) : updated;
      });
      setRows(nextState);
      triggerToast("Acción rehecha (Ctrl+Y).", "info");
      return prevRedo.slice(0, -1);
    });
  }, [setRows, triggerToast]);

  /**
   * Lee el valor actual de una celda (row, col)
   */
  const getCellValue = useCallback((rIdx: number, cIdx: number): string | number => {
    const row = rowsRef.current[rIdx];
    const field = EDITABLE_COLUMNS[cIdx];
    if (!row || !field) return "";
    if (field === "client") {
      return row.client ?? row.account ?? "";
    }
    return (row as any)[field] ?? "";
  }, []);

  /**
   * Inicia modo edición en una celda
   */
  const startEditing = useCallback(
    (coord: CellCoord, initialText?: string) => {
      const currentVal = getCellValue(coord.row, coord.col);
      setActiveCell(coord);
      setSelection({ start: coord, end: coord });
      setEditingCell(coord);
      setEditingValue(initialText !== undefined ? initialText : String(currentVal ?? ""));
    },
    [getCellValue]
  );

  /**
   * Cancela la edición activa y devuelve el foco al contenedor de la tabla
   */
  const cancelEditing = useCallback(() => {
    setEditingCell(null);
    setEditingValue("");
    requestAnimationFrame(() => {
      gridContainerRef.current?.focus();
    });
  }, []);

  /**
   * Confirma el valor editado en `editingCell` (o un valor explícito) y actualiza la fila
   */
  const commitCellEdit = useCallback(
    (overrideValue?: string, targetCoord?: CellCoord) => {
      const cell = targetCoord || editingCell;
      if (!cell) return;

      const { row: rIdx, col: cIdx } = cell;
      const field = EDITABLE_COLUMNS[cIdx];
      const currentRows = rowsRef.current;
      if (!field || !currentRows[rIdx]) {
        setEditingCell(null);
        return;
      }

      const rawToCommit = overrideValue !== undefined ? overrideValue : editingValue;
      const normalized = normalizeFieldValue(field, rawToCommit);
      const oldVal = getCellValue(rIdx, cIdx);

      setEditingCell(null);

      if (String(normalized) === String(oldVal)) {
        return;
      }

      const nextRows = currentRows.map((r, i) => {
        if (i !== rIdx) return r;
        const updated: TrackingRow = {
          ...r,
          [field]: normalized,
          account: field === "client" ? String(normalized) : r.client,
        };
        return applyRowSmartDefaults(updated, field);
      });

      commitRows(nextRows, true);
    },
    [editingCell, editingValue, getCellValue, commitRows]
  );

  /**
   * Mueve la celda activa dentro de los límites de la tabla
   */
  const moveActiveCell = useCallback(
    (nextRow: number, nextCol: number, extendSelection: boolean = false) => {
      const totalRows = Math.max(1, rowsRef.current.length);
      const totalCols = EDITABLE_COLUMNS.length;

      const clampedRow = Math.max(0, Math.min(totalRows - 1, nextRow));
      const clampedCol = Math.max(0, Math.min(totalCols - 1, nextCol));
      const nextCoord = { row: clampedRow, col: clampedCol };

      if (extendSelection && activeCell) {
        setSelection((prev) => ({
          start: prev ? prev.start : activeCell,
          end: nextCoord,
        }));
      } else {
        setActiveCell(nextCoord);
        setSelection({ start: nextCoord, end: nextCoord });
      }
    },
    [activeCell]
  );

  /**
   * Vacía las celdas en el rango seleccionado (Delete / Backspace); boxes vuelve a 1
   */
  const clearSelectedCells = useCallback(() => {
    const bounds = getNormalizedBounds(
      selection || (activeCell ? { start: activeCell, end: activeCell } : null)
    );
    if (!bounds) return;

    const currentRows = rowsRef.current;
    let hasChanges = false;

    const nextRows = currentRows.map((row, rIdx) => {
      if (rIdx < bounds.minRow || rIdx > bounds.maxRow) return row;
      const updated: TrackingRow = { ...row };
      for (let cIdx = bounds.minCol; cIdx <= bounds.maxCol; cIdx++) {
        const field = EDITABLE_COLUMNS[cIdx];
        if (!field) continue;
        if (field === "boxes") {
          if (updated.boxes !== 1) {
            updated.boxes = 1;
            hasChanges = true;
          }
        } else {
          if ((updated as any)[field] !== "") {
            (updated as any)[field] = "";
            if (field === "client") {
              updated.account = "";
            }
            hasChanges = true;
          }
        }
      }
      return updated;
    });

    if (hasChanges) {
      commitRows(nextRows, true);
    }
  }, [selection, activeCell, commitRows]);

  /**
   * Copia el rango seleccionado al portapapeles como TSV
   */
  const copySelectionToClipboard = useCallback(async () => {
    const bounds = getNormalizedBounds(
      selection || (activeCell ? { start: activeCell, end: activeCell } : null)
    );
    if (!bounds) return;

    const currentRows = rowsRef.current;
    const matrix: (string | number)[][] = [];

    for (let rIdx = bounds.minRow; rIdx <= bounds.maxRow; rIdx++) {
      const row = currentRows[rIdx];
      if (!row) continue;
      // Si es la última fila vacía de plantilla y se seleccionaron varias filas, omitirla al copiar
      if (rIdx === currentRows.length - 1 && bounds.maxRow > bounds.minRow && isRowEmptyData(row)) {
        continue;
      }
      const rowValues: (string | number)[] = [];
      for (let cIdx = bounds.minCol; cIdx <= bounds.maxCol; cIdx++) {
        const field = EDITABLE_COLUMNS[cIdx];
        rowValues.push((row as any)[field] ?? "");
      }
      matrix.push(rowValues);
    }

    if (matrix.length === 0) return;

    const tsv = serializeToTsv(matrix);
    try {
      await navigator.clipboard.writeText(tsv);
      triggerToast(
        `${matrix.length} fila(s) copiada(s) al portapapeles para Excel.`,
        "success"
      );
    } catch {
      triggerToast("No se pudo acceder al portapapeles del navegador.", "error");
    }
  }, [selection, activeCell, triggerToast]);

  /**
   * Corta el rango seleccionado (Ctrl+X): copia al portapapeles y vacía las celdas
   */
  const cutSelectionToClipboard = useCallback(async () => {
    await copySelectionToClipboard();
    clearSelectedCells();
  }, [copySelectionToClipboard, clearSelectedCells]);

  /**
   * Rellena hacia abajo (Ctrl+D): copia la fila superior del rango seleccionado en las filas inferiores
   */
  const fillDownSelection = useCallback(() => {
    const bounds = getNormalizedBounds(selection);
    if (!bounds || bounds.maxRow <= bounds.minRow) return;

    const currentRows = rowsRef.current;
    const sourceRow = currentRows[bounds.minRow];
    if (!sourceRow) return;

    const nextRows = currentRows.map((row, rIdx) => {
      if (rIdx <= bounds.minRow || rIdx > bounds.maxRow) return row;
      let updated: TrackingRow = { ...row };
      for (let cIdx = bounds.minCol; cIdx <= bounds.maxCol; cIdx++) {
        const field = EDITABLE_COLUMNS[cIdx];
        if (!field) continue;
        (updated as any)[field] = (sourceRow as any)[field];
        updated = applyRowSmartDefaults(updated, field);
      }
      return updated;
    });

    commitRows(nextRows, true);
    triggerToast(
      `Rellenado hacia abajo en ${bounds.maxRow - bounds.minRow} fila(s).`,
      "info"
    );
  }, [selection, commitRows, triggerToast]);

  /**
   * Aplica el arrastre del Fill Handle (esquina inferior derecha de la celda activa)
   * incrementando sufijos numéricos (ej. RITM0532001 -> RITM0532002) o repitiendo el valor
   */
  const applyFillHandleToRow = useCallback(
    (targetEndRow: number) => {
      const bounds = getNormalizedBounds(
        selection || (activeCell ? { start: activeCell, end: activeCell } : null)
      );
      if (!bounds || targetEndRow <= bounds.maxRow) return;

      const currentRows = rowsRef.current;
      const sourceRow = currentRows[bounds.minRow];
      if (!sourceRow) return;

      const nextRows = currentRows.map((row, rIdx) => {
        if (rIdx <= bounds.minRow || rIdx > targetEndRow) return row;
        const step = rIdx - bounds.minRow;
        let updated: TrackingRow = { ...row };
        for (let cIdx = bounds.minCol; cIdx <= bounds.maxCol; cIdx++) {
          const field = EDITABLE_COLUMNS[cIdx];
          if (!field) continue;
          const baseVal = (sourceRow as any)[field];
          const nextVal = incrementFillValue(baseVal, step, field);
          (updated as any)[field] = normalizeFieldValue(field, nextVal);
          updated = applyRowSmartDefaults(updated, field);
        }
        return updated;
      });

      commitRows(nextRows, true);
      setSelection({
        start: { row: bounds.minRow, col: bounds.minCol },
        end: { row: targetEndRow, col: bounds.maxCol },
      });
    },
    [selection, activeCell, commitRows]
  );

  /**
   * Procesa y aplica un texto TSV pegado desde Excel
   */
  const pasteTsvText = useCallback(
    (rawText: string) => {
      const matrix = parseTsv(rawText);
      if (matrix.length === 0) return;

      const startCoord = activeCell || { row: 0, col: 0 };
      const result = applyPastedMatrixToRows({
        rows: rowsRef.current,
        matrix,
        startRow: startCoord.row,
        startCol: startCoord.col,
        selection,
        defaultClient,
      });

      if (result.pastedRowCount === 0) return;

      commitRows(result.nextRows, true);
      setActiveCell(result.selectionRange.start);
      setSelection(result.selectionRange);

      if (result.ignoredExtraCols) {
        triggerToast(
          `${result.pastedRowCount} fila(s) pegada(s) desde Excel (se ignoraron columnas sobrantes fuera de la tabla).`,
          "info"
        );
      } else {
        triggerToast(
          `${result.pastedRowCount} fila(s) pegada(s) desde Excel.`,
          "success"
        );
      }
    },
    [activeCell, selection, defaultClient, commitRows, triggerToast]
  );

  /**
   * Operaciones de filas (insertar arriba/abajo, duplicar, agregar al final)
   */
  const insertRowAt = useCallback(
    (targetRowIndex: number, position: "above" | "below") => {
      const currentRows = rowsRef.current;
      const insertIdx = position === "above" ? targetRowIndex : targetRowIndex + 1;
      const referenceClient = currentRows[targetRowIndex]?.client || defaultClient;
      const newRow = createEmptyTrackingRow(referenceClient);
      const nextRows = [
        ...currentRows.slice(0, insertIdx),
        newRow,
        ...currentRows.slice(insertIdx),
      ];
      commitRows(nextRows, true);
      const newCoord = { row: insertIdx, col: 0 };
      setActiveCell(newCoord);
      setSelection({ start: newCoord, end: newCoord });
      requestAnimationFrame(() => {
        gridContainerRef.current?.focus();
      });
    },
    [defaultClient, commitRows]
  );

  const duplicateRowAt = useCallback(
    (targetRowIndex: number) => {
      const currentRows = rowsRef.current;
      const source = currentRows[targetRowIndex];
      if (!source) return;
      const duplicated: TrackingRow = {
        ...source,
        id: generateRowId(),
        manual: true,
      };
      const insertIdx = targetRowIndex + 1;
      const nextRows = [
        ...currentRows.slice(0, insertIdx),
        duplicated,
        ...currentRows.slice(insertIdx),
      ];
      commitRows(nextRows, true);
      const newCoord = { row: insertIdx, col: 0 };
      setActiveCell(newCoord);
      setSelection({ start: newCoord, end: newCoord });
      triggerToast(`Fila #${targetRowIndex + 1} duplicada.`, "info");
    },
    [commitRows, triggerToast]
  );

  const addRowAtEndAndFocus = useCallback(() => {
    const currentRows = rowsRef.current;
    // Si la última fila ya está vacía, enfocar su primera celda; si no, agregar una nueva y enfocarla
    if (currentRows.length > 0 && isRowEmptyData(currentRows[currentRows.length - 1])) {
      const lastIdx = currentRows.length - 1;
      const nextRow = createEmptyTrackingRow(defaultClient);
      const updated = [...currentRows, nextRow];
      commitRows(updated, false);
      const coord = { row: lastIdx, col: 0 };
      setActiveCell(coord);
      setSelection({ start: coord, end: coord });
    } else {
      const nextRow = createEmptyTrackingRow(defaultClient);
      const updated = ensureTrailingEmptyRow([...currentRows, nextRow], defaultClient);
      const focusIdx = currentRows.length;
      commitRows(updated, false);
      const coord = { row: focusIdx, col: 0 };
      setActiveCell(coord);
      setSelection({ start: coord, end: coord });
    }
    requestAnimationFrame(() => {
      gridContainerRef.current?.focus();
    });
  }, [defaultClient, commitRows]);

  /**
   * Manejador centralizado de teclado en el contenedor de la tabla (como Excel)
   */
  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const currentRows = rowsRef.current;
      const totalRows = Math.max(1, currentRows.length);
      const totalCols = EDITABLE_COLUMNS.length;
      const currentActive = activeCell || { row: 0, col: 0 };

      // Si hay una celda en modo edición, el input interno maneja caracteres y flechas locales
      if (editingCell) {
        if (e.key === "Escape") {
          e.preventDefault();
          cancelEditing();
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          commitCellEdit();
          const dir = e.shiftKey ? -1 : 1;
          const nextRow = Math.max(0, Math.min(totalRows - 1, editingCell.row + dir));
          moveActiveCell(nextRow, editingCell.col, false);
          requestAnimationFrame(() => {
            gridContainerRef.current?.focus();
          });
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          commitCellEdit();
          if (e.shiftKey) {
            if (editingCell.col > 0) {
              moveActiveCell(editingCell.row, editingCell.col - 1, false);
            } else if (editingCell.row > 0) {
              moveActiveCell(editingCell.row - 1, totalCols - 1, false);
            }
          } else {
            if (editingCell.col < totalCols - 1) {
              moveActiveCell(editingCell.row, editingCell.col + 1, false);
            } else if (editingCell.row < totalRows - 1) {
              moveActiveCell(editingCell.row + 1, 0, false);
            }
          }
          requestAnimationFrame(() => {
            gridContainerRef.current?.focus();
          });
          return;
        }
        return;
      }

      const isMod = e.ctrlKey || e.metaKey;

      // Atajos con Ctrl / Cmd
      if (isMod) {
        const keyLower = e.key.toLowerCase();

        // Deshacer: Ctrl+Z
        if (keyLower === "z" && !e.shiftKey) {
          e.preventDefault();
          undo();
          return;
        }

        // Rehacer: Ctrl+Y o Ctrl+Shift+Z
        if (keyLower === "y" || (keyLower === "z" && e.shiftKey)) {
          e.preventDefault();
          redo();
          return;
        }

        // Seleccionar todo: Ctrl+A
        if (keyLower === "a") {
          e.preventDefault();
          setSelection({
            start: { row: 0, col: 0 },
            end: { row: totalRows - 1, col: totalCols - 1 },
          });
          return;
        }

        // Copiar: Ctrl+C
        if (keyLower === "c") {
          e.preventDefault();
          copySelectionToClipboard();
          return;
        }

        // Cortar: Ctrl+X
        if (keyLower === "x") {
          e.preventDefault();
          cutSelectionToClipboard();
          return;
        }

        // Rellenar hacia abajo: Ctrl+D
        if (keyLower === "d") {
          e.preventDefault();
          fillDownSelection();
          return;
        }

        // Insertar fila debajo: Ctrl+Enter
        if (e.key === "Enter") {
          e.preventDefault();
          insertRowAt(currentActive.row, "below");
          return;
        }

        // Eliminar filas seleccionadas: Ctrl+Shift+Delete
        if (e.shiftKey && (e.key === "Delete" || e.key === "Backspace")) {
          e.preventDefault();
          const bounds = getNormalizedBounds(
            selection || { start: currentActive, end: currentActive }
          );
          if (bounds && onRequestDeleteRows) {
            const idsToDelete = currentRows
              .slice(bounds.minRow, bounds.maxRow + 1)
              .map((r) => r.id);
            onRequestDeleteRows(
              idsToDelete,
              bounds.minRow === bounds.maxRow
                ? `Fila #${bounds.minRow + 1}`
                : `${idsToDelete.length} filas seleccionadas`
            );
          }
          return;
        }

        // Ctrl + Flechas: saltar al borde de los datos
        if (e.key === "ArrowUp") {
          e.preventDefault();
          moveActiveCell(0, currentActive.col, e.shiftKey);
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          const lastDataRow = Math.max(
            0,
            currentRows.length > 1 && isRowEmptyData(currentRows[currentRows.length - 1])
              ? currentRows.length - 2
              : currentRows.length - 1
          );
          const targetRow =
            currentActive.row < lastDataRow ? lastDataRow : currentRows.length - 1;
          moveActiveCell(targetRow, currentActive.col, e.shiftKey);
          return;
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          moveActiveCell(currentActive.row, 0, e.shiftKey);
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          moveActiveCell(currentActive.row, totalCols - 1, e.shiftKey);
          return;
        }
      }

      // Navegación con flechas
      const cursorBase = e.shiftKey && selection ? selection.end : currentActive;

      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveActiveCell(cursorBase.row - 1, cursorBase.col, e.shiftKey);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveActiveCell(cursorBase.row + 1, cursorBase.col, e.shiftKey);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveActiveCell(cursorBase.row, cursorBase.col - 1, e.shiftKey);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        moveActiveCell(cursorBase.row, cursorBase.col + 1, e.shiftKey);
        return;
      }

      // Home / End: primera / última columna de la fila
      if (e.key === "Home") {
        e.preventDefault();
        moveActiveCell(currentActive.row, 0, e.shiftKey);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        moveActiveCell(currentActive.row, totalCols - 1, e.shiftKey);
        return;
      }

      // Tab / Shift+Tab: siguiente / anterior celda (salta a la fila siguiente/anterior)
      if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) {
          if (currentActive.col > 0) {
            moveActiveCell(currentActive.row, currentActive.col - 1, false);
          } else if (currentActive.row > 0) {
            moveActiveCell(currentActive.row - 1, totalCols - 1, false);
          }
        } else {
          if (currentActive.col < totalCols - 1) {
            moveActiveCell(currentActive.row, currentActive.col + 1, false);
          } else if (currentActive.row < totalRows - 1) {
            moveActiveCell(currentActive.row + 1, 0, false);
          }
        }
        return;
      }

      // Enter / Shift+Enter: bajar / subir una fila
      if (e.key === "Enter") {
        e.preventDefault();
        const delta = e.shiftKey ? -1 : 1;
        moveActiveCell(currentActive.row + delta, currentActive.col, false);
        return;
      }

      // F2: entrar en modo edición conservando el contenido actual
      if (e.key === "F2") {
        e.preventDefault();
        startEditing(currentActive);
        return;
      }

      // Delete / Backspace: vaciar celdas seleccionadas
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        clearSelectedCells();
        return;
      }

      // Escribir directamente un carácter: entra a edición reemplazando el contenido (como Excel)
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        startEditing(currentActive, e.key);
      }
    },
    [
      activeCell,
      selection,
      editingCell,
      cancelEditing,
      commitCellEdit,
      moveActiveCell,
      undo,
      redo,
      copySelectionToClipboard,
      cutSelectionToClipboard,
      fillDownSelection,
      insertRowAt,
      onRequestDeleteRows,
      startEditing,
      clearSelectedCells,
    ]
  );

  /**
   * Manejador de pegado nativo (Ctrl+V) en el contenedor de la tabla
   */
  const handleGridPaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      const rawText = e.clipboardData?.getData("text/plain") || "";
      if (!rawText) return;

      // Si está editando una celda y lo pegado es 1 solo valor sin saltos ni tabs, dejar comportamiento nativo del input
      if (editingCell && !rawText.includes("\t") && !rawText.includes("\n") && !rawText.includes("\r")) {
        return;
      }

      e.preventDefault();
      if (editingCell) {
        setEditingCell(null);
      }
      pasteTsvText(rawText);
    },
    [editingCell, pasteTsvText]
  );

  /**
   * Selección por clic en celda, encabezado de columna o número de fila #
   */
  const handleCellMouseDown = useCallback(
    (rowIdx: number, colIdx: number, e: React.MouseEvent) => {
      if (e.button !== 0) return; // Solo clic izquierdo
      if (editingCell && (editingCell.row !== rowIdx || editingCell.col !== colIdx)) {
        commitCellEdit();
      }

      const coord = { row: rowIdx, col: colIdx };
      isMouseSelectingRef.current = true;

      if (e.shiftKey && activeCell) {
        setSelection({ start: activeCell, end: coord });
      } else {
        setActiveCell(coord);
        setSelection({ start: coord, end: coord });
      }
    },
    [editingCell, commitCellEdit, activeCell]
  );

  const handleCellMouseEnter = useCallback(
    (rowIdx: number, colIdx: number) => {
      if (isFillDraggingRef.current) {
        setFillDragEndRow(rowIdx);
        return;
      }
      if (!isMouseSelectingRef.current) return;
      setSelection((prev) =>
        prev
          ? { start: prev.start, end: { row: rowIdx, col: colIdx } }
          : { start: { row: rowIdx, col: colIdx }, end: { row: rowIdx, col: colIdx } }
      );
    },
    []
  );

  const selectEntireColumn = useCallback(
    (colIdx: number) => {
      if (editingCell) commitCellEdit();
      const totalRows = Math.max(1, rowsRef.current.length);
      setActiveCell({ row: 0, col: colIdx });
      setSelection({
        start: { row: 0, col: colIdx },
        end: { row: totalRows - 1, col: colIdx },
      });
      requestAnimationFrame(() => {
        gridContainerRef.current?.focus();
      });
    },
    [editingCell, commitCellEdit]
  );

  const selectEntireRow = useCallback(
    (rowIdx: number) => {
      if (editingCell) commitCellEdit();
      setActiveCell({ row: rowIdx, col: 0 });
      setSelection({
        start: { row: rowIdx, col: 0 },
        end: { row: rowIdx, col: EDITABLE_COLUMNS.length - 1 },
      });
      requestAnimationFrame(() => {
        gridContainerRef.current?.focus();
      });
    },
    [editingCell, commitCellEdit]
  );

  const startFillHandleDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isFillDraggingRef.current = true;
      const bounds = getNormalizedBounds(
        selection || (activeCell ? { start: activeCell, end: activeCell } : null)
      );
      setFillDragEndRow(bounds ? bounds.maxRow : 0);

      const handleUp = () => {
        window.removeEventListener("mouseup", handleUp);
        isFillDraggingRef.current = false;
        setFillDragEndRow((currentEnd) => {
          if (currentEnd !== null) {
            applyFillHandleToRow(currentEnd);
          }
          return null;
        });
      };
      window.addEventListener("mouseup", handleUp);
    },
    [selection, activeCell, applyFillHandleToRow]
  );

  return {
    gridContainerRef,
    activeCell,
    selection,
    editingCell,
    editingValue,
    setEditingValue,
    fillDragEndRow,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undo,
    redo,
    commitRows,
    startEditing,
    cancelEditing,
    commitCellEdit,
    moveActiveCell,
    clearSelectedCells,
    copySelectionToClipboard,
    cutSelectionToClipboard,
    fillDownSelection,
    pasteTsvText,
    insertRowAt,
    duplicateRowAt,
    addRowAtEndAndFocus,
    handleGridKeyDown,
    handleGridPaste,
    handleCellMouseDown,
    handleCellMouseEnter,
    selectEntireColumn,
    selectEntireRow,
    startFillHandleDrag,
  };
}
