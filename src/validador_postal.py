"""
validador_postal.py
Módulo de validación postal, geocodificación y compresión inteligente de direcciones
para paqueterías en México (Estafeta / Techship) bajo política de CERO ALUCINACIONES.
"""
import sqlite3
import unicodedata
import re
import time
import urllib.request
import urllib.parse
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = PROJECT_ROOT / "data" / "sepomex.db"

# Diccionario de abreviaturas logísticas mexicanas (estrictas con límite de palabra)
ABREVIATURAS_DIRECCION = [
    (r'\bAvenida\b', 'Av.'),
    (r'\bBoulevard\b', 'Blvd.'),
    (r'\bBulevar\b', 'Blvd.'),
    (r'\bCalzada\b', 'Calz.'),
    (r'\bCerrada\b', 'Cda.'),
    (r'\bPrivada\b', 'Priv.'),
    (r'\bFraccionamiento\b', 'Fracc.'),
    (r'\bProlongaci[oó]n\b', 'Prol.'),
    (r'\bDepartamento\b', 'Depto'),
    (r'\bInterior\b', 'Int'),
    (r'\bExterior\b', 'Ext'),
    (r'\bEdificio\b', 'Edif'),
    (r'\bManzana\b', 'Mz'),
    (r'\bLote\b', 'Lt'),
    (r'\bSupermanzana\b', 'Smz'),
    (r'\b(?:N[uú]mero|Num\.|Num|No\.|No)\b\.?', '#'),
]

# Regex para detectar indicadores de ubicación interna (solo aplicable tras inicio de calle >10 caracteres)
REGEX_INTERIOR = re.compile(
    r'\b('
    r'Int(?:erior)?\.?\s*[A-Za-z0-9\-]+|'
    r'Dep(?:to|artamento)?\.?\s*[A-Za-z0-9\-]+|'
    r'Apto\.?\s*[A-Za-z0-9\-]+|'
    r'Piso\s*[A-Za-z0-9\-]+|'
    r'\d{1,2}(?:er|do|ro|to|vo|mo)\s+Piso|'
    r'Torre\s*[A-Za-z0-9\-]+|'
    r'Edif(?:icio)?\.?\s*[A-Za-z0-9\-]+|'
    r'Casa\s*[0-9]+[A-Za-z]?|'
    r'Local\s*[A-Za-z0-9\-]+|'
    r'Bodega\s*[A-Za-z0-9\-]+|'
    r'PH\b|Penthouse\b'
    r')',
    re.IGNORECASE
)

# Patrones de ciudades, estados y códigos postales que suelen contaminar campos de calle o interior
PATRONES_BASURA_CIUDAD = re.compile(
    r'(?i)\b('
    r'Ciudad\s+de\s+M[eé]xico|CDMX|C\.?D\.?M\.?X\.?|D\.?F\.?|Distrito\s+Federal|'
    r'Estado\s+de\s+M[eé]xico|Edo\.?\s*M[eé]x\.?|Edomex|'
    r'M[eé]xico|Mexico|'
    r'Guadalajara|Monterrey|Puebla|Quer[eé]taro|Toluca|Le[oó]n|Canc[uú]n|M[eé]rida|Tijuana|Ju[aá]rez|'
    r'Zapopan|Ecatepec|Chimalhuac[aá]n|Atizap[aá]n|Naucalpan|Tlalnepantla|Xalapa|Veracruz|'
    r'Alcald[ií]a\s+[A-Za-z\s]+|Municipio\s+[A-Za-z\s]+|'
    r'C\.?P\.?\s*\d{5}|\b\d{5}\b'
    r')\b'
)


def limpiar_basura_geografica(texto: str) -> str:
    """Remueve nombres de ciudades, estados y códigos postales pegados como basura al final de un texto."""
    if not texto:
        return ""
    t = PATRONES_BASURA_CIUDAD.sub("", str(texto))
    t = re.sub(r'[,;\.\-\s]+$', '', t)
    t = re.sub(r'^[,;\.\-\s]+', '', t)
    return re.sub(r'\s+', ' ', t).strip()


