"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import SplashScreen from "@/components/layout/SplashScreen";
import AnimatedLogo from "@/components/layout/AnimatedLogo";
import SupplyChainLoader from "@/components/layout/SupplyChainLoader";
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
  Edit3,
  ShieldAlert,
  Package,
  Phone,
  Check,
  X,
  Truck,
  ArrowUpDown,
  Building2,
  HelpCircle,
  AlertCircle,
  Archive,
  ArrowLeft,
  Boxes,
  Warehouse,
  Headphones,
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
  files_available?: {
    cierre_excel?: boolean;
    etiquetas_pdf?: boolean;
    techship_excel?: boolean;
    auditoria_excel?: boolean;
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

  // Estado para modal de edición en caliente
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
  const [archivePreview, setArchivePreview] = useState<any | null>(null);
  const [simResults, setSimResults] = useState<any | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  // Control de módulo activo: 'hub' (Portal Principal) | 'asset_management' (Automatizador KST)
  const [activeModule, setActiveModule] = useState<"hub" | "asset_management">("hub");
  const [logoError, setLogoError] = useState<boolean>(false);

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
      triggerToast(`Orden ${editingOrder.order_id} corregida y revalidada con SEPOMEX.`, "success");
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
      triggerToast(data.message || "Cierre y PDF de etiquetas sincronizados correctamente.", "success");
    } catch (err: any) {
      triggerToast(err.message || "Error en sincronización de cierre", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // Descarga directa de archivos operativos
  const handleDownload = (fileType: string) => {
    const url = `${API_BASE}/api/files/download/${fileType}`;
    window.open(url, "_blank");
  };

  // Archivar lote / limpiar tabla: llamada genérica (dryRun = solo vista previa)
  const callArchive = async (dryRun: boolean, cleanAll: boolean = true) => {
    const res = await fetch(`${API_BASE}/api/batches/archive-previous`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dry_run: dryRun, clean_all: cleanAll }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "No se pudo consultar el archivado");
    }
    return res.json();
  };

  // Paso 1: vista previa de lo que se va a archivar y limpiar
  const handleArchivePreview = async () => {
    try {
      setActionLoading("archive");
      const data = await callArchive(true, true);
      if (data.moved_count === 0) {
        triggerToast("No hay archivos cargados. La tabla ya está vacía y lista.", "info");
        return;
      }
      setArchivePreview(data);
    } catch (err: any) {
      triggerToast(err.message || "Error al consultar archivos", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // Paso 2: confirmar y mover los archivos a data/archive/ dejando la tabla limpia
  const handleArchiveConfirm = async () => {
    try {
      setActionLoading("archive");
      const data = await callArchive(false, true);
      setArchivePreview(null);
      setBatchData(null);
      setSearchTerm("");
      setActiveTab("ALL");
      setEditingOrder(null);

      if (data.skipped?.length) {
        triggerToast(
          `${data.moved_count} archivados. ${data.skipped.length} no se movieron (¿abiertos en Excel?).`,
          "error"
        );
      } else {
        triggerToast(`Tabla despejada. ${data.moved_count} archivo(s) resguardados en data/archive/`, "success");
      }

      await fetchHealthAndBatch();
    } catch (err: any) {
      triggerToast(err.message || "Error al limpiar la tabla", "error");
    } finally {
      setActionLoading(null);
    }
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
    <div className={`min-h-screen ${activeModule === "hub" ? "bg-slate-50" : "bg-white"} text-slate-800 flex flex-col font-sans relative overflow-x-hidden selection:bg-[#233762] selection:text-white`}>
      {/* Franja Superior Bicolor Institucional (Top Ribbon 6px) */}
      <div className="h-1.5 w-full flex relative z-50">
        <div className="w-1/2 bg-[#233762]" />
        <div className="w-1/2 bg-[#CE3A39]" />
      </div>

      {/* Pantalla de Bienvenida (Splash Screen) */}
      <SplashScreen ready={!loading} />

      {/* Cargador Universal con Logo Animado SupplyChain México (Sólo logo animado, sin textos) */}
      <SupplyChainLoader
        active={Boolean(uploading || actionLoading)}
      />

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border backdrop-blur-md transition-all ${
            toast.type === "success"
              ? "bg-emerald-50 border-emerald-300 text-emerald-800"
              : toast.type === "error"
              ? "bg-red-50 border-red-300 text-red-800"
              : "bg-blue-50 border-blue-300 text-blue-900"
          }`}
        >
          {toast.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
          {toast.type === "error" && <XCircle className="w-5 h-5 text-red-600" />}
          {toast.type === "info" && <AlertCircle className="w-5 h-5 text-[#233762]" />}
          <span className="text-sm font-semibold">{toast.message}</span>
        </div>
      )}

      {/* RENDER CONDICIONAL: PORTAL HUB (ESTILO EXTENSIV MINIMALISTA) O DASHBOARD DE ASSET MANAGEMENT */}
      {activeModule === "hub" ? (
        <div className="flex-1 min-h-[calc(100vh-6px)] flex flex-col items-center justify-center py-12 px-6">
          {/* LOGOTIPO OFICIAL CENTRADO ARRIBA */}
          <div className="flex flex-col items-center mb-10 sm:mb-14">
            {!logoError ? (
              <img
                src="/logo-supplychain.png"
                alt="SupplyChain México"
                className="h-28 sm:h-36 md:h-40 w-auto object-contain select-none transition-transform hover:scale-105 duration-300 drop-shadow-xs"
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className="flex flex-col items-center select-none">
                <div className="flex items-center gap-4">
                  <svg
                    viewBox="383 -66 380 380"
                    className="w-16 h-16 sm:w-20 sm:h-20 overflow-visible"
                    role="img"
                    aria-label="SupplyChain México"
                  >
                    <defs>
                      <clipPath id="sc-vector-clip">
                        <circle cx="584.5" cy="186.1" r="75" />
                      </clipPath>
                    </defs>
                    <g>
                      <path
                        fill="#233762"
                        d="M490.0 242.0C452.2 238.5 418.8 212.8 406.9 178.0C403.2 167.0 401.9 167.5 432.9 167.2L459.1 167.0L465.4 173.4C476.7 184.8 485.9 189.1 500.0 189.2C517.5 189.4 524.7 186.2 539.9 171.5C573.9 138.7 582.7 126.5 583.6 111.2C583.9 107.0 584.3 102.6 584.5 101.4C585.1 98.4 614.7 69.4 620.8 65.8C627.5 62.0 628.0 62.2 631.3 71.6C644.1 108.7 635.4 146.2 607.2 174.9C595.0 187.3 562.5 218.7 556.5 223.7C541.6 236.3 513.2 244.1 490.0 242.0ZM403.2 137.4L401.0 135.9L401.0 88.2C401.0 62.0 401.4 40.0 401.8 39.4C403.7 36.6 407.4 36.0 424.3 36.0C446.5 36.0 447.0 36.3 447.0 47.6C447.0 51.7 447.3 55.0 447.6 55.0C447.9 55.0 454.7 48.7 462.6 41.1C477.8 26.4 483.6 22.1 496.0 15.8C522.8 2.4 559.0 3.3 586.1 18.2C593.1 22.1 593.1 21.7 587.4 25.9C584.9 27.8 575.7 36.4 567.0 45.1L551.1 60.8L543.6 59.7C525.8 57.1 514.3 61.8 496.8 78.8C482.7 92.5 482.5 93.0 492.3 93.0C503.2 93.0 503.0 92.5 503.0 116.3C503.0 135.4 502.9 135.9 500.8 137.4C498.8 138.8 492.5 139.0 452.0 139.0C411.5 139.0 405.2 138.8 403.2 137.4Z"
                      />
                      <path
                        fill="#CE3A39"
                        d="M595.5 242.0C588.3 241.2 580.1 239.5 574.5 237.5C569.8 235.8 554.0 227.7 554.0 227.0C554.0 226.5 555.5 225.1 557.2 223.9C559.0 222.7 568.4 213.8 578.1 204.3C595.0 187.7 595.8 187.0 598.4 188.0C603.5 189.9 616.9 189.2 624.2 186.7C633.9 183.2 639.3 179.4 651.0 167.3L661.5 156.5L653.9 156.2C642.3 155.8 642.5 156.1 642.5 132.5C642.5 114.9 642.7 113.0 644.4 111.1C646.3 109.0 646.8 109.0 694.0 109.0L741.7 109.0L743.8 111.3C747.0 114.7 747.3 206.2 744.1 210.1C742.2 212.4 741.8 212.5 723.3 212.8C699.4 213.2 699.0 213.0 699.0 201.4C699.0 197.3 698.7 194.0 698.2 194.0C697.8 194.0 691.9 199.7 685.0 206.6C656.1 235.6 631.1 245.5 595.5 242.0ZM517.0 183.9C510.0 170.9 506.8 142.0 510.5 125.3C515.8 101.4 524.7 86.0 542.8 69.0C547.8 64.3 558.1 54.4 565.7 46.9C573.3 39.5 582.2 31.2 585.5 28.6C588.8 26.0 592.0 23.3 592.5 22.6C594.0 20.9 602.8 15.7 608.0 13.6C610.5 12.6 613.4 11.4 614.5 10.9C629.0 4.9 672.6 5.0 679.5 11.1C680.0 11.6 681.0 12.0 681.8 12.0C682.6 12.0 686.8 13.8 691.2 16.0C714.4 27.7 732.5 48.5 740.4 72.4C743.4 81.4 744.8 81.0 713.0 81.0L685.1 81.0L681.4 76.5C671.5 64.3 653.9 57.5 639.0 60.0C620.4 63.1 620.9 62.8 600.5 83.4C566.6 117.7 562.0 124.9 562.0 143.4L562.0 148.6L545.8 164.6C526.1 184.0 519.4 188.5 517.0 183.9Z"
                      />
                      <g clipPath="url(#sc-vector-clip)">
                        <path
                          fill="#233762"
                          d="M490.0 242.0C452.2 238.5 418.8 212.8 406.9 178.0C403.2 167.0 401.9 167.5 432.9 167.2L459.1 167.0L465.4 173.4C476.7 184.8 485.9 189.1 500.0 189.2C517.5 189.4 524.7 186.2 539.9 171.5C573.9 138.7 582.7 126.5 583.6 111.2C583.9 107.0 584.3 102.6 584.5 101.4C585.1 98.4 614.7 69.4 620.8 65.8C627.5 62.0 628.0 62.2 631.3 71.6C644.1 108.7 635.4 146.2 607.2 174.9C595.0 187.3 562.5 218.7 556.5 223.7C541.6 236.3 513.2 244.1 490.0 242.0ZM403.2 137.4L401.0 135.9L401.0 88.2C401.0 62.0 401.4 40.0 401.8 39.4C403.7 36.6 407.4 36.0 424.3 36.0C446.5 36.0 447.0 36.3 447.0 47.6C447.0 51.7 447.3 55.0 447.6 55.0C447.9 55.0 454.7 48.7 462.6 41.1C477.8 26.4 483.6 22.1 496.0 15.8C522.8 2.4 559.0 3.3 586.1 18.2C593.1 22.1 593.1 21.7 587.4 25.9C584.9 27.8 575.7 36.4 567.0 45.1L551.1 60.8L543.6 59.7C525.8 57.1 514.3 61.8 496.8 78.8C482.7 92.5 482.5 93.0 492.3 93.0C503.2 93.0 503.0 92.5 503.0 116.3C503.0 135.4 502.9 135.9 500.8 137.4C498.8 138.8 492.5 139.0 452.0 139.0C411.5 139.0 405.2 138.8 403.2 137.4Z"
                        />
                      </g>
                    </g>
                  </svg>
                  <div className="flex items-baseline font-extrabold italic text-4xl sm:text-5xl tracking-tight">
                    <span className="text-[#233762]">Supply</span>
                    <span className="text-[#CE3A39]">Chain</span>
                  </div>
                </div>
                <span className="text-xs sm:text-sm font-bold text-slate-500 tracking-[0.35em] mt-2">M É X I C O</span>
              </div>
            )}
          </div>

          {/* LAS 3 TARJETAS DE MÓDULOS (ESTILO TARJETA ELEVADA MINIMALISTA) */}
          <div className="flex flex-wrap justify-center gap-6 max-w-5xl w-full">
            {/* Tarjeta 1: Asset Management (Activo) */}
            <div
              onClick={() => setActiveModule("asset_management")}
              className="bg-white rounded-xl border border-slate-200/80 shadow-md hover:shadow-xl transition-all duration-300 p-8 w-72 flex flex-col items-center text-center cursor-pointer group relative overflow-hidden hover:-translate-y-1"
            >
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#233762] group-hover:bg-[#CE3A39] transition-colors duration-300" />
              <span className="absolute top-3.5 right-3.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Activo
              </span>
              <div className="w-16 h-16 rounded-2xl bg-[#EFF3F9] text-[#233762] flex items-center justify-center group-hover:scale-110 group-hover:bg-[#233762] group-hover:text-white transition-all duration-300 shadow-2xs">
                <Boxes className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-[#233762] mt-4">Asset Management</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Automatización de órdenes, validación SEPOMEX y guías Techship.
              </p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-[#233762] group-hover:text-[#CE3A39] transition-colors">
                <span>Ingresar</span>
                <span className="group-hover:translate-x-1 transition-transform duration-200">→</span>
              </span>
            </div>

            {/* Tarjeta 2: CSM (En desarrollo) */}
            <div
              onClick={() => triggerToast("Módulo CSM en construcción", "info")}
              className="bg-white rounded-xl border border-slate-200/80 shadow-md hover:shadow-xl transition-all duration-300 p-8 w-72 flex flex-col items-center text-center cursor-pointer group relative overflow-hidden hover:-translate-y-0.5"
            >
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-transparent group-hover:bg-[#233762]/30 transition-colors duration-300" />
              <span className="absolute top-3.5 right-3.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                Próximamente
              </span>
              <div className="w-16 h-16 rounded-2xl bg-[#EFF3F9] text-[#233762] flex items-center justify-center group-hover:scale-105 transition-all duration-300 shadow-2xs">
                <Headphones className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-[#233762] mt-4">CSM</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Gestión de atención a clientes, tickets de soporte y seguimiento.
              </p>
              <span className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                En desarrollo
              </span>
            </div>

            {/* Tarjeta 3: Almacén (En desarrollo) */}
            <div
              onClick={() => triggerToast("Módulo Almacén en construcción", "info")}
              className="bg-white rounded-xl border border-slate-200/80 shadow-md hover:shadow-xl transition-all duration-300 p-8 w-72 flex flex-col items-center text-center cursor-pointer group relative overflow-hidden hover:-translate-y-0.5"
            >
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-transparent group-hover:bg-[#CE3A39]/30 transition-colors duration-300" />
              <span className="absolute top-3.5 right-3.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                Próximamente
              </span>
              <div className="w-16 h-16 rounded-2xl bg-[#FDF2F2] text-[#CE3A39] flex items-center justify-center group-hover:scale-105 transition-all duration-300 shadow-2xs">
                <Warehouse className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-[#233762] mt-4">Almacén</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Control de inventario físico, cross-docking, picking y empaque.
              </p>
              <span className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                En desarrollo
              </span>
            </div>
          </div>

          {/* Pie de página sutil del Hub */}
          <p className="text-xs text-slate-400 mt-14 font-medium tracking-wide">
            SupplyChain México &bull; Plataforma Logística Integral
          </p>
        </div>
      ) : (
        /* VISTA DASHBOARD DE ASSET MANAGEMENT */
        <>
          {/* HEADER OFICIAL: SUPPLYCHAIN MÉXICO */}
          <header className="border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-xs sticky top-0 z-40">
            <div className="w-full max-w-[1850px] mx-auto px-6 lg:px-10 h-20 flex items-center justify-between">
              <div className="flex items-center gap-3 sm:gap-4">
                {/* Botón para regresar al Portal Hub */}
                <button
                  onClick={() => setActiveModule("hub")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-[#EFF3F9] hover:border-[#233762]/30 text-[#233762] text-xs font-bold transition shadow-2xs group"
                  title="Regresar al Portal Principal (Hub)"
                >
                  <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                  <span className="hidden sm:inline">Portal Hub</span>
                </button>

                <div className="h-6 w-px bg-slate-200" />

                {/* Logo Oficial Animado SupplyChain México */}
                <AnimatedLogo className="h-14 sm:h-16 w-auto" cycleDuration={8} />

                <div className="h-9 w-px bg-slate-200 hidden md:block" />

                {/* Título de la Aplicación */}
                <div className="hidden sm:flex items-center gap-2.5">
                  <h1 className="text-base font-extrabold text-[#233762] tracking-wide">
                    Automatizador de tareas
                  </h1>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#EFF3F9] text-[#233762] font-mono font-bold border border-[#233762]/20">
                    KST / Kyndryl
                  </span>
                </div>
              </div>
            </div>
          </header>

      {/* CONTENIDO PRINCIPAL (FULL-WIDTH HASTA 1850px) */}
      <main className="flex-1 w-full max-w-[1850px] mx-auto px-6 lg:px-10 py-5 space-y-6 relative z-10">
        {/* Barra debajo del encabezado: Estado del lote y Botón de Limpiar / Archivar */}
        <div className="flex items-center justify-between flex-wrap gap-3 pb-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Lote en proceso:</span>
            <span className="text-xs font-mono font-bold text-[#233762] px-2.5 py-1 rounded-lg bg-white border border-slate-200 shadow-2xs">
              {batchData?.batch_filename || "Sin lote activo"}
            </span>
          </div>

          <button
            onClick={handleArchivePreview}
            disabled={actionLoading === "archive"}
            title="Archivar el lote actual y limpiar la tabla (no borra nada, se resguarda en data/archive)"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-[#FDF2F2] text-[#CE3A39] border border-[#CE3A39]/30 text-xs font-bold transition disabled:opacity-50 shadow-2xs"
          >
            <Archive className="w-4 h-4" />
            <span>
              {actionLoading === "archive" ? "Limpiando..." : "Limpiar tabla / Archivar"}
            </span>
          </button>
        </div>

        {/* ZONA 1: Ingesta (4 col) y 4 Tarjetas KPI (2 col c/u = 8 col) -> 12 Columnas en Pantalla Ancha */}
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-5">
          {/* Dropzone de Ingesta (xl:col-span-4) */}
          <div className="md:col-span-2 xl:col-span-4 bg-white border-2 border-dashed border-slate-300 hover:border-[#233762] rounded-2xl p-5 flex flex-col justify-between shadow-sm transition-colors relative overflow-hidden group">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx,.xls"
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
              disabled={uploading}
            />
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-xl bg-[#EFF3F9] text-[#233762] border border-[#233762]/20 group-hover:scale-105 transition-transform">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#233762]">Ingestar Reporte ServiceNow</h3>
                <p className="text-xs text-slate-500 mt-0.5">Arrastra el archivo SCTASK_SHP_Combined_Report_MX_*.xlsx</p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-mono truncate max-w-[200px]" title={batchData?.batch_filename}>
                {batchData?.batch_filename ? batchData.batch_filename : "Sin archivo activo"}
              </span>
              <button
                type="button"
                className="px-3.5 py-1.5 rounded-lg bg-[#233762] hover:bg-[#1B2A4A] text-white font-semibold shadow-sm transition"
              >
                {uploading ? "Procesando..." : "Examinar..."}
              </button>
            </div>
          </div>

          {/* Tarjeta KPI 1: Total Órdenes (xl:col-span-2) */}
          <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-[#233762]" />
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-bold uppercase tracking-wider text-[#233762]">Total Órdenes</span>
              <Package className="w-4 h-4 text-[#233762]" />
            </div>
            <div className="mt-2">
              <span className="text-3xl font-extrabold text-[#233762] font-mono">
                {batchData?.metrics.total_orders || 0}
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">Ida y Retorno (-1)</p>
            </div>
          </div>

          {/* Tarjeta KPI 2: Confirmadas 100% (xl:col-span-2) */}
          <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-emerald-500" />
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Confirmadas</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-2">
              <span className="text-3xl font-extrabold text-emerald-600 font-mono">
                {batchData?.metrics.confirmed_100 || 0}
              </span>
              <p className="text-[11px] text-emerald-600/80 mt-0.5">Semáforo Verde</p>
            </div>
          </div>

          {/* Tarjeta KPI 3: Por Revisar (xl:col-span-2) */}
          <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-amber-500" />
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Por Revisar</span>
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="mt-2">
              <span className="text-3xl font-extrabold text-amber-600 font-mono">
                {batchData?.metrics.review || 0}
              </span>
              <p className="text-[11px] text-amber-700/80 mt-0.5">Semáforo Amarillo</p>
            </div>
          </div>

          {/* Tarjeta KPI 4: Bloqueadas por Error (xl:col-span-2) */}
          <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-[#CE3A39]" />
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-bold uppercase tracking-wider text-[#CE3A39]">Bloqueadas</span>
              <XCircle className="w-4 h-4 text-[#CE3A39]" />
            </div>
            <div className="mt-2">
              <span className="text-3xl font-extrabold text-[#CE3A39] font-mono">
                {batchData?.metrics.error_blocked || 0}
              </span>
              <p className="text-[11px] text-[#CE3A39]/80 mt-0.5">Teléfono / CP Inválido</p>
            </div>
          </div>
        </section>

        {/* ZONA 2: Barra Maestra de Acciones Techship y Descargas */}
        <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Botón 1: Simulación Segura */}
            <button
              onClick={() => handleTechshipProcess(true)}
              disabled={!batchData || actionLoading === "sim"}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#233762] hover:bg-[#1B2A4A] text-white text-sm font-semibold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>{actionLoading === "sim" ? "Simulando..." : "1. Simular en Techship (Dry-Run)"}</span>
            </button>

            {/* Botón 2: Timbrado Real en Estafeta */}
            <button
              onClick={() => setShowLiveModal(true)}
              disabled={!batchData || actionLoading === "live"}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#CE3A39] hover:bg-[#B02E2D] text-white text-sm font-bold shadow-md shadow-red-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Zap className="w-4 h-4 fill-white" />
              <span>{actionLoading === "live" ? "Timbrando..." : "2. Timbrar Guías Reales (--live)"}</span>
            </button>

            {/* Botón 3: Cierre y PDF de Etiquetas */}
            <button
              onClick={handleSyncClosing}
              disabled={!batchData || actionLoading === "sync"}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Truck className="w-4 h-4" />
              <span>{actionLoading === "sync" ? "Sincronizando..." : "3. Sincronizar Cierre y Etiquetas"}</span>
            </button>
          </div>

          {/* Grupo de Descarga Directa de Archivos */}
          {batchData ? (
            <div className="flex items-center gap-2 border-t sm:border-t-0 sm:border-l border-slate-200 pt-3 sm:pt-0 sm:pl-4">
              <span className="text-xs text-slate-500 font-bold mr-1 hidden md:inline">Descargar:</span>

              <button
                onClick={() => handleDownload("cierre_excel")}
                disabled={batchData.files_available?.cierre_excel === false}
                title={
                  batchData.files_available?.cierre_excel === false
                    ? "Disponible tras ejecutar '3. Sincronizar Cierre y Etiquetas'"
                    : "Descargar Cierre_*.xlsx (ServiceNow 12 columnas)"
                }
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EFF3F9] hover:bg-[#E2E8F0] text-[#233762] border border-[#233762]/30 text-xs font-mono font-bold transition shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Cierre.xlsx</span>
              </button>

              <button
                onClick={() => handleDownload("etiquetas_pdf")}
                disabled={batchData.files_available?.etiquetas_pdf === false}
                title={
                  batchData.files_available?.etiquetas_pdf === false
                    ? "Disponible tras ejecutar '3. Sincronizar Cierre y Etiquetas'"
                    : "Descargar o imprimir PDF consolidado de etiquetas"
                }
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FDF2F2] hover:bg-[#FEE2E2] text-[#CE3A39] border border-[#CE3A39]/30 text-xs font-mono font-bold transition shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Etiquetas.pdf</span>
              </button>

              <button
                onClick={() => handleDownload("techship_excel")}
                disabled={batchData.files_available?.techship_excel === false}
                title="Descargar Guias_Techship_Importada_*.xlsx (61 columnas)"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-mono font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Techship.xlsx</span>
              </button>

              <button
                onClick={() => handleDownload("auditoria_excel")}
                disabled={batchData.files_available?.auditoria_excel === false}
                title="Descargar Auditoria_Direcciones_*.xlsx con bitácora"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-mono font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Auditoría.xlsx</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 border-t sm:border-t-0 sm:border-l border-slate-200 pt-3 sm:pt-0 sm:pl-4 text-xs text-slate-400 italic">
              <FileSpreadsheet className="w-3.5 h-3.5 opacity-50" />
              <span>Sin archivos para descargar</span>
            </div>
          )}
        </section>

        {/* ZONA 3: Tabla de Órdenes y Auditoría */}
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
          {/* Barra de Filtros y Búsqueda */}
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50/80">
            {/* Pestañas de Filtro */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-200/70 text-xs font-bold">
              <button
                onClick={() => setActiveTab("ALL")}
                className={`px-3 py-1.5 rounded-lg transition ${
                  activeTab === "ALL" ? "bg-[#233762] text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Todas ({batchData?.orders.length || 0})
              </button>
              <button
                onClick={() => setActiveTab("ISSUES")}
                className={`px-3 py-1.5 rounded-lg transition ${
                  activeTab === "ISSUES" ? "bg-[#CE3A39] text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Solo Errores / Revisar (
                {(batchData?.metrics.error_blocked || 0) + (batchData?.metrics.review || 0)})
              </button>
              <button
                onClick={() => setActiveTab("CONFIRMED")}
                className={`px-3 py-1.5 rounded-lg transition ${
                  activeTab === "CONFIRMED" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Confirmadas ({batchData?.metrics.confirmed_100 || 0})
              </button>
              <button
                onClick={() => setActiveTab("OUTBOUND")}
                className={`px-3 py-1.5 rounded-lg transition hidden sm:inline ${
                  activeTab === "OUTBOUND" ? "bg-slate-700 text-white" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Solo Ida
              </button>
              <button
                onClick={() => setActiveTab("RETURN")}
                className={`px-3 py-1.5 rounded-lg transition hidden sm:inline ${
                  activeTab === "RETURN" ? "bg-slate-700 text-white" : "text-slate-600 hover:text-slate-900"
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
                placeholder="Buscar RITM, empleado, CP, teléfono..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-white border border-slate-300 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#233762] transition shadow-2xs"
              />
            </div>
          </div>

          {/* Tabla de Registros */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#233762] text-white font-semibold uppercase tracking-wider text-[11px]">
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
              <tbody className="divide-y divide-slate-200">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
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
                        className={`hover:bg-slate-50 transition-colors ${
                          isError ? "bg-red-50/50" : isWarning ? "bg-amber-50/30" : ""
                        }`}
                      >
                        {/* Tipo de Envío */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {order.type === "RETURN" ? (
                            <span className="px-2 py-0.5 rounded-md bg-[#FDF2F2] text-[#CE3A39] border border-[#CE3A39]/30 font-mono text-[10px] font-bold">
                              RETORNO
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-[#EFF3F9] text-[#233762] border border-[#233762]/30 font-mono text-[10px] font-bold">
                              ENTREGA
                            </span>
                          )}
                        </td>

                        {/* CustomerOrder / RITM */}
                        <td className="py-3 px-4 whitespace-nowrap font-mono font-bold text-[#233762]">
                          {order.order_id}
                        </td>

                        {/* Semáforo de Calidad Postal */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {isGreen && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[11px]">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                100% Confirmada
                              </span>
                            )}
                            {isWarning && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-bold text-[11px]">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Revisar Colonia
                              </span>
                            )}
                            {isError && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-bold text-[11px]">
                                <XCircle className="w-3.5 h-3.5" />
                                Error / Bloqueada
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Destinatario */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-bold text-slate-800">{order.recipient_name}</div>
                          <div className="text-[11px] text-slate-500 truncate max-w-[180px]">{order.email}</div>
                        </td>

                        {/* Teléfono */}
                        <td className="py-3 px-4 whitespace-nowrap font-mono">
                          {order.phone.includes("ERROR") || order.phone.length !== 10 ? (
                            <span className="text-red-700 font-bold bg-red-100 px-1.5 py-0.5 rounded border border-red-300">
                              {order.phone || "FALTA"}
                            </span>
                          ) : (
                            <span className="text-slate-700 font-semibold">{order.phone}</span>
                          )}
                        </td>

                        {/* Dirección */}
                        <td className="py-3 px-4 max-w-xs">
                          <div className="text-slate-800 font-mono text-[11px] truncate font-medium">
                            {order.address1}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">{order.address2 || "—"}</div>
                        </td>

                        {/* Ubicación y CP */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-mono text-[#233762] font-bold">CP {order.zip}</div>
                          <div className="text-[11px] text-slate-500">{order.city}, {order.state}</div>
                        </td>

                        {/* Botón de Corrección Rápida */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <button
                            onClick={() => handleOpenEdit(order)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white hover:bg-[#233762] hover:text-white text-[#233762] border border-[#233762]/30 text-xs font-bold transition shadow-2xs"
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

      {/* MODAL DE EDICIÓN EN CALIENTE */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#EFF3F9] text-[#233762]">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#233762] flex items-center gap-2">
                    Corregir Orden <span className="font-mono text-[#CE3A39]">{editingOrder.order_id}</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Modifica los campos para re-evaluar con SEPOMEX y quitar el bloqueo en tiempo real.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingOrder(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePatch} className="p-6 space-y-4">
              {/* Teléfono */}
              <div>
                <label className="block text-xs font-bold text-[#233762] mb-1">
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
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-slate-50 border border-slate-300 font-mono text-slate-900 focus:outline-none focus:border-[#233762]"
                    placeholder="Ej. 5576682213"
                  />
                </div>
              </div>

              {/* Address 1 */}
              <div>
                <label className="block text-xs font-bold text-[#233762] mb-1">
                  Calle y Número Exterior/Interior (Address 1, max 50 caracteres)
                </label>
                <input
                  type="text"
                  required
                  maxLength={50}
                  value={editFormData.address1}
                  onChange={(e) => setEditFormData({ ...editFormData, address1: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 border border-slate-300 font-mono text-slate-900 focus:outline-none focus:border-[#233762]"
                />
              </div>

              {/* Address 2 (Colonia) */}
              <div>
                <label className="block text-xs font-bold text-[#233762] mb-1">
                  Colonia / Asentamiento Oficial (Address 2, max 50 caracteres)
                </label>
                <input
                  type="text"
                  maxLength={50}
                  value={editFormData.address2}
                  onChange={(e) => setEditFormData({ ...editFormData, address2: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-[#233762]"
                />
              </div>

              {/* Fila CP, Ciudad, Estado */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#233762] mb-1">Código Postal</label>
                  <input
                    type="text"
                    maxLength={5}
                    value={editFormData.zip}
                    onChange={(e) => setEditFormData({ ...editFormData, zip: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 border border-slate-300 font-mono text-[#233762] font-bold focus:outline-none focus:border-[#233762]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#233762] mb-1">Ciudad / Municipio</label>
                  <input
                    type="text"
                    value={editFormData.city}
                    onChange={(e) => setEditFormData({ ...editFormData, city: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-[#233762]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#233762] mb-1">Estado</label>
                  <input
                    type="text"
                    value={editFormData.state}
                    onChange={(e) => setEditFormData({ ...editFormData, state: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-[#233762]"
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
                    className="w-4 h-4 rounded text-[#233762] focus:ring-[#233762] border-slate-300"
                  />
                  <label htmlFor="syncCounterpart" className="text-xs text-slate-700 cursor-pointer font-medium">
                    Sincronizar y corregir también su orden par de Retorno (
                    <span className="font-mono text-[#233762] font-bold">{editingOrder.order_id}-1</span>)
                  </label>
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingOrder(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === "patch"}
                  className="px-5 py-2 rounded-xl bg-[#233762] hover:bg-[#1B2A4A] text-white text-sm font-bold shadow-sm transition"
                >
                  {actionLoading === "patch" ? "Guardando..." : "Guardar y Revalidar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN: LIMPIAR TABLA Y ARCHIVAR LOTE */}
      {archivePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#FDF2F2] text-[#CE3A39]">
                <Archive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[#233762]">Limpiar tabla y archivar lote</h3>
                <p className="text-xs text-slate-500">
                  Se resguardarán <span className="font-bold font-mono">{archivePreview.moved_count}</span> archivos
                  activos en el archivo histórico y la tabla quedará en blanco.
                </p>
              </div>
            </div>

            <div className="p-6 space-y-3 overflow-y-auto">
              <div className="rounded-xl bg-[#EFF3F9] border border-[#233762]/20 p-3 text-xs text-[#233762]">
                <strong>Cero pérdida de datos:</strong> Ningún archivo se borra. Todo se organiza por fecha en{" "}
                <span className="font-mono font-bold">data/archive/AAAA-MM-DD/</span>. Tu tabla quedará en blanco lista
                para recibir el nuevo reporte de ServiceNow de hoy.
              </div>

              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-60 overflow-y-auto">
                {archivePreview.moved?.map((f: any, idx: number) => (
                  <div key={idx} className="px-3 py-2 flex items-center justify-between gap-3 text-xs">
                    <span className="font-mono text-slate-700 truncate" title={f.file}>
                      {f.file}
                    </span>
                    <span className="font-mono text-slate-400 whitespace-nowrap">{f.date}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => setArchivePreview(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleArchiveConfirm}
                disabled={actionLoading === "archive"}
                className="px-5 py-2 rounded-xl bg-[#CE3A39] hover:bg-[#B02E2D] text-white text-xs font-bold shadow-sm transition disabled:opacity-50"
              >
                {actionLoading === "archive" ? "Limpiando tabla..." : "Sí, limpiar tabla y archivar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE TIMBRADO REAL (--live) */}
      {showLiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 border border-red-200 text-[#CE3A39] flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900">¿Confirmar Generación Oficial de Guías?</h3>
              <p className="text-xs text-slate-600 mt-2">
                Esta acción creará las guías reales oficiales de envío. Las órdenes
                bloqueadas con <span className="text-[#CE3A39] font-bold">ROJO</span> serán omitidas automáticamente para
                proteger la operación.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setShowLiveModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleTechshipProcess(false)}
                className="px-5 py-2 rounded-xl bg-[#CE3A39] hover:bg-[#B02E2D] text-white text-xs font-bold shadow-md shadow-red-200 transition"
              >
                Sí, Timbrar Guías Reales
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE RESULTADOS DE SIMULACIÓN TECHSHIP */}
      {simResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#233762]" />
                <h3 className="text-base font-bold text-[#233762]">
                  Resultado de Evaluación en Techship ({simResults.dry_run ? "Simulación Segura" : "Timbrado Real"})
                </h3>
              </div>
              <button
                onClick={() => setSimResults(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {/* Tarjetas resumen */}
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs text-slate-500 font-medium">Total en Lote</div>
                  <div className="text-xl font-bold font-mono text-slate-900 mt-1">
                    {simResults.summary.total}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="text-xs text-emerald-700 font-medium">Listas / Éxito</div>
                  <div className="text-xl font-bold font-mono text-emerald-700 mt-1">
                    {simResults.summary.success || simResults.summary.ready}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#EFF3F9] border border-[#233762]/20">
                  <div className="text-xs text-[#233762] font-medium">Anti-Duplicadas</div>
                  <div className="text-xl font-bold font-mono text-[#233762] mt-1">
                    {simResults.summary.duplicates}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                  <div className="text-xs text-[#CE3A39] font-medium">Bloqueadas</div>
                  <div className="text-xl font-bold font-mono text-[#CE3A39] mt-1">
                    {simResults.summary.blocked}
                  </div>
                </div>
              </div>

              {/* Lista detallada de órdenes */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-[#233762] px-4 py-2 text-xs font-semibold text-white uppercase">
                  Detalle por Orden
                </div>
                <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto font-mono text-xs">
                  {simResults.details?.map((item: any, idx: number) => (
                    <div key={idx} className="p-3 flex items-center justify-between hover:bg-slate-50">
                      <div>
                        <span className="font-bold text-[#233762]">{item.order}</span>
                        <span className="text-[11px] text-slate-500 ml-2">({item.type})</span>
                        <div className="text-[11px] text-slate-600 font-sans mt-0.5">{item.message}</div>
                      </div>
                      <div>
                        {item.status === "OK" || item.status === "LISTA" ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                            ACEPTADA
                          </span>
                        ) : item.status === "DUPLICADO" ? (
                          <span className="px-2 py-0.5 rounded bg-[#EFF3F9] text-[#233762] font-bold text-[10px]">
                            YA EXISTE (ID {item.shipment_id})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-red-100 text-[#CE3A39] font-bold text-[10px]">
                            BLOQUEADA
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSimResults(null)}
                className="px-4 py-1.5 rounded-xl bg-[#233762] text-white text-xs font-bold transition hover:bg-[#1B2A4A]"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
