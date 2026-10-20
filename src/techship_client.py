# -*- coding: utf-8 -*-
"""
techship_client.py
------------------
Cliente de integración con la API v3 de Techship para la generación automática
de guías de Estafeta en el proyecto Kyndryl / KST (Seko Logistics).

Funcionalidades:
  1. Carga segura de credenciales desde archivo .env (evita fuga de API Keys).
  2. Detección anti-duplicados consultando GET /api/v3/shipments para evitar
     cobros dobles o timbrados redundantes en Estafeta.
  3. Transformación estricta de filas de Excel a esquema InputOrder de Techship v3,
     cumpliendo las reglas de Outbound (ShipFrom=null) y Retorno -1 (ShipTo=Seko Lerma,
     ShipFrom=Empleado).
  4. Compuerta de seguridad: Bloqueo de órdenes con estatus de dirección ERROR.
  5. Modo --dry-run activo por defecto para simulación y pruebas seguras sin timbrar.
"""

import os
import sys
import copy
import json
import base64
import re
import io
import datetime
import argparse
from pathlib import Path
import pandas as pd
import requests
from dotenv import load_dotenv
import openpyxl
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import TableColumn
from pypdf import PdfReader, PdfWriter

# Cargar variables de entorno desde .env
load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parent.parent
TECHSHIP_API_KEY = os.getenv("TECHSHIP_API_KEY")
TECHSHIP_API_SECRET = os.getenv("TECHSHIP_API_SECRET")
TECHSHIP_BASE_URL = os.getenv("TECHSHIP_BASE_URL", "https://api-us.techship.io").rstrip("/")
CLIENT_CODE_KST = os.getenv("TECHSHIP_CLIENT_CODE", "11")

CP_SEKO = "52030"
ANCHOS_CIERRE = {
    "A": 19.6, "B": 15.6, "C": 18.6, "D": 16.7, "E": 13.6, "F": 26.0,
    "G": 38.2, "H": 25.7, "I": 39.1, "J": 13.0, "K": 29.9, "L": 29.1
}
RELLENO_ERROR = PatternFill("solid", fgColor="FFC7CE")
FUENTE_ERROR = Font(color="9C0006", bold=True)

# Domicilio Oficial de Seko Lerma para los Retornos (-1)
SEKO_LERMA_ADDRESS = {
    "Name": "MARIAN GONZALEZ",
    "Company": "SEKO LOGISTICS MEXICO",
    "Address1": "AV LERMA 1CBIS1 INT1A",
    "Address2": "SAN PEDRO TULTEPEC",
    "Address3": None,
    "City": "LERMA",
    "StateProvince": "ESTADO DE MEXICO",
    "Postal": "52030",
    "Country": "MX",
    "Phone": "8116607459",
    "Email": "ops.mx1@sekologistics.com"
}


def get_auth_headers():
    """Genera las cabeceras HTTP de autenticación requeridas por Techship v3."""
    if not TECHSHIP_API_KEY or not TECHSHIP_API_SECRET:
        raise ValueError(
            "Faltan credenciales de Techship en el archivo .env. "
            "Asegúrate de definir TECHSHIP_API_KEY y TECHSHIP_API_SECRET."
        )
    return {
        "x-api-key": TECHSHIP_API_KEY,
        "x-secret-key": TECHSHIP_API_SECRET,
        "Accept": "application/json",
        "Content-Type": "application/json"
    }