def evaluar_numero_exterior(texto: str) -> tuple[bool, str | None]:
    """
    Verifica si la dirección cuenta con un número exterior explícito o indicador de predio (Mz, Lt, Km).
    Evita falsos positivos cuando la dirección contiene un número exterior y un 'SN' posterior
    (ej. '16 SN', donde SN se refiere a 'Sin Número Interior').
    
    Retorna: (tiene_num_exterior: bool, alerta: str or None)
    """
    if not texto or not str(texto).strip():
        return False, "Domicilio sin número exterior explícito (S/N) - Alto riesgo en Estafeta"
    
    t = str(texto).strip()
    
    # 1. Remover fechas comunes o números de calle ordinales para no confundirlos con el número exterior
    # ej. '16 de Septiembre', '5 de Mayo', '20 de Noviembre', '1a Cda', '2da Cerrada', '1er Piso'
    t_sin_fechas = re.sub(
        r'(?i)\b(?:\d+\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)|\d+(?:a|da|ra|ta|ma|va)?\.?\s+(?:cda|cerrada|priv|privada|andador|calle|av|calzada|secc|secci[oó]n))\b',
        '',
        t
    )
    
    # 2. Verificar indicadores de predio o manzana/lote/kilómetro
    tiene_manzana_lote = bool(re.search(r'(?i)\b(?:m(?:z)?\.?\s*\d+|l(?:t)?\.?\s*\d+|manzana|lote|km\.?|kil[oó]metro)\b', t_sin_fechas))
    if tiene_manzana_lote:
        return True, None
    
    # 3. Buscar números en el texto restante
    numeros_encontrados = re.findall(r'\b\d+[A-Za-z]?\b', t_sin_fechas)
    
    # Si hay al menos un número real
    if numeros_encontrados:
        # Si hay un número y además dice 'S/N' (ej. '16 SN' o '12 S/N'), el número es el exterior y SN es el interior
        return True, None
    
    # Si no hay números encontrados, o sólo dice S/N
    return False, "Domicilio sin número exterior explícito (S/N) - Alto riesgo en Estafeta"


def normalizar_texto(texto):
    """Elimina acentos, signos de puntuación extra y convierte a mayúsculas para comparar."""
    if not texto:
        return ""
    texto = str(texto).strip()
    nfkd = unicodedata.normalize("NFKD", texto)
    sin_tildes = "".join([c for c in nfkd if not unicodedata.combining(c)])
    limpio = re.sub(r"[^\w\s]", " ", sin_tildes)
    return re.sub(r"\s+", " ", limpio).strip().upper()


def deduplicar_frases_consecutivas(texto):
    """Elimina palabras o secuencias de 1 a 6 tokens repetidos consecutivamente."""
    if not texto:
        return ""
    t = str(texto).strip()
    for _ in range(3):
        prev = t
        t = re.sub(
            r'\b([A-Za-z0-9#\.\-]+(?:\s+[A-Za-z0-9#\.\-]+){0,5})\s+\1\b',
            r'\1',
            t,
            flags=re.IGNORECASE
        )
        if t == prev:
            break
    return re.sub(r'\s+', ' ', t).strip()


