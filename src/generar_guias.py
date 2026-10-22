import os
import re
import sys
import pandas as pd
import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment
from pathlib import Path
import argparse

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

PROJECT_ROOT = Path(__file__).resolve().parent.parent

try:
    from validador_postal import (
        ValidadorPostal,
        normalizar_texto,
        validar_y_limpiar_telefono,
        formatear_direccion_inteligente,
    )
except ImportError:
    from src.validador_postal import (
        ValidadorPostal,
        normalizar_texto,
        validar_y_limpiar_telefono,
        formatear_direccion_inteligente,
    )

def clean_text_encoding(text):
    """
    Corrige los problemas de codificación comunes detectados en el archivo original,
    reemplaza '#' por 'No.', elimina '+' y limpia espacios.
    """
    if not isinstance(text, str):
        return text
    
    # Limpieza de espacios al inicio/final
    text = text.strip()
    
    # Reemplazo de palabras específicas identificadas con error de codificación
    text = re.sub(r'retoo', 'retoño', text, flags=re.IGNORECASE)
    text = re.sub(r'Mxico', 'México', text, flags=re.IGNORECASE)
    
    # Reemplazar '#' por 'No.'
    text = re.sub(r'#\s*', 'No.', text)
    
    # Quitar cualquier '+' si existiera
    text = text.replace('+', '')
    
    return text

def format_zip_code(zip_val):
    """
    Formatea el código postal para asegurar que sea un string de exactamente 5 dígitos.
    Resuelve el problema de que Excel elimine los ceros a la izquierda, agregue decimales (.0)
    o traiga prefijos como 'CP 01219'.
    """
    if pd.isna(zip_val):
        return ""
    digits = re.sub(r'[^\d]', '', str(zip_val).split('.')[0])
    if digits:
        return digits[-5:].zfill(5)
    return ""

def format_phone_number(phone_val):
    """
    Wrapper retrocompatible para limpiar teléfonos a 10 dígitos.
    """
    digits, _, _ = validar_y_limpiar_telefono(phone_val)
    return digits

def smart_truncate_address(address, max_length=50):
    """
    Trunca inteligentemente una dirección que exceda max_length caracteres.
    Corta en el último espacio disponible antes del límite para no partir palabras.
    Retorna una tupla (parte1, parte2) donde parte2 es el texto sobrante o None.
    """
    if not isinstance(address, str) or len(address) <= max_length:
        return address, None

    cut_pos = address.rfind(' ', 0, max_length)
    if cut_pos == -1:
        cut_pos = max_length

    part1 = address[:cut_pos].rstrip()
    part2 = address[cut_pos:].lstrip()

    return part1, part2 if part2 else None

def parse_municipio(municipio_raw):
    """
    Separa el campo 'Municipio' sucio en (ciudad, colonia).
    Ejemplos:
      'Querétaro, Col. Milenio III'  -> ('Querétaro', 'Col. Milenio III')
      'Tlalpan, Colonia Isidro Fabela' -> ('Tlalpan', 'Colonia Isidro Fabela')
      'Monterrey'                     -> ('Monterrey', None)
      'Fracc. Los Olivos, Zapopan'    -> ('Zapopan', 'Fracc. Los Olivos')
    """
    if not isinstance(municipio_raw, str) or not municipio_raw.strip():
        return municipio_raw, None

    text = municipio_raw.strip()

    col_patterns = [r'\bCol\.\s*', r'\bColonia\s+', r'\bFracc\.\s*', r'\bFraccionamiento\s+']

    for pattern in col_patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            before = text[:match.start()].strip().rstrip(',')
            after = text[match.start():].strip()
            if before:
                return before, after
            comma_in_after = after.find(',')
            if comma_in_after != -1:
                colonia_part = after[:comma_in_after].strip()
                city_part = after[comma_in_after + 1:].strip()
                return city_part, colonia_part
            return after, None

    if ',' in text:
        parts = text.split(',', 1)
        return parts[0].strip(), parts[1].strip() if parts[1].strip() else None

    return text, None

