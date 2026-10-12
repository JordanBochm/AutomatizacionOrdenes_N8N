import os
import re
import pandas as pd
import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment

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
    Resuelve el problema de que Excel elimine los ceros a la izquierda y agregue decimales (.0).
    """
    if pd.isna(zip_val):
        return ""
    try:
        numeric_zip = int(float(zip_val))
        return f"{numeric_zip:05d}"
    except (ValueError, TypeError):
        return str(zip_val).strip().split('.')[0].zfill(5)

def format_phone_number(phone_val):
    """
    Limpia y formatea el número de teléfono móvil/fijo a 10 dígitos.
    Elimina el prefijo internacional '+52' y caracteres no numéricos.
    """
    if pd.isna(phone_val):
        return ""
    
    phone_str = str(phone_val).strip()
    
    if phone_str.endswith('.0'):
        phone_str = phone_str[:-2]
        
    phone_digits = re.sub(r'[^\d+]', '', phone_str)
    
    if phone_digits.startswith('+52'):
        phone_digits = phone_digits[3:]
    elif phone_digits.startswith('52') and len(phone_digits) > 10:
        phone_digits = phone_digits[2:]
        
    return phone_digits[-10:]

def smart_truncate_address(address, max_length=50):
    """
    Trunca inteligentemente una dirección que exceda max_length caracteres.
    Corta en el último espacio disponible antes del límite para no partir palabras.
    Retorna una tupla (parte1, parte2) donde parte2 es el texto sobrante o None.
    """
    if not isinstance(address, str) or len(address) <= max_length:
        return address, None

    # Buscar el último espacio dentro del límite para no cortar palabras
    cut_pos = address.rfind(' ', 0, max_length)
    if cut_pos == -1:
        # No hay espacio; cortar en el límite duro
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

    # Patrones que indican inicio de colonia/fraccionamiento
    col_patterns = [r'\bCol\.\s*', r'\bColonia\s+', r'\bFracc\.\s*', r'\bFraccionamiento\s+']

    for pattern in col_patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            before = text[:match.start()].strip().rstrip(',')
            after = text[match.start():].strip()
            # Si antes del patrón hay texto, ese es la ciudad
            if before:
                return before, after
            # Si la colonia está al inicio (ej. 'Fracc. Los Olivos, Zapopan'),
            # buscar la ciudad después de una coma dentro del segmento restante
            comma_in_after = after.find(',')
            if comma_in_after != -1:
                colonia_part = after[:comma_in_after].strip()
                city_part = after[comma_in_after + 1:].strip()
                return city_part, colonia_part
            # Sin coma y sin texto previo: todo es colonia, ciudad desconocida
            return after, None

    # Sin patrón de colonia, intentar separar por coma
    if ',' in text:
        parts = text.split(',', 1)
        return parts[0].strip(), parts[1].strip() if parts[1].strip() else None

    return text, None

def find_black_line_row(sheet):
    """
    Busca el índice de la fila que representa la 'línea negra' en la hoja de Excel.
    Se define como una fila que no tiene datos (vacía) pero tiene formato de relleno negro sólido.
    """
    for r in range(2, sheet.max_row + 1):
        row_cells = [sheet.cell(row=r, column=c) for c in range(1, sheet.max_column + 1)]
        is_empty = all(cell.value is None for cell in row_cells)
        
        has_black_fill = False
        first_cell_fill = sheet.cell(row=r, column=1).fill
        if first_cell_fill and first_cell_fill.fill_type == 'solid':
            color_val = first_cell_fill.start_color.value
            if color_val == '00000000' or color_val == 8 or color_val == 'FF000000':
                has_black_fill = True
                
        if is_empty and has_black_fill:
            return r
            
    for r in range(2, sheet.max_row + 1):
        row_cells = [sheet.cell(row=r, column=c) for c in range(1, sheet.max_column + 1)]
        if all(cell.value is None for cell in row_cells):
            return r
            
    return None

def map_service_code(state_val, is_return=False):
    """
    Mapea el campo 'State' de origen al 'SelectedServiceCode' de Techship.
    - Si el valor de origen es 60 (o contiene 'next day' / 'second day') -> 'Next Day'
    - Si el valor de origen es 70 (o contiene 'ground') -> 'Ground'
    - Para retornos -> 'Ground' (asociado a la lógica de retorno/código 70)
    """
    if is_return:
        return 70
        
    if pd.isna(state_val):
        return 70
        
    val_str = str(state_val).strip().lower()
    
    # Mapeo basado en la plantilla funcional de Techship:
    # Ground -> 70, Next Day / Second Day -> 60
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
    
    Valores de retorno para TechShip:
      - 'PU': Código estandarizado para seguro Purchase (max 2 chars).
      - ''  : Celda vacía (casilla desmarcada, sin seguro).
    
    Args:
        declared_value: Valor declarado de la mercancía (puede ser int, float, str o None).
        min_insurable:  Monto mínimo para que el seguro aplique (default: 100).
    
    Returns:
        tuple: (declared_value_type: str, declared_value_amount: float)
               Ejemplo: ('PU', 1500.00) o ('', 0.0)
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
    
    # 1. Encontrar la línea negra divisoria para filtrar
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
    
    # ── Columnas basadas en File_Template_NewInsurance.xlsx + ShipToCompany (requerido por Estafeta) ──
    # Se agrega ShipToCompany (col I) porque la API de Estafeta exige 'corporateName' != null.
    # Total: 49 columnas (A–AW).
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
        parent = str(row['Parent']).strip()
        
        if pd.isna(row['Parent']) or parent == 'None' or parent == '':
            continue
            
        is_return = parent.endswith('-1')
        total_processed += 1
        row_has_error = False
        
        # 1. Validación de Teléfono
        raw_phone = row.get('Contact number')
        phone = format_phone_number(raw_phone)
        if pd.isna(raw_phone) or phone == "" or len(phone) != 10:
            phone_val = 'ERROR: Celular Inválido'
            row_has_error = True
            print(f"  [ERROR] Fila {idx+2} ({parent}): Celular inválido o vacío: {repr(raw_phone)}")
        else:
            phone_val = phone
            
        # 2. Validación de Código Postal
        raw_zip = row.get('Zip / Postal code')
        if pd.isna(raw_zip) or str(raw_zip).strip() == "":
            zip_val = 'ERROR: CP Faltante'
            row_has_error = True
            print(f"  [ERROR] Fila {idx+2} ({parent}): Código Postal faltante o vacío")
        else:
            zip_val = format_zip_code(raw_zip)
            
        # 3. Validación de Dirección (Campos: Street, House/Appt, Localidad, Municipio, City, State/Province)
        raw_street = row.get('Street')
        raw_house = row.get('House / Appt number')
        raw_localidad = row.get('Localidad')
        raw_municipio = row.get('Municipio')
        raw_city = row.get('City')
        raw_state = row.get('State / Province')
        
        # Limpiar codificación de cada campo
        street_clean = clean_text_encoding(raw_street) if pd.notna(raw_street) else ""
        house_apt_clean = clean_text_encoding(raw_house) if pd.notna(raw_house) else ""
        localidad_clean = clean_text_encoding(raw_localidad) if pd.notna(raw_localidad) else ""
        municipio_clean = clean_text_encoding(raw_municipio) if pd.notna(raw_municipio) else ""
        city_raw_clean = clean_text_encoding(raw_city) if pd.notna(raw_city) else ""
        state_clean = clean_text_encoding(raw_state) if pd.notna(raw_state) else ""
        
        # Filtrar valores que sean 'nan' como string
        house_apt_clean = "" if str(house_apt_clean).strip().lower() == 'nan' else house_apt_clean
        localidad_clean = "" if str(localidad_clean).strip().lower() == 'nan' else localidad_clean
        
        # Validar campos individuales
        has_address_error = False
        
        # --- Validar calle (campo mínimo obligatorio) ---
        if not street_clean or street_clean.strip() == "":
            has_address_error = True
            print(f"  [ERROR] Fila {idx+2} ({parent}): Calle (Street) vacía o faltante")
        
        # --- City: Extraer ciudad limpia para columna City de Techship ---
        # Prioridad: columna 'City' del crudo; si está vacía, usar 'Municipio'
        city_val = None
        city_source = city_raw_clean.strip() if city_raw_clean.strip() else municipio_clean.strip()
        if not city_source:
            city_val = 'ERROR: Dirección incompleta'
            has_address_error = True
            print(f"  [ERROR] Fila {idx+2} ({parent}): Ciudad y Municipio vacíos o faltantes")
        else:
            city_val, _ = parse_municipio(city_source)
        
        # --- Distribución limpia de campos de dirección ---
        addr1_val = None
        addr2_val = None
        addr3_val = None
        
        if has_address_error:
            addr1_val = 'ERROR: Dirección incompleta'
        else:
            # --- Address 1 (Calle + Número) ---
            calle_numero = street_clean
            if house_apt_clean:
                calle_numero = f"{street_clean} {house_apt_clean}"
            
            if len(calle_numero) <= 50:
                addr1_val = calle_numero
            else:
                # Overflow de Address 1 va a Address 3 (no mezclar con colonia)
                addr1_val, addr3_val = smart_truncate_address(calle_numero, max_length=50)
                print(f"  [INFO] Fila {idx+2} ({parent}): Addr1 excede 50 chars -> "
                      f"Addr1='{addr1_val}' | Addr3='{addr3_val}'")
            
            # --- Address 2 (Colonia / Localidad) ---
            # Regla Estafeta: settlementName no puede ser nulo -> fallback a Municipio
            if localidad_clean:
                addr2_val = localidad_clean
            elif municipio_clean:
                addr2_val = municipio_clean
                print(f"  [INFO] Fila {idx+2} ({parent}): Localidad vacía, usando Municipio "
                      f"como Addr2: '{municipio_clean}'")
            
            # Truncar Address 2 si supera 50 caracteres
            if addr2_val and len(addr2_val) > 50:
                addr2_val = addr2_val[:50].rstrip()
                print(f"  [INFO] Fila {idx+2} ({parent}): Addr2 truncado a 50 chars: '{addr2_val}'")

        if not state_clean or state_clean.strip() == "":
            state_val = 'ERROR: Dirección incompleta'
            has_address_error = True
            print(f"  [ERROR] Fila {idx+2} ({parent}): Estado/Provincia vacío o faltante")
        else:
            state_val = state_clean
            if state_val == "México":
                if city_val in ["Iztapalapa", "Gustavo A. Madero", "Azcapotzalco"]:
                    state_val = "CDMX"
                else:
                    state_val = "Estado de México"
                    
        # 4. Validación de Dirección de Retorno en Envío de Ida (Outbound)
        if not is_return and not has_address_error:
            street_lower = street_clean.lower()
            # Si contiene 'lerma' y ('av', '1c', o 'seko'), o si el CP es 52030 (SEKO) y la calle contiene 'lerma'
            if ("lerma" in street_lower and ("av" in street_lower or "1c" in street_lower or "seko" in street_lower)) or (zip_val == "52030" and "lerma" in street_lower):
                addr1_val = 'ERROR: Dirección coincide con retorno'
                addr2_val = 'ERROR: Dirección coincide con retorno'
                has_address_error = True
                print(f"  [ERROR] Fila {idx+2} ({parent}): Envío de ida tiene dirección de retorno (SEKO/Lerma): {repr(raw_street)}")
                    
        if has_address_error:
            row_has_error = True
            
        # Incrementar contador de filas con error si aplica
        if row_has_error:
            records_with_errors += 1
            
        # Extraer información del empleado
        first_name = clean_text_encoding(row.get('Recipient first name'))
        last_name = clean_text_encoding(row.get('Recipient last name'))
        full_name = f"{first_name} {last_name}".strip() if pd.notna(first_name) or pd.notna(last_name) else ""
        
        email = str(row.get('Email') or row.get('Contact Email Address ') or "").strip()
        
        # Mapeo del código de servicio
        service_code = map_service_code(row.get('State'), is_return=is_return)
        
        # Estructura del registro Techship (48 columnas — NewInsurance)
        tech_row = {col: None for col in techship_columns}
        tech_row['ClientCode'] = 11
        tech_row['CustomerOrder'] = parent
        tech_row['CustomerPO'] = parent
        
        # Valores de paquete por defecto
        tech_row['OrderWeight'] = 3
        tech_row['Package 1 - Weight'] = 3
        tech_row['Package 1 - Height'] = 51
        tech_row['Package 1 - Width'] = 38
        tech_row['Package 1 - Length'] = 15
        
        # ── Lógica de seguro (DeclaredValueType + DeclaredValue) ──
        # Prioridad: columna del archivo de origen > parámetro default_declared_value > None (vacío)
        raw_declared_value = row.get('Declared Value', row.get('DeclaredValue', None))
        if raw_declared_value is None or (isinstance(raw_declared_value, float) and pd.isna(raw_declared_value)):
            raw_declared_value = default_declared_value
        ins_type, ins_amount = resolve_insurance(raw_declared_value)
        tech_row['DeclaredValueType'] = ins_type if ins_type else None
        tech_row['DeclaredValue'] = ins_amount if ins_type == 'PU' else None
        print(f"  [SEGURO] {parent}: DeclaredValueType={ins_type or '(vacío)'}, DeclaredValue={ins_amount if ins_type == 'PU' else 'N/A'}")
        
        if not is_return:
            # OUTBOUND
            tech_row['PickOrder'] = f"KYNDRYL_{parent}"
            
            tech_row['ShipToCompany'] = full_name
            tech_row['ShipToName'] = full_name
            tech_row['ShipToAddress1'] = addr1_val
            tech_row['ShipToAddress2'] = addr2_val
            tech_row['ShipToAddress3'] = addr3_val
            tech_row['City'] = city_val
            tech_row['State'] = state_val
            tech_row['Country'] = 'MX'
            tech_row['Zip'] = zip_val
            tech_row['ShipToPhone'] = phone_val
            tech_row['ShipToEmail'] = email
            tech_row['SelectedServiceCode'] = service_code
        else:
            # RETURN — Destinatario fijo (SEKO)
            tech_row['PickOrder'] = parent
            
            for key, val in seko_address.items():
                tech_row[key] = val
            tech_row['SelectedServiceCode'] = service_code
            
        output_rows.append(tech_row)
        
    # ── Crear DataFrame y limpiar tipos de datos antes de exportar ──
    df_output = pd.DataFrame(output_rows, columns=techship_columns)
    
    # Asegurar tipos correctos para evitar errores de formato en Excel
    str_columns = [
        'ClientCode', 'PickOrder', 'CustomerOrder', 'CustomerPO',
        'ShipToCompany', 'ShipToName', 'ShipToAddress1', 'ShipToAddress2', 'ShipToAddress3',
        'City', 'State', 'Country', 'Zip', 'ShipToPhone', 'ShipToEmail',
        'ServiceCodeDescription', 'DeclaredValueType',
        'SignatureAdult', 'SignatureRequired', 'DoNotSafeDrop',
        'CollectOnDeliveryMethod',
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
    
    # ── Definir colores RGB equivalentes a los temas del template ──
    # Dorado/Oliva claro (para ClientCode y Country)
    FILL_GOLD = PatternFill(start_color='D7C87F', end_color='D7C87F', fill_type='solid')
    # Gris claro (para datos ShipTo en filas outbound)
    FILL_GRAY = PatternFill(start_color='D9D9D9', end_color='D9D9D9', fill_type='solid')
    # Verde oliva (para datos ShipTo en filas de retorno - SEKO)
    FILL_GREEN = PatternFill(start_color='A9C47F', end_color='A9C47F', fill_type='solid')
    # Verde claro (para SelectedServiceCode, seguro, paquetes)
    FILL_LIGHT_GREEN = PatternFill(start_color='C4E1A4', end_color='C4E1A4', fill_type='solid')
    
    FONT_HEADER = Font(name='Calibri', size=11, bold=True)
    FONT_DATA = Font(name='Calibri', size=11)
    
    # ── Índices de columna (1-indexed) — 49 columnas (A–AW) ──
    # A(1)=ClientCode, B(2)=PickOrder, ..., I(9)=ShipToCompany, J(10)=ShipToName,
    # K(11)=Addr1, ..., P(16)=Country, Q(17)=Zip, ..., U(21)=SelectedServiceCode,
    # V(22)=DeclaredValueType, W(23)=DeclaredValue, ..., AD(30)=Pkg1-Weight, ..., AW(49)=Pkg5-Length
    COL_CLIENT_CODE = 1
    COL_COUNTRY = 16                                            # Country = col P = 16
    COLS_SHIPTO_DATA = [2, 4, 5, 9, 10, 11, 12, 14, 15, 17, 18, 19]  # PickOrder, CustOrder, CustPO, ShipTo*
    COLS_SHIPTO_RETURN = list(range(9, 20))                     # ShipToCompany(9) a ShipToEmail(19)
    COLS_SERVICE_INS_PKG = list(range(21, 50))                  # SelectedServiceCode(21) a Pkg5-Length(49)
    
    with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
        df_output.to_excel(writer, index=False, sheet_name='Import Orders')
        ws = writer.sheets['Import Orders']
        
        # 1. Estilo del header (fila 1)
        for c in range(1, len(techship_columns) + 1):
            cell = ws.cell(row=1, column=c)
            cell.font = FONT_HEADER
        
        # 2. Estilo de filas de datos
        for row_idx in range(2, len(df_output) + 2):
            pick_order = ws.cell(row=row_idx, column=2).value  # PickOrder
            is_return = str(pick_order).endswith('-1') if pick_order else False
            
            for c in range(1, len(techship_columns) + 1):
                cell = ws.cell(row=row_idx, column=c)
                cell.font = FONT_DATA
                
                # ClientCode (col 1) y Country (col 16): siempre Dorado
                if c == COL_CLIENT_CODE or c == COL_COUNTRY:
                    cell.fill = FILL_GOLD
                # Zona de datos ShipTo (cols 2,4,5,9-19)
                elif c in COLS_SHIPTO_DATA or c == 12:
                    if is_return:
                        # Retorno: ShipTo es SEKO -> verde oliva para cols 9-19
                        if c in COLS_SHIPTO_RETURN or c == 13:
                            cell.fill = FILL_GREEN
                        else:
                            cell.fill = FILL_GOLD  # PickOrder, CustOrder, CustPO en retorno
                    else:
                        # Outbound: ShipTo es el empleado -> gris claro
                        cell.fill = FILL_GRAY
                # Zona de ServiceCode + Seguro + Paquetes (cols 21-49)
                elif c in COLS_SERVICE_INS_PKG:
                    cell.fill = FILL_LIGHT_GREEN
        
        # 3. Auto-ajustar el ancho de cada columna al contenido más largo
        for col_idx, col_name in enumerate(df_output.columns, 1):
            max_len = len(str(col_name))
            for val in df_output[col_name].dropna():
                val_len = len(str(val))
                if val_len > max_len:
                    max_len = val_len
            ws.column_dimensions[openpyxl.utils.get_column_letter(col_idx)].width = max_len + 2
    
    print(f"Exportación exitosa. Archivo generado en: {output_path}")
    print(f"Proceso terminado. {total_processed} registros procesados, {records_with_errors} registros contienen errores.")

def detect_files(directorio):
    """
    Detecta automáticamente el archivo de reporte crudo de entrada y define el de salida.
    Ignora archivos temporales de Excel (~$), la plantilla ('Guias ') y los archivos de salida generados.
    """
    archivos = [f for f in os.listdir(directorio) if f.endswith('.xlsx')]
    
    reportes_crudos = []
    for f in archivos:
        # Ignorar archivos temporales ocultos de Excel
        if f.startswith('~$'):
            continue
        # Ignorar la plantilla y los archivos de salida generados
        if f.startswith('Guias ') or 'Guias_Techship' in f:
            continue
        reportes_crudos.append(f)
        
    if len(reportes_crudos) == 0:
        raise FileNotFoundError("No se encontró ningún archivo de reporte crudo (.xlsx) en el directorio.")
    elif len(reportes_crudos) > 1:
        # Si hay más de uno, tomamos el más reciente por fecha de modificación
        reportes_crudos.sort(key=lambda x: os.path.getmtime(os.path.join(directorio, x)), reverse=True)
        print(f"⚠️ Se detectaron múltiples archivos de reporte. Se seleccionó el más reciente: {reportes_crudos[0]}")
        
    entrada_nombre = reportes_crudos[0]
    archivo_entrada = os.path.join(directorio, entrada_nombre)
    
    # Generar el nombre de salida dinámicamente
    sufijo = entrada_nombre
    for prefijo in ["SCTASK_SHP_Combined_Report_", "SCTASK_SHP_", "SCTASK_"]:
        if sufijo.startswith(prefijo):
            sufijo = sufijo[len(prefijo):]
            break
    sufijo = sufijo.replace(".xlsx", "")
    
    archivo_salida = os.path.join(directorio, f"Guias_Techship_Importada_{sufijo}.xlsx")
    return archivo_entrada, archivo_salida

if __name__ == '__main__':
    directorio_base = r"c:\Users\KSTSu\OneDrive - Seko Global Logistics\Desktop\ProyectoAutomatizacionOrdenes"
    
    try:
        archivo_entrada, archivo_salida = detect_files(directorio_base)
        process_excel(archivo_entrada, archivo_salida)
    except FileNotFoundError as e:
        print(f"\n[ERROR] {e}\n")
        raise SystemExit(1)
    except PermissionError as e:
        file_err = f" '{os.path.basename(e.filename)}'" if e.filename else " de Excel"
        print(f"\n[ERROR DE PERMISO] No se pudo acceder al archivo{file_err}.")
        print("Esto ocurre porque el archivo está abierto en Microsoft Excel.")
        print("Por favor, cierra el archivo en Excel y vuelve a ejecutar el script.\n")
        raise SystemExit(1)