def verificar_orden_existente(customer_order, client_code=CLIENT_CODE_KST, timeout=10):
    """
    Consulta en Techship si la orden ya fue registrada y timbrada para evitar duplicados.
    Revisa tanto la orden tal como viene como con/sin prefijo 'KYNDRYL_'.
    
    Retorna:
        (existe_activa: bool, detalle: str, shipment_data: dict o None)
    """
    headers = get_auth_headers()
    order_str = str(customer_order).strip()
    
    # Probar candidatos (con y sin prefijo KYNDRYL_)
    candidatos = [order_str]
    if order_str.startswith("KYNDRYL_"):
        candidatos.append(order_str.replace("KYNDRYL_", ""))
    else:
        candidatos.append(f"KYNDRYL_{order_str}")
        
    for cand in candidatos:
        url = f"{TECHSHIP_BASE_URL}/api/v3/shipments"
        params = {
            "clientCode": client_code,
            "customerOrder": cand
        }
        try:
            r = requests.get(url, headers=headers, params=params, timeout=timeout)
            if r.status_code == 200:
                shipments = r.json()
                if isinstance(shipments, list) and len(shipments) > 0:
                    for s in shipments:
                        tracking = s.get("TrackingNumber")
                        status = s.get("Status")
                        shipment_id = s.get("Id")
                        # Si tiene guía asignada o está procesada, se bloquea por duplicado
                        if tracking or status in ["Processed", "Shipped"]:
                            if tracking:
                                desc = f"Ya existe en Techship procesada con Guía '{tracking}' (ID {shipment_id})"
                            else:
                                desc = f"Ya existe en Techship registrada con estatus '{status}' (ID {shipment_id})"
                            return True, desc, s
                        elif status in ["Unprocessed", "Failed"]:
                            return False, f"Existe registro previo en borrador/fallido (ID {shipment_id}, Estatus: {status})", s
        except Exception as e:
            print(f"  [AVISO] No se pudo verificar duplicado para '{cand}': {e}")
            
    return False, "No existe en Techship", None


