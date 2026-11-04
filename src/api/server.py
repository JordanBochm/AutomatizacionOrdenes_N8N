# -*- coding: utf-8 -*-
"""
server.py
---------
Servidor REST FastAPI para la plataforma de Automatización de Órdenes Kyndryl / KST (Seko Logistics).

Expone endpoints para:
  1. Subir reportes de ServiceNow (POST /api/batches/upload)
  2. Consultar lote activo (GET /api/batches/current)
  3. Corregir órdenes en caliente (PATCH /api/batches/order/{pick_order})
  4. Ejecutar simulación o timbrado en Techship API (POST /api/techship/process)
  5. Sincronizar trackings y generar Cierre + PDF consolidado (POST /api/techship/sync-closing)
  6. Descargar archivos operativos (GET /api/files/download/{file_type})
"""

import os
import re
import sys
import shutil
import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

# ==============================================================================
# Manejo seguro de flujos estándar (sys.stdout / sys.stderr) para evitar
# [WinError 233] (ERROR_PIPE_NOT_CONNECTED) o BrokenPipeError al ejecutarse
# en segundo plano o como proceso oculto en Windows sin consola conectada.
# ==============================================================================
class SafeStream:
    """Evita excepciones de tubería rota (BrokenPipe / WinError 233) en segundo plano."""
    def __init__(self, stream):
        self._stream = stream

    def write(self, data):
        try:
            if self._stream:
                return self._stream.write(data)
        except (OSError, BrokenPipeError):
            pass

    def flush(self):
        try:
            if self._stream:
                self._stream.flush()
        except (OSError, BrokenPipeError):
            pass

    def __getattr__(self, name):
        return getattr(self._stream, name)

if sys.stdout is not None:
    sys.stdout = SafeStream(sys.stdout)
if sys.stderr is not None:
    sys.stderr = SafeStream(sys.stderr)

import openpyxl
import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException, Query, Body, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel, Field

# Directorio raíz del proyecto
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.generar_guias import generar_guias, clean_text_encoding, format_zip_code
from src.validador_postal import (
    ValidadorPostal,
    validar_y_limpiar_telefono,
    normalizar_texto,
    formatear_direccion_inteligente,
    MAPEO_ESTADO_PLANTILLA,
)

_VALIDADOR_POSTAL_SINGLETON: Optional[ValidadorPostal] = None

def _get_validador_postal() -> ValidadorPostal:
    global _VALIDADOR_POSTAL_SINGLETON
    if _VALIDADOR_POSTAL_SINGLETON is None:
        _VALIDADOR_POSTAL_SINGLETON = ValidadorPostal()
    return _VALIDADOR_POSTAL_SINGLETON
from src.techship_client import (
    procesar_archivo_techship,
    sincronizar_tracking_desde_api,
    CLIENT_CODE_KST,
    TECHSHIP_BASE_URL,
)
from src.tracking.models import (
    BatchTrackingRequest,
    ExportTrackingRequest,
    TrackingResult,
)
from src.tracking.service import (
    SlidingWindowRateLimiter,
    TrackingService,
    build_tracking_excel_bytes,
    get_standardized_tracking_excel_filename,
    verify_tracking_auth,
)

app = FastAPI(
    title="SEKO Logistics Mexico - Kyndryl / KST Automation API",
    description="API REST para ingesta de ServiceNow, validación SEPOMEX, conexión Techship v3 y Cierre.",
    version="1.0.0",
)

# Permitir CORS para Next.js en localhost:3000 y otros clientes locales
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_INPUT = PROJECT_ROOT / "data" / "input"
DATA_OUTPUT = PROJECT_ROOT / "data" / "output"
DATA_INPUT.mkdir(parents=True, exist_ok=True)
DATA_OUTPUT.mkdir(parents=True, exist_ok=True)


# -------------------------------------------------------------
# MODELOS PYDANTIC
# -------------------------------------------------------------

class OrderPatchRequest(BaseModel):
    phone: Optional[str] = None
    address1: Optional[str] = None
    address2: Optional[str] = None
    address3: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    service_code: Optional[str] = None
    declared_value: Optional[float] = None


class DeleteOrdersRequest(BaseModel):
    order_ids: List[str]
    delete_counterparts: bool = Field(
        default=True,
        description="Si es True, elimina también la orden par (-1 o su outbound original) para que no se procese",
    )


class TechshipProcessRequest(BaseModel):
    dry_run: bool = Field(default=False, description="True para simulación segura, False para timbrado real en Estafeta")


class TechshipSyncRequest(BaseModel):
    sctask_path: Optional[str] = None


# -------------------------------------------------------------
# HELPERS DE DATOS Y ESTADO DEL LOTE
# -------------------------------------------------------------

def _encontrar_archivos_lote_activo():
    """Localiza los archivos del lote más reciente en data/output/."""
    guias_files = sorted(DATA_OUTPUT.glob("Guias_Techship_Importada_*.xlsx"), key=os.path.getmtime, reverse=True)
    if not guias_files:
        return None, None, None
        
    guias_path = guias_files[0]
    nombre = guias_path.name
    sufijo = nombre.replace("Guias_Techship_Importada_", "")
    
    audit_path = DATA_OUTPUT / f"Auditoria_Direcciones_{sufijo}"
    if not audit_path.is_file():
        audit_path = None
        
    sctask_files = sorted(DATA_INPUT.glob(f"*{sufijo}"), key=os.path.getmtime, reverse=True)
    sctask_path = sctask_files[0] if sctask_files else None
    if not sctask_path:
        # Fallback a cualquier SCTASK reciente en data/input
        cand_sctask = sorted(DATA_INPUT.glob("SCTASK_*.xlsx"), key=os.path.getmtime, reverse=True)
        if cand_sctask:
            sctask_path = cand_sctask[0]
            
    return guias_path, audit_path, sctask_path


