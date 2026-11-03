# -*- coding: utf-8 -*-
"""
estafeta.py
-----------
Adaptador para Estafeta API REST (Portal de Desarrolladores / Apigee OAuth2 + API Key).

Arquitectura de autenticación confirmada:
  1. OAuth2 Client Credentials:
     POST {ESTAFETA_AUTH_URL} (ej. https://apiqa.estafeta.com/auth/oauth/v2/token
     o https://api.estafeta.com/auth/oauth/v2/token)
     Body (x-www-form-urlencoded):
       grant_type=client_credentials&client_id=...&client_secret=...&scope=execute
  2. Consulta de rastreo (Search / WaybillTrack):
     POST {ESTAFETA_TRACK_URL}
     Headers:
       Authorization: Bearer <access_token>
       apikey: <ESTAFETA_API_KEY>
       Content-Type: application/json

TODO (Verificar en tu contrato del Portal de Desarrolladores de Estafeta):
  - Confirmar la URL exacta del endpoint de rastreo asignada en tu aplicación Apigee
    (`ESTAFETA_TRACK_URL` en `.env`), ya que Estafeta publica variantes según versión de cuenta:
      a) https://wstracking.estafeta.com/v1/waybillTrack (o https://api.estafeta.com/v1/waybillTrack)
      b) https://csrest.estafeta.com/v1/Tracking/search
  - Confirmar si tu cuenta requiere enviar `suscriberId`, `login` y `password` dentro del body JSON
    además del token OAuth2 y el header `apikey` (soportados opcionalmente vía `.env`).
"""

import os
import time
import asyncio
from typing import Any, Dict, List, Optional
import httpx
from dotenv import load_dotenv

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


def map_estafeta_status(
    status_text: Optional[str],
    event_code: Optional[str] = None,
) -> UnifiedTrackingStatus:
    """
    Traduce los estatus y descripciones de Estafeta (español / inglés / códigos)
    al enum unificado `UnifiedTrackingStatus`.
    """
    txt = (status_text or "").strip().upper()
    code = (event_code or "").strip().upper()

    # 1. Estatus ENTREGADO
    if code in ("DL", "ENT", "90", "01") or any(
        w in txt for w in ("ENTREGADO", "DELIVERED", "ENTREGA CONFIRMADA", "RECIBIO:")
    ):
        return UnifiedTrackingStatus.ENTREGADO

    # 2. Estatus INCIDENCIA / EXCEPCIÓN (se evalúa antes que EN REPARTO para capturar "NO ENTREGADO EN REPARTO")
    if code in ("EX", "INC", "DEV", "RET") or any(
        w in txt
        for w in (
            "INCIDENCIA",
            "EXCEPCIÓN",
            "EXCEPCION",
            "EXCEPTION",
            "DOMICILIO CERRADO",
            "DOMICILIO INCORRECTO",
            "NO ENTREGADO",
            "RECHAZADO",
            "DEVOLUCIÓN",
            "DEVOLUCION",
            "DEVUELTO",
            "DETENIDO",
            "SINIESTRO",
            "DATOS INCOMPLETOS",
        )
    ):
        return UnifiedTrackingStatus.INCIDENCIA

    # 3. Estatus EN_REPARTO
    if code in ("OD", "REP", "80") or any(
        w in txt
        for w in (
            "EN PROCESO DE ENTREGA",
            "EN REPARTO",
            "SALIDA A REPARTO",
            "CON MENSAJERO",
            "OUT FOR DELIVERY",
            "EN RUTA DE ENTREGA",
        )
    ):
        return UnifiedTrackingStatus.EN_REPARTO

    # 4. Estatus RECOLECTADO
    if code in ("PU", "REC", "10") or any(
        w in txt
        for w in (
            "RECOLECTADO",
            "RECOLECCIÓN",
            "RECOLECCION",
            "RECIBIDO EN OFICINA",
            "PICKED UP",
            "DOCUMENTADO",
            "GUÍA GENERADA",
            "GUIA GENERADA",
        )
    ):
        return UnifiedTrackingStatus.RECOLECTADO

    # 5. Estatus EN_TRANSITO
    if code in ("IT", "TR", "AR", "DP") or any(
        w in txt
        for w in (
            "EN TRÁNSITO",
            "EN TRANSITO",
            "IN TRANSIT",
            "LLEGADA A CENTRO",
            "SALIDA DE CENTRO",
            "MOVIMIENTO LOCAL",
            "CENTRO DE INTERCAMBIO",
            "CONEXIÓN",
            "CONEXION",
            "EN RUTA FORÁNEA",
            "EN RUTA FORANEA",
        )
    ):
        return UnifiedTrackingStatus.EN_TRANSITO

    return UnifiedTrackingStatus.DESCONOCIDO