def convertir_fila_excel_a_payload(row):
    """
    Transforma una fila del archivo Excel 'Import Orders' al esquema exacto
    InputOrder de la API v3 de Techship.
    """
    customer_order = str(row.get('CustomerOrder', '')).strip()
    is_return = customer_order.endswith('-1')
    
    # 1. Routing y Servicio (Estafeta Terrestre 60 o Express 70)
    service_code_raw = str(row.get('SelectedServiceCode', '70')).strip().split('.')[0]
    routing = {
        "AccountCode": "ESTAFETAREST",
        "ServiceCode": service_code_raw
    }
    
    # 2. Configurar Direcciones (Reglas Outbound vs Return -1)
    if is_return:
        # En Retornos: Destino (ShipTo) es Seko Lerma
        ship_to = copy.deepcopy(SEKO_LERMA_ADDRESS)
        
        # Origen (ShipFrom) es el empleado con dirección validada
        name_emp = str(row.get('ShipFromName', '')).strip() if pd.notna(row.get('ShipFromName')) else str(row.get('ShipToName', '')).strip()
        comp_emp = str(row.get('ShipFromCompany', '')).strip() if pd.notna(row.get('ShipFromCompany')) else name_emp
        addr1_emp = str(row.get('ShipFromAddress1', '')).strip() if pd.notna(row.get('ShipFromAddress1')) else str(row.get('ShipToAddress1', '')).strip()
        addr2_emp = str(row.get('ShipFromAddress2', '')).strip() if pd.notna(row.get('ShipFromAddress2')) else str(row.get('ShipToAddress2', '')).strip()
        city_emp = str(row.get('ShipFromCity', '')).strip() if pd.notna(row.get('ShipFromCity')) else str(row.get('City', '')).strip()
        state_emp = str(row.get('ShipFromState', '')).strip() if pd.notna(row.get('ShipFromState')) else str(row.get('State', '')).strip()
        zip_emp = str(row.get('ShipFromZip', '')).strip().split('.')[0].zfill(5) if pd.notna(row.get('ShipFromZip')) else str(row.get('Zip', '')).strip().split('.')[0].zfill(5)
        phone_emp = str(row.get('ShipFromPhone', '')).strip().split('.')[0] if pd.notna(row.get('ShipFromPhone')) else str(row.get('ShipToPhone', '')).strip().split('.')[0]
        email_emp = str(row.get('ShipFromEmail', '')).strip() if pd.notna(row.get('ShipFromEmail')) else str(row.get('ShipToEmail', '')).strip()
        
        ship_from = {
            "Name": name_emp,
            "Company": comp_emp,
            "Address1": addr1_emp[:50],
            "Address2": addr2_emp[:50] if addr2_emp and addr2_emp.lower() != 'nan' else "",
            "Address3": None,
            "City": city_emp,
            "StateProvince": state_emp,
            "Postal": zip_emp,
            "Country": "MX",
            "Phone": phone_emp,
            "Email": email_emp if email_emp and email_emp.lower() != 'nan' else ""
        }
    else:
        # En Outbound (Ida): Origen (ShipFrom) es null (Techship usa el origen de la cuenta en Seko Lerma)
        ship_from = None
        
        # Destino (ShipTo) es el empleado
        name_emp = str(row.get('ShipToName', '')).strip()
        comp_emp = str(row.get('ShipToCompany', '')).strip() if pd.notna(row.get('ShipToCompany')) else name_emp
        addr1_emp = str(row.get('ShipToAddress1', '')).strip()
        addr2_emp = str(row.get('ShipToAddress2', '')).strip() if pd.notna(row.get('ShipToAddress2')) else ""
        city_emp = str(row.get('City', '')).strip()
        state_emp = str(row.get('State', '')).strip()
        zip_emp = str(row.get('Zip', '')).strip().split('.')[0].zfill(5)
        phone_emp = str(row.get('ShipToPhone', '')).strip().split('.')[0]
        email_emp = str(row.get('ShipToEmail', '')).strip() if pd.notna(row.get('ShipToEmail')) else ""
        
        ship_to = {
            "Name": name_emp,
            "Company": comp_emp,
            "Address1": addr1_emp[:50],
            "Address2": addr2_emp[:50] if addr2_emp and addr2_emp.lower() != 'nan' else "",
            "Address3": None,
            "City": city_emp,
            "StateProvince": state_emp,
            "Postal": zip_emp,
            "Country": "MX",
            "Phone": phone_emp,
            "Email": email_emp if email_emp and email_emp.lower() != 'nan' else ""
        }
        
    # 3. Paquete estándar (Package 1)
    try:
        weight_val = float(row.get('Package 1 - Weight', 3.0))
        width_val = float(row.get('Package 1 - Width', 38.0))
        height_val = float(row.get('Package 1 - Height', 51.0))
        length_val = float(row.get('Package 1 - Length', 15.0))
    except (ValueError, TypeError):
        weight_val, width_val, height_val, length_val = 3.0, 38.0, 51.0, 15.0
        
    package = {
        "Weight": weight_val if weight_val > 0 else 3.0,
        "WeightUOM": "KG",
        "Description": "KST",
        "Dimensions": {
            "Width": width_val,
            "Height": height_val,
            "Length": length_val,
            "DimensionsUOM": "cm"
        }
    }
    
    # 4. Seguro / Valor Declarado
    declared_val_raw = row.get('DeclaredValue')
    try:
        dec_val = float(declared_val_raw) if pd.notna(declared_val_raw) else 0.0
    except (ValueError, TypeError):
        dec_val = 0.0
        
    if dec_val >= 100.0:
        insurance = {
            "DeclaredValue": dec_val,
            "DeclaredValueType": "PU",
            "Insurance": True
        }
    else:
        insurance = {
            "DeclaredValue": None,
            "DeclaredValueType": None,
            "Insurance": False
        }
        
    # 5. Estructura InputOrder completa para Techship v3
    payload = {
        "ClientCode": str(row.get('ClientCode', CLIENT_CODE_KST)).strip().split('.')[0],
        "CustomerOrder": customer_order,
        "CustomerPO": str(row.get('CustomerPO', '')).strip() if pd.notna(row.get('CustomerPO')) else None,
        "CustomerNumber": str(row.get('CustomerNumber', '')).strip() if pd.notna(row.get('CustomerNumber')) else None,
        "Routing": routing,
        "ShipToAddress": ship_to,
        "ShipFromAddress": ship_from,
        "Packages": [package],
        "Insurance": insurance,
        "ShippingOptions": {
            "SignatureRequired": False,
            "SignatureAdult": False
        },
        "CustomFields": []
    }
    
    return payload


def verificar_calidad_direccion(row, audit_dict=None):
    """
    Compuerta de seguridad: Detecta si la dirección contiene errores críticos
    que provocarían rechazo de Estafeta o extravío del paquete.
    """
    customer_order = str(row.get('CustomerOrder', '')).strip()
    
    # 1. Verificar si viene catalogado con ERROR en la hoja de Auditoría
    if audit_dict and customer_order in audit_dict:
        estatus = str(audit_dict[customer_order]).upper()
        if "ERROR" in estatus:
            return False, f"Bloqueada por semáforo de auditoría: {audit_dict[customer_order]}"
            
    # 2. Verificar valores internos en la fila
    for campo in ['Zip', 'ShipToPhone', 'ShipToAddress1', 'ShipFromZip', 'ShipFromPhone', 'ShipFromAddress1']:
        val = str(row.get(campo, '')).strip()
        if val.startswith("ERROR:"):
            return False, f"Dato inválido detectado en campo '{campo}': {val}"
            
    return True, "Dirección válida"


