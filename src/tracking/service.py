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
  - Exportación a Excel (.xlsx) con diseño institucional SupplyChain México (#233762 / #CE3A39).
"""

import io
import os
import time
import asyncio
import threading
from collections import deque
from typing import Deque, Dict, List, Optional
import httpx
import openpyxl
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
    
    Comportamiento actual y preparación para producción:
      - Si la variable `TRACKING_API_AUTH_TOKEN` está definida en `.env`, exige que el
        frontend envíe `Authorization: Bearer <TRACKING_API_AUTH_TOKEN>` (o un JWT válido).
      - Si no está definida (modo actual donde el login vive en sessionStorage del frontend),
        permite la petición y registra el contexto del usuario (`X-User-Email`, `X-User-Role`).
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

        if mock_fallback is None:
            env_mock = os.getenv("TRACKING_MOCK_FALLBACK", "true").strip().lower()
            self.mock_fallback = env_mock in ("1", "true", "yes", "si", "auto")
        else:
            self.mock_fallback = mock_fallback

        self.max_concurrency = max_concurrency or int(os.getenv("TRACKING_MAX_CONCURRENCY", "8"))
        self.timeout_seconds = timeout_seconds or float(os.getenv("TRACKING_HTTP_TIMEOUT_SECONDS", "15.0"))

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
            if self.mock_fallback:
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
        # Deduplicar preservando orden de aparición
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
# EXPORTACIÓN A EXCEL (.XLSX) CON DISEÑO INSTITUCIONAL SUPPLYCHAIN MÉXICO
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


def build_tracking_excel_bytes(resultados: List[TrackingResult]) -> bytes:
    """
    Construye un archivo Excel (.xlsx) en memoria con la tabla de rastreo
    formateada con los colores institucionales de SupplyChain México (#233762 y #CE3A39).
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Rastreo de Envíos"

    navy_fill = PatternFill(start_color="233762", end_color="233762", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    cell_font = Font(name="Calibri", size=10, color="1E293B")
    bold_font = Font(name="Calibri", size=10, bold=True, color="233762")
    alert_font = Font(name="Calibri", size=10, bold=True, color="CE3A39")

    thin_border = Border(
        left=Side(style="thin", color="CBD5E1"),
        right=Side(style="thin", color="CBD5E1"),
        top=Side(style="thin", color="CBD5E1"),
        bottom=Side(style="thin", color="CBD5E1"),
    )

    headers = [
        "Guía",
        "Carrier",
        "Estatus General",
        "¿Retrasado?",
        "Origen",
        "Destino",
        "Fecha Estimada",
        "Fecha Entrega Real",
        "Último Evento",
        "Ubicación Último Evento",
        "Última Actualización",
    ]

    ws.append(headers)
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = navy_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = thin_border
    ws.row_dimensions[1].height = 26

    for row_idx, item in enumerate(resultados, start=2):
        status_key = item.estatus_general.value if hasattr(item.estatus_general, "value") else str(item.estatus_general)
        status_label = STATUS_LABELS_ES.get(status_key, status_key)
        last_ev = item.eventos[0] if item.eventos else None

        row_values = [
            item.guia,
            item.carrier,
            status_label,
            "SÍ (VENCIDO)" if item.retrasado else "NO",
            item.origen or "—",
            item.destino or "—",
            item.fecha_estimada_entrega or "—",
            item.fecha_entrega_real or "—",
            last_ev.descripcion if last_ev else (item.error or "Sin eventos"),
            last_ev.ubicacion if last_ev else "—",
            item.ultima_actualizacion,
        ]
        ws.append(row_values)

        for col_idx in range(1, len(headers) + 1):
            c = ws.cell(row=row_idx, column=col_idx)
            c.font = cell_font
            c.border = thin_border
            c.alignment = Alignment(vertical="center", wrap_text=(col_idx == 9))

            if col_idx == 1:
                c.font = bold_font
            elif col_idx == 3:
                c.fill = STATUS_FILLS.get(status_key, STATUS_FILLS["DESCONOCIDO"])
                c.font = bold_font
                c.alignment = Alignment(horizontal="center", vertical="center")
            elif col_idx == 4 and item.retrasado:
                c.font = alert_font
                c.alignment = Alignment(horizontal="center", vertical="center")

    col_widths = [24, 14, 18, 15, 22, 22, 16, 20, 44, 26, 22]
    for idx, width in enumerate(col_widths, start=1):
        ws.column_dimensions[get_column_letter(idx)].width = width

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()