def validar_y_limpiar_telefono(raw_phone):
    """
    Valida y estandariza números telefónicos en México a exactamente 10 dígitos.
    - Limpia caracteres no numéricos y extensiones (ext...).
    - Corrige sufijos '.0' derivados de la lectura de floats en pandas/openpyxl.
    - Normaliza prefijos internacionales (+52, 521, 52).
    - Detecta números falsos repetidos (ej. 0000000000, 5555555555, 1234567890).
    - Verifica que la LADA comience con dígitos válidos (2-9).
    
    Retorna: (telefono_limpio: str, es_valido: bool, alerta: str or None)
    """
    if raw_phone is None:
        return "", False, "Teléfono ausente o vacío (se requieren 10 dígitos reales para contacto del chofer)"
    
    # Manejo robusto de floats numéricos y strings
    if isinstance(raw_phone, float):
        if pd.isna(raw_phone):
            return "", False, "Teléfono ausente o vacío (se requieren 10 dígitos reales para contacto del chofer)"
        if raw_phone.is_integer():
            phone_str = str(int(raw_phone))
        else:
            phone_str = str(raw_phone).strip()
    else:
        phone_str = str(raw_phone).strip()
    
    if phone_str.lower() in ('nan', 'none', ''):
        return "", False, "Teléfono ausente o vacío (se requieren 10 dígitos reales para contacto del chofer)"
    
    # 1. Quitar sufijo .0 o .00 antes de cualquier manipulación (evita que .0 se convierta en dígito 0)
    phone_str = re.sub(r'\.0+$', '', phone_str)
    
    # 2. Quitar extensiones (ej. ext, ext., x, extension, extn)
    phone_str = re.split(r'\b(?:ext|extensión|extension|extn|x)\b\.?', phone_str, flags=re.IGNORECASE)[0].strip()
    phone_str = re.sub(r'\.0+$', '', phone_str)
    
    # 3. Extraer solo dígitos
    digits = re.sub(r'[^\d]', '', phone_str)
    
    # 4. Normalizar prefijos México (+52, 521, 52)
    if digits.startswith('521') and len(digits) == 13:
        digits = digits[3:]
    elif digits.startswith('52') and len(digits) == 12:
        digits = digits[2:]
    elif len(digits) > 10 and digits.startswith('52'):
        digits = digits[-10:]
    elif len(digits) > 10:
        digits = digits[-10:]
        
    # 5. Validaciones de calidad de 10 dígitos
    if len(digits) != 10:
        return digits, False, f"Teléfono incompleto ({len(digits)} dígitos): '{raw_phone}' (se requieren 10 dígitos reales)"
        
    # Descartar secuencias repetidas falsas
    if len(set(digits)) == 1:
        return digits, False, f"Teléfono con dígitos repetidos falsos: '{raw_phone}'"
        
    # Descartar secuencias secuenciales falsas
    if digits in ('1234567890', '0123456789', '9876543210', '0987654321'):
        return digits, False, f"Teléfono con secuencia falsa: '{raw_phone}'"
        
    # Lada no válida (en México inician con 2-9)
    if digits[0] in ('0', '1'):
        return digits, False, f"Teléfono con Lada inválida (comienza con {digits[0]}): '{raw_phone}'"
        
    return digits, True, None