def _sanear_telefono(val: Any) -> str:
    s = str(val or "").strip()
    if s.startswith("(") and ("True" in s or "None" in s or "False" in s):
        m = re.search(r"'(\d+)'", s)
        if m:
            s = m.group(1)
    if "." in s and not s.startswith("ERROR"):
        s = s.split(".")[0]
    return s


def _parsear_estado_lote(guias_path: Path, audit_path: Optional[Path]):
    """Lee y estructura los datos de un lote para enviarlos al frontend."""
    if not guias_path.is_file():
        return None
        
    df_orders = pd.read_excel(guias_path, sheet_name="Import Orders")
    
    # Cargar auditoría si existe
    incidencias_por_orden = {}
    estatus_resumen = {}
    if audit_path and audit_path.is_file():
        try:
            df_resumen = pd.read_excel(audit_path, sheet_name="Resumen Direcciones")
            for _, r in df_resumen.iterrows():
                ritm_raw = str(r.get("Orden (RITM)", "")).strip()
                # Limpiar [RETORNO] para machear con CustomerOrder
                ritm_clean = ritm_raw.replace(" [RETORNO]", "").strip()
                estatus = str(r.get("Estatus Dirección", "")).strip()
                estatus_resumen[ritm_clean] = estatus
        except Exception:
            pass
            
        try:
            df_inc = pd.read_excel(audit_path, sheet_name="Incidencias")
            for _, r in df_inc.iterrows():
                ritm = str(r.get("Orden (RITM)", "")).strip()
                detalle = f"[{r.get('Tipo')}] {r.get('Campo')}: {r.get('Detalle')}"
                incidencias_por_orden.setdefault(ritm, []).append(detalle)
        except Exception:
            pass

    # Cargar guías de Cierre si existe para obtener los tracking numbers timbrados
    tracking_por_orden = {}
    cierre_cand = sorted(DATA_OUTPUT.glob("Cierre_*.xlsx"), key=os.path.getmtime, reverse=True)
    if not cierre_cand:
        cierre_cand = sorted((PROJECT_ROOT / "data" / "archive").glob("**/output/Cierre_*.xlsx"), key=os.path.getmtime, reverse=True)
    if cierre_cand:
        try:
            df_cierre = pd.read_excel(cierre_cand[0])
            for _, r in df_cierre.iterrows():
                parent_val = str(r.get("Parent", "")).strip()
                trk_val = str(r.get("Tracking Number", "")).strip()
                if parent_val and trk_val and trk_val.lower() != "nan" and not trk_val.startswith("ERROR"):
                    tracking_por_orden[parent_val] = trk_val
        except Exception:
            pass

    total_orders = 0
    confirmadas_100 = 0
    revisar = 0
    error_bloqueadas = 0
    orders_list = []
    validador = _get_validador_postal()
    
    for idx, row in df_orders.iterrows():
        co = str(row.get("CustomerOrder", "")).strip()
        if not co or co.lower() == "nan":
            continue
            
        total_orders += 1
        is_return = co.endswith("-1")
        
        # Determinar dirección según Ida o Retorno
        if is_return:
            name = str(row.get("ShipFromName", "")).strip() if pd.notna(row.get("ShipFromName")) else str(row.get("ShipToName", "")).strip()
            comp = str(row.get("ShipFromCompany", "")).strip() if pd.notna(row.get("ShipFromCompany")) else name
            addr1 = str(row.get("ShipFromAddress1", "")).strip() if pd.notna(row.get("ShipFromAddress1")) else str(row.get("ShipToAddress1", "")).strip()
            addr2 = str(row.get("ShipFromAddress2", "")).strip() if pd.notna(row.get("ShipFromAddress2")) else str(row.get("ShipToAddress2", "")).strip()
            addr3_raw = row.get("ShipFromAddress3") if pd.notna(row.get("ShipFromAddress3")) else row.get("ShipToAddress3")
            addr3 = str(addr3_raw).strip() if pd.notna(addr3_raw) and str(addr3_raw).strip().lower() != "nan" else ""
            city = str(row.get("ShipFromCity", "")).strip() if pd.notna(row.get("ShipFromCity")) else str(row.get("City", "")).strip()
            state = str(row.get("ShipFromState", "")).strip() if pd.notna(row.get("ShipFromState")) else str(row.get("State", "")).strip()
            zip_val = str(row.get("ShipFromZip", "")).strip().split(".")[0].zfill(5) if pd.notna(row.get("ShipFromZip")) else str(row.get("Zip", "")).strip().split(".")[0].zfill(5)
            phone = _sanear_telefono(row.get("ShipFromPhone")) if pd.notna(row.get("ShipFromPhone")) else _sanear_telefono(row.get("ShipToPhone"))
            email = str(row.get("ShipFromEmail", "")).strip() if pd.notna(row.get("ShipFromEmail")) else str(row.get("ShipToEmail", "")).strip()
        else:
            name = str(row.get("ShipToName", "")).strip()
            comp = str(row.get("ShipToCompany", "")).strip() if pd.notna(row.get("ShipToCompany")) else name
            addr1 = str(row.get("ShipToAddress1", "")).strip()
            addr2 = str(row.get("ShipToAddress2", "")).strip() if pd.notna(row.get("ShipToAddress2")) else ""
            addr3_raw = row.get("ShipToAddress3")
            addr3 = str(addr3_raw).strip() if pd.notna(addr3_raw) and str(addr3_raw).strip().lower() != "nan" else ""
            city = str(row.get("City", "")).strip()
            state = str(row.get("State", "")).strip()
            zip_val = str(row.get("Zip", "")).strip().split(".")[0].zfill(5)
            phone = _sanear_telefono(row.get("ShipToPhone"))
            email = str(row.get("ShipToEmail", "")).strip() if pd.notna(row.get("ShipToEmail")) else ""

        if addr2.lower() == "nan":
            addr2 = ""
            
        declared_val = float(row.get("DeclaredValue", 0.0)) if pd.notna(row.get("DeclaredValue")) else 0.0
        service_code = str(row.get("SelectedServiceCode", "70")).strip().split(".")[0]
        
        # Determinar estatus del semáforo
        status_text = estatus_resumen.get(co, "VALIDADA SEPOMEX")
        has_error = False
        
        # Revisar errores explícitos en campos
        for campo_val in [phone, zip_val, addr1]:
            if "ERROR" in str(campo_val).upper():
                has_error = True
                status_text = f"ERROR: {campo_val}"
                break
                
        if "ERROR" in status_text.upper() or has_error:
            semaphore = "ROJO"
            error_bloqueadas += 1
        elif "100% CONFIRMADA" in status_text.upper():
            semaphore = "VERDE"
            confirmadas_100 += 1
        else:
            semaphore = "AMARILLO"
            revisar += 1
            
        incidents = incidencias_por_orden.get(co, [])
        if not incidents and co.endswith("-1"):
            # Traer incidencias del outbound counterpart si no hay específicas
            parent_out = co[:-2]
            incidents = incidencias_por_orden.get(parent_out, [])
            
        cp_info = validador.buscar_cp(zip_val) if zip_val and not str(zip_val).startswith("ERROR") else None
        colonias_sepomex = cp_info["colonias"] if cp_info else []

        orders_list.append({
            "order_id": co,
            "type": "RETURN" if is_return else "OUTBOUND",
            "recipient_name": name,
            "company": comp,
            "address1": addr1,
            "address2": addr2,
            "address3": addr3,
            "city": city,
            "state": state,
            "zip": zip_val,
            "phone": phone,
            "email": email,
            "declared_value": declared_val,
            "service_code": service_code,
            "status_semaphore": semaphore,
            "status_text": status_text,
            "incidents": incidents,
            "colonias_sepomex": colonias_sepomex,
            "tracking_number": tracking_por_orden.get(co),
            "carrier": "ESTAFETAREST KYNDRYL",
        })
        
    cierre_cand = sorted(DATA_OUTPUT.glob("Cierre_*.xlsx"), key=os.path.getmtime, reverse=True)
    etiquetas_cand = sorted(DATA_OUTPUT.glob("Etiquetas_*.pdf"), key=os.path.getmtime, reverse=True)

    files_available = {
        "techship_excel": guias_path.is_file(),
        "auditoria_excel": bool(audit_path and audit_path.is_file()),
        "cierre_excel": len(cierre_cand) > 0,
        "etiquetas_pdf": len(etiquetas_cand) > 0,
    }

    return {
        "batch_filename": guias_path.name,
        "batch_date": datetime.datetime.fromtimestamp(guias_path.stat().st_mtime).strftime("%d/%m/%Y %H:%M:%S"),
        "files_available": files_available,
        "metrics": {
            "total_orders": total_orders,
            "confirmed_100": confirmadas_100,
            "review": revisar,
            "error_blocked": error_bloqueadas,
        },
        "orders": orders_list,
    }