def cargar_diccionario_auditoria(audit_path):
    """Carga el estatus de auditoría si el archivo complementario está disponible."""
    audit_dict = {}
    if not audit_path or not os.path.isfile(audit_path):
        return audit_dict
    try:
        df_audit = pd.read_excel(audit_path, sheet_name='Resumen Direcciones')
        for _, r in df_audit.iterrows():
            ritm = str(r.get('Orden (RITM)', '')).strip()
            estatus = str(r.get('Estatus Dirección', '')).strip()
            if ritm:
                audit_dict[ritm] = estatus
    except Exception as e:
        # Si el usuario tiene el archivo abierto en Excel en Windows, puede dar PermissionError
        print(f"  [AVISO] No se pudo leer archivo de auditoría ({e}). Se validarán datos directamente de las filas.")
    return audit_dict


def procesar_archivo_techship(input_path, dry_run=True, audit_path=None):
    """
    Procesa un archivo Excel generado para Techship:
      - Valida duplicados contra la API
      - Aplica compuerta de seguridad en direcciones
      - Convierte registros a payloads InputOrder
      - Ejecuta simulación (dry-run) o envío real
    """
    if not os.path.isfile(input_path):
        raise FileNotFoundError(f"No se encontró el archivo de entrada: {input_path}")
        
    print(f"\n=======================================================")
    print(f"  CLIENTE API TECHSHIP V3 (Estafeta / Seko Logistics)  ")
    print(f"=======================================================")
    print(f"Archivo de órdenes : {input_path}")
    print(f"Modo de ejecución  : {'[SIMULACIÓN SEGURA (DRY-RUN)]' if dry_run else '[PRODUCCIÓN (TIMBRADO REAL)]'}")
    print(f"Servidor API       : {TECHSHIP_BASE_URL}")
    print(f"Cliente Code       : {CLIENT_CODE_KST} (KST / Kyndryl)")
    print(f"-------------------------------------------------------")
    
    # Buscar archivo de auditoría correspondiente automáticamente si no se especificó
    if not audit_path:
        nombre = os.path.basename(input_path)
        if "Guias_Techship_Importada_" in nombre:
            candidato_audit = Path(input_path).parent / nombre.replace("Guias_Techship_Importada_", "Auditoria_Direcciones_")
            if candidato_audit.is_file():
                audit_path = str(candidato_audit)
                
    audit_dict = cargar_diccionario_auditoria(audit_path)
    if audit_dict:
        print(f"Auditoría enlazada : {audit_path} ({len(audit_dict)} órdenes cargadas)")
        
    df_orders = pd.read_excel(input_path, sheet_name='Import Orders')
    total_filas = len(df_orders)
    print(f"Total de registros a procesar: {total_filas}\n")
    
    listas_para_envio = []
    bloqueadas_error = []
    ya_existentes = []
    
    sample_outbound_payload = None
    sample_return_payload = None
    
    for idx, row in df_orders.iterrows():
        customer_order = str(row.get('CustomerOrder', '')).strip()
        if not customer_order or customer_order.lower() == 'nan':
            continue
            
        is_return = customer_order.endswith('-1')
        print(f"[{idx+1}/{total_filas}] Evaluando {customer_order} ({'RETORNO' if is_return else 'OUTBOUND'})...")
        
        # 3. Conversión a Payload InputOrder
        payload = convertir_fila_excel_a_payload(row)
        
        # Guardar muestras para visualización e inspección del usuario
        if not is_return and sample_outbound_payload is None:
            sample_outbound_payload = payload
        elif is_return and sample_return_payload is None:
            sample_return_payload = payload

        # 1. Compuerta de seguridad de dirección
        dir_ok, dir_motivo = verificar_calidad_direccion(row, audit_dict)
        if not dir_ok:
            print(f"  --> [BLOQUEADA] {dir_motivo}")
            bloqueadas_error.append((customer_order, dir_motivo))
            continue
            
        # 2. Detección anti-duplicados contra Techship
        ya_existe, detalle_dup, _ = verificar_orden_existente(customer_order)
        if ya_existe:
            print(f"  --> [OMITIDA POR DUPLICADO] {detalle_dup}")
            ya_existentes.append((customer_order, detalle_dup))
            continue
            
        listas_para_envio.append((customer_order, payload))
        print(f"  --> [LISTA] Payload estructurado correctamente.")

    # ── RESUMEN DE LA FASE ──
    print(f"\n=======================================================")
    print(f"                 RESUMEN DE EVALUACIÓN                ")
    print(f"=======================================================")
    print(f"  Total órdenes en Excel        : {total_filas}")
    print(f"  Órdenes listas para timbrar   : {len(listas_para_envio)}")
    print(f"  Órdenes ya existentes (Skip)  : {len(ya_existentes)}")
    print(f"  Órdenes bloqueadas por error  : {len(bloqueadas_error)}")
    print(f"=======================================================\n")
    
    # ── MUESTRAS JSON ──
    if sample_outbound_payload:
        print("--- EJEMPLO PAYLOAD JSON: OUTBOUND (ENTREGA) ---")
        print(json.dumps(sample_outbound_payload, indent=2, ensure_ascii=False))
        print("\n" + "-"*55 + "\n")
        
    if sample_return_payload:
        print("--- EJEMPLO PAYLOAD JSON: RETORNO (-1 RECOLECCIÓN) ---")
        print(json.dumps(sample_return_payload, indent=2, ensure_ascii=False))
        print("\n" + "-"*55 + "\n")
        
    if dry_run:
        print("[MODO DRY-RUN ACTIVO]: No se envió ninguna llamada de creación real a Estafeta.")
        print("Para enviar llamadas de prueba a la API de Techship con validación sin timbrado,")
        print("puedes habilitar la bandera correspondiente cuando el flujo esté autorizado.\n")
    else:
        # En fase de producción real:
        print("[MODO PRODUCCIÓN]: Enviando órdenes a Techship...")
        # Aquí se ejecutará el loop de envío real en la siguiente fase
        

