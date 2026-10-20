# -*- coding: utf-8 -*-
"""
main.py
-------
Orquestador maestro End-to-End del proyecto de Automatización de Órdenes (Kyndryl / KST).

Ejecuta el flujo completo en un solo comando:
  [Paso 1] Lee el reporte crudo de ServiceNow (SCTASK_*.xlsx), valida y limpia
           las direcciones postales con SEPOMEX, y genera el archivo oficial de 61 columnas
           junto con la auditoría complementaria.
  [Paso 2] Conecta con la API v3 de Techship: detecta anti-duplicados, aplica la compuerta
           de seguridad (bloquea direcciones inválidas) y procesa las órdenes en Estafeta
           (en modo seguro --dry-run o producción --live).
  [Paso 3] Extrae automáticamente las guías de 22 dígitos y códigos de rastreo de 10 dígitos,
           valida los CPs y genera el archivo Cierre_DD_Mes_AAAA.xlsx para ServiceNow
           junto con el PDF consolidado de etiquetas (Etiquetas_Lote_*.pdf) en pares ordenados.

Uso:
  python main.py -i "data/input/SCTASK_SHP_Combined_Report_MX_10-20-26.xlsx"           # Modo Simulación (Dry-Run)
  python main.py -i "data/input/SCTASK_SHP_Combined_Report_MX_10-20-26.xlsx" --live    # Modo Producción Real
"""

import os
import sys
import argparse
import datetime
from pathlib import Path
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

# Asegurar codificación UTF-8 en consolas Windows (PowerShell / CMD)
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# Asegurar importación de módulos internos
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.generar_guias import generar_guias
from src.techship_client import procesar_archivo_techship, sincronizar_tracking_desde_api


def banner(is_live):
    modo = "[MODO PRODUCCION: TIMBRADO REAL EN ESTAFETA]" if is_live else "[MODO SIMULACION SEGURA: DRY-RUN]"
    print("\n" + "=" * 74)
    print("   SEKO LOGISTICS MEXICO - AUTOMATIZACION DE ORDENES (KYNDRYL / KST)")
    print("   Pipeline End-to-End: ServiceNow -> SEPOMEX -> Techship API -> Cierre")
    print("=" * 74)
    print(f"  Modo de ejecucion : {modo}")
    print(f"  Fecha de proceso  : {datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    print("=" * 74 + "\n")


def ejecutar_pipeline(input_path, is_live=False, output_dir=None, skip_api=False, skip_cierre=False):
    """
    Ejecuta el pipeline unificado de punta a punta.
    """
    input_file = Path(input_path)
    if not input_file.is_file():
        raise FileNotFoundError(f"No se encontró el archivo de entrada: {input_path}")
        
    out_dir = Path(output_dir) if output_dir else (PROJECT_ROOT / "data" / "output")
    out_dir.mkdir(parents=True, exist_ok=True)
    
    banner(is_live)
    
    # -------------------------------------------------------------
    # PASO 1: VALIDACION POSTAL SEPOMEX Y GENERACION DE EXCEL 61 COLS
    # -------------------------------------------------------------
    print("+------------------------------------------------------------------------+")
    print("| [PASO 1/3] Validacion SEPOMEX y Generacion de Plantilla Techship (61)  |")
    print("+------------------------------------------------------------------------+")
    print(f"  Leyendo reporte de ServiceNow: {input_file.name}")
    
    # Obtener nombre base de salida
    nombre_base = input_file.name.replace(".xlsx", "")
    for prefijo in ["SCTASK_SHP_Combined_Report_", "SCTASK_"]:
        if nombre_base.startswith(prefijo):
            nombre_base = nombre_base[len(prefijo):]
            break
            
    ruta_techship_excel = out_dir / f"Guias_Techship_Importada_{nombre_base}.xlsx"
    ruta_auditoria_excel = out_dir / f"Auditoria_Direcciones_{nombre_base}.xlsx"
    
    generar_guias(str(input_file), str(out_dir))
    
    if not ruta_techship_excel.is_file():
        raise RuntimeError(f"Error en Paso 1: No se genero el archivo esperado {ruta_techship_excel}")
        
    print(f"\n  [OK] Paso 1 Exitoso:")
    print(f"     * Ordenes estructuradas: {ruta_techship_excel}")
    print(f"     * Reporte de Auditoria : {ruta_auditoria_excel}\n")
    
    if skip_api:
        print("[INFO] Bandera --skip-api activa. Proceso concluido en Paso 1.")
        return str(ruta_techship_excel)
        
    # -------------------------------------------------------------
    # PASO 2: CONEXION API TECHSHIP V3 Y PROCESAMIENTO
    # -------------------------------------------------------------
    print("+------------------------------------------------------------------------+")
    print("| [PASO 2/3] Conexion API Techship v3, Anti-Duplicados y Timbrado        |")
    print("+------------------------------------------------------------------------+")
    
    is_dry_run = not is_live
    res_techship = procesar_archivo_techship(
        str(ruta_techship_excel),
        dry_run=is_dry_run,
        audit_path=str(ruta_auditoria_excel) if ruta_auditoria_excel.is_file() else None
    )
    
    print(f"  [OK] Paso 2 Exitoso:")
    print(f"     * Total evaluadas : {res_techship.get('total', 0)}")
    print(f"     * Listas procesar : {res_techship.get('listas', 0)}")
    print(f"     * Omitidas duplic : {res_techship.get('duplicados', 0)}")
    print(f"     * Bloqueadas error: {res_techship.get('bloqueadas', 0)}\n")
    
    if skip_cierre:
        print("[INFO] Bandera --skip-cierre activa. Proceso concluido en Paso 2.")
        return str(ruta_techship_excel)
        
    # -------------------------------------------------------------
    # PASO 3: SINCRONIZACION DE TRACKINGS Y GENERACION DE CIERRE + PDF
    # -------------------------------------------------------------
    print("+------------------------------------------------------------------------+")
    print("| [PASO 3/3] Extraccion de Trackings API, Cierre ServiceNow y PDF Lote   |")
    print("+------------------------------------------------------------------------+")
    
    ruta_cierre = sincronizar_tracking_desde_api(
        sctask_path=str(input_file),
        output_path=str(out_dir)
    )
    
    # -------------------------------------------------------------
    # RESUMEN EJECUTIVO FINAL
    # -------------------------------------------------------------
    print("\n" + "=" * 74)
    print("                    PIPELINE COMPLETADO CON EXITO                     ")
    print("=" * 74)
    print("  Archivos finales listos para la operacion:")
    print(f"  1. [Excel Cierre para ServiceNow] : {ruta_cierre}")
    
    # Detectar el PDF generado
    now = datetime.date.today()
    meses_es = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ]
    pdf_candidato = out_dir / f"Etiquetas_Lote_{now.day}_{meses_es[now.month - 1]}_{now.year}.pdf"
    if pdf_candidato.is_file():
        print(f"  2. [PDF de Etiquetas para Almacen]: {pdf_candidato}")
        
    print(f"  3. [Auditoria y Diagnostico]     : {ruta_auditoria_excel}")
    print("=" * 74 + "\n")
    
    return ruta_cierre


