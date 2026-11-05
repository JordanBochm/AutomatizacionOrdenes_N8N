import { NextRequest, NextResponse } from "next/server";
import { getReportesRepository } from "@/lib/reportes/repository";
import { EstatusDevolucion, ReportesFilters } from "@/lib/reportes/types";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "25", 10);
    const sort = (searchParams.get("sort") as ReportesFilters["sort"]) || undefined;
    const order = (searchParams.get("order") as "asc" | "desc") || "desc";
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
      page,
      pageSize,
      sort,
      order,
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
    const result = repo.list(filters);

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("Error en GET /api/reportes:", error);
    return NextResponse.json(
      { error: "Error al consultar reportes", details: message },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const repo = getReportesRepository();
    repo.clearAll();
    return NextResponse.json({
      success: true,
      message: "Sección de devoluciones limpiada correctamente. Sin registros de computadoras ni seriales.",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("Error en DELETE /api/reportes:", error);
    return NextResponse.json(
      { error: "Error al limpiar la sección de devoluciones", details: message },
      { status: 500 }
    );
  }
}
