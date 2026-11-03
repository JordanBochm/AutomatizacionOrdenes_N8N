# -*- coding: utf-8 -*-
"""
models.py
---------
Modelos de datos unificados (Pydantic) y tipos enumerados para el módulo de
Rastreo de Envíos (FedEx y Estafeta).
"""

from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator


class CarrierCode(str, Enum):
    FEDEX = "FEDEX"
    ESTAFETA = "ESTAFETA"
    DESCONOCIDO = "DESCONOCIDO"


class UnifiedTrackingStatus(str, Enum):
    RECOLECTADO = "RECOLECTADO"
    EN_TRANSITO = "EN_TRANSITO"
    EN_REPARTO = "EN_REPARTO"
    ENTREGADO = "ENTREGADO"
    INCIDENCIA = "INCIDENCIA"
    DESCONOCIDO = "DESCONOCIDO"


class TrackingEvent(BaseModel):
    fecha: str = Field(..., description="Fecha y hora del evento (ISO 8601 o formato legible)")
    ubicacion: str = Field(default="Ubicación no disponible", description="Ciudad, estado o centro operativo")
    descripcion: str = Field(..., description="Descripción del movimiento o escaneo")
    estatus: UnifiedTrackingStatus = Field(
        default=UnifiedTrackingStatus.DESCONOCIDO,
        description="Estatus normalizado asociado a este evento",
    )
    codigo_raw: Optional[str] = Field(default=None, description="Código original reportado por el carrier")


class TrackingResult(BaseModel):
    carrier: str = Field(..., description="Nombre del carrier: FEDEX o ESTAFETA")
    guia: str = Field(..., description="Número de guía limpio")
    estatus_general: UnifiedTrackingStatus = Field(
        default=UnifiedTrackingStatus.DESCONOCIDO,
        description="Estatus normalizado del envío",
    )
    fecha_estimada_entrega: Optional[str] = Field(
        default=None, description="Fecha estimada de entrega (YYYY-MM-DD o ISO)"
    )
    fecha_entrega_real: Optional[str] = Field(
        default=None, description="Fecha real de entrega cuando estatus es ENTREGADO"
    )
    origen: Optional[str] = Field(default=None, description="Ciudad / Estado de origen")
    destino: Optional[str] = Field(default=None, description="Ciudad / Estado de destino")
    eventos: List[TrackingEvent] = Field(
        default_factory=list,
        description="Historial de eventos ordenados del más reciente al más antiguo",
    )
    ultima_actualizacion: str = Field(
        ..., description="Timestamp de la última actualización o consulta"
    )
    es_ambiguo: bool = Field(
        default=False,
        description="True si el formato de la guía coincide con más de un carrier",
    )
    candidatos_carrier: List[str] = Field(
        default_factory=list,
        description="Lista de carriers candidatos detectados por formato",
    )
    retrasado: bool = Field(
        default=False,
        description="True si la fecha estimada ya venció y el envío no ha sido entregado",
    )
    modo_simulacion: bool = Field(
        default=False,
        description="True si la respuesta fue generada por el simulador (cuando faltan credenciales en .env)",
    )
    desde_cache: bool = Field(
        default=False,
        description="True si la respuesta provino de la caché en memoria",
    )
    error: Optional[str] = Field(
        default=None,
        description="Mensaje de error amigable en español si la consulta falló",
    )
    codigo_error: Optional[str] = Field(
        default=None,
        description="Código interno de error (INVALID_GUIDE, TIMEOUT, QUOTA_EXCEEDED, CARRIER_DOWN, AUTH_ERROR)",
    )


class BatchTrackingRequest(BaseModel):
    guias: List[str] = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Lista de números de guía a rastrear (máximo 50 por lote)",
    )
    carrier: Optional[str] = Field(
        default=None,
        description="Carrier forzado opcional (FEDEX o ESTAFETA). Si se omite, se autodetecta.",
    )
    force_refresh: bool = Field(
        default=False,
        description="Si es True, ignora la caché y consulta directamente al carrier.",
    )

    @field_validator("guias")
    @classmethod
    def validate_max_guias(cls, v: List[str]) -> List[str]:
        cleaned = [g.strip() for g in v if g and g.strip()]
        if not cleaned:
            raise ValueError("Debes proporcionar al menos una guía válida.")
        if len(cleaned) > 50:
            raise ValueError("El máximo permitido por consulta en lote es de 50 guías.")
        return cleaned


class ExportTrackingRequest(BaseModel):
    resultados: List[TrackingResult] = Field(
        ...,
        min_length=1,
        description="Resultados de rastreo a exportar a Excel (.xlsx)",
    )
