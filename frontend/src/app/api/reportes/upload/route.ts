import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getReportesRepository } from "@/lib/reportes/repository";
import { applySerialDuplicateDetection, normalizeRawRow } from "@/lib/reportes/normalize";
import { CargaRecord, EstatusDevolucion } from "@/lib/reportes/types";


const REQUIRED_COLUMNS = [
  "No. devolución",
  "Serial Number",
  "Descripción",
  "Tracking #",
  "Number",
];

export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const isDryRun = searchParams.get("dryRun") === "true" || searchParams.get("confirm") !== "true";
    const userRole = request.headers.get("x-user-role") || "ADMIN";
    const userEmail = request.headers.get("x-user-email") || "operador@supplychain.mx";

    // Autorización básica por rol
    if (!["ADMIN", "ASSET_MANAGER", "OPERADOR"].includes(userRole.toUpperCase())) {
      return NextResponse.json(
        { error: "No autorizado. Solo roles autorizados pueden cargar archivos de devoluciones." },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No se proporcionó ningún archivo." }, { status: 400 });
    }

    const fileName = file.name || "devoluciones.xlsx";
    if (!fileName.toLowerCase().endsWith(".xlsx") && !fileName.toLowerCase().endsWith(".xls")) {
      return NextResponse.json(
        { error: "Formato no válido. Debe ser un archivo Excel (.xlsx o .xls)." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: "buffer" });
    } catch {
      return NextResponse.json(
        { error: "Error al abrir el archivo Excel. Asegúrese de que no esté cifrado ni dañado." },
        { status: 400 }
      );
    }

    // Seleccionar hoja priorizando 'Hoja1' y descartando hojas vacías
    let targetSheetName = workbook.SheetNames.find((s) => s.trim().toLowerCase() === "hoja1");
    if (!targetSheetName) {
      targetSheetName = workbook.SheetNames[0];
    }

    const sheet = workbook.Sheets[targetSheetName];
    if (!sheet) {
      return NextResponse.json(
        { error: `No se encontró la hoja '${targetSheetName}' en el archivo.` },
        { status: 400 }
      );
    }

    const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (rawRows.length === 0) {
      return NextResponse.json(
        { error: `La hoja '${targetSheetName}' está vacía.` },
        { status: 400 }
      );
    }

    // Validación de columnas requeridas (insensible a mayúsculas y espacios finales)
    const firstRowKeys = Object.keys(rawRows[0]).map((k) => k.trim().toLowerCase());
    const missingColumns = REQUIRED_COLUMNS.filter(
      (col) => !firstRowKeys.includes(col.toLowerCase()) &&
               !firstRowKeys.includes(col.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())
    );

    if (missingColumns.length > 0) {
      return NextResponse.json(
        {
          error: `Faltan columnas requeridas en el archivo: ${missingColumns.join(", ")}`,
          missingColumns,
        },
        { status: 422 }
      );
    }

    const cargaId = `CARGA_${Date.now()}`;
    const normalizedWithoutDups = rawRows.map((row, idx) =>
      normalizeRawRow(row, cargaId, idx + 1)
    );
    const normalizedRecords = applySerialDuplicateDetection(normalizedWithoutDups);

    // Métricas de calidad
    const resumenEstatus: Record<EstatusDevolucion, number> = {
      "En evaluación": 0,
      "Pendiente de baja": 0,
      "In Stock / Cerrado": 0,
      "Sin clasificar": 0,
    };

    const advertencias: { fila: number; serial: string; campo: string; motivo: string }[] = [];

    normalizedRecords.forEach((rec, idx) => {
      resumenEstatus[rec.estatus] = (resumenEstatus[rec.estatus] || 0) + 1;
      for (const adv of rec.calidadAdvertencias) {
        advertencias.push({
          fila: idx + 2, // Fila en Excel considerando encabezado
          serial: rec.serialNumber || "(vacío)",
          campo: adv.includes("RITM") ? "Number" : adv.includes("Serial") ? "Serial Number" : adv.includes("Tracking") ? "Tracking #" : "Substate",
          motivo: adv,
        });
      }
    });

    const repo = getReportesRepository();
    const existingRecords = repo.getAll();
    const existingIds = new Set(existingRecords.map((r) => r.id));

    let filasNuevas = 0;
    let filasActualizadas = 0;

    normalizedRecords.forEach((r) => {
      if (existingIds.has(r.id)) {
        filasActualizadas++;
      } else {
        filasNuevas++;
      }
    });

    // Si es modo preview / dry-run, respondemos sin persistir
    if (isDryRun) {
      return NextResponse.json({
        dryRun: true,
        archivo: fileName,
        totalFilasLeidas: rawRows.length,
        filasNuevas,
        filasActualizadas,
        filasRechazadas: 0,
        resumenEstatus,
        totalAdvertencias: advertencias.length,
        advertenciasMuestra: advertencias.slice(0, 30),
        muestras: normalizedRecords.slice(0, 10),
      });
    }

    // Persistir efectivamente
    const cargaRecord: CargaRecord = {
      id: cargaId,
      archivo: fileName,
      fecha: new Date().toISOString(),
      usuario: userEmail,
      filasLeidas: rawRows.length,
      filasInsertadas: filasNuevas,
      filasActualizadas,
      filasRechazadas: 0,
      advertenciasCalidad: {
        serialesVacios: normalizedRecords.filter((r) => !r.serialNumber).length,
        serialesDuplicados: normalizedRecords.filter((r) => r.serialDuplicado).length,
        ritmInvalidos: normalizedRecords.filter((r) => !r.ritmValido).length,
        sinTracking: normalizedRecords.filter((r) => r.sinTracking).length,
        sinClasificar: resumenEstatus["Sin clasificar"],
      },
    };

    const resUpsert = repo.upsertBatch(normalizedRecords, cargaRecord);

    return NextResponse.json({
      success: true,
      dryRun: false,
      cargaId,
      archivo: fileName,
      totalFilasLeidas: rawRows.length,
      filasInsertadas: resUpsert.insertadas,
      filasActualizadas: resUpsert.actualizadas,
      resumenEstatus,
      totalAdvertencias: advertencias.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("Error en POST /api/reportes/upload:", error);
    return NextResponse.json(
      { error: "Error al procesar el archivo Excel", details: message },
      { status: 500 }
    );
  }
}
