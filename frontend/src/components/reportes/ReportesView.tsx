"use client";

import React, { useState, useEffect, useTransition, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import ClientSwitcherPill from "@/components/layout/ClientSwitcherPill";
import ClientRequiredEmptyState from "@/components/layout/ClientRequiredEmptyState";
import {
  ActiveClientFilter,
  ASSET_CLIENTS_MAP,
  isSpecificAssetClient,
  loadActiveClientFromStorage,
  saveActiveClientToStorage,
} from "@/lib/assetClients";
import {
  FileSpreadsheet,
  Search,
  Download,
  Upload,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  X,
  Layers,
  ArrowUpDown,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  Wrench,
  Truck,
  Trash2,
} from "lucide-react";
import {
  DevolucionRecord,
  EstatusDevolucion,
  GarantiaInfo,
  ReportesFilters,
  ReportesKPIs,
  UploadPreviewResult,
  ReportesSubmodulo,
} from "@/lib/reportes/types";
import ReparacionView from "./submodulos/ReparacionView";
import OutboundView from "./submodulos/OutboundView";
import RefurbView from "./submodulos/RefurbView";
import { STATUS_CONFIG } from "@/lib/reportes/status-map";
import AnimatedLogo from "@/components/layout/AnimatedLogo";

interface ReportesViewProps {
  initialKpis: ReportesKPIs;
  initialItems: DevolucionRecord[];
  initialTotal: number;
  initialPage: number;
  initialPageSize: number;
}

export default function ReportesView({
  initialKpis,
  initialItems,
  initialTotal,
  initialPage,
  initialPageSize,
}: ReportesViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Estados de datos
  const [items, setItems] = useState<DevolucionRecord[]>(initialItems);
  const [kpis, setKpis] = useState<ReportesKPIs>(initialKpis);
  const [total, setTotal] = useState<number>(initialTotal);
  const [loading, setLoading] = useState<boolean>(false);

  // Submódulo Activo (devoluciones | reparacion | outbound | refurb)
  const [activeSubmodulo, setActiveSubmodulo] = useState<ReportesSubmodulo | null>(
    (searchParams.get("submodulo") as ReportesSubmodulo) || null
  );
  const [activeClient, setActiveClient] = useState<ActiveClientFilter>("ALL");

  useEffect(() => {
    setActiveClient(loadActiveClientFromStorage());
    const handleStorage = (e: CustomEvent<ActiveClientFilter>) => {
      const next = e.detail;
      if (next === "ALL" || (next && next in ASSET_CLIENTS_MAP)) {
        setActiveClient(next);
      }
    };
    window.addEventListener("sc-asset-client-changed" as any, handleStorage as any);
    return () => {
      window.removeEventListener("sc-asset-client-changed" as any, handleStorage as any);
    };
  }, []);

  const handleClientChange = (nextClient: ActiveClientFilter) => {
    setActiveClient(nextClient);
    saveActiveClientToStorage(nextClient);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sc-asset-client-changed", { detail: nextClient }));
    }
  };

  const activeClientLabel = isSpecificAssetClient(activeClient)
    ? ASSET_CLIENTS_MAP[activeClient].name
    : "Todos los clientes";

  const handleSubmoduloChange = (sub: ReportesSubmodulo | null) => {
    setActiveSubmodulo(sub);
    updateUrlParams({ submodulo: sub || undefined });
  };

  // Estados de filtros
  const [page, setPage] = useState<number>(
    parseInt(searchParams.get("page") || String(initialPage), 10)
  );
  const [pageSize, setPageSize] = useState<number>(
    parseInt(searchParams.get("pageSize") || String(initialPageSize), 10)
  );
  const [searchInput, setSearchInput] = useState<string>(searchParams.get("q") || "");
  const [estatusFilter, setEstatusFilter] = useState<EstatusDevolucion | "TODOS">(
    (searchParams.get("estatus") as EstatusDevolucion | "TODOS") || "TODOS"
  );
  const [soloDuplicados, setSoloDuplicados] = useState<boolean>(
    searchParams.get("soloDuplicados") === "true"
  );
  const [soloSinRitm, setSoloSinRitm] = useState<boolean>(
    searchParams.get("soloSinRitm") === "true"
  );
  const [soloSinTracking, setSoloSinTracking] = useState<boolean>(
    searchParams.get("soloSinTracking") === "true"
  );
  const [soloConGarantia, setSoloConGarantia] = useState<boolean>(
    searchParams.get("soloConGarantia") === "true"
  );
  const [checkingWarrantySerial, setCheckingWarrantySerial] = useState<string | null>(null);
  const [isCheckingBatch, setIsCheckingBatch] = useState<boolean>(false);
  const [selectedSerialWarranty, setSelectedSerialWarranty] = useState<GarantiaInfo | null>(null);
  const [sortField, setSortField] = useState<NonNullable<ReportesFilters["sort"]>>(
    (searchParams.get("sort") as NonNullable<ReportesFilters["sort"]>) || "fechaIngresoSistema"
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(
    (searchParams.get("order") as "asc" | "desc") || "desc"
  );

  // Modal de Historial de Serial
  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);
  const [serialHistory, setSerialHistory] = useState<DevolucionRecord[]>([]);
  const [loadingSerialHistory, setLoadingSerialHistory] = useState<boolean>(false);

  // Modal para Limpiar Información
  const [showClearModal, setShowClearModal] = useState<boolean>(false);
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [logoError, setLogoError] = useState<boolean>(false);

  // Modal de Carga / Upload
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<UploadPreviewResult | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Notificaciones Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Sincronizar URL searchParams
  const updateUrlParams = useCallback(
    (newParams: Record<string, string | number | boolean | undefined>) => {
      const params = new URLSearchParams(window.location.search);
      Object.entries(newParams).forEach(([k, v]) => {
        if (v === undefined || v === "" || v === false || v === "TODOS") {
          params.delete(k);
        } else {
          params.set(k, String(v));
        }
      });
      const query = params.toString();
      const url = query ? `/reportes?${query}` : `/reportes`;
      startTransition(() => {
        router.replace(url);
      });
    },
    [router]
  );

  // Consultar datos de backend
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchInput) params.set("q", searchInput);
      if (estatusFilter !== "TODOS") params.set("estatus", estatusFilter);
      if (soloDuplicados) params.set("soloDuplicados", "true");
      if (soloSinRitm) params.set("soloSinRitm", "true");
      if (soloSinTracking) params.set("soloSinTracking", "true");
      if (soloConGarantia) params.set("soloConGarantia", "true");
      params.set("sort", sortField);
      params.set("order", sortOrder);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const [resItems, resKpis] = await Promise.all([
        fetch(`/api/reportes?${params.toString()}`),
        fetch(`/api/reportes/kpis?${params.toString()}`),
      ]);

      if (resItems.ok) {
        const data = await resItems.json();
        setItems(data.items || []);
        setTotal(data.total || 0);
      }
      if (resKpis.ok) {
        const kpisData = await resKpis.json();
        setKpis(kpisData);
      }
    } catch {
      showToast("Error al refrescar datos del servidor", "error");
    } finally {
      setLoading(false);
    }
  }, [searchInput, estatusFilter, soloDuplicados, soloSinRitm, soloSinTracking, soloConGarantia, sortField, sortOrder, page, pageSize, showToast]);

  // Debounce para búsqueda universal (300 ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      updateUrlParams({ q: searchInput, page: 1 });
      fetchData();
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput, updateUrlParams, fetchData]);

  // Reaccionar a cambios de filtros
  const handleEstatusChange = (val: EstatusDevolucion | "TODOS") => {
    setEstatusFilter(val);
    setPage(1);
    updateUrlParams({ estatus: val, page: 1 });
  };

  const handleDuplicadosToggle = () => {
    const nextVal = !soloDuplicados;
    setSoloDuplicados(nextVal);
    setPage(1);
    updateUrlParams({ soloDuplicados: nextVal, page: 1 });
  };

  const handleSinRitmToggle = () => {
    const nextVal = !soloSinRitm;
    setSoloSinRitm(nextVal);
    setPage(1);
    updateUrlParams({ soloSinRitm: nextVal, page: 1 });
  };

  const handleSinTrackingToggle = () => {
    const nextVal = !soloSinTracking;
    setSoloSinTracking(nextVal);
    setPage(1);
    updateUrlParams({ soloSinTracking: nextVal, page: 1 });
  };

  const handleSoloConGarantiaToggle = () => {
    const nextVal = !soloConGarantia;
    setSoloConGarantia(nextVal);
    setPage(1);
    updateUrlParams({ soloConGarantia: nextVal, page: 1 });
  };

  const handleCheckSingleWarranty = async (serial: string, modelo?: string) => {
    if (!serial) return;
    setCheckingWarrantySerial(serial);
    try {
      const res = await fetch(
        `/api/reportes/warranty?serial=${encodeURIComponent(serial)}&modelo=${encodeURIComponent(
          modelo || ""
        )}&force=true`
      );
      if (res.ok) {
        const data: GarantiaInfo = await res.json();
        setItems((prev) =>
          prev.map((it) => (it.serialNumber === serial ? { ...it, garantia: data } : it))
        );
        if (selectedSerial === serial) {
          setSelectedSerialWarranty(data);
        }
        if (data.vigente) {
          showToast(`Garantía Vigente hasta ${data.fechaFin || "activa"} (${data.proveedor})`, "success");
        } else if (data.estado === "EXPIRADA") {
          showToast(`Garantía Expirada (${data.fechaFin || "vencida"})`, "info");
        } else {
          showToast(data.error || "Garantía consultada", "info");
        }
      } else {
        showToast("No se pudo obtener información de garantía", "error");
      }
    } catch {
      showToast("Error de conexión al consultar garantía", "error");
    } finally {
      setCheckingWarrantySerial(null);
    }
  };

  const handleBatchWarrantyCheck = async () => {
    const serialsToCheck = items
      .filter((it) => it.serialNumber && (!it.garantia || it.garantia.estado === "DESCONOCIDO"))
      .map((it) => ({ serial: it.serialNumber, modelo: it.modelo }));

    if (serialsToCheck.length === 0) {
      showToast("Los registros mostrados ya cuentan con estatus de garantía", "info");
      return;
    }

    setIsCheckingBatch(true);
    showToast(`Iniciando verificación de ${serialsToCheck.length} garantías en Lenovo/Dell...`, "info");

    try {
      const res = await fetch("/api/reportes/warranty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: serialsToCheck }),
      });

      if (res.ok) {
        const data = await res.json();
        const warranties = data.warranties || {};
        setItems((prev) =>
          prev.map((it) => {
            const clean = it.serialNumber?.toUpperCase();
            return clean && warranties[clean] ? { ...it, garantia: warranties[clean] } : it;
          })
        );
        showToast("Verificación de garantías completada con éxito", "success");
        fetchData();
      } else {
        showToast("Fallo al procesar lote de garantías", "error");
      }
    } catch {
      showToast("Error en la conexión con el servidor de garantías", "error");
    } finally {
      setIsCheckingBatch(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    updateUrlParams({ page: newPage });
  };

  const handleSort = (field: NonNullable<ReportesFilters["sort"]>) => {
    let newOrder: "asc" | "desc" = "asc";
    if (sortField === field && sortOrder === "asc") {
      newOrder = "desc";
    }
    setSortField(field);
    setSortOrder(newOrder);
    updateUrlParams({ sort: field, order: newOrder });
  };

  // Cargar historial de un serial y su garantía
  const handleOpenSerialHistory = async (serial: string, modelo?: string) => {
    if (!serial) return;
    setSelectedSerial(serial);
    setLoadingSerialHistory(true);
    setSelectedSerialWarranty(null);
    try {
      const [resHist, resWarr] = await Promise.all([
        fetch(`/api/reportes/serial/${encodeURIComponent(serial)}`),
        fetch(`/api/reportes/warranty?serial=${encodeURIComponent(serial)}&modelo=${encodeURIComponent(modelo || "")}`),
      ]);
      if (resHist.ok) {
        const data = await resHist.json();
        setSerialHistory(data.historial || []);
      }
      if (resWarr.ok) {
        const wData = await resWarr.json();
        setSelectedSerialWarranty(wData);
      }
    } catch {
      showToast("Error al cargar historial del serial", "error");
    } finally {
      setLoadingSerialHistory(false);
    }
  };

  // Exportar Excel Filtrado completo
  const handleExportFiltered = () => {
    const params = new URLSearchParams();
    if (searchInput) params.set("q", searchInput);
    if (estatusFilter !== "TODOS") params.set("estatus", estatusFilter);
    if (soloDuplicados) params.set("soloDuplicados", "true");
    if (soloSinRitm) params.set("soloSinRitm", "true");
    if (soloSinTracking) params.set("soloSinTracking", "true");
    params.set("sort", sortField);
    params.set("order", sortOrder);

    const a = document.createElement("a");
    a.href = `/api/reportes/export?${params.toString()}`;
    a.download = "Reporte_Devoluciones.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast("Generando descarga del conjunto filtrado completo...", "info");
  };

  // Carga de archivo Excel (Previsualización / Dry-Run)
  // Limpiar toda la información del módulo de devoluciones
  const handleClearDevoluciones = async () => {
    try {
      setIsClearing(true);
      const res = await fetch("/api/reportes", { method: "DELETE" });
      if (res.ok) {
        setItems([]);
        setTotal(0);
        setKpis({
          totalDevueltos: 0,
          enEvaluacion: 0,
          pendientesBaja: 0,
          inStockCerrado: 0,
          sinClasificar: 0,
          conciliadosSnowCount: 0,
          porcentajeConciliadosSnow: 0,
          totalSerialesDuplicados: 0,
          totalSinRitm: 0,
          totalSinTracking: 0,
          totalConGarantia: 0,
          totalGarantiaExpirada: 0,
          totalSinGarantiaInfo: 0,
        });
        showToast("Módulo de devoluciones limpiado exitosamente.", "success");
      } else {
        showToast("Error al limpiar el módulo de devoluciones.", "error");
      }
    } catch {
      showToast("Error de conexión al limpiar módulo.", "error");
    } finally {
      setIsClearing(false);
      setShowClearModal(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadError(null);
    setUploadSuccess(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Paso 1: Dry-Run / Preview
      const res = await fetch("/api/reportes/upload?dryRun=true", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Error al validar archivo");
      }

      setUploadPreview(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido al previsualizar";
      setUploadError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  // Confirmación de Carga
  const handleConfirmUpload = async () => {
    if (!uploadFile) return;
    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);

      const res = await fetch("/api/reportes/upload?confirm=true", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Error al guardar carga");
      }

      setUploadSuccess(
        `Carga confirmada: ${data.filasInsertadas} filas nuevas, ${data.filasActualizadas} actualizadas.`
      );
      showToast("Archivo cargado e indexado con éxito", "success");
      fetchData();
      setTimeout(() => {
        setShowUploadModal(false);
        setUploadFile(null);
        setUploadPreview(null);
        setUploadSuccess(null);
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al confirmar la carga";
      setUploadError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans relative overflow-x-hidden selection:bg-[#233762] selection:text-white">
      {/* Franja Superior Bicolor Institucional (3px) */}
      <div className="h-[3px] w-full flex relative z-50">
        <div className="w-1/2 bg-[#233762]" />
        <div className="w-1/2 bg-[#CE3A39]" />
      </div>

      {/* Encabezado unificado para el módulo de Reportes y sus submódulos */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur-md sticky top-0 z-40">
        <div className="w-full max-w-[1540px] mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            {activeSubmodulo !== null ? (
              <button
                type="button"
                onClick={() => handleSubmoduloChange(null)}
                className="w-9 h-9 rounded-full flex items-center justify-center border border-slate-200 bg-white hover:bg-[#EFF3F9] text-[#233762] transition group cursor-pointer"
                title="Regresar a Módulos de Reportes"
                aria-label="Regresar a Módulos de Reportes"
              >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
              </button>
            ) : (
              <Link
                href="/"
                className="w-9 h-9 rounded-full flex items-center justify-center border border-slate-200 bg-white hover:bg-[#EFF3F9] text-[#233762] transition group cursor-pointer"
                title="Regresar a Asset Management"
                aria-label="Regresar a Asset Management"
              >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
              </Link>
            )}

            <div className="h-7 w-px bg-slate-200 hidden sm:block" />

            <Link
              href="/"
              className="flex items-center group cursor-pointer focus:outline-none transition-transform hover:scale-[1.03]"
              title="Regresar al Hub Principal"
            >
              <AnimatedLogo className="h-9 sm:h-10 w-auto" iconOnly staticOnly />
            </Link>
          </div>

          <div className="hidden sm:flex items-center">
            <AnimatedLogo className="h-8 sm:h-9 w-auto" textOnly staticOnly />
          </div>
        </div>
      </header>

      <div className="flex-1 w-full max-w-[1540px] mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 py-5 flex flex-col">
      {/* Toast Flotante */}
      {toast && (
        <div
          className={`fixed bottom-6 right-8 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border backdrop-blur-md text-xs font-semibold transition-all ${
            toast.type === "success"
              ? "bg-emerald-50 border-emerald-300 text-emerald-800"
              : toast.type === "error"
              ? "bg-red-50 border-red-300 text-red-800"
              : "bg-blue-50 border-blue-300 text-blue-900"
          }`}
        >
          {toast.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
          {toast.type === "error" && <AlertTriangle className="w-4 h-4 text-[#CE3A39] shrink-0" />}
          {toast.type === "info" && <Clock className="w-4 h-4 text-[#233762] shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Submódulos de Reportes: Vista HUB Inicial (cuando no hay submódulo seleccionado) */}
      {activeSubmodulo === null && (
        <div className="w-full flex-1 flex flex-col items-center">
          {/* Header Centralizado con Badge y Título */}
          <div className="text-center mt-2 mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EFF3F9] text-[#233762] text-xs font-semibold mb-2">
              <span>Asset Management</span>
              <span className="text-slate-400">/</span>
              <span>{activeClientLabel}</span>
              <span className="text-slate-400">/</span>
              <span className="text-[#CE3A39] font-bold">Reportes</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#233762] tracking-tight">
              {activeClient === "ALL"
                ? "Módulos de Reportes y Trazabilidad"
                : `Módulos de Reportes y Trazabilidad — ${activeClientLabel}`}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Selecciona un submódulo operativo para consultar reportes, métricas en tiempo real, conciliación de garantías y estatus de equipos.
            </p>
          </div>

          {activeClient === "ALL" ? (
            <ClientRequiredEmptyState
              mode="select_client"
              moduleName="Reportes"
              onSelectClient={(c) => handleClientChange(c)}
            />
          ) : (
            /* Grid de Módulos Estandarizado (3 por fila: max-w-5xl, tarjetas w-[300px] h-[275px]) */
            <div className="flex flex-wrap justify-center gap-6 w-full max-w-5xl mx-auto">
              {/* Módulo 1: Devoluciones */}
              <div
                onClick={() => handleSubmoduloChange("devoluciones")}
                className="bg-white rounded-xl border border-slate-200/80 shadow-md hover:shadow-xl transition-all duration-300 p-6 w-[300px] h-[275px] min-h-[275px] flex flex-col items-center justify-between text-center cursor-pointer group relative overflow-hidden hover:-translate-y-1"
              >
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#233762] group-hover:bg-[#CE3A39] transition-colors duration-300" />
                <span className="absolute top-3.5 right-3.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#EFF3F9] text-[#233762] border border-[#233762]/20">
                  {total.toLocaleString()} Equipos
                </span>
                <div className="flex flex-col items-center w-full mt-2">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-all duration-300 shadow-2xs bg-[#EFF3F9] text-[#233762]">
                    <FileSpreadsheet className="w-7 h-7" />
                  </div>
                  <h3 className="text-lg font-bold text-[#233762] group-hover:text-[#CE3A39] transition-colors mt-4">
                    Devoluciones
                  </h3>
                  <p className="text-xs text-slate-500 mt-2 line-clamp-3 leading-relaxed px-1">
                    Conciliación semanal Kyndryl / Seko, estatus ServiceNow, garantías Lenovo / Dell y trazabilidad de retornos.
                  </p>
                </div>
                <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#233762] group-hover:text-[#CE3A39] transition-colors">
                  <span>Ingresar al módulo</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </span>
              </div>

              {/* Módulo 2: Equipos en Reparación */}
              <div
                onClick={() => handleSubmoduloChange("reparacion")}
                className="bg-white rounded-xl border border-slate-200/80 shadow-md hover:shadow-xl transition-all duration-300 p-6 w-[300px] h-[275px] min-h-[275px] flex flex-col items-center justify-between text-center cursor-pointer group relative overflow-hidden hover:-translate-y-1"
              >
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#233762] group-hover:bg-[#CE3A39] transition-colors duration-300" />
                <span className="absolute top-3.5 right-3.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#FDF2F2] text-[#CE3A39] border border-[#CE3A39]/20">
                  0 en Taller
                </span>
                <div className="flex flex-col items-center w-full mt-2">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-all duration-300 shadow-2xs bg-[#FDF2F2] text-[#CE3A39]">
                    <Wrench className="w-7 h-7" />
                  </div>
                  <h3 className="text-lg font-bold text-[#233762] group-hover:text-[#CE3A39] transition-colors mt-4">
                    Equipos en Reparación
                  </h3>
                  <p className="text-xs text-slate-500 mt-2 line-clamp-3 leading-relaxed px-1">
                    Monitoreo de diagnósticos técnicos, piezas solicitadas, garantías RMA Lenovo/Dell y dictámenes.
                  </p>
                </div>
                <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#233762] group-hover:text-[#CE3A39] transition-colors">
                  <span>Ingresar al módulo</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </span>
              </div>

              {/* Módulo 3: Outbound */}
              <div
                onClick={() => handleSubmoduloChange("outbound")}
                className="bg-white rounded-xl border border-slate-200/80 shadow-md hover:shadow-xl transition-all duration-300 p-6 w-[300px] h-[275px] min-h-[275px] flex flex-col items-center justify-between text-center cursor-pointer group relative overflow-hidden hover:-translate-y-1"
              >
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#233762] group-hover:bg-[#CE3A39] transition-colors duration-300" />
                <span className="absolute top-3.5 right-3.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#EFF3F9] text-[#233762] border border-[#233762]/20">
                  0 Despachos
                </span>
                <div className="flex flex-col items-center w-full mt-2">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-all duration-300 shadow-2xs bg-[#EFF3F9] text-[#233762]">
                    <Truck className="w-7 h-7" />
                  </div>
                  <h3 className="text-lg font-bold text-[#233762] group-hover:text-[#CE3A39] transition-colors mt-4">
                    Outbound
                  </h3>
                  <p className="text-xs text-slate-500 mt-2 line-clamp-3 leading-relaxed px-1">
                    Trazabilidad de equipos asignados a usuarios, empaque, carriers, números de guía y confirmación de entrega.
                  </p>
                </div>
                <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#233762] group-hover:text-[#CE3A39] transition-colors">
                  <span>Ingresar al módulo</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </span>
              </div>

              {/* Módulo 4: Refurb */}
              <div
                onClick={() => handleSubmoduloChange("refurb")}
                className="bg-white rounded-xl border border-slate-200/80 shadow-md hover:shadow-xl transition-all duration-300 p-6 w-[300px] h-[275px] min-h-[275px] flex flex-col items-center justify-between text-center cursor-pointer group relative overflow-hidden hover:-translate-y-1"
              >
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#233762] group-hover:bg-[#CE3A39] transition-colors duration-300" />
                <span className="absolute top-3.5 right-3.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#FDF2F2] text-[#CE3A39] border border-[#CE3A39]/20">
                  0 en Refurb
                </span>
                <div className="flex flex-col items-center w-full mt-2">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-all duration-300 shadow-2xs bg-[#FDF2F2] text-[#CE3A39]">
                    <RefreshCw className="w-7 h-7" />
                  </div>
                  <h3 className="text-lg font-bold text-[#233762] group-hover:text-[#CE3A39] transition-colors mt-4">
                    Refurb
                  </h3>
                  <p className="text-xs text-slate-500 mt-2 line-clamp-3 leading-relaxed px-1">
                    Borrado seguro de datos (NIST 800-88 / Blancco), reinstalación de imagen, auditoría cosmética y reingreso a almacén.
                  </p>
                </div>
                <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#233762] group-hover:text-[#CE3A39] transition-colors">
                  <span>Ingresar al módulo</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </span>
              </div>
            </div>
            )}
        </div>
      )}

      {/* Si hay un submódulo seleccionado pero se cambia el filtro a "ALL", pedir selección de cliente */}
      {activeSubmodulo !== null && activeClient === "ALL" && (
        <div className="w-full flex-1 flex flex-col">
          <ClientRequiredEmptyState
            mode="select_client"
            moduleName="Reportes"
            onSelectClient={(c) => handleClientChange(c)}
          />
        </div>
      )}

      {/* Submódulo 2: Equipos en Reparación (Vista Individual) */}
      {activeSubmodulo === "reparacion" && activeClient !== "ALL" && (
        <div className="flex-1 flex flex-col">
          <ReparacionView />
        </div>
      )}

      {/* Submódulo 3: Outbound (Vista Individual) */}
      {activeSubmodulo === "outbound" && activeClient !== "ALL" && (
        <div className="flex-1 flex flex-col">
          <OutboundView />
        </div>
      )}

      {/* Submódulo 4: Refurb (Vista Individual) */}
      {activeSubmodulo === "refurb" && activeClient !== "ALL" && (
        <div className="flex-1 flex flex-col">
          <RefurbView />
        </div>
      )}

      {/* Submódulo 1: Devoluciones de Equipos (Vista Individual) */}
      {activeSubmodulo === "devoluciones" && activeClient !== "ALL" && (
        <>

          {/* Cabecera Operativa Estandarizada de Devoluciones */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 mb-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="p-2 bg-[#EFF3F9] text-[#233762] rounded-lg shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#233762] tracking-tight">
                  Reportes de Devoluciones de Equipos
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Conciliación semanal Kyndryl / Seko, estatus ServiceNow, garantías y trazabilidad de retornos.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleBatchWarrantyCheck}
                disabled={isCheckingBatch}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-[#EFF3F9] border border-slate-200 hover:border-[#233762]/40 text-[#233762] text-xs font-bold disabled:opacity-40 transition cursor-pointer"
                title="Consultar en los servidores de Lenovo y Dell las garantías de los equipos mostrados"
              >
                {isCheckingBatch ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#233762]" />
                    <span>Consultando Garantías...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5 text-[#233762]" />
                    <span>Verificar Garantías del Lote</span>
                  </>
                )}
              </button>
              <button
                onClick={() => setShowUploadModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#233762] text-white text-xs font-bold shadow-xs hover:bg-[#1b2b4d] transition cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Actualizar / Cargar Excel
              </button>
              <button
                onClick={handleExportFiltered}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold hover:bg-[#EFF3F9] hover:border-[#233762]/30 hover:text-[#233762] transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                Descargar Excel Filtrado
              </button>
              <button
                onClick={() => setShowClearModal(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-red-50 hover:border-red-200 hover:text-[#CE3A39] transition cursor-pointer"
                title="Limpiar toda la información de computadoras y números de serie"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpiar Información</span>
              </button>
            </div>
          </div>

          {/* Tarjetas de KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-4">
        {/* Total Devueltos */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Devueltos</span>
            <span className="w-2 h-2 rounded-full bg-[#233762]" />
          </div>
          <div className="text-3xl font-bold font-mono text-[#233762] mt-2">
            {kpis.totalDevueltos.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">Lote activo</div>
        </div>

        {/* En evaluación */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">En Evaluación</span>
            <span className="w-2 h-2 rounded-full bg-amber-500" />
          </div>
          <div className="text-3xl font-bold font-mono text-[#233762] mt-2">
            {kpis.enEvaluacion.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">Revisión técnica</div>
        </div>

        {/* Pendientes de baja */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Pendiente de Baja</span>
            <span className="w-2 h-2 rounded-full bg-[#CE3A39]" />
          </div>
          <div className="text-3xl font-bold font-mono text-[#233762] mt-2">
            {kpis.pendientesBaja.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">Destino Scrap</div>
        </div>

        {/* In Stock / Cerrado */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">In Stock / Cerrado</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <div className="text-3xl font-bold font-mono text-[#233762] mt-2">
            {kpis.inStockCerrado.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">Ingresado al almacén</div>
        </div>

        {/* % Conciliados SNOW */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Conciliados SNOW</span>
            <span className="w-2 h-2 rounded-full bg-[#233762]" />
          </div>
          <div className="text-3xl font-bold font-mono text-[#233762] mt-2">
            {kpis.porcentajeConciliadosSnow}%
          </div>
          <div className="text-xs text-slate-400 mt-1">{kpis.conciliadosSnowCount} registrados</div>
        </div>

        {/* Sin Clasificar */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Sin Clasificar</span>
            <span className="w-2 h-2 rounded-full bg-slate-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-[#233762] mt-2">
            {kpis.sinClasificar.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">Fechas o vacíos</div>
        </div>
      </section>

      {/* Barra de Filtros y Búsqueda */}
      <section className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm mb-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Input de Búsqueda Universal */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por Serial, RITM, Tracking, No. devolución o Modelo..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#233762] focus:border-transparent"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Selector de Estatus */}
          <div className="flex flex-wrap items-center gap-2">
            {(["TODOS", "En evaluación", "Pendiente de baja", "In Stock / Cerrado", "Sin clasificar"] as const).map(
              (st) => {
                const isSelected = estatusFilter === st;
                return (
                  <button
                    key={st}
                    onClick={() => handleEstatusChange(st)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-all ${
                      isSelected
                        ? "bg-[#233762] text-white border-[#233762]"
                        : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {st}
                  </button>
                );
              }
            )}
          </div>
        </div>

        {/* Filtros Especiales y Contadores */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleDuplicadosToggle}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-semibold transition-all cursor-pointer ${
                soloDuplicados
                  ? "bg-[#233762] text-white border-[#233762]"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${soloDuplicados ? "bg-white" : "bg-amber-500"}`} />
              Solo Seriales Duplicados ({kpis.totalSerialesDuplicados})
            </button>

            <button
              onClick={handleSinRitmToggle}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-semibold transition-all cursor-pointer ${
                soloSinRitm
                  ? "bg-[#233762] text-white border-[#233762]"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${soloSinRitm ? "bg-white" : "bg-amber-500"}`} />
              RITM Inválido / Vacío ({kpis.totalSinRitm})
            </button>

            <button
              onClick={handleSinTrackingToggle}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-semibold transition-all cursor-pointer ${
                soloSinTracking
                  ? "bg-[#233762] text-white border-[#233762]"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${soloSinTracking ? "bg-white" : "bg-[#CE3A39]"}`} />
              Sin Guía Tracking ({kpis.totalSinTracking})
            </button>

            <button
              onClick={handleSoloConGarantiaToggle}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-semibold transition-all cursor-pointer ${
                soloConGarantia
                  ? "bg-[#233762] text-white border-[#233762]"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${soloConGarantia ? "bg-white" : "bg-emerald-500"}`} />
              Solo con Garantía Vigente ({kpis.totalConGarantia ?? 0})
            </button>
          </div>

          <div className="text-slate-500 font-medium">
            Mostrando {items.length} de {total.toLocaleString()} registros
          </div>
        </div>
      </section>

      {/* Tabla Principal */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#233762] text-white uppercase text-[11px] font-bold tracking-wider">
                <th
                  onClick={() => handleSort("noDevolucion")}
                  className="py-3 px-4 cursor-pointer hover:bg-[#1b2b4d]"
                >
                  <div className="flex items-center gap-1">
                    No. Dev. <ArrowUpDown className="w-3 h-3 text-slate-300" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("serialNumber")}
                  className="py-3 px-4 cursor-pointer hover:bg-[#1b2b4d]"
                >
                  <div className="flex items-center gap-1">
                    Serial Number <ArrowUpDown className="w-3 h-3 text-slate-300" />
                  </div>
                </th>
                <th className="py-3 px-4">Modelo / Descripción</th>
                <th
                  onClick={() => handleSort("garantia")}
                  className="py-3 px-4 cursor-pointer hover:bg-[#1b2b4d]"
                >
                  <div className="flex items-center gap-1">
                    Garantía <ArrowUpDown className="w-3 h-3 text-slate-300" />
                  </div>
                </th>
                <th className="py-3 px-4">Ticket RITM</th>
                <th className="py-3 px-4">Guía Retorno</th>
                <th
                  onClick={() => handleSort("estatus")}
                  className="py-3 px-4 cursor-pointer hover:bg-[#1b2b4d]"
                >
                  <div className="flex items-center gap-1">
                    Estatus <ArrowUpDown className="w-3 h-3 text-slate-300" />
                  </div>
                </th>
                <th className="py-3 px-4">SNOW / Almacén</th>
                <th className="py-3 px-4">Diagnóstico / Comentarios</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-[#233762]" />
                      <span>Cargando registros...</span>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
                      <div className="w-14 h-14 rounded-2xl bg-[#EFF3F9] border border-[#233762]/15 flex items-center justify-center text-[#233762]">
                        <FileSpreadsheet className="w-7 h-7 text-[#233762]" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">Módulo de Devoluciones Limpio</h4>
                        <p className="text-xs text-slate-500 mt-1">
                          No hay información de computadoras ni números de serie cargados en esta sección.
                        </p>
                      </div>
                      <button
                        onClick={() => setShowUploadModal(true)}
                        className="mt-1 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#233762] text-white text-xs font-bold hover:bg-[#1b2b4d] transition shadow-sm cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5 text-emerald-300" />
                        <span>Cargar Nuevo Archivo Excel</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((row) => {
                  const statusConf = STATUS_CONFIG[row.estatus];

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* No. Devolución */}
                      <td className="py-3 px-4 font-mono font-bold text-slate-700">
                        {row.noDevolucion || <span className="text-slate-300 font-normal">N/A</span>}
                      </td>

                      {/* Serial Number con alerta de duplicado */}
                      <td className="py-3 px-4 font-mono">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenSerialHistory(row.serialNumber)}
                            className="text-[#233762] font-bold hover:underline hover:text-[#CE3A39] text-left"
                            title="Click para ver historial de este serial"
                          >
                            {row.serialNumber || <span className="text-red-400 italic font-sans font-normal">(Vacío)</span>}
                          </button>

                          {row.serialDuplicado && (
                            <span
                              className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                              title="Serial duplicado en varias filas"
                              onClick={() => handleOpenSerialHistory(row.serialNumber)}
                            >
                              DUP
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Modelo */}
                      <td className="py-3 px-4 max-w-[200px]">
                        <div className="font-semibold text-slate-800 truncate" title={row.modelo}>
                          {row.modelo}
                        </div>
                        {row.descripcionRaw !== row.modelo && (
                          <div className="text-[10px] text-slate-400 truncate" title={row.descripcionRaw}>
                            {row.descripcionRaw}
                          </div>
                        )}
                      </td>

                      {/* Garantía (Lenovo / Dell / Apple) */}
                      <td className="py-3 px-4 min-w-[130px]">
                        {checkingWarrantySerial === row.serialNumber ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold bg-slate-100 text-slate-600 animate-pulse">
                            <RefreshCw className="w-3 h-3 animate-spin text-[#233762]" /> Consultando...
                          </span>
                        ) : row.garantia?.vigente ? (
                          <div className="flex flex-col gap-0.5" title={`Garantía Vigente (${row.garantia.proveedor})`}>
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" /> Vigente
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {row.garantia.fechaFin ? `Hasta ${row.garantia.fechaFin}` : "Activa"}
                            </span>
                          </div>
                        ) : row.garantia?.estado === "POR_VENCER" ? (
                          <div className="flex flex-col gap-0.5" title={`Por vencer (${row.garantia.proveedor})`}>
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" /> Por Vencer
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {row.garantia.diasRestantes} días ({row.garantia.fechaFin})
                            </span>
                          </div>
                        ) : row.garantia?.estado === "EXPIRADA" ? (
                          <div className="flex flex-col gap-0.5" title={`Garantía Expirada (${row.garantia.proveedor})`}>
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                              <span className="w-2 h-2 rounded-full bg-[#CE3A39] shrink-0" /> Expirada
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {row.garantia.fechaFin ? `Fin ${row.garantia.fechaFin}` : "Vencida"}
                            </span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleCheckSingleWarranty(row.serialNumber, row.modelo)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 text-slate-600 hover:bg-[#233762] hover:text-white transition-all text-[10px] font-semibold"
                            title="Consultar garantía oficial en servidor de Lenovo / Dell"
                          >
                            <Search className="w-2.5 h-2.5" /> Consultar
                          </button>
                        )}
                      </td>

                      {/* Ticket RITM */}
                      <td className="py-3 px-4 font-mono">
                        {row.ritm ? (
                          <div className="flex items-center gap-1.5">
                            <span className={row.ritmValido ? "text-slate-700 font-semibold" : "text-amber-700 font-bold"}>
                              {row.ritm}
                            </span>
                            {!row.ritmValido && (
                              <span
                                className="px-1 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-bold"
                                title="Formato RITM no estándar"
                              >
                                !
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300 italic">Sin ticket</span>
                        )}
                      </td>

                      {/* Guía de Retorno + Enlace a Transporte */}
                      <td className="py-3 px-4">
                        {row.trackingNumber ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-slate-700 font-medium">
                              {row.trackingNumber}
                            </span>
                            <Link
                              href={`/?module=transporte&tracking=${encodeURIComponent(row.trackingNumber)}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-[#233762] hover:bg-[#233762] hover:text-white transition-all text-[10px] font-bold"
                              title="Abrir en Módulo de Transporte"
                            >
                              Rastrear <ArrowRight className="w-2.5 h-2.5" />
                            </Link>
                          </div>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-slate-300 text-[11px]"
                            title="No cuenta con guía de retorno asignada"
                          >
                            Sin guía
                          </span>
                        )}
                      </td>

                      {/* Estatus Badge */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${statusConf.dotColor}`} />
                          {row.estatus}
                        </span>
                      </td>

                      {/* SNOW / Stock Dates */}
                      <td className="py-3 px-4 text-[11px]">
                        <div>
                          <span className="text-slate-400">SNOW:</span>{" "}
                          <span className="font-medium text-slate-700">
                            {row.entryAtSnow || row.entryAtSnowRaw || <span className="text-slate-300">-</span>}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">Stock:</span>{" "}
                          <span className="font-medium text-slate-700">
                            {row.entryIntoStock || row.entryIntoStockRaw || <span className="text-slate-300">-</span>}
                          </span>
                        </div>
                      </td>

                      {/* Diagnóstico / Comentarios */}
                      <td className="py-3 px-4 max-w-[220px]">
                        <p className="text-slate-600 text-[11px] line-clamp-2" title={row.comentarios}>
                          {row.comentarios || <span className="text-slate-300 italic">Sin comentarios</span>}
                        </p>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-slate-200 bg-slate-50 text-xs">
          <div className="flex items-center gap-2 text-slate-600">
            <span>Filas por página:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const nextSize = parseInt(e.target.value, 10);
                setPageSize(nextSize);
                setPage(1);
                updateUrlParams({ pageSize: nextSize, page: 1 });
              }}
              className="px-2 py-1 rounded border border-slate-300 bg-white text-xs font-semibold"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
            <span className="ml-2 text-slate-400">
              Página {page} de {totalPages}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => handlePageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) pageNum = i + 1;
              else if (page <= 3) pageNum = i + 1;
              else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
              else pageNum = page - 2 + i;

              return (
                <button
                  key={pageNum}
                  onClick={() => handlePageChange(pageNum)}
                  className={`w-7 h-7 rounded text-xs font-semibold ${
                    page === pageNum
                      ? "bg-[#233762] text-white"
                      : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Modal Historial de Serial */}
      {selectedSerial && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-[#233762] text-white px-6 py-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-blue-200 font-bold uppercase tracking-wider">Historial de Serial</div>
                <h3 className="text-lg font-bold font-mono">{selectedSerial}</h3>
              </div>
              <button
                onClick={() => setSelectedSerial(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 max-h-[70vh] overflow-y-auto space-y-4">
              {/* Tarjeta de Garantía en Modal */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#233762]" />
                    <span className="font-bold text-xs text-slate-800">
                      Garantía del Fabricante ({selectedSerialWarranty?.proveedor || "Consultando..."})
                    </span>
                  </div>
                  {selectedSerialWarranty?.vigente ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white text-slate-700 border border-slate-200">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      VIGENTE
                    </span>
                  ) : selectedSerialWarranty?.estado === "POR_VENCER" ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white text-slate-700 border border-slate-200">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      POR VENCER
                    </span>
                  ) : selectedSerialWarranty?.estado === "EXPIRADA" ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white text-slate-700 border border-slate-200">
                      <span className="w-2 h-2 rounded-full bg-[#CE3A39]" />
                      EXPIRADA
                    </span>
                  ) : (
                    <button
                      onClick={() => handleCheckSingleWarranty(selectedSerial)}
                      className="px-2.5 py-1 rounded bg-[#233762] text-white text-[10px] font-bold hover:bg-[#1b2b4d]"
                    >
                      Consultar Ahora
                    </button>
                  )}
                </div>

                {selectedSerialWarranty?.productoNombre && (
                  <div className="text-xs font-semibold text-slate-700 mb-1">
                    {selectedSerialWarranty.productoNombre}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 mt-2">
                  <div>
                    <strong>Vigencia:</strong>{" "}
                    {selectedSerialWarranty?.fechaFin ? selectedSerialWarranty.fechaFin : "Sin fecha registrada"}
                  </div>
                  <div>
                    <strong>Tipo Servicio:</strong>{" "}
                    {selectedSerialWarranty?.tipoServicio || "Estándar"}
                  </div>
                  {selectedSerialWarranty?.diasRestantes !== undefined && (
                    <div className="col-span-2">
                      <strong>Días restantes:</strong>{" "}
                      {selectedSerialWarranty.diasRestantes > 0 ? selectedSerialWarranty.diasRestantes : 0} días
                    </div>
                  )}
                </div>
              </div>

              {loadingSerialHistory ? (
                <div className="py-8 text-center text-slate-500 flex flex-col items-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-[#233762]" />
                  <span>Consultando historial...</span>
                </div>
              ) : serialHistory.length === 0 ? (
                <p className="text-slate-500 text-sm">No se encontraron movimientos para este serial.</p>
              ) : (
                <div className="space-y-4">
                  <div className="text-xs text-slate-500">
                    Se encontraron <strong className="text-[#233762]">{serialHistory.length}</strong> apariciones de este serial en la base de datos:
                  </div>

                  {serialHistory.map((hist, idx) => (
                    <div
                      key={hist.id}
                      className="p-4 rounded-lg border border-slate-200 bg-slate-50 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#233762]">Registro #{idx + 1} - Devolución: {hist.noDevolucion || "N/A"}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white border border-slate-300">
                          {hist.estatus}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                        <div><strong>RITM:</strong> {hist.ritm || "N/A"}</div>
                        <div><strong>Tracking:</strong> {hist.trackingNumber || "N/A"}</div>
                        <div><strong>Ingreso:</strong> {hist.fechaIngresoSistema || hist.fechaIngresoSistemaRaw || "N/A"}</div>
                        <div><strong>Stock:</strong> {hist.entryIntoStock || hist.entryIntoStockRaw || "N/A"}</div>
                      </div>
                      {hist.comentarios && (
                        <div className="text-[11px] bg-white p-2 rounded border border-slate-200">
                          <strong>Comentarios:</strong> {hist.comentarios}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-slate-100 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedSerial(null)}
                className="px-4 py-2 rounded-lg bg-slate-700 text-white text-xs font-semibold hover:bg-slate-800"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      </>
      )}

      {/* Modal Confirmación Limpiar Información */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-2xl bg-red-50 border border-red-100 text-[#CE3A39] flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-extrabold text-slate-900">
                    ¿Limpiar la sección de devoluciones?
                  </h3>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    Se eliminará toda la información cargada de computadoras, modelos, números de serie y tickets en este módulo. La sección quedará completamente en blanco y limpia.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowClearModal(false)}
                  disabled={isClearing}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleClearDevoluciones}
                  disabled={isClearing}
                  className="px-4 py-2 rounded-xl bg-[#CE3A39] hover:bg-[#B02E2D] text-white text-xs font-bold transition shadow-sm shadow-red-200 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isClearing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Limpiando...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Sí, limpiar todo</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Carga de Excel (Actualizar / Cargar) */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-[#233762] text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2">
                  <Upload className="w-5 h-5 text-emerald-400" /> Carga Semanal de Devoluciones
                </h3>
                <p className="text-xs text-blue-200">
                  Selecciona el archivo Excel (.xlsx) para validar y sincronizar.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setUploadFile(null);
                  setUploadPreview(null);
                  setUploadError(null);
                }}
                className="text-white/80 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Dropzone */}
              <label className="border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 hover:border-[#233762] transition-all">
                <FileSpreadsheet className="w-10 h-10 text-[#CE3A39] mb-2" />
                <span className="text-sm font-semibold text-slate-700">
                  {uploadFile ? uploadFile.name : "Arrastra o selecciona el archivo Excel (.xlsx)"}
                </span>
                <span className="text-xs text-slate-400 mt-1">
                  Hoja esperada: Hoja1 (~1,500+ filas soportadas)
                </span>
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>

              {uploadError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {uploadSuccess && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{uploadSuccess}</span>
                </div>
              )}

              {/* Vista Previa de Validación */}
              {uploadPreview && (
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3 text-xs">
                  <div className="font-bold text-[#233762] flex items-center justify-between border-b pb-2">
                    <span>Previsualización (Dry-Run exitoso)</span>
                    <span className="text-emerald-700 font-mono">
                      {uploadPreview.totalFilasLeidas} filas leídas
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-slate-600">
                    <div><strong>Filas Nuevas:</strong> {uploadPreview.filasNuevas}</div>
                    <div><strong>Actualizadas (Upsert):</strong> {uploadPreview.filasActualizadas}</div>
                    <div><strong>En Evaluación:</strong> {uploadPreview.resumenEstatus["En evaluación"]}</div>
                    <div><strong>Pendientes Baja:</strong> {uploadPreview.resumenEstatus["Pendiente de baja"]}</div>
                    <div><strong>In Stock:</strong> {uploadPreview.resumenEstatus["In Stock / Cerrado"]}</div>
                    <div><strong>Sin Clasificar:</strong> {uploadPreview.resumenEstatus["Sin clasificar"]}</div>
                  </div>

                  {uploadPreview.advertencias.length > 0 && (
                    <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                      <strong>Advertencias de calidad detectadas:</strong> {uploadPreview.advertencias.length}
                      <ul className="list-disc pl-4 mt-1 space-y-0.5 max-h-24 overflow-y-auto">
                        {uploadPreview.advertencias.slice(0, 5).map((adv, i) => (
                          <li key={i}>
                            Fila {adv.fila} ({adv.serial}): {adv.motivo}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-100 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setUploadFile(null);
                  setUploadPreview(null);
                }}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-white"
              >
                Cancelar
              </button>

              <button
                onClick={handleConfirmUpload}
                disabled={!uploadPreview || isUploading}
                className="px-5 py-2 rounded-lg bg-[#233762] text-white text-xs font-semibold hover:bg-[#1b2b4d] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isUploading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Guardando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Confirmar y Guardar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
