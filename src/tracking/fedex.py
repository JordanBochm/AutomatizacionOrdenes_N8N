# -*- coding: utf-8 -*-
"""
fedex.py
--------
Adaptador oficial para FedEx Track API v1 (REST / OAuth2 Client Credentials).
Documentación de referencia: FedEx Developer Portal - Track API v1
  - OAuth2 Token: POST {FEDEX_BASE_URL}/oauth/token
  - Track API:    POST {FEDEX_BASE_URL}/track/v1/trackingnumbers
"""

import os
import time
import asyncio
from typing import Any, Dict, List, Optional
import httpx

from src.tracking.base import (
    CarrierAdapter,
    CarrierAuthError,
    CarrierQuotaExceededError,
    CarrierTimeoutError,
    CarrierUnavailableError,
    evaluate_is_delayed,
    logger,
    now_iso_mx,
)
from src.tracking.models import (
    TrackingEvent,
    TrackingResult,
    UnifiedTrackingStatus,
)


def map_fedex_status_code(
    code: Optional[str],
    description: Optional[str] = None,
) -> UnifiedTrackingStatus:
    """
    Traduce los códigos oficiales de FedEx (`derivedCode` / `eventType`) y/o
    descripciones al estatus unificado de SupplyChain México.
    """
    c = (code or "").strip().upper()
    desc = (description or "").strip().upper()

    # 1. Mapeo por código oficial FedEx
    if c == "DL":
        return UnifiedTrackingStatus.ENTREGADO
    if c == "OD":
        return UnifiedTrackingStatus.EN_REPARTO
    if c in ("PU", "OC", "PX", "AP"):
        return UnifiedTrackingStatus.RECOLECTADO
    if c in ("DE", "SE", "CA", "RS", "HL", "DY", "CD"):
        # Delivery Exception, Shipment Exception, Cancelled, Return to Shipper, Hold
        return UnifiedTrackingStatus.INCIDENCIA
    if c in ("IT", "DP", "AR", "IX", "AF", "CC", "LO", "FD", "TR"):
        return UnifiedTrackingStatus.EN_TRANSITO

    # 2. Fallback por texto descriptivo (español e inglés)
    if any(w in desc for w in ("ENTREGADO", "DELIVERED")):
        return UnifiedTrackingStatus.ENTREGADO
    if any(w in desc for w in ("EN REPARTO", "PARA ENTREGA", "VEHÍCULO DE FEDEX", "OUT FOR DELIVERY", "ON FEDEX VEHICLE")):
        return UnifiedTrackingStatus.EN_REPARTO
    if any(w in desc for w in ("EXCEPCIÓN", "EXCEPCION", "EXCEPTION", "INCIDENCIA", "CANCEL", "DEVUELTO", "DELAY", "RETRASO")):
        return UnifiedTrackingStatus.INCIDENCIA
    if any(w in desc for w in ("RECOLECTADO", "PICKED UP", "INFORMACIÓN DEL ENVÍO ENVIADA", "SHIPMENT INFORMATION SENT")):
        return UnifiedTrackingStatus.RECOLECTADO
    if any(w in desc for w in ("EN TRÁNSITO", "EN TRANSITO", "IN TRANSIT", "SALIDA", "LLEGADA", "DEPARTED", "ARRIVED", "INSTALACIONES DE FEDEX")):
        return UnifiedTrackingStatus.EN_TRANSITO

    return UnifiedTrackingStatus.DESCONOCIDO


def _format_fedex_address(addr: Optional[Dict[str, Any]]) -> Optional[str]:
    if not addr or not isinstance(addr, dict):
        return None
    city = (addr.get("city") or "").strip()
    state = (addr.get("stateOrProvinceCode") or "").strip()
    country = (addr.get("countryCode") or "").strip()
    parts = [p for p in (city, state) if p]
    if parts:
        return ", ".join(parts)
    return country or None


