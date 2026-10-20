"""
validador_postal.py
Módulo de validación y enriquecimiento de direcciones basado en el catálogo oficial de SEPOMEX.
"""
import sqlite3
import unicodedata
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = PROJECT_ROOT / "data" / "sepomex.db"

def normalizar_texto(texto):
    """Elimina acentos, signos de puntuación extra y convierte a mayúsculas para comparar."""
    if not texto:
        return ""
    texto = str(texto).strip()
    # Normalizar caracteres con tildes (NFD separa la letra del acento)
    nfkd = unicodedata.normalize("NFKD", texto)
    sin_tildes = "".join([c for c in nfkd if not unicodedata.combining(c)])
    # Limpiar caracteres raros y múltiples espacios
    limpio = re.sub(r"[^\w\s]", " ", sin_tildes)
    return re.sub(r"\s+", " ", limpio).strip().upper()

class ValidadorPostal:
    def __init__(self, db_path=None):
        self.db_path = Path(db_path) if db_path else DB_PATH
        self._conn = None

    def _get_conn(self):
        if not self._conn:
            if not self.db_path.exists():
                return None
            self._conn = sqlite3.connect(str(self.db_path))
        return self._conn

    def validar_direccion(self, cp, estado=None, municipio=None, colonia=None):
        """
        Valida si el CP existe y si coincide con el Estado y Municipio dados.
        Retorna un dict con:
        {
            "cp_valido": bool,
            "estado_oficial": str o None,
            "municipio_oficial": str o None,
            "colonias_validas": list[str],
            "colonia_sugerida": str o None,
            "alerta": str o None
        }
        """
        conn = self._get_conn()
        if not conn:
            return {"cp_valido": True, "alerta": "Base SEPOMEX no encontrada"}

        digits = re.sub(r'[^\d]', '', str(cp).split('.')[0])
        cp_clean = digits[-5:].zfill(5) if digits else ""
        if not cp_clean:
            return {
                "cp_valido": False,
                "estado_oficial": None,
                "municipio_oficial": None,
                "colonias_validas": [],
                "colonia_sugerida": None,
                "alerta": f"Código Postal vacío o inválido: '{cp}'"
            }
        cursor = conn.cursor()
        
        cursor.execute(
            "SELECT DISTINCT colonia, municipio, estado, ciudad FROM sepomex WHERE cp = ?",
            (cp_clean,)
        )
        registros = cursor.fetchall()

        if not registros:
            return {
                "cp_valido": False,
                "estado_oficial": None,
                "municipio_oficial": None,
                "colonias_validas": [],
                "colonia_sugerida": None,
                "alerta": f"Código Postal {cp_clean} NO existe en el catálogo nacional SEPOMEX"
            }

        # Datos oficiales asociados a este CP
        colonias = [r[0] for r in registros]
        municipios = list(set(r[1] for r in registros))
        estados = list(set(r[2] for r in registros))
        
        estado_oficial = estados[0] if estados else None
        municipio_oficial = municipios[0] if municipios else None

        alerta = None

        # 1. Validar coincidencia de Estado si viene proporcionado
        if estado:
            norm_est_dado = normalizar_texto(estado)
            # Casos comunes de alias: CDMX / DF / CIUDAD DE MEXICO / MEXICO / EDO MEX
            if norm_est_dado in ["CDMX", "D F", "DF", "DISTRITO FEDERAL", "CIUDAD DE MEXICO"]:
                norm_est_dado = "CIUDAD DE MEXICO"
            elif norm_est_dado in ["ESTADO DE MEXICO", "EDO MEX", "MEXICO", "EDOMEX"]:
                norm_est_dado = "MEXICO"

            norm_est_oficial = normalizar_texto(estado_oficial)
            if norm_est_oficial in ["CIUDAD DE MEXICO", "DISTRITO FEDERAL"]:
                norm_est_oficial = "CIUDAD DE MEXICO"
            elif norm_est_oficial in ["ESTADO DE MEXICO", "MEXICO"]:
                norm_est_oficial = "MEXICO"

            if norm_est_dado and norm_est_dado != norm_est_oficial:
                alerta = f"Discrepancia Estado: Excel indica '{estado}', pero CP {cp_clean} pertenece a '{estado_oficial}'"

        # 2. Buscar si la colonia dada coincide con alguna colonia oficial del CP
        colonia_sugerida = None
        if colonia:
            norm_col_dada = normalizar_texto(colonia)
            # Buscar coincidencia exacta o contenida
            for col_oficial in colonias:
                norm_oficial = normalizar_texto(col_oficial)
                if norm_col_dada == norm_oficial or norm_oficial in norm_col_dada or norm_col_dada in norm_oficial:
                    colonia_sugerida = col_oficial
                    break

        return {
            "cp_valido": True,
            "estado_oficial": estado_oficial,
            "municipio_oficial": municipio_oficial,
            "colonias_validas": colonias,
            "colonia_sugerida": colonia_sugerida,
            "alerta": alerta
        }

    # Nombre de estado con el que se escribe en la plantilla (los oficiales largos se acortan).
    ESTADO_PLANTILLA = {
        "MEXICO": "Estado de México",
        "VERACRUZ DE IGNACIO DE LA LLAVE": "Veracruz",
        "COAHUILA DE ZARAGOZA": "Coahuila",
        "MICHOACAN DE OCAMPO": "Michoacán",
    }

    @staticmethod
    def _sin_prefijo_colonia(texto):
        t = normalizar_texto(texto)
        return re.sub(r"^(COLONIA|COL|FRACCIONAMIENTO|FRACC|BARRIO|UNIDAD HABITACIONAL|U H)\s+", "", t)

    def analizar(self, cp, candidatos_ubicacion, colonia=None, texto_calle=""):
        """
        Compara lo capturado en el Excel contra el catálogo SEPOMEX SIN inventar datos.

        - Solo declara 'coherente' si el CP existe Y algún texto de ubicación del Excel
          (Municipio, City, Localidad, State) coincide con el municipio oficial de ese CP.
        - Estado/municipio oficiales se devuelven siempre para ese CP, pero quien llama
          solo debe usarlos para corregir cuando 'coherente' es True.
        Retorna dict: existe, coherente, estado_oficial, municipio_oficial,
        colonia_ok, colonias (lista oficial), colonia_en_calle (colonia oficial hallada en calle/número).
        """
        base = {"existe": False, "coherente": False, "estado_oficial": None,
                "municipio_oficial": None, "colonia_ok": None, "colonias": [],
                "colonia_en_calle": None}
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
            for nm, original in norm_mun.items():
                if nt == nm or nm in nt or (len(nt) >= 5 and nt in nm):
                    municipio_match = original
                    break
            if municipio_match:
                break

        colonia_ok = None
        if colonia:
            nc = self._sin_prefijo_colonia(colonia)
            colonia_ok = bool(nc) and any(
                nc == self._sin_prefijo_colonia(c)
                or self._sin_prefijo_colonia(c) in nc
                or (len(nc) >= 4 and nc in self._sin_prefijo_colonia(c))
                for c in colonias
            )

        colonia_en_calle = None
        ntexto = normalizar_texto(texto_calle)
        if ntexto:
            for c in colonias:
                nc = self._sin_prefijo_colonia(c)
                if len(nc) >= 4 and re.search(rf"\b{re.escape(nc)}\b", ntexto):
                    colonia_en_calle = c
                    break

        estado_of = estados[0]
        return {
            "existe": True,
            "coherente": municipio_match is not None and len(estados) == 1,
            "estado_oficial": estado_of,
            "estado_plantilla": self.ESTADO_PLANTILLA.get(normalizar_texto(estado_of), estado_of),
            "municipio_oficial": municipio_match or (municipios[0] if len(municipios) == 1 else None),
            "colonia_ok": colonia_ok,
            "colonias": colonias,
            "colonia_en_calle": colonia_en_calle,
        }

    def close(self):
        if self._conn:
            self._conn.close()
            self._conn = None