def find_black_line_row(sheet):
    """
    Busca el índice de la fila que representa la 'línea negra' en la hoja de Excel.
    Criterios reforzados:
    1. Fila con relleno negro/oscuro sólido (color RGB '00000000', 'FF000000', '000000', indexado 8/0, o theme oscuro)
       y que además esté vacía en sus columnas de datos clave (Parent, Request, etc.).
    2. Primera fila completamente vacía en todas sus celdas.
    """
    for r in range(2, sheet.max_row + 1):
        row_cells = [sheet.cell(row=r, column=c) for c in range(1, min(sheet.max_column + 1, 10))]
        is_empty = all(cell.value is None or str(cell.value).strip() == "" for cell in row_cells)
        
        has_black_fill = False
        first_cell_fill = sheet.cell(row=r, column=1).fill
        if first_cell_fill and first_cell_fill.fill_type == 'solid':
            c = getattr(first_cell_fill, 'start_color', None)
            if c:
                val = getattr(c, 'value', None)
                theme = getattr(c, 'theme', None)
                rgb = getattr(c, 'rgb', None)
                color_type = getattr(c, 'type', None)
                
                if val in ('00000000', 'FF000000', '000000', 8, '8', 0, '0'):
                    has_black_fill = True
                elif rgb in ('00000000', 'FF000000', '000000'):
                    has_black_fill = True
                elif color_type == 'theme' and theme in (0, 1):
                    tint = getattr(c, 'tint', 0.0)
                    if tint in (0.0, None, -1.0):
                        has_black_fill = True
                        
        if is_empty and has_black_fill:
            return r
            
    for r in range(2, sheet.max_row + 1):
        row_cells = [sheet.cell(row=r, column=c) for c in range(1, sheet.max_column + 1)]
        if all(cell.value is None or str(cell.value).strip() == "" for cell in row_cells):
            return r
            
    return None

def map_service_code(state_val, is_return=False):
    """
    Mapea el campo 'State' de origen al 'SelectedServiceCode' de Techship.
    - Si el valor de origen es 60 (o contiene 'next day' / 'second day') -> 60
    - Si el valor de origen es 70 (o contiene 'ground') -> 70
    - Para retornos -> 70 (asociado a la logística de retorno terrestre)
    """
    if is_return:
        return 70
        
    if pd.isna(state_val):
        return 70
        
    val_str = str(state_val).strip().lower()
    if 'next day' in val_str or 'next' in val_str or 'second day' in val_str or 'second' in val_str:
        return 60
    elif 'ground' in val_str:
        return 70
        
    return 70

def resolve_insurance(declared_value, min_insurable=100):
    """
    Evalúa el valor declarado de una orden y determina si se debe comprar seguro.
    Reglas de negocio:
      - Si declared_value es numérico y >= min_insurable → 'PU' + monto.
      - Si declared_value es < min_insurable, 0, vacío, None o no numérico → '' (vacío) + 0.
    """
    if declared_value is None or (isinstance(declared_value, float) and pd.isna(declared_value)):
        return '', 0.0
    
    try:
        amount = float(declared_value)
        if amount >= min_insurable:
            return 'PU', round(amount, 2)
        else:
            return '', 0.0
    except (ValueError, TypeError):
        return '', 0.0