# -------------------------------------------------------------
# ENDPOINTS DE LA API
# -------------------------------------------------------------

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "SEKO Kyndryl Automation API",
        "client_code": CLIENT_CODE_KST,
        "server_time": datetime.datetime.now().isoformat(),
    }


@app.get("/api/sepomex/cp/{cp}")
def lookup_cp_sepomex(cp: str):
    """Consulta en tiempo real el catálogo SEPOMEX por Código Postal para autocompletar en UI."""
    validador = _get_validador_postal()
    cp_fmt = format_zip_code(cp)
    if str(cp_fmt).startswith("ERROR"):
        return {"existe": False, "cp": cp, "estado": "", "municipio": "", "colonias": []}
    info = validador.buscar_cp(cp_fmt)
    if not info:
        return {"existe": False, "cp": cp_fmt, "estado": "", "municipio": "", "colonias": []}
    est_norm = normalizar_texto(info["estado"])
    est_plantilla = MAPEO_ESTADO_PLANTILLA.get(est_norm, info["estado"])
    return {
        "existe": True,
        "cp": cp_fmt,
        "estado": est_plantilla,
        "estado_oficial": info["estado"],
        "municipio": info["municipios"][0] if info["municipios"] else "",
        "municipios": info["municipios"],
        "colonias": info["colonias"],
    }


@app.get("/api/batches/current")
def get_current_batch():
    """Devuelve la información y métricas del lote activo actual sin re-procesar."""
    guias_path, audit_path, _ = _encontrar_archivos_lote_activo()
    if not guias_path:
        return {"active": False, "message": "No hay ningún lote procesado actualmente."}
        
    data = _parsear_estado_lote(guias_path, audit_path)
    if not data:
        return {"active": False, "message": "No se pudieron cargar los datos del lote activo."}
        
    data["active"] = True
    return data


@app.post("/api/batches/upload")
async def upload_batch(file: UploadFile = File(...)):
    """
    Recibe el reporte Excel de ServiceNow (SCTASK_*.xlsx), ejecuta el motor
    postal SEPOMEX y genera la estructura oficial de 61 columnas con auditoría.
    """
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos de Excel (.xlsx)")
        
    input_save_path = DATA_INPUT / file.filename
    try:
        with open(input_save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"No se pudo guardar el archivo: {str(e)}")
        
    try:
        # Ejecutar generación y validación postal
        generar_guias(str(input_save_path), str(DATA_OUTPUT))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al procesar el reporte de órdenes: {str(e)}")
        
    guias_path, audit_path, _ = _encontrar_archivos_lote_activo()
    if not guias_path:
        raise HTTPException(status_code=500, detail="El archivo Techship no fue generado en data/output/")
        
    data = _parsear_estado_lote(guias_path, audit_path)
    data["active"] = True
    data["message"] = f"Lote '{file.filename}' procesado exitosamente con SEPOMEX."
    return data


