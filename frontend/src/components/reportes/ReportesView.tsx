"use client";

import React, { useState, useEffect, useTransition, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  ShieldAlert,
  AlertCircle,
  HelpCircle,
  ExternalLink,
  Wrench,
  Truck,
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
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 md:p-8">
      {/* Toast Flotante */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-lg shadow-xl border text-sm font-medium flex items-center gap-3 transition-all transform translate-y-0 ${
            toast.type === "success"
              ? "bg-emerald-900 text-emerald-100 border-emerald-700"
              : toast.type === "error"
              ? "bg-red-900 text-red-100 border-red-700"
              : "bg-[#233762] text-white border-blue-900"
          }`}
        >
          {toast.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          {toast.type === "error" && <AlertTriangle className="w-5 h-5 text-red-400" />}
          {toast.type === "info" && <Clock className="w-5 h-5 text-blue-300" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Submódulos de Reportes: Vista HUB Inicial (cuando no hay submódulo seleccionado) */}
      {activeSubmodulo === null && (
        <div className="w-full max-w-6xl mx-auto space-y-8 py-2">
          {/* Barra Superior con Navegación al Hub Principal */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-200">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:text-[#233762] hover:border-slate-300 shadow-2xs transition-all group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform text-[#CE3A39]" />
              <span>Volver al Hub Principal</span>
            </Link>
            <span className="text-xs font-mono text-slate-400">Seko Supply Chain México</span>
          </div>

          {/* Header Centralizado */}
          <div className="text-center max-w-2xl mx-auto pt-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EFF3F9] text-[#233762] text-xs font-semibold mb-3">
              <span>Asset Management</span>
              <span className="text-slate-400">/</span>
              <span className="text-[#CE3A39] font-bold">Reportes</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-[#233762] tracking-tight">
              Módulos de Reportes y Trazabilidad
            </h1>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">
              Selecciona un submódulo operativo para consultar reportes, métricas en tiempo real, conciliación de garantías y estatus de equipos.
            </p>
          </div>

          {/* Grid de 4 Módulos Individuales */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-4">
            {/* Módulo 1: Devoluciones */}
            <div
              onClick={() => handleSubmoduloChange("devoluciones")}
              className="bg-white rounded-xl border border-slate-200/80 shadow-md hover:shadow-xl transition-all duration-300 p-6 min-h-[260px] flex flex-col items-center justify-between text-center cursor-pointer group relative overflow-hidden hover:-translate-y-1"
            >
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#233762] group-hover:bg-[#CE3A39] transition-colors duration-300" />
              <span className="absolute top-3.5 right-3.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                {total.toLocaleString()} Equipos
              </span>
              <div className="flex flex-col items-center w-full">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-all duration-300 shadow-2xs bg-[#EFF3F9] text-[#233762]">
                  <FileSpreadsheet className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-[#233762] mt-4">Devoluciones</h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Conciliación semanal Kyndryl / Seko, estatus ServiceNow, garantías Lenovo / Dell y trazabilidad de retornos.
                </p>
              </div>
              <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#233762] group-hover:text-[#CE3A39] transition-colors">
                <span>Ingresar al módulo</span>
                <span className="group-hover:translate-x-1 transition-transform duration-200">→</span>
              </span>
            </div>

            {/* Módulo 2: Equipos en Reparación */}
            <div
              onClick={() => handleSubmoduloChange("reparacion")}
              className="bg-white rounded-xl border border-slate-200/80 shadow-md hover:shadow-xl transition-all duration-300 p-6 min-h-[260px] flex flex-col items-center justify-between text-center cursor-pointer group relative overflow-hidden hover:-translate-y-1"
            >
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#233762] group-hover:bg-amber-500 transition-colors duration-300" />
              <span className="absolute top-3.5 right-3.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                Taller y Banco
              </span>
              <div className="flex flex-col items-center w-full">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-all duration-300 shadow-2xs bg-amber-50 text-amber-600">
                  <Wrench className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-[#233762] mt-4">Equipos en Reparación</h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Monitoreo de diagnósticos técnicos, piezas solicitadas, garantías RMA Lenovo/Dell y dictámenes.
                </p>
              </div>
              <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#233762] group-hover:text-amber-600 transition-colors">
                <span>Ingresar al módulo</span>
                <span className="group-hover:translate-x-1 transition-transform duration-200">→</span>
              </span>
            </div>

            {/* Módulo 3: Outbound */}
            <div
              onClick={() => handleSubmoduloChange("outbound")}
              className="bg-white rounded-xl border border-slate-200/80 shadow-md hover:shadow-xl transition-all duration-300 p-6 min-h-[260px] flex flex-col items-center justify-between text-center cursor-pointer group relative overflow-hidden hover:-translate-y-1"
            >
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#233762] group-hover:bg-blue-600 transition-colors duration-300" />
              <span className="absolute top-3.5 right-3.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                Despachos Courier
              </span>
              <div className="flex flex-col items-center w-full">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-all duration-300 shadow-2xs bg-blue-50 text-blue-600">
                  <Truck className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-[#233762] mt-4">Outbound</h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Trazabilidad de equipos asignados a usuarios, empaque, carriers, números de guía y confirmación de entrega.
                </p>
              </div>
              <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#233762] group-hover:text-blue-600 transition-colors">
                <span>Ingresar al módulo</span>
                <span className="group-hover:translate-x-1 transition-transform duration-200">→</span>
              </span>
            </div>

            {/* Módulo 4: Refurb */}
            <div
              onClick={() => handleSubmoduloChange("refurb")}
              className="bg-white rounded-xl border border-slate-200/80 shadow-md hover:shadow-xl transition-all duration-300 p-6 min-h-[260px] flex flex-col items-center justify-between text-center cursor-pointer group relative overflow-hidden hover:-translate-y-1"
            >
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#233762] group-hover:bg-purple-600 transition-colors duration-300" />
              <span className="absolute top-3.5 right-3.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                Línea NIST 800-88
              </span>
              <div className="flex flex-col items-center w-full">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-all duration-300 shadow-2xs bg-purple-50 text-purple-600">
                  <RefreshCw className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-[#233762] mt-4">Refurb</h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Borrado seguro de datos (NIST 800-88 / Blancco), reinstalación de imagen, auditoría cosmética y reingreso a almacén.
                </p>
              </div>
              <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#233762] group-hover:text-purple-600 transition-colors">
                <span>Ingresar al módulo</span>
                <span className="group-hover:translate-x-1 transition-transform duration-200">→</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Submódulo 2: Equipos en Reparación (Vista Individual) */}
      {activeSubmodulo === "reparacion" && (
        <ReparacionView onBack={() => handleSubmoduloChange(null)} />
      )}

      {/* Submódulo 3: Outbound (Vista Individual) */}
      {activeSubmodulo === "outbound" && (
        <OutboundView onBack={() => handleSubmoduloChange(null)} />
      )}

      {/* Submódulo 4: Refurb (Vista Individual) */}
      {activeSubmodulo === "refurb" && (
        <RefurbView onBack={() => handleSubmoduloChange(null)} />
      )}

      {/* Submódulo 1: Devoluciones de Equipos (Vista Individual) */}
      {activeSubmodulo === "devoluciones" && (
        <>
          {/* Barra Superior con Navegación al Hub de Reportes */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 mb-6">
            <button
              onClick={() => handleSubmoduloChange(null)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:text-[#233762] hover:border-slate-300 shadow-2xs transition-all group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform text-[#CE3A39]" />
              <span>Volver a Módulos de Reportes</span>
            </button>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EFF3F9] text-[#233762] text-xs font-semibold">
              <span>Asset Management</span>
              <span className="text-slate-400">/</span>
              <span>Reportes</span>
              <span className="text-slate-400">/</span>
              <span className="text-[#CE3A39] font-bold">Devoluciones de Equipos</span>
            </div>
          </div>

          {/* Header Institucional de Devoluciones */}
          <header className="mb-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-extrabold text-[#233762] flex items-center gap-3">
                  <FileSpreadsheet className="w-8 h-8 text-[#CE3A39]" />
                  Reportes de Devoluciones de Equipos
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                  Conciliación semanal Kyndryl / Seko, estatus ServiceNow, garantías y trazabilidad de retornos.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleBatchWarrantyCheck}
                  disabled={isCheckingBatch}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold shadow hover:bg-emerald-700 disabled:opacity-50 transition-all"
                  title="Consultar en los servidores de Lenovo y Dell las garantías de los equipos mostrados"
                >
                  {isCheckingBatch ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-200" />
                      <span>Consultando Garantías...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4 text-emerald-200" />
                      <span>Verificar Garantías del Lote</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#233762] text-white text-sm font-semibold shadow hover:bg-[#1b2b4d] transition-all"
                >
                  <Upload className="w-4 h-4 text-emerald-300" />
                  Actualizar / Cargar Excel
                </button>
                <button
                  onClick={handleExportFiltered}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-semibold shadow-sm hover:bg-slate-50 hover:text-[#233762] transition-all"
                >
                  <Download className="w-4 h-4 text-[#CE3A39]" />
                  Descargar Excel Filtrado
                </button>
              </div>
            </div>
          </header>

          {/* Tarjetas de KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
        {/* Total Devueltos */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Devueltos</div>
          <div className="text-2xl md:text-3xl font-black text-[#233762] mt-2">
            {kpis.totalDevueltos.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-blue-500" /> Lote activo
          </div>
        </div>

        {/* En evaluación */}
        <div className="bg-amber-50/50 p-5 rounded-xl border border-amber-200 shadow-sm">
          <div className="text-xs font-bold text-amber-800 uppercase tracking-wider">En Evaluación</div>
          <div className="text-2xl md:text-3xl font-black text-amber-700 mt-2">
            {kpis.enEvaluacion.toLocaleString()}
          </div>
          <div className="text-[11px] text-amber-600 mt-1 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> Revisión técnica
          </div>
        </div>

        {/* Pendientes de baja */}
        <div className="bg-red-50/50 p-5 rounded-xl border border-red-200 shadow-sm">
          <div className="text-xs font-bold text-[#CE3A39] uppercase tracking-wider">Pendiente de Baja</div>
          <div className="text-2xl md:text-3xl font-black text-[#CE3A39] mt-2">
            {kpis.pendientesBaja.toLocaleString()}
          </div>
          <div className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Destino Scrap
          </div>
        </div>

        {/* In Stock / Cerrado */}
        <div className="bg-emerald-50/50 p-5 rounded-xl border border-emerald-200 shadow-sm">
          <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">In Stock / Cerrado</div>
          <div className="text-2xl md:text-3xl font-black text-emerald-700 mt-2">
            {kpis.inStockCerrado.toLocaleString()}
          </div>
          <div className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Ingresado al almacén
          </div>
        </div>

        {/* % Conciliados SNOW */}
        <div className="bg-blue-50/50 p-5 rounded-xl border border-blue-200 shadow-sm">
          <div className="text-xs font-bold text-blue-900 uppercase tracking-wider">Conciliados SNOW</div>
          <div className="text-2xl md:text-3xl font-black text-blue-800 mt-2">
            {kpis.porcentajeConciliadosSnow}%
          </div>
          <div className="text-[11px] text-blue-600 mt-1 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> {kpis.conciliadosSnowCount} registrados
          </div>
        </div>

        {/* Sin Clasificar */}
        <div className="bg-slate-100/70 p-5 rounded-xl border border-slate-300 shadow-sm">
          <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">Sin Clasificar</div>
          <div className="text-2xl md:text-3xl font-black text-slate-700 mt-2">
            {kpis.sinClasificar.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" /> Fechas o vacíos
          </div>
        </div>
      </section>

      {/* Barra de Filtros y Búsqueda */}
      <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mb-6">
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
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleDuplicadosToggle}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-medium transition-all ${
                soloDuplicados
                  ? "bg-purple-50 text-purple-700 border-purple-300 font-bold"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5 text-purple-600" />
              Solo Seriales Duplicados ({kpis.totalSerialesDuplicados})
            </button>

            <button
              onClick={handleSinRitmToggle}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-medium transition-all ${
                soloSinRitm
                  ? "bg-amber-50 text-amber-800 border-amber-300 font-bold"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              RITM Inválido / Vacío ({kpis.totalSinRitm})
            </button>

            <button
              onClick={handleSinTrackingToggle}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-medium transition-all ${
                soloSinTracking
                  ? "bg-red-50 text-red-700 border-red-300 font-bold"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
            >
              <X className="w-3.5 h-3.5 text-red-500" />
              Sin Guía Tracking ({kpis.totalSinTracking})
            </button>

            <button
              onClick={handleSoloConGarantiaToggle}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-medium transition-all ${
                soloConGarantia
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300 font-bold"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Solo con Garantía Vigente ({kpis.totalConGarantia ?? 0})
            </button>
          </div>

          <div className="text-slate-500 font-medium">
            Mostrando {items.length} de {total.toLocaleString()} registros
          </div>
        </div>
      </section>

      {/* Tabla Principal */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
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
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FileSpreadsheet className="w-8 h-8 text-slate-300" />
                      <span className="font-semibold text-slate-600">
                        No se encontraron registros con los filtros aplicados.
                      </span>
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
                              className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
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
                          <div className="flex flex-col gap-0.5">
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 w-fit"
                              title={`Garantía Vigente (${row.garantia.proveedor})`}
                            >
                              <ShieldCheck className="w-3 h-3 text-emerald-600" /> Vigente
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {row.garantia.fechaFin ? `Hasta ${row.garantia.fechaFin}` : "Activa"}
                            </span>
                          </div>
                        ) : row.garantia?.estado === "POR_VENCER" ? (
                          <div className="flex flex-col gap-0.5">
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 w-fit"
                              title={`Por vencer (${row.garantia.proveedor})`}
                            >
                              <Clock className="w-3 h-3 text-amber-600" /> Por Vencer
                            </span>
                            <span className="text-[10px] text-amber-700 font-mono">
                              {row.garantia.diasRestantes} días ({row.garantia.fechaFin})
                            </span>
                          </div>
                        ) : row.garantia?.estado === "EXPIRADA" ? (
                          <div className="flex flex-col gap-0.5">
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 w-fit"
                              title={`Garantía Expirada (${row.garantia.proveedor})`}
                            >
                              <X className="w-3 h-3 text-rose-500" /> Expirada
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
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${statusConf.badgeBg} ${statusConf.badgeText} ${statusConf.badgeBorder}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${statusConf.dotColor}`} />
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
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
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
              <div className="p-4 rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50/40">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#233762]" />
                    <span className="font-bold text-xs text-slate-800">
                      Garantía del Fabricante ({selectedSerialWarranty?.proveedor || "Consultando..."})
                    </span>
                  </div>
                  {selectedSerialWarranty?.vigente ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      VIGENTE
                    </span>
                  ) : selectedSerialWarranty?.estado === "POR_VENCER" ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                      POR VENCER
                    </span>
                  ) : selectedSerialWarranty?.estado === "EXPIRADA" ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
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

      {/* Modal Carga de Excel (Actualizar / Cargar) */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
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
  );
}
