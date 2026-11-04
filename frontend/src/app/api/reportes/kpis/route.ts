import { NextRequest, NextResponse } from "next/server";
import { getReportesRepository } from "@/lib/reportes/repository";
import { EstatusDevolucion, ReportesFilters } from "@/lib/reportes/types";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const q = searchParams.get("q") || undefined;
    const estatus = (searchParams.get("estatus") as EstatusDevolucion | "TODOS") || undefined;
    const modelo = searchParams.get("modelo") || undefined;
    const desde = searchParams.get("desde") || undefined;
    const hasta = searchParams.get("hasta") || undefined;
    const soloDuplicados = searchParams.get("soloDuplicados") === "true";
    const soloSinRitm = searchParams.get("soloSinRitm") === "true";
    const soloSinTracking = searchParams.get("soloSinTracking") === "true";
    const soloConGarantia = searchParams.get("soloConGarantia") === "true";
    const soloGarantiaExpirada = searchParams.get("soloGarantiaExpirada") === "true";

    const filters: ReportesFilters = {
      q,
      estatus,
      modelo,
      desde,
      hasta,
      soloDuplicados,
      soloSinRitm,
      soloSinTracking,
      soloConGarantia,
      soloGarantiaExpirada,
    };

    const repo = getReportesRepository();
    const kpis = repo.getKpis(filters);

    return NextResponse.json(kpis);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("Error en GET /api/reportes/kpis:", error);
    return NextResponse.json(
      { error: "Error al calcular KPIs", details: message },
      { status: 500 }
    );
  }
}
