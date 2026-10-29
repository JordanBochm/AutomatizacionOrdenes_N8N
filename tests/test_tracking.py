# -*- coding: utf-8 -*-
"""
test_tracking.py
----------------
Pruebas unitarias para el módulo de Rastreo de Envíos (FedEx y Estafeta):
  1. Detección automática de carrier por formato de guía y manejo de ambigüedad.
  2. Normalización de respuestas simuladas (JSON nativo) de FedEx Track API v1.
  3. Normalización de respuestas simuladas (JSON nativo) de Estafeta API REST.
  4. Caché en memoria con TTL diferenciado (en tránsito vs ENTREGADO) e invalidación.
  5. Orquestación asíncrona individual, fallback en guías ambiguas y lote (batch).
"""

import time
import unittest
from typing import Any, Dict
import httpx

from src.tracking.base import CarrierAdapter, CarrierTimeoutError, now_iso_mx
from src.tracking.cache import TrackingCache
from src.tracking.detector import detect_carrier
from src.tracking.estafeta import EstafetaAdapter
from src.tracking.fedex import FedExAdapter
from src.tracking.models import (
    TrackingEvent,
    TrackingResult,
    UnifiedTrackingStatus,
)
from src.tracking.service import TrackingService, build_tracking_excel_bytes


class TestCarrierDetector(unittest.TestCase):
    """Pruebas unitarias para el detector de carrier por formato de guía."""

    def test_fedex_12_digitos_con_espacios(self):
        res = detect_carrier("8793 8866 3139")
        self.assertTrue(res.es_valida)
        self.assertEqual(res.guia_limpia, "879388663139")
        self.assertEqual(res.carrier_principal, "FEDEX")
        self.assertEqual(res.candidatos, ["FEDEX"])
        self.assertFalse(res.es_ambiguo)

    def test_fedex_15_y_20_digitos(self):
        res15 = detect_carrier("041441760228964")
        self.assertTrue(res15.es_valida)
        self.assertEqual(res15.carrier_principal, "FEDEX")
        self.assertFalse(res15.es_ambiguo)

        res20 = detect_carrier("96110209876543123456")
        self.assertTrue(res20.es_valida)
        self.assertEqual(res20.carrier_principal, "FEDEX")
        self.assertFalse(res20.es_ambiguo)

    def test_estafeta_22_caracteres_estandar(self):
        res = detect_carrier("0055987105810101025695")
        self.assertTrue(res.es_valida)
        self.assertEqual(res.carrier_principal, "ESTAFETA")
        self.assertEqual(res.candidatos, ["ESTAFETA"])
        self.assertFalse(res.es_ambiguo)

    def test_estafeta_22_alfanumerico(self):
        res = detect_carrier("10559871058A0101025695")
        self.assertTrue(res.es_valida)
        self.assertEqual(res.carrier_principal, "ESTAFETA")
        self.assertFalse(res.es_ambiguo)

    def test_guia_ambigua_10_digitos_devuelve_ambos_candidatos(self):
        res = detect_carrier("5012345678")
        self.assertTrue(res.es_valida)
        self.assertTrue(res.es_ambiguo)
        self.assertEqual(res.candidatos, ["ESTAFETA", "FEDEX"])

    def test_guia_ambigua_22_digitos_prefijo_92(self):
        res = detect_carrier("9261290987654312345678")
        self.assertTrue(res.es_valida)
        self.assertTrue(res.es_ambiguo)
        self.assertEqual(res.candidatos, ["FEDEX", "ESTAFETA"])

    def test_rechaza_notacion_cientifica_y_formatos_invalidos(self):
        res_sci = detect_carrier("8.79E+11")
        self.assertFalse(res_sci.es_valida)
        self.assertIn("notación científica", res_sci.motivo_invalidez or "")

        res_short = detect_carrier("123")
        self.assertFalse(res_short.es_valida)


