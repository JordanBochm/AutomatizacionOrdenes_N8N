import { NextRequest, NextResponse } from "next/server";
import { getReportesRepository } from "@/lib/reportes/repository";
import { generateReportesExcelBuffer } from "@/lib/reportes/export";
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
    const sort = (searchParams.get("sort") as ReportesFilters["sort"]) || undefined;
    const order = (searchParams.get("order") as "asc" | "desc") || "desc";

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
      sort,
      order,
      page: 1,
      pageSize: 999999, // Exportar todo el conjunto filtrado
    };

    const repo = getReportesRepository();
    const { items } = repo.list(filters);
    const kpis = repo.getKpis(filters);

    const buffer = generateReportesExcelBuffer(items, kpis, filters);

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `Reporte_Devoluciones_${dateStr}.xlsx`;

    const uint8 = new Uint8Array(buffer);
    return new NextResponse(uint8, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("Error en GET /api/reportes/export:", error);
    return NextResponse.json(
      { error: "Error al exportar archivo Excel", details: message },
      { status: 500 }
    );
  }
}
