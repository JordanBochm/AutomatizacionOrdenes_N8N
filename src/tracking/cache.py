# -*- coding: utf-8 -*-
"""
cache.py
--------
Caché en memoria con tiempo de vida (TTL) diferenciado para resultados de rastreo:
  - 10 minutos (600s) para envíos en curso (EN_TRANSITO, EN_REPARTO, RECOLECTADO, INCIDENCIA, DESCONOCIDO).
  - 60 minutos (3600s) para envíos ya finalizados (ENTREGADO).
"""

import time
import threading
from dataclasses import dataclass
from typing import Dict, Optional, Tuple
from src.tracking.models import TrackingResult, UnifiedTrackingStatus


@dataclass
class _CacheEntry:
    result: TrackingResult
    expires_at: float
    created_at: float


class TrackingCache:
    """
    Caché thread-safe en memoria para resultados de rastreo por guía y carrier.
    """

    def __init__(
        self,
        default_ttl_seconds: int = 600,       # 10 minutos por defecto
        delivered_ttl_seconds: int = 3600,    # 60 minutos si ya está ENTREGADO
        max_entries: int = 2000,
    ):
        self.default_ttl_seconds = default_ttl_seconds
        self.delivered_ttl_seconds = delivered_ttl_seconds
        self.max_entries = max_entries
        self._store: Dict[str, _CacheEntry] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _build_key(guia: str, carrier: Optional[str] = None) -> str:
        carrier_part = (carrier or "AUTO").strip().upper()
        guia_part = guia.strip().upper()
        return f"{carrier_part}:{guia_part}"

    def get(self, guia: str, carrier: Optional[str] = None) -> Optional[TrackingResult]:
        """
        Obtiene un resultado de la caché si existe y no ha expirado.
        Retorna una copia con `desde_cache=True`.
        """
        now = time.monotonic()
        key = self._build_key(guia, carrier)

        with self._lock:
            entry = self._store.get(key)
            if entry is None and carrier is None:
                # Si se consultó en modo AUTO, buscar también en FEDEX o ESTAFETA
                for candidate in ("FEDEX", "ESTAFETA"):
                    alt_entry = self._store.get(self._build_key(guia, candidate))
                    if alt_entry and alt_entry.expires_at > now:
                        entry = alt_entry
                        break

            if entry is None:
                return None

            if now >= entry.expires_at:
                self._store.pop(key, None)
                return None

            cached_copy = entry.result.model_copy(deep=True)
            cached_copy.desde_cache = True
            return cached_copy

    def set(self, result: TrackingResult, requested_carrier: Optional[str] = None) -> None:
        """
        Almacena un resultado en caché aplicando el TTL según su estatus_general.
        No almacena resultados que contengan error transitorio (timeout, caído, cuota).
        """
        if result.error and result.codigo_error in ("TIMEOUT", "CARRIER_DOWN", "QUOTA_EXCEEDED", "AUTH_ERROR"):
            return

        now = time.monotonic()
        ttl = (
            self.delivered_ttl_seconds
            if result.estatus_general == UnifiedTrackingStatus.ENTREGADO
            else self.default_ttl_seconds
        )
        entry = _CacheEntry(
            result=result.model_copy(deep=True),
            expires_at=now + ttl,
            created_at=now,
        )

        with self._lock:
            # Limpieza preventiva si se supera el límite de entradas
            if len(self._store) >= self.max_entries:
                self._evict_expired_or_oldest(now)

            # Guardar bajo la clave del carrier real y bajo AUTO si aplica
            real_key = self._build_key(result.guia, result.carrier)
            self._store[real_key] = entry
            if requested_carrier:
                req_key = self._build_key(result.guia, requested_carrier)
                self._store[req_key] = entry

    def invalidate(self, guia: str) -> None:
        """Elimina todas las entradas de caché asociadas a una guía."""
        with self._lock:
            for c in ("AUTO", "FEDEX", "ESTAFETA"):
                self._store.pop(self._build_key(guia, c), None)

    def clear(self) -> None:
        """Vacía toda la caché."""
        with self._lock:
            self._store.clear()

    def _evict_expired_or_oldest(self, now: float) -> None:
        expired_keys = [k for k, v in self._store.items() if now >= v.expires_at]
        for k in expired_keys:
            self._store.pop(k, None)

        if len(self._store) >= self.max_entries:
            oldest_key = min(self._store.keys(), key=lambda k: self._store[k].created_at)
            self._store.pop(oldest_key, None)

    def stats(self) -> Dict[str, int]:
        now = time.monotonic()
        with self._lock:
            active = sum(1 for v in self._store.values() if v.expires_at > now)
            return {
                "total_keys": len(self._store),
                "active_keys": active,
                "default_ttl_seconds": self.default_ttl_seconds,
                "delivered_ttl_seconds": self.delivered_ttl_seconds,
            }