class TestFedExNormalization(unittest.TestCase):
    """Pruebas de normalización de respuestas JSON de FedEx Track API v1."""

    def setUp(self):
        self.adapter = FedExAdapter(client_id="dummy_id", client_secret="dummy_secret")

    def test_normaliza_envio_entregado_fedex(self):
        mock_payload = {
            "output": {
                "completeTrackResults": [
                    {
                        "trackingNumber": "879388663139",
                        "trackResults": [
                            {
                                "latestStatusDetail": {
                                    "code": "DL",
                                    "derivedCode": "DL",
                                    "statusByLocale": "Entregado",
                                    "description": "Delivered",
                                },
                                "shipperInformation": {
                                    "address": {"city": "LERMA", "stateOrProvinceCode": "MEX", "countryCode": "MX"}
                                },
                                "recipientInformation": {
                                    "address": {"city": "MONTERREY", "stateOrProvinceCode": "NL", "countryCode": "MX"}
                                },
                                "dateAndTimes": [
                                    {"type": "ESTIMATED_DELIVERY", "dateTime": "2026-10-28T18:00:00-06:00"},
                                    {"type": "ACTUAL_DELIVERY", "dateTime": "2026-10-28T14:22:10-06:00"},
                                ],
                                "scanEvents": [
                                    {
                                        "date": "2026-10-27T09:00:00",
                                        "eventType": "PU",
                                        "eventDescription": "Envío recolectado",
                                        "scanLocation": {"city": "LERMA", "stateOrProvinceCode": "MEX"},
                                    },
                                    {
                                        "date": "2026-10-28T14:22:10",
                                        "eventType": "DL",
                                        "eventDescription": "Entregado en recepción",
                                        "scanLocation": {"city": "MONTERREY", "stateOrProvinceCode": "NL"},
                                    },
                                ],
                            }
                        ],
                    }
                ]
            }
        }
        res = self.adapter.normalizar_respuesta("879388663139", mock_payload)
        self.assertEqual(res.carrier, "FEDEX")
        self.assertEqual(res.estatus_general, UnifiedTrackingStatus.ENTREGADO)
        self.assertEqual(res.origen, "LERMA, MEX")
        self.assertEqual(res.destino, "MONTERREY, NL")
        self.assertEqual(res.fecha_estimada_entrega, "2026-10-28")
        self.assertEqual(res.fecha_entrega_real, "2026-10-28 14:22:10")
        self.assertFalse(res.retrasado)
        # Evento más reciente debe ir primero
        self.assertEqual(len(res.eventos), 2)
        self.assertEqual(res.eventos[0].estatus, UnifiedTrackingStatus.ENTREGADO)

    def test_normaliza_incidencia_y_retraso_fedex(self):
        mock_payload = {
            "output": {
                "completeTrackResults": [
                    {
                        "trackResults": [
                            {
                                "latestStatusDetail": {
                                    "derivedCode": "DE",
                                    "statusByLocale": "Excepción de entrega",
                                },
                                "dateAndTimes": [
                                    {"type": "ESTIMATED_DELIVERY", "dateTime": "2020-01-01T18:00:00"}
                                ],
                                "scanEvents": [
                                    {
                                        "date": "2020-01-02T11:30:00",
                                        "eventType": "DE",
                                        "eventDescription": "Cliente no disponible o negocio cerrado",
                                        "scanLocation": {"city": "GUADALAJARA", "stateOrProvinceCode": "JAL"},
                                    }
                                ],
                            }
                        ]
                    }
                ]
            }
        }
        res = self.adapter.normalizar_respuesta("123456789012", mock_payload)
        self.assertEqual(res.estatus_general, UnifiedTrackingStatus.INCIDENCIA)
        self.assertTrue(res.retrasado)


class TestEstafetaNormalization(unittest.TestCase):
    """Pruebas de normalización de respuestas JSON de Estafeta API REST."""

    def setUp(self):
        self.adapter = EstafetaAdapter(client_id="est_id", client_secret="est_secret", api_key="est_key")

    def test_normaliza_respuesta_estafeta_en_reparto(self):
        mock_payload = {
            "ExecuteQueryResult": {
                "trackingData": [
                    {
                        "waybill": "0055987105810101025695",
                        "statusSPA": "EN PROCESO DE ENTREGA",
                        "pickupData": {"originName": "TOLUCA"},
                        "deliveryData": {
                            "destinationName": "QUERÉTARO",
                            "scheduledDateTime": "2099-12-31T18:00:00",
                        },
                        "history": [
                            {
                                "eventDateTime": "2026-10-28T19:00:00",
                                "eventPlaceName": "TOLUCA",
                                "eventDescriptionSPA": "Recolectado en origen",
                            },
                            {
                                "eventDateTime": "2026-10-29T08:45:00",
                                "eventPlaceName": "QUERÉTARO",
                                "eventDescriptionSPA": "En proceso de entrega a destinatario",
                            },
                        ],
                    }
                ]
            }
        }
        res = self.adapter.normalizar_respuesta("0055987105810101025695", mock_payload)
        self.assertEqual(res.carrier, "ESTAFETA")
        self.assertEqual(res.estatus_general, UnifiedTrackingStatus.EN_REPARTO)
        self.assertEqual(res.origen, "TOLUCA")
        self.assertEqual(res.destino, "QUERÉTARO")
        self.assertEqual(len(res.eventos), 2)
        self.assertEqual(res.eventos[0].estatus, UnifiedTrackingStatus.EN_REPARTO)


