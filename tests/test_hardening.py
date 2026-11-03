"""
Pruebas unitarias para las mejoras de Hardening y Seguridad (P0 - P3).
SUPPLYCHAIN MÉXICO / SEKO LOGISTICS
"""
import os
import unittest
from unittest.mock import patch, MagicMock
from pathlib import Path
from fastapi.testclient import TestClient
from fastapi import HTTPException

from src.validador_postal import (
    validar_y_limpiar_telefono,
    verificar_catalogo_disponible,
    SepomexNotAvailableError,
)
from src.techship_client import (
    verificar_orden_existente,
    verificar_calidad_direccion,
    STATUS_EXISTS,
    STATUS_NOT_EXISTS,
    STATUS_UNKNOWN,
)
from src.tracking.models import TrackingResult, UnifiedTrackingStatus
from src.tracking.service import build_tracking_excel_bytes
from src.api.server import app, require_api_key


class TestHardeningSuite(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    # --------------------------------------------------------------------------
    # 1. P0: require_api_key en endpoints destructivos
    # --------------------------------------------------------------------------
    def test_require_api_key_503_when_env_unset(self):
        """Si API_KEY no está configurada en os.environ, debe fallar cerrado (HTTP 503)."""
        with patch.dict(os.environ, {}, clear=True):
            if "API_KEY" in os.environ:
                del os.environ["API_KEY"]
            with self.assertRaises(HTTPException) as cm:
                require_api_key(x_api_key="alguna_llave")
            self.assertEqual(cm.exception.status_code, 503)

    def test_require_api_key_401_when_missing_or_invalid(self):
        """Si API_KEY está configurada, rechaza requests sin cabecera o con llave incorrecta (HTTP 401)."""
        with patch.dict(os.environ, {"API_KEY": "super_secreto_123"}):
            with self.assertRaises(HTTPException) as cm1:
                require_api_key(x_api_key=None)
            self.assertEqual(cm1.exception.status_code, 401)

            with self.assertRaises(HTTPException) as cm2:
                require_api_key(x_api_key="llave_equivocada")
            self.assertEqual(cm2.exception.status_code, 401)

    def test_require_api_key_200_when_valid(self):
        """Si la llave coincide exactamente, se autoriza."""
        with patch.dict(os.environ, {"API_KEY": "super_secreto_123"}):
            auth = require_api_key(x_api_key="super_secreto_123")
            self.assertEqual(auth, "super_secreto_123")

    def test_health_remains_public(self):
        """GET /api/health debe responder sin exigir X-API-Key."""
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertIn("status", response.json())

    def test_protected_endpoints_require_api_key(self):
        """POST /api/batches/delete-orders debe retornar 401 sin X-API-Key."""
        with patch.dict(os.environ, {"API_KEY": "clave_test"}):
            resp = self.client.post("/api/batches/delete-orders", json={"order_ids": ["123"]})
            self.assertEqual(resp.status_code, 401)

    def test_techship_process_requires_confirmation_for_live(self):
        """Para dry_run=False, exige confirm_live=True y header X-Confirm-Live: CONFIRM."""
        with patch.dict(os.environ, {"API_KEY": "clave_test"}):
            headers = {"X-API-Key": "clave_test"}
            resp = self.client.post(
                "/api/techship/process",
                headers=headers,
                json={"dry_run": False, "confirm_live": False},
            )
            self.assertEqual(resp.status_code, 400)
            self.assertIn("confirm_live=True", resp.json()["detail"])

    # --------------------------------------------------------------------------
    # 2. P0: Anti-duplicados tri-estado (exists / not_exists / unknown)
    # --------------------------------------------------------------------------
    @patch("src.techship_client._get_get_session")
    @patch("src.techship_client.get_auth_headers")
    def test_anti_duplicados_tri_state_exists(self, mock_auth, mock_get_session):
        mock_auth.return_value = {"x-api-key": "test"}
        mock_session = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = [
            {"TrackingNumber": "ESTA12345", "CustomerOrder": "ORD-001", "Status": "Processed", "Id": 100}
        ]
        mock_session.get.return_value = mock_resp
        mock_get_session.return_value = mock_session

        status, desc, shipment = verificar_orden_existente("ORD-001")
        self.assertEqual(status, STATUS_EXISTS)
        self.assertIn("ESTA12345", desc)
        self.assertIsNotNone(shipment)

    @patch("src.techship_client._get_get_session")
    @patch("src.techship_client.get_auth_headers")
    def test_anti_duplicados_tri_state_not_exists(self, mock_auth, mock_get_session):
        mock_auth.return_value = {"x-api-key": "test"}
        mock_session = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = []
        mock_session.get.return_value = mock_resp
        mock_get_session.return_value = mock_session

        status, desc, shipment = verificar_orden_existente("ORD-999")
        self.assertEqual(status, STATUS_NOT_EXISTS)
        self.assertIsNone(shipment)

    @patch("src.techship_client._get_get_session")
    @patch("src.techship_client.get_auth_headers")
    def test_anti_duplicados_tri_state_unknown_on_error(self, mock_auth, mock_get_session):
        mock_auth.return_value = {"x-api-key": "test"}
        mock_session = MagicMock()
        mock_session.get.side_effect = Exception("Connection Timeout")
        mock_get_session.return_value = mock_session

        status, desc, shipment = verificar_orden_existente("ORD-ERR")
        self.assertEqual(status, STATUS_UNKNOWN)
        self.assertIn("Connection Timeout", desc)
        self.assertIsNone(shipment)

    # --------------------------------------------------------------------------
    # 3. P0: Catálogo SEPOMEX ausente o corrupto
    # --------------------------------------------------------------------------
    def test_verificar_catalogo_disponible_missing_db(self):
        with self.assertRaises(SepomexNotAvailableError):
            verificar_catalogo_disponible(db_path=Path("data/nonexistent_sepomex_path.db"))

    # --------------------------------------------------------------------------
    # 4. P1 & P2: Phone unpacking y validación con NaN
    # --------------------------------------------------------------------------
    def test_validar_y_limpiar_telefono_nan_and_primitives(self):
        # NaN / float
        tel, valido, alerta = validar_y_limpiar_telefono(float("nan"))
        self.assertEqual(tel, "")
        self.assertFalse(valido)
        self.assertIsNotNone(alerta)

        # None
        tel, valido, alerta = validar_y_limpiar_telefono(None)
        self.assertEqual(tel, "")
        self.assertFalse(valido)
        self.assertIsNotNone(alerta)

        # Válido 10 dígitos
        tel, valido, alerta = validar_y_limpiar_telefono("55 1234 5678")
        self.assertEqual(tel, "5512345678")
        self.assertTrue(valido)
        self.assertIsNone(alerta)

    # --------------------------------------------------------------------------
    # 5. P1: Mock fallback bloquea exportación
    # --------------------------------------------------------------------------
    def test_build_tracking_excel_blocks_simulated_data(self):
        sim_res = TrackingResult(
            carrier="ESTAFETA",
            guia="SIM123456",
            estatus_general=UnifiedTrackingStatus.ENTREGADO,
            ultima_actualizacion="2026-03-30T10:00:00Z",
            simulated=True,
        )
        with self.assertRaises(ValueError) as cm:
            build_tracking_excel_bytes([sim_res])
        self.assertIn("simulados", str(cm.exception))

    # --------------------------------------------------------------------------
    # 6. P2: Calidad de dirección valida City / State y counterparts [RETORNO]
    # --------------------------------------------------------------------------
    def test_verificar_calidad_direccion_city_state(self):
        # Error en Ciudad o Estado dentro de la fila
        row_con_error = {
            "CustomerOrder": "SCTASK001",
            "City": "ERROR: Ciudad no encontrada",
            "State": "CDMX",
        }
        res, mot = verificar_calidad_direccion(row_con_error, None)
        self.assertFalse(res)
        self.assertIn("City", mot)

    def test_verificar_calidad_direccion_retorno_audit(self):
        # Par de retorno bloqueado por auditoría
        row_retorno = {
            "CustomerOrder": "RITM001-1",
            "City": "Toluca",
            "State": "Estado de México",
        }
        audit = {
            "RITM001-1 [RETORNO]": "ERROR: CP no encontrado en catálogo",
        }
        res, mot = verificar_calidad_direccion(row_retorno, audit)
        self.assertFalse(res)
        self.assertIn("Bloqueada por semáforo de auditoría", mot)


if __name__ == "__main__":
    unittest.main()
