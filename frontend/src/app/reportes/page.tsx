import React, { Suspense } from "react";
import { getReportesRepository } from "@/lib/reportes/repository";
import ReportesView from "@/components/reportes/ReportesView";
import { RefreshCw } from "lucide-react";


export default async function ReportesPage() {
  const repo = getReportesRepository();
  const initialKpis = repo.getKpis();
  const initialResult = repo.list({ page: 1, pageSize: 25, sort: "fechaIngresoSistema", order: "desc" });

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-[#233762]" />
          <p className="text-sm font-semibold text-slate-600">Cargando Módulo de Reportes...</p>
        </div>
      }
    >
      <ReportesView
        initialKpis={initialKpis}
        initialItems={initialResult.items}
        initialTotal={initialResult.total}
        initialPage={initialResult.page}
        initialPageSize={initialResult.pageSize}
      />
    </Suspense>
  );
}
