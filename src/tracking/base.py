# -*- coding: utf-8 -*-
"""
base.py
-------
Interfaz común del Patrón Adaptador (`CarrierAdapter`), excepciones tipadas en
español y utilidades compartidas para los carriers (FedEx, Estafeta y futuros).
"""

import abc
import datetime
import hashlib
import logging
from typing import Any, Dict, Optional
import httpx

from src.tracking.models import (
    TrackingEvent,
    TrackingResult,
    UnifiedTrackingStatus,
)

# Logger seguro (nunca registra API keys, secrets ni tokens)
logger = logging.getLogger("supplychain.tracking")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [Tracking] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


# ==============================================================================
# EXCEPCIONES TIPADAS EN ESPAÑOL
# ==============================================================================

class CarrierTrackingError(Exception):
    """Excepción base para errores de rastreo con mensaje amigable en español."""
    def __init__(self, message: str, codigo_error: str = "CARRIER_ERROR", status_code: int = 502):
        super().__init__(message)
        self.message = message
        self.codigo_error = codigo_error
        self.status_code = status_code


class InvalidTrackingNumberError(CarrierTrackingError):
    def __init__(self, message: str = "El número de guía no tiene un formato válido."):
        super().__init__(message, codigo_error="INVALID_GUIDE", status_code=400)


class CarrierAuthError(CarrierTrackingError):
    def __init__(self, carrier: str, detail: str = ""):
        msg = f"Error de autenticación con {carrier}. Verifica las credenciales en el archivo .env."
        if detail:
            msg = f"{msg} ({detail})"
        super().__init__(msg, codigo_error="AUTH_ERROR", status_code=502)


class CarrierQuotaExceededError(CarrierTrackingError):
    def __init__(self, carrier: str):
        super().__init__(
            f"Se excedió el límite de consultas por minuto (cuota agotada) en {carrier}. Intenta nuevamente en unos segundos.",
            codigo_error="QUOTA_EXCEEDED",
            status_code=429,
        )


class CarrierTimeoutError(CarrierTrackingError):
    def __init__(self, carrier: str):
        super().__init__(
            f"Tiempo de espera agotado al consultar {carrier}. El servidor del carrier tardó demasiado en responder.",
            codigo_error="TIMEOUT",
            status_code=504,
        )


class CarrierUnavailableError(CarrierTrackingError):
    def __init__(self, carrier: str, detail: str = ""):
        msg = f"El servicio de rastreo de {carrier} no está disponible temporalmente."
        if detail:
            msg = f"{msg} {detail}"
        super().__init__(msg, codigo_error="CARRIER_DOWN", status_code=503)


# ==============================================================================
# UTILIDADES COMPARTIDAS
# ==============================================================================

def now_iso_mx() -> str:
    """Retorna la fecha y hora actual en formato legible YYYY-MM-DD HH:MM:SS."""
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def evaluate_is_delayed(
    estatus: UnifiedTrackingStatus,
    fecha_estimada_entrega: Optional[str],
) -> bool:
    """
    Determina si un envío está retrasado:
      - No está ENTREGADO
      - Tiene fecha_estimada_entrega válida y es estrictamente anterior a la fecha actual (hoy).
    """
    if estatus == UnifiedTrackingStatus.ENTREGADO or not fecha_estimada_entrega:
        return False

    try:
        date_part = str(fecha_estimada_entrega).strip()[:10]
        est_date = datetime.date.fromisoformat(date_part)
        return est_date < datetime.date.today()
    except (ValueError, TypeError):
        return False