def _fila_limite(ws):
    """
    Detecta la línea negra o la primera fila vacía en la hoja Combined Report.
    """
    for r in range(2, ws.max_row + 1):
        row_cells = [ws.cell(row=r, column=c) for c in range(1, min(ws.max_column + 1, 10))]
        is_empty = all(cell.value is None or str(cell.value).strip() == "" for cell in row_cells)
        
        has_black_fill = False
        first_cell_fill = ws.cell(row=r, column=1).fill
        if first_cell_fill and first_cell_fill.fill_type == "solid":
            c = getattr(first_cell_fill, "start_color", None)
            if c:
                val = getattr(c, "value", None)
                theme = getattr(c, "theme", None)
                rgb = getattr(c, "rgb", None)
                color_type = getattr(c, "type", None)
                if val in ("00000000", "FF000000", "000000", 8, "8", 0, "0"):
                    has_black_fill = True
                elif rgb in ("00000000", "FF000000", "000000"):
                    has_black_fill = True
                elif color_type == "theme" and theme in (0, 1):
                    tint = getattr(c, "tint", 0.0)
                    if tint in (0.0, None, -1.0):
                        has_black_fill = True
                        
        if is_empty and has_black_fill:
            return r

    for r in range(2, ws.max_row + 1):
        row_cells = [ws.cell(row=r, column=c) for c in range(1, ws.max_column + 1)]
        if all(cell.value is None or str(cell.value).strip() == "" for cell in row_cells):
            return r

    return ws.max_row + 1


