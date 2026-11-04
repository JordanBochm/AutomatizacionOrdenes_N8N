import json
import os
import re
from datetime import datetime
import openpyxl

EXCEL_PATH = "Devoluciones KST 040326.xlsx"
DATA_DIR = os.path.join("data", "reportes")
DB_FILE = os.path.join(DATA_DIR, "reportes_db.json")
CARGAS_FILE = os.path.join(DATA_DIR, "cargas.json")

HARDWARE_ALIAS_MAP = {
    "20S1SFJH0Q": "Lenovo ThinkPad T14 Gen 1",
    "20S0": "Lenovo ThinkPad T14 Gen 1",
    "20UD": "Lenovo ThinkPad T14 Gen 1 AMD",
    "20W0": "Lenovo ThinkPad T14 Gen 2",
    "21AH": "Lenovo ThinkPad T14 Gen 3",
    "21CH": "Lenovo ThinkPad T14 Gen 3 AMD",
    "21HD": "Lenovo ThinkPad T14 Gen 4",
    "A2337": "MacBook Air M1 (A2337)",
    "A2338": "MacBook Pro M1 (A2338)",
    "LATITUDE 5420": "Dell Latitude 5420",
    "LATITUDE 5430": "Dell Latitude 5430",
}

RITM_REGEX = re.compile(r"^RITM\d+(-\d+)?$", re.IGNORECASE)

MESES_MAP = {
    "enero": "01", "febrero": "02", "marzo": "03", "abril": "04",
    "mayo": "05", "junio": "06", "julio": "07", "agosto": "08",
    "septiembre": "09", "octubre": "10", "noviembre": "11", "diciembre": "12"
}

INVALID_STOCK_VALUES = {"", "N/A", "NA", "NO", "PENDIENTE", "SIN ENTRADA", "-"}

def normalize_modelo(desc_raw):
    if not desc_raw:
        return "Sin descripción"
    desc_str = str(desc_raw).strip()
    upper = desc_str.upper()
    for key, val in HARDWARE_ALIAS_MAP.items():
        if key.upper() in upper:
            return val
    return desc_str

def resolve_estatus(substate_raw, entry_into_stock_raw):
    sub = str(substate_raw or "").strip().lower()
    stock = str(entry_into_stock_raw or "").strip().upper()

    if sub in ("pending evaluation", "pedning evaluation"):
        return "En evaluación", "EVALUACION"
    if sub in ("pending disposal", "pedning disposal"):
        return "Pendiente de baja", "BAJA"
    has_valid_stock = len(stock) > 0 and stock not in INVALID_STOCK_VALUES
    if sub == "available" or has_valid_stock:
        return "In Stock / Cerrado", "IN_STOCK"
    return "Sin clasificar", "SIN_CLASIFICAR"

def parse_flexible_date(raw, fallback_year=2026):
    if raw is None:
        return None, False
    if isinstance(raw, datetime):
        return raw.strftime("%Y-%m-%d"), True
    s = str(raw).strip()
    if not s or s.lower() in ("n/a", "-"):
        return None, False
    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        return s[:10], True
    dmy = re.match(r"^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$", s)
    if dmy:
        d = dmy.group(1).zfill(2)
        m = dmy.group(2).zfill(2)
        y = dmy.group(3)
        if len(y) == 2:
            y = f"20{y}"
        return f"{y}-{m}-{d}", True
    dm = re.match(r"^(\d{1,2})[\/\-](\d{1,2})$", s)
    if dm:
        d = dm.group(1).zfill(2)
        m = dm.group(2).zfill(2)
        return f"{fallback_year}-{m}-{d}", True
    es_match = re.match(r"^(\d{1,2})\s+de\s+([a-zA-Z]+)(?:\s+(?:de\s+)?(\d{4}))?", s)
    if es_match:
        d = es_match.group(1).zfill(2)
        mes_nom = es_match.group(2).lower()
        m = MESES_MAP.get(mes_nom)
        y = es_match.group(3) if es_match.group(3) else str(fallback_year)
        if m:
            return f"{y}-{m}-{d}", True
    return None, False