def build_simulated_tracking(guia: str, carrier: str) -> TrackingResult:
    """
    Generador determinista de rastreo simulado para pruebas en entorno local
    cuando las API Keys aún no han sido configuradas en `.env` y
    `TRACKING_MOCK_FALLBACK=true`.
    
    Nota: Permite probar los 5 estados visuales (ENTREGADO, EN_TRANSITO,
    EN_REPARTO, INCIDENCIA, RECOLECTADO) y el indicador de retraso según
    los últimos dígitos o hash de la guía.
    """
    digest = int(hashlib.sha256(f"{carrier}:{guia}".encode("utf-8")).hexdigest()[:8], 16)
    today = datetime.date.today()

    # Selección determinista de escenario según el último caracter o hash
    if guia.endswith("1") or digest % 5 == 0:
        estatus = UnifiedTrackingStatus.ENTREGADO
        est_date = (today - datetime.timedelta(days=1)).isoformat()
        real_date = f"{today.isoformat()} 13:45:00"
        origen = "LERMA, MEX"
        destino = "MONTERREY, NL"
        eventos = [
            TrackingEvent(
                fecha=f"{today.isoformat()} 13:45",
                ubicacion="MONTERREY, NL",
                descripcion="Entregado en recepción - Recibió: R. HERNANDEZ",
                estatus=UnifiedTrackingStatus.ENTREGADO,
                codigo_raw="DL",
            ),
            TrackingEvent(
                fecha=f"{today.isoformat()} 08:30",
                ubicacion="MONTERREY, NL",
                descripcion="En vehículo para entrega al destinatario (En reparto)",
                estatus=UnifiedTrackingStatus.EN_REPARTO,
                codigo_raw="OD",
            ),
            TrackingEvent(
                fecha=f"{(today - datetime.timedelta(days=1)).isoformat()} 21:15",
                ubicacion="HUB QUERÉTARO, QRO",
                descripcion="En tránsito hacia centro operativo destino",
                estatus=UnifiedTrackingStatus.EN_TRANSITO,
                codigo_raw="IT",
            ),
            TrackingEvent(
                fecha=f"{(today - datetime.timedelta(days=1)).isoformat()} 11:20",
                ubicacion="LERMA, MEX",
                descripcion="Envío recolectado en almacén SEKO Logistics",
                estatus=UnifiedTrackingStatus.RECOLECTADO,
                codigo_raw="PU",
            ),
        ]
    elif guia.endswith("9") or digest % 5 == 1:
        estatus = UnifiedTrackingStatus.INCIDENCIA
        est_date = (today - datetime.timedelta(days=2)).isoformat()
        real_date = None
        origen = "LERMA, MEX"
        destino = "GUADALAJARA, JAL"
        eventos = [
            TrackingEvent(
                fecha=f"{today.isoformat()} 14:10",
                ubicacion="GUADALAJARA, JAL",
                descripcion="Excepción de entrega: Domicilio cerrado / Se realizará segundo intento",
                estatus=UnifiedTrackingStatus.INCIDENCIA,
                codigo_raw="DE",
            ),
            TrackingEvent(
                fecha=f"{today.isoformat()} 09:05",
                ubicacion="GUADALAJARA, JAL",
                descripcion="En ruta de entrega local",
                estatus=UnifiedTrackingStatus.EN_REPARTO,
                codigo_raw="OD",
            ),
            TrackingEvent(
                fecha=f"{(today - datetime.timedelta(days=2)).isoformat()} 16:40",
                ubicacion="LERMA, MEX",
                descripcion="Recolectado en origen",
                estatus=UnifiedTrackingStatus.RECOLECTADO,
                codigo_raw="PU",
            ),
        ]
    elif guia.endswith("2") or digest % 5 == 2:
        estatus = UnifiedTrackingStatus.EN_REPARTO
        est_date = today.isoformat()
        real_date = None
        origen = "LERMA, MEX"
        destino = "CIUDAD DE MÉXICO, CDMX"
        eventos = [
            TrackingEvent(
                fecha=f"{today.isoformat()} 08:50",
                ubicacion="CIUDAD DE MÉXICO, CDMX",
                descripcion="Con mensajero en ruta de entrega final",
                estatus=UnifiedTrackingStatus.EN_REPARTO,
                codigo_raw="OD",
            ),
            TrackingEvent(
                fecha=f"{today.isoformat()} 05:20",
                ubicacion="CENTRO OPERATIVO VALLEJO, CDMX",
                descripcion="Llegada a estación de destino",
                estatus=UnifiedTrackingStatus.EN_TRANSITO,
                codigo_raw="AR",
            ),
            TrackingEvent(
                fecha=f"{(today - datetime.timedelta(days=1)).isoformat()} 17:00",
                ubicacion="LERMA, MEX",
                descripcion="Paquete recolectado por el carrier",
                estatus=UnifiedTrackingStatus.RECOLECTADO,
                codigo_raw="PU",
            ),
        ]
    elif guia.endswith("8") or digest % 5 == 3:
        # En tránsito pero con fecha estimada vencida (para probar alerta de retraso)
        estatus = UnifiedTrackingStatus.EN_TRANSITO
        est_date = (today - datetime.timedelta(days=1)).isoformat()
        real_date = None
        origen = "LERMA, MEX"
        destino = "MÉRIDA, YUC"
        eventos = [
            TrackingEvent(
                fecha=f"{today.isoformat()} 06:15",
                ubicacion="VILLAHERMOSA, TAB",
                descripcion="En tránsito hacia centro de distribución regional",
                estatus=UnifiedTrackingStatus.EN_TRANSITO,
                codigo_raw="IT",
            ),
            TrackingEvent(
                fecha=f"{(today - datetime.timedelta(days=2)).isoformat()} 18:30",
                ubicacion="LERMA, MEX",
                descripcion="Salida de estación origen",
                estatus=UnifiedTrackingStatus.EN_TRANSITO,
                codigo_raw="DP",
            ),
            TrackingEvent(
                fecha=f"{(today - datetime.timedelta(days=2)).isoformat()} 13:10",
                ubicacion="LERMA, MEX",
                descripcion="Envío recolectado",
                estatus=UnifiedTrackingStatus.RECOLECTADO,
                codigo_raw="PU",
            ),
        ]
    else:
        estatus = UnifiedTrackingStatus.EN_TRANSITO
        est_date = (today + datetime.timedelta(days=1)).isoformat()
        real_date = None
        origen = "LERMA, MEX"
        destino = "QUERÉTARO, QRO"
        eventos = [
            TrackingEvent(
                fecha=f"{today.isoformat()} 10:00",
                ubicacion="TOLUCA HUB, MEX",
                descripcion="En tránsito a centro de intercambio",
                estatus=UnifiedTrackingStatus.EN_TRANSITO,
                codigo_raw="IT",
            ),
            TrackingEvent(
                fecha=f"{today.isoformat()} 08:15",
                ubicacion="LERMA, MEX",
                descripcion="Envío recolectado y documentado",
                estatus=UnifiedTrackingStatus.RECOLECTADO,
                codigo_raw="PU",
            ),
        ]

    return TrackingResult(
        carrier=carrier,
        guia=guia,
        estatus_general=estatus,
        fecha_estimada_entrega=est_date,
        fecha_entrega_real=real_date,
        origen=origen,
        destino=destino,
        eventos=eventos,
        ultima_actualizacion=now_iso_mx(),
        es_ambiguo=False,
        candidatos_carrier=[carrier],
        retrasado=evaluate_is_delayed(estatus, est_date),
        modo_simulacion=True,
        desde_cache=False,
    )


# ==============================================================================
# INTERFAZ DEL PATRÓN ADAPTADOR
# ==============================================================================

class CarrierAdapter(abc.ABC):
    """
    Interfaz uniforme que deben implementar todos los adaptadores de paquetería
    (FedEx, Estafeta, DHL, UPS, etc.).
    """

    carrier_name: str = "DESCONOCIDO"

    @abc.abstractmethod
    def is_configured(self) -> bool:
        """Retorna True si las credenciales mínimas del carrier están presentes en el entorno."""
        raise NotImplementedError

    @abc.abstractmethod
    async def autenticar(self, client: httpx.AsyncClient) -> str:
        """Obtiene o renueva el token de acceso del carrier."""
        raise NotImplementedError

    @abc.abstractmethod
    async def rastrear(self, guia: str, client: httpx.AsyncClient) -> TrackingResult:
        """Consulta el rastreo de una guía en la API del carrier y devuelve un TrackingResult unificado."""
        raise NotImplementedError

    @abc.abstractmethod
    def normalizar_respuesta(self, guia: str, payload: Dict[str, Any]) -> TrackingResult:
        """Convierte el JSON nativo del carrier al modelo unificado TrackingResult."""
        raise NotImplementedError
