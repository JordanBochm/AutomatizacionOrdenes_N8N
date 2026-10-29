"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Trash2,
  Plus,
  Copy,
  ClipboardPaste,
  ArrowUp,
  ArrowDown,
  Layers,
  AlertTriangle,
  Edit3,
  ChevronDown,
} from "lucide-react";
import { TrackingRow } from "@/lib/trackingPdf";
import {
  EDITABLE_COLUMNS,
  COLUMN_LABELS,
  EditableField,
  isScientificNotation,
  isUnknownClient,
  isRowEmptyData,
} from "@/lib/tableClipboard";
import {
  CellCoord,
  CellRange,
  NormalizedBounds,
  getNormalizedBounds,
} from "@/hooks/useSheetGrid";

export interface GridValidationInfo {
  emptyTrackingRowIndices: Set<number>;
  duplicateTrackingSet: Set<string>;
  duplicatePickSet: Set<string>;
  duplicateCustomerSet: Set<string>;
  scientificRowIndices: Set<number>;
  unknownClientRowIndices: Set<number>;
  emptyCount: number;
  duplicateCount: number;
  errorCount: number;
  firstIssueRowIndex: number | null;
}

interface TrackingGridProps {
  rows: TrackingRow[];
  selectedIds: Set<string>;
  onToggleSelectRow: (id: string) => void;
  onToggleSelectAll: () => void;
  onRequestDeleteSingleRow: (row: TrackingRow, index: number) => void;
  validationInfo: GridValidationInfo;
  // Props desde useSheetGrid
  gridContainerRef: React.RefObject<HTMLDivElement | null>;
  activeCell: CellCoord | null;
  selection: CellRange | null;
  editingCell: CellCoord | null;
  editingValue: string;
  setEditingValue: (val: string) => void;
  fillDragEndRow: number | null;
  startEditing: (coord: CellCoord, initialText?: string) => void;
  cancelEditing: () => void;
  commitCellEdit: (overrideValue?: string, targetCoord?: CellCoord) => void;
  moveActiveCell: (row: number, col: number, extend?: boolean) => void;
  handleGridKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  handleGridPaste: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  handleCellMouseDown: (row: number, col: number, e: React.MouseEvent) => void;
  handleCellMouseEnter: (row: number, col: number) => void;
  selectEntireColumn: (col: number) => void;
  selectEntireRow: (row: number) => void;
  startFillHandleDrag: (e: React.MouseEvent) => void;
  insertRowAt: (rowIndex: number, pos: "above" | "below") => void;
  duplicateRowAt: (rowIndex: number) => void;
  copySelectionToClipboard: () => void;
  onOpenPasteHelper: () => void;
}

const CLIENT_OPTIONS = ["BASF", "KYNDRYL"];

/**
 * Input único que se monta exclusivamente en la celda activa en modo edición
 */