def process_excel(input_path, output_path, default_declared_value=None):
    print(f"Cargando reporte de origen: {input_path}")
    wb = openpyxl.load_workbook(input_path)
    if 'Combined Report' not in wb.sheetnames:
        raise ValueError("La hoja 'Combined Report' no se encuentra en el archivo de origen.")
        
    sheet = wb['Combined Report']
    limit_row = find_black_line_row(sheet)
    wb.close()
    
    df_all = pd.read_excel(input_path, sheet_name='Combined Report')
    
    if limit_row:
        idx_limit = limit_row - 2
        df_raw = df_all.iloc[:idx_limit]
        print(f"Línea negra detectada en la fila {limit_row} de Excel.")
        print(f"Se procesarán únicamente las {len(df_raw)} filas con datos ubicadas ANTES de la línea negra.")
    else:
        df_raw = df_all
        print("No se detectó línea negra. Se procesarán todas las filas del archivo.")
        
    print(f"Registros cargados para procesar: {len(df_raw)}")
    
    validador = ValidadorPostal()
    incidencias = []
    resumen_direcciones = []

    def registrar(fila, ritm, severidad, campo, valor, detalle):
        incidencias.append((fila, ritm, severidad, campo, valor, detalle))
        print(f"  [{severidad}] Fila {fila} ({ritm}) | {campo}: '{valor}' -> {detalle}")
    
    # ── Columnas basadas en File_Template_NewInsurance.xlsx + ShipToCompany + ShipFrom (A–BI) ──
    # Se agrega ShipToCompany (col I) porque la API de Estafeta exige 'corporateName' != null.
    # Se agregan las columnas ShipFrom* + HasShipFromAddress (AX–BI) para que en los retornos (-1)
    # el remitente sea el empleado; sin ellas Techship usa el origen por defecto de la cuenta (SEKO)
    # y la guía queda SEKO -> SEKO.
    # Total: 61 columnas (A–BI).
    techship_columns = [
        'ClientCode', 'PickOrder', 'Sequence', 'CustomerOrder', 'CustomerPO',        # A–E
        'CustomerNumber', 'Terms', 'Volume',                                          # F–H
        'ShipToCompany', 'ShipToName',                                                # I–J  ← ShipToCompany restaurado
        'ShipToAddress1', 'ShipToAddress2', 'ShipToAddress3',                         # K–M
        'City', 'State', 'Country', 'Zip',                                            # N–Q
        'ShipToPhone', 'ShipToEmail',                                                 # R–S
        'ServiceCodeDescription', 'SelectedServiceCode',                              # T–U
        'DeclaredValueType', 'DeclaredValue',                                         # V–W  (Seguro)
        'SignatureAdult', 'OrderWeight',                                              # X–Y
        'SignatureRequired', 'DoNotSafeDrop',                                         # Z–AA
        'CollectOnDeliveryAmount', 'CollectOnDeliveryMethod',                          # AB–AC
        'Package 1 - Weight', 'Package 1 - Height', 'Package 1 - Width', 'Package 1 - Length',   # AD–AG
        'Package 2 - Weight', 'Package 2 - Height', 'Package 2 - Width', 'Package 2 - Length',   # AH–AK
        'Package 3 - Weight', 'Package 3 - Height', 'Package 3 - Width', 'Package 3 - Length',   # AL–AO
        'Package 4 - Weight', 'Package 4 - Height', 'Package 4 - Width', 'Package 4 - Length',   # AP–AS
        'Package 5 - Weight', 'Package 5 - Height', 'Package 5 - Width', 'Package 5 - Length',   # AT–AW
        'ShipFromAddress1', 'ShipFromAddress2', 'ShipFromAddress3',                   # AX–AZ
        'ShipFromCity', 'ShipFromState', 'ShipFromZip', 'ShipFromCountry',            # BA–BD
        'ShipFromCompany', 'ShipFromName', 'ShipFromPhone', 'ShipFromEmail',          # BE–BH
        'HasShipFromAddress',                                                         # BI
    ]

    
    output_rows = []
    
    seko_address = {
        'ShipToCompany': 'SEKO LOGISTICS MEXICO',
        'ShipToName': 'Marian Gonzalez',
        'ShipToAddress1': 'AV LERMA 1CBIS1 INT1A',
        'ShipToAddress2': 'SAN PEDRO TULTEPEC',
        'City': 'LERMA',
        'State': 'ESTADO DE MEXICO',
        'Zip': '52030',
        'ShipToPhone': '8116607459',
        'ShipToEmail': 'ops.mx1@sekologistics.com',
        'Country': 'MX'
    }
    
    total_processed = 0
    records_with_errors = 0
    
    for idx, row in df_raw.iterrows():
        fila_excel = idx + 2
        parent = str(row['Parent']).strip()
        
        if pd.isna(row['Parent']) or parent == 'None' or parent == '':
            continue
            
        is_return = parent.endswith('-1')
        total_processed += 1
        row_has_error = False
        
        # 1. Validación Estricta de Teléfono (a 10 dígitos)
        raw_phone = row.get('Contact number')
        phone_limpio, phone_es_valido, alerta_phone = validar_y_limpiar_telefono(raw_phone)
        if not phone_es_valido:
            registrar(fila_excel, parent, 'REVISAR', 'Teléfono', raw_phone, alerta_phone)
            phone_val = phone_limpio if len(phone_limpio) == 10 else 'ERROR: Celular Inválido'
            if phone_val == 'ERROR: Celular Inválido':
                row_has_error = True
        else:
            phone_val = phone_limpio
            
        # 2. Validación de Código Postal
        raw_zip = row.get('Zip / Postal code')
        zip_val = format_zip_code(raw_zip)
        if not zip_val:
            zip_val = 'ERROR: CP Faltante'
            row_has_error = True
            registrar(fila_excel, parent, 'ERROR', 'Código Postal', raw_zip, 'Código Postal faltante o vacío')
            
        # 3. Limpieza y preparación de Dirección
        raw_street = row.get('Street')
        raw_house = row.get('House / Appt number')
        raw_localidad = row.get('Localidad')
        raw_municipio = row.get('Municipio')
        raw_city = row.get('City')
        raw_state = row.get('State / Province')
        
        street_clean = clean_text_encoding(raw_street) if pd.notna(raw_street) else ""
        house_apt_clean = clean_text_encoding(raw_house) if pd.notna(raw_house) else ""
        localidad_clean = clean_text_encoding(raw_localidad) if pd.notna(raw_localidad) else ""
        municipio_clean = clean_text_encoding(raw_municipio) if pd.notna(raw_municipio) else ""
        city_raw_clean = clean_text_encoding(raw_city) if pd.notna(raw_city) else ""
        state_clean = clean_text_encoding(raw_state) if pd.notna(raw_state) else ""
        
        house_apt_clean = "" if str(house_apt_clean).strip().lower() == 'nan' else house_apt_clean
        localidad_clean = "" if str(localidad_clean).strip().lower() == 'nan' else localidad_clean
        
        has_address_error = False
        
        # Validar calle (campo mínimo obligatorio)
        if not street_clean or street_clean.strip() == "":
            has_address_error = True
            registrar(fila_excel, parent, 'ERROR', 'Calle (Street)', raw_street, 'Calle vacía o faltante')
        
        # Extraer ciudad limpia
        city_source = city_raw_clean.strip() if city_raw_clean.strip() else municipio_clean.strip()
        if not city_source:
            city_val = 'ERROR: Dirección incompleta'
            has_address_error = True
            registrar(fila_excel, parent, 'ERROR', 'Ciudad/Municipio', '', 'Ciudad y Municipio vacíos o faltantes')
        else:
            city_val, _ = parse_municipio(city_source)
        
        if not state_clean or state_clean.strip() == "":
            state_val = 'ERROR: Dirección incompleta'
            has_address_error = True
            registrar(fila_excel, parent, 'ERROR', 'Estado', raw_state, 'Estado/Provincia vacío o faltante')
        else:
            state_val = state_clean
            if state_val == "México":
                if city_val in ["Iztapalapa", "Gustavo A. Madero", "Azcapotzalco"]:
                    state_val = "CDMX"
                else:
                    state_val = "Estado de México"

        # 4. Análisis Postal SEPOMEX (Aplica tanto a Outbound como a Retornos)
        estatus_confirmacion = "POR VERIFICAR"
        detalle_confirmacion = ""
        an = None

        if zip_val and not str(zip_val).startswith('ERROR'):
            an = validador.analizar(
                zip_val,
                [municipio_clean, city_raw_clean, localidad_clean, state_clean],
                colonia=localidad_clean,
                texto_calle=f"{street_clean} {house_apt_clean}",
            )
            if not an['existe']:
                registrar(fila_excel, parent, 'ERROR', 'Código Postal', raw_zip,
                          f"El CP {zip_val} no existe en el catálogo SEPOMEX. Confirmar con solicitante.")
                has_address_error = True
                estatus_confirmacion = "ERROR CP"
            elif not an['coherente']:
                genericos = {'', 'CDMX', 'CIUDAD DE MEXICO', 'MEXICO', 'ESTADO DE MEXICO', 'EDO MEX', 'EDOMEX', 'DF', 'D F'}
                especificos = [t for t in (municipio_clean, city_raw_clean)
                               if normalizar_texto(t).split(',')[0].strip() not in genericos and normalizar_texto(t) not in genericos]
                if especificos:
                    registrar(fila_excel, parent, 'ERROR', 'CP vs Municipio/Ciudad', f"CP {zip_val} | Mun: {municipio_clean} | City: {city_raw_clean}",
                              f"El municipio capturado no coincide con el oficial del CP ({an['municipio_oficial'] or 'varios'}, {an['estado_oficial']}). Confirmar con solicitante.")
                    has_address_error = True
                    estatus_confirmacion = "ERROR MUNICIPIO"
                else:
                    registrar(fila_excel, parent, 'REVISAR', 'CP vs Municipio/Ciudad', f"CP {zip_val} | Mun: {municipio_clean} | City: {city_raw_clean}",
                              f"El Excel solo trae datos genéricos. El CP corresponde a {an['municipio_oficial'] or 'varios municipios'}, {an['estado_oficial']}.")
            else:
                # Ubicación coherente con el CP -> corregir Estado y Municipio oficial
                if normalizar_texto(state_val) != normalizar_texto(an['estado_plantilla']):
                    registrar(fila_excel, parent, 'CORREGIDO', 'State', state_val, f"'{an['estado_plantilla']}' (según CP {zip_val})")
                    state_val = an['estado_plantilla']
                if city_val and normalizar_texto(city_val) != normalizar_texto(an['municipio_oficial']):
                    registrar(fila_excel, parent, 'CORREGIDO', 'City', city_val, f"'{an['municipio_oficial']}' (municipio oficial del CP {zip_val})")
                    city_val = an['municipio_oficial']

        # 5. Compresión Inteligente y Protección de Número Interior (Address 1 y Address 2 <= 50 chars)
        colonia_en_calle = an.get('colonia_en_calle') if an else None
        colonia_oficial = None
        if an and an.get('existe'):
            if an.get('colonia_en_calle'):
                colonia_oficial = an['colonia_en_calle']
            elif an.get('colonia_ok'):
                colonia_oficial = localidad_clean
            elif len(an.get('colonias', [])) == 1:
                colonia_oficial = an['colonias'][0]

        fmt_dir = formatear_direccion_inteligente(
            calle_raw=street_clean,
            num_ext_int_raw=house_apt_clean,
            colonia_raw=localidad_clean if localidad_clean else municipio_clean,
            colonia_en_calle=colonia_en_calle,
            colonia_oficial=colonia_oficial
        )

        addr1_val = fmt_dir['addr1']
        addr2_val = fmt_dir['addr2']

        # Alerta si no tiene número exterior explícito (S/N)
        if fmt_dir['alerta_num_ext']:
            registrar(fila_excel, parent, 'REVISAR', 'Número Exterior', addr1_val, fmt_dir['alerta_num_ext'])

        # Alerta si hubo riesgo crítico de pérdida de interior
        if fmt_dir['error_longitud_critico']:
            has_address_error = True
            registrar(fila_excel, parent, 'ERROR', 'Longitud Dirección', addr1_val, fmt_dir['alerta_interior'])
        elif fmt_dir['interior_protegido']:
            registrar(fila_excel, parent, 'CORREGIDO', 'Número Interior', addr1_val,
                      f"Indicador de interior protegido y colocado al inicio de Address 2: '{addr2_val}'")

        if fmt_dir['colonia_extraida']:
            registrar(fila_excel, parent, 'CORREGIDO', 'Colonia (Addr2)', addr2_val,
                      "Colonia extraída de la calle y colocada limpia en Address 2.")
        elif an and an['existe']:
            if len(an['colonias']) == 1 and not an['colonia_ok']:
                colonia_unica = an['colonias'][0]
                if not fmt_dir['interior_protegido']:
                    addr2_val = colonia_unica
                registrar(fila_excel, parent, 'CORREGIDO', 'Colonia (Addr2)', colonia_unica,
                          f"Asignada automáticamente (Única colonia oficial del CP {zip_val}).")
            elif an['colonia_ok'] is False and len(an['colonias']) > 1:
                registrar(fila_excel, parent, 'REVISAR', 'Colonia (Localidad)', localidad_clean,
                          f"No coincide con ninguna colonia del catálogo para CP {zip_val}. Opciones oficiales: {', '.join(an['colonias'][:6])}...")


        # 6. Geocodificación y Verificación Física en Mapa (con Caché)
        if not has_address_error and zip_val and not str(zip_val).startswith('ERROR'):
            geo = validador.confirmar_geocodificacion(addr1_val, cp=zip_val, municipio=city_val, estado=state_val)
            estatus_confirmacion = geo['estatus']
            detalle_confirmacion = geo['display_name'] if geo['confirmado'] else f"CP {zip_val} y Municipio válidos en catálogo oficial SEPOMEX."
        else:
            detalle_confirmacion = "Requiere revisión previa por inconsistencia o error en dirección."

        # 7. Validación de Dirección de Retorno en Envío de Ida (Outbound)
        if not is_return and not has_address_error:
            street_lower = street_clean.lower()
            if ("lerma" in street_lower and ("av" in street_lower or "1c" in street_lower or "seko" in street_lower)) or (zip_val == "52030" and "lerma" in street_lower):
                addr1_val = 'ERROR: Dirección coincide con retorno'
                addr2_val = 'ERROR: Dirección coincide con retorno'
                has_address_error = True
                registrar(fila_excel, parent, 'ERROR', 'Dirección Outbound', raw_street, 'Envío de ida tiene dirección de retorno (SEKO/Lerma)')
                    
        if has_address_error:
            row_has_error = True
            records_with_errors += 1
            
        # Extraer información del empleado
        first_name = clean_text_encoding(row.get('Recipient first name'))
        last_name = clean_text_encoding(row.get('Recipient last name'))
        full_name = f"{first_name} {last_name}".strip() if pd.notna(first_name) or pd.notna(last_name) else ""
        email = str(row.get('Email') or row.get('Contact Email Address ') or "").strip()
        
        service_code = map_service_code(row.get('State'), is_return=is_return)
        
        # ── Estructura del registro Techship (49 columnas A–AW) ──
        tech_row = {col: None for col in techship_columns}
        tech_row['ClientCode'] = 11
        tech_row['CustomerOrder'] = parent
        tech_row['CustomerPO'] = parent
        
        tech_row['OrderWeight'] = 3
        tech_row['Package 1 - Weight'] = 3
        tech_row['Package 1 - Height'] = 51
        tech_row['Package 1 - Width'] = 38
        tech_row['Package 1 - Length'] = 15
        
        raw_declared_value = row.get('Declared Value', row.get('DeclaredValue', None))
        if raw_declared_value is None or (isinstance(raw_declared_value, float) and pd.isna(raw_declared_value)):
            raw_declared_value = default_declared_value
        ins_type, ins_amount = resolve_insurance(raw_declared_value)
        tech_row['DeclaredValueType'] = ins_type if ins_type else None
        tech_row['DeclaredValue'] = ins_amount if ins_type == 'PU' else None
        
        if not is_return:
            # OUTBOUND: Destinatario = Empleado
            tech_row['PickOrder'] = f"KYNDRYL_{parent}"
            tech_row['ShipToCompany'] = full_name
            tech_row['ShipToName'] = full_name
            tech_row['ShipToAddress1'] = addr1_val
            tech_row['ShipToAddress2'] = addr2_val
            tech_row['ShipToAddress3'] = None  # En Techship la etiqueta física solo imprime Address 1 y 2
            tech_row['City'] = city_val
            tech_row['State'] = state_val
            tech_row['Country'] = 'MX'
            tech_row['Zip'] = zip_val
            tech_row['ShipToPhone'] = phone_val
            tech_row['ShipToEmail'] = email
            tech_row['SelectedServiceCode'] = service_code
            tech_row['HasShipFromAddress'] = False
            
            resumen_direcciones.append({
                'Orden (RITM)': parent,
                'Tipo Envío': 'OUTBOUND (Entrega)',
                'Estatus Dirección': estatus_confirmacion,
                'Address 1 (Calle y Num)': addr1_val,
                'Address 2 (Colonia)': addr2_val,
                'Ciudad / Municipio': city_val,
                'Estado': state_val,
                'Código Postal': zip_val,
                'Teléfono (10d)': phone_val,
                'Verificación Mapa': detalle_confirmacion
            })
        else:
            # RETURN: Destinatario fijo = SEKO Logistics (Lerma)
            tech_row['PickOrder'] = parent
            for key, val in seko_address.items():
                tech_row[key] = val
            tech_row['SelectedServiceCode'] = service_code
            tech_row['HasShipFromAddress'] = True
            
            # Remitente (ShipFrom) = empleado con dirección validada
            tech_row['ShipFromAddress1'] = addr1_val
            tech_row['ShipFromAddress2'] = addr2_val
            tech_row['ShipFromAddress3'] = None
            tech_row['ShipFromCity'] = city_val
            tech_row['ShipFromState'] = state_val
            tech_row['ShipFromZip'] = zip_val
            tech_row['ShipFromCountry'] = 'MX'
            tech_row['ShipFromCompany'] = full_name
            tech_row['ShipFromName'] = full_name
            tech_row['ShipFromPhone'] = phone_val
            tech_row['ShipFromEmail'] = email
            
            # Registrar el domicilio del empleado de origen en Resumen Direcciones para auditoría de recolección
            resumen_direcciones.append({
                'Orden (RITM)': f"{parent} [RETORNO]",
                'Tipo Envío': 'RETORNO (Recolección en Empleado)',
                'Estatus Dirección': estatus_confirmacion,
                'Address 1 (Calle y Num)': addr1_val,
                'Address 2 (Colonia)': addr2_val,
                'Ciudad / Municipio': city_val,
                'Estado': state_val,
                'Código Postal': zip_val,
                'Teléfono (10d)': phone_val,
                'Verificación Mapa': detalle_confirmacion
            })
            
        output_rows.append(tech_row)

    # ── Completar ShipFrom de los retornos (-1) con la orden de ida correspondiente si existe ──
    shipfrom_map = {
        'ShipFromAddress1': 'ShipToAddress1',
        'ShipFromAddress2': 'ShipToAddress2',
        'ShipFromAddress3': 'ShipToAddress3',
        'ShipFromCity': 'City',
        'ShipFromState': 'State',
        'ShipFromZip': 'Zip',
        'ShipFromCompany': 'ShipToCompany',
        'ShipFromName': 'ShipToName',
        'ShipFromPhone': 'ShipToPhone',
        'ShipFromEmail': 'ShipToEmail',
    }
    outbound_by_parent = {
        r['CustomerOrder']: r for r in output_rows if not str(r['CustomerOrder']).endswith('-1')
    }
    for r in output_rows:
        parent = str(r['CustomerOrder'])
        if not parent.endswith('-1'):
            continue
        outbound = outbound_by_parent.get(parent[:-2])
        if outbound is not None:
            for dst, src in shipfrom_map.items():
                if outbound.get(src) is not None:
                    r[dst] = outbound.get(src)
            r['ShipFromCountry'] = 'MX'
            r['HasShipFromAddress'] = True
        
    # ── Crear DataFrame y formatear tipos de datos ──
    df_output = pd.DataFrame(output_rows, columns=techship_columns)
    
    str_columns = [
        'ClientCode', 'PickOrder', 'CustomerOrder', 'CustomerPO',
        'ShipToCompany', 'ShipToName', 'ShipToAddress1', 'ShipToAddress2', 'ShipToAddress3',
        'City', 'State', 'Country', 'Zip', 'ShipToPhone', 'ShipToEmail',
        'ServiceCodeDescription', 'DeclaredValueType',
        'SignatureAdult', 'SignatureRequired', 'DoNotSafeDrop',
        'CollectOnDeliveryMethod',
        'ShipFromAddress1', 'ShipFromAddress2', 'ShipFromAddress3',
        'ShipFromCity', 'ShipFromState', 'ShipFromZip', 'ShipFromCountry',
        'ShipFromCompany', 'ShipFromName', 'ShipFromPhone', 'ShipFromEmail',
    ]
    for col in str_columns:
        if col in df_output.columns:
            df_output[col] = df_output[col].apply(
                lambda v: str(v) if v is not None and not (isinstance(v, float) and pd.isna(v)) else v
            )
    
    float_columns = [
        'DeclaredValue', 'OrderWeight', 'CollectOnDeliveryAmount',
        'Package 1 - Weight', 'Package 1 - Height', 'Package 1 - Width', 'Package 1 - Length',
        'Package 2 - Weight', 'Package 2 - Height', 'Package 2 - Width', 'Package 2 - Length',
        'Package 3 - Weight', 'Package 3 - Height', 'Package 3 - Width', 'Package 3 - Length',
        'Package 4 - Weight', 'Package 4 - Height', 'Package 4 - Width', 'Package 4 - Length',
        'Package 5 - Weight', 'Package 5 - Height', 'Package 5 - Width', 'Package 5 - Length',
    ]
    for col in float_columns:
        if col in df_output.columns:
            df_output[col] = pd.to_numeric(df_output[col], errors='coerce')
    
    FILL_GOLD = PatternFill(start_color='D7C87F', end_color='D7C87F', fill_type='solid')
    FILL_GRAY = PatternFill(start_color='D9D9D9', end_color='D9D9D9', fill_type='solid')
    FILL_GREEN = PatternFill(start_color='A9C47F', end_color='A9C47F', fill_type='solid')
    FILL_LIGHT_GREEN = PatternFill(start_color='C4E1A4', end_color='C4E1A4', fill_type='solid')
    
    FONT_HEADER = Font(name='Calibri', size=11, bold=True)
    FONT_DATA = Font(name='Calibri', size=11)
    
    COL_CLIENT_CODE = 1
    COL_COUNTRY = 16
    COLS_SHIPTO_DATA = [2, 4, 5, 9, 10, 11, 12, 14, 15, 17, 18, 19]
    COLS_SHIPTO_RETURN = list(range(9, 20))
    COLS_SERVICE_INS_PKG = list(range(21, 50))
    COLS_SHIPFROM = list(range(50, 62))
    
    # ── Exportar archivo Techship principal (Hoja ÚNICA 'Import Orders' de 61 columnas) ──
    with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
        df_output.to_excel(writer, index=False, sheet_name='Import Orders')
        ws = writer.sheets['Import Orders']
        
        # Estilos visuales de Import Orders
        for c in range(1, len(techship_columns) + 1):
            cell = ws.cell(row=1, column=c)
            cell.font = FONT_HEADER
        
        for row_idx in range(2, len(df_output) + 2):
            pick_order = ws.cell(row=row_idx, column=2).value
            is_ret = str(pick_order).endswith('-1') if pick_order else False
            
            for c in range(1, len(techship_columns) + 1):
                cell = ws.cell(row=row_idx, column=c)
                cell.font = FONT_DATA
                
                if c == COL_CLIENT_CODE or c == COL_COUNTRY:
                    cell.fill = FILL_GOLD
                elif c in COLS_SHIPTO_DATA or c == 12:
                    if is_ret:
                        if c in COLS_SHIPTO_RETURN or c == 13:
                            cell.fill = FILL_GREEN
                        else:
                            cell.fill = FILL_GOLD
                    else:
                        cell.fill = FILL_GRAY
                elif c in COLS_SERVICE_INS_PKG:
                    cell.fill = FILL_LIGHT_GREEN
                elif c in COLS_SHIPFROM and is_ret:
                    cell.fill = FILL_GRAY
        
        # Auto-ajuste de anchos en Import Orders
        for col_idx, col_name in enumerate(df_output.columns, 1):
            max_len = len(str(col_name))
            for val in df_output[col_name].dropna():
                val_len = len(str(val))
                if val_len > max_len:
                    max_len = val_len
            ws.column_dimensions[openpyxl.utils.get_column_letter(col_idx)].width = max_len + 2

    # ── Exportar archivo de Auditoría complementario (Resumen Direcciones e Incidencias) ──
    audit_name = os.path.basename(output_path)
    if audit_name.startswith("Guias_Techship_Importada_"):
        audit_name = audit_name.replace("Guias_Techship_Importada_", "Auditoria_Direcciones_")
    else:
        audit_name = f"Auditoria_{audit_name}"
    audit_path = str(Path(output_path).parent / audit_name)
    
    with pd.ExcelWriter(audit_path, engine='openpyxl') as writer_audit:
        df_resumen = pd.DataFrame(resumen_direcciones)
        df_resumen.to_excel(writer_audit, index=False, sheet_name='Resumen Direcciones')
        ws_resumen = writer_audit.sheets['Resumen Direcciones']
        for col_letter, ancho in zip('ABCDEFGHIJ', [18, 26, 32, 34, 28, 22, 18, 14, 16, 55]):
            ws_resumen.column_dimensions[col_letter].width = ancho

        orden = {'ERROR': 0, 'REVISAR': 1, 'CORREGIDO': 2}
        df_inc = pd.DataFrame(
            sorted(incidencias, key=lambda x: (orden.get(x[2], 9), x[0])),
            columns=['Fila Excel origen', 'Orden (RITM)', 'Tipo', 'Campo', 'Valor capturado', 'Detalle'],
        )
        df_inc.to_excel(writer_audit, index=False, sheet_name='Incidencias')
        ws_inc = writer_audit.sheets['Incidencias']
        for col_letter, ancho in zip('ABCDEF', [16, 16, 12, 24, 40, 110]):
            ws_inc.column_dimensions[col_letter].width = ancho
    
    print(f"Exportación Techship exitosa (61 columnas, hoja única): {output_path}")
    print(f"Auditoría complementaria generada: {audit_path}")
    print(f"Proceso terminado. {total_processed} registros procesados, {records_with_errors} registros contienen errores.")