def main():
    parser = argparse.ArgumentParser(
        description="Pipeline unificado End-to-End para la automatización de órdenes Kyndryl / KST (Seko Logistics)."
    )
    parser.add_argument(
        "-i", "--input",
        required=False,
        help="Ruta al archivo SCTASK original de ServiceNow (Combined Report)."
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Ejecuta en modo PRODUCCIÓN real con timbrado de guías en Estafeta."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Ejecuta en modo SIMULACIÓN segura (por defecto si no se especifica --live)."
    )
    parser.add_argument(
        "-o", "--output-dir",
        default=None,
        help="Carpeta de destino para los archivos generados (default: data/output)."
    )
    parser.add_argument(
        "--skip-api",
        action="store_true",
        help="Detener después de generar el Excel de Techship (sin conectar a la API)."
    )
    parser.add_argument(
        "--skip-cierre",
        action="store_true",
        help="Detener después del envío a Techship (sin generar el archivo de Cierre)."
    )
    
    args = parser.parse_args()
    
    input_file = args.input
    if not input_file:
        # Auto-detectar el reporte más reciente en data/input o data/samples
        candidatos = sorted((PROJECT_ROOT / "data" / "input").glob("SCTASK_*.xlsx"), key=os.path.getmtime, reverse=True)
        if not candidatos:
            candidatos = sorted((PROJECT_ROOT / "data" / "samples").glob("SCTASK_*.xlsx"), key=os.path.getmtime, reverse=True)
        if candidatos:
            input_file = str(candidatos[0])
            print(f"[AUTO-DETECT] Usando reporte más reciente: {input_file}")
        else:
            print("Error: No se especificó el archivo de entrada (-i) y no se encontró ningún SCTASK_*.xlsx en data/input/ ni data/samples/")
            sys.exit(1)
            
    is_live = bool(args.live and not args.dry_run)
    ejecutar_pipeline(
        input_path=input_file,
        is_live=is_live,
        output_dir=args.output_dir,
        skip_api=args.skip_api,
        skip_cierre=args.skip_cierre
    )


if __name__ == "__main__":
    main()
