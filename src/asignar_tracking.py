# -*- coding: utf-8 -*-
"""
asignar_tracking.py
-------------------
Script INDEPENDIENTE (no modifica generar_guias_techship.py).

Toma el reporte original del cliente (hoja "Combined Report") y los PDF de
guias (Techship/Estafeta) que estén en la misma carpeta, y genera el archivo
de "cierre" con la columna "Tracking Number" ya llena.

Uso (desde la carpeta de trabajo):
    python asignar_tracking.py
    python asignar_tracking.py --excel "reporte.xlsx" --pdf labels1.pdf labels2.pdf

Tambien se puede llamar desde otro script sin tocarlo:
    from asignar_tracking import asignar_tracking
    asignar_tracking()

Requisitos: pip install pdfplumber openpyxl
"""
import argparse
import glob
import os
import re
import sys
from copy import copy

import openpyxl
import pdfplumber
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import TableColumn

HOJA = "Combined Report"
PREFIJO_OUTBOUND = "KYNDRYL_"
CP_SEKO = "52030"

# Columnas del archivo final (en orden). None = columna nueva que no existe en el original.
COLUMNAS_SALIDA = [
    ("Parent", "Parent"),
    ("Request", "Request"),
    ("Ship", "Ship"),
    ("State", "State"),
    ("Created", "Created"),
    ("Serial Number", None),
    ("Tracking Number", None),
    ("Product Number", "Product Number"),
    ("Product Description", "Product Description"),
    ("Assignment group", "Assignment group"),
    ("Recipient first name", "Recipient first name"),
    ("Recipient last name", "Recipient last name"),
]

ANCHOS = {
    "A": 19.6, "B": 15.6, "C": 18.6, "D": 16.7, "E": 13.6, "F": 26.0,
    "G": 38.2, "H": 25.7, "I": 39.1, "J": 13.0, "K": 29.9, "L": 29.1
}

RELLENO_ERROR = PatternFill("solid", fgColor="FFC7CE")
FUENTE_ERROR = Font(color="9C0006", bold=True)


# ---------------------------------------------------------------- PDF
def leer_guias(pdf_paths):
    """Devuelve {referencia: tracking}, {referencia: confirmacion}, {referencia: cp_destino} y lista de avisos.
    referencia = lo impreso en el cuadro de la guia (= PickOrder):
        ida     -> KYNDRYL_RITM0000000
        retorno -> RITM0000000-1
    """
    guias, confirmaciones, cp_dest, avisos = {}, {}, {}, []
    for pdf_path in pdf_paths:
        if not os.path.exists(pdf_path):
            avisos.append(f"Archivo no encontrado: {pdf_path}")
            continue
        try:
            with pdfplumber.open(pdf_path) as pdf:
                for n, page in enumerate(pdf.pages, 1):
                    t = (page.extract_text() or "").replace("–", "-").replace("—", "-").replace("−", "-")
                    
                    # 1. Tracking: 10 digitos exactos tras 'CODIGO DE RASTREO:'
                    trk_m = re.search(r"CODIGO DE RASTREO:\s*(\d{10})\b", t)
                    
                    # 2. Referencia: buscar primero prefijo KYNDRYL_ (outbound),
                    # luego retorno con guion (-1, etc.), o cualquier RITM
                    ref_m = (re.search(r"\bKYNDRYL_RITM\d+\b", t) or
                             re.search(r"\bRITM\d+-\d+\b", t) or
                             re.search(r"\bRITM\d+\b", t))
                    
                    if not trk_m or not ref_m:
                        avisos.append(f"{os.path.basename(pdf_path)} pag.{n}: no se pudo leer tracking o referencia")
                        continue
                    
                    ref = ref_m.group(0).strip()
                    trk = trk_m.group(1).strip()
                    
                    if ref in guias and guias[ref] != trk:
                        avisos.append(f"Referencia repetida con distinto tracking: {ref} "
                                      f"({guias[ref]} vs {trk}); se usa el ultimo ({trk})")
                    guias[ref] = trk

                    # 3. Confirmacion: cadena tras 'CONFIRMACION' sin la palabra y sin guiones '-'
                    conf_m = re.search(r"CONFIRMACION\s*([0-9A-Za-z\-]+)", t)
                    if conf_m:
                        conf_clean = conf_m.group(1).replace("-", "").strip()
                        confirmaciones[ref] = conf_clean
                    
                    # 4. CP de destino: el ultimo 'CP:xxxxx' de la pagina
                    cps = re.findall(r"CP:\s*(\d{5})", t)
                    if cps:
                        cp_dest[ref] = cps[-1]
        except Exception as e:
            avisos.append(f"Error al leer {os.path.basename(pdf_path)}: {e}")
            
    return guias, confirmaciones, cp_dest, avisos


