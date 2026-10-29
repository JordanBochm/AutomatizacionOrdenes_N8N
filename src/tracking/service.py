# -*- coding: utf-8 -*-
"""
service.py
----------
Servicio orquestador de rastreo multi-carrier (FedEx y Estafeta):
  - Detección automática de carrier y resolución de guías ambiguas.
  - Caché en memoria con TTL de 10 min (y 60 min para ENTREGADO).
  - Consultas en lote asíncronas con límite de concurrencia (`asyncio.Semaphore` + `httpx.AsyncClient`).
  - Rate limiting básico por IP en memoria.
  - Hook de autenticación preparado para producción.
  - Exportación a Excel (.xlsx) estandarizada con el formato oficial de Tracking de
    SupplyChain México (Logo, franja #233762, barra bicolor, resumen #D9E2F3 y tabla).
"""

import io
import os
import time
import asyncio
import datetime
import threading
from collections import deque
from pathlib import Path
from typing import Deque, Dict, List, Optional
import httpx
import openpyxl
from openpyxl.drawing.image import Image as OpenpyxlImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from fastapi import Header, HTTPException, Request

from src.tracking.base import (
    CarrierAdapter,
    CarrierTrackingError,
    build_simulated_tracking,
    logger,
    now_iso_mx,
)
from src.tracking.cache import TrackingCache
from src.tracking.detector import detect_carrier
from src.tracking.estafeta import EstafetaAdapter
from src.tracking.fedex import FedExAdapter
from src.tracking.models import (
    TrackingResult,
    UnifiedTrackingStatus,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


# ==============================================================================
# RATE LIMITER BÁSICO EN MEMORIA (VENTANA DESLIZANTE POR IP)
# ==============================================================================

class SlidingWindowRateLimiter:
    """
    Limitador de tasa en memoria por IP de cliente para proteger las cuotas de
    las APIs de FedEx y Estafeta.
    """

    def __init__(self, max_requests: int = 120, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: Dict[str, Deque[float]] = {}
        self._lock = threading.Lock()

    def check(self, client_ip: str) -> None:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            q = self._hits.setdefault(client_ip, deque())
            while q and q[0] < cutoff:
                q.popleft()
            if len(q) >= self.max_requests:
                raise HTTPException(
                    status_code=429,
                    detail=(
                        "Se ha alcanzado el límite de consultas por minuto desde tu conexión. "
                        "Por favor espera unos segundos antes de volver a consultar."
                    ),
                )
            q.append(now)


# ==============================================================================
# DEPENDENCIA DE SEGURIDAD PREPARADA PARA AUTENTICACIÓN EN BACKEND
# ==============================================================================

async def verify_tracking_auth(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    x_user_email: Optional[str] = Header(default=None),
    x_user_role: Optional[str] = Header(default=None),
) -> Dict[str, Optional[str]]:
    """
    Dependencia de seguridad para los endpoints `/api/tracking/*`.
    """
    required_token = os.getenv("TRACKING_API_AUTH_TOKEN", "").strip()
    if required_token:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=401,
                detail="No autorizado. Se requiere token de sesión para consultar el rastreo.",
            )
        provided_token = authorization.replace("Bearer ", "", 1).strip()
        if provided_token != required_token:
            raise HTTPException(
                status_code=403,
                detail="Token de acceso inválido o expirado.",
            )

    return {
        "email": x_user_email or "anonimo@supplychain.mx",
        "role": x_user_role or "OPERADOR",
        "ip": request.client.host if request.client else "127.0.0.1",
    }


# ==============================================================================
# SERVICIO ORQUESTADOR DE RASTREO
# ==============================================================================

class TrackingService:
    """
    Orquesta la detección de carrier, consulta en caché, llamadas asíncronas a
    FedEx y Estafeta, fallback de simulación y concurrencia por lotes.
    """

    def __init__(
        self,
        fedex_adapter: Optional[CarrierAdapter] = None,
        estafeta_adapter: Optional[CarrierAdapter] = None,
        cache: Optional[TrackingCache] = None,
        mock_fallback: Optional[bool] = None,
        max_concurrency: Optional[int] = None,
        timeout_seconds: Optional[float] = None,
    ):
        default_ttl = int(os.getenv("TRACKING_CACHE_TTL_SECONDS", "600"))
        delivered_ttl = int(os.getenv("TRACKING_CACHE_DELIVERED_TTL_SECONDS", "3600"))

        self.cache = cache or TrackingCache(
            default_ttl_seconds=default_ttl,
            delivered_ttl_seconds=delivered_ttl,
        )
        self.adapters: Dict[str, CarrierAdapter] = {
            "FEDEX": fedex_adapter or FedExAdapter(),
            "ESTAFETA": estafeta_adapter or EstafetaAdapter(),
        }

        self._explicit_mock_fallback = mock_fallback
        if mock_fallback is None:
            env_mock = os.getenv("TRACKING_MOCK_FALLBACK", "true").strip().lower()
            self.mock_fallback = env_mock in ("1", "true", "yes", "si", "auto")
        else:
            self.mock_fallback = mock_fallback

        self.max_concurrency = max_concurrency or int(os.getenv("TRACKING_MAX_CONCURRENCY", "8"))
        self.timeout_seconds = timeout_seconds or float(os.getenv("TRACKING_HTTP_TIMEOUT_SECONDS", "15.0"))

    def _is_mock_fallback_active(self) -> bool:
        if self._explicit_mock_fallback is not None:
            return self._explicit_mock_fallback
        env_mock = os.getenv("TRACKING_MOCK_FALLBACK", "true").strip().lower()
        self.mock_fallback = env_mock in ("1", "true", "yes", "si", "auto")
        return self.mock_fallback

    async def _query_single_carrier(
        self,
        guia: str,
        carrier_name: str,
        client: httpx.AsyncClient,
    ) -> TrackingResult:
        adapter = self.adapters.get(carrier_name.upper())
        if not adapter:
            return TrackingResult(
                carrier=carrier_name.upper(),
                guia=guia,
                estatus_general=UnifiedTrackingStatus.DESCONOCIDO,
                ultima_actualizacion=now_iso_mx(),
                candidatos_carrier=[carrier_name.upper()],
                error=f"El carrier '{carrier_name}' no está soportado.",
                codigo_error="UNSUPPORTED_CARRIER",
            )

        # Si el carrier no tiene credenciales configuradas en .env
        if not adapter.is_configured():
            if self._is_mock_fallback_active():
                logger.info(
                    "Credenciales de %s no configuradas en .env; usando modo simulación para guía %s",
                    carrier_name,
                    guia,
                )
                return build_simulated_tracking(guia, carrier_name.upper())

            return TrackingResult(
                carrier=carrier_name.upper(),
                guia=guia,
                estatus_general=UnifiedTrackingStatus.DESCONOCIDO,
                ultima_actualizacion=now_iso_mx(),
                candidatos_carrier=[carrier_name.upper()],
                error=(
                    f"Las credenciales de API para {carrier_name} no están configuradas en el archivo .env."
                ),
                codigo_error="AUTH_ERROR",
            )

        try:
            return await adapter.rastrear(guia, client)
        except CarrierTrackingError as exc:
            return TrackingResult(
                carrier=carrier_name.upper(),
                guia=guia,
                estatus_general=UnifiedTrackingStatus.DESCONOCIDO,
                ultima_actualizacion=now_iso_mx(),
                candidatos_carrier=[carrier_name.upper()],
                error=exc.message,
                codigo_error=exc.codigo_error,
            )
        except Exception as exc:
            logger.error("Error inesperado al rastrear guía %s en %s: %s", guia, carrier_name, type(exc).__name__)
            return TrackingResult(
                carrier=carrier_name.upper(),
                guia=guia,
                estatus_general=UnifiedTrackingStatus.DESCONOCIDO,
                ultima_actualizacion=now_iso_mx(),
                candidatos_carrier=[carrier_name.upper()],
                error=f"Error inesperado al consultar {carrier_name}. Intenta de nuevo más tarde.",
                codigo_error="CARRIER_ERROR",
            )

    async def track_single(
        self,
        raw_guia: str,
        carrier: Optional[str] = None,
        force_refresh: bool = False,
        shared_client: Optional[httpx.AsyncClient] = None,
    ) -> TrackingResult:
        """
        Rastrea una guía individual detectando automáticamente el carrier (o usando el
        carrier indicado), consultando primero la caché en memoria y resolviendo
        ambigüedades entre FedEx y Estafeta.
        """
        detection = detect_carrier(raw_guia, forced_carrier=carrier)
        guia = detection.guia_limpia

        if not detection.es_valida:
            return TrackingResult(
                carrier=carrier.upper() if carrier else "DESCONOCIDO",
                guia=guia or str(raw_guia).strip(),
                estatus_general=UnifiedTrackingStatus.DESCONOCIDO,
                ultima_actualizacion=now_iso_mx(),
                es_ambiguo=False,
                candidatos_carrier=[],
                error=detection.motivo_invalidez or "Formato de guía inválido.",
                codigo_error="INVALID_GUIDE",
            )

        if force_refresh:
            self.cache.invalidate(guia)
        else:
            cached = self.cache.get(guia, carrier)
            if cached is not None:
                return cached

        owns_client = shared_client is None
        client = shared_client or httpx.AsyncClient(timeout=self.timeout_seconds)

        try:
            primary_carrier = detection.carrier_principal or "FEDEX"
            result = await self._query_single_carrier(guia, primary_carrier, client)

            # Si el formato de guía es ambiguo y el carrier principal no encontró la guía
            # (y no fue forzado por el usuario), probamos el segundo candidato automáticamente.
            if (
                detection.es_ambiguo
                and not carrier
                and len(detection.candidatos) > 1
                and (result.error or result.estatus_general == UnifiedTrackingStatus.DESCONOCIDO)
                and not result.eventos
            ):
                secondary_carrier = detection.candidatos[1]
                secondary_res = await self._query_single_carrier(guia, secondary_carrier, client)
                if not secondary_res.error and (
                    secondary_res.estatus_general != UnifiedTrackingStatus.DESCONOCIDO or secondary_res.eventos
                ):
                    result = secondary_res

            result.es_ambiguo = detection.es_ambiguo
            result.candidatos_carrier = detection.candidatos
            self.cache.set(result, requested_carrier=carrier)
            return result
        finally:
            if owns_client:
                await client.aclose()

    async def track_batch(
        self,
        guias: List[str],
        carrier: Optional[str] = None,
        force_refresh: bool = False,
    ) -> List[TrackingResult]:
        """
        Rastrea hasta 50 guías en paralelo controlando la concurrencia con `asyncio.Semaphore`.
        Preserva el orden de las guías solicitadas y elimina duplicados redundantes.
        """
        unique_guias: List[str] = []
        seen = set()
        for g in guias:
            clean_key = g.strip().upper()
            if clean_key and clean_key not in seen:
                seen.add(clean_key)
                unique_guias.append(g.strip())

        if len(unique_guias) > 50:
            unique_guias = unique_guias[:50]

        semaphore = asyncio.Semaphore(self.max_concurrency)

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as shared_client:
            async def _worker(g: str) -> TrackingResult:
                async with semaphore:
                    return await self.track_single(
                        raw_guia=g,
                        carrier=carrier,
                        force_refresh=force_refresh,
                        shared_client=shared_client,
                    )

            results = await asyncio.gather(*[_worker(g) for g in unique_guias])
            return list(results)


# ==============================================================================
# EXPORTACIÓN A EXCEL (.XLSX) ESTANDARIZADA AL FORMATO DE TRACKING
# ==============================================================================

STATUS_LABELS_ES = {
    "RECOLECTADO": "Recolectado",
    "EN_TRANSITO": "En Tránsito",
    "EN_REPARTO": "En Reparto",
    "ENTREGADO": "Entregado",
    "INCIDENCIA": "Incidencia",
    "DESCONOCIDO": "Desconocido",
}

STATUS_FILLS = {
    "ENTREGADO": PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid"),
    "EN_TRANSITO": PatternFill(start_color="DBEAFE", end_color="DBEAFE", fill_type="solid"),
    "EN_REPARTO": PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid"),
    "INCIDENCIA": PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid"),
    "RECOLECTADO": PatternFill(start_color="E0E7FF", end_color="E0E7FF", fill_type="solid"),
    "DESCONOCIDO": PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid"),
}

DIAS_SEMANA_ES = [
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
    "Domingo",
]

MESES_ES = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
]