const ActiveCellInput: React.FC<{
  field: EditableField;
  value: string;
  onChange: (val: string) => void;
  onCommit: (overrideVal?: string) => void;
  onCancel: () => void;
  onMoveAfterCommit: (deltaRow: number, deltaCol: number) => void;
}> = ({ field, value, onChange, onCommit, onCancel, onMoveAfterCommit }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(field === "client");
  const [highlightIdx, setHighlightIdx] = useState<number>(0);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      const len = inputRef.current.value.length;
      try {
        inputRef.current.setSelectionRange(len, len);
      } catch {}
    }
  }, []);

  const filteredClients = useMemo(() => {
    if (field !== "client") return [];
    const q = (value || "").trim().toUpperCase();
    if (!q) return CLIENT_OPTIONS;
    const matches = CLIENT_OPTIONS.filter((opt) => opt.includes(q));
    return matches.length > 0 ? matches : CLIENT_OPTIONS;
  }, [field, value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
      return;
    }

    if (field === "client") {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        if (!dropdownOpen) {
          setDropdownOpen(true);
          setHighlightIdx(0);
        } else {
          setHighlightIdx((prev) => (prev + 1) % filteredClients.length);
        }
        return;
      }
      if (e.key === "ArrowUp" && dropdownOpen) {
        e.preventDefault();
        e.stopPropagation();
        setHighlightIdx((prev) => (prev - 1 + filteredClients.length) % filteredClients.length);
        return;
      }
      if (e.key === "Enter" && dropdownOpen && filteredClients[highlightIdx]) {
        const exactTyped = value.trim().toUpperCase();
        // Si el usuario presionó flechas o escribió un prefijo parcial de BASF/KYNDRYL, usar la opción sugerida
        const chosen =
          CLIENT_OPTIONS.find((c) => c.startsWith(exactTyped)) ||
          exactTyped ||
          filteredClients[highlightIdx];
        e.preventDefault();
        e.stopPropagation();
        onCommit(chosen);
        onMoveAfterCommit(e.shiftKey ? -1 : 1, 0);
        return;
      }
    }

    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      onCommit();
      onMoveAfterCommit(e.shiftKey ? -1 : 1, 0);
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      onCommit();
      onMoveAfterCommit(0, e.shiftKey ? -1 : 1);
      return;
    }
  };

  return (
    <div className="relative w-full h-full flex items-center">
      <input
        ref={inputRef}
        type={field === "boxes" ? "number" : "text"}
        min={field === "boxes" ? 1 : undefined}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (field === "client") {
            setDropdownOpen(true);
          }
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => onCommit()}
        className={`w-full h-full px-2.5 py-1.5 text-xs bg-white text-slate-900 focus:outline-none ${
          field === "tracking_number" || field === "pick_order" || field === "customer_order"
            ? "font-mono text-center"
            : "font-semibold text-center"
        }`}
      />

      {field === "client" && dropdownOpen && (
        <div
          className="absolute left-0 top-full mt-1 w-full min-w-[130px] bg-white rounded-xl border border-slate-200 shadow-lg z-40 py-1 overflow-hidden"
          onMouseDown={(e) => e.preventDefault()}
        >
          {filteredClients.map((option, idx) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                onCommit(option);
                onMoveAfterCommit(1, 0);
              }}
              className={`w-full px-3 py-1.5 text-left text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                idx === highlightIdx
                  ? "bg-[#EFF3F9] text-[#233762]"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span>{option}</span>
              <span className="text-[10px] font-normal text-slate-400">Cliente</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface MemoRowProps {
  row: TrackingRow;
  rowIndex: number;
  isLastTrailingEmpty: boolean;
  isSelectedCheckbox: boolean;
  activeCol: number | null;
  editingCol: number | null;
  editingValue: string;
  selectionBounds: NormalizedBounds | null;
  fillDragEndRow: number | null;
  // Validaciones de esta fila
  isEmptyTrk: boolean;
  isScientificTrk: boolean;
  isDupTrk: boolean;
  isDupPick: boolean;
  isDupCustomer: boolean;
  isUnknownCli: boolean;
  // Callbacks
  onToggleSelectRow: (id: string) => void;
  onSelectEntireRow: (rowIdx: number) => void;
  onCellMouseDown: (rowIdx: number, colIdx: number, e: React.MouseEvent) => void;
  onCellMouseEnter: (rowIdx: number, colIdx: number) => void;
  onCellDoubleClick: (rowIdx: number, colIdx: number) => void;
  onContextMenu: (rowIdx: number, colIdx: number, e: React.MouseEvent) => void;
  onEditingValueChange: (val: string) => void;
  onCommitEdit: (overrideVal?: string) => void;
  onCancelEdit: () => void;
  onMoveAfterCommit: (rowIdx: number, colIdx: number, dRow: number, dCol: number) => void;
  onStartFillHandleDrag: (e: React.MouseEvent) => void;
  onRequestDeleteRow: (row: TrackingRow, index: number) => void;
}

const SheetRow = React.memo<MemoRowProps>(
  ({
    row,
    rowIndex,
    isLastTrailingEmpty,
    isSelectedCheckbox,
    activeCol,
    editingCol,
    editingValue,
    selectionBounds,
    fillDragEndRow,
    isEmptyTrk,
    isScientificTrk,
    isDupTrk,
    isDupPick,
    isDupCustomer,
    isUnknownCli,
    onToggleSelectRow,
    onSelectEntireRow,
    onCellMouseDown,
    onCellMouseEnter,
    onCellDoubleClick,
    onContextMenu,
    onEditingValueChange,
    onCommitEdit,
    onCancelEdit,
    onMoveAfterCommit,
    onStartFillHandleDrag,
    onRequestDeleteRow,
  }) => {
    const isRowInSelection =
      selectionBounds !== null &&
      rowIndex >= selectionBounds.minRow &&
      rowIndex <= selectionBounds.maxRow;

    const isFillPreviewRow =
      fillDragEndRow !== null &&
      selectionBounds !== null &&
      rowIndex > selectionBounds.maxRow &&
      rowIndex <= fillDragEndRow;

    return (
      <tr
        role="row"
        aria-rowindex={rowIndex + 1}
        className={`border-b border-slate-200 transition-colors ${
          isSelectedCheckbox
            ? "bg-blue-50/60"
            : isLastTrailingEmpty
            ? "bg-slate-50/40"
            : "bg-white hover:bg-slate-50/60"
        }`}
      >
        {/* Columna Checkbox */}
        <td className="py-1.5 px-2.5 w-10 text-center border-r border-slate-200 select-none">
          <input
            type="checkbox"
            checked={isSelectedCheckbox}
            onChange={() => onToggleSelectRow(row.id)}
            aria-label={`Seleccionar fila ${rowIndex + 1}`}
            className="w-3.5 h-3.5 rounded text-[#233762] focus:ring-0 cursor-pointer"
          />
        </td>

        {/* Columna # (Clic selecciona la fila completa) */}
        <td
          onClick={() => onSelectEntireRow(rowIndex)}
          title="Clic para seleccionar toda la fila"
          className={`py-1.5 px-2 w-11 text-center font-mono text-xs font-bold border-r border-slate-200 select-none cursor-pointer transition ${
            isRowInSelection &&
            selectionBounds &&
            selectionBounds.minCol === 0 &&
            selectionBounds.maxCol === EDITABLE_COLUMNS.length - 1
              ? "bg-[#233762] text-white"
              : "bg-slate-50/80 text-slate-600 hover:bg-[#EFF3F9] hover:text-[#233762]"
          }`}
        >
          {rowIndex + 1}
        </td>

        {/* 6 Columnas Editables (0..5) */}
        {EDITABLE_COLUMNS.map((field, colIndex) => {
          const isActive = activeCol === colIndex;
          const isEditing = editingCol === colIndex;
          const inRange =
            isRowInSelection &&
            selectionBounds !== null &&
            colIndex >= selectionBounds.minCol &&
            colIndex <= selectionBounds.maxCol;

          const inFillPreview =
            isFillPreviewRow &&
            selectionBounds !== null &&
            colIndex >= selectionBounds.minCol &&
            colIndex <= selectionBounds.maxCol;

          // Bordes externos del rango seleccionado
          const isTopEdge = inRange && selectionBounds?.minRow === rowIndex;
          const isBottomEdge = inRange && selectionBounds?.maxRow === rowIndex;
          const isLeftEdge = inRange && selectionBounds?.minCol === colIndex;
          const isRightEdge = inRange && selectionBounds?.maxCol === colIndex;

          // Mostrar Fill Handle en la esquina inferior derecha del rango o celda activa
          const showFillHandle =
            !isEditing &&
            ((selectionBounds &&
              rowIndex === selectionBounds.maxRow &&
              colIndex === selectionBounds.maxCol) ||
              (!selectionBounds && isActive));

          // Estado de validación visual por celda
          let validationClass = "";
          let tooltipText: string | undefined = undefined;
          let badgeText: string | null = null;
          let badgeStyle = "";

          if (!isLastTrailingEmpty) {
            if (field === "tracking_number") {
              if (isScientificTrk) {
                validationClass = "bg-red-100/90 text-red-900 font-bold";
                tooltipText =
                  "Excel convirtió el número a notación científica; formatea la columna como Texto y vuelve a copiar";
                badgeText = "E+11";
                badgeStyle = "bg-red-200 text-red-900 border-red-300";
              } else if (isDupTrk) {
                validationClass = "bg-red-50/90 text-red-800 font-bold";
                tooltipText = "Número de guía duplicado en la tabla";
                badgeText = "DUP";
                badgeStyle = "bg-red-100 text-red-800 border-red-200";
              } else if (isEmptyTrk) {
                validationClass = "bg-amber-50/80 text-amber-900";
                tooltipText = "Orden sin número de guía capturado";
                badgeText = "VACÍO";
                badgeStyle = "bg-amber-100 text-amber-800 border-amber-200";
              }
            } else if (field === "pick_order" && isDupPick) {
              validationClass = "bg-red-50/90 text-red-800 font-bold";
              tooltipText = "Pick Order duplicado";
              badgeText = "DUP";
              badgeStyle = "bg-red-100 text-red-800 border-red-200";
            } else if (field === "customer_order" && isDupCustomer) {
              validationClass = "bg-red-50/90 text-red-800 font-bold";
              tooltipText = "Customer Order duplicado";
              badgeText = "DUP";
              badgeStyle = "bg-red-100 text-red-800 border-red-200";
            } else if (field === "client" && isUnknownCli) {
              validationClass = "bg-amber-50/80 text-amber-900 font-bold";
              tooltipText = "Cliente distinto a BASF / KYNDRYL";
            }
          }

          const rawCellVal =
            field === "client"
              ? row.client || row.account || ""
              : (row as any)[field] ?? "";

          const isMono =
            field === "tracking_number" ||
            field === "pick_order" ||
            field === "customer_order";

          // Clases de borde de rango sin saltos de layout
          const rangeBorderClasses = [
            isTopEdge ? "border-t-2 border-t-[#233762]" : "",
            isBottomEdge ? "border-b-2 border-b-[#233762]" : "",
            isLeftEdge ? "border-l-2 border-l-[#233762]" : "",
            isRightEdge ? "border-r-2 border-r-[#233762]" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <td
              key={field}
              role="gridcell"
              aria-selected={isActive || inRange}
              data-cell={`${rowIndex}-${colIndex}`}
              title={tooltipText}
              onMouseDown={(e) => onCellMouseDown(rowIndex, colIndex, e)}
              onMouseEnter={() => onCellMouseEnter(rowIndex, colIndex)}
              onDoubleClick={() => onCellDoubleClick(rowIndex, colIndex)}
              onContextMenu={(e) => onContextMenu(rowIndex, colIndex, e)}
              className={`relative p-0 h-9 border-r border-slate-200 select-none cursor-cell align-middle ${
                isActive
                  ? "ring-2 ring-[#233762] ring-inset z-20 bg-white"
                  : inRange
                  ? `bg-[#EFF3F9] ${rangeBorderClasses}`
                  : inFillPreview
                  ? "bg-[#EFF3F9]/50 border border-dashed border-[#233762]"
                  : validationClass
              }`}
            >
              {isEditing ? (
                <ActiveCellInput
                  field={field}
                  value={editingValue}
                  onChange={onEditingValueChange}
                  onCommit={onCommitEdit}
                  onCancel={onCancelEdit}
                  onMoveAfterCommit={(dRow, dCol) =>
                    onMoveAfterCommit(rowIndex, colIndex, dRow, dCol)
                  }
                />
              ) : (
                <div
                  className={`w-full h-full px-2.5 flex items-center justify-center text-xs truncate ${
                    isMono ? "font-mono" : "font-semibold"
                  } ${
                    field === "client" && !isUnknownCli
                      ? "font-bold text-[#233762]"
                      : ""
                  }`}
                >
                  <span className="truncate">
                    {String(rawCellVal ?? "") || (
                      <span className="text-slate-300 font-normal">
                        {isLastTrailingEmpty && colIndex === 2
                          ? "Pegar (Ctrl+V) o escribir..."
                          : ""}
                      </span>
                    )}
                  </span>

                  {field === "client" && (
                    <ChevronDown className="w-3 h-3 ml-1 text-slate-400 shrink-0 opacity-60" />
                  )}

                  {badgeText && (
                    <span
                      className={`ml-1.5 text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.2 rounded border shrink-0 pointer-events-none ${badgeStyle}`}
                    >
                      {badgeText}
                    </span>
                  )}
                </div>
              )}

              {/* Fill Handle (esquina inferior derecha de la celda activa / selección) */}
              {showFillHandle && (
                <div
                  onMouseDown={onStartFillHandleDrag}
                  title="Arrastra hacia abajo para rellenar o incrementar serie"
                  className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-[#233762] border border-white cursor-crosshair z-30 shadow-2xs"
                />
              )}
            </td>
          );
        })}

        {/* Columna Eliminar Fila Individual */}
        <td className="py-1 px-2 w-10 text-center select-none">
          <button
            type="button"
            onClick={() => onRequestDeleteRow(row, rowIndex)}
            title="Eliminar esta fila"
            aria-label={`Eliminar fila ${rowIndex + 1}`}
            className="p-1 rounded-lg text-slate-400 hover:text-[#CE3A39] hover:bg-red-50 transition cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </td>
      </tr>
    );
  }
);

SheetRow.displayName = "SheetRow";

export default function TrackingGrid({
  rows,
  selectedIds,
  onToggleSelectRow,
  onToggleSelectAll,
  onRequestDeleteSingleRow,
  validationInfo,
  gridContainerRef,
  activeCell,
  selection,
  editingCell,
  editingValue,
  setEditingValue,
  fillDragEndRow,
  startEditing,
  cancelEditing,
  commitCellEdit,
  moveActiveCell,
  handleGridKeyDown,
  handleGridPaste,
  handleCellMouseDown,
  handleCellMouseEnter,
  selectEntireColumn,
  selectEntireRow,
  startFillHandleDrag,
  insertRowAt,
  duplicateRowAt,
  copySelectionToClipboard,
  onOpenPasteHelper,
}: TrackingGridProps) {
  // Menú contextual (clic derecho)
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    rowIndex: number;
    colIndex: number;
  } | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [contextMenu]);

  const selectionBounds = useMemo(() => getNormalizedBounds(selection), [selection]);

  const handleCellDoubleClick = useCallback(
    (rowIdx: number, colIdx: number) => {
      startEditing({ row: rowIdx, col: colIdx });
    },
    [startEditing]
  );

  const handleContextMenu = useCallback(
    (rowIdx: number, colIdx: number, e: React.MouseEvent) => {
      e.preventDefault();
      const coord = { row: rowIdx, col: colIdx };
      if (
        !selectionBounds ||
        rowIdx < selectionBounds.minRow ||
        rowIdx > selectionBounds.maxRow ||
        colIdx < selectionBounds.minCol ||
        colIdx > selectionBounds.maxCol
      ) {
        moveActiveCell(rowIdx, colIdx, false);
      }
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        rowIndex: coord.row,
        colIndex: coord.col,
      });
    },
    [selectionBounds, moveActiveCell]
  );

  const handleMoveAfterCommit = useCallback(
    (rowIdx: number, colIdx: number, dRow: number, dCol: number) => {
      const totalRows = Math.max(1, rows.length);
      const totalCols = EDITABLE_COLUMNS.length;
      if (dCol !== 0) {
        if (dCol > 0) {
          if (colIdx < totalCols - 1) moveActiveCell(rowIdx, colIdx + 1, false);
          else if (rowIdx < totalRows - 1) moveActiveCell(rowIdx + 1, 0, false);
        } else {
          if (colIdx > 0) moveActiveCell(rowIdx, colIdx - 1, false);
          else if (rowIdx > 0) moveActiveCell(rowIdx - 1, totalCols - 1, false);
        }
      } else if (dRow !== 0) {
        moveActiveCell(rowIdx + dRow, colIdx, false);
      }
      requestAnimationFrame(() => {
        gridContainerRef.current?.focus();
      });
    },
    [rows.length, moveActiveCell, gridContainerRef]
  );

  const nonEmptyOrderCount = useMemo(() => {
    if (rows.length === 0) return 0;
    const last = rows[rows.length - 1];
    return isRowEmptyData(last) ? Math.max(0, rows.length - 1) : rows.length;
  }, [rows]);

  return (
    <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden min-h-[480px]">
      {/* Barra superior de la hoja de cálculo + línea de ayuda */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 font-bold text-[#233762] text-xs">
            <Edit3 className="w-4 h-4" />
            <span>Órdenes del día ({nonEmptyOrderCount})</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Pega desde Excel con <kbd className="px-1 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px]">Ctrl+V</kbd> &bull; Flechas/Tab para moverte &bull; <kbd className="px-1 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px]">F2</kbd> para editar &bull; <kbd className="px-1 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px]">Ctrl+Z</kbd> para deshacer
          </p>
        </div>

        {/* Banner de conteo de validaciones en vivo (clicable para saltar al primer problema) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (validationInfo.firstIssueRowIndex !== null) {
                moveActiveCell(validationInfo.firstIssueRowIndex, 2, false);
                requestAnimationFrame(() => {
                  gridContainerRef.current?.focus();
                });
              }
            }}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
              validationInfo.emptyCount + validationInfo.duplicateCount + validationInfo.errorCount > 0
                ? "bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100 cursor-pointer"
                : "bg-emerald-50/70 border-emerald-200 text-emerald-800 cursor-default"
            }`}
            title={
              validationInfo.firstIssueRowIndex !== null
                ? "Clic para saltar a la primera fila con observación"
                : "Sin observaciones pendientes"
            }
          >
            <AlertTriangle
              className={`w-3.5 h-3.5 ${
                validationInfo.errorCount + validationInfo.duplicateCount > 0
                  ? "text-[#CE3A39]"
                  : validationInfo.emptyCount > 0
                  ? "text-amber-600"
                  : "text-emerald-600"
              }`}
            />
            <span>
              {validationInfo.emptyCount} vacío(s) &bull; {validationInfo.duplicateCount} duplicado(s) &bull;{" "}
              {validationInfo.errorCount} error(es)
            </span>
          </button>
        </div>
      </div>

      {/* Contenedor enfocable del Grid tipo Excel */}
      <div
        ref={gridContainerRef}
        role="grid"
        aria-label="Tabla tipo hoja de cálculo de órdenes del día"
        tabIndex={0}
        onKeyDown={handleGridKeyDown}
        onPaste={handleGridPaste}
        className="flex-1 overflow-x-auto overflow-y-auto max-h-[660px] focus:outline-none"
      >
        <table className="w-full text-left border-collapse text-xs table-fixed min-w-[920px]">
          <thead className="bg-[#233762] text-white sticky top-0 z-30 font-bold select-none text-[11px]">
            <tr role="row">
              <th className="py-2.5 px-2.5 w-10 text-center border-r border-white/15">
                <input
                  type="checkbox"
                  checked={selectedIds.size === rows.length && rows.length > 0}
                  onChange={onToggleSelectAll}
                  aria-label="Seleccionar todas las filas"
                  className="w-3.5 h-3.5 rounded text-[#233762] focus:ring-0 cursor-pointer"
                />
              </th>
              <th className="py-2.5 px-2 w-11 text-center border-r border-white/15">#</th>
              {EDITABLE_COLUMNS.map((field, colIdx) => {
                const widthClass =
                  field === "carrier"
                    ? "w-36"
                    : field === "client"
                    ? "w-28"
                    : field === "boxes"
                    ? "w-20"
                    : field === "customer_order"
                    ? "w-44"
                    : "";
                return (
                  <th
                    key={field}
                    onClick={() => selectEntireColumn(colIdx)}
                    title={`Clic para seleccionar toda la columna ${COLUMN_LABELS[field]}`}
                    className={`py-2.5 px-3 text-center border-r border-white/15 cursor-pointer hover:bg-[#1B2A4A] transition ${widthClass}`}
                  >
                    {COLUMN_LABELS[field]}
                  </th>
                );
              })}
              <th className="py-2.5 px-2 w-10 text-center"></th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rowIndex) => {
              const isLastTrailingEmpty =
                rowIndex === rows.length - 1 && isRowEmptyData(row);
              const trkClean = (row.tracking_number || "").trim();
              const pickClean = (row.pick_order || "").trim();
              const custClean = (row.customer_order || "").trim();

              return (
                <SheetRow
                  key={row.id}
                  row={row}
                  rowIndex={rowIndex}
                  isLastTrailingEmpty={isLastTrailingEmpty}
                  isSelectedCheckbox={selectedIds.has(row.id)}
                  activeCol={activeCell?.row === rowIndex ? activeCell.col : null}
                  editingCol={editingCell?.row === rowIndex ? editingCell.col : null}
                  editingValue={editingCell?.row === rowIndex ? editingValue : ""}
                  selectionBounds={selectionBounds}
                  fillDragEndRow={fillDragEndRow}
                  isEmptyTrk={validationInfo.emptyTrackingRowIndices.has(rowIndex)}
                  isScientificTrk={validationInfo.scientificRowIndices.has(rowIndex)}
                  isDupTrk={Boolean(trkClean && validationInfo.duplicateTrackingSet.has(trkClean))}
                  isDupPick={Boolean(
                    pickClean &&
                      !/^(KYNDRYL_|BASF_)$/i.test(pickClean) &&
                      validationInfo.duplicatePickSet.has(pickClean)
                  )}
                  isDupCustomer={Boolean(
                    custClean && validationInfo.duplicateCustomerSet.has(custClean)
                  )}
                  isUnknownCli={validationInfo.unknownClientRowIndices.has(rowIndex)}
                  onToggleSelectRow={onToggleSelectRow}
                  onSelectEntireRow={selectEntireRow}
                  onCellMouseDown={handleCellMouseDown}
                  onCellMouseEnter={handleCellMouseEnter}
                  onCellDoubleClick={handleCellDoubleClick}
                  onContextMenu={handleContextMenu}
                  onEditingValueChange={setEditingValue}
                  onCommitEdit={commitCellEdit}
                  onCancelEdit={cancelEditing}
                  onMoveAfterCommit={handleMoveAfterCommit}
                  onStartFillHandleDrag={startFillHandleDrag}
                  onRequestDeleteRow={onRequestDeleteSingleRow}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Menú Contextual (Clic Derecho) */}
      {contextMenu && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 w-56 bg-white rounded-2xl border border-slate-200 shadow-xl py-1.5 text-xs text-slate-700 animate-in fade-in duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
            Fila #{contextMenu.rowIndex + 1}
          </div>

          <button
            type="button"
            onClick={() => {
              insertRowAt(contextMenu.rowIndex, "above");
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left hover:bg-[#EFF3F9] hover:text-[#233762] flex items-center gap-2 font-medium cursor-pointer"
          >
            <ArrowUp className="w-3.5 h-3.5" />
            <span>Insertar fila arriba</span>
          </button>

          <button
            type="button"
            onClick={() => {
              insertRowAt(contextMenu.rowIndex, "below");
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left hover:bg-[#EFF3F9] hover:text-[#233762] flex items-center gap-2 font-medium cursor-pointer"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            <span>Insertar fila abajo</span>
            <span className="ml-auto text-[10px] text-slate-400 font-mono">Ctrl+Enter</span>
          </button>

          <button
            type="button"
            onClick={() => {
              duplicateRowAt(contextMenu.rowIndex);
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left hover:bg-[#EFF3F9] hover:text-[#233762] flex items-center gap-2 font-medium cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Duplicar fila</span>
          </button>

          <div className="my-1 border-t border-slate-100" />

          <button
            type="button"
            onClick={() => {
              copySelectionToClipboard();
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left hover:bg-[#EFF3F9] hover:text-[#233762] flex items-center gap-2 font-medium cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copiar</span>
            <span className="ml-auto text-[10px] text-slate-400 font-mono">Ctrl+C</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setContextMenu(null);
              onOpenPasteHelper();
            }}
            className="w-full px-3 py-1.5 text-left hover:bg-[#EFF3F9] hover:text-[#233762] flex items-center gap-2 font-medium cursor-pointer"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            <span>Pegar</span>
            <span className="ml-auto text-[10px] text-slate-400 font-mono">Ctrl+V</span>
          </button>

          <div className="my-1 border-t border-slate-100" />

          <button
            type="button"
            onClick={() => {
              const targetRow = rows[contextMenu.rowIndex];
              setContextMenu(null);
              if (targetRow) {
                onRequestDeleteSingleRow(targetRow, contextMenu.rowIndex);
              }
            }}
            className="w-full px-3 py-1.5 text-left hover:bg-red-50 text-[#CE3A39] flex items-center gap-2 font-bold cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Eliminar fila</span>
          </button>
        </div>
      )}
    </div>
  );
}