class TestTrackingCache(unittest.TestCase):
    """Pruebas de caché en memoria y TTL diferenciado."""

    def test_cache_guarda_y_expira(self):
        cache = TrackingCache(default_ttl_seconds=1, delivered_ttl_seconds=5)
        item = TrackingResult(
            carrier="FEDEX",
            guia="879388663139",
            estatus_general=UnifiedTrackingStatus.EN_TRANSITO,
            ultima_actualizacion=now_iso_mx(),
        )
        cache.set(item)
        cached = cache.get("879388663139", "FEDEX")
        self.assertIsNotNone(cached)
        self.assertTrue(cached.desde_cache)

        time.sleep(1.1)
        expired = cache.get("879388663139", "FEDEX")
        self.assertIsNone(expired)

    def test_cache_no_almacena_errores_transitorios(self):
        cache = TrackingCache(default_ttl_seconds=600)
        err_item = TrackingResult(
            carrier="FEDEX",
            guia="879388663139",
            estatus_general=UnifiedTrackingStatus.DESCONOCIDO,
            ultima_actualizacion=now_iso_mx(),
            error="Timeout",
            codigo_error="TIMEOUT",
        )
        cache.set(err_item)
        self.assertIsNone(cache.get("879388663139", "FEDEX"))


class _DummyAdapter(CarrierAdapter):
    def __init__(self, name: str, found_guides: Dict[str, UnifiedTrackingStatus]):
        self.carrier_name = name
        self.found_guides = found_guides

    def is_configured(self) -> bool:
        return True

    async def autenticar(self, client: httpx.AsyncClient) -> str:
        return "tok"

    async def rastrear(self, guia: str, client: httpx.AsyncClient) -> TrackingResult:
        if guia in self.found_guides:
            st = self.found_guides[guia]
            return TrackingResult(
                carrier=self.carrier_name,
                guia=guia,
                estatus_general=st,
                ultima_actualizacion=now_iso_mx(),
                eventos=[
                    TrackingEvent(
                        fecha="2026-10-29 10:00",
                        ubicacion="CDMX",
                        descripcion="Evento simulado",
                        estatus=st,
                    )
                ],
            )
        return TrackingResult(
            carrier=self.carrier_name,
            guia=guia,
            estatus_general=UnifiedTrackingStatus.DESCONOCIDO,
            ultima_actualizacion=now_iso_mx(),
            error="No encontrado",
            codigo_error="NOT_FOUND",
        )

    def normalizar_respuesta(self, guia: str, payload: Dict[str, Any]) -> TrackingResult:
        raise NotImplementedError


class TestTrackingServiceAsync(unittest.IsolatedAsyncioTestCase):
    """Pruebas asíncronas para el orquestador TrackingService y exportación Excel."""

    async def test_fallback_ambiguo_10_digitos_encuentra_en_fedex(self):
        # Guía de 10 dígitos: Estafeta es principal, pero solo existe en FedEx
        est_adapter = _DummyAdapter("ESTAFETA", {})
        fdx_adapter = _DummyAdapter("FEDEX", {"5012345678": UnifiedTrackingStatus.ENTREGADO})
        service = TrackingService(
            fedex_adapter=fdx_adapter,
            estafeta_adapter=est_adapter,
            mock_fallback=False,
        )

        res = await service.track_single("5012345678")
        self.assertEqual(res.carrier, "FEDEX")
        self.assertEqual(res.estatus_general, UnifiedTrackingStatus.ENTREGADO)
        self.assertTrue(res.es_ambiguo)
        self.assertEqual(res.candidatos_carrier, ["ESTAFETA", "FEDEX"])

    async def test_batch_concurrente_y_exportacion_excel(self):
        est_adapter = _DummyAdapter("ESTAFETA", {"0055987105810101025695": UnifiedTrackingStatus.EN_TRANSITO})
        fdx_adapter = _DummyAdapter("FEDEX", {"879388663139": UnifiedTrackingStatus.ENTREGADO})
        service = TrackingService(
            fedex_adapter=fdx_adapter,
            estafeta_adapter=est_adapter,
            mock_fallback=False,
        )

        results = await service.track_batch(["8793 8866 3139", "0055987105810101025695"])
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0].carrier, "FEDEX")
        self.assertEqual(results[1].carrier, "ESTAFETA")

        excel_bytes = build_tracking_excel_bytes(results)
        self.assertTrue(len(excel_bytes) > 1000)


if __name__ == "__main__":
    unittest.main()