def get_standardized_tracking_excel_filename() -> str:
    """
    Genera el nombre estandarizado del archivo Excel siguiendo la convención de Tracking:
    ej. `RASTREO_29_Octubre.xlsx` (homólogo a `TRACKING_29_Octubre.pdf`).
    """
    now = datetime.date.today()
    dia = f"{now.day:02d}"
    mes = MESES_ES[now.month - 1].capitalize()
    return f"RASTREO_{dia}_{mes}.xlsx"


def _format_long_date_es(d: datetime.date) -> str:
    dia_sem = DIAS_SEMANA_ES[d.weekday()]
    mes_nom = MESES_ES[d.month - 1]
    return f"{dia_sem}, {d.day} de {mes_nom} de {d.year}"


def build_tracking_excel_bytes(resultados: List[TrackingResult]) -> bytes:
    """
    Construye el archivo Excel (.xlsx) replicando el formato estandarizado de
    Tracking (`TRACKING_DD_Mes` / `trackingPdf.ts`) con logotipo oficial de
    SupplyChain México, título "Asset Management", franja azul marino `#233762`,
    línea bicolor oficial (`#233762` / `#CE3A39`), fecha en cursiva, bloque de
    resumen con cajas `#D9E2F3`, tabla estandarizada y pie de página.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Rastreo de Envíos"

    # Configurar página en orientación horizontal (Landscape) ajustada a 1 página de ancho
    ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
    ws.page_setup.paperSize = ws.PAPERSIZE_LETTER
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0

    # Paleta oficial SupplyChain México (idéntica a trackingPdf.ts)
    navy_hex = "233762"
    red_hex = "CE3A39"
    summary_hex = "D9E2F3"
    slate_dark_hex = "0F172A"
    slate_muted_hex = "64748B"

    navy_fill = PatternFill(start_color=navy_hex, end_color=navy_hex, fill_type="solid")
    summary_fill = PatternFill(start_color=summary_hex, end_color=summary_hex, fill_type="solid")
    white_fill = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")

    thin_black = Side(style="thin", color="000000")
    box_border = Border(left=thin_black, right=thin_black, top=thin_black, bottom=thin_black)

    # ------------------------------------------------------------------
    # 1. FILA 1: LOGOTIPO OFICIAL + TÍTULO "Asset Management"
    # ------------------------------------------------------------------
    ws.merge_cells("A1:H1")
    c_title = ws["A1"]
    c_title.value = "Asset Management"
    c_title.font = Font(name="Calibri", size=14, bold=True, color=navy_hex)
    c_title.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 32

    logo_path = PROJECT_ROOT / "frontend" / "public" / "logo-supplychain.png"
    if logo_path.is_file():
        try:
            img = OpenpyxlImage(str(logo_path))
            target_h = 38
            if img.height:
                img.width = int((img.width / img.height) * target_h)
            img.height = target_h
            ws.add_image(img, "A1")
        except Exception:
            pass

    # ------------------------------------------------------------------
    # 2. FILA 2: FRANJA AZUL MARINO + LÍNEA BICOLOR OFICIAL (#233762 / #CE3A39)
    # ------------------------------------------------------------------
    ws.merge_cells("A2:H2")
    c_banner = ws["A2"]
    c_banner.value = "REPORTE DE RASTREO DE ENVÍOS DEL DÍA"
    c_banner.font = Font(name="Calibri", size=13, bold=True, color="FFFFFF")
    c_banner.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[2].height = 25

    for col_idx in range(1, 9):
        cell = ws.cell(row=2, column=col_idx)
        cell.fill = navy_fill
        # Borde inferior bicolor: mitad izquierda Azul Marino, mitad derecha Rojo
        bottom_color = navy_hex if col_idx <= 4 else red_hex
        cell.border = Border(bottom=Side(style="medium", color=bottom_color))

    # ------------------------------------------------------------------
    # 3. FILA 3: FECHA LARGA EN CURSIVA CENTRADA
    # ------------------------------------------------------------------
    ws.merge_cells("A3:H3")
    c_date = ws["A3"]
    c_date.value = _format_long_date_es(datetime.date.today())
    c_date.font = Font(name="Calibri", size=10, italic=True, color="505A69")
    c_date.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[3].height = 18

    # ------------------------------------------------------------------
    # 4. FILA 4: CLIENTES CENTRADOS + LÍNEA DIVISORIA AZUL MARINO
    # ------------------------------------------------------------------
    ws.merge_cells("A4:H4")
    c_clients = ws["A4"]
    c_clients.value = "KYNDRYL & BASF"
    c_clients.font = Font(name="Calibri", size=11, bold=True, color=navy_hex)
    c_clients.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[4].height = 20

    for col_idx in range(1, 9):
        ws.cell(row=4, column=col_idx).border = Border(
            bottom=Side(style="medium", color=navy_hex)
        )

    # ------------------------------------------------------------------
    # 5. BLOQUE DE RESUMEN SUPERIOR CON CAJAS #D9E2F3 (FILAS 5 A 7)
    # ------------------------------------------------------------------
    total_guias = len(resultados)
    count_fedex = sum(1 for r in resultados if r.carrier.upper() == "FEDEX")
    count_estafeta = sum(1 for r in resultados if r.carrier.upper() == "ESTAFETA")
    count_entregados = sum(
        1 for r in resultados if r.estatus_general == UnifiedTrackingStatus.ENTREGADO
    )
    count_en_ruta = sum(
        1
        for r in resultados
        if r.estatus_general
        in (
            UnifiedTrackingStatus.EN_TRANSITO,
            UnifiedTrackingStatus.EN_REPARTO,
            UnifiedTrackingStatus.RECOLECTADO,
        )
    )
    count_incidencias = sum(
        1
        for r in resultados
        if r.estatus_general == UnifiedTrackingStatus.INCIDENCIA or r.retrasado or bool(r.error)
    )

    summary_rows_spec = [
        ("Total Guías:", total_guias, True, "Entregadas:", count_entregados, navy_hex),
        ("FEDEX:", count_fedex, False, "En Tránsito / Reparto:", count_en_ruta, navy_hex),
        ("ESTAFETA:", count_estafeta, False, "Incidencias / Retrasos:", count_incidencias, red_hex),
    ]

    for offset, (left_lbl, left_val, left_bold, right_lbl, right_val, right_color) in enumerate(
        summary_rows_spec
    ):
        r_num = 5 + offset
        ws.row_dimensions[r_num].height = 19

        # Etiqueta izquierda (Columna B)
        lbl_left_cell = ws.cell(row=r_num, column=2, value=left_lbl)
        lbl_left_cell.font = Font(
            name="Calibri",
            size=10,
            bold=left_bold,
            color=navy_hex if left_bold else slate_dark_hex,
        )
        lbl_left_cell.alignment = Alignment(horizontal="right", vertical="center")

        # Caja valor izquierdo (Columnas C:D combinadas, igual que en Tracking)
        ws.merge_cells(start_row=r_num, start_column=3, end_row=r_num, end_column=4)
        val_left_cell = ws.cell(row=r_num, column=3, value=left_val)
        val_left_cell.font = Font(
            name="Calibri", size=10, bold=left_bold, color=slate_dark_hex
        )
        val_left_cell.alignment = Alignment(horizontal="center", vertical="center")
        for c_i in (3, 4):
            cell_box = ws.cell(row=r_num, column=c_i)
            cell_box.fill = summary_fill
            cell_box.border = box_border

        # Etiqueta derecha (Columna G)
        lbl_right_cell = ws.cell(row=r_num, column=7, value=right_lbl)
        lbl_right_cell.font = Font(name="Calibri", size=10, bold=True, color=right_color)
        lbl_right_cell.alignment = Alignment(horizontal="right", vertical="center")

        # Caja valor derecho (Columna H)
        val_right_cell = ws.cell(row=r_num, column=8, value=right_val)
        val_right_cell.font = Font(
            name="Calibri",
            size=10,
            bold=True,
            color=red_hex if right_color == red_hex and right_val > 0 else slate_dark_hex,
        )
        val_right_cell.alignment = Alignment(horizontal="center", vertical="center")
        val_right_cell.fill = summary_fill
        val_right_cell.border = box_border

    # Fila 8: Separador limpio antes de la tabla
    ws.row_dimensions[8].height = 8

    # ------------------------------------------------------------------
    # 6. TABLA PRINCIPAL ESTANDARIZADA (FILA 9 EN ADELANTE)
    # ------------------------------------------------------------------
    table_header_row = 9
    headers = [
        "#",
        "Carrier",
        "Tracking Number",
        "Estatus",
        "Origen → Destino",
        "Fecha Estimada / Entrega",
        "Último Movimiento",
        "Ubicación / Actualización",
    ]
    ws.row_dimensions[table_header_row].height = 24

    for col_idx, text in enumerate(headers, start=1):
        cell = ws.cell(row=table_header_row, column=col_idx, value=text)
        cell.fill = navy_fill
        cell.font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
        cell.alignment = Alignment(
            horizontal="left" if col_idx in (5, 7, 8) else "center",
            vertical="center",
        )
        cell.border = box_border

    # Filas de datos
    current_row = table_header_row + 1
    for idx, item in enumerate(resultados, start=1):
        status_key = (
            item.estatus_general.value
            if hasattr(item.estatus_general, "value")
            else str(item.estatus_general)
        )
        status_label = STATUS_LABELS_ES.get(status_key, status_key)
        if item.retrasado and status_key != "ENTREGADO":
            status_label = f"{status_label} (RETRASADO)"

        last_ev = item.eventos[0] if item.eventos else None
        ruta_str = (
            f"{item.origen or 'Origen s/d'} → {item.destino or 'Destino s/d'}"
            if (item.origen or item.destino)
            else "Sin ruta reportada"
        )
        fecha_compromiso = (
            f"Entregado: {item.fecha_entrega_real}"
            if (status_key == "ENTREGADO" and item.fecha_entrega_real)
            else (item.fecha_estimada_entrega or "—")
        )
        ultimo_mov = last_ev.descripcion if last_ev else (item.error or "Sin eventos")
        ubicacion_y_hora = (
            f"{last_ev.ubicacion} ({last_ev.fecha})"
            if last_ev
            else item.ultima_actualizacion
        )

        row_values = [
            idx,
            item.carrier,
            item.guia,
            status_label,
            ruta_str,
            fecha_compromiso,
            ultimo_mov,
            ubicacion_y_hora,
        ]

        ws.row_dimensions[current_row].height = 22
        for col_idx, val in enumerate(row_values, start=1):
            c = ws.cell(row=current_row, column=col_idx, value=val)
            c.fill = white_fill
            c.border = box_border
            c.font = Font(name="Calibri", size=9.5, color=slate_dark_hex)

            if col_idx in (1, 2, 4, 6):
                c.alignment = Alignment(horizontal="center", vertical="center")
            elif col_idx == 3:
                c.alignment = Alignment(horizontal="center", vertical="center")
                c.font = Font(name="Calibri", size=9.5, bold=True, color=navy_hex)
            else:
                c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)

            # Colorear la celda de Estatus (Columna 4)
            if col_idx == 4:
                c.fill = STATUS_FILLS.get(status_key, STATUS_FILLS["DESCONOCIDO"])
                c.font = Font(
                    name="Calibri",
                    size=9.5,
                    bold=True,
                    color=red_hex if (status_key == "INCIDENCIA" or item.retrasado) else navy_hex,
                )

        current_row += 1

    # ------------------------------------------------------------------
    # 7. PIE DE PÁGINA INSTITUCIONAL CON CINTA BICOLOR
    # ------------------------------------------------------------------
    footer_row = current_row + 1
    ws.row_dimensions[current_row].height = 8
    ws.row_dimensions[footer_row].height = 18

    for col_idx in range(1, 9):
        top_color = navy_hex if col_idx <= 4 else red_hex
        ws.cell(row=footer_row, column=col_idx).border = Border(
            top=Side(style="medium", color=top_color)
        )

    c_foot_left = ws.cell(row=footer_row, column=1, value="SupplyChain México")
    c_foot_left.font = Font(name="Calibri", size=8.5, color=slate_muted_hex)
    c_foot_left.alignment = Alignment(horizontal="left", vertical="center")

    ws.merge_cells(start_row=footer_row, start_column=3, end_row=footer_row, end_column=6)
    now_stamp = datetime.datetime.now().strftime("%d/%m/%Y %H:%M")
    c_foot_center = ws.cell(row=footer_row, column=3, value=f"Generado el {now_stamp}")
    c_foot_center.font = Font(name="Calibri", size=8.5, color=slate_muted_hex)
    c_foot_center.alignment = Alignment(horizontal="center", vertical="center")

    ws.merge_cells(start_row=footer_row, start_column=7, end_row=footer_row, end_column=8)
    c_foot_right = ws.cell(row=footer_row, column=7, value="Asset Management · Transporte")
    c_foot_right.font = Font(name="Calibri", size=8.5, bold=True, color=slate_muted_hex)
    c_foot_right.alignment = Alignment(horizontal="right", vertical="center")

    # Anchos de columna calibrados
    col_widths = [7, 15, 24, 22, 30, 22, 44, 30]
    for idx, width in enumerate(col_widths, start=1):
        ws.column_dimensions[get_column_letter(idx)].width = width

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()