def obtener_tracking_api(customer_order, client_code=CLIENT_CODE_KST, timeout=10):
    """
    Consulta en la API de Techship una orden específica con labelPdfConversion=Enabled y extrae:
      - tracking22: Guía de 22 caracteres (Packages[0].TrackingNumber)
      - tracking10: Código de rastreo de 10 dígitos (del PDF de la etiqueta)
      - cp_dest: Código postal de entrega registrado en Techship
      - status: Estatus de la orden en Techship
      - shipment_id: ID interno del envío
      - pdf_bytes: Bytes del PDF de la etiqueta para consolidación
    """
    headers = get_auth_headers()
    order_str = str(customer_order).strip()
    candidatos = [order_str]
    if order_str.startswith("KYNDRYL_"):
        candidatos.append(order_str.replace("KYNDRYL_", ""))
    else:
        candidatos.append(f"KYNDRYL_{order_str}")
        
    for cand in candidatos:
        url = f"{TECHSHIP_BASE_URL}/api/v3/shipments"
        params = {"clientCode": client_code, "customerOrder": cand}
        try:
            r = requests.get(url, headers=headers, params=params, timeout=timeout)
            if r.status_code == 200:
                shipments = r.json()
                if isinstance(shipments, list) and len(shipments) > 0:
                    s_id = shipments[0].get("Id")
                    status = shipments[0].get("Status")
                    # Consultar detalle completo solicitando conversión a PDF
                    r_det = requests.get(f"{TECHSHIP_BASE_URL}/api/v3/shipments/{s_id}?labelPdfConversion=Enabled", headers=headers, timeout=timeout)
                    if r_det.status_code == 200:
                        det = r_det.json()
                        packages = det.get("Packages", [])
                        trk22 = None
                        trk10 = None
                        pdf_bytes = None
                        if packages:
                            p0 = packages[0]
                            trk22 = p0.get("TrackingNumber")
                            labels = p0.get("Labels", [])
                            if labels:
                                lbl_b64 = labels[0].get("Label", "")
                                lbl_type = labels[0].get("Type")
                                try:
                                    raw_bytes = base64.b64decode(lbl_b64)
                                    if lbl_type == "PDF" or raw_bytes.startswith(b"%PDF"):
                                        pdf_bytes = raw_bytes
                                        try:
                                            reader = PdfReader(io.BytesIO(raw_bytes))
                                            if reader.pages:
                                                t = reader.pages[0].extract_text()
                                                m = re.search(r'CODIGO DE RASTREO:\s*(\d{10})', t)
                                                if m:
                                                    trk10 = m.group(1)
                                        except Exception:
                                            pass
                                    elif lbl_type == "ZPL" or b"^XA" in raw_bytes:
                                        zpl = raw_bytes.decode("utf-8", errors="ignore")
                                        m = re.search(r'CODIGO DE RASTREO.*?\^FD(\d{10})\^FS', zpl, re.DOTALL)
                                        if m:
                                            trk10 = m.group(1)
                                except Exception:
                                    pass
                        cp_dest = det.get("ShipToAddress", {}).get("Postal")
                        return trk22, trk10, cp_dest, status, s_id, pdf_bytes
        except Exception:
            pass
            
    return None, None, None, None, None, None