# ---------------------------------------------------------------- Excel
def _fila_limite(ws):
    """
    Replica exactamente la logica de find_black_line_row de generar_guias_techship.py:
    1. Busca una fila sin datos (vacia) con formato de relleno negro solido
       (start_color '00000000', 8 o 'FF000000').
    2. Si no hay linea negra, busca la primera fila completamente vacia.
    3. Si no hay ninguna fila vacia, procesa hasta ws.max_row + 1.
    """
    max_c = ws.max_column
    # Paso 1: Fila vacia con relleno negro solido
    for r in range(2, ws.max_row + 1):
        row_cells = [ws.cell(row=r, column=c) for c in range(1, max_c + 1)]
        is_empty = all(cell.value is None or str(cell.value).strip() == "" for cell in row_cells)
        if is_empty:
            first_cell_fill = ws.cell(row=r, column=1).fill
            if first_cell_fill and first_cell_fill.fill_type == "solid":
                color_val = getattr(first_cell_fill.start_color, "value", None)
                if color_val in ("00000000", 8, "FF000000"):
                    return r

    # Paso 2: Primera fila completamente vacia
    for r in range(2, ws.max_row + 1):
        row_cells = [ws.cell(row=r, column=c) for c in range(1, max_c + 1)]
        if all(cell.value is None or str(cell.value).strip() == "" for cell in row_cells):
            return r

    return ws.max_row + 1


def _es_reporte_crudo(path):
    """True si el archivo tiene la hoja 'Combined Report' con las columnas del reporte
    original del cliente (descarta el archivo ejemplo/cierre, que no trae Street/Zip)."""
    try:
        with open(path, "rb") as f:
            wb = openpyxl.load_workbook(f, read_only=True)
            if HOJA not in wb.sheetnames:
                wb.close()
                return False
            first_row = next(wb[HOJA].iter_rows(min_row=1, max_row=1))
            enc = {str(c.value).strip() for c in first_row if c.value}
            wb.close()
            return {"Parent", "Street", "Zip / Postal code"} <= enc
    except Exception:
        return False


from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parent.parent

def detectar_excel(carpeta=None):
    """Reporte original más reciente. Busca en carpeta indicada, data/input o data/samples."""
    carpetas = []
    if carpeta:
        carpetas.append(Path(carpeta))
    carpetas.extend([
        PROJECT_ROOT / "data" / "input",
        PROJECT_ROOT / "data" / "samples",
        Path.cwd()
    ])

    for c in carpetas:
        if not c.exists():
            continue
        cands = []
        for f in glob.glob(os.path.join(str(c), "*.xlsx")):
            n = os.path.basename(f)
            if n.startswith("~$") or n.startswith(("Guias ", "Guias_Techship", "Cierre_")) or n.endswith("_Tracking.xlsx"):
                continue
            if _es_reporte_crudo(f):
                cands.append(f)
        if cands:
            return max(cands, key=os.path.getmtime)
    return None


def detectar_pdfs(carpeta=None):
    """Busca PDFs de guías en carpeta indicada, data/input o data/samples."""
    carpetas = []
    if carpeta:
        carpetas.append(Path(carpeta))
    carpetas.extend([
        PROJECT_ROOT / "data" / "input",
        PROJECT_ROOT / "data" / "samples",
        Path.cwd()
    ])

    for c in carpetas:
        if not c.exists():
            continue
        pdfs = sorted(glob.glob(os.path.join(str(c), "*.pdf")), key=os.path.getmtime)
        if pdfs:
            return pdfs
    return []