def run_seed():
    os.makedirs(DATA_DIR, exist_ok=True)
    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    sheet = wb["Hoja1"]
    
    headers = [str(cell.value or "").strip() for cell in sheet[1]]
    header_idx = {h: i for i, h in enumerate(headers) if h}

    raw_rows = []
    for row in sheet.iter_rows(min_row=2, values_only=True):
        if not any(row):
            continue
        row_dict = {}
        for h, i in header_idx.items():
            row_dict[h] = row[i] if i < len(row) else None
        raw_rows.append(row_dict)

    print(f"Total filas leídas del Excel (excluyendo encabezado): {len(raw_rows)}")

    serial_counts = {}
    for r in raw_rows:
        s = str(r.get("Serial Number") or "").strip().upper().replace(" ", "")
        if s:
            serial_counts[s] = serial_counts.get(s, 0) + 1

    carga_id = "CARGA_INICIAL_KST_040326"
    records = []

    conteo_estatus = {
        "En evaluación": 0,
        "Pendiente de baja": 0,
        "In Stock / Cerrado": 0,
        "Sin clasificar": 0,
    }

    advertencias_calidad = {
        "serialesVacios": 0,
        "serialesDuplicados": 0,
        "ritmInvalidos": 0,
        "sinTracking": 0,
        "sinClasificar": 0,
    }

    for idx, row in enumerate(raw_rows, 1):
        no_dev_raw = str(row.get("No. devolución") or row.get("No. devolucion") or "").strip()
        serial_raw = str(row.get("Serial Number") or "").strip()
        desc_raw = str(row.get("Descripción") or row.get("Descripcion") or "").strip()
        track_raw = str(row.get("Tracking #") or "").strip()
        ritm_raw = str(row.get("Number") or "").strip()
        comentarios_raw = str(row.get("Comentarios") or "").strip()
        fecha_ingreso_raw = str(row.get("Fecha de ingreso a sistema") or "").strip()
        substate_raw = str(row.get("Substate") or "").strip()
        snow_raw = str(row.get("Entry at SNOW") or "").strip()
        stock_raw = str(row.get("Entry into Stock") or "").strip()

        clean_serial = serial_raw.upper().replace(" ", "")
        clean_track = track_raw.upper().replace(" ", "")
        clean_no_dev = no_dev_raw.replace(" ", "")

        warnings = []
        if not clean_serial:
            warnings.append("Serial Number vacío")
            advertencias_calidad["serialesVacios"] += 1

        is_dup = bool(clean_serial and serial_counts.get(clean_serial, 0) > 1)
        if is_dup:
            advertencias_calidad["serialesDuplicados"] += 1

        if not clean_track:
            warnings.append("Tracking vacío")
            advertencias_calidad["sinTracking"] += 1

        ritm_valido = bool(ritm_raw and RITM_REGEX.match(ritm_raw))
        if not ritm_raw:
            warnings.append("Ticket RITM vacío")
            advertencias_calidad["ritmInvalidos"] += 1
        elif not ritm_valido:
            warnings.append(f"RITM mal capturado: {ritm_raw}")
            advertencias_calidad["ritmInvalidos"] += 1

        estatus, estatus_key = resolve_estatus(substate_raw, stock_raw)
        conteo_estatus[estatus] += 1
        if estatus == "Sin clasificar":
            advertencias_calidad["sinClasificar"] += 1

        parsed_snow, _ = parse_flexible_date(row.get("Entry at SNOW"))
        parsed_stock, _ = parse_flexible_date(row.get("Entry into Stock"))
        parsed_substate, _ = parse_flexible_date(row.get("Substate"))
        parsed_ingreso, _ = parse_flexible_date(row.get("Fecha de ingreso a sistema"))

        is_complete = bool(clean_no_dev and clean_serial and ritm_raw)
        rec_id = f"{clean_no_dev}_{clean_serial}_{ritm_raw}" if is_complete else f"{clean_no_dev or 'NODEV'}_{clean_serial or 'NOSERIAL'}_{ritm_raw or 'NORITM'}_row{idx}"

        record = {
            "id": rec_id,
            "noDevolucion": clean_no_dev,
            "noDevolucionRaw": no_dev_raw,
            "serialNumber": clean_serial,
            "serialNumberRaw": serial_raw,
            "serialDuplicado": is_dup,
            "descripcion": desc_raw,
            "descripcionRaw": desc_raw,
            "modelo": normalize_modelo(desc_raw),
            "trackingNumber": clean_track,
            "trackingNumberRaw": track_raw,
            "sinTracking": clean_track == "",
            "ritm": ritm_raw,
            "ritmRaw": ritm_raw,
            "ritmValido": ritm_valido,
            "comentarios": comentarios_raw,
            "comentariosNorm": comentarios_raw.lower(),
            "fechaIngresoSistema": parsed_ingreso,
            "fechaIngresoSistemaRaw": fecha_ingreso_raw,
            "substate": substate_raw,
            "substateRaw": substate_raw,
            "estatus": estatus,
            "estatusKey": estatus_key,
            "substateFecha": parsed_substate,
            "entryAtSnow": parsed_snow,
            "entryAtSnowRaw": snow_raw,
            "entryIntoStock": parsed_stock,
            "entryIntoStockRaw": stock_raw,
            "conciliadoSnow": parsed_snow is not None or (len(snow_raw) > 0 and snow_raw.upper() != "N/A"),
            "calidadAdvertencias": warnings,
            "cargaId": carga_id,
            "createdAt": datetime.utcnow().isoformat() + "Z",
            "updatedAt": datetime.utcnow().isoformat() + "Z",
        }
        records.append(record)

    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)

    carga_info = [{
        "id": carga_id,
        "archivo": EXCEL_PATH,
        "fecha": datetime.utcnow().isoformat() + "Z",
        "usuario": "Sistema (Script Ingesta)",
        "filasLeidas": len(raw_rows),
        "filasInsertadas": len(records),
        "filasActualizadas": 0,
        "filasRechazadas": 0,
        "advertenciasCalidad": advertencias_calidad,
        "conteoEstatus": conteo_estatus,
    }]

    with open(CARGAS_FILE, "w", encoding="utf-8") as f:
        json.dump(carga_info, f, indent=2, ensure_ascii=False)

    print("\n=== RESUMEN DE INGESTA DEVOLUCIONES ===")
    print(f"Total registros guardados: {len(records)}")
    print(f"Conteo por Estatus:")
    for k, v in conteo_estatus.items():
        print(f"  - {k}: {v}")
    print(f"\nAdvertencias de Calidad:")
    for k, v in advertencias_calidad.items():
        print(f"  - {k}: {v}")

if __name__ == "__main__":
    run_seed()
