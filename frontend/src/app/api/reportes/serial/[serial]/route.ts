import { NextRequest, NextResponse } from "next/server";
import { getReportesRepository } from "@/lib/reportes/repository";


export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ serial: string }> }
) {
  try {
    const { serial } = await context.params;
    const cleanSerial = decodeURIComponent(serial || "").trim();

    if (!cleanSerial) {
      return NextResponse.json({ error: "Serial no especificado" }, { status: 400 });
    }

    const repo = getReportesRepository();
    const history = repo.getBySerial(cleanSerial);

    return NextResponse.json({
      serial: cleanSerial,
      totalOcurrencias: history.length,
      esDuplicado: history.length > 1,
      historial: history,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("Error en GET /api/reportes/serial/[serial]:", error);
    return NextResponse.json(
      { error: "Error al consultar historial del serial", details: message },
      { status: 500 }
    );
  }
}
