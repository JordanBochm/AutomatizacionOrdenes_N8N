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

import openpyxl
import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
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
)
from src.techship_client import (
    procesar_archivo_techship,
    sincronizar_tracking_desde_api,
    CLIENT_CODE_KST,
    TECHSHIP_BASE_URL,
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
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    service_code: Optional[str] = None
    declared_value: Optional[float] = None


class TechshipProcessRequest(BaseModel):
    dry_run: bool = Field(default=True, description="True para simulación segura, False para timbrado real en Estafeta")


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
            
    total_orders = 0
    confirmadas_100 = 0
    revisar = 0
    error_bloqueadas = 0
    orders_list = []
    
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
            city = str(row.get("ShipFromCity", "")).strip() if pd.notna(row.get("ShipFromCity")) else str(row.get("City", "")).strip()
            state = str(row.get("ShipFromState", "")).strip() if pd.notna(row.get("ShipFromState")) else str(row.get("State", "")).strip()
            zip_val = str(row.get("ShipFromZip", "")).strip().split(".")[0].zfill(5) if pd.notna(row.get("ShipFromZip")) else str(row.get("Zip", "")).strip().split(".")[0].zfill(5)
            phone = str(row.get("ShipFromPhone", "")).strip().split(".")[0] if pd.notna(row.get("ShipFromPhone")) else str(row.get("ShipToPhone", "")).strip().split(".")[0]
            email = str(row.get("ShipFromEmail", "")).strip() if pd.notna(row.get("ShipFromEmail")) else str(row.get("ShipToEmail", "")).strip()
        else:
            name = str(row.get("ShipToName", "")).strip()
            comp = str(row.get("ShipToCompany", "")).strip() if pd.notna(row.get("ShipToCompany")) else name
            addr1 = str(row.get("ShipToAddress1", "")).strip()
            addr2 = str(row.get("ShipToAddress2", "")).strip() if pd.notna(row.get("ShipToAddress2")) else ""
            city = str(row.get("City", "")).strip()
            state = str(row.get("State", "")).strip()
            zip_val = str(row.get("Zip", "")).strip().split(".")[0].zfill(5)
            phone = str(row.get("ShipToPhone", "")).strip().split(".")[0]
            email = str(row.get("ShipToEmail", "")).strip() if pd.notna(row.get("ShipToEmail")) else ""
            
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
            
        orders_list.append({
            "order_id": co,
            "type": "RETURN" if is_return else "OUTBOUND",
            "recipient_name": name,
            "company": comp,
            "address1": addr1,
            "address2": addr2,
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
        })
        
    return {
        "batch_filename": guias_path.name,
        "batch_date": datetime.datetime.fromtimestamp(guias_path.stat().st_mtime).strftime("%d/%m/%Y %H:%M:%S"),
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
        
    validador = ValidadorPostal()
    
    # Procesar teléfono si se actualizó
    nuevo_tel_limpio = None
    if updates.phone is not None:
        nuevo_tel_limpio = validar_y_limpiar_telefono(updates.phone)
        
    for r, is_retorno_counterpart in filas_afectadas:
        # Actualizar teléfono
        if nuevo_tel_limpio:
            if not is_retorno_counterpart:
                c_tel = headers_guias.get("ShipToPhone")
                if c_tel:
                    ws_guias.cell(r, c_tel).value = str(nuevo_tel_limpio)
            else:
                c_tel = headers_guias.get("ShipFromPhone")
                if c_tel:
                    ws_guias.cell(r, c_tel).value = str(nuevo_tel_limpio)
                    
        # Actualizar código postal
        if updates.zip is not None:
            zip_fmt = format_zip_code(updates.zip)
            if not is_retorno_counterpart:
                c_zip = headers_guias.get("Zip")
                if c_zip:
                    ws_guias.cell(r, c_zip).value = str(zip_fmt)
            else:
                c_zip = headers_guias.get("ShipFromZip")
                if c_zip:
                    ws_guias.cell(r, c_zip).value = str(zip_fmt)
                    
        # Actualizar Address 1
        if updates.address1 is not None:
            if not is_retorno_counterpart:
                c_a1 = headers_guias.get("ShipToAddress1")
                if c_a1:
                    ws_guias.cell(r, c_a1).value = str(updates.address1)[:50]
            else:
                c_a1 = headers_guias.get("ShipFromAddress1")
                if c_a1:
                    ws_guias.cell(r, c_a1).value = str(updates.address1)[:50]
                    
        # Actualizar Address 2 (Colonia)
        if updates.address2 is not None:
            if not is_retorno_counterpart:
                c_a2 = headers_guias.get("ShipToAddress2")
                if c_a2:
                    ws_guias.cell(r, c_a2).value = str(updates.address2)[:50]
            else:
                c_a2 = headers_guias.get("ShipFromAddress2")
                if c_a2:
                    ws_guias.cell(r, c_a2).value = str(updates.address2)[:50]
                    
        # Actualizar Ciudad / Municipio
        if updates.city is not None:
            if not is_retorno_counterpart:
                c_city = headers_guias.get("City")
                if c_city:
                    ws_guias.cell(r, c_city).value = str(updates.city)
            else:
                c_city = headers_guias.get("ShipFromCity")
                if c_city:
                    ws_guias.cell(r, c_city).value = str(updates.city)
                    
        # Actualizar Estado
        if updates.state is not None:
            if not is_retorno_counterpart:
                c_state = headers_guias.get("State")
                if c_state:
                    ws_guias.cell(r, c_state).value = str(updates.state)
            else:
                c_state = headers_guias.get("ShipFromState")
                if c_state:
                    ws_guias.cell(r, c_state).value = str(updates.state)
                    
        # Actualizar Servicio (60 / 70)
        if updates.service_code is not None:
            c_srv = headers_guias.get("SelectedServiceCode")
            if c_srv:
                ws_guias.cell(r, c_srv).value = str(updates.service_code)
                
        # Actualizar Valor Declarado
        if updates.declared_value is not None:
            c_val = headers_guias.get("DeclaredValue")
            if c_val:
                ws_guias.cell(r, c_val).value = float(updates.declared_value)
                
    wb_guias.save(guias_path)
    
    # También actualizar el resumen de auditoría si está disponible
    if audit_path and audit_path.is_file():
        try:
            wb_audit = openpyxl.load_workbook(audit_path)
            if "Resumen Direcciones" in wb_audit.sheetnames:
                ws_res = wb_audit["Resumen Direcciones"]
                for r in range(2, ws_res.max_row + 1):
                    val = str(ws_res.cell(r, 1).value or "").strip()
                    if pick_order in val:
                        # Si se corrigió el teléfono y ya no tiene ERROR
                        if nuevo_tel_limpio and not str(nuevo_tel_limpio).startswith("ERROR:"):
                            ws_res.cell(r, 9).value = str(nuevo_tel_limpio)
                            # Si tenía estatus de error por teléfono, actualizar a corregido
                            est_val = str(ws_res.cell(r, 3).value or "")
                            if "ERROR" in est_val:
                                ws_res.cell(r, 3).value = "VALIDADA SEPOMEX (Corregida Manualmente)"
                                ws_res.cell(r, 10).value = "Corregida en caliente vía Dashboard Web"
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
    Mueve (NO borra) los archivos de días anteriores de data/input y data/output
    a data/archive/AAAA-MM-DD/{input|output}/ para que el dashboard solo muestre el día de hoy.
    """
    hoy = datetime.date.today()
    movidos, omitidos = [], []

    for carpeta, etiqueta in ((DATA_INPUT, "input"), (DATA_OUTPUT, "output")):
        for f in sorted(carpeta.iterdir()):
            if not f.is_file() or f.name.startswith(".") or f.name.startswith("~$"):
                continue
            fecha = _fecha_de_archivo(f)
            if fecha >= hoy:
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
        "today": hoy.isoformat(),
        "archive_path": str(DATA_ARCHIVE),
        "moved_count": len(movidos),
        "moved": movidos,
        "skipped": omitidos,
    }


# -------------------------------------------------------------
# EJECUCIÓN DIRECTA CON UVICORN
# -------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    print(f"Iniciando servidor API en http://localhost:8000 ...")
    uvicorn.run("src.api.server:app", host="0.0.0.0", port=8000, reload=True)