@app.patch("/api/batches/order/{pick_order}")
def patch_order(pick_order: str, updates: OrderPatchRequest):
    """
    Permite corregir en caliente cualquier campo de una orden (ej. teléfono de 9 dígitos
    o colonia ambigua), re-evalúa con SEPOMEX y actualiza el archivo Excel en vivo.
    """
    guias_path, audit_path, _ = _encontrar_archivos_lote_activo()
    if not guias_path or not guias_path.is_file():
        raise HTTPException(status_code=404, detail="No hay lote activo para modificar.")
        
    wb_guias = openpyxl.load_workbook(guias_path)
    ws_guias = wb_guias["Import Orders"]
    
    # Mapear encabezados
    headers_guias = {str(ws_guias.cell(1, c).value).strip(): c for c in range(1, ws_guias.max_column + 1)}
    col_co = headers_guias.get("CustomerOrder")
    if not col_co:
        raise HTTPException(status_code=500, detail="Columna 'CustomerOrder' no encontrada en Import Orders.")
        
    # Encontrar filas afectadas (la orden específica y si es outbound, su retorno -1)
    filas_afectadas = []
    for r in range(2, ws_guias.max_row + 1):
        val = str(ws_guias.cell(r, col_co).value or "").strip()
        if val == pick_order:
            filas_afectadas.append((r, False))
        elif val == f"{pick_order}-1":
            filas_afectadas.append((r, True))
            
    if not filas_afectadas:
        raise HTTPException(status_code=404, detail=f"No se encontró la orden '{pick_order}' en el lote actual.")
        
    validador = _get_validador_postal()
    
    # Procesar teléfono si se actualizó (desempaquetando la tupla de validar_y_limpiar_telefono)
    nuevo_tel_limpio = None
    if updates.phone is not None:
        p_raw = str(updates.phone).replace("ERROR:", "").strip()
        tel_val, es_valido, _ = validar_y_limpiar_telefono(p_raw)
        if es_valido and len(tel_val) == 10:
            nuevo_tel_limpio = tel_val
        elif len(tel_val) == 10:
            nuevo_tel_limpio = tel_val
        else:
            nuevo_tel_limpio = f"ERROR: {tel_val or p_raw}"
        
    zip_fmt = format_zip_code(updates.zip) if updates.zip is not None else None

    for r, is_retorno_counterpart in filas_afectadas:
        is_ret_row = is_retorno_counterpart or pick_order.endswith("-1")
        # Actualizar teléfono
        if nuevo_tel_limpio:
            c_tel = headers_guias.get("ShipFromPhone" if is_ret_row else "ShipToPhone")
            if c_tel:
                ws_guias.cell(r, c_tel).value = str(nuevo_tel_limpio)
                    
        # Actualizar código postal
        if zip_fmt is not None:
            c_zip = headers_guias.get("ShipFromZip" if is_ret_row else "Zip")
            if c_zip:
                ws_guias.cell(r, c_zip).value = str(zip_fmt)
                    
        # Actualizar Address 1
        if updates.address1 is not None:
            c_a1 = headers_guias.get("ShipFromAddress1" if is_ret_row else "ShipToAddress1")
            if c_a1:
                ws_guias.cell(r, c_a1).value = str(updates.address1).strip()[:50]
                    
        # Actualizar Address 2 (Colonia)
        if updates.address2 is not None:
            c_a2 = headers_guias.get("ShipFromAddress2" if is_ret_row else "ShipToAddress2")
            if c_a2:
                ws_guias.cell(r, c_a2).value = str(updates.address2).strip()[:50]

        # Actualizar Address 3 (Referencias / Interior)
        if updates.address3 is not None:
            c_a3 = headers_guias.get("ShipFromAddress3" if is_ret_row else "ShipToAddress3")
            if c_a3:
                val_a3 = str(updates.address3).strip()[:50]
                ws_guias.cell(r, c_a3).value = val_a3 if val_a3 else None
                    
        # Actualizar Ciudad / Municipio
        if updates.city is not None:
            c_city = headers_guias.get("ShipFromCity" if is_ret_row else "City")
            if c_city:
                ws_guias.cell(r, c_city).value = str(updates.city).strip()
                    
        # Actualizar Estado
        if updates.state is not None:
            c_state = headers_guias.get("ShipFromState" if is_ret_row else "State")
            if c_state:
                ws_guias.cell(r, c_state).value = str(updates.state).strip()
                    
        # Actualizar Servicio (60 / 70)
        if updates.service_code is not None:
            c_srv = headers_guias.get("SelectedServiceCode")
            if c_srv:
                ws_guias.cell(r, c_srv).value = str(updates.service_code).strip()
                
        # Actualizar Valor Declarado
        if updates.declared_value is not None:
            c_val = headers_guias.get("DeclaredValue")
            if c_val:
                ws_guias.cell(r, c_val).value = float(updates.declared_value)
                
    wb_guias.save(guias_path)

    # Extraer estado final de la primera fila afectada para re-evaluar validez integral
    r_main, is_ret_main = filas_afectadas[0]
    is_ret_row_main = is_ret_main or pick_order.endswith("-1")
    final_tel = str(ws_guias.cell(r_main, headers_guias.get("ShipFromPhone" if is_ret_row_main else "ShipToPhone")).value or "").strip()
    final_zip = str(ws_guias.cell(r_main, headers_guias.get("ShipFromZip" if is_ret_row_main else "Zip")).value or "").strip().split(".")[0].zfill(5)
    final_a1 = str(ws_guias.cell(r_main, headers_guias.get("ShipFromAddress1" if is_ret_row_main else "ShipToAddress1")).value or "").strip()
    final_a2 = str(ws_guias.cell(r_main, headers_guias.get("ShipFromAddress2" if is_ret_row_main else "ShipToAddress2")).value or "").strip()
    final_a3_raw = ws_guias.cell(r_main, headers_guias.get("ShipFromAddress3" if is_ret_row_main else "ShipToAddress3")).value
    final_a3 = str(final_a3_raw).strip() if final_a3_raw is not None and str(final_a3_raw).strip().lower() != "nan" else ""
    final_city = str(ws_guias.cell(r_main, headers_guias.get("ShipFromCity" if is_ret_row_main else "City")).value or "").strip()
    final_state = str(ws_guias.cell(r_main, headers_guias.get("ShipFromState" if is_ret_row_main else "State")).value or "").strip()

    has_any_error = any("ERROR" in v.upper() for v in [final_tel, final_zip, final_a1] if v)
    cp_info_final = validador.buscar_cp(final_zip) if not has_any_error else None
    orden_limpia = (not has_any_error) and bool(cp_info_final or (len(final_zip) == 5 and final_zip.isdigit()))

    # También actualizar el resumen de auditoría e incidencias si está disponible
    if audit_path and audit_path.is_file():
        try:
            wb_audit = openpyxl.load_workbook(audit_path)
            base_ritm = pick_order[:-2] if pick_order.endswith("-1") else pick_order
            if "Resumen Direcciones" in wb_audit.sheetnames:
                ws_res = wb_audit["Resumen Direcciones"]
                headers_res = {str(ws_res.cell(1, c).value or "").strip(): c for c in range(1, ws_res.max_column + 1)}
                for r in range(2, ws_res.max_row + 1):
                    val = str(ws_res.cell(r, 1).value or "").strip()
                    val_clean = val.replace(" [RETORNO]", "").strip()
                    if val_clean in (pick_order, base_ritm, f"{base_ritm}-1"):
                        if "Address 1 (Calle y Num)" in headers_res:
                            ws_res.cell(r, headers_res["Address 1 (Calle y Num)"]).value = final_a1
                        if "Address 2 (Colonia)" in headers_res:
                            ws_res.cell(r, headers_res["Address 2 (Colonia)"]).value = final_a2
                        if "Address 3 (Referencias / Int)" in headers_res:
                            ws_res.cell(r, headers_res["Address 3 (Referencias / Int)"]).value = final_a3
                        if "Ciudad / Municipio" in headers_res:
                            ws_res.cell(r, headers_res["Ciudad / Municipio"]).value = final_city
                        if "Estado" in headers_res:
                            ws_res.cell(r, headers_res["Estado"]).value = final_state
                        if "Código Postal" in headers_res:
                            ws_res.cell(r, headers_res["Código Postal"]).value = final_zip
                        if "Teléfono (10d)" in headers_res:
                            ws_res.cell(r, headers_res["Teléfono (10d)"]).value = final_tel
                        if orden_limpia:
                            if "Estatus Dirección" in headers_res:
                                ws_res.cell(r, headers_res["Estatus Dirección"]).value = "100% CONFIRMADA (Corregida Manualmente)"
                            if "Verificación Mapa" in headers_res:
                                ws_res.cell(r, headers_res["Verificación Mapa"]).value = "Validada y corregida manualmente en Dashboard Operativo"

            if orden_limpia and "Incidencias" in wb_audit.sheetnames:
                ws_inc = wb_audit["Incidencias"]
                for r in range(2, ws_inc.max_row + 1):
                    inc_ritm = str(ws_inc.cell(r, 2).value or "").strip()
                    inc_tipo = str(ws_inc.cell(r, 3).value or "").strip()
                    if inc_ritm in (pick_order, base_ritm, f"{base_ritm}-1") and inc_tipo in ("ERROR", "REVISAR"):
                        ws_inc.cell(r, 3).value = "CORREGIDO"
                        ws_inc.cell(r, 6).value = f"[Resuelta en Dashboard] {ws_inc.cell(r, 6).value or ''}"

            wb_audit.save(audit_path)
        except Exception as e:
            print(f"[AVISO] No se pudo actualizar el archivo de auditoría: {e}")
            
    # Devolver lote actualizado
    estado_lote = _parsear_estado_lote(guias_path, audit_path)
    return {
        "success": True,
        "message": f"Orden '{pick_order}' actualizada correctamente.",
        "batch": estado_lote,
    }


