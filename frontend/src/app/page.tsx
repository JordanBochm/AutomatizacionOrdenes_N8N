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
  Warehouse,
  Eye,
  EyeOff,
  Home,
  Laptop,
  Headset,
  User,
  LogOut,
  Lock,
  ShieldCheck,
  Users,
  Plus,
  Trash2,
  Menu,
} from "lucide-react";

// ==============================================================================
// GALERÍA FOTOGRÁFICA DE LOGÍSTICA PARA LOGIN (Fácilmente Personalizable)
// ==============================================================================
const LOGISTICS_IMAGES = [
  "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=1920&q=85",
  "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=1920&q=85",
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ==============================================================================
// 1. SISTEMA RBAC (ROLES, USUARIOS Y PERMISOS 100% FRONTEND)
// ==============================================================================
export type UserRole = "ADMIN" | "ASSET_MANAGER" | "CSM" | "ALMACEN";

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  password?: string;
  isActive: boolean;
  createdAt: string;
}

export interface CurrentUser {
  name: string;
  email: string;
  role: UserRole;
}

export interface RolePermissions {
  canUpload: boolean;
  canEditRows: boolean;
  canProcessLive: boolean;
  canSyncClosing: boolean;
  canArchive: boolean;
  allowedDownloads: {
    cierre_excel: boolean;
    etiquetas_pdf: boolean;
    techship_excel: boolean;
    auditoria_excel: boolean;
  };
}

export interface RoleConfig {
  code: UserRole;
  label: string;
  roleBadge: string;
  subtitle: string;
  description: string;
  sidebarModules: string[];
  permissions: RolePermissions;
}

export const ROLES_CONFIG: Record<UserRole, RoleConfig> = {
  ADMIN: {
    code: "ADMIN",
    label: "Administrador General",
    roleBadge: "ADMINISTRADOR GENERAL",
    subtitle: "Control Total y Administración de Usuarios",
    description: "Control total de la plataforma (subida, edición de filas, simulación, timbrado --live, sincronización, archivo y descargas globales).",
    sidebarModules: ["home", "asset_management", "csm", "almacen", "profile", "users", "roles"],
    permissions: {
      canUpload: true,
      canEditRows: true,
      canProcessLive: true,
      canSyncClosing: true,
      canArchive: true,
      allowedDownloads: {
        cierre_excel: true,
        etiquetas_pdf: true,
        techship_excel: true,
        auditoria_excel: true,
      },
    },
  },
  ASSET_MANAGER: {
    code: "ASSET_MANAGER",
    label: "Ejecutivo Asset Management KST",
    roleBadge: "EJECUTIVO ASSET MANAGEMENT KST",
    subtitle: "Operación Completa de Órdenes y Timbrado",
    description: "Control operativo completo sobre órdenes, corrección SEPOMEX y timbrado Techship. Sin acceso a gestión de usuarios ni matriz de roles.",
    sidebarModules: ["home", "asset_management", "profile"],
    permissions: {
      canUpload: true,
      canEditRows: true,
      canProcessLive: true,
      canSyncClosing: true,
      canArchive: true,
      allowedDownloads: {
        cierre_excel: true,
        etiquetas_pdf: true,
        techship_excel: true,
        auditoria_excel: true,
      },
    },
  },
  CSM: {
    code: "CSM",
    label: "Customer Service (CSM)",
    roleBadge: "CUSTOMER SERVICE (CSM)",
    subtitle: "Modo Consulta y Auditoría de Cierre",
    description: "Solo lectura de tabla/KPIs y descarga de reportes Cierre.xlsx y Auditoría.xlsx. Bloqueo de subida, edición, timbrado y limpieza.",
    sidebarModules: ["home", "csm", "asset_management", "profile"],
    permissions: {
      canUpload: false,
      canEditRows: false,
      canProcessLive: false,
      canSyncClosing: false,
      canArchive: false,
      allowedDownloads: {
        cierre_excel: true,
        etiquetas_pdf: false,
        techship_excel: false,
        auditoria_excel: true,
      },
    },
  },
  ALMACEN: {
    code: "ALMACEN",
    label: "Operador Almacén Lerma",
    roleBadge: "OPERADOR ALMACÉN LERMA",
    subtitle: "Modo Impresión de Etiquetas y Despacho",
    description: "Solo lectura de tabla/KPIs y descarga exclusiva de Etiquetas.pdf para preparación física y embarque. Bloqueo de subida, edición, timbrado y limpieza.",
    sidebarModules: ["home", "almacen", "asset_management", "profile"],
    permissions: {
      canUpload: false,
      canEditRows: false,
      canProcessLive: false,
      canSyncClosing: false,
      canArchive: false,
      allowedDownloads: {
        cierre_excel: false,
        etiquetas_pdf: true,
        techship_excel: false,
        auditoria_excel: false,
      },
    },
  },
};

export const DEFAULT_USERS: UserAccount[] = [
  {
    id: "usr-1",
    name: "Jordi Bochm",
    email: "Jordi.Bochm@sekologistics.com",
    role: "ADMIN",
    password: "••••••••••••",
    isActive: true,
    createdAt: "2026-01-15",
  },
  {
    id: "usr-2",
    name: "Marian Gonzalez",
    email: "Marian.Gonzalez@sekologistics.com",
    role: "ADMIN",
    password: "••••••••••••",
    isActive: true,
    createdAt: "2026-01-15",
  },
  {
    id: "usr-3",
    name: "Ejecutivo Asset KST",
    email: "kst.asset@sekologistics.com",
    role: "ASSET_MANAGER",
    password: "••••••••••••",
    isActive: true,
    createdAt: "2026-02-01",
  },
  {
    id: "usr-4",
    name: "Ejecutivo CSM",
    email: "csm.mx@sekologistics.com",
    role: "CSM",
    password: "••••••••••••",
    isActive: true,
    createdAt: "2026-02-10",
  },
  {
    id: "usr-5",
    name: "Operador Almacén",
    email: "almacen.lerma@sekologistics.com",
    role: "ALMACEN",
    password: "••••••••••••",
    isActive: true,
    createdAt: "2026-03-01",
  },
];

const USERS_STORAGE_KEY = "sc_users_db";
const CURRENT_USER_STORAGE_KEY = "sc_current_user";

function loadUsersFromStorage(): UserAccount[] {
  if (typeof window === "undefined") return DEFAULT_USERS;
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
      return DEFAULT_USERS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
    return DEFAULT_USERS;
  } catch {
    return DEFAULT_USERS;
  }
}

function saveUsersToStorage(users: UserAccount[]) {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    } catch (e) {
      console.error("Error al guardar usuarios en localStorage:", e);
    }
  }
}

function loadCurrentUserFromSession(): CurrentUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CURRENT_USER_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}
  return null;
}

// ==============================================================================
// 2. MODELOS DE DATOS DE ÓRDENES Y LOTES
// ==============================================================================
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