def detect_files(input_target=None, output_target=None):
    if input_target and os.path.isfile(input_target):
        archivo_entrada = input_target
    else:
        carpetas_busqueda = []
        if input_target and os.path.isdir(input_target):
            carpetas_busqueda.append(Path(input_target))
        carpetas_busqueda.extend([
            PROJECT_ROOT / "data" / "input",
            PROJECT_ROOT / "data" / "samples",
            Path.cwd(),
        ])

        reportes_crudos = []
        for carpeta in carpetas_busqueda:
            if not carpeta.exists():
                continue
            archivos = [carpeta / f for f in os.listdir(carpeta) if f.endswith(".xlsx")]
            for f in archivos:
                n = f.name
                if n.startswith("~$") or n.startswith("Guias ") or "Guias_Techship" in n or n.startswith("Cierre_"):
                    continue
                reportes_crudos.append(f)
            if reportes_crudos:
                break

        if not reportes_crudos:
            raise FileNotFoundError("No se encontró ningún reporte crudo (.xlsx) en data/input ni en data/samples.")

        reportes_crudos.sort(key=lambda x: x.stat().st_mtime, reverse=True)
        archivo_entrada = str(reportes_crudos[0])
        print(f"Archivo de entrada detectado: {os.path.basename(archivo_entrada)}")

    entrada_nombre = os.path.basename(archivo_entrada)
    sufijo = entrada_nombre
    for prefijo in ["SCTASK_SHP_Combined_Report_", "SCTASK_SHP_", "SCTASK_"]:
        if sufijo.startswith(prefijo):
            sufijo = sufijo[len(prefijo):]
            break
    sufijo = sufijo.replace(".xlsx", "")
    nombre_salida = f"Guias_Techship_Importada_{sufijo}.xlsx"

    if output_target:
        if os.path.isdir(output_target):
            archivo_salida = str(Path(output_target) / nombre_salida)
        else:
            archivo_salida = output_target
    else:
        out_dir = PROJECT_ROOT / "data" / "output"
        out_dir.mkdir(parents=True, exist_ok=True)
        archivo_salida = str(out_dir / nombre_salida)

    return archivo_entrada, archivo_salida