@app.post("/api/batches/delete-orders")
def delete_orders(req: DeleteOrdersRequest):
    """
    Elimina una o más órdenes del lote activo en 'Guias_Techship_Importada_*.xlsx'
    y del reporte de auditoría 'Auditoria_Direcciones_*.xlsx' para que NO sean procesadas en Techship.
    """
    guias_path, audit_path, _ = _encontrar_archivos_lote_activo()
    if not guias_path or not guias_path.is_file():
        raise HTTPException(status_code=404, detail="No hay lote activo para modificar.")

    if not req.order_ids:
        raise HTTPException(status_code=400, detail="Debe especificar al menos una orden para eliminar.")

    target_ids = set(str(o).strip() for o in req.order_ids if str(o).strip())
    if req.delete_counterparts:
        extras = set()
        for oid in target_ids:
            if oid.endswith("-1"):
                extras.add(oid[:-2])
            else:
                extras.add(f"{oid}-1")
        target_ids.update(extras)

    wb_guias = openpyxl.load_workbook(guias_path)
    ws_guias = wb_guias["Import Orders"]

    headers_guias = {str(ws_guias.cell(1, c).value).strip(): c for c in range(1, ws_guias.max_column + 1)}
    col_co = headers_guias.get("CustomerOrder")
    if not col_co:
        raise HTTPException(status_code=500, detail="Columna 'CustomerOrder' no encontrada en Import Orders.")

    deleted_count = 0
    for r in range(ws_guias.max_row, 1, -1):
        val = str(ws_guias.cell(r, col_co).value or "").strip()
        if val in target_ids:
            ws_guias.delete_rows(r, 1)
            deleted_count += 1

    wb_guias.save(guias_path)

    # También actualizar archivo de auditoría si existe
    if audit_path and audit_path.is_file():
        try:
            wb_audit = openpyxl.load_workbook(audit_path)
            if "Resumen Direcciones" in wb_audit.sheetnames:
                ws_res = wb_audit["Resumen Direcciones"]
                for r in range(ws_res.max_row, 1, -1):
                    val = str(ws_res.cell(r, 1).value or "").strip()
                    if val in target_ids:
                        ws_res.delete_rows(r, 1)
            if "Incidencias" in wb_audit.sheetnames:
                ws_inc = wb_audit["Incidencias"]
                for r in range(ws_inc.max_row, 1, -1):
                    val = str(ws_inc.cell(r, 2).value or "").strip()
                    if val in target_ids:
                        ws_inc.delete_rows(r, 1)
            wb_audit.save(audit_path)
        except Exception as e:
            print(f"[AVISO] No se pudo actualizar el archivo de auditoría al eliminar órdenes: {e}")

    estado_lote = _parsear_estado_lote(guias_path, audit_path)
    return {
        "success": True,
        "deleted_count": deleted_count,
        "message": f"Se eliminaron {deleted_count} fila(s) del lote correctamente.",
        "batch": estado_lote,
    }