class FedExAdapter(CarrierAdapter):
    """
    Adaptador para FedEx Track API v1 con gestión de token OAuth2 en memoria
    y renovación automática.
    """

    carrier_name = "FEDEX"

    def __init__(
        self,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        base_url: Optional[str] = None,
        locale: Optional[str] = None,
    ):
        self.client_id = (client_id if client_id is not None else os.getenv("FEDEX_CLIENT_ID", "")).strip()
        self.client_secret = (client_secret if client_secret is not None else os.getenv("FEDEX_CLIENT_SECRET", "")).strip()
        self.base_url = (
            base_url if base_url is not None else os.getenv("FEDEX_BASE_URL", "https://apis-sandbox.fedex.com")
        ).strip().rstrip("/")
        self.locale = (locale if locale is not None else os.getenv("FEDEX_LOCALE", "es_MX")).strip()

        self._access_token: Optional[str] = None
        self._token_expires_at: float = 0.0
        self._token_lock = asyncio.Lock()

    def is_configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    def invalidate_token(self) -> None:
        self._access_token = None
        self._token_expires_at = 0.0

    async def autenticar(self, client: httpx.AsyncClient) -> str:
        """
        Obtiene o reutiliza el token OAuth2 de FedEx (`grant_type=client_credentials`).
        Renueva automáticamente 60 segundos antes de su expiración.
        """
        now = time.monotonic()
        if self._access_token and now < self._token_expires_at:
            return self._access_token

        async with self._token_lock:
            now = time.monotonic()
            if self._access_token and now < self._token_expires_at:
                return self._access_token

            if not self.is_configured():
                raise CarrierAuthError("FEDEX", "FEDEX_CLIENT_ID o FEDEX_CLIENT_SECRET no configurados")

            token_url = f"{self.base_url}/oauth/token"
            try:
                resp = await client.post(
                    token_url,
                    data={
                        "grant_type": "client_credentials",
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
            except httpx.TimeoutException as exc:
                logger.warning("Timeout al autenticar con FedEx OAuth2")
                raise CarrierTimeoutError("FEDEX") from exc
            except httpx.RequestError as exc:
                logger.warning("Error de red al autenticar con FedEx: %s", type(exc).__name__)
                raise CarrierUnavailableError("FEDEX") from exc

            if resp.status_code in (401, 403):
                logger.error("Credenciales OAuth2 rechazadas por FedEx (HTTP %s)", resp.status_code)
                raise CarrierAuthError("FEDEX", f"HTTP {resp.status_code}")
            if resp.status_code == 429:
                raise CarrierQuotaExceededError("FEDEX")
            if resp.status_code >= 500:
                raise CarrierUnavailableError("FEDEX", f"(HTTP {resp.status_code})")
            if resp.status_code != 200:
                raise CarrierAuthError("FEDEX", f"Respuesta inesperada HTTP {resp.status_code}")

            body = resp.json()
            access_token = body.get("access_token")
            expires_in = int(body.get("expires_in", 3600))
            if not access_token:
                raise CarrierAuthError("FEDEX", "La respuesta OAuth2 no incluyó access_token")

            # Margen de seguridad de 60 segundos antes de expirar
            self._access_token = access_token
            self._token_expires_at = time.monotonic() + max(60, expires_in - 60)
            logger.info("Token OAuth2 de FedEx obtenido correctamente (vigencia %ss)", expires_in)
            return self._access_token

    async def rastrear(self, guia: str, client: httpx.AsyncClient) -> TrackingResult:
        """
        Consulta la guía en `POST /track/v1/trackingnumbers`.
        Si recibe 401 (token revocado o expirado anticipadamente), renueva el token y reintenta 1 vez.
        """
        token = await self.autenticar(client)
        track_url = f"{self.base_url}/track/v1/trackingnumbers"
        payload = {
            "includeDetailedScans": True,
            "trackingInfo": [
                {
                    "trackingNumberInfo": {
                        "trackingNumber": guia,
                    }
                }
            ],
        }

        for attempt in range(2):
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "X-locale": self.locale,
            }
            try:
                resp = await client.post(track_url, json=payload, headers=headers)
            except httpx.TimeoutException as exc:
                logger.warning("Timeout al consultar guía %s en FedEx", guia)
                raise CarrierTimeoutError("FEDEX") from exc
            except httpx.RequestError as exc:
                logger.warning("Error de conexión con FedEx para guía %s: %s", guia, type(exc).__name__)
                raise CarrierUnavailableError("FEDEX") from exc

            if resp.status_code == 401 and attempt == 0:
                logger.info("Token FedEx expirado (HTTP 401), renovando automáticamente...")
                self.invalidate_token()
                token = await self.autenticar(client)
                continue

            if resp.status_code in (401, 403):
                raise CarrierAuthError("FEDEX", f"HTTP {resp.status_code}")
            if resp.status_code == 429:
                raise CarrierQuotaExceededError("FEDEX")
            if resp.status_code >= 500:
                raise CarrierUnavailableError("FEDEX", f"(HTTP {resp.status_code})")
            if resp.status_code >= 400:
                return TrackingResult(
                    carrier="FEDEX",
                    guia=guia,
                    estatus_general=UnifiedTrackingStatus.DESCONOCIDO,
                    ultima_actualizacion=now_iso_mx(),
                    candidatos_carrier=["FEDEX"],
                    error=f"FedEx rechazó la consulta para la guía {guia} (HTTP {resp.status_code}).",
                    codigo_error="INVALID_GUIDE",
                )

            data = resp.json()
            return self.normalizar_respuesta(guia, data)

        raise CarrierAuthError("FEDEX", "No se pudo autenticar tras reintentar.")

    def normalizar_respuesta(self, guia: str, payload: Dict[str, Any]) -> TrackingResult:
        """
        Normaliza la estructura JSON de FedEx Track API v1 al esquema unificado `TrackingResult`.
        """
        output = payload.get("output") or {}
        complete_results = output.get("completeTrackResults") or []
        if not complete_results:
            return TrackingResult(
                carrier="FEDEX",
                guia=guia,
                estatus_general=UnifiedTrackingStatus.DESCONOCIDO,
                ultima_actualizacion=now_iso_mx(),
                candidatos_carrier=["FEDEX"],
                error="No se encontró información para esta guía en FedEx.",
                codigo_error="NOT_FOUND",
            )

        track_results = complete_results[0].get("trackResults") or []
        if not track_results:
            return TrackingResult(
                carrier="FEDEX",
                guia=guia,
                estatus_general=UnifiedTrackingStatus.DESCONOCIDO,
                ultima_actualizacion=now_iso_mx(),
                candidatos_carrier=["FEDEX"],
                error="FedEx no devolvió resultados de seguimiento para esta guía.",
                codigo_error="NOT_FOUND",
            )

        tr = track_results[0]

        # Verificar si FedEx devolvió un objeto error dentro del trackResult (ej. TRACKING.TRACKINGNUMBER.NOTFOUND)
        tr_error = tr.get("error")
        if tr_error and isinstance(tr_error, dict):
            err_msg = tr_error.get("message") or "Guía no encontrada en el sistema de FedEx."
            return TrackingResult(
                carrier="FEDEX",
                guia=guia,
                estatus_general=UnifiedTrackingStatus.DESCONOCIDO,
                ultima_actualizacion=now_iso_mx(),
                candidatos_carrier=["FEDEX"],
                error=err_msg,
                codigo_error="NOT_FOUND",
            )

        # 1. Estatus general
        latest_status = tr.get("latestStatusDetail") or {}
        status_code = latest_status.get("derivedCode") or latest_status.get("code")
        status_desc = (
            latest_status.get("statusByLocale")
            or latest_status.get("description")
            or latest_status.get("ancillaryDetails", [{}])[0].get("reasonDescription")
            if latest_status.get("ancillaryDetails")
            else latest_status.get("statusByLocale") or latest_status.get("description")
        )
        estatus_general = map_fedex_status_code(status_code, status_desc)

        # 2. Origen y Destino
        origen = (
            _format_fedex_address((tr.get("shipperInformation") or {}).get("address"))
            or _format_fedex_address(((tr.get("originLocation") or {}).get("locationContactAndAddress") or {}).get("address"))
        )
        destino = (
            _format_fedex_address((tr.get("recipientInformation") or {}).get("address"))
            or _format_fedex_address(((tr.get("destinationLocation") or {}).get("locationContactAndAddress") or {}).get("address"))
            or _format_fedex_address(latest_status.get("scanLocation"))
        )

        # 3. Fechas (estimada y real de entrega)
        fecha_estimada: Optional[str] = None
        fecha_real: Optional[str] = None

        for dt_item in tr.get("dateAndTimes") or []:
            dt_type = (dt_item.get("type") or "").upper()
            dt_val = dt_item.get("dateTime")
            if not dt_val:
                continue
            if dt_type in ("ESTIMATED_DELIVERY", "APPOINTMENT_DELIVERY", "COMMITMENT") and not fecha_estimada:
                fecha_estimada = str(dt_val)[:10]
            elif dt_type == "ACTUAL_DELIVERY":
                fecha_real = str(dt_val).replace("T", " ")[:19]

        if not fecha_estimada:
            window = ((tr.get("standardTransitTimeWindow") or {}).get("window") or {}).get("ends")
            if window:
                fecha_estimada = str(window)[:10]

        # 4. Eventos de escaneo (ordenados del más reciente al más antiguo)
        eventos: List[TrackingEvent] = []
        raw_events = tr.get("scanEvents") or []
        for ev in raw_events:
            ev_date = str(ev.get("date") or "").replace("T", " ")[:19]
            ev_code = ev.get("eventType") or ev.get("derivedStatusCode")
            ev_desc = (
                ev.get("eventDescription")
                or ev.get("exceptionDescription")
                or ev.get("derivedStatus")
                or "Movimiento registrado"
            )
            exc_desc = ev.get("exceptionDescription")
            if exc_desc and exc_desc not in ev_desc:
                ev_desc = f"{ev_desc} ({exc_desc})"

            loc = _format_fedex_address(ev.get("scanLocation")) or "Instalaciones FedEx"
            ev_status = map_fedex_status_code(ev_code, ev_desc)
            eventos.append(
                TrackingEvent(
                    fecha=ev_date or now_iso_mx(),
                    ubicacion=loc,
                    descripcion=ev_desc,
                    estatus=ev_status,
                    codigo_raw=ev_code,
                )
            )

        # Ordenar eventos descendente por fecha (más reciente arriba)
        eventos.sort(key=lambda e: e.fecha, reverse=True)

        # Si el último evento indica ENTREGADO y no venía en latestStatusDetail
        if estatus_general == UnifiedTrackingStatus.DESCONOCIDO and eventos:
            estatus_general = eventos[0].estatus

        if estatus_general == UnifiedTrackingStatus.ENTREGADO and not fecha_real and eventos:
            fecha_real = eventos[0].fecha

        retrasado = evaluate_is_delayed(estatus_general, fecha_estimada)

        return TrackingResult(
            carrier="FEDEX",
            guia=guia,
            estatus_general=estatus_general,
            fecha_estimada_entrega=fecha_estimada,
            fecha_entrega_real=fecha_real,
            origen=origen,
            destino=destino,
            eventos=eventos,
            ultima_actualizacion=now_iso_mx(),
            es_ambiguo=False,
            candidatos_carrier=["FEDEX"],
            retrasado=retrasado,
            modo_simulacion=False,
            desde_cache=False,
        )
