import { NextRequest, NextResponse } from "next/server";
import {
  lookupWarranty,
  batchLookupWarranties,
  getAllCachedWarranties,
} from "@/lib/reportes/warranty-service";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const serial = searchParams.get("serial");
    const modelo = searchParams.get("modelo") || undefined;
    const force = searchParams.get("force") === "true";

    if (!serial) {
      // Si no se pasa serial, retornar todo el caché disponible
      const allCached = getAllCachedWarranties();
      return NextResponse.json({ cachedCount: Object.keys(allCached).length, warranties: allCached });
    }

    const garantia = await lookupWarranty(serial, modelo, force);
    return NextResponse.json(garantia);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: "Fallo al consultar garantía", details: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const items = body.items || [];

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Se requiere un array de items { serial, modelo }" }, { status: 400 });
    }

    // Limitar tamaño de lote por llamada para control de concurrencia
    const maxBatch = items.slice(0, 50);
    const results = await batchLookupWarranties(maxBatch, 3);

    return NextResponse.json({
      success: true,
      processed: maxBatch.length,
      warranties: results,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: "Fallo en consulta por lote", details: msg }, { status: 500 });
  }
}