@app.delete("/api/batches/order/{order_id}")
def delete_single_order(order_id: str, delete_counterpart: bool = Query(default=True)):
    """Elimina una orden individual y opcionalmente su par de retorno."""
    return delete_orders(DeleteOrdersRequest(order_ids=[order_id], delete_counterparts=delete_counterpart))


@app.post("/api/techship/process")
def process_techship(req: TechshipProcessRequest):
    """
    Ejecuta el procesamiento en Techship API v3:
      - dry_run=True: Simulación segura (valida payloads y duplicados sin timbrar cobro)
      - dry_run=False: Timbrado oficial real con Estafeta
    """
    guias_path, audit_path, _ = _encontrar_archivos_lote_activo()
    if not guias_path or not guias_path.is_file():
        raise HTTPException(status_code=404, detail="No hay lote activo para procesar en Techship.")
        
    try:
        res = procesar_archivo_techship(
            str(guias_path),
            dry_run=req.dry_run,
            audit_path=str(audit_path) if audit_path else None,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error durante el procesamiento con Techship: {str(e)}")
        
    return {
        "dry_run": req.dry_run,
        "summary": {
            "total": res.get("total", 0),
            "ready": res.get("listas", 0),
            "duplicates": res.get("duplicados", 0),
            "blocked": res.get("bloqueadas", 0),
            "success": res.get("exitos", 0),
            "errors": res.get("fallos", 0),
        },
        "details": res.get("detalles", []),
    }


@app.post("/api/techship/sync-closing")
def sync_closing(req: TechshipSyncRequest = Body(default_factory=TechshipSyncRequest)):
    """
    Sincroniza los trackings de Techship API y genera:
      - Cierre_DD_Mes_AAAA.xlsx (12 columnas oficiales de ServiceNow)
      - Etiquetas_Lote_DD_Mes_AAAA.pdf (consolidado en pares consecutivos)
    """
    guias_path, _, sctask_path = _encontrar_archivos_lote_activo()
    
    target_sctask = req.sctask_path if req.sctask_path else (str(sctask_path) if sctask_path else None)
    if not target_sctask or not os.path.isfile(target_sctask):
        raise HTTPException(
            status_code=400,
            detail="No se encontró el reporte SCTASK original para sincronizar el cierre. Sube el archivo primero."
        )
        
    try:
        ruta_cierre = sincronizar_tracking_desde_api(
            sctask_path=target_sctask,
            output_path=str(DATA_OUTPUT),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al sincronizar con Techship: {str(e)}")
        
    # Detectar el PDF generado
    now = datetime.date.today()
    meses_es = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ]
    pdf_path = DATA_OUTPUT / f"Etiquetas_Lote_{now.day}_{meses_es[now.month - 1]}_{now.year}.pdf"
    if not pdf_path.is_file():
        # Fallback si se generó con sufijo _API
        pdf_path = DATA_OUTPUT / f"Etiquetas_Lote_{now.day}_{meses_es[now.month - 1]}_{now.year}_API.pdf"
        
    return {
        "success": True,
        "cierre_excel_path": str(ruta_cierre),
        "cierre_excel_filename": os.path.basename(ruta_cierre),
        "etiquetas_pdf_path": str(pdf_path) if pdf_path.is_file() else None,
        "etiquetas_pdf_filename": pdf_path.name if pdf_path.is_file() else None,
        "message": "Cierre y PDF de etiquetas sincronizados correctamente desde Techship.",
    }


@app.get("/api/techship/tracking")
def get_techship_tracking():
    """
    Devuelve la lista de números de guía y carrier asociados a las órdenes del lote actual
    o del Cierre más reciente generado.
    """
    guias_path, _, _ = _encontrar_archivos_lote_activo()
    tracking_map = {}
    
    # 1. Buscar en Cierre_*.xlsx en output o archive
    cierre_cand = sorted(DATA_OUTPUT.glob("Cierre_*.xlsx"), key=os.path.getmtime, reverse=True)
    if not cierre_cand:
        cierre_cand = sorted((PROJECT_ROOT / "data" / "archive").glob("**/output/Cierre_*.xlsx"), key=os.path.getmtime, reverse=True)
    if cierre_cand:
        try:
            df_c = pd.read_excel(cierre_cand[0])
            for _, r in df_c.iterrows():
                p = str(r.get("Parent", "")).strip()
                t = str(r.get("Tracking Number", "")).strip()
                if p and t and t.lower() != "nan" and not t.startswith("ERROR"):
                    tracking_map[p] = t
        except Exception:
            pass

    # Si hay lote activo, devolver todas las órdenes del lote con su tracking
    result = []
    if guias_path and guias_path.is_file():
        try:
            df_guias = pd.read_excel(guias_path, sheet_name="Import Orders")
            for _, r in df_guias.iterrows():
                co = str(r.get("CustomerOrder", "")).strip()
                if co and co.lower() != "nan":
                    result.append({
                        "order_id": co,
                        "tracking_number": tracking_map.get(co, ""),
                        "carrier": "ESTAFETAREST KYNDRYL",
                    })
        except Exception:
            pass
            
    if not result and tracking_map:
        for p, t in tracking_map.items():
            result.append({
                "order_id": p,
                "tracking_number": t,
                "carrier": "ESTAFETAREST KYNDRYL",
            })
            
    return result


@app.get("/api/files/download/{file_type}")
def download_file(file_type: str):
    """
    Descarga archivos operativos generados:
      - techship_excel: Guias_Techship_Importada_*.xlsx
      - auditoria_excel: Auditoria_Direcciones_*.xlsx
      - cierre_excel: Cierre_DD_Mes_AAAA.xlsx
      - etiquetas_pdf: Etiquetas_Lote_DD_Mes_AAAA.pdf
    """
    guias_path, audit_path, _ = _encontrar_archivos_lote_activo()
    now = datetime.date.today()
    meses_es = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ]
    
    file_map = {
        "techship_excel": guias_path,
        "auditoria_excel": audit_path,
        "cierre_excel": DATA_OUTPUT / f"Cierre_{now.day}_{meses_es[now.month - 1]}_{now.year}.xlsx",
        "etiquetas_pdf": DATA_OUTPUT / f"Etiquetas_Lote_{now.day}_{meses_es[now.month - 1]}_{now.year}.pdf",
    }
    
    target_file = file_map.get(file_type.lower())
    if not target_file or not target_file.is_file():
        # Buscar variantes
        if file_type == "cierre_excel":
            cand = sorted(DATA_OUTPUT.glob("Cierre_*.xlsx"), key=os.path.getmtime, reverse=True)
            if cand:
                target_file = cand[0]
        elif file_type == "etiquetas_pdf":
            cand = sorted(DATA_OUTPUT.glob("Etiquetas_*.pdf"), key=os.path.getmtime, reverse=True)
            if cand:
                target_file = cand[0]
                
    if not target_file or not target_file.is_file():
        raise HTTPException(
            status_code=404,
            detail=f"El archivo solicitado '{file_type}' aún no ha sido generado."
        )
        
    media_type = "application/pdf" if target_file.suffix == ".pdf" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return FileResponse(
        path=str(target_file),
        filename=target_file.name,
        media_type=media_type,
    )