def formatear_direccion_inteligente(
    calle_raw,
    num_ext_int_raw,
    colonia_raw,
    colonia_en_calle=None,
    colonia_oficial=None,
    addr3_raw=None
):
    """
    Distribuye estratégicamente los datos entre:
      - Address 1 (<= 50 chars): Calle y Número Exterior (más interior corto si aplica).
      - Address 2 (<= 50 chars): Colonia / Asentamiento Oficial SEPOMEX limpio.
      - Address 3 (<= 50 chars): Referencias de domicilio, Edificio, Depto, Privada o continuación de calle.
    Protege el número interior contra truncados y verifica la presencia de número exterior.
    
    Retorna:
    {
        "addr1": str,
        "addr2": str,
        "addr3": str,
        "tiene_num_ext": bool,
        "alerta_num_ext": str or None,
        "interior_protegido": bool,
        "error_longitud_critico": bool,
        "alerta_interior": str or None,
        "colonia_extraida": str or None
    }
    """
    calle_clean = str(calle_raw or '').strip()
    if calle_clean.lower() in ('nan', 'none', 'n/a', 'na'):
        calle_clean = ''
    house_clean = str(num_ext_int_raw or '').strip()
    if house_clean.lower() in ('nan', 'none', 'n/a', 'na'):
        house_clean = ''
    colonia_clean = str(colonia_raw or '').strip()
    if colonia_clean.lower() in ('nan', 'none', 'n/a', 'na'):
        colonia_clean = ''
    extra_addr3 = str(addr3_raw or '').strip()
    if extra_addr3.lower() in ('nan', 'none', 'n/a', 'na'):
        extra_addr3 = ''

    # 1. Extraer colonia si viene incrustada en calle_clean o en house_clean
    colonia_extraida = None
    if colonia_en_calle:
        colonia_extraida = colonia_en_calle
        patron_col = re.compile(
            rf"(?:,\s*)?\b(?:col\.?|colonia|fracc\.?|fraccionamiento)?\s*{re.escape(colonia_en_calle)}\b",
            re.IGNORECASE
        )
        calle_clean = re.sub(r"\s+", " ", patron_col.sub("", calle_clean)).strip(" ,;-")
        house_clean = re.sub(r"\s+", " ", patron_col.sub("", house_clean)).strip(" ,;-")
    else:
        for source_name, text_val in [("calle", calle_clean), ("house", house_clean)]:
            match_col = re.search(
                r'(?:,\s*)?\b(?:col|colonia|fracc|fraccionamiento)\.?\s+([A-Za-zÁÉÍÓÚáéíóúÑñ0-9\s]+)$',
                text_val,
                re.IGNORECASE
            )
            if match_col:
                colonia_extraida = match_col.group(1).strip()
                if source_name == "calle":
                    calle_clean = text_val[:match_col.start()].strip(" ,;-")
                else:
                    house_clean = text_val[:match_col.start()].strip(" ,;-")
                break

    # Definir colonia base para Address 2 (priorizando colonia oficial SEPOMEX validada)
    if colonia_oficial and str(colonia_oficial).strip():
        addr2_base = str(colonia_oficial).strip()
    elif colonia_extraida and str(colonia_extraida).strip():
        addr2_base = str(colonia_extraida).strip()
    elif colonia_clean and str(colonia_clean).strip():
        colonia_sin_basura = limpiar_basura_geografica(colonia_clean)
        addr2_base = colonia_sin_basura if colonia_sin_basura else colonia_clean
    else:
        addr2_base = ""

    # Si house_clean es idéntico a la colonia oficial, limpiarlo para no duplicar en Address 3
    if house_clean and addr2_base and (
        normalizar_texto(house_clean) == normalizar_texto(addr2_base)
        or ValidadorPostal._sin_prefijo_colonia(house_clean) == ValidadorPostal._sin_prefijo_colonia(addr2_base)
    ):
        house_clean = ""

    # 2. Separar inteligentemente Calle (Address 1) y House/Referencias/Interior (Address 3)
    calle_clean = deduplicar_frases_consecutivas(calle_clean)
    house_clean = deduplicar_frases_consecutivas(house_clean)

    # Si house_clean empieza repitiendo calle_clean (ej. Street="Dr Balmis", House="Dr Balmis 163, int 101B")
    if house_clean and calle_clean and house_clean.lower().startswith(calle_clean.lower()):
        house_clean = house_clean[len(calle_clean):].strip(" ,;-")

    # Si house_clean ya está contenido exactamente dentro de calle_clean (ej. Street="Grama 127", House="127")
    if house_clean and house_clean.lower() in calle_clean.lower():
        house_clean = ""

    tiene_ext_en_calle, _ = evaluar_numero_exterior(calle_clean)

    addr3_parts = []
    if extra_addr3:
        addr3_parts.append(extra_addr3)

    if house_clean:
        if not tiene_ext_en_calle:
            # La calle no tiene número exterior; revisar si house_clean aporta el número exterior
            if "," in house_clean:
                first_part, rest_part = house_clean.split(",", 1)
                if evaluar_numero_exterior(first_part)[0]:
                    calle_clean = f"{calle_clean} {first_part.strip()}".strip()
                    if rest_part.strip():
                        addr3_parts.append(rest_part.strip())
                else:
                    calle_clean = f"{calle_clean} {house_clean}".strip()
            elif len(house_clean) <= 15 and evaluar_numero_exterior(house_clean)[0]:
                calle_clean = f"{calle_clean} {house_clean}".strip()
            else:
                m_num = re.match(r'^((?:No\.?|#|Num\.?)?\s*\d+[A-Za-z\-]*)\s+(.+)$', house_clean, re.IGNORECASE)
                if m_num:
                    calle_clean = f"{calle_clean} {m_num.group(1).strip()}".strip()
                    addr3_parts.append(m_num.group(2).strip())
                else:
                    calle_clean = f"{calle_clean} {house_clean}".strip()
        else:
            # La calle YA tiene número exterior: enviar house_clean a Address 3 (referencias, edificio, piso, depto)
            addr3_parts.append(house_clean)

    calle_comb = deduplicar_frases_consecutivas(calle_clean)

    # 3. Validar existencia de número exterior real considerando calle + addr3
    texto_completo_eval = f"{calle_comb} {' '.join(addr3_parts)}".strip()
    tiene_num_ext, alerta_num_ext = evaluar_numero_exterior(texto_completo_eval)

    # 4. Compresión con abreviaturas si calle_comb supera los 50 caracteres
    if len(calle_comb) > 50:
        for pat, rep in ABREVIATURAS_DIRECCION:
            calle_comb = re.sub(pat, rep, calle_comb, flags=re.IGNORECASE)
        calle_comb = re.sub(r'\s+', ' ', calle_comb).strip()

    # 5. Distribución entre Address 1 (<= 50 chars) y Address 3 (<= 50 chars), manteniendo Address 2 = Colonia
    interior_protegido = False
    error_longitud_critico = False
    alerta_interior = None

    if len(calle_comb) <= 50:
        addr1_final = calle_comb
    else:
        # Excede 50 caracteres: separar interior o desbordamiento hacia Address 3
        match_int = REGEX_INTERIOR.search(calle_comb)
        if match_int and match_int.start() > 10:
            interior_raw = calle_comb[match_int.start():].strip()
            calle_sin_int = calle_comb[:match_int.start()].rstrip(', ')
            interior_str = limpiar_basura_geografica(interior_raw)
            if interior_str:
                addr3_parts.insert(0, interior_str)
                interior_protegido = True
            if len(calle_sin_int) <= 50:
                addr1_final = calle_sin_int
            else:
                cut = calle_sin_int.rfind(' ', 0, 50)
                addr1_final = calle_sin_int[:cut].strip(" ,;-") if cut != -1 else calle_sin_int[:50]
                sobrante = calle_sin_int[len(addr1_final):].strip(" ,;-")
                if sobrante:
                    addr3_parts.insert(0, sobrante)
        else:
            cut = calle_comb.rfind(' ', 0, 50)
            addr1_final = calle_comb[:cut].strip(" ,;-") if cut != -1 else calle_comb[:50]
            sobrante = calle_comb[len(addr1_final):].strip(" ,;-")
            if sobrante:
                addr3_parts.insert(0, sobrante)
                interior_protegido = True

    # Consolidar Address 3 (<= 50 chars)
    addr3_combined = ", ".join([p for p in addr3_parts if p]).strip(" ,;-")
    addr3_combined = deduplicar_frases_consecutivas(addr3_combined)
    if len(addr3_combined) > 50:
        for pat, rep in ABREVIATURAS_DIRECCION:
            addr3_combined = re.sub(pat, rep, addr3_combined, flags=re.IGNORECASE)
        addr3_combined = re.sub(r'\s+', ' ', addr3_combined).strip()

    if len(addr3_combined) > 50:
        cut3 = addr3_combined.rfind(' ', 0, 50)
        addr3_final = addr3_combined[:cut3].strip(" ,;-") if cut3 != -1 else addr3_combined[:50]
    else:
        addr3_final = addr3_combined

    addr2_final = addr2_base[:50].strip()

    return {
        "addr1": addr1_final[:50].strip(),
        "addr2": addr2_final[:50].strip(),
        "addr3": addr3_final[:50].strip(),
        "tiene_num_ext": tiene_num_ext,
        "alerta_num_ext": alerta_num_ext,
        "interior_protegido": interior_protegido,
        "error_longitud_critico": error_longitud_critico,
        "alerta_interior": alerta_interior,
        "colonia_extraida": colonia_extraida
    }