def sincronizar_tracking_desde_api(sctask_path=None, output_path=None, client_code=CLIENT_CODE_KST):
    """
    Lee el archivo SCTASK original (Combined Report), consulta vía API en Techship
    las guías de 22 caracteres, códigos de 10 dígitos y etiquetas PDF, valida CPs,
    genera el archivo Cierre_DD_Mes_AAAA.xlsx y un único PDF consolidado de etiquetas
    en el orden exacto de empaque (Ida + Retorno consecutivos).
    """
    if not sctask_path:
        candidatos = sorted((PROJECT_ROOT / "data" / "input").glob("SCTASK_*.xlsx"), key=os.path.getmtime, reverse=True)
        if not candidatos:
            candidatos = sorted((PROJECT_ROOT / "data" / "samples").glob("SCTASK_*.xlsx"), key=os.path.getmtime, reverse=True)
        if candidatos:
            sctask_path = str(candidatos[0])
        else:
            raise FileNotFoundError("No se encontró ningún reporte SCTASK_*.xlsx en data/input/ ni data/samples/")
            
    print(f"\n=======================================================")
    print(f"  SINCRONIZACIÓN DE TRACKINGS Y ETIQUETAS VÍA API V3   ")
    print(f"=======================================================")
    print(f"Reporte de entrada  : {sctask_path}")
    print(f"Servidor API        : {TECHSHIP_BASE_URL}")
    print(f"Cliente Code        : {client_code} (KST)")
    print(f"-------------------------------------------------------")
    
    wb = openpyxl.load_workbook(sctask_path)
    if "Combined Report" not in wb.sheetnames:
        raise ValueError(f"La hoja 'Combined Report' no existe en {sctask_path}")
        
    ws = wb["Combined Report"]
    
    # Mapear encabezados
    encabezados = {}
    for col_idx in range(1, ws.max_column + 1):
        v = ws.cell(1, col_idx).value
        if v is not None:
            encabezados[str(v).strip().lower()] = col_idx
            
    if "parent" not in encabezados:
        raise ValueError("Columna 'Parent' no encontrada en la hoja 'Combined Report'.")
        
    col_parent = encabezados["parent"]
    col_zip = encabezados.get("zip / postal code")
    col_serial = encabezados.get("ticket age") or encabezados.get("serial number") or 6
    col_tracking = encabezados.get("dispatched in 360?") or encabezados.get("tracking number") or 7
    
    limite = _fila_limite(ws)
    total_ordenes = limite - 2
    print(f"Filas con datos detectadas antes de la línea negra: {total_ordenes}")
    
    asignadas = 0
    sin_match = []
    cp_dudosos = []
    detalle_filas = []
    
    # Objeto para unir todas las páginas PDF en memoria
    pdf_writer = PdfWriter()
    paginas_pdf = 0
    
    for r in range(2, limite):
        parent_val = ws.cell(r, col_parent).value
        if parent_val in (None, ""):
            continue
        parent = str(parent_val).strip()
        es_retorno = parent.endswith("-1")
        
        celda_serial = ws.cell(r, col_serial)
        celda_trk = ws.cell(r, col_tracking)
        celda_serial.value = None
        
        # Consultar en Techship API (obtiene tracking22, rastreo10 y PDF bytes)
        trk22, trk10, cp_dest, status, s_id, pdf_bytes = obtener_tracking_api(parent, client_code=client_code)
        
        if trk22 or trk10:
            val_final = trk22 if trk22 else trk10
            celda_trk.value = str(val_final)
            celda_trk.number_format = "@"
            asignadas += 1
            detalle_filas.append((parent, val_final, trk10, cp_dest))
            print(f"  [OK] Fila {r-1}: {parent} -> Guía: {val_final} (Rastreo 10: {trk10})")
            
            # Acumular página en el PDF consolidado
            if pdf_bytes:
                try:
                    reader = PdfReader(io.BytesIO(pdf_bytes))
                    for p in reader.pages:
                        pdf_writer.add_page(p)
                        paginas_pdf += 1
                except Exception as e:
                    print(f"    [AVISO] No se pudo unir página PDF de {parent}: {e}")
            
            # Validación de Código Postal
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
                
            if esperado and cp_dest and str(cp_dest).strip() != esperado:
                cp_dudosos.append((parent, esperado, cp_dest))
                print(f"    [ALERTA CP] {parent}: CP SCTASK ({esperado}) vs CP Techship ({cp_dest})")
        else:
            celda_trk.value = "ERROR: Tracking no encontrado en Techship"
            celda_trk.fill = RELLENO_ERROR
            celda_trk.font = FUENTE_ERROR
            sin_match.append(parent)
            print(f"  [ERROR] Fila {r-1}: {parent} -> No se encontró en Techship")

    # Renombrar columnas clave
    ws.cell(1, col_serial).value = "Serial Number"
    ws.cell(1, col_tracking).value = "Tracking Number"
    
    # Eliminar filas después del límite
    if limite <= ws.max_row:
        ws.delete_rows(limite, ws.max_row - limite + 1)
        
    # Dejar exactamente las 12 columnas oficiales de Cierre
    COLUMNAS_DESEADAS = [
        "parent", "request", "ship", "state", "created",
        "serial number", "tracking number", "product number", "product description",
        "assignment group", "recipient first name", "recipient last name"
    ]
    for c in range(ws.max_column, 0, -1):
        nombre_col = str(ws.cell(1, c).value or "").strip().lower()
        if nombre_col not in COLUMNAS_DESEADAS:
            ws.delete_cols(c, 1)
            
    # Limpiar reglas y tablas
    ws.conditional_formatting._cf_rules.clear()
    for t in list(ws.tables.values()):
        t.ref = f"A1:{get_column_letter(ws.max_column)}{ws.max_row}"
        if t.autoFilter:
            t.autoFilter.ref = t.ref
        t.tableColumns = [TableColumn(id=i, name=str(ws.cell(1, i).value)) for i in range(1, ws.max_column + 1)]
        t.sortState = None
        
    ws.freeze_panes = "A2"
    ws.column_dimensions.clear()
    for col, ancho in ANCHOS_CIERRE.items():
        ws.column_dimensions[col].width = ancho
        
    # Guardar archivo de cierre con nombre oficial
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
        salida = str(Path(salida).with_name(f"Cierre_{now.day}_{meses_es[now.month - 1]}_{now.year}_API.xlsx"))
        wb.save(salida)
        
    # Guardar PDF consolidado de etiquetas en el orden exacto de empaque
    nombre_pdf = f"Etiquetas_Lote_{now.day}_{meses_es[now.month - 1]}_{now.year}.pdf"
    salida_pdf = str(PROJECT_ROOT / "data" / "output" / nombre_pdf)
    if paginas_pdf > 0:
        try:
            with open(salida_pdf, "wb") as f_pdf:
                pdf_writer.write(f_pdf)
        except PermissionError:
            salida_pdf = str(PROJECT_ROOT / "data" / "output" / f"Etiquetas_Lote_{now.day}_{meses_es[now.month - 1]}_{now.year}_API.pdf")
            with open(salida_pdf, "wb") as f_pdf:
                pdf_writer.write(f_pdf)
                
    print(f"\n=======================================================")
    print(f"                 RESUMEN DE CIERRE                    ")
    print(f"=======================================================")
    print(f"  Archivo Cierre Excel : {salida}")
    print(f"  PDF Etiquetas Unificado: {salida_pdf} ({paginas_pdf} páginas consecutivas)")
    print(f"  Filas procesadas     : {ws.max_row - 1}")
    print(f"  Trackings asignados  : {asignadas}/{total_ordenes}")
    if sin_match:
        print(f"  Sin guía ({len(sin_match)}): {', '.join(sin_match)}")
    if cp_dudosos:
        print(f"  Alertas de CP ({len(cp_dudosos)}):")
        for p, esp, real in cp_dudosos:
            print(f"    * {p}: Esperado {esp} vs Registrado {real}")
    print(f"=======================================================\n")
    return salida


