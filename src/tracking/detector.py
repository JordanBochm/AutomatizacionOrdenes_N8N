# -*- coding: utf-8 -*-
"""
detector.py
-----------
Detección automática de carrier (FedEx vs Estafeta) basada en el formato y
longitud del número de guía. Si el formato es ambiguo, devuelve ambos candidatos.
"""

import re
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class CarrierDetectionResult:
    guia_limpia: str
    es_valida: bool
    carrier_principal: Optional[str]
    candidatos: List[str]
    es_ambiguo: bool
    motivo_invalidez: Optional[str] = None


def clean_tracking_number(raw_guia: str) -> str:
    """
    Limpia espacios, guiones y caracteres invisibles del número de guía,
    convirtiendo a mayúsculas.
    """
    if not raw_guia:
        return ""
    cleaned = re.sub(r"[\s\-_]+", "", str(raw_guia).strip()).upper()
    return cleaned


def detect_carrier(raw_guia: str, forced_carrier: Optional[str] = None) -> CarrierDetectionResult:
    """
    Detecta el carrier a partir del formato de la guía.
    
    Formatos reconocidos:
      - FedEx exclusivo:
          * 12 dígitos numéricos (FedEx Express / Ground estándar, ej. 879388663139)
          * 15 dígitos numéricos (FedEx Ground)
          * 20 dígitos numéricos (FedEx SmartPost / Ground 96)
          * 34 dígitos numéricos (FedEx Ground / Door Tag)
          * Inicia con "DT" seguido de 12 dígitos (FedEx Door Tag)
      - Estafeta exclusivo:
          * 22 caracteres alfanuméricos que contienen al menos una letra (código de guía Estafeta)
          * 22 dígitos numéricos que inician con "0" a "8" (código de rastreo Estafeta México)
      - Ambiguo (devuelve ambos candidatos ["ESTAFETA", "FEDEX"] o ["FEDEX", "ESTAFETA"]):
          * 10 dígitos numéricos (común en guía corta Estafeta, pero posible en FedEx legado)
          * 22 dígitos numéricos que inician con "9" (posible FedEx SmartPost 92/96 o Estafeta)
          * Otras longitudes alfanuméricas entre 8 y 34 caracteres
    """
    guia = clean_tracking_number(raw_guia)

    if not guia:
        return CarrierDetectionResult(
            guia_limpia="",
            es_valida=False,
            carrier_principal=None,
            candidatos=[],
            es_ambiguo=False,
            motivo_invalidez="La guía está vacía.",
        )

    # Detectar notación científica accidental de Excel (ej. 8.79E+11)
    if re.match(r"^\d+(\.\d+)?E\+\d+$", guia, re.IGNORECASE):
        return CarrierDetectionResult(
            guia_limpia=guia,
            es_valida=False,
            carrier_principal=None,
            candidatos=[],
            es_ambiguo=False,
            motivo_invalidez="La guía está dañada por notación científica de Excel (ej. 8.79E+11).",
        )

    if not re.match(r"^[A-Z0-9]{8,34}$", guia):
        return CarrierDetectionResult(
            guia_limpia=guia,
            es_valida=False,
            carrier_principal=None,
            candidatos=[],
            es_ambiguo=False,
            motivo_invalidez=(
                "Formato de guía inválido. Debe contener entre 8 y 34 caracteres alfanuméricos sin símbolos."
            ),
        )

    # Si el usuario o el lote especificó explícitamente el carrier
    if forced_carrier:
        fc = forced_carrier.strip().upper()
        if "FEDEX" in fc:
            return CarrierDetectionResult(
                guia_limpia=guia,
                es_valida=True,
                carrier_principal="FEDEX",
                candidatos=["FEDEX"],
                es_ambiguo=False,
            )
        if "ESTAFETA" in fc:
            return CarrierDetectionResult(
                guia_limpia=guia,
                es_valida=True,
                carrier_principal="ESTAFETA",
                candidatos=["ESTAFETA"],
                es_ambiguo=False,
            )

    length = len(guia)
    is_digits = guia.isdigit()

    # 1. FedEx Door Tag (DT + 12 dígitos)
    if re.match(r"^DT\d{12}$", guia):
        return CarrierDetectionResult(
            guia_limpia=guia,
            es_valida=True,
            carrier_principal="FEDEX",
            candidatos=["FEDEX"],
            es_ambiguo=False,
        )

    # 2. FedEx estándar (12, 15, 20 o 34 dígitos numéricos)
    if is_digits and length in (12, 15, 20, 34):
        return CarrierDetectionResult(
            guia_limpia=guia,
            es_valida=True,
            carrier_principal="FEDEX",
            candidatos=["FEDEX"],
            es_ambiguo=False,
        )

    # 3. Guía de 22 caracteres
    if length == 22:
        if not is_digits:
            # 22 caracteres alfanuméricos con letras -> Estafeta (ej. guía con código de servicio)
            return CarrierDetectionResult(
                guia_limpia=guia,
                es_valida=True,
                carrier_principal="ESTAFETA",
                candidatos=["ESTAFETA"],
                es_ambiguo=False,
            )
        # 22 dígitos numéricos: si inicia con 92 o 96 puede ser FedEx SmartPost o Estafeta
        if guia.startswith(("92", "96")):
            return CarrierDetectionResult(
                guia_limpia=guia,
                es_valida=True,
                carrier_principal="FEDEX",
                candidatos=["FEDEX", "ESTAFETA"],
                es_ambiguo=True,
            )
        # 22 dígitos estándar en México -> Estafeta
        return CarrierDetectionResult(
            guia_limpia=guia,
            es_valida=True,
            carrier_principal="ESTAFETA",
            candidatos=["ESTAFETA"],
            es_ambiguo=False,
        )

    # 4. Guía de 10 dígitos numéricos (Ambiguo: muy común en Estafeta, pero posible en FedEx)
    if is_digits and length == 10:
        return CarrierDetectionResult(
            guia_limpia=guia,
            es_valida=True,
            carrier_principal="ESTAFETA",
            candidatos=["ESTAFETA", "FEDEX"],
            es_ambiguo=True,
        )

    # 5. Cualquier otro formato alfanumérico entre 8 y 34 caracteres -> Ambiguo, devuelve ambos candidatos
    return CarrierDetectionResult(
        guia_limpia=guia,
        es_valida=True,
        carrier_principal="FEDEX" if is_digits else "ESTAFETA",
        candidatos=["FEDEX", "ESTAFETA"] if is_digits else ["ESTAFETA", "FEDEX"],
        es_ambiguo=True,
    )
