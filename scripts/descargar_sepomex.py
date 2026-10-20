"""
Script para descargar la base oficial de SEPOMEX y generar una base local SQLite indexada.
Uso: python scripts/descargar_sepomex.py
"""
import os
import sys
import sqlite3
import urllib.request
from pathlib import Path

# Raíz del proyecto
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DB_PATH = DATA_DIR / "sepomex.db"

URL_SEPOMEX = "https://raw.githubusercontent.com/d3249/mexico_zipcodes/master/CPdescarga.txt"

def descargar_y_construir_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    print(f"Descargando catálogo oficial de SEPOMEX desde GitHub...")
    req = urllib.request.Request(URL_SEPOMEX, headers={"User-Agent": "Mozilla/5.0"})
    
    if DB_PATH.exists():
        print(f"Base de datos existente encontrada en: {DB_PATH}")
        print("Recreando para asegurar datos actualizados...")
        DB_PATH.unlink()
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sepomex (
            cp TEXT NOT NULL,
            colonia TEXT NOT NULL,
            tipo_asenta TEXT,
            municipio TEXT NOT NULL,
            estado TEXT NOT NULL,
            ciudad TEXT
        )
    """)
    
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cp ON sepomex (cp)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_estado ON sepomex (estado)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_municipio ON sepomex (municipio)")
    
    print("Procesando líneas e insertando en SQLite...")
    insert_sql = """
        INSERT INTO sepomex (cp, colonia, tipo_asenta, municipio, estado, ciudad)
        VALUES (?, ?, ?, ?, ?, ?)
    """
    
    batch = []
    total_count = 0
    
    with urllib.request.urlopen(req, timeout=30) as resp:
        # Saltar las primeras 2 líneas de encabezado/aviso legal de SEPOMEX
        header1 = resp.readline()
        header2 = resp.readline()
        
        for line in resp:
            try:
                line_str = line.decode("latin-1").strip()
            except Exception:
                continue
                
            if not line_str or "|" not in line_str:
                continue
                
            parts = line_str.split("|")
            if len(parts) < 6:
                continue
                
            cp = parts[0].strip().zfill(5)
            colonia = parts[1].strip()
            tipo_asenta = parts[2].strip()
            municipio = parts[3].strip()
            estado = parts[4].strip()
            ciudad = parts[5].strip() if len(parts) > 5 else ""
            
            batch.append((cp, colonia, tipo_asenta, municipio, estado, ciudad))
            total_count += 1
            
            if len(batch) >= 5000:
                cursor.executemany(insert_sql, batch)
                conn.commit()
                batch = []
                print(f"  Insertados {total_count} registros...", end="\r")
                
    if batch:
        cursor.executemany(insert_sql, batch)
        conn.commit()
        
    conn.close()
    
    size_mb = DB_PATH.stat().st_size / (1024 * 1024)
    print(f"\n¡Listo! Base de datos SQLite generada con éxito.")
    print(f"Total registros: {total_count:,}")
    print(f"Ruta: {DB_PATH} ({size_mb:.2f} MB)")

if __name__ == "__main__":
    descargar_y_construir_db()