# -------------------------------------------------------------
# ARCHIVADO DE LOTES DE DÍAS ANTERIORES
# -------------------------------------------------------------

DATA_ARCHIVE = PROJECT_ROOT / "data" / "archive"

_MESES_ES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}


class ArchiveRequest(BaseModel):
    dry_run: bool = Field(default=False, description="True = solo vista previa, no mueve nada")
    clean_all: bool = Field(
        default=True,
        description="True = limpia y archiva también el lote activo en pantalla para dejar la tabla en 0 órdenes"
    )


def _fecha_de_archivo(path: Path) -> datetime.date:
    """
    Deduce la fecha operativa de un archivo:
      1. Por nombre MX_MM-DD-YY  (SCTASK, Guias_Techship, Auditoria)
      2. Por nombre DD_Mes_AAAA  (Cierre, Etiquetas_Lote)
      3. Si no coincide ningún patrón, por fecha de modificación.
    """
    nombre = path.stem
    m = re.search(r"(\d{2})-(\d{2})-(\d{2})", nombre)
    if m:
        try:
            return datetime.date(2000 + int(m.group(3)), int(m.group(1)), int(m.group(2)))
        except ValueError:
            pass
    m = re.search(r"(\d{1,2})_([A-Za-z]+)_(\d{4})", nombre)
    if m and m.group(2).lower() in _MESES_ES:
        try:
            return datetime.date(int(m.group(3)), _MESES_ES[m.group(2).lower()], int(m.group(1)))
        except ValueError:
            pass
    return datetime.date.fromtimestamp(path.stat().st_mtime)


