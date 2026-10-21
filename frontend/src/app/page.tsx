"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Play,
  Zap,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Search,
  Filter,
  Edit3,
  Download,
  ShieldAlert,
  ArrowRight,
  Package,
  MapPin,
  Phone,
  Building,
  Check,
  X,
  Clock,
  Layers,
  ExternalLink,
  ChevronRight,
  AlertCircle,
  Truck,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface OrderItem {
  order_id: string;
  type: "OUTBOUND" | "RETURN";
  recipient_name: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  declared_value: number;
  service_code: string;
  status_semaphore: "VERDE" | "AMARILLO" | "ROJO";
  status_text: string;
  incidents: string[];
}

interface BatchData {
  active: boolean;
  batch_filename?: string;
  batch_date?: string;
  message?: string;
  metrics: {
    total_orders: number;
    confirmed_100: number;
    review: number;
    error_blocked: number;
  };
  orders: OrderItem[];
}

export default function DashboardPage() {
  const [batchData, setBatchData] = useState<BatchData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [apiConnected, setApiConnected] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Filtros de tabla
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"ALL" | "ISSUES" | "CONFIRMED" | "OUTBOUND" | "RETURN">("ALL");

  // Estado para modal de edición
  const [editingOrder, setEditingOrder] = useState<OrderItem | null>(null);
  const [editFormData, setEditFormData] = useState({
    phone: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    zip: "",
    service_code: "70",
    declared_value: 0,
    sync_counterpart: true,
  });

  // Modales de Techship
  const [showLiveModal, setShowLiveModal] = useState<boolean>(false);
  const [simResults, setSimResults] = useState<any | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mostrar toast auto-ocultable
  const triggerToast = (message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // Cargar salud de la API y lote actual al inicio
  const fetchHealthAndBatch = async () => {
    try {
      const healthRes = await fetch(`${API_BASE}/api/health`);
      if (healthRes.ok) {
        setApiConnected(true);
      } else {
        setApiConnected(false);
      }
    } catch {
      setApiConnected(false);
    }

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/batches/current`);
      if (res.ok) {
        const data = await res.json();
        if (data.active) {
          setBatchData(data);
        } else {
          setBatchData(null);
        }
      }
    } catch (err) {
      console.error("Error al cargar lote:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealthAndBatch();
  }, []);

  // Subir reporte Excel (SCTASK_*.xlsx)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      triggerToast("Solo se permiten archivos de Excel (.xlsx)", "error");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      setUploading(true);
      setActionLoading("upload");
      const res = await fetch(`${API_BASE}/api/batches/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Error al procesar el archivo");
      }

      const data = await res.json();
      setBatchData(data);
      triggerToast(`Lote procesado exitosamente: ${file.name}`, "success");
    } catch (err: any) {
      triggerToast(err.message || "Error al cargar archivo", "error");
    } finally {
      setUploading(false);
      setActionLoading(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Abrir modal de edición para una orden
  const handleOpenEdit = (order: OrderItem) => {
    setEditingOrder(order);
    setEditFormData({
      phone: order.phone.replace("ERROR:", "").trim(),
      address1: order.address1.replace("ERROR:", "").trim(),
      address2: order.address2 || "",
      city: order.city || "",
      state: order.state || "",
      zip: order.zip || "",
      service_code: order.service_code || "70",
      declared_value: order.declared_value || 0,
      sync_counterpart: true,
    });
  };

  // Guardar edición vía PATCH /api/batches/order/{pick_order}
  const handleSavePatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;

    try {
      setActionLoading("patch");
      const res = await fetch(`${API_BASE}/api/batches/order/${editingOrder.order_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: editFormData.phone.trim(),
          address1: editFormData.address1.trim(),
          address2: editFormData.address2.trim(),
          city: editFormData.city.trim(),
          state: editFormData.state.trim(),
          zip: editFormData.zip.trim(),
          service_code: editFormData.service_code.trim(),
          declared_value: Number(editFormData.declared_value),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "No se pudo actualizar la orden");
      }

      const data = await res.json();
      if (data.batch) {
        setBatchData(data.batch);
      }
      triggerToast(`Orden ${editingOrder.order_id} corregida y validada.`, "success");
      setEditingOrder(null);
    } catch (err: any) {
      triggerToast(err.message || "Error al actualizar", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // Ejecutar simulación o timbrado en Techship
  const handleTechshipProcess = async (dryRun: boolean) => {
    try {
      setActionLoading(dryRun ? "sim" : "live");
      const res = await fetch(`${API_BASE}/api/techship/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: dryRun }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Error al conectar con Techship");
      }

      const data = await res.json();
      setSimResults(data);
      setShowLiveModal(false);

      if (dryRun) {
        triggerToast("Simulación completada con éxito.", "info");
      } else {
        triggerToast("Timbrado oficial completado en Techship.", "success");
        fetchHealthAndBatch();
      }
    } catch (err: any) {
      triggerToast(err.message || "Fallo en operación de Techship", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // Sincronizar trackings y generar Cierre + PDF
  const handleSyncClosing = async () => {
    try {
      setActionLoading("sync");
      const res = await fetch(`${API_BASE}/api/techship/sync-closing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Error al sincronizar con Techship");
      }

      const data = await res.json();
      triggerToast(data.message || "Cierre y PDF sincronizados correctamente.", "success");
    } catch (err: any) {
      triggerToast(err.message || "Error en sincronización de cierre", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // Descarga directa de archivos
  const handleDownload = (fileType: string) => {
    const url = `${API_BASE}/api/files/download/${fileType}`;
    window.open(url, "_blank");
  };

  // Filtrado reactivo de órdenes
  const filteredOrders = useMemo(() => {
    if (!batchData?.orders) return [];

    return batchData.orders.filter((order) => {
      // Filtro de pestañas
      if (activeTab === "ISSUES" && order.status_semaphore === "VERDE") return false;
      if (activeTab === "CONFIRMED" && order.status_semaphore !== "VERDE") return false;
      if (activeTab === "OUTBOUND" && order.type !== "OUTBOUND") return false;
      if (activeTab === "RETURN" && order.type !== "RETURN") return false;

      // Filtro de búsqueda
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        order.order_id.toLowerCase().includes(term) ||
        order.recipient_name.toLowerCase().includes(term) ||
        order.city.toLowerCase().includes(term) ||
        order.zip.includes(term) ||
        order.phone.includes(term) ||
        order.address1.toLowerCase().includes(term)
      );
    });
  }, [batchData, searchTerm, activeTab]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-md transition-all animate-bounce-short ${
            toast.type === "success"
              ? "bg-emerald-950/90 border-emerald-500/50 text-emerald-200"
              : toast.type === "error"
              ? "bg-rose-950/90 border-rose-500/50 text-rose-200"
              : "bg-cyan-950/90 border-cyan-500/50 text-cyan-200"
          }`}
        >
          {toast.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          {toast.type === "error" && <XCircle className="w-5 h-5 text-rose-400" />}
          {toast.type === "info" && <AlertCircle className="w-5 h-5 text-cyan-400" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Header Corporativo SEKO / Kyndryl */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-500/20">
              SK
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-wide text-white">SEKO LOGISTICS</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-cyan-400 border border-cyan-500/30 font-mono">
                  KST / KYNDRYL #11
                </span>
              </div>
              <p className="text-xs text-slate-400">Dashboard Operativo de Envíos y Validación Postal SEPOMEX</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Indicador de conexión API */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/60 text-xs font-mono">
              <span
                className={`w-2 h-2 rounded-full ${
                  apiConnected ? "bg-emerald-500 shadow-sm shadow-emerald-500" : "bg-rose-500"
                }`}
              />
              <span className="text-slate-300">{apiConnected ? "API FastAPI Online" : "API Desconectada"}</span>
            </div>

            <button
              onClick={fetchHealthAndBatch}
              disabled={loading}
              title="Recargar estado del lote"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-cyan-400" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* ZONA 1: Ingesta y 4 Tarjetas KPI */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Dropzone de Ingesta */}
          <div className="lg:col-span-4 bg-slate-900/40 border border-dashed border-slate-700/80 hover:border-cyan-500/60 rounded-2xl p-5 flex flex-col justify-between transition-colors relative overflow-hidden group">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx,.xls"
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
              disabled={uploading}
            />
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 group-hover:scale-105 transition-transform">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-100">Ingestar Reporte ServiceNow</h3>
                <p className="text-xs text-slate-400 mt-0.5">Arrastra el archivo SCTASK_SHP_Combined_Report_MX_*.xlsx</p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-400 font-mono">
                {batchData?.batch_filename ? batchData.batch_filename : "Sin archivo activo"}
              </span>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium shadow-sm transition"
              >
                {uploading ? "Procesando..." : "Examinar..."}
              </button>
            </div>
          </div>

          {/* Tarjetas KPI */}
          <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Total Órdenes */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-medium">Total Órdenes</span>
                <Package className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="mt-2">
                <span className="text-3xl font-extrabold text-white font-mono">
                  {batchData?.metrics.total_orders || 0}
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">Ida y Retorno</p>
              </div>
            </div>

            {/* Confirmadas 100% */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500" />
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-medium">Confirmadas</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-2">
                <span className="text-3xl font-extrabold text-emerald-400 font-mono">
                  {batchData?.metrics.confirmed_100 || 0}
                </span>
                <p className="text-[11px] text-emerald-500/80 mt-0.5">Semáforo Verde</p>
              </div>
            </div>

            {/* Por Revisar */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-amber-500" />
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-medium">Por Revisar</span>
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              </div>
              <div className="mt-2">
                <span className="text-3xl font-extrabold text-amber-400 font-mono">
                  {batchData?.metrics.review || 0}
                </span>
                <p className="text-[11px] text-amber-500/80 mt-0.5">Semáforo Amarillo</p>
              </div>
            </div>

            {/* Bloqueadas / Error */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-rose-500" />
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-medium">Bloqueadas</span>
                <XCircle className="w-4 h-4 text-rose-400" />
              </div>
              <div className="mt-2">
                <span className="text-3xl font-extrabold text-rose-400 font-mono">
                  {batchData?.metrics.error_blocked || 0}
                </span>
                <p className="text-[11px] text-rose-500/80 mt-0.5">Teléfono / CP Inválido</p>
              </div>
            </div>
          </div>
        </section>

        {/* ZONA 2: Barra Maestra de Acciones Techship y Descargas */}
        <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Botón 1: Simulación Segura */}
            <button
              onClick={() => handleTechshipProcess(true)}
              disabled={!batchData || actionLoading === "sim"}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4 text-cyan-400 fill-cyan-400/20" />
              <span>{actionLoading === "sim" ? "Simulando..." : "1. Simular en Techship (Dry-Run)"}</span>
            </button>

            {/* Botón 2: Timbrado Real en Estafeta */}
            <button
              onClick={() => setShowLiveModal(true)}
              disabled={!batchData || actionLoading === "live"}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-sm font-bold shadow-lg shadow-rose-900/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
              <span>{actionLoading === "live" ? "Timbrando..." : "2. Timbrar Guías Reales (--live)"}</span>
            </button>

            {/* Botón 3: Cierre y PDF de Etiquetas */}
            <button
              onClick={handleSyncClosing}
              disabled={!batchData || actionLoading === "sync"}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-lg shadow-emerald-900/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Truck className="w-4 h-4" />
              <span>{actionLoading === "sync" ? "Sincronizando..." : "3. Sincronizar Cierre y Etiquetas"}</span>
            </button>
          </div>

          {/* Grupo de Descarga Directa de Archivos */}
          <div className="flex items-center gap-2 border-t sm:border-t-0 sm:border-l border-slate-800 pt-3 sm:pt-0 sm:pl-4">
            <span className="text-xs text-slate-400 font-medium mr-1 hidden md:inline">Descargar:</span>

            <button
              onClick={() => handleDownload("cierre_excel")}
              title="Descargar Cierre_*.xlsx (ServiceNow 12 columnas)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 text-xs font-mono transition"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Cierre.xlsx</span>
            </button>

            <button
              onClick={() => handleDownload("etiquetas_pdf")}
              title="Descargar o imprimir PDF consolidado de etiquetas"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-rose-400 border border-rose-500/30 text-xs font-mono transition"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Etiquetas.pdf</span>
            </button>

            <button
              onClick={() => handleDownload("techship_excel")}
              title="Descargar Guias_Techship_Importada_*.xlsx (61 columnas)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 text-xs font-mono transition"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Techship.xlsx</span>
            </button>

            <button
              onClick={() => handleDownload("auditoria_excel")}
              title="Descargar Auditoria_Direcciones_*.xlsx con bitácora"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-amber-400 border border-amber-500/30 text-xs font-mono transition"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Auditoría.xlsx</span>
            </button>
          </div>
        </section>

        {/* ZONA 3: Tabla Interactiva de Auditoría y Edición Inline */}
        <section className="bg-slate-900/60 border border-slate-800/90 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
          {/* Barra de Filtros y Búsqueda */}
          <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 bg-slate-900/80">
            {/* Pestañas de Filtro */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/70 border border-slate-800 text-xs font-medium">
              <button
                onClick={() => setActiveTab("ALL")}
                className={`px-3 py-1.5 rounded-lg transition ${
                  activeTab === "ALL" ? "bg-cyan-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                }`}
              >
                Todas ({batchData?.orders.length || 0})
              </button>
              <button
                onClick={() => setActiveTab("ISSUES")}
                className={`px-3 py-1.5 rounded-lg transition ${
                  activeTab === "ISSUES"
                    ? "bg-rose-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Solo Errores / Revisar (
                {(batchData?.metrics.error_blocked || 0) + (batchData?.metrics.review || 0)})
              </button>
              <button
                onClick={() => setActiveTab("CONFIRMED")}
                className={`px-3 py-1.5 rounded-lg transition ${
                  activeTab === "CONFIRMED"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Confirmadas ({batchData?.metrics.confirmed_100 || 0})
              </button>
              <button
                onClick={() => setActiveTab("OUTBOUND")}
                className={`px-3 py-1.5 rounded-lg transition hidden sm:inline ${
                  activeTab === "OUTBOUND" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                Solo Ida
              </button>
              <button
                onClick={() => setActiveTab("RETURN")}
                className={`px-3 py-1.5 rounded-lg transition hidden sm:inline ${
                  activeTab === "RETURN" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                Solo Retorno (-1)
              </button>
            </div>

            {/* Input de Búsqueda Rápida */}
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por RITM, empleado, CP, teléfono..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-950/80 border border-slate-700 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition"
              />
            </div>
          </div>

          {/* Tabla de Registros */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">Orden (RITM)</th>
                  <th className="py-3 px-4">Semáforo</th>
                  <th className="py-3 px-4">Destinatario / Empleado</th>
                  <th className="py-3 px-4">Teléfono</th>
                  <th className="py-3 px-4">Dirección (Calle / Colonia)</th>
                  <th className="py-3 px-4">CP / Ciudad</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      {batchData
                        ? "No hay órdenes que coincidan con los filtros seleccionados."
                        : "No hay ningún lote cargado. Sube un archivo SCTASK para comenzar."}
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => {
                    const isError = order.status_semaphore === "ROJO";
                    const isWarning = order.status_semaphore === "AMARILLO";
                    const isGreen = order.status_semaphore === "VERDE";

                    return (
                      <tr
                        key={order.order_id}
                        className={`hover:bg-slate-800/40 transition-colors ${
                          isError ? "bg-rose-950/20" : isWarning ? "bg-amber-950/10" : ""
                        }`}
                      >
                        {/* Tipo de Envío */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {order.type === "RETURN" ? (
                            <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono text-[10px] font-bold">
                              RETORNO
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono text-[10px] font-bold">
                              ENTREGA
                            </span>
                          )}
                        </td>

                        {/* CustomerOrder / RITM */}
                        <td className="py-3 px-4 whitespace-nowrap font-mono font-bold text-slate-100">
                          {order.order_id}
                        </td>

                        {/* Semáforo de Calidad Postal */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {isGreen && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium text-[11px]">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                100% Confirmada
                              </span>
                            )}
                            {isWarning && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium text-[11px]">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Revisar Colonia
                              </span>
                            )}
                            {isError && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium text-[11px]">
                                <XCircle className="w-3.5 h-3.5" />
                                Error / Bloqueada
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Destinatario */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-semibold text-slate-200">{order.recipient_name}</div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[180px]">{order.email}</div>
                        </td>

                        {/* Teléfono */}
                        <td className="py-3 px-4 whitespace-nowrap font-mono">
                          {order.phone.includes("ERROR") || order.phone.length !== 10 ? (
                            <span className="text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30">
                              {order.phone || "FALTA"}
                            </span>
                          ) : (
                            <span className="text-slate-300">{order.phone}</span>
                          )}
                        </td>

                        {/* Dirección */}
                        <td className="py-3 px-4 max-w-xs">
                          <div className="text-slate-200 truncate font-mono text-[11px]">{order.address1}</div>
                          <div className="text-[11px] text-slate-400 truncate">{order.address2 || "—"}</div>
                        </td>

                        {/* Ubicación y CP */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-mono text-cyan-400 font-bold">CP {order.zip}</div>
                          <div className="text-[11px] text-slate-400">{order.city}, {order.state}</div>
                        </td>

                        {/* Botón de Corrección Rápida */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <button
                            onClick={() => handleOpenEdit(order)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-cyan-600 hover:text-white text-slate-300 border border-slate-700 hover:border-cyan-500 text-xs font-semibold transition"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Corregir</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* MODAL DE EDICIÓN EN CALIENTE (PATCH /api/batches/order/{pick_order}) */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Corregir Orden <span className="font-mono text-cyan-400">{editingOrder.order_id}</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Modifica los campos para re-evaluar con SEPOMEX y quitar el bloqueo en tiempo real.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingOrder(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePatch} className="p-6 space-y-4">
              {/* Teléfono */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Teléfono de Contacto (Exactamente 10 dígitos)
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-slate-950 border border-slate-700 font-mono text-white focus:outline-none focus:border-cyan-500"
                    placeholder="Ej. 5576682213"
                  />
                </div>
              </div>

              {/* Address 1 */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Calle y Número Exterior/Interior (Address 1, max 50 chars)
                </label>
                <input
                  type="text"
                  required
                  maxLength={50}
                  value={editFormData.address1}
                  onChange={(e) => setEditFormData({ ...editFormData, address1: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 border border-slate-700 font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Address 2 (Colonia) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Colonia / Asentamiento Oficial (Address 2, max 50 chars)
                </label>
                <input
                  type="text"
                  maxLength={50}
                  value={editFormData.address2}
                  onChange={(e) => setEditFormData({ ...editFormData, address2: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Fila CP, Ciudad, Estado */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Código Postal</label>
                  <input
                    type="text"
                    maxLength={5}
                    value={editFormData.zip}
                    onChange={(e) => setEditFormData({ ...editFormData, zip: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 border border-slate-700 font-mono text-cyan-400 font-bold focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Ciudad / Municipio</label>
                  <input
                    type="text"
                    value={editFormData.city}
                    onChange={(e) => setEditFormData({ ...editFormData, city: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Estado</label>
                  <input
                    type="text"
                    value={editFormData.state}
                    onChange={(e) => setEditFormData({ ...editFormData, state: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Checkbox Sincronizar con Par de Retorno */}
              {!editingOrder.order_id.endsWith("-1") && (
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="syncCounterpart"
                    checked={editFormData.sync_counterpart}
                    onChange={(e) => setEditFormData({ ...editFormData, sync_counterpart: e.target.checked })}
                    className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500 bg-slate-950 border-slate-700"
                  />
                  <label htmlFor="syncCounterpart" className="text-xs text-slate-300 cursor-pointer">
                    Sincronizar y corregir también su orden par de Retorno (
                    <span className="font-mono text-cyan-400">{editingOrder.order_id}-1</span>)
                  </label>
                </div>
              )}

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingOrder(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === "patch"}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold shadow-md transition"
                >
                  {actionLoading === "patch" ? "Guardando..." : "Guardar y Re-validar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE TIMBRADO REAL (--live) */}
      {showLiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-rose-500/50 rounded-2xl w-full max-w-md shadow-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">¿Confirmar Timbrado Oficial en Estafeta?</h3>
              <p className="text-xs text-slate-300 mt-2">
                Esta acción creará las guías reales con cargo en la cuenta de Estafeta REST en Techship. Las órdenes
                bloqueadas con <span className="text-rose-400 font-bold">ROJO</span> serán omitidas automáticamente para
                proteger la operación.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setShowLiveModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleTechshipProcess(false)}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 text-white text-xs font-bold shadow-lg shadow-rose-900/40 transition"
              >
                Sí, Timbrar Guías Reales
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE RESULTADOS DE SIMULACIÓN TECHSHIP */}
      {simResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">
                  Resultado de Evaluación en Techship ({simResults.dry_run ? "Simulación Segura" : "Timbrado Real"})
                </h3>
              </div>
              <button
                onClick={() => setSimResults(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {/* Tarjetas resumen */}
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-xs text-slate-400">Total en Lote</div>
                  <div className="text-xl font-bold font-mono text-white mt-1">
                    {simResults.summary.total}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-xs text-slate-400">Listas / Éxito</div>
                  <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                    {simResults.summary.success || simResults.summary.ready}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-xs text-slate-400">Anti-Duplicadas</div>
                  <div className="text-xl font-bold font-mono text-blue-400 mt-1">
                    {simResults.summary.duplicates}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-xs text-slate-400">Bloqueadas</div>
                  <div className="text-xl font-bold font-mono text-rose-400 mt-1">
                    {simResults.summary.blocked}
                  </div>
                </div>
              </div>

              {/* Lista detallada de órdenes */}
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <div className="bg-slate-950/80 px-4 py-2 text-xs font-semibold text-slate-400 uppercase">
                  Detalle por Orden
                </div>
                <div className="divide-y divide-slate-800/60 max-h-60 overflow-y-auto font-mono text-xs">
                  {simResults.details?.map((item: any, idx: number) => (
                    <div key={idx} className="p-3 flex items-center justify-between hover:bg-slate-800/30">
                      <div>
                        <span className="font-bold text-slate-200">{item.order}</span>
                        <span className="text-[11px] text-slate-400 ml-2">({item.type})</span>
                        <div className="text-[11px] text-slate-400 font-sans mt-0.5">{item.message}</div>
                      </div>
                      <div>
                        {item.status === "OK" || item.status === "LISTA" ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                            ACEPTADA
                          </span>
                        ) : item.status === "DUPLICADO" ? (
                          <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold">
                            YA EXISTE (ID {item.shipment_id})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-bold">
                            BLOQUEADA
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/40 flex justify-end">
              <button
                onClick={() => setSimResults(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