// Cuentas Demo para el Selector Rápido del Login
const DEMO_ACCOUNTS = [
  { label: "Admin", email: "Jordi.Bochm@sekologistics.com", role: "ADMIN" as UserRole },
  { label: "Asset Mgr", email: "kst.asset@sekologistics.com", role: "ASSET_MANAGER" as UserRole },
  { label: "CSM", email: "csm.mx@sekologistics.com", role: "CSM" as UserRole },
  { label: "Almacén", email: "almacen.lerma@sekologistics.com", role: "ALMACEN" as UserRole },
];

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

  // Modales de Techship y Archivo
  const [showLiveModal, setShowLiveModal] = useState<boolean>(false);
  const [archivePreview, setArchivePreview] = useState<any | null>(null);
  const [simResults, setSimResults] = useState<any | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Vista activa:
  // 'login' | 'home' | 'asset_management' | 'csm' | 'almacen' | 'profile' | 'users' | 'roles'
  const [activeModule, setActiveModule] = useState<
    "login" | "home" | "asset_management" | "csm" | "almacen" | "profile" | "users" | "roles"
  >("login");

  // Estado de Autenticación y RBAC
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [usersList, setUsersList] = useState<UserAccount[]>(DEFAULT_USERS);
  const [userEmail, setUserEmail] = useState<string>("Jordi.Bochm@sekologistics.com");
  const [loginPassword, setLoginPassword] = useState<string>("••••••••••••");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const [logoError, setLogoError] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Modal para Crear Nuevo Usuario (ADMIN)
  const [showNewUserModal, setShowNewUserModal] = useState<boolean>(false);
  const [newUserForm, setNewUserForm] = useState<{
    name: string;
    email: string;
    role: UserRole;
    password: string;
    isActive: boolean;
  }>({
    name: "",
    email: "",
    role: "ASSET_MANAGER",
    password: "••••••••••••",
    isActive: true,
  });

  // Hora y fecha local del navegador para el saludo (se actualiza de forma segura en useEffect)
  const [currentHour, setCurrentHour] = useState<number>(12);
  const [todayLabel, setTodayLabel] = useState<string>("");

  useEffect(() => {
    const updateNow = () => {
      const now = new Date();
      setCurrentHour(now.getHours());
      const label = now.toLocaleDateString("es-MX", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      setTodayLabel(label.charAt(0).toUpperCase() + label.slice(1));
    };
    updateNow();
    const timer = setInterval(updateNow, 60000);
    return () => clearInterval(timer);
  }, []);

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

  // 1. Inicialización en el cliente: Cargar usuarios de localStorage y sesión de sessionStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const loadedUsers = loadUsersFromStorage();
      setUsersList(loadedUsers);

      const savedSession = loadCurrentUserFromSession();
      if (savedSession) {
        // Sincronizar currentUser con la lista por si hubo cambios de rol o estado
        const matched = loadedUsers.find(
          (u) => u.email.toLowerCase() === savedSession.email.toLowerCase()
        );
        if (matched && matched.isActive) {
          const syncedUser: CurrentUser = {
            name: matched.name,
            email: matched.email,
            role: matched.role,
          };
          setCurrentUser(syncedUser);
          setUserEmail(matched.email);
          sessionStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(syncedUser));
          setActiveModule("home");
        } else if (matched && !matched.isActive) {
          sessionStorage.removeItem(CURRENT_USER_STORAGE_KEY);
          sessionStorage.removeItem("sc_user_email");
          setActiveModule("login");
          triggerToast("Tu usuario ha sido desactivado. Contacta al Administrador.", "error");
        } else {
          setCurrentUser(savedSession);
          setUserEmail(savedSession.email);
          setActiveModule("home");
        }
      } else {
        setActiveModule("login");
      }
    }
    fetchHealthAndBatch();
  }, []);

  // 2. Rotación automática de imágenes del carrusel de login cada 8 segundos
  useEffect(() => {
    if (activeModule !== "login") return;
    const timer = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % LOGISTICS_IMAGES.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [activeModule]);

  // Manejador del Selector Rápido de Cuentas Demo
  const handleSelectDemoAccount = (demo: (typeof DEMO_ACCOUNTS)[number]) => {
    setUserEmail(demo.email);
    setLoginPassword("Seko2026*");
    triggerToast(`Cuenta ${demo.label} lista: ${demo.email}`, "info");
  };

  // Iniciar sesión con validación de usuarios y auto-asignación Seko
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = userEmail.trim();
    if (!cleanEmail) {
      triggerToast("Por favor ingresa un correo electrónico válido.", "error");
      return;
    }

    // Buscar si el usuario existe en el catálogo de localStorage
    const foundUser = usersList.find(
      (u) => u.email.toLowerCase() === cleanEmail.toLowerCase()
    );

    if (foundUser) {
      if (!foundUser.isActive) {
        triggerToast("Usuario inactivo. Contacta a un Administrador para habilitar tu cuenta.", "error");
        return;
      }
      const userSession: CurrentUser = {
        name: foundUser.name,
        email: foundUser.email,
        role: foundUser.role,
      };
      setCurrentUser(userSession);
      if (typeof window !== "undefined") {
        sessionStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(userSession));
        sessionStorage.setItem("sc_user_email", userSession.email);
      }
      setActiveModule("home");
      triggerToast(`¡Bienvenido, ${userSession.name}!`, "success");
      return;
    }

    // Si no está registrado en el catálogo pero es correo de Seko Logistics
    if (cleanEmail.toLowerCase().endsWith("@sekologistics.com")) {
      const nameParts = (cleanEmail.split("@")[0] || "")
        .split(/[._-]+/)
        .filter(Boolean)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
      const formattedName = nameParts.join(" ") || "Usuario Seko";

      const autoUser: UserAccount = {
        id: `usr-${Date.now()}`,
        name: formattedName,
        email: cleanEmail,
        role: "ASSET_MANAGER",
        password: "••••••••••••",
        isActive: true,
        createdAt: new Date().toISOString().split("T")[0],
      };

      const updated = [...usersList, autoUser];
      setUsersList(updated);
      saveUsersToStorage(updated);

      const userSession: CurrentUser = {
        name: autoUser.name,
        email: autoUser.email,
        role: autoUser.role,
      };
      setCurrentUser(userSession);
      if (typeof window !== "undefined") {
        sessionStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(userSession));
        sessionStorage.setItem("sc_user_email", userSession.email);
      }
      setActiveModule("home");
      triggerToast(`Cuenta corporativa creada e iniciada como ${autoUser.name} (Asset Management)`, "success");
      return;
    }

    triggerToast("Acceso restringido: Solo se permiten correos @sekologistics.com", "error");
  };

  // Cerrar sesión
  const handleLogout = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(CURRENT_USER_STORAGE_KEY);
      sessionStorage.removeItem("sc_user_email");
    }
    setCurrentUser(null);
    setActiveModule("login");
    setMobileMenuOpen(false);
    triggerToast("Sesión cerrada correctamente.", "info");
  };

  // ==============================================================================
  // OPERACIONES CRUD DE USUARIOS (VISTA USERS PARA ADMIN)
  // ==============================================================================
  const handleChangeUserRole = (userId: string, newRole: UserRole) => {
    const updated = usersList.map((u) => {
      if (u.id === userId) {
        return { ...u, role: newRole };
      }
      return u;
    });
    setUsersList(updated);
    saveUsersToStorage(updated);

    // Si el usuario modificado es el actual en sesión, actualizar sesión
    if (currentUser) {
      const self = updated.find((u) => u.id === userId);
      if (self && self.email.toLowerCase() === currentUser.email.toLowerCase()) {
        const synced = { ...currentUser, role: newRole };
        setCurrentUser(synced);
        sessionStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(synced));
      }
    }
    triggerToast(`Rol actualizado a ${ROLES_CONFIG[newRole].label}`, "success");
  };

  const handleToggleUserActive = (userId: string) => {
    const targetUser = usersList.find((u) => u.id === userId);
    if (!targetUser) return;

    if (currentUser && targetUser.email.toLowerCase() === currentUser.email.toLowerCase()) {
      triggerToast("No puedes desactivar tu propia cuenta mientras estás en sesión.", "error");
      return;
    }

    const nextState = !targetUser.isActive;
    const updated = usersList.map((u) => {
      if (u.id === userId) {
        return { ...u, isActive: nextState };
      }
      return u;
    });
    setUsersList(updated);
    saveUsersToStorage(updated);
    triggerToast(
      `Usuario ${targetUser.name} ${nextState ? "activado" : "desactivado"} correctamente.`,
      nextState ? "success" : "info"
    );
  };

  const handleDeleteUser = (userId: string) => {
    const targetUser = usersList.find((u) => u.id === userId);
    if (!targetUser) return;

    if (currentUser && targetUser.email.toLowerCase() === currentUser.email.toLowerCase()) {
      triggerToast("No puedes eliminar tu propia cuenta en sesión.", "error");
      return;
    }

    if (!window.confirm(`¿Estás seguro de que deseas eliminar a ${targetUser.name} (${targetUser.email})?`)) {
      return;
    }

    const updated = usersList.filter((u) => u.id !== userId);
    setUsersList(updated);
    saveUsersToStorage(updated);
    triggerToast(`Usuario ${targetUser.name} eliminado de la base local.`, "info");
  };

  const handleCreateNewUser = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = newUserForm.email.trim();
    const cleanName = newUserForm.name.trim();

    if (!cleanName || !cleanEmail) {
      triggerToast("Nombre y correo son campos obligatorios.", "error");
      return;
    }

    if (!cleanEmail.toLowerCase().endsWith("@sekologistics.com")) {
      triggerToast("El correo debe pertenecer al dominio @sekologistics.com", "error");
      return;
    }

    const exists = usersList.some(
      (u) => u.email.toLowerCase() === cleanEmail.toLowerCase()
    );
    if (exists) {
      triggerToast("Ya existe un usuario registrado con ese correo electrónico.", "error");
      return;
    }

    const created: UserAccount = {
      id: `usr-${Date.now()}`,
      name: cleanName,
      email: cleanEmail,
      role: newUserForm.role,
      password: newUserForm.password || "••••••••••••",
      isActive: newUserForm.isActive,
      createdAt: new Date().toISOString().split("T")[0],
    };

    const updated = [...usersList, created];
    setUsersList(updated);
    saveUsersToStorage(updated);

    setShowNewUserModal(false);
    setNewUserForm({
      name: "",
      email: "",
      role: "ASSET_MANAGER",
      password: "••••••••••••",
      isActive: true,
    });
    triggerToast(`Usuario ${created.name} creado exitosamente como ${ROLES_CONFIG[created.role].label}.`, "success");
  };

  // ==============================================================================
  // OPERACIONES DE ASSET MANAGEMENT (LOTE, TIMBRADO, ARCHIVO, DESCARGAS)
  // ==============================================================================
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

  // Ejecutar timbrado oficial en Techship
  const handleTechshipProcess = async () => {
    try {
      setActionLoading("live");
      const res = await fetch(`${API_BASE}/api/techship/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: false }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Error al conectar con Techship");
      }

      const data = await res.json();
      setSimResults(data);
      setShowLiveModal(false);
      triggerToast("Timbrado oficial completado en Techship.", "success");
      fetchHealthAndBatch();
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

  // Archivar lote / limpiar tabla: llamada genérica
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

  // Paso 2: confirmar y mover los archivos a data/archive/
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
      if (activeTab === "ISSUES" && order.status_semaphore === "VERDE") return false;
      if (activeTab === "CONFIRMED" && order.status_semaphore !== "VERDE") return false;
      if (activeTab === "OUTBOUND" && order.type !== "OUTBOUND") return false;
      if (activeTab === "RETURN" && order.type !== "RETURN") return false;

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

  const hasOrders = Boolean(batchData?.orders && batchData.orders.length > 0);
  const outboundCount = useMemo(
    () => (batchData?.orders ? batchData.orders.filter((o) => o.type === "OUTBOUND").length : 0),
    [batchData?.orders]
  );
  const returnCount = useMemo(
    () => (batchData?.orders ? batchData.orders.filter((o) => o.type === "RETURN").length : 0),
    [batchData?.orders]
  );

  // Saludo dinámico según la hora local y nombre completo
  const greeting =
    currentHour >= 5 && currentHour < 12
      ? "Buenos días"
      : currentHour >= 12 && currentHour < 19
      ? "Buenas tardes"
      : "Buenas noches";

  const activeRole: UserRole = currentUser?.role || "ASSET_MANAGER";
  const roleConfig = ROLES_CONFIG[activeRole] || ROLES_CONFIG.ASSET_MANAGER;
  const permissions = roleConfig.permissions;
  const isRestrictedRole = activeRole === "CSM" || activeRole === "ALMACEN";

  // Iniciales para el avatar del usuario
  const userInitials = useMemo(() => {
    const name = currentUser?.name || "Seko User";
    const parts = name.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return (name[0] || "U").toUpperCase();
  }, [currentUser?.name]);

  // Items visibles en el Sidebar según el Rol del usuario
  const sidebarItems = useMemo(() => {
    const list: {
      id: "home" | "asset_management" | "csm" | "almacen" | "profile" | "users" | "roles";
      label: string;
      subLabel?: string;
      icon: React.ElementType;
    }[] = [];

    // 1. Home (Todos)
    list.push({ id: "home", label: "Home", icon: Home });

    // 2. Asset Management (Etiqueta adaptada según perfil)
    if (activeRole === "CSM") {
      list.push({ id: "asset_management", label: "Asset Management", subLabel: "Consulta", icon: Zap });
    } else if (activeRole === "ALMACEN") {
      list.push({ id: "asset_management", label: "Asset Management", subLabel: "Impresión", icon: Zap });
    } else {
      list.push({ id: "asset_management", label: "Asset Management", icon: Zap });
    }

    // 3. CSM (Visible para ADMIN y CSM)
    if (roleConfig.sidebarModules.includes("csm")) {
      list.push({ id: "csm", label: "CSM", icon: Headset });
    }

    // 4. Almacén (Visible para ADMIN y ALMACEN)
    if (roleConfig.sidebarModules.includes("almacen")) {
      list.push({ id: "almacen", label: "Almacén", icon: Warehouse });
    }

    // 5. Perfil (Todos)
    list.push({ id: "profile", label: "Perfil", icon: User });

    // 6. Users y Roles (Exclusivos para ADMIN)
    if (activeRole === "ADMIN") {
      list.push({ id: "users", label: "Usuarios", icon: Users });
      list.push({ id: "roles", label: "Roles y Permisos", icon: ShieldCheck });
    }

    return list;
  }, [activeRole, roleConfig.sidebarModules]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans relative overflow-x-hidden selection:bg-[#233762] selection:text-white">
      {/* Franja Superior Bicolor Institucional (Top Ribbon 6px) */}
      <div className="h-1.5 w-full flex relative z-50">
        <div className="w-1/2 bg-[#233762]" />
        <div className="w-1/2 bg-[#CE3A39]" />
      </div>

      {/* Pantalla de Bienvenida (Splash Screen) */}
      <SplashScreen ready={!loading} />

      {/* Cargador Universal con Logo Animado SupplyChain México */}
      <SupplyChainLoader active={Boolean(uploading || actionLoading)} />

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

      {/* ==================================================================== */}
      {/* RENDER CONDICIONAL: VISTA DE LOGIN O APLICACIÓN PRINCIPAL AUTENTICADA */}
      {/* ==================================================================== */}
      {activeModule === "login" ? (
        <div className="flex-1 min-h-[calc(100vh-6px)] w-full flex flex-col lg:flex-row bg-white">
          {/* COLUMNA IZQUIERDA: Formulario Minimalista Extensiv Style */}
          <div className="w-full lg:w-[480px] xl:w-[540px] min-h-[calc(100vh-6px)] bg-white flex flex-col justify-between p-8 sm:p-10 lg:p-12 shrink-0 z-10 shadow-xl">
            {/* 1. Logotipo Oficial Centrado */}
            <div className="flex justify-center items-center pt-2 select-none">
              {!logoError ? (
                <img
                  src="/logo-supplychain.png"
                  alt="SupplyChain México"
                  className="h-20 sm:h-24 md:h-28 w-auto object-contain transition-transform hover:scale-105 duration-300 drop-shadow-xs"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <AnimatedLogo className="h-20 sm:h-24 md:h-28 w-auto" cycleDuration={8} />
              )}
            </div>

            {/* 2. Bloque Central del Formulario */}
            <div className="max-w-sm w-full mx-auto my-auto py-6">
              <h2 className="text-2xl font-bold text-[#233762] mb-1">Iniciar sesión</h2>
              <p className="text-xs text-slate-500 mb-6">
                Ingresa con tu cuenta corporativa @sekologistics.com
              </p>

              <form onSubmit={handleLoginSubmit} className="space-y-5">
                {/* Campo Email */}
                <div className="relative border border-slate-300 rounded-md px-3.5 py-3 focus-within:border-[#233762] focus-within:ring-1 focus-within:ring-[#233762] transition-all bg-white">
                  <label className="absolute -top-2.5 left-3 bg-white px-1 text-xs font-medium text-slate-500 pointer-events-none">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder="nombre@sekologistics.com"
                    className="w-full text-sm text-slate-800 placeholder-slate-400 bg-transparent outline-none"
                  />
                </div>

                {/* Campo Password */}
                <div className="relative border border-slate-300 rounded-md px-3.5 py-3 focus-within:border-[#233762] focus-within:ring-1 focus-within:ring-[#233762] transition-all bg-white flex items-center justify-between">
                  <label className="absolute -top-2.5 left-3 bg-white px-1 text-xs font-medium text-slate-500 pointer-events-none">
                    Password
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full text-sm text-slate-800 placeholder-slate-400 bg-transparent outline-none pr-2"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-slate-400 hover:text-slate-600 focus:outline-none p-0.5 transition-colors"
                    tabIndex={-1}
                    title={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Botón Principal LOGIN */}
                <button
                  type="submit"
                  className="w-full py-3 mt-4 rounded-md font-bold text-sm tracking-wider uppercase text-white shadow-md bg-[#CE3A39] hover:bg-[#B02E2D] active:scale-[0.99] transition-all duration-200 cursor-pointer"
                >
                  LOGIN
                </button>

                {/* SELECTOR RÁPIDO DE CUENTAS DEMO (Demo Switcher discreto) */}
                <div className="pt-2 border-t border-slate-100">
                  <div className="text-[11px] font-semibold text-slate-400 mb-2 flex items-center justify-between">
                    <span>Acceso Rápido Demo:</span>
                    <span className="text-[10px] text-slate-400 font-mono">pass: Seko2026*</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {DEMO_ACCOUNTS.map((demo) => {
                      const isSelected = userEmail.toLowerCase() === demo.email.toLowerCase();
                      return (
                        <button
                          key={demo.label}
                          type="button"
                          onClick={() => handleSelectDemoAccount(demo)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border text-left transition-all flex items-center justify-between cursor-pointer ${
                            isSelected
                              ? "bg-[#EFF3F9] border-[#233762] text-[#233762] font-bold shadow-2xs"
                              : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          <span className="truncate">{demo.label}</span>
                          <span className="text-[9px] px-1 py-0.5 rounded bg-white border border-slate-200 text-slate-500 font-mono">
                            {demo.role === "ADMIN" ? "ADM" : demo.role === "ASSET_MANAGER" ? "AST" : demo.role}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Enlace ¿Olvidaste tu contraseña? */}
                <div className="pt-1 text-center">
                  <button
                    type="button"
                    onClick={() =>
                      triggerToast(
                        "Comunícate con TI (Jordi.Bochm@sekologistics.com) para restablecer credenciales.",
                        "info"
                      )
                    }
                    className="text-xs text-slate-500 underline hover:text-[#233762] transition-colors cursor-pointer"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
              </form>
            </div>

            {/* 3. Pie del Panel Izquierdo */}
            <div className="text-xs text-slate-400 pt-4 font-normal text-center sm:text-left">
              © 2026 SupplyChain México • Operación SEKO Logistics / KST
            </div>
          </div>

          {/* COLUMNA DERECHA: Galería Fotográfica de Logística */}
          <div className="hidden lg:block flex-1 min-h-[calc(100vh-6px)] relative overflow-hidden bg-[#1B2A4A]">
            {LOGISTICS_IMAGES.map((imgSrc, idx) => (
              <div
                key={idx}
                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                  idx === currentImageIndex ? "opacity-100 scale-100" : "opacity-0 scale-105 pointer-events-none"
                }`}
                style={{ transitionProperty: "opacity, transform", transitionDuration: "1000ms" }}
              >
                <img
                  src={imgSrc}
                  alt={`Operación logística ${idx + 1}`}
                  className="w-full h-full object-cover object-center select-none"
                />
              </div>
            ))}

            <div className="absolute inset-0 bg-gradient-to-t from-[#233762]/85 via-transparent to-black/20 pointer-events-none" />

            <div className="absolute bottom-8 left-8 z-20 max-w-lg text-white">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-[11px] font-bold tracking-wider uppercase mb-2">
                <span className="w-2 h-2 rounded-full bg-[#CE3A39] animate-pulse" />
                <span>SupplyChain México</span>
              </div>
              <h3 className="text-lg font-bold text-white drop-shadow-md">
                Plataforma de Orquestación Logística y Última Milla Nacional
              </h3>
            </div>

            <div className="absolute bottom-8 right-8 z-20 flex items-center gap-2">
              {LOGISTICS_IMAGES.map((_, dotIdx) => (
                <button
                  key={dotIdx}
                  onClick={() => setCurrentImageIndex(dotIdx)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    dotIdx === currentImageIndex ? "w-8 bg-[#CE3A39]" : "w-2 bg-white/60 hover:bg-white"
                  }`}
                  aria-label={`Ir a foto ${dotIdx + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ==================================================================== */
        /* APLICACIÓN PRINCIPAL CON SIDEBAR ESTILO EXTENSIV                     */
        /* ==================================================================== */
        <div className="flex-1 flex w-full min-h-[calc(100vh-6px)] bg-slate-50">
          {/* SIDEBAR IZQUIERDO ESTILO EXTENSIV (Desktop fijo, móvil colapsable) */}
          <aside
            className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#1B2A4A] text-white flex flex-col justify-between shrink-0 shadow-2xl transition-transform duration-300 lg:static lg:translate-x-0 ${
              mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="flex flex-col">
              {/* BLOQUE ROJO SUPERIOR EXTENSIV (#CE3A39) con botón Home */}
              <button
                type="button"
                onClick={() => {
                  setActiveModule("home");
                  setMobileMenuOpen(false);
                }}
                className="h-16 w-full bg-[#CE3A39] hover:bg-[#B02E2D] px-4 flex items-center justify-between text-white font-bold transition-colors cursor-pointer select-none group border-b border-red-700/40"
                title="Ir a Home"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-white/15 group-hover:bg-white/25 transition">
                    <Home className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-extrabold tracking-wide uppercase">SupplyChain</span>
                    <span className="text-[10px] text-red-100 font-medium">Portal México</span>
                  </div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-white/20 text-white font-mono uppercase text-[10px]">
                  {activeRole === "ADMIN" ? "ADM" : activeRole === "ASSET_MANAGER" ? "KST" : activeRole}
                </span>
              </button>

              {/* LISTA DE MÓDULOS DEL MENÚ LATERAL (Filtrado por Rol) */}
              <nav className="p-3 space-y-1.5 overflow-y-auto max-h-[calc(100vh-230px)]">
                <div className="px-3 pt-2 pb-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase font-mono">
                  Módulos Operativos
                </div>

                {sidebarItems.map((item) => {
                  const isActive = activeModule === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveModule(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer group ${
                        isActive
                          ? "bg-[#CE3A39] text-white shadow-md font-bold"
                          : "text-slate-300 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate">
                        <Icon
                          className={`w-4 h-4 shrink-0 transition-transform ${
                            isActive ? "text-white scale-110" : "text-slate-400 group-hover:text-white"
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.subLabel && (
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase shrink-0 ${
                            isActive ? "bg-white/20 text-white" : "bg-white/10 text-slate-300"
                          }`}
                        >
                          {item.subLabel}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* SECCIÓN INFERIOR: Perfil de Usuario, Logout y Créditos */}
            <div className="p-3 border-t border-slate-800 bg-[#15223C]/60 flex flex-col gap-2.5">
              {/* Tarjeta de Usuario Activo */}
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#233762] border border-white/20 text-white flex items-center justify-center font-bold font-mono text-xs shadow-2xs shrink-0">
                  {userInitials}
                </div>
                <div className="flex flex-col truncate flex-1 min-w-0">
                  <span className="text-xs font-bold text-white truncate" title={currentUser?.name || userEmail}>
                    {currentUser?.name || userEmail}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <span className="text-[10px] text-slate-300 font-mono truncate" title={roleConfig.label}>
                      {roleConfig.code}
                    </span>
                  </div>
                </div>
              </div>

              {/* Botón Logout */}
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/5 hover:bg-red-500/20 text-slate-300 hover:text-[#CE3A39] border border-white/10 hover:border-red-500/30 text-xs font-semibold transition cursor-pointer"
                title="Cerrar sesión"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Cerrar sesión</span>
              </button>

              {/* Branding y Copyright inferior */}
              <button
                type="button"
                onClick={() => {
                  setActiveModule("home");
                  setMobileMenuOpen(false);
                }}
                className="text-center pt-1 group cursor-pointer"
                title="Ir al inicio"
              >
                <div className="text-[10px] text-slate-400 group-hover:text-white transition">
                  © 2026 SupplyChain México
                </div>
                <div className="text-[9px] text-slate-500">All rights reserved</div>
              </button>
            </div>
          </aside>

          {/* OVERLAY PARA MÓVILES */}
          {mobileMenuOpen && (
            <div
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-30 lg:hidden"
            />
          )}

          {/* CONTENEDOR PRINCIPAL DERECHO */}
          <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
            {/* BARRA SUPERIOR PARA MÓVILES */}
            <div className="lg:hidden h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between sticky top-0 z-20">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#233762]">SupplyChain México</span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="p-2 rounded-lg text-slate-500 hover:text-[#CE3A39]"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            {/* ================================================================ */}
            {/* VISTA 1: HOME (SALUDO COMPLETO, ROL, BIENVENIDA Y FECHA)        */}
            {/* ================================================================ */}
            {activeModule === "home" && (
              <div className="flex-1 flex flex-col justify-between py-10 px-6 sm:px-10 max-w-6xl mx-auto w-full">
                <div className="flex flex-col items-center justify-center my-auto text-center">
                  {/* Logotipo Oficial SupplyChain México */}
                  <div className="flex flex-col items-center select-none mb-6">
                    {!logoError ? (
                      <img
                        src="/logo-supplychain.png"
                        alt="SupplyChain México"
                        className="h-28 sm:h-36 md:h-40 w-auto object-contain transition-transform hover:scale-105 duration-300 drop-shadow-xs"
                        onError={() => setLogoError(true)}
                      />
                    ) : (
                      <AnimatedLogo className="h-28 sm:h-36 md:h-40 w-auto" cycleDuration={8} />
                    )}
                  </div>

                  {/* Saludo Dinámico con Nombre Completo */}
                  <h1 className="text-2xl sm:text-4xl font-extrabold text-[#233762] tracking-tight">
                    ¡{greeting}
                    {currentUser?.name && <span className="text-[#CE3A39]">, {currentUser.name}</span>}!
                  </h1>

                  {/* Badge de Rol Actual */}
                  <div className="mt-3.5 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-50 border border-[#CE3A39]/30 text-xs font-mono font-bold text-[#CE3A39] shadow-2xs">
                    <ShieldCheck className="w-4 h-4" />
                    <span>ROL: {roleConfig.roleBadge}</span>
                  </div>

                  {/* Mensaje de Bienvenida */}
                  <p className="text-base sm:text-lg text-slate-600 mt-4 max-w-xl leading-relaxed">
                    Bienvenido a tu ventana de inicio para las operaciones del día. Selecciona un módulo en el menú
                    izquierdo para comenzar.
                  </p>

                  {/* Fecha Operativa Actual */}
                  <p className="text-xs font-mono uppercase tracking-widest text-[#CE3A39] mt-4 font-bold min-h-4">
                    {todayLabel}
                  </p>

                  {/* ACCESO RÁPIDO A LOS MÓDULOS DE SU PERFIL */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-10 w-full max-w-4xl text-left">
                    {/* Tarjeta Asset Management */}
                    <div
                      onClick={() => setActiveModule("asset_management")}
                      className="bg-white rounded-2xl border border-slate-200/80 shadow-md hover:shadow-xl p-6 flex flex-col justify-between transition-all duration-300 cursor-pointer group hover:-translate-y-1 relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 w-full h-1 bg-[#233762] group-hover:bg-[#CE3A39] transition-colors" />
                      <div>
                        <div className="w-12 h-12 rounded-xl bg-[#EFF3F9] text-[#233762] group-hover:bg-[#233762] group-hover:text-white flex items-center justify-center transition shadow-2xs mb-4">
                          <Zap className="w-6 h-6" />
                        </div>
                        <h3 className="text-base font-bold text-[#233762]">
                          Asset Management
                          {isRestrictedRole && (
                            <span className="ml-2 text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                              {activeRole === "CSM" ? "Consulta" : "Impresión"}
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                          {isRestrictedRole
                            ? activeRole === "CSM"
                              ? "Revisión de órdenes validadas y descarga de Cierre.xlsx."
                              : "Visualización e impresión directa de etiquetas de envío."
                            : "Orquestación de órdenes KST, validación SEPOMEX y timbrado Techship."}
                        </p>
                      </div>
                      <span className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-[#233762] group-hover:text-[#CE3A39] transition-colors">
                        <span>Ingresar</span>
                        <span className="group-hover:translate-x-1 transition-transform">→</span>
                      </span>
                    </div>

                    {/* Tarjeta CSM */}
                    {roleConfig.sidebarModules.includes("csm") && (
                      <div
                        onClick={() => setActiveModule("csm")}
                        className="bg-white rounded-2xl border border-slate-200/80 shadow-md hover:shadow-xl p-6 flex flex-col justify-between transition-all duration-300 cursor-pointer group hover:-translate-y-1 relative overflow-hidden"
                      >
                        <div className="absolute top-0 left-0 w-full h-1 bg-[#233762] group-hover:bg-[#CE3A39] transition-colors" />
                        <div>
                          <div className="w-12 h-12 rounded-xl bg-[#EFF3F9] text-[#233762] group-hover:bg-[#233762] group-hover:text-white flex items-center justify-center transition shadow-2xs mb-4">
                            <Headset className="w-6 h-6" />
                          </div>
                          <h3 className="text-base font-bold text-[#233762]">Customer Service (CSM)</h3>
                          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                            Mesa de atención para incidencias operativas y soporte al cliente.
                          </p>
                        </div>
                        <span className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-[#233762] group-hover:text-[#CE3A39] transition-colors">
                          <span>Ver módulo</span>
                          <span className="group-hover:translate-x-1 transition-transform">→</span>
                        </span>
                      </div>
                    )}

                    {/* Tarjeta Almacén */}
                    {roleConfig.sidebarModules.includes("almacen") && (
                      <div
                        onClick={() => setActiveModule("almacen")}
                        className="bg-white rounded-2xl border border-slate-200/80 shadow-md hover:shadow-xl p-6 flex flex-col justify-between transition-all duration-300 cursor-pointer group hover:-translate-y-1 relative overflow-hidden"
                      >
                        <div className="absolute top-0 left-0 w-full h-1 bg-[#CE3A39] transition-colors" />
                        <div>
                          <div className="w-12 h-12 rounded-xl bg-[#FDF2F2] text-[#CE3A39] group-hover:bg-[#CE3A39] group-hover:text-white flex items-center justify-center transition shadow-2xs mb-4">
                            <Warehouse className="w-6 h-6" />
                          </div>
                          <h3 className="text-base font-bold text-[#233762]">Almacén Lerma</h3>
                          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                            Supervisión de paquetes en preparación física, cross-dock y embarque.
                          </p>
                        </div>
                        <span className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-[#CE3A39] transition-colors">
                          <span>Ver almacén</span>
                          <span className="group-hover:translate-x-1 transition-transform">→</span>
                        </span>
                      </div>
                    )}

                    {/* Tarjetas de Administración (Solo ADMIN) */}
                    {activeRole === "ADMIN" && (
                      <>
                        <div
                          onClick={() => setActiveModule("users")}
                          className="bg-white rounded-2xl border border-slate-200/80 shadow-md hover:shadow-xl p-6 flex flex-col justify-between transition-all duration-300 cursor-pointer group hover:-translate-y-1 relative overflow-hidden"
                        >
                          <div className="absolute top-0 left-0 w-full h-1 bg-[#CE3A39]" />
                          <div>
                            <div className="w-12 h-12 rounded-xl bg-[#FDF2F2] text-[#CE3A39] group-hover:bg-[#CE3A39] group-hover:text-white flex items-center justify-center transition shadow-2xs mb-4">
                              <Users className="w-6 h-6" />
                            </div>
                            <h3 className="text-base font-bold text-[#233762]">Gestión de Usuarios</h3>
                            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                              Altas, bajas, control de estados y reasignación de roles en tiempo real.
                            </p>
                          </div>
                          <span className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-[#CE3A39] transition-colors">
                            <span>Administrar ({usersList.length})</span>
                            <span className="group-hover:translate-x-1 transition-transform">→</span>
                          </span>
                        </div>

                        <div
                          onClick={() => setActiveModule("roles")}
                          className="bg-white rounded-2xl border border-slate-200/80 shadow-md hover:shadow-xl p-6 flex flex-col justify-between transition-all duration-300 cursor-pointer group hover:-translate-y-1 relative overflow-hidden"
                        >
                          <div className="absolute top-0 left-0 w-full h-1 bg-[#233762]" />
                          <div>
                            <div className="w-12 h-12 rounded-xl bg-[#EFF3F9] text-[#233762] group-hover:bg-[#233762] group-hover:text-white flex items-center justify-center transition shadow-2xs mb-4">
                              <ShieldCheck className="w-6 h-6" />
                            </div>
                            <h3 className="text-base font-bold text-[#233762]">Matriz de Roles (RBAC)</h3>
                            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                              Consulta de permisos, candados y accesos definidos por rol.
                            </p>
                          </div>
                          <span className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-[#233762] transition-colors">
                            <span>Ver matriz (4 roles)</span>
                            <span className="group-hover:translate-x-1 transition-transform">→</span>
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="text-xs text-slate-400 font-medium text-center pt-8">
                  SupplyChain México &bull; Plataforma Logística Integral
                </div>
              </div>
            )}

            {/* ================================================================ */}
            {/* VISTA 2: GESTIÓN DE USUARIOS (VISTA USERS - SOLO ADMIN)          */}
            {/* ================================================================ */}
            {activeModule === "users" && (
              <div className="p-6 sm:p-10 max-w-7xl mx-auto w-full space-y-6">
                {/* Cabecera con Botón Nuevo Usuario en Rojo #CE3A39 */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
                  <div>
                    <h1 className="text-2xl font-extrabold text-[#233762] tracking-tight">
                      Gestión de Usuarios y Accesos
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                      Catálogo local sincronizado en el navegador con control de roles (RBAC) en tiempo real.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNewUserModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#CE3A39] hover:bg-[#B02E2D] text-white text-xs font-bold shadow-md shadow-red-200 transition cursor-pointer self-start sm:self-auto"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Nuevo Usuario</span>
                  </button>
                </div>

                {/* Resumen Métrico de Usuarios */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                    <span className="text-xs font-bold text-slate-400 uppercase font-mono">Total Cuentas</span>
                    <div className="text-2xl font-extrabold text-[#233762] mt-1 font-mono">{usersList.length}</div>
                  </div>
                  <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                    <span className="text-xs font-bold text-emerald-600 uppercase font-mono">Activos</span>
                    <div className="text-2xl font-extrabold text-emerald-600 mt-1 font-mono">
                      {usersList.filter((u) => u.isActive).length}
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                    <span className="text-xs font-bold text-[#CE3A39] uppercase font-mono">Administradores</span>
                    <div className="text-2xl font-extrabold text-[#CE3A39] mt-1 font-mono">
                      {usersList.filter((u) => u.role === "ADMIN").length}
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                    <span className="text-xs font-bold text-blue-600 uppercase font-mono">Operativos</span>
                    <div className="text-2xl font-extrabold text-[#233762] mt-1 font-mono">
                      {usersList.filter((u) => u.role !== "ADMIN").length}
                    </div>
                  </div>
                </div>

                {/* Tabla de Usuarios */}
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#233762] text-white font-semibold uppercase tracking-wider text-[11px]">
                          <th className="py-3 px-4">Usuario</th>
                          <th className="py-3 px-4">Correo Corporativo</th>
                          <th className="py-3 px-4">Rol Asignado</th>
                          <th className="py-3 px-4">Cambio Rápido de Rol</th>
                          <th className="py-3 px-4">Estado</th>
                          <th className="py-3 px-4 text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {usersList.map((usr) => {
                          const initials = usr.name
                            .split(" ")
                            .filter(Boolean)
                            .map((p) => p[0])
                            .slice(0, 2)
                            .join("")
                            .toUpperCase();
                          const isSelf = currentUser?.email.toLowerCase() === usr.email.toLowerCase();

                          return (
                            <tr key={usr.id} className="hover:bg-slate-50 transition-colors">
                              {/* Nombre y Avatar */}
                              <td className="py-3 px-4 whitespace-nowrap">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-[#EFF3F9] text-[#233762] border border-[#233762]/20 font-bold font-mono flex items-center justify-center text-xs shadow-2xs">
                                    {initials}
                                  </div>
                                  <div>
                                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                                      <span>{usr.name}</span>
                                      {isSelf && (
                                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-mono font-bold">
                                          TÚ
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono">Alta: {usr.createdAt}</div>
                                  </div>
                                </div>
                              </td>

                              {/* Correo */}
                              <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-600">{usr.email}</td>

                              {/* Badge de Rol */}
                              <td className="py-3 px-4 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border ${
                                    usr.role === "ADMIN"
                                      ? "bg-red-50 text-[#CE3A39] border-[#CE3A39]/30"
                                      : usr.role === "ASSET_MANAGER"
                                      ? "bg-blue-50 text-[#233762] border-[#233762]/30"
                                      : usr.role === "CSM"
                                      ? "bg-amber-50 text-amber-800 border-amber-300"
                                      : "bg-slate-100 text-slate-700 border-slate-300"
                                  }`}
                                >
                                  {ROLES_CONFIG[usr.role]?.label || usr.role}
                                </span>
                              </td>

                              {/* Dropdown de Cambio Rápido de Rol */}
                              <td className="py-3 px-4 whitespace-nowrap">
                                <select
                                  value={usr.role}
                                  onChange={(e) => handleChangeUserRole(usr.id, e.target.value as UserRole)}
                                  className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#233762] cursor-pointer"
                                >
                                  <option value="ADMIN">ADMIN</option>
                                  <option value="ASSET_MANAGER">ASSET_MANAGER</option>
                                  <option value="CSM">CSM</option>
                                  <option value="ALMACEN">ALMACEN</option>
                                </select>
                              </td>

                              {/* Estado (Activo / Inactivo) */}
                              <td className="py-3 px-4 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => handleToggleUserActive(usr.id)}
                                  disabled={isSelf}
                                  title={isSelf ? "No puedes desactivar tu cuenta en sesión" : "Clic para alternar estado"}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition cursor-pointer ${
                                    usr.isActive
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                                      : "bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200"
                                  } ${isSelf ? "opacity-70 cursor-not-allowed" : ""}`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      usr.isActive ? "bg-emerald-500" : "bg-slate-400"
                                    }`}
                                  />
                                  <span>{usr.isActive ? "Activo" : "Inactivo"}</span>
                                </button>
                              </td>

                              {/* Acciones */}
                              <td className="py-3 px-4 whitespace-nowrap text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(usr.id)}
                                  disabled={isSelf}
                                  title={isSelf ? "No puedes eliminarte a ti mismo" : "Eliminar usuario"}
                                  className={`p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer ${
                                    isSelf ? "opacity-30 cursor-not-allowed" : ""
                                  }`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* MODAL PARA CREAR NUEVO USUARIO */}
                {showNewUserModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
                    <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
                      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-lg bg-red-100 text-[#CE3A39]">
                            <Plus className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-[#233762]">Registrar Nuevo Usuario</h3>
                            <p className="text-xs text-slate-500">Se agregará al catálogo local de acceso RBAC.</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowNewUserModal(false)}
                          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <form onSubmit={handleCreateNewUser} className="p-6 space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-[#233762] mb-1">Nombre Completo</label>
                          <input
                            type="text"
                            required
                            placeholder="Ej. Laura Martínez"
                            value={newUserForm.name}
                            onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                            className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-[#233762]"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[#233762] mb-1">
                            Correo Corporativo (@sekologistics.com)
                          </label>
                          <input
                            type="email"
                            required
                            placeholder="nombre.apellido@sekologistics.com"
                            value={newUserForm.email}
                            onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                            className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-[#233762]"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[#233762] mb-1">Rol Operativo</label>
                          <select
                            value={newUserForm.role}
                            onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value as UserRole })}
                            className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-[#233762]"
                          >
                            <option value="ADMIN">ADMIN (Administrador General)</option>
                            <option value="ASSET_MANAGER">ASSET_MANAGER (Ejecutivo Asset KST)</option>
                            <option value="CSM">CSM (Customer Service)</option>
                            <option value="ALMACEN">ALMACEN (Operador Almacén Lerma)</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="checkbox"
                            id="newUserActive"
                            checked={newUserForm.isActive}
                            onChange={(e) => setNewUserForm({ ...newUserForm, isActive: e.target.checked })}
                            className="w-4 h-4 rounded text-[#233762] focus:ring-[#233762] border-slate-300"
                          />
                          <label htmlFor="newUserActive" className="text-xs text-slate-700 font-medium cursor-pointer">
                            Cuenta activa de inmediato
                          </label>
                        </div>

                        <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => setShowNewUserModal(false)}
                            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            className="px-5 py-2 rounded-xl bg-[#CE3A39] hover:bg-[#B02E2D] text-white text-xs font-bold shadow-md shadow-red-200"
                          >
                            Guardar Usuario
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ================================================================ */}
            {/* VISTA 3: MATRIZ DE ROLES Y PERMISOS (VISTA ROLES - SOLO ADMIN)  */}
            {/* ================================================================ */}
            {activeModule === "roles" && (
              <div className="p-6 sm:p-10 max-w-7xl mx-auto w-full space-y-8">
                <div>
                  <h1 className="text-2xl font-extrabold text-[#233762] tracking-tight">
                    Matriz de Roles y Permisos Operativos (RBAC)
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    Control de visibilidad de módulos en el menú lateral y permisos de ejecución dentro del automatizador.
                  </p>
                </div>

                {/* 4 Tarjetas Ejecutivas de Roles */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {(Object.keys(ROLES_CONFIG) as UserRole[]).map((roleKey) => {
                    const cfg = ROLES_CONFIG[roleKey];
                    const perms = cfg.permissions;
                    const usersInRole = usersList.filter((u) => u.role === roleKey).length;
                    const isRed = roleKey === "ADMIN" || roleKey === "ALMACEN";

                    return (
                      <div
                        key={roleKey}
                        className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition p-6 flex flex-col justify-between relative overflow-hidden"
                      >
                        <div
                          className={`absolute top-0 left-0 w-full h-1.5 ${
                            isRed ? "bg-[#CE3A39]" : "bg-[#233762]"
                          }`}
                        />

                        <div>
                          {/* Encabezado del Rol */}
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-lg font-bold text-[#233762]">{cfg.label}</h3>
                                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold border border-slate-200">
                                  {cfg.code}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mt-1">{cfg.subtitle}</p>
                            </div>
                            <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-600 shrink-0">
                              {usersInRole} usuario(s)
                            </span>
                          </div>

                          <p className="text-xs text-slate-600 mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100 leading-relaxed">
                            {cfg.description}
                          </p>

                          {/* Sección: Módulos Visibles en Sidebar */}
                          <div className="mt-5">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                              Módulos Visibles en Menú Lateral
                            </span>
                            <div className="grid grid-cols-2 gap-2 mt-2">
                              {[
                                { id: "home", label: "Home" },
                                { id: "asset_management", label: "Asset Management" },
                                { id: "csm", label: "CSM" },
                                { id: "almacen", label: "Almacén" },
                                { id: "profile", label: "Perfil" },
                                { id: "users", label: "Usuarios (Admin)" },
                                { id: "roles", label: "Roles (Admin)" },
                              ].map((mod) => {
                                const visible = cfg.sidebarModules.includes(mod.id);
                                return (
                                  <div
                                    key={mod.id}
                                    className="flex items-center gap-2 text-xs py-1 px-2 rounded-lg bg-slate-50/70"
                                  >
                                    {visible ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    ) : (
                                      <Lock className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                                    )}
                                    <span
                                      className={`truncate ${
                                        visible ? "text-slate-700 font-medium" : "text-slate-400 line-through"
                                      }`}
                                    >
                                      {mod.label}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Sección: Permisos en Asset Management */}
                          <div className="mt-5">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                              Permisos en Asset Management
                            </span>
                            <div className="space-y-1.5 mt-2">
                              {[
                                { ok: perms.canUpload, label: "Ingesta y subida de Excel (SCTASK)" },
                                { ok: perms.canEditRows, label: "Edición y corrección de direcciones en caliente" },
                                { ok: perms.canProcessLive, label: "Timbrado oficial en Techship (--live)" },
                                { ok: perms.canSyncClosing, label: "Sincronización de Cierre y Guías" },
                                { ok: perms.canArchive, label: "Limpiar tabla y resguardar en archivo histórico" },
                                { ok: perms.allowedDownloads.cierre_excel, label: "Descarga de Cierre_*.xlsx" },
                                { ok: perms.allowedDownloads.etiquetas_pdf, label: "Descarga de Etiquetas_*.pdf" },
                                { ok: perms.allowedDownloads.techship_excel, label: "Descarga de Techship_*.xlsx" },
                                { ok: perms.allowedDownloads.auditoria_excel, label: "Descarga de Auditoría_*.xlsx" },
                              ].map((item, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-slate-50/70"
                                >
                                  <span className={item.ok ? "text-slate-700 font-medium" : "text-slate-400"}>
                                    {item.label}
                                  </span>
                                  {item.ok ? (
                                    <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-700">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>Permitido</span>
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-red-600">
                                      <Lock className="w-3.5 h-3.5 text-red-500" />
                                      <span>Bloqueado</span>
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ================================================================ */}
            {/* VISTA 4: CSM (MÓDULO CUSTOMER SERVICE)                          */}
            {/* ================================================================ */}
            {activeModule === "csm" && (
              <div className="p-6 sm:p-10 max-w-5xl mx-auto w-full space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                  <div>
                    <h1 className="text-2xl font-extrabold text-[#233762]">Customer Service (CSM)</h1>
                    <p className="text-xs text-slate-500 mt-1">
                      Mesa de atención para auditoría de entregas, incidencias y estados de clientes.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveModule("asset_management")}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#233762] hover:bg-[#1B2A4A] text-white text-xs font-bold shadow-sm"
                  >
                    <Zap className="w-4 h-4" />
                    <span>Ir a Asset Management (Consulta)</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <Headset className="w-8 h-8 text-[#233762] mb-3" />
                    <h3 className="font-bold text-slate-800 text-sm">Validación de Incidencias</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Revisión de órdenes marcadas en amarillo (colonia ambigua) o rojo (código postal erróneo).
                    </p>
                  </div>
                  <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <FileSpreadsheet className="w-8 h-8 text-emerald-600 mb-3" />
                    <h3 className="font-bold text-slate-800 text-sm">Descarga de Cierres Diarios</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Acceso al archivo consolidado Cierre.xlsx para conciliación con ServiceNow.
                    </p>
                  </div>
                  <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <Truck className="w-8 h-8 text-[#CE3A39] mb-3" />
                    <h3 className="font-bold text-slate-800 text-sm">Rastreo de Guías</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Consulta de waybills generados y sincronización de trackings oficiales.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ================================================================ */}
            {/* VISTA 5: ALMACÉN (MÓDULO ALMACÉN LERMA)                         */}
            {/* ================================================================ */}
            {activeModule === "almacen" && (
              <div className="p-6 sm:p-10 max-w-5xl mx-auto w-full space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                  <div>
                    <h1 className="text-2xl font-extrabold text-[#233762]">Almacén Lerma</h1>
                    <p className="text-xs text-slate-500 mt-1">
                      Operación física de empaque, etiquetado y despacho en piso de almacén.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveModule("asset_management")}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#CE3A39] hover:bg-[#B02E2D] text-white text-xs font-bold shadow-md shadow-red-200"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Ir a Asset Management (Impresión)</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <FileText className="w-8 h-8 text-[#CE3A39] mb-3" />
                    <h3 className="font-bold text-slate-800 text-sm">Impresión de Etiquetas PDF</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Descarga e impresión térmica directa del consolidado de guías Techship.
                    </p>
                  </div>
                  <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <Package className="w-8 h-8 text-[#233762] mb-3" />
                    <h3 className="font-bold text-slate-800 text-sm">Preparación Física de Órdenes</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Picking y packing de equipo de computación según número de RITM.
                    </p>
                  </div>
                  <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <Truck className="w-8 h-8 text-emerald-600 mb-3" />
                    <h3 className="font-bold text-slate-800 text-sm">Embarque y Manifiesto</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Entrega a transportista y validación de bultos listos para ruta.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ================================================================ */}
            {/* VISTA 6: PERFIL DE USUARIO                                       */}
            {/* ================================================================ */}
            {activeModule === "profile" && (
              <div className="p-6 sm:p-10 max-w-4xl mx-auto w-full space-y-6">
                <div className="pb-4 border-b border-slate-200">
                  <h1 className="text-2xl font-extrabold text-[#233762]">Perfil de Usuario</h1>
                  <p className="text-xs text-slate-500 mt-1">
                    Información de tu cuenta corporativa y permisos asignados en el sistema.
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 rounded-2xl bg-[#233762] text-white flex items-center justify-center font-bold font-mono text-2xl shadow-md">
                      {userInitials}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">{currentUser?.name}</h2>
                      <p className="text-xs font-mono text-slate-500 mt-0.5">{currentUser?.email}</p>
                      <div className="mt-2.5 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 text-[#CE3A39] border border-[#CE3A39]/30 text-xs font-mono font-bold">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>{roleConfig.label}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-[#CE3A39] text-slate-700 text-xs font-bold transition border border-slate-200"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Cerrar sesión</span>
                  </button>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <h3 className="text-sm font-bold text-[#233762] mb-3">Detalle de Permisos para tu Rol</h3>
                  <p className="text-xs text-slate-600 leading-relaxed mb-4">{roleConfig.description}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="p-3 rounded-xl bg-slate-50 flex items-center justify-between">
                      <span>Subida de Archivos Excel:</span>
                      <span className="font-bold">{permissions.canUpload ? "Habilitado" : "Restringido"}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 flex items-center justify-between">
                      <span>Edición de Direcciones SEPOMEX:</span>
                      <span className="font-bold">{permissions.canEditRows ? "Habilitado" : "Restringido"}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 flex items-center justify-between">
                      <span>Timbrado de Guías Reales:</span>
                      <span className="font-bold">{permissions.canProcessLive ? "Habilitado" : "Restringido"}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 flex items-center justify-between">
                      <span>Limpieza y Archivo Histórico:</span>
                      <span className="font-bold">{permissions.canArchive ? "Habilitado" : "Restringido"}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ================================================================ */}
            {/* VISTA 7: DASHBOARD DE ASSET MANAGEMENT                           */}
            {/* ================================================================ */}
            {activeModule === "asset_management" && (
              <>
                {/* HEADER SUPERIOR DEL DASHBOARD */}
                <header className="border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-xs sticky top-0 z-20">
                  <div className="w-full max-w-[1850px] mx-auto px-6 lg:px-10 h-16 sm:h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3 sm:gap-4">
                      {/* Botón Home */}
                      <button
                        type="button"
                        onClick={() => setActiveModule("home")}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-[#EFF3F9] text-[#233762] text-xs font-bold transition cursor-pointer"
                        title="Regresar a Inicio"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Home</span>
                      </button>

                      <div className="h-7 w-px bg-slate-200 hidden sm:block" />

                      <div>
                        <div className="flex items-center gap-2">
                          <h1 className="text-base sm:text-lg font-extrabold text-[#233762] tracking-wide">
                            Automatizador de tareas
                          </h1>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#EFF3F9] text-[#233762] font-mono font-bold border border-[#233762]/20">
                            KST / Kyndryl
                          </span>
                        </div>
                        {isRestrictedRole && (
                          <span className="text-[11px] text-amber-700 font-semibold">
                            {activeRole === "CSM"
                              ? "• Modo Consulta (Solo lectura de tabla y descargas de Cierre)"
                              : "• Modo Impresión (Solo lectura de tabla y descarga de Etiquetas PDF)"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Usuario activo en barra */}
                    <div className="flex items-center gap-3">
                      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-700">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="font-medium font-mono text-slate-600">{currentUser?.email}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-bold font-mono">
                          {activeRole}
                        </span>
                      </div>
                    </div>
                  </div>
                </header>

                {/* CONTENIDO PRINCIPAL DEL DASHBOARD */}
                <main className="flex-1 w-full max-w-[1850px] mx-auto px-6 lg:px-10 py-5 space-y-6 relative z-10">
                  {/* BANNER INFORMATIVO SUPERIOR PARA ROLES RESTRINGIDOS (CSM y ALMACEN) */}
                  {isRestrictedRole && (
                    <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 flex items-center justify-between shadow-xs">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0">
                          <Lock className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-xs font-bold uppercase tracking-wider text-amber-800">
                            Modo Consulta / Operación Restringida
                          </div>
                          <div className="text-xs sm:text-sm font-semibold text-amber-950 mt-0.5">
                            Estás operando como <span className="font-bold underline">{roleConfig.label}</span>. La
                            subida de archivos, corrección de registros, timbrado y limpieza están bloqueados.
                          </div>
                        </div>
                      </div>
                      <span className="hidden sm:inline-block text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-amber-200/80 text-amber-900 border border-amber-300">
                        SOLO LECTURA
                      </span>
                    </div>
                  )}

                  {/* Barra debajo del encabezado: Estado del lote y Botón de Limpiar / Archivar */}
                  <div className="flex items-center justify-between flex-wrap gap-3 pb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500">Lote en proceso:</span>
                      <span className="text-xs font-mono font-bold text-[#233762] px-2.5 py-1 rounded-lg bg-white border border-slate-200 shadow-2xs">
                        {batchData?.batch_filename || "Sin lote activo"}
                      </span>
                    </div>

                    {/* Botón Limpiar tabla / Archivar (Candado para CSM y ALMACEN) */}
                    <button
                      onClick={handleArchivePreview}
                      disabled={!permissions.canArchive || actionLoading === "archive" || !hasOrders}
                      title={
                        !permissions.canArchive
                          ? "Función bloqueada para tu rol. Solo Administradores y Asset Managers pueden limpiar la tabla."
                          : "Archivar el lote actual y limpiar la tabla (se resguarda en data/archive)"
                      }
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-[#FDF2F2] text-[#CE3A39] border border-[#CE3A39]/30 text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs cursor-pointer"
                    >
                      {!permissions.canArchive ? <Lock className="w-4 h-4 text-slate-400" /> : <Archive className="w-4 h-4" />}
                      <span>
                        {actionLoading === "archive" ? "Limpiando..." : "Limpiar tabla / Archivar"}
                      </span>
                    </button>
                  </div>

                  {/* ZONA 1: Ingesta (4 col) y 4 Tarjetas KPI (2 col c/u = 8 col) */}
                  <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-5">
                    {/* Dropzone de Ingesta (xl:col-span-4) con Candado para CSM / Almacén */}
                    <div
                      className={`md:col-span-2 xl:col-span-4 bg-white border-2 border-dashed rounded-2xl p-5 flex flex-col justify-between shadow-sm transition-colors relative overflow-hidden group ${
                        !permissions.canUpload
                          ? "border-slate-200 bg-slate-50/60 cursor-not-allowed"
                          : "border-slate-300 hover:border-[#233762]"
                      }`}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".xlsx,.xls"
                        className={`absolute inset-0 opacity-0 z-10 ${
                          !permissions.canUpload || uploading ? "cursor-not-allowed" : "cursor-pointer"
                        }`}
                        disabled={!permissions.canUpload || uploading}
                      />
                      <div className="flex items-start gap-3">
                        <div
                          className={`p-3 rounded-xl border transition-transform ${
                            !permissions.canUpload
                              ? "bg-slate-100 text-slate-400 border-slate-200"
                              : "bg-[#EFF3F9] text-[#233762] border-[#233762]/20 group-hover:scale-105"
                          }`}
                        >
                          {!permissions.canUpload ? <Lock className="w-6 h-6" /> : <UploadCloud className="w-6 h-6" />}
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-[#233762]">
                            {!permissions.canUpload ? "Subida Restringida" : "Ingestar Reporte ServiceNow"}
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {!permissions.canUpload
                              ? `Tu rol (${roleConfig.label}) no tiene permisos para subir nuevos archivos.`
                              : "Arrastra el archivo SCTASK_SHP_Combined_Report_MX_*.xlsx"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-mono truncate max-w-[200px]" title={batchData?.batch_filename}>
                          {batchData?.batch_filename ? batchData.batch_filename : "Sin archivo activo"}
                        </span>
                        <button
                          type="button"
                          disabled={!permissions.canUpload}
                          className="px-3.5 py-1.5 rounded-lg bg-[#233762] hover:bg-[#1B2A4A] text-white font-semibold shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {!permissions.canUpload ? "Bloqueado" : uploading ? "Procesando..." : "Examinar..."}
                        </button>
                      </div>
                    </div>

                    {/* Tarjeta KPI 1: Total Órdenes */}
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

                    {/* Tarjeta KPI 2: Confirmadas 100% */}
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

                    {/* Tarjeta KPI 3: Por Revisar */}
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

                    {/* Tarjeta KPI 4: Bloqueadas por Error */}
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
                      {/* Botón 1: Timbrado Oficial en Estafeta / Techship */}
                      <button
                        onClick={() => setShowLiveModal(true)}
                        disabled={!permissions.canProcessLive || !hasOrders || actionLoading === "live"}
                        title={
                          !permissions.canProcessLive
                            ? "Timbrado restringido para tu perfil operativo."
                            : "Generar guías oficiales en Techship"
                        }
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#CE3A39] hover:bg-[#B02E2D] text-white text-sm font-bold shadow-md shadow-red-200 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {!permissions.canProcessLive ? <Lock className="w-4 h-4" /> : <Zap className="w-4 h-4 fill-white" />}
                        <span>{actionLoading === "live" ? "Timbrando..." : "1. Timbrar Guías en Techship"}</span>
                      </button>

                      {/* Botón 2: Cierre y PDF de Etiquetas */}
                      <button
                        onClick={handleSyncClosing}
                        disabled={!permissions.canSyncClosing || !hasOrders || actionLoading === "sync"}
                        title={
                          !permissions.canSyncClosing
                            ? "Sincronización restringida para tu perfil operativo."
                            : "Sincronizar Cierre y Etiquetas"
                        }
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {!permissions.canSyncClosing ? <Lock className="w-4 h-4" /> : <Truck className="w-4 h-4" />}
                        <span>{actionLoading === "sync" ? "Sincronizando..." : "2. Sincronizar Cierre y Etiquetas"}</span>
                      </button>
                    </div>

                    {/* Grupo de Descarga Directa de Archivos */}
                    {batchData ? (
                      <div className="flex items-center gap-2 border-t sm:border-t-0 sm:border-l border-slate-200 pt-3 sm:pt-0 sm:pl-4">
                        <span className="text-xs text-slate-500 font-bold mr-1 hidden md:inline">Descargar:</span>

                        {/* Cierre.xlsx (Permitido para ADMIN, ASSET_MANAGER y CSM) */}
                        <button
                          onClick={() => handleDownload("cierre_excel")}
                          disabled={
                            !permissions.allowedDownloads.cierre_excel ||
                            batchData.files_available?.cierre_excel === false
                          }
                          title={
                            !permissions.allowedDownloads.cierre_excel
                              ? "Descarga de Cierre.xlsx no autorizada para tu rol."
                              : batchData.files_available?.cierre_excel === false
                              ? "Disponible tras ejecutar '2. Sincronizar Cierre y Etiquetas'"
                              : "Descargar Cierre_*.xlsx (ServiceNow 12 columnas)"
                          }
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EFF3F9] hover:bg-[#E2E8F0] text-[#233762] border border-[#233762]/30 text-xs font-mono font-bold transition shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {!permissions.allowedDownloads.cierre_excel ? (
                            <Lock className="w-3.5 h-3.5 text-slate-400" />
                          ) : (
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          )}
                          <span>Cierre.xlsx</span>
                        </button>

                        {/* Etiquetas.pdf (Permitido para ADMIN, ASSET_MANAGER y ALMACEN) */}
                        <button
                          onClick={() => handleDownload("etiquetas_pdf")}
                          disabled={
                            !permissions.allowedDownloads.etiquetas_pdf ||
                            batchData.files_available?.etiquetas_pdf === false
                          }
                          title={
                            !permissions.allowedDownloads.etiquetas_pdf
                              ? "Descarga de Etiquetas.pdf no autorizada para tu rol."
                              : batchData.files_available?.etiquetas_pdf === false
                              ? "Disponible tras ejecutar '2. Sincronizar Cierre y Etiquetas'"
                              : "Descargar o imprimir PDF consolidado de etiquetas"
                          }
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FDF2F2] hover:bg-[#FEE2E2] text-[#CE3A39] border border-[#CE3A39]/30 text-xs font-mono font-bold transition shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {!permissions.allowedDownloads.etiquetas_pdf ? (
                            <Lock className="w-3.5 h-3.5 text-slate-400" />
                          ) : (
                            <FileText className="w-3.5 h-3.5" />
                          )}
                          <span>Etiquetas.pdf</span>
                        </button>

                        {/* Techship.xlsx (Permitido para ADMIN y ASSET_MANAGER) */}
                        <button
                          onClick={() => handleDownload("techship_excel")}
                          disabled={
                            !permissions.allowedDownloads.techship_excel ||
                            batchData.files_available?.techship_excel === false
                          }
                          title={
                            !permissions.allowedDownloads.techship_excel
                              ? "Descarga de Techship.xlsx restringida."
                              : "Descargar Guias_Techship_Importada_*.xlsx"
                          }
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-mono font-medium transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {!permissions.allowedDownloads.techship_excel ? (
                            <Lock className="w-3.5 h-3.5 text-slate-400" />
                          ) : (
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          )}
                          <span>Techship.xlsx</span>
                        </button>

                        {/* Auditoría.xlsx (Permitido para ADMIN, ASSET_MANAGER y CSM) */}
                        <button
                          onClick={() => handleDownload("auditoria_excel")}
                          disabled={
                            !permissions.allowedDownloads.auditoria_excel ||
                            batchData.files_available?.auditoria_excel === false
                          }
                          title={
                            !permissions.allowedDownloads.auditoria_excel
                              ? "Descarga de Auditoría.xlsx no autorizada."
                              : "Descargar Auditoria_Direcciones_*.xlsx con bitácora"
                          }
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-mono font-medium transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {!permissions.allowedDownloads.auditoria_excel ? (
                            <Lock className="w-3.5 h-3.5 text-slate-400" />
                          ) : (
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          )}
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
                      <div
                        className={`flex items-center gap-1.5 p-1 rounded-xl bg-slate-200/70 text-xs font-bold transition-opacity ${
                          !hasOrders ? "opacity-50" : ""
                        }`}
                      >
                        <button
                          disabled={!hasOrders}
                          onClick={() => setActiveTab("ALL")}
                          className={`px-3 py-1.5 rounded-lg transition ${
                            !hasOrders
                              ? "text-slate-400 cursor-not-allowed"
                              : activeTab === "ALL"
                              ? "bg-[#233762] text-white shadow-sm"
                              : "text-slate-600 hover:text-slate-900 cursor-pointer"
                          }`}
                        >
                          Todas ({batchData?.orders.length || 0})
                        </button>
                        <button
                          disabled={!hasOrders}
                          onClick={() => setActiveTab("ISSUES")}
                          className={`px-3 py-1.5 rounded-lg transition ${
                            !hasOrders
                              ? "text-slate-400 cursor-not-allowed"
                              : activeTab === "ISSUES"
                              ? "bg-[#CE3A39] text-white shadow-sm"
                              : "text-slate-600 hover:text-slate-900 cursor-pointer"
                          }`}
                        >
                          Solo Errores / Revisar (
                          {(batchData?.metrics.error_blocked || 0) + (batchData?.metrics.review || 0)})
                        </button>
                        <button
                          disabled={!hasOrders}
                          onClick={() => setActiveTab("CONFIRMED")}
                          className={`px-3 py-1.5 rounded-lg transition ${
                            !hasOrders
                              ? "text-slate-400 cursor-not-allowed"
                              : activeTab === "CONFIRMED"
                              ? "bg-emerald-600 text-white shadow-sm"
                              : "text-slate-600 hover:text-slate-900 cursor-pointer"
                          }`}
                        >
                          Confirmadas ({batchData?.metrics.confirmed_100 || 0})
                        </button>
                        <button
                          disabled={!hasOrders}
                          onClick={() => setActiveTab("OUTBOUND")}
                          className={`px-3 py-1.5 rounded-lg transition hidden sm:inline ${
                            !hasOrders
                              ? "text-slate-400 cursor-not-allowed"
                              : activeTab === "OUTBOUND"
                              ? "bg-slate-700 text-white"
                              : "text-slate-600 hover:text-slate-900 cursor-pointer"
                          }`}
                        >
                          Solo Ida ({outboundCount})
                        </button>
                        <button
                          disabled={!hasOrders}
                          onClick={() => setActiveTab("RETURN")}
                          className={`px-3 py-1.5 rounded-lg transition hidden sm:inline ${
                            !hasOrders
                              ? "text-slate-400 cursor-not-allowed"
                              : activeTab === "RETURN"
                              ? "bg-slate-700 text-white"
                              : "text-slate-600 hover:text-slate-900 cursor-pointer"
                          }`}
                        >
                          Solo Retorno ({returnCount})
                        </button>
                      </div>

                      {/* Input de Búsqueda Rápida */}
                      <div className="relative flex-1 max-w-xs">
                        <Search
                          className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${
                            !hasOrders ? "text-slate-300" : "text-slate-400"
                          }`}
                        />
                        <input
                          type="text"
                          disabled={!hasOrders}
                          placeholder={
                            hasOrders ? "Buscar RITM, empleado, CP, teléfono..." : "Sin órdenes para buscar..."
                          }
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-white border border-slate-300 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#233762] transition shadow-2xs disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed disabled:border-slate-200"
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
                                    <div className="text-[11px] text-slate-500">
                                      {order.city}, {order.state}
                                    </div>
                                  </td>

                                  {/* Botón de Corrección / Candado para Consulta */}
                                  <td className="py-3 px-4 text-center whitespace-nowrap">
                                    {permissions.canEditRows ? (
                                      <button
                                        onClick={() => handleOpenEdit(order)}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white hover:bg-[#233762] hover:text-white text-[#233762] border border-[#233762]/30 text-xs font-bold transition shadow-2xs cursor-pointer"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                        <span>Corregir</span>
                                      </button>
                                    ) : (
                                      <span
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-400 border border-slate-200 text-xs font-medium cursor-not-allowed"
                                        title="Edición restringida para tu rol operativo"
                                      >
                                        <Lock className="w-3 h-3 text-slate-400" />
                                        <span>Lectura</span>
                                      </span>
                                    )}
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
                          onClick={handleTechshipProcess}
                          className="px-5 py-2 rounded-xl bg-[#CE3A39] hover:bg-[#B02E2D] text-white text-xs font-bold shadow-md shadow-red-200 transition"
                        >
                          Sí, Timbrar Guías Reales
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* MODAL DE RESULTADOS DE TIMBRADO TECHSHIP */}
                {simResults && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
                    <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-[#233762]" />
                          <h3 className="text-base font-bold text-[#233762]">
                            Resultado de Timbrado en Techship
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
                        <div className="grid grid-cols-4 gap-3 text-center">
                          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                            <div className="text-xs text-slate-500 font-medium">Total en Lote</div>
                            <div className="text-xl font-bold font-mono text-slate-900 mt-1">
                              {simResults.summary?.total || 0}
                            </div>
                          </div>
                          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                            <div className="text-xs text-emerald-700 font-medium">Listas / Éxito</div>
                            <div className="text-xl font-bold font-mono text-emerald-700 mt-1">
                              {simResults.summary?.success || simResults.summary?.ready || 0}
                            </div>
                          </div>
                          <div className="p-3 rounded-xl bg-[#EFF3F9] border border-[#233762]/20">
                            <div className="text-xs text-[#233762] font-medium">Anti-Duplicadas</div>
                            <div className="text-xl font-bold font-mono text-[#233762] mt-1">
                              {simResults.summary?.duplicates || 0}
                            </div>
                          </div>
                          <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                            <div className="text-xs text-[#CE3A39] font-medium">Bloqueadas</div>
                            <div className="text-xl font-bold font-mono text-[#CE3A39] mt-1">
                              {simResults.summary?.blocked || 0}
                            </div>
                          </div>
                        </div>

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
        </div>
      )}
    </div>
  );
}