@app.post("/api/batches/archive-previous")
def archive_previous(req: ArchiveRequest = Body(default_factory=ArchiveRequest)):
    """
    Mueve (NO borra) los archivos de data/input y data/output a data/archive/AAAA-MM-DD/{input|output}/.
    Si clean_all=True (por defecto), archiva también el lote activo actual para que la tabla quede 100% vacía
    y lista para ingestar un nuevo reporte de ServiceNow.
    """
    hoy = datetime.date.today()
    movidos, omitidos = [], []

    for carpeta, etiqueta in ((DATA_INPUT, "input"), (DATA_OUTPUT, "output")):
        for f in sorted(carpeta.iterdir()):
            if not f.is_file() or f.name.startswith(".") or f.name.startswith("~$"):
                continue
            fecha = _fecha_de_archivo(f)
            
            # Si NO es clean_all, solo mover los de días anteriores
            if not req.clean_all and fecha >= hoy:
                continue

            destino_dir = DATA_ARCHIVE / fecha.isoformat() / etiqueta
            destino = destino_dir / f.name
            item = {"file": f.name, "folder": etiqueta, "date": fecha.isoformat()}

            if req.dry_run:
                movidos.append(item)
                continue
            try:
                destino_dir.mkdir(parents=True, exist_ok=True)
                if destino.exists():
                    destino = destino_dir / f"{f.stem}_{datetime.datetime.now():%H%M%S}{f.suffix}"
                shutil.move(str(f), str(destino))
                movidos.append(item)
            except PermissionError:
                omitidos.append({**item, "reason": "Archivo abierto en Excel u otro programa"})
            except Exception as e:
                omitidos.append({**item, "reason": str(e)})

    return {
        "dry_run": req.dry_run,
        "clean_all": req.clean_all,
        "today": hoy.isoformat(),
        "archive_path": str(DATA_ARCHIVE),
        "moved_count": len(movidos),
        "moved": movidos,
        "skipped": omitidos,
    }


# -------------------------------------------------------------
# 7. MÓDULO DE RASTREO DE ENVÍOS MULTI-CARRIER (FEDEX Y ESTAFETA)
# -------------------------------------------------------------

tracking_service = TrackingService()
tracking_rate_limiter = SlidingWindowRateLimiter(max_requests=120, window_seconds=60)


@app.get("/api/tracking/config-status")
async def get_tracking_config_status(
    auth_ctx: Dict[str, Optional[str]] = Depends(verify_tracking_auth),
):
    """
    Informa al frontend si las credenciales de FedEx y Estafeta están configuradas
    en el backend (.env) y el estado de la caché, sin exponer ninguna llave sensible.
    """
    fedex_adapter = tracking_service.adapters.get("FEDEX")
    estafeta_adapter = tracking_service.adapters.get("ESTAFETA")
    return {
        "carriers": {
            "FEDEX": {
                "configured": bool(fedex_adapter and fedex_adapter.is_configured()),
            },
            "ESTAFETA": {
                "configured": bool(estafeta_adapter and estafeta_adapter.is_configured()),
            },
        },
        "mock_fallback_enabled": tracking_service.mock_fallback,
        "cache": tracking_service.cache.stats(),
    }


@app.post("/api/tracking/batch")
async def track_shipments_batch(
    req: BatchTrackingRequest,
    auth_ctx: Dict[str, Optional[str]] = Depends(verify_tracking_auth),
):
    """
    Rastrea un lote de hasta 50 guías de forma asíncrona y concurrente (FedEx / Estafeta).
    Autodetecta el carrier por formato de guía si `carrier` no se especifica.
    """
    tracking_rate_limiter.check(auth_ctx.get("ip") or "127.0.0.1")
    results = await tracking_service.track_batch(
        guias=req.guias,
        carrier=req.carrier,
        force_refresh=req.force_refresh,
    )
    return {
        "total": len(results),
        "results": results,
    }


@app.post("/api/tracking/export-excel")
async def export_tracking_excel(
    req: ExportTrackingRequest,
    auth_ctx: Dict[str, Optional[str]] = Depends(verify_tracking_auth),
):
    """
    Genera y descarga un archivo Excel (.xlsx) con el diseño institucional de
    SupplyChain México (#233762 / #CE3A39) a partir de los resultados de rastreo.
    """
    excel_bytes = build_tracking_excel_bytes(req.resultados)
    filename = get_standardized_tracking_excel_filename()
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@app.get("/api/tracking/{guia}", response_model=TrackingResult)
async def track_single_shipment(
    guia: str,
    carrier: Optional[str] = Query(
        default=None,
        description="Carrier opcional (FEDEX o ESTAFETA). Si se omite, se autodetecta por formato.",
    ),
    force_refresh: bool = Query(
        default=False,
        description="Si es True, ignora la caché de 10 minutos y consulta directamente al carrier.",
    ),
    auth_ctx: Dict[str, Optional[str]] = Depends(verify_tracking_auth),
):
    """
    Rastrea una guía individual en FedEx o Estafeta y devuelve la respuesta normalizada.
    """
    tracking_rate_limiter.check(auth_ctx.get("ip") or "127.0.0.1")
    result = await tracking_service.track_single(
        raw_guia=guia,
        carrier=carrier,
        force_refresh=force_refresh,
    )
    return result


# -------------------------------------------------------------
# MÓDULO DE CONSULTA DE GARANTÍAS (LENOVO / DELL)
# -------------------------------------------------------------
WARRANTY_CACHE_FILE = Path("data/cache/warranties.json")

def load_warranty_cache() -> Dict[str, Any]:
    if WARRANTY_CACHE_FILE.exists():
        try:
            import json
            with open(WARRANTY_CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

@app.get("/api/warranty/{serial_number}")
async def get_warranty_status(
    serial_number: str,
    modelo: Optional[str] = Query(default=None),
    force_refresh: bool = Query(default=False)
):
    clean = serial_number.strip().upper().replace(" ", "")
    cache = load_warranty_cache()
    if not force_refresh and clean in cache:
        return cache[clean]

    return cache.get(clean, {
        "serialNumber": clean,
        "vigente": False,
        "estado": "DESCONOCIDO",
        "proveedor": "LENOVO" if clean.startswith(("PF", "PC", "MP")) else "OTRO",
        "fechaFin": None,
        "consultadoEn": datetime.datetime.now(datetime.timezone.utc).isoformat()
    })


# -------------------------------------------------------------
# EJECUCIÓN DIRECTA CON UVICORN
# -------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    print(f"Iniciando servidor API en http://localhost:8000 ...")
    uvicorn.run("src.api.server:app", host="0.0.0.0", port=8000, reload=True)