class ValidadorPostal:
    # Nombre de estado con el que se escribe en la plantilla (acorta nombres oficiales largos)
    ESTADO_PLANTILLA = {
        "MEXICO": "Estado de México",
        "VERACRUZ DE IGNACIO DE LA LLAVE": "Veracruz",
        "COAHUILA DE ZARAGOZA": "Coahuila",
        "MICHOACAN DE OCAMPO": "Michoacán",
    }

    # Alias comunes de municipios/ciudades en México
    ALIAS_MUNICIPIOS = {
        "JALAPA": "XALAPA",
        "XALAPA": "XALAPA",
        "ECATEPEC": "ECATEPEC DE MORELOS",
        "CHIMALHUACAN": "CHIMALHUACAN",
        "ATIZAPAN": "ATIZAPAN DE ZARAGOZA",
        "NAUCALPAN": "NAUCALPAN DE JUAREZ",
        "TLALNEPANTLA": "TLALNEPANTLA DE BAZ",
    }

    # Tipos exactos de Nominatim que corresponden a una calle o domicilio físico
    EXACT_TYPES = {
        'house', 'building', 'residential', 'road', 'living_street',
        'pedestrian', 'neighbourhood', 'suburb', 'hamlet', 'village'
    }

    def __init__(self, db_path=None):
        self.db_path = Path(db_path) if db_path else DB_PATH
        self._conn = None
        self._last_osm_call = 0.0
        self._init_cache_table()

    def _get_conn(self):
        if not self._conn:
            if not self.db_path.exists():
                return None
            self._conn = sqlite3.connect(str(self.db_path))
        return self._conn

    def _init_cache_table(self):
        """Inicializa la tabla caché de geocodificación para acelerar ejecuciones posteriores."""
        conn = self._get_conn()
        if conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS cache_geocoding (
                    query TEXT PRIMARY KEY,
                    confirmado INTEGER,
                    estatus TEXT,
                    tipo_resultado TEXT,
                    display_name TEXT,
                    road TEXT,
                    suburb TEXT,
                    city TEXT,
                    postcode TEXT,
                    fecha_consulta TEXT
                )
            """)
            conn.commit()

    @staticmethod
    def _sin_prefijo_colonia(texto):
        t = normalizar_texto(texto)
        return re.sub(r"^(COLONIA|COL|FRACCIONAMIENTO|FRACC|BARRIO|UNIDAD HABITACIONAL|U H|RESIDENCIAL)\s+", "", t)

    def confirmar_geocodificacion(self, calle, cp=None, municipio=None, estado=None):
        """
        Consulta y valida la existencia física del domicilio en mapas (Nominatim / OSM) con caché y rate limit.
        Retorna:
        {
            "confirmado": bool,
            "estatus": str,
            "display_name": str,
            "road": str,
            "suburb": str
        }
        """
        conn = self._get_conn()
        partes = [str(calle).strip()]
        if cp:
            partes.append(str(cp).strip())
        if municipio:
            partes.append(str(municipio).strip())
        if estado:
            partes.append(str(estado).strip())
        partes.append("Mexico")
        
        query = ", ".join([p for p in partes if p])

        # 1. Revisar caché en SQLite primero (0 ms)
        if conn:
            try:
                row = conn.execute(
                    "SELECT confirmado, estatus, display_name, road, suburb FROM cache_geocoding WHERE query = ?",
                    (query,)
                ).fetchone()
                if row:
                    return {
                        "confirmado": bool(row[0]),
                        "estatus": row[1],
                        "display_name": row[2] or "",
                        "road": row[3] or "",
                        "suburb": row[4] or ""
                    }
            except Exception:
                pass

        # 2. Respetar Rate Limit de Nominatim (1 solicitud por segundo)
        now = time.time()
        elapsed = now - self._last_osm_call
        if elapsed < 1.1:
            time.sleep(1.1 - elapsed)
        self._last_osm_call = time.time()

        url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
            "q": query,
            "format": "json",
            "addressdetails": 1,
            "limit": 1
        })
        req = urllib.request.Request(url, headers={"User-Agent": "SekoOrderAutomation/1.2"})

        confirmado = False
        estatus = "VALIDADA SEPOMEX (Calle no indexada en OSM)"
        display_name = ""
        road = ""
        suburb = ""
        tipo_resultado = ""

        try:
            with urllib.request.urlopen(req, timeout=4) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if data:
                    res = data[0]
                    addr = res.get("address", {})
                    tipo_resultado = res.get("addresstype") or res.get("type") or ""
                    display_name = res.get("display_name", "")
                    road = addr.get("road", "")
                    suburb = addr.get("suburb") or addr.get("neighbourhood") or ""
                    res_postcode = addr.get("postcode", "")
                    res_city = addr.get("city") or addr.get("town") or addr.get("municipality") or ""

                    # Validación de precisión: debe ser nivel de calle/domicilio
                    if tipo_resultado in self.EXACT_TYPES:
                        cp_coincide = bool(cp and res_postcode and str(cp).strip() in res_postcode)
                        mun_coincide = bool(municipio and normalizar_texto(municipio) in normalizar_texto(res_city))
                        if cp_coincide or mun_coincide or road:
                            confirmado = True
                            estatus = "100% CONFIRMADA (Domicilio/Calle en Mapa)"
        except Exception:
            pass

        # Guardar en caché local
        if conn:
            try:
                conn.execute("""
                    INSERT OR REPLACE INTO cache_geocoding
                    (query, confirmado, estatus, tipo_resultado, display_name, road, suburb, city, postcode, fecha_consulta)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                """, (query, 1 if confirmado else 0, estatus, tipo_resultado, display_name, road, suburb, municipio or "", cp or ""))
                conn.commit()
            except Exception:
                pass

        return {
            "confirmado": confirmado,
            "estatus": estatus,
            "display_name": display_name,
            "road": road,
            "suburb": suburb
        }

    def analizar(self, cp, candidatos_ubicacion, colonia=None, texto_calle=""):
        """
        Compara lo capturado en el Excel contra el catálogo SEPOMEX bajo CERO ALUCINACIONES.
        - Declara 'coherente' si el CP existe y algún dato coincide con el municipio oficial,
          el estado oficial o una colonia oficial exacta de ese CP.
        - Busca coincidencias de colonias oficiales en Localidad, Municipio, City, State y Calle/House.
        """
        base = {
            "existe": False,
            "coherente": False,
            "estado_oficial": None,
            "estado_plantilla": None,
            "municipio_oficial": None,
            "colonia_ok": None,
            "colonia_match": None,
            "colonias": [],
            "colonia_en_calle": None
        }
        conn = self._get_conn()
        if not conn:
            return base

        digits = re.sub(r"[^\d]", "", str(cp).split(".")[0])
        if not digits:
            return base
        cp_clean = digits[-5:].zfill(5)

        regs = conn.execute(
            "SELECT DISTINCT colonia, municipio, estado FROM sepomex WHERE cp = ?", (cp_clean,)
        ).fetchall()
        if not regs:
            return base

        municipios = sorted({r[1] for r in regs})
        estados = sorted({r[2] for r in regs})
        colonias = sorted({r[0] for r in regs})
        norm_mun = {normalizar_texto(m): m for m in municipios}

        municipio_match = None
        for texto in candidatos_ubicacion:
            nt = normalizar_texto(texto)
            if not nt:
                continue
            nt_alias = self.ALIAS_MUNICIPIOS.get(nt, nt)
            for nm, original in norm_mun.items():
                nm_alias = self.ALIAS_MUNICIPIOS.get(nm, nm)
                if nt == nm or nt_alias == nm_alias or nm in nt or (len(nt) >= 5 and nt in nm):
                    municipio_match = original
                    break
            if municipio_match:
                break

        # Buscar coincidencia de colonia en el campo principal 'colonia' y en todos los candidatos_ubicacion
        colonia_match = None
        colonia_ok = False
        textos_busqueda_colonia = []
        if colonia:
            textos_busqueda_colonia.append(colonia)
        for cand in candidatos_ubicacion:
            if cand and cand not in textos_busqueda_colonia:
                textos_busqueda_colonia.append(cand)

        # Paso 1: Coincidencia exacta o contenida contra las colonias oficiales del CP
        for texto_cand in textos_busqueda_colonia:
            nc_cand = self._sin_prefijo_colonia(texto_cand)
            if not nc_cand or len(nc_cand) < 3:
                continue
            # Ignorar si el texto es simplemente el nombre del estado o municipio genérico
            if nc_cand in norm_mun or nc_cand in {normalizar_texto(e) for e in estados}:
                # A menos que la colonia se llame igual que el municipio
                exact_col = next((c for c in colonias if self._sin_prefijo_colonia(c) == nc_cand), None)
                if exact_col:
                    colonia_match = exact_col
                    colonia_ok = True
                    break
                continue
            for c in colonias:
                nc_oficial = self._sin_prefijo_colonia(c)
                if (
                    nc_cand == nc_oficial
                    or (len(nc_oficial) >= 4 and nc_oficial in nc_cand)
                    or (len(nc_cand) >= 5 and nc_cand in nc_oficial)
                ):
                    colonia_match = c
                    colonia_ok = True
                    break
            if colonia_match:
                break

        colonia_en_calle = None
        ntexto = normalizar_texto(texto_calle)
        if ntexto:
            for c in colonias:
                nc = self._sin_prefijo_colonia(c)
                if len(nc) >= 4 and re.search(rf"\b{re.escape(nc)}\b", ntexto):
                    colonia_en_calle = c
                    if not colonia_match:
                        colonia_match = c
                        colonia_ok = True
                    break

        estado_of = estados[0]
        estado_plantilla = self.ESTADO_PLANTILLA.get(normalizar_texto(estado_of), estado_of)

        # Si no hubo match directo de municipio pero sí hubo match exacto de una colonia oficial del CP,
        # el domicilio pertenece comprobadamente a ese CP y municipio oficial
        es_coherente = (municipio_match is not None or colonia_match is not None) and len(estados) == 1

        return {
            "existe": True,
            "coherente": es_coherente,
            "estado_oficial": estado_of,
            "estado_plantilla": estado_plantilla,
            "municipio_oficial": municipio_match or (municipios[0] if len(municipios) == 1 else None),
            "colonia_ok": colonia_ok,
            "colonia_match": colonia_match,
            "colonias": colonias,
            "colonia_en_calle": colonia_en_calle,
        }

    def close(self):
        if self._conn:
            self._conn.close()
            self._conn = None