def asignar_tracking(excel_path=None, pdf_paths=None, carpeta=None, output_path=None):
    carpeta = carpeta or str(PROJECT_ROOT / "data" / "input")
    excel_path = excel_path or detectar_excel(carpeta)
    
    if isinstance(pdf_paths, str):
        pdf_paths = [pdf_paths]
    elif pdf_paths is None:
        pdf_paths = detectar_pdfs(carpeta)

    if not excel_path:
        print("No encontré ningún .xlsx de reporte crudo en data/input ni data/samples.")
        return None

    print(f"Excel : {os.path.basename(excel_path)}")
    print(f"PDFs  : {[os.path.basename(p) for p in pdf_paths] if pdf_paths else 'ninguno'}")

    guias, confirmaciones, cp_dest, avisos = leer_guias(pdf_paths)

    # Cargar el libro original (usando copia temporal si Excel lo tiene bloqueado para lectura)
    try:
        wb = openpyxl.load_workbook(excel_path)
    except PermissionError:
        import shutil, tempfile
        tmp_copy = os.path.join(tempfile.gettempdir(), f"tmp_{os.path.basename(excel_path)}")
        shutil.copyfile(excel_path, tmp_copy)
        wb = openpyxl.load_workbook(tmp_copy)
        try:
            os.remove(tmp_copy)
        except Exception:
            pass

    if HOJA not in wb.sheetnames:
        print(f"ERROR: La hoja '{HOJA}' no existe en {excel_path}.")
        return None

    ws = wb[HOJA]
    
    encabezados = {}
    for c in range(1, ws.max_column + 1):
        v = ws.cell(1, c).value
        if v:
            encabezados[str(v).strip().lower()] = c

    def col_de(nombre):
        return encabezados.get(nombre.strip().lower())

    if "parent" not in encabezados:
        print(f"ERROR: Columna 'Parent' no encontrada en {excel_path}.")
        return None

    col_parent = col_de("Parent")
    col_zip = col_de("Zip / Postal code")
    col_serial = col_de("Ticket Age") or col_de("Serial Number") or 6
    col_tracking = col_de("Dispatched in 360?") or col_de("Tracking Number") or 7

    limite = _fila_limite(ws)

    usadas = set()
    sin_match = []
    cp_dudosos = []
    asignadas = 0

    for r in range(2, limite):
        parent_val = ws.cell(r, col_parent).value
        if parent_val in (None, ""):
            continue
        parent = str(parent_val).strip()

        es_retorno = parent.endswith("-1")
        ref = parent if es_retorno else PREFIJO_OUTBOUND + parent
        
        celda_serial = ws.cell(r, col_serial)
        celda_trk = ws.cell(r, col_tracking)

        celda_serial.value = None

        if ref in confirmaciones or ref in guias:
            val_confirmacion = confirmaciones.get(ref) or guias.get(ref)
            celda_trk.value = str(val_confirmacion)
            celda_trk.number_format = "@"

            usadas.add(ref)
            asignadas += 1

            if es_retorno:
                esperado = CP_SEKO
            elif col_zip:
                raw_zip = ws.cell(r, col_zip).value
                if raw_zip not in (None, ""):
                    digits = re.sub(r'[^\d]', '', str(raw_zip).split('.')[0])
                    esperado = digits[-5:].zfill(5) if digits else None
                else:
                    esperado = None
            else:
                esperado = None

            if esperado and cp_dest.get(ref) and cp_dest[ref] != esperado:
                cp_dudosos.append((parent, esperado, cp_dest[ref]))
        else:
            celda_trk.value = "ERROR: Tracking no encontrado"
            celda_trk.fill = RELLENO_ERROR
            celda_trk.font = FUENTE_ERROR
            sin_match.append(parent)

    ws.cell(1, col_serial).value = "Serial Number"
    ws.cell(1, col_tracking).value = "Tracking Number"

    if limite <= ws.max_row:
        ws.delete_rows(limite, ws.max_row - limite + 1)

    COLUMNAS_DESEADAS = [
        "parent", "request", "ship", "state", "created",
        "serial number", "tracking number", "product number", "product description",
        "assignment group", "recipient first name", "recipient last name"
    ]

    for c in range(ws.max_column, 0, -1):
        nombre_col = str(ws.cell(1, c).value or "").strip().lower()
        if nombre_col not in COLUMNAS_DESEADAS:
            ws.delete_cols(c, 1)

    ws.conditional_formatting._cf_rules.clear()

    for t in list(ws.tables.values()):
        t.ref = f"A1:{get_column_letter(ws.max_column)}{ws.max_row}"
        if t.autoFilter:
            t.autoFilter.ref = t.ref
        t.tableColumns = [TableColumn(id=i, name=str(ws.cell(1, i).value)) for i in range(1, ws.max_column + 1)]
        t.sortState = None

    ws.freeze_panes = "A2"
    ws.column_dimensions.clear()
    for col, ancho in ANCHOS.items():
        ws.column_dimensions[col].width = ancho

    import datetime
    now = datetime.date.today()
    meses_es = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ]
    nombre_salida = f"Cierre_{now.day}_{meses_es[now.month - 1]}_{now.year}.xlsx"

    if output_path:
        salida = output_path if not os.path.isdir(output_path) else os.path.join(output_path, nombre_salida)
    else:
        out_dir = PROJECT_ROOT / "data" / "output"
        out_dir.mkdir(parents=True, exist_ok=True)
        salida = str(out_dir / nombre_salida)

    try:
        wb.save(salida)
    except PermissionError:
        print(f"\n[ERROR DE PERMISO] No se pudo guardar '{os.path.basename(salida)}'.")
        print("El archivo está abierto en Microsoft Excel. Ciérralo y vuelve a ejecutar.\n")
        return None

    sobrantes = sorted(set(guias) - usadas)
    filas_procesadas = ws.max_row - 1
    print(f"\nGuardado: {os.path.basename(salida)}")
    print(f"  Ruta completa      : {salida}")
    print(f"  Filas procesadas   : {filas_procesadas}")
    print(f"  Trackings asignados: {asignadas}")
    if sin_match:
        print(f"  SIN guía ({len(sin_match)}): {', '.join(sin_match)}")
    if sobrantes:
        print(f"  Guías del PDF sin orden en el Excel ({len(sobrantes)}): {', '.join(sobrantes)}")
    for p, esp, real in cp_dudosos:
        print(f"  REVISAR CP {p}: Excel {esp} vs guía {real}")
    for a in avisos:
        print(f"  AVISO: {a}")

    return salida


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Asigna trackings de PDFs de guías al reporte.")
    ap.add_argument("--excel", "-e", help="Reporte original (por defecto busca en data/input o data/samples)")
    ap.add_argument("--pdf", "-p", nargs="*", help="PDFs de guías (por defecto busca en data/input o data/samples)")
    ap.add_argument("--output", "-o", help="Ruta o carpeta de salida del archivo de cierre")
    a = ap.parse_args()
    sys.exit(0 if asignar_tracking(a.excel, a.pdf, output_path=a.output) else 1)
