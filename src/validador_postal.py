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

    def close(self):
        if self._conn:
            self._conn.close()
            self._conn = None