class EstafetaAdapter(CarrierAdapter):
    """
    Adaptador oficial para Estafeta API REST con OAuth2 Client Credentials + API Key en header.
    """

    carrier_name = "ESTAFETA"

    def __init__(
        self,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        api_key: Optional[str] = None,
        auth_url: Optional[str] = None,
        track_url: Optional[str] = None,
        oauth_scope: Optional[str] = None,
        subscriber_id: Optional[str] = None,
        login_user: Optional[str] = None,
        login_password: Optional[str] = None,
    ):
        load_dotenv(override=True)
        self.client_id = (client_id if client_id is not None else os.getenv("ESTAFETA_CLIENT_ID", "")).strip()
        self.client_secret = (
            client_secret if client_secret is not None else os.getenv("ESTAFETA_CLIENT_SECRET", "")
        ).strip()
        self.api_key = (api_key if api_key is not None else os.getenv("ESTAFETA_API_KEY", "")).strip()
        self.auth_url = (
            auth_url
            if auth_url is not None
            else os.getenv("ESTAFETA_AUTH_URL", "https://apiqa.estafeta.com/auth/oauth/v2/token")
        ).strip()
        self.track_url = (
            track_url
            if track_url is not None
            else os.getenv("ESTAFETA_TRACK_URL", "https://apimwstrackingitem.estafeta.com/v1/ws_trackingitems/tracking-item-status")
        ).strip()
        self.oauth_scope = (
            oauth_scope if oauth_scope is not None else os.getenv("ESTAFETA_OAUTH_SCOPE", "execute")
        ).strip()

        # Parámetros opcionales de contrato Estafeta (si el endpoint los solicita en el payload)
        self.subscriber_id = (
            subscriber_id if subscriber_id is not None else os.getenv("ESTAFETA_SUBSCRIBER_ID", "")
        ).strip()
        self.login_user = (login_user if login_user is not None else os.getenv("ESTAFETA_LOGIN", "")).strip()
        self.login_password = (
            login_password if login_password is not None else os.getenv("ESTAFETA_PASSWORD", "")
        ).strip()

        self._access_token: Optional[str] = None
        self._token_expires_at: float = 0.0
        self._token_lock = asyncio.Lock()

    def has_credentials(self) -> bool:
        """True si las credenciales OAuth2 (client_id + client_secret) están presentes."""
        return bool(self.client_id and self.client_secret)

    @staticmethod
    def _is_label_endpoint(url: str) -> bool:
        """
        Protección: el WS labelrest (/wayBills) GENERA guías reales con costo.
        Nunca se debe usar como endpoint de rastreo.
        """
        u = (url or "").lower()
        return "labelrest" in u or "waybills" in u

    def missing_config_reason(self) -> Optional[str]:
        """Devuelve un mensaje en español explicando qué falta para rastrear en vivo, o None si está completo."""
        if not self.has_credentials():
            return "Las credenciales OAuth2 de Estafeta (ESTAFETA_CLIENT_ID / ESTAFETA_CLIENT_SECRET) no están configuradas en .env."
        if not self.track_url:
            return (
                "Credenciales de Estafeta válidas, pero falta la URL del servicio de RASTREO (ESTAFETA_TRACK_URL). "
                "Las credenciales recibidas corresponden al WS labelrest (generación de guías); solicita a Estafeta "
                "habilitar el WS de Tracking para este mismo ClientId."
            )
        if self._is_label_endpoint(self.track_url):
            return (
                "ESTAFETA_TRACK_URL apunta al WS labelrest (/wayBills), que genera guías reales con costo. "
                "Configura la URL del servicio de rastreo de Estafeta."
            )
        return None

    def is_configured(self) -> bool:
        """True solo si hay credenciales y una URL de rastreo válida (distinta de labelrest)."""
        load_dotenv(override=True)
        if not self.track_url:
            self.track_url = os.getenv("ESTAFETA_TRACK_URL", "").strip()
        return self.missing_config_reason() is None

    def invalidate_token(self) -> None:
        self._access_token = None
        self._token_expires_at = 0.0

    async def autenticar(self, client: httpx.AsyncClient) -> str:
        """
        Obtiene o renueva el token OAuth2 de Estafeta Apigee (`grant_type=client_credentials`).
        """
        now = time.monotonic()
        if self._access_token and now < self._token_expires_at:
            return self._access_token

        async with self._token_lock:
            now = time.monotonic()
            if self._access_token and now < self._token_expires_at:
                return self._access_token

            if not self.has_credentials():
                raise CarrierAuthError(
                    "ESTAFETA", "ESTAFETA_CLIENT_ID o ESTAFETA_CLIENT_SECRET no configurados en .env"
                )

            form_data = {
                "grant_type": "client_credentials",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
            }
            if self.oauth_scope:
                form_data["scope"] = self.oauth_scope

            try:
                resp = await client.post(
                    self.auth_url,
                    data=form_data,
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
            except httpx.TimeoutException as exc:
                logger.warning("Timeout al autenticar con Estafeta OAuth2")
                raise CarrierTimeoutError("ESTAFETA") from exc
            except httpx.RequestError as exc:
                logger.warning("Error de red al autenticar con Estafeta: %s", type(exc).__name__)
                raise CarrierUnavailableError("ESTAFETA") from exc

            if resp.status_code in (401, 403):
                logger.error("Credenciales OAuth2 rechazadas por Estafeta (HTTP %s)", resp.status_code)
                raise CarrierAuthError("ESTAFETA", f"HTTP {resp.status_code}")
            if resp.status_code == 429:
                raise CarrierQuotaExceededError("ESTAFETA")
            if resp.status_code >= 500:
                raise CarrierUnavailableError("ESTAFETA", f"(HTTP {resp.status_code})")
            if resp.status_code != 200:
                raise CarrierAuthError("ESTAFETA", f"Respuesta inesperada HTTP {resp.status_code}")

            body = resp.json()
            access_token = body.get("access_token")
            expires_in = int(body.get("expires_in", 3600))
            if not access_token:
                raise CarrierAuthError("ESTAFETA", "La respuesta OAuth2 no incluyó access_token")

            self._access_token = access_token
            self._token_expires_at = time.monotonic() + max(60, expires_in - 60)
            logger.info("Token OAuth2 de Estafeta obtenido correctamente (vigencia %ss)", expires_in)
            return self._access_token

    def _build_request_payload(self, guia: str) -> Dict[str, Any]:
        """
        Construye el payload JSON oficial según la Guía Técnica WS Pull Tracking de Estafeta:
        - searchType:
            0 = Búsqueda por número de guía (22 caracteres)
            1 = Búsqueda por código de rastreo (10 dígitos)
        - inputType: 0 (Lista)
        - itemsSearch: [guia]
        """
        clean_g = guia.strip()
        search_type = 1 if len(clean_g) == 10 and clean_g.isdigit() else 0
        return {
            "searchType": search_type,
            "inputType": 0,
            "itemsSearch": [clean_g],
        }

    async def rastrear(self, guia: str, client: httpx.AsyncClient) -> TrackingResult:
        """
        Consulta el rastreo de una guía en la API REST de Estafeta.
        Envía `Authorization: Bearer <token>` y `apikey: <ESTAFETA_API_KEY>`.
        """
        if self._is_label_endpoint(self.track_url):
            raise CarrierAuthError("ESTAFETA", "ESTAFETA_TRACK_URL apunta a labelrest (generación de guías); se bloqueó la consulta.")

        token = await self.autenticar(client)
        effective_api_key = self.api_key or self.client_id
        payload = self._build_request_payload(guia)

        for attempt in range(2):
            headers = {
                "Authorization": f"Bearer {token}",
                "apikey": effective_api_key,
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
            try:
                resp = await client.post(self.track_url, json=payload, headers=headers)
            except httpx.TimeoutException as exc:
                logger.warning("Timeout al consultar guía %s en Estafeta", guia)
                raise CarrierTimeoutError("ESTAFETA") from exc
            except httpx.RequestError as exc:
                logger.warning("Error de conexión con Estafeta para guía %s: %s", guia, type(exc).__name__)
                raise CarrierUnavailableError("ESTAFETA") from exc

            if resp.status_code == 401 and attempt == 0:
                logger.info("Token Estafeta expirado (HTTP 401), renovando automáticamente...")
                self.invalidate_token()
                token = await self.autenticar(client)
                continue

            if resp.status_code in (401, 403):
                raise CarrierAuthError("ESTAFETA", f"HTTP {resp.status_code}")
            if resp.status_code == 429:
                raise CarrierQuotaExceededError("ESTAFETA")
            if resp.status_code >= 500:
                raise CarrierUnavailableError("ESTAFETA", f"(HTTP {resp.status_code})")
            if resp.status_code >= 400:
                return TrackingResult(
                    carrier="ESTAFETA",
                    guia=guia,
                    estatus_general=UnifiedTrackingStatus.DESCONOCIDO,
                    ultima_actualizacion=now_iso_mx(),
                    candidatos_carrier=["ESTAFETA"],
                    error=f"Estafeta rechazó la consulta para la guía {guia} (HTTP {resp.status_code}).",
                    codigo_error="INVALID_GUIDE",
                )

            data = resp.json()
            return self.normalizar_respuesta(guia, data)

        raise CarrierAuthError("ESTAFETA", "No se pudo autenticar tras reintentar.")

    def normalizar_respuesta(self, guia: str, payload: Dict[str, Any]) -> TrackingResult:
        """
        Normaliza la respuesta JSON de Estafeta al modelo unificado `TrackingResult`.
        Soporta:
          1. WS Pull Tracking Oficial (método /tracking-item-status con `result.items`).
          2. WS Pull Tracking Oficial (método /tracking-items-History con `result.itemHistories`).
          3. Esquemas legacy (ExecuteQueryResult.trackingData / waybills).
        """
        root = payload.get("ExecuteQueryResult") or payload.get("result") or payload

        # Verificar código de error global en result
        result_meta = payload.get("result") if isinstance(payload.get("result"), dict) else {}
        if result_meta.get("success") is False:
            err_desc = result_meta.get("description") or "Error reportado por Estafeta"
            return TrackingResult(
                carrier="ESTAFETA",
                guia=guia,
                estatus_general=UnifiedTrackingStatus.DESCONOCIDO,
                ultima_actualizacion=now_iso_mx(),
                candidatos_carrier=["ESTAFETA"],
                error=err_desc,
                codigo_error=str(result_meta.get("code") or "ERROR"),
            )

        # Localizar el arreglo de envíos (items, itemHistories, trackingData, waybills)
        tracking_list = (
            payload.get("items")
            or root.get("items")
            or payload.get("itemHistories")
            or root.get("itemHistories")
            or root.get("trackingData")
            or root.get("TrackingData")
            or root.get("waybills")
            or []
        )
        if isinstance(tracking_list, dict):
            inner = tracking_list.get("TrackingData") or tracking_list.get("item")
            tracking_list = inner if isinstance(inner, list) else [tracking_list]

        if not tracking_list:
            err_info = root.get("error") or root.get("resultDescription") or root.get("message")
            err_msg = (
                str(err_info)
                if err_info
                else "No se encontró información de rastreo para esta guía en Estafeta."
            )
            return TrackingResult(
                carrier="ESTAFETA",
                guia=guia,
                estatus_general=UnifiedTrackingStatus.DESCONOCIDO,
                ultima_actualizacion=now_iso_mx(),
                candidatos_carrier=["ESTAFETA"],
                error=err_msg,
                codigo_error="NOT_FOUND",
            )

        item = tracking_list[0] if isinstance(tracking_list, list) else tracking_list

        # Verificar error a nivel de item particular (ej. Error 1005: waybill does not have info)
        item_err = item.get("error")
        if isinstance(item_err, dict) and item_err.get("code"):
            desc = item_err.get("description") or "Guía sin información en Estafeta"
            return TrackingResult(
                carrier="ESTAFETA",
                guia=guia,
                estatus_general=UnifiedTrackingStatus.DESCONOCIDO,
                ultima_actualizacion=now_iso_mx(),
                candidatos_carrier=["ESTAFETA"],
                error=desc,
                codigo_error=str(item_err.get("code")),
            )

        # 1. Estatus general
        status_current = item.get("statusCurrent") or {}
        raw_status = (
            status_current.get("spanishName")
            or status_current.get("englishName")
            or item.get("statusSPA")
            or item.get("status")
            or item.get("statusENG")
            or item.get("currentStatus")
            or ""
        )
        raw_code = status_current.get("code") or item.get("statusCode") or item.get("code")
        estatus_general = map_estafeta_status(str(raw_status), str(raw_code) if raw_code else None)

        # 2. Origen y Destino
        pickup_data = item.get("pickupDetails") or item.get("pickupData") or item.get("origin") or {}
        delivery_data = item.get("deliveryDetails") or item.get("deliveryData") or item.get("destination") or {}
        service_data = item.get("service") or {}
        customer_info = item.get("customerInfo") or {}

        origen = (
            pickup_data.get("warehouseName")
            or pickup_data.get("originName")
            or pickup_data.get("originAcronym")
            or pickup_data.get("city")
            or item.get("origin")
            or customer_info.get("origin")
        )
        if isinstance(origen, dict):
            origen = origen.get("city") or origen.get("name")

        dest_postal = service_data.get("destinationPostalCode")
        dest_name = (
            delivery_data.get("destinationName")
            or delivery_data.get("destinationAcronym")
            or delivery_data.get("city")
            or item.get("destination")
            or customer_info.get("destination")
        )
        if isinstance(dest_name, dict):
            dest_name = dest_name.get("city") or dest_name.get("name")
        destino = f"C.P. {dest_postal}" if dest_postal and not dest_name else dest_name

        # 3. Fechas (estimada y real de entrega)
        fecha_estimada: Optional[str] = (
            item.get("estimatedDeliveryDate")
            or (item.get("multipleServiceData") or {}).get("estimatedDeliveryDate")
            or delivery_data.get("scheduledDateTime")
            or item.get("scheduledDeliveryDate")
        )
        if fecha_estimada:
            fecha_estimada = str(fecha_estimada).replace("T", " ")[:10]

        fecha_real: Optional[str] = (
            delivery_data.get("deliveryDateTime")
            or item.get("deliveryDate")
            or item.get("actualDeliveryDate")
        )
        if fecha_real:
            fecha_real = str(fecha_real).replace("T", " ")[:19]

        # 4. Historial de eventos (status list de tracking-item-status o histories de tracking-items-History)
        raw_history = (
            item.get("status")
            or item.get("histories")
            or item.get("history")
            or item.get("events")
            or item.get("movements")
            or []
        )
        if isinstance(raw_history, dict):
            raw_history = raw_history.get("History") or raw_history.get("event") or [raw_history]

        eventos: List[TrackingEvent] = []
        for ev in raw_history:
            if not isinstance(ev, dict):
                continue
            ev_dt = (
                ev.get("eventDateTime")
                or ev.get("localDateTime")
                or ev.get("dateTime")
                or ev.get("date")
                or ""
            )
            ev_dt_str = str(ev_dt).replace("T", " ")[:19] or now_iso_mx()
            ev_place = (
                ev.get("warehouseName")
                or ev.get("eventPlaceName")
                or ev.get("placeName")
                or ev.get("location")
                or ev.get("warehouseCode")
                or "Estafeta"
            )
            ev_desc = (
                ev.get("spanishName")
                or ev.get("spanishDescription")
                or ev.get("eventDescriptionSPA")
                or ev.get("description")
                or ev.get("englishDescription")
                or "Movimiento registrado"
            )
            reason_desc = ev.get("reasonCodeDescription") or ev.get("reasonCode") or ev.get("exceptionDescriptionSPA")
            if reason_desc and str(reason_desc).strip() and str(reason_desc).strip() not in ev_desc:
                ev_desc = f"{ev_desc} ({reason_desc})"

            ev_code = ev.get("code") or ev.get("eventId") or ev.get("eventCode")
            ev_status = map_estafeta_status(ev_desc, str(ev_code) if ev_code else None)

            eventos.append(
                TrackingEvent(
                    fecha=ev_dt_str,
                    ubicacion=str(ev_place).strip(),
                    descripcion=str(ev_desc).strip(),
                    estatus=ev_status,
                    codigo_raw=str(ev_code) if ev_code else None,
                )
            )

        # Ordenar eventos descendente por fecha (más reciente arriba)
        eventos.sort(key=lambda e: e.fecha, reverse=True)

        if estatus_general == UnifiedTrackingStatus.DESCONOCIDO and eventos:
            estatus_general = eventos[0].estatus

        if estatus_general == UnifiedTrackingStatus.ENTREGADO and not fecha_real and eventos:
            fecha_real = eventos[0].fecha

        retrasado = evaluate_is_delayed(estatus_general, fecha_estimada)

        return TrackingResult(
            carrier="ESTAFETA",
            guia=guia,
            estatus_general=estatus_general,
            fecha_estimada_entrega=fecha_estimada,
            fecha_entrega_real=fecha_real,
            origen=str(origen).strip() if origen else None,
            destino=str(destino).strip() if destino else None,
            eventos=eventos,
            ultima_actualizacion=now_iso_mx(),
            es_ambiguo=False,
            candidatos_carrier=["ESTAFETA"],
            retrasado=retrasado,
            modo_simulacion=False,
            desde_cache=False,
        )