def main():
    parser = argparse.ArgumentParser(description="Cliente API Techship v3 para automatización de guías Estafeta.")
    parser.add_argument("-i", "--input", help="Ruta al archivo Excel de órdenes (Guias_Techship_Importada_*.xlsx).")
    parser.add_argument("-a", "--audit", help="Ruta al archivo de Auditoría (Auditoria_Direcciones_*.xlsx).")
    parser.add_argument("-e", "--sctask", help="Ruta al archivo SCTASK original para sincronizar cierre.")
    parser.add_argument("--sync-tracking", action="store_true", help="Sincroniza números de guía desde Techship API y genera el archivo Cierre_*.xlsx.")
    parser.add_argument("--dry-run", action="store_true", default=True, help="Ejecutar en modo simulación segura sin timbrar (default: True).")
    parser.add_argument("--live", action="store_true", help="Ejecutar en modo real de producción con timbrado en Estafeta.")
    
    args = parser.parse_args()
    
    if args.sync_tracking:
        sincronizar_tracking_desde_api(sctask_path=args.sctask)
        return
        
    input_file = args.input
    if not input_file:
        # Auto-detectar en data/output/
        candidatos = list(Path("data/output").glob("Guias_Techship_Importada_*.xlsx"))
        if candidatos:
            input_file = str(candidatos[0])
            print(f"Archivo auto-detectado: {input_file}")
        else:
            print("Error: No se encontró ningún archivo Guias_Techship_Importada_*.xlsx en data/output/")
            sys.exit(1)
            
    is_dry_run = not args.live
    procesar_archivo_techship(input_file, dry_run=is_dry_run, audit_path=args.audit)


if __name__ == "__main__":
    main()