def generar_guias(input_target=None, output_target=None):
    """
    Función de entrada para el pipeline maestro y automatizaciones externas.
    Procesa el archivo SCTASK y genera la plantilla oficial de Techship (61 columnas)
    junto con la auditoría de validación SEPOMEX.
    
    Retorna:
        str: Ruta al archivo Excel generado (Guias_Techship_Importada_*.xlsx)
    """
    archivo_entrada, archivo_salida = detect_files(input_target, output_target)
    process_excel(archivo_entrada, archivo_salida)
    return archivo_salida



if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Procesa reporte de órdenes y genera plantilla para Techship.")
    parser.add_argument("--input", "-i", help="Ruta del archivo o carpeta de entrada (.xlsx)")
    parser.add_argument("--output", "-o", help="Ruta del archivo o carpeta de salida (.xlsx)")
    args = parser.parse_args()

    try:
        archivo_entrada, archivo_salida = detect_files(args.input, args.output)
        process_excel(archivo_entrada, archivo_salida)
    except FileNotFoundError as e:
        print(f"\n[ERROR] {e}\n")
        raise SystemExit(1)
    except PermissionError as e:
        file_err = f" '{os.path.basename(e.filename)}'" if getattr(e, "filename", None) else " de Excel"
        print(f"\n[ERROR DE PERMISO] No se pudo acceder al archivo{file_err}.")
        print("Esto ocurre porque el archivo está abierto en Microsoft Excel.")
        print("Por favor, cierra el archivo en Excel y vuelve a ejecutar el script.\n")
        raise SystemExit(1)
