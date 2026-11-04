"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import SplashScreen from "@/components/layout/SplashScreen";
import AnimatedLogo from "@/components/layout/AnimatedLogo";
import SupplyChainLoader from "@/components/layout/SupplyChainLoader";
import TrackingGenerator from "@/components/tracking/TrackingGenerator";
import TransportTracker from "@/components/tracking/TransportTracker";
import CalendarPlanner from "@/components/calendar/CalendarPlanner";
import HistoryView from "@/components/history/HistoryView";
import { useHistoryCapture } from "@/hooks/useHistoryCapture";
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
  Calendar,
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
  permissions: RolePermissions;
}

const ROLES_CONFIG: Record<UserRole, RoleConfig> = {
  ADMIN: {
    code: "ADMIN",
    label: "Administrador General",
    roleBadge: "ADMINISTRADOR GENERAL",
    subtitle: "Control Total y Administración",
    description: "Acceso total a las tres áreas operativas (Asset Management, CSM y Almacén), gestión de usuarios y matriz de roles.",
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
    subtitle: "Operación de Órdenes y Timbrado",
    description: "Acceso operativo exclusivo a Asset Management. Las áreas de CSM y Almacén permanecen restringidas.",
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
    subtitle: "Atención a Clientes y Auditoría",
    description: "Acceso exclusivo a la opción de CSM. Las áreas de Asset Management y Almacén están bloqueadas para este perfil.",
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
    subtitle: "Operación de Piso y Embarques",
    description: "Acceso exclusivo a la opción de Almacén. Las áreas de Asset Management y CSM están bloqueadas para este perfil.",
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

const DEFAULT_USERS: UserAccount[] = [
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
  } catch { }
  return null;
}

// Cuentas Demo para el Selector Rápido del Login
const DEMO_ACCOUNTS = [
  { label: "Admin", email: "Jordi.Bochm@sekologistics.com", role: "ADMIN" as UserRole },
  { label: "Asset Mgr", email: "kst.asset@sekologistics.com", role: "ASSET_MANAGER" as UserRole },
  { label: "CSM", email: "csm.mx@sekologistics.com", role: "CSM" as UserRole },
  { label: "Almacén", email: "almacen.lerma@sekologistics.com", role: "ALMACEN" as UserRole },
];

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
  address3?: string;
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
  colonias_sepomex?: string[];
  tracking_number?: string;
  carrier?: string;
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
  const [sepomexColonias, setSepomexColonias] = useState<string[]>([]);
  const [editFormData, setEditFormData] = useState({
    phone: "",
    address1: "",
    address2: "",
    address3: "",
    city: "",
    state: "",
    zip: "",
    service_code: "70",
    declared_value: 0,
    sync_counterpart: true,
  });

  // Selección de órdenes para eliminación por bloque (Automatizador)
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  // Modal de confirmación para eliminar órdenes del lote
  const [deleteOrderDialog, setDeleteOrderDialog] = useState<{
    mode: "single" | "selected";
    targetOrderIds: string[];
    targetLabel?: string;
    count: number;
    includeCounterparts: boolean;
  } | null>(null);

  // Modales de Techship y Archivo
  const [showLiveModal, setShowLiveModal] = useState<boolean>(false);
  const [archivePreview, setArchivePreview] = useState<any | null>(null);
  const [simResults, setSimResults] = useState<any | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Vista activa:
  // 'login' | 'hub' (las 3 opciones principales) | 'modules' (cuadricula de 3x3) | 'operacion_dia' | 'generador_tracking' | 'asset_management' | 'csm' | 'almacen' | 'users' | 'roles' | 'profile'
  const [activeModule, setActiveModule] = useState<
    "login" | "hub" | "modules" | "operacion_dia" | "transporte" | "generador_tracking" | "asset_management" | "csm" | "almacen" | "users" | "roles" | "profile" | "calendario" | "historial"
  >("login");
  const [initialTracking, setInitialTracking] = useState<string>("");

  // Estado de Autenticación y RBAC
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [usersList, setUsersList] = useState<UserAccount[]>(DEFAULT_USERS);
  const [userEmail, setUserEmail] = useState<string>("Jordi.Bochm@sekologistics.com");
  const [loginPassword, setLoginPassword] = useState<string>("••••••••••••");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const [logoError, setLogoError] = useState<boolean>(false);

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

  // Captura automática del historial local (trackings y cierres del día)
  const { captureBatch, captureClosing, captureArchive } = useHistoryCapture(currentUser?.email);

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
          setActiveModule("hub");
        } else if (matched && !matched.isActive) {
          sessionStorage.removeItem(CURRENT_USER_STORAGE_KEY);
          sessionStorage.removeItem("sc_user_email");
          setActiveModule("login");
          triggerToast("Tu usuario ha sido desactivado. Contacta al Administrador.", "error");
        } else {
          setCurrentUser(savedSession);
          setUserEmail(savedSession.email);
          setActiveModule("hub");
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
      setActiveModule("hub");
      triggerToast(`¡Bienvenido, ${userSession.name}!`, "success");
      return;
    }

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
      setActiveModule("hub");
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
    triggerToast("Sesión cerrada correctamente.", "info");
  };

  // ==============================================================================
  // REGLAS DE ACCESO AL HUB POR ROL:
  // - ADMIN: puede entrar a las 3 opciones (Asset Management, CSM y Almacén)
  // - ASSET_MANAGER: solo entra a Asset Management
  // - CSM: solo entra a CSM
  // - ALMACEN: solo entra a Almacén
  // ==============================================================================
  const activeRole: UserRole = currentUser?.role || "ASSET_MANAGER";
  const roleConfig = ROLES_CONFIG[activeRole] || ROLES_CONFIG.ASSET_MANAGER;
  const permissions = roleConfig.permissions;

  const canEnterAsset = activeRole === "ADMIN" || activeRole === "ASSET_MANAGER";
  const canEnterCSM = activeRole === "ADMIN" || activeRole === "CSM";
  const canEnterAlmacen = activeRole === "ADMIN" || activeRole === "ALMACEN";

  const handleHubNavigation = (target: "asset" | "csm" | "almacen") => {
    if (target === "asset") {
      if (canEnterAsset) {
        setActiveModule("modules");
      } else {
        triggerToast(`Acceso restringido: El rol ${roleConfig.label} no tiene autorización para ingresar a Asset Management.`, "error");
      }
    } else if (target === "csm") {
      if (canEnterCSM) {
        setActiveModule("csm");
      } else {
        triggerToast(`Acceso restringido: El rol ${roleConfig.label} solo tiene permitido el acceso a su área asignada.`, "error");
      }
    } else if (target === "almacen") {
      if (canEnterAlmacen) {
        setActiveModule("almacen");
      } else {
        triggerToast(`Acceso restringido: El rol ${roleConfig.label} solo tiene permitido el acceso a su área asignada.`, "error");
      }
    }
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
      setSelectedOrderIds(new Set());
      void captureBatch({
        batch_filename: data.batch_filename || file.name,
        metrics: {
          total_orders: Number(data.metrics?.total_orders) || 0,
          confirmed: Number(data.metrics?.confirmed_100) || 0,
          review: Number(data.metrics?.review) || 0,
          error_blocked: Number(data.metrics?.error_blocked) || 0,
        },
      });
      triggerToast(`Lote procesado exitosamente: ${file.name}`, "success");
    } catch (err: any) {
      triggerToast(err.message || "Error al cargar archivo", "error");
    } finally {
      setUploading(false);
      setActionLoading(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleToggleSelectOrder = (orderId: string) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const handleToggleSelectAllOrders = () => {
    setSelectedOrderIds((prev) => {
      if (prev.size === filteredOrders.length && filteredOrders.length > 0) {
        return new Set();
      }
      return new Set(filteredOrders.map((o) => o.order_id));
    });
  };

  const handleRequestDeleteSingleOrder = (order: OrderItem) => {
    const isReturn = order.order_id.endsWith("-1");
    const baseId = isReturn ? order.order_id.slice(0, -2) : order.order_id;
    const counterpartId = isReturn ? baseId : `${baseId}-1`;
    const hasCounterpart = batchData?.orders.some((o) => o.order_id === counterpartId);

    setDeleteOrderDialog({
      mode: "single",
      targetOrderIds: [order.order_id],
      targetLabel: `${order.order_id} (${order.recipient_name})`,
      count: 1,
      includeCounterparts: Boolean(hasCounterpart),
    });
  };

  const handleRequestDeleteSelectedOrders = () => {
    if (selectedOrderIds.size === 0) return;
    setDeleteOrderDialog({
      mode: "selected",
      targetOrderIds: Array.from(selectedOrderIds),
      count: selectedOrderIds.size,
      includeCounterparts: true,
    });
  };

  const removeOrdersLocally = (orderIds: string[], includeCounterparts: boolean) => {
    if (!batchData) return;
    const targetSet = new Set(orderIds);
    if (includeCounterparts) {
      orderIds.forEach((id) => {
        if (id.endsWith("-1")) targetSet.add(id.slice(0, -2));
        else targetSet.add(`${id}-1`);
      });
    }
    const remaining = batchData.orders.filter((o) => !targetSet.has(o.order_id));
    let conf = 0, rev = 0, err = 0;
    remaining.forEach((o) => {
      if (o.status_semaphore === "VERDE") conf++;
      else if (o.status_semaphore === "AMARILLO") rev++;
      else err++;
    });
    setBatchData({
      ...batchData,
      metrics: {
        total_orders: remaining.length,
        confirmed_100: conf,
        review: rev,
        error_blocked: err,
      },
      orders: remaining,
    });
  };

  const handleConfirmDeleteOrders = async () => {
    if (!deleteOrderDialog || deleteOrderDialog.targetOrderIds.length === 0) return;
    const dialogData = { ...deleteOrderDialog };
    setDeleteOrderDialog(null);

    try {
      setActionLoading("delete_order");
      const res = await fetch(`${API_BASE}/api/batches/delete-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_ids: dialogData.targetOrderIds,
          delete_counterparts: dialogData.includeCounterparts,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.batch) {
          setBatchData(data.batch);
        } else {
          removeOrdersLocally(dialogData.targetOrderIds, dialogData.includeCounterparts);
        }
        triggerToast(
          dialogData.mode === "single"
            ? `Orden ${dialogData.targetLabel || ""} eliminada del lote.`
            : `${dialogData.count} orden(es) eliminada(s) del lote.`,
          "info"
        );
      } else {
        removeOrdersLocally(dialogData.targetOrderIds, dialogData.includeCounterparts);
        triggerToast("Orden(es) omitida(s) de la vista del lote.", "info");
      }

      setSelectedOrderIds((prev) => {
        const next = new Set(prev);
        dialogData.targetOrderIds.forEach((id) => next.delete(id));
        return next;
      });
    } catch (err: any) {
      removeOrdersLocally(dialogData.targetOrderIds, dialogData.includeCounterparts);
      triggerToast("Orden(es) removida(s) localmente.", "info");
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenEdit = (order: OrderItem) => {
    setEditingOrder(order);
    setSepomexColonias(order.colonias_sepomex || []);
    const cleanZip = order.zip.replace("ERROR:", "").trim();
    setEditFormData({
      phone: order.phone.replace("ERROR:", "").trim(),
      address1: order.address1.replace("ERROR:", "").trim(),
      address2: order.address2 || "",
      address3: order.address3 || "",
      city: order.city || "",
      state: order.state || "",
      zip: cleanZip,
      service_code: order.service_code || "70",
      declared_value: order.declared_value || 0,
      sync_counterpart: true,
    });
    if (cleanZip.length === 5 && (!order.colonias_sepomex || order.colonias_sepomex.length === 0)) {
      void fetchSepomexByCp(cleanZip, false);
    }
  };

  const fetchSepomexByCp = async (cpValue: string, autoFillFields: boolean = true) => {
    const clean = cpValue.replace(/\D/g, "").slice(0, 5);
    if (clean.length !== 5) {
      setSepomexColonias([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/sepomex/cp/${clean}`);
      if (!res.ok) return;
      const info = await res.json();
      if (info.existe) {
        setSepomexColonias(info.colonias || []);
        if (autoFillFields) {
          setEditFormData((prev) => ({
            ...prev,
            zip: clean,
            city: info.municipio || prev.city,
            state: info.estado || prev.state,
            address2:
              info.colonias && info.colonias.length === 1
                ? info.colonias[0].slice(0, 50)
                : prev.address2,
          }));
        }
      } else {
        setSepomexColonias([]);
      }
    } catch {
      // ignore network error during typing
    }
  };

  const submitOrderPatch = async (goNextIssue: boolean = false) => {
    if (!editingOrder) return;
    const currentOrderId = editingOrder.order_id;
    const baseOrderId = currentOrderId.endsWith("-1") ? currentOrderId.slice(0, -2) : currentOrderId;

    try {
      setActionLoading("patch");
      const res = await fetch(`${API_BASE}/api/batches/order/${currentOrderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: editFormData.phone.trim(),
          address1: editFormData.address1.trim(),
          address2: editFormData.address2.trim(),
          address3: editFormData.address3.trim(),
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

      if (goNextIssue && data.batch?.orders) {
        const pendingOrders: OrderItem[] = data.batch.orders.filter(
          (o: OrderItem) =>
            o.status_semaphore !== "VERDE" &&
            o.order_id !== currentOrderId &&
            o.order_id !== `${baseOrderId}-1`
        );
        if (pendingOrders.length > 0) {
          triggerToast(
            `Orden ${currentOrderId} corregida. Abriendo siguiente con incidencia (${pendingOrders.length} restantes)...`,
            "success"
          );
          handleOpenEdit(pendingOrders[0]);
          return;
        } else {
          triggerToast("¡Excelente! Todas las órdenes con incidencia han quedado corregidas.", "success");
          setEditingOrder(null);
          return;
        }
      }

      triggerToast(`Orden ${currentOrderId} corregida y revalidada con SEPOMEX.`, "success");
      setEditingOrder(null);
    } catch (err: any) {
      triggerToast(err.message || "Error al actualizar", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSavePatch = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitOrderPatch(false);
  };

  const handleTechshipDryRun = async () => {
    try {
      setActionLoading("dry_run");
      const res = await fetch(`${API_BASE}/api/techship/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: true }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Error al simular en Techship");
      }

      const data = await res.json();
      setSimResults(data);
      triggerToast("Simulación y verificación de duplicados en Techship completada.", "info");
    } catch (err: any) {
      triggerToast(err.message || "Fallo en simulación de Techship", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleTechshipProcess = async () => {
    // Cerrar modal de confirmación de inmediato para que se aprecie la animación oficial de carga
    setShowLiveModal(false);
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
      const summary = data.summary || {};
      void captureBatch({
        metrics: {
          total_orders: Number(summary.total) || 0,
          confirmed: Math.max(
            0,
            (Number(summary.total) || 0) - (Number(summary.blocked) || 0) - (Number(summary.duplicates) || 0)
          ),
          review: 0,
          error_blocked: Number(summary.blocked) || 0,
          ready: Number(summary.ready) || 0,
          duplicates: Number(summary.duplicates) || 0,
        },
      });
      triggerToast("Timbrado oficial completado en Techship.", "success");
      fetchHealthAndBatch();
    } catch (err: any) {
      triggerToast(err.message || "Fallo en operación de Techship", "error");
    } finally {
      setActionLoading(null);
    }
  };

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
      void captureClosing(
        {
          cierre_file: data.cierre_excel_filename,
          etiquetas_file: data.etiquetas_pdf_filename || undefined,
          total_orders: Number(batchData?.metrics.total_orders) || 0,
          assigned: batchData?.orders.filter((order) => Boolean(order.tracking_number)).length || 0,
          errors: 0,
          cp_alerts: 0,
        },
        { batch_filename: batchData?.batch_filename }
      );
      triggerToast(data.message || "Cierre y PDF de etiquetas sincronizados correctamente.", "success");
      setBatchData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          files_available: {
            ...prev.files_available,
            cierre_excel: true,
            etiquetas_pdf: Boolean(data.etiquetas_pdf_filename || prev.files_available?.etiquetas_pdf || true),
          },
        };
      });
      await fetchHealthAndBatch();
    } catch (err: any) {
      triggerToast(err.message || "Error en sincronización de cierre", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownload = (fileType: string) => {
    const url = `${API_BASE}/api/files/download/${fileType}`;
    window.open(url, "_blank");
  };

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

  const handleArchiveConfirm = async () => {
    setArchivePreview(null);
    try {
      setActionLoading("archive");
      const data = await callArchive(false, true);
      setBatchData(null);
      setSearchTerm("");
      setActiveTab("ALL");
      setEditingOrder(null);
      setSelectedOrderIds(new Set());
      void captureArchive();

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

  const greeting =
    currentHour >= 5 && currentHour < 12
      ? "Buenos días"
      : currentHour >= 12 && currentHour < 19
        ? "Buenas tardes"
        : "Buenas noches";

  const userInitials = useMemo(() => {
    const name = currentUser?.name || "Seko User";
    const parts = name.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return (name[0] || "U").toUpperCase();
  }, [currentUser?.name]);

  // Catálogo de módulos de Asset Management (6 módulos operativos)
  const hubModules: {
    name: string;
    description: string;
    Icon: React.ElementType;
    target?: "operacion_dia" | "transporte" | "calendario" | "historial";
    tone: "navy" | "red";
  }[] = [
      {
        name: "Operación del día",
        description: "Automatización operativa, generación de tracking e historial de cierres.",
        Icon: Zap,
        target: "operacion_dia",
        tone: "navy",
      },
      { name: "Transporte", description: "Rastreo de envios.", Icon: Truck, target: "transporte", tone: "red" },
      { name: "Facturación", description: "Facturación mensual.", Icon: FileText, tone: "navy" },
      {
        name: "Reportes",
        description: "Reportes de devoluciones, estatus ServiceNow y conciliación KST.",
        Icon: FileSpreadsheet,
        target: "reportes" as any,
        tone: "red",
      },
      { name: "Calendario", description: "Planificación de operaciones, agenda de entregas, citas y recolecciones programadas.", Icon: Calendar, target: "calendario", tone: "navy" },
      { name: "Historial de lotes", description: "Trackings rastreados, cierres del día y movimientos recientes.", Icon: Archive, target: "historial", tone: "red" },
      { name: "Mesa de ayuda (SOP)", description: "Manuales, ayuda manuales técnicos acerca de la operación.", Icon: HelpCircle, tone: "red" },
    ];

  // Submódulos de Operación del día (3 opciones solicitadas)
  const operacionDiaModules: {
    name: string;
    description: string;
    Icon: React.ElementType;
    target?: "asset_management" | "generador_tracking" | "historial";
    tone: "navy" | "red";
    statusBadge: "Activo" | "En desarrollo";
  }[] = [
      {
        name: "Automatizador de operación",
        description: "Órdenes KST / Kyndryl, validación SEPOMEX y timbrado de guías Techship.",
        Icon: Zap,
        target: "asset_management",
        tone: "navy",
        statusBadge: "Activo",
      },
      {
        name: "Generador tracking",
        description: "Generación y vista previa en vivo del PDF de guías y trazabilidad de envíos.",
        Icon: Truck,
        target: "generador_tracking",
        tone: "red",
        statusBadge: "Activo",
      },
      {
        name: "Historial",
        description: "Consulta de archivos de cierre diarios, trackings.",
        Icon: Archive,
        target: "historial",
        tone: "navy",
        statusBadge: "Activo",
      },
    ];

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

      {/* Toast Notification (Reubicado en bottom-6 right-8 para no tapar el header) */}
      {toast && (
        <div
          className={`fixed bottom-6 right-8 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border backdrop-blur-md transition-all ${toast.type === "success"
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
      {/* RENDER CONDICIONAL: LOGIN O VISTAS AUTENTICADAS                     */}
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
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border text-left transition-all flex items-center justify-between cursor-pointer ${isSelected
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
                        "Comunícate con soporte TI (Jordi.Bochm@sekologistics.com) para restablecer credenciales.",
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
                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${idx === currentImageIndex ? "opacity-100 scale-100" : "opacity-0 scale-105 pointer-events-none"
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
                  className={`h-2 rounded-full transition-all duration-300 ${dotIdx === currentImageIndex ? "w-8 bg-[#CE3A39]" : "w-2 bg-white/60 hover:bg-white"
                    }`}
                  aria-label={`Ir a foto ${dotIdx + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      ) : activeModule === "hub" ? (
        /* ==================================================================== */
        /* EL HUB PRINCIPAL: LAS 3 OPCIONES (Asset Management, CSM, Almacén)   */
        /* CON PERMISOS POR ROL:                                               */
        /* - ADMIN: entra a las 3 opciones                                     */
        /* - ASSET_MANAGER: solo entra a Asset Management                      */
        /* - CSM: solo entra a CSM                                             */
        /* - ALMACEN: solo entra a Almacén                                     */
        /* ==================================================================== */
        <div className="flex-1 min-h-[calc(100vh-6px)] flex flex-col justify-between py-6 px-6 sm:px-10 max-w-7xl mx-auto w-full">
          {/* Barra superior de usuario, roles de admin y logout */}
          <div className="w-full flex items-center justify-between gap-3 text-xs mb-4 pb-3 border-b border-slate-200/60">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#233762] tracking-wide uppercase">SupplyChain Portal</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#EFF3F9] text-[#233762] font-bold border border-[#233762]/20">
                México
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
              {/* Accesos rápidos de Administración (Exclusivos para ADMIN) */}
              {activeRole === "ADMIN" && (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveModule("users")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-[#FDF2F2] border border-slate-200 hover:border-[#CE3A39]/40 text-slate-700 hover:text-[#CE3A39] text-xs font-bold transition shadow-2xs cursor-pointer"
                    title="Gestión de Usuarios"
                  >
                    <Users className="w-3.5 h-3.5 text-[#CE3A39]" />
                    <span className="hidden sm:inline">Usuarios ({usersList.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveModule("roles")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-[#EFF3F9] border border-slate-200 hover:border-[#233762]/40 text-slate-700 hover:text-[#233762] text-xs font-bold transition shadow-2xs cursor-pointer"
                    title="Matriz de Roles y Permisos"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-[#233762]" />
                    <span className="hidden sm:inline">Roles RBAC</span>
                  </button>
                </>
              )}

              {/* Badge de Usuario Activo */}
              <button
                type="button"
                onClick={() => setActiveModule("profile")}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 shadow-2xs text-slate-700 hover:border-[#233762] transition cursor-pointer"
                title="Ver Perfil"
              >
                <div className="w-5 h-5 rounded-full bg-[#233762] text-white flex items-center justify-center font-bold font-mono text-[10px]">
                  {userInitials}
                </div>
                <span className="font-medium text-slate-700 hidden md:inline truncate max-w-[180px]">
                  {currentUser?.name || userEmail}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold uppercase bg-slate-100 text-[#CE3A39]">
                  {roleConfig.code}
                </span>
              </button>

              {/* Botón Cerrar Sesión */}
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 text-slate-600 hover:text-[#CE3A39] transition font-medium shadow-2xs cursor-pointer"
                title="Cerrar sesión"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cerrar sesión</span>
              </button>
            </div>
          </div>

          {/* Bloque Central del Hub */}
          <div className="flex-1 flex flex-col items-center justify-center my-auto py-6">
            {/* Logotipo Oficial SupplyChain México */}
            <div className="flex flex-col items-center select-none">
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

            {/* Saludo dinámico + Nombre completo + Rol + Fecha operativa */}
            <div className="text-center flex flex-col items-center mt-6 mb-8 max-w-xl">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#233762] tracking-tight">
                ¡{greeting}
                {currentUser?.name && <span className="text-[#CE3A39]">, {currentUser.name}</span>}!
              </h1>

              {/* Badge del Rol Activo */}
              <div className="mt-2.5 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 border border-[#CE3A39]/30 text-xs font-mono font-bold text-[#CE3A39] shadow-2xs">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>ROL: {roleConfig.roleBadge}</span>
              </div>

              {/* Subtítulo de bienvenida */}
              <p className="text-sm text-slate-500 mt-3 max-w-md text-center leading-relaxed">
                Bienvenido a tu ventana de inicio para las operaciones del día. Selecciona un módulo para comenzar.
              </p>

              {/* Fecha operativa actual */}
              <p className="text-xs font-mono uppercase tracking-widest text-[#CE3A39] mt-3 min-h-4 font-bold">
                {todayLabel}
              </p>
            </div>

            {/* ================================================================ */}
            {/* LAS TRES ÁREAS DEL HUB (Asset Management, CSM y Almacén)        */}
            {/* Con animación homologada y candados basados en el rol           */}
            {/* ================================================================ */}
            <div className="flex flex-wrap justify-center gap-6 max-w-5xl w-full">
              {/* TARJETA 1: ASSET MANAGEMENT (Activo para ADMIN y ASSET_MANAGER) */}
              <div
                onClick={() => handleHubNavigation("asset")}
                className={`bg-white rounded-xl border border-slate-200/80 shadow-md p-8 w-72 min-h-[280px] flex flex-col items-center justify-between text-center relative overflow-hidden transition-all duration-300 group ${canEnterAsset
                  ? "cursor-pointer hover:shadow-xl hover:-translate-y-1"
                  : "opacity-60 cursor-not-allowed hover:border-slate-300"
                  }`}
              >
                <div
                  className={`absolute bottom-0 left-0 right-0 h-1 transition-colors duration-300 ${canEnterAsset
                    ? "bg-[#233762] group-hover:bg-[#CE3A39]"
                    : "bg-slate-300"
                    }`}
                />

                {/* Badge de Estado / Candado */}
                {canEnterAsset ? (
                  <span className="absolute top-3.5 right-3.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Activo
                  </span>
                ) : (
                  <span className="absolute top-3.5 right-3.5 inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-300">
                    <Lock className="w-3 h-3 text-slate-400" />
                    <span>Restringido</span>
                  </span>
                )}

                <div className="flex flex-col items-center w-full">
                  <div
                    className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-2xs ${canEnterAsset
                      ? "bg-[#EFF3F9] text-[#233762] group-hover:scale-110 group-hover:bg-[#233762] group-hover:text-white"
                      : "bg-slate-100 text-slate-400"
                      }`}
                  >
                    {canEnterAsset ? <Laptop className="w-8 h-8" /> : <Lock className="w-8 h-8" />}
                  </div>
                  <h3 className="text-lg font-bold text-[#233762] mt-4">Asset Management</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {canEnterAsset
                      ? "Operación del día, historial de cierres y generación de trackings."
                      : "Área exclusiva para Asset Management y Administrador."}
                  </p>
                </div>

                <span
                  className={`mt-5 inline-flex items-center gap-1.5 text-xs font-bold transition-colors ${canEnterAsset
                    ? "text-[#233762] group-hover:text-[#CE3A39]"
                    : "text-slate-400"
                    }`}
                >
                  {canEnterAsset ? (
                    <>
                      <span>Ingresar</span>
                      <span className="group-hover:translate-x-1 transition-transform duration-200">→</span>
                    </>
                  ) : (
                    <span>Bloqueado</span>
                  )}
                </span>
              </div>

              {/* TARJETA 2: CSM (Activo para ADMIN y CSM) */}
              <div
                onClick={() => handleHubNavigation("csm")}
                className={`bg-white rounded-xl border border-slate-200/80 shadow-md p-8 w-72 min-h-[280px] flex flex-col items-center justify-between text-center relative overflow-hidden transition-all duration-300 group ${canEnterCSM
                  ? "cursor-pointer hover:shadow-xl hover:-translate-y-1"
                  : "opacity-60 cursor-not-allowed hover:border-slate-300"
                  }`}
              >
                <div
                  className={`absolute bottom-0 left-0 right-0 h-1 transition-colors duration-300 ${canEnterCSM
                    ? "bg-[#233762] group-hover:bg-[#CE3A39]"
                    : "bg-slate-300"
                    }`}
                />

                {/* Badge de Estado / Candado */}
                {canEnterCSM ? (
                  <span className="absolute top-3.5 right-3.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Activo
                  </span>
                ) : (
                  <span className="absolute top-3.5 right-3.5 inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-300">
                    <Lock className="w-3 h-3 text-slate-400" />
                    <span>Restringido</span>
                  </span>
                )}

                <div className="flex flex-col items-center w-full">
                  <div
                    className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-2xs ${canEnterCSM
                      ? "bg-[#EFF3F9] text-[#233762] group-hover:scale-110 group-hover:bg-[#233762] group-hover:text-white"
                      : "bg-slate-100 text-slate-400"
                      }`}
                  >
                    {canEnterCSM ? <Headset className="w-8 h-8" /> : <Lock className="w-8 h-8" />}
                  </div>
                  <h3 className="text-lg font-bold text-[#233762] mt-4">CSM</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {canEnterCSM
                      ? "Customer Service, auditoría de incidencias y conciliación de entregas."
                      : "Área exclusiva para CSM y Administrador."}
                  </p>
                </div>

                <span
                  className={`mt-5 inline-flex items-center gap-1.5 text-xs font-bold transition-colors ${canEnterCSM
                    ? "text-[#233762] group-hover:text-[#CE3A39]"
                    : "text-slate-400"
                    }`}
                >
                  {canEnterCSM ? (
                    <>
                      <span>Ingresar</span>
                      <span className="group-hover:translate-x-1 transition-transform duration-200">→</span>
                    </>
                  ) : (
                    <span>Bloqueado</span>
                  )}
                </span>
              </div>

              {/* TARJETA 3: ALMACÉN (Activo para ADMIN y ALMACEN) */}
              <div
                onClick={() => handleHubNavigation("almacen")}
                className={`bg-white rounded-xl border border-slate-200/80 shadow-md p-8 w-72 min-h-[280px] flex flex-col items-center justify-between text-center relative overflow-hidden transition-all duration-300 group ${canEnterAlmacen
                  ? "cursor-pointer hover:shadow-xl hover:-translate-y-1"
                  : "opacity-60 cursor-not-allowed hover:border-slate-300"
                  }`}
              >
                <div
                  className={`absolute bottom-0 left-0 right-0 h-1 transition-colors duration-300 ${canEnterAlmacen
                    ? "bg-[#CE3A39] group-hover:bg-[#233762]"
                    : "bg-slate-300"
                    }`}
                />

                {/* Badge de Estado / Candado */}
                {canEnterAlmacen ? (
                  <span className="absolute top-3.5 right-3.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Activo
                  </span>
                ) : (
                  <span className="absolute top-3.5 right-3.5 inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-300">
                    <Lock className="w-3 h-3 text-slate-400" />
                    <span>Restringido</span>
                  </span>
                )}

                <div className="flex flex-col items-center w-full">
                  <div
                    className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-2xs ${canEnterAlmacen
                      ? "bg-[#FDF2F2] text-[#CE3A39] group-hover:scale-110 group-hover:bg-[#CE3A39] group-hover:text-white"
                      : "bg-slate-100 text-slate-400"
                      }`}
                  >
                    {canEnterAlmacen ? <Warehouse className="w-8 h-8" /> : <Lock className="w-8 h-8" />}
                  </div>
                  <h3 className="text-lg font-bold text-[#233762] mt-4">Almacén</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {canEnterAlmacen
                      ? "Operación Lerma, preparación de pedidos, empaque e impresión de guías."
                      : "Área exclusiva para Almacén y Administrador."}
                  </p>
                </div>

                <span
                  className={`mt-5 inline-flex items-center gap-1.5 text-xs font-bold transition-colors ${canEnterAlmacen
                    ? "text-[#CE3A39] group-hover:text-[#233762]"
                    : "text-slate-400"
                    }`}
                >
                  {canEnterAlmacen ? (
                    <>
                      <span>Ingresar</span>
                      <span className="group-hover:translate-x-1 transition-transform duration-200">→</span>
                    </>
                  ) : (
                    <span>Bloqueado</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Pie de página sutil del Hub */}
          <p className="text-xs text-slate-400 mt-8 font-medium tracking-wide text-center">
            SupplyChain México &bull; Plataforma Logística Integral
          </p>
        </div>
      ) : activeModule === "modules" ? (
        /* ==================================================================== */
        /* VISTA DE CUADRÍCULA DE MÓDULOS (3 por fila hacia abajo)             */
        /* ==================================================================== */
        <div className="flex-1 min-h-[calc(100vh-6px)] flex flex-col py-6 px-6">
          <div className="w-full max-w-6xl mx-auto flex items-center justify-between gap-3 text-xs mb-4">
            <button
              type="button"
              onClick={() => setActiveModule("hub")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-[#EFF3F9] hover:border-[#233762]/30 text-[#233762] font-bold transition shadow-2xs group cursor-pointer"
              title="Regresar al Hub Principal"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span>Regresar al Hub</span>
            </button>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 shadow-2xs text-slate-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-medium text-slate-600">{currentUser?.email}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-slate-100 text-[#CE3A39]">
                  {roleConfig.code}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 text-slate-600 hover:text-[#CE3A39] transition font-medium shadow-2xs cursor-pointer"
                title="Cerrar sesión"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cerrar sesión</span>
              </button>
            </div>
          </div>

          <div className="flex-1 w-full max-w-6xl mx-auto flex flex-col items-center pt-2 pb-10">
            <button
              type="button"
              onClick={() => setActiveModule("hub")}
              className="cursor-pointer select-none"
              title="Regresar al Hub"
            >
              {!logoError ? (
                <img
                  src="/logo-supplychain.png"
                  alt="SupplyChain México"
                  className="h-20 sm:h-24 w-auto object-contain transition-transform hover:scale-105 duration-300 drop-shadow-xs"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <AnimatedLogo className="h-20 sm:h-24 w-auto" cycleDuration={8} />
              )}
            </button>

            <div className="text-center mt-4 mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold text-[#233762] tracking-tight">Asset Management</h2>
              <p className="text-sm text-slate-500 mt-1">Selecciona un módulo operativo para continuar.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
              {hubModules.map(({ name, description, Icon, target, tone }) => {
                const isActive = Boolean(target);
                const iconTone =
                  tone === "red" ? "bg-[#FDF2F2] text-[#CE3A39]" : "bg-[#EFF3F9] text-[#233762]";
                return (
                  <div
                    key={name}
                    onClick={() => {
                      if (target === "reportes" as any) {
                        window.location.href = "/reportes";
                      } else if (target) {
                        setActiveModule(target);
                      } else {
                        triggerToast(`Módulo ${name} en construcción`, "info");
                      }
                    }}
                    className="bg-white rounded-xl border border-slate-200/80 shadow-md hover:shadow-xl transition-all duration-300 p-6 min-h-[200px] flex flex-col items-center justify-between text-center cursor-pointer group relative overflow-hidden hover:-translate-y-1"
                  >
                    <div
                      className={`absolute bottom-0 left-0 right-0 h-1 transition-colors duration-300 ${isActive
                        ? "bg-[#233762] group-hover:bg-[#CE3A39]"
                        : "bg-transparent group-hover:bg-[#233762]/30"
                        }`}
                    />
                    {isActive && (
                      <span className="absolute top-3.5 right-3.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Activo
                      </span>
                    )}
                    <div className="flex flex-col items-center w-full">
                      <div
                        className={`w-14 h-14 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-all duration-300 shadow-2xs ${iconTone}`}
                      >
                        <Icon className="w-7 h-7" />
                      </div>
                      <h3 className="text-lg font-bold text-[#233762] mt-4">{name}</h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>
                    </div>
                    <span
                      className={`mt-4 inline-flex items-center gap-1.5 text-xs font-bold transition-colors ${isActive ? "text-[#233762] group-hover:text-[#CE3A39]" : "text-slate-400 font-medium"
                        }`}
                    >
                      {isActive ? (
                        <>
                          <span>Ingresar</span>
                          <span className="group-hover:translate-x-1 transition-transform duration-200">→</span>
                        </>
                      ) : (
                        <span>En desarrollo</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : activeModule === "operacion_dia" ? (
        /* ==================================================================== */
        /* VISTA OPERACIÓN DEL DÍA (SUBMÓDULOS CON EL MISMO DISEÑO INSTITUCIONAL)*/
        /* ==================================================================== */
        <div className="flex-1 min-h-[calc(100vh-6px)] flex flex-col py-6 px-6">
          <div className="w-full max-w-6xl mx-auto flex items-center justify-between gap-3 text-xs mb-4">
            <button
              type="button"
              onClick={() => setActiveModule("modules")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-[#EFF3F9] hover:border-[#233762]/30 text-[#233762] font-bold transition shadow-2xs group cursor-pointer"
              title="Regresar a Asset Management"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span>Regresar a Asset Management</span>
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveModule("hub")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-[#EFF3F9] text-[#233762] font-bold transition shadow-2xs cursor-pointer"
                title="Ir al Hub Principal"
              >
                <Home className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Hub</span>
              </button>

              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 shadow-2xs text-slate-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-medium text-slate-600">{currentUser?.email}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-slate-100 text-[#CE3A39]">
                  {roleConfig.code}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 text-slate-600 hover:text-[#CE3A39] transition font-medium shadow-2xs cursor-pointer"
                title="Cerrar sesión"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cerrar sesión</span>
              </button>
            </div>
          </div>

          <div className="flex-1 w-full max-w-6xl mx-auto flex flex-col items-center pt-2 pb-10">
            <button
              type="button"
              onClick={() => setActiveModule("modules")}
              className="cursor-pointer select-none"
              title="Regresar a Asset Management"
            >
              {!logoError ? (
                <img
                  src="/logo-supplychain.png"
                  alt="SupplyChain México"
                  className="h-20 sm:h-24 w-auto object-contain transition-transform hover:scale-105 duration-300 drop-shadow-xs"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <AnimatedLogo className="h-20 sm:h-24 w-auto" cycleDuration={8} />
              )}
            </button>

            <div className="text-center mt-4 mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EFF3F9] text-[#233762] text-xs font-semibold mb-2">
                <span>Asset Management</span>
                <span className="text-slate-400">/</span>
                <span className="text-[#CE3A39] font-bold">Operación del día</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#233762] tracking-tight">Operación del día</h2>
              <p className="text-sm text-slate-500 mt-1">Selecciona una herramienta operativa para continuar.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-5xl">
              {operacionDiaModules.map(({ name, description, Icon, target, tone, statusBadge }) => {
                const isActive = Boolean(target);
                const iconTone =
                  tone === "red" ? "bg-[#FDF2F2] text-[#CE3A39]" : "bg-[#EFF3F9] text-[#233762]";
                return (
                  <div
                    key={name}
                    onClick={() => {
                      if (!target) {
                        triggerToast(`Módulo ${name} en construcción`, "info");
                        return;
                      }
                      if (!canEnterAsset) {
                        triggerToast(
                          `Acceso restringido: El rol ${roleConfig.label} no tiene autorización para ingresar a este módulo.`,
                          "error"
                        );
                        return;
                      }
                      setActiveModule(target);
                    }}
                    className="bg-white rounded-xl border border-slate-200/80 shadow-md hover:shadow-xl transition-all duration-300 p-6 min-h-[220px] flex flex-col items-center justify-between text-center cursor-pointer group relative overflow-hidden hover:-translate-y-1"
                  >
                    <div
                      className={`absolute bottom-0 left-0 right-0 h-1 transition-colors duration-300 ${isActive
                        ? "bg-[#233762] group-hover:bg-[#CE3A39]"
                        : "bg-transparent group-hover:bg-[#233762]/30"
                        }`}
                    />
                    {statusBadge === "Activo" ? (
                      <span className="absolute top-3.5 right-3.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Activo
                      </span>
                    ) : (
                      <span className="absolute top-3.5 right-3.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                        En desarrollo
                      </span>
                    )}
                    <div className="flex flex-col items-center w-full">
                      <div
                        className={`w-14 h-14 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-all duration-300 shadow-2xs ${iconTone}`}
                      >
                        <Icon className="w-7 h-7" />
                      </div>
                      <h3 className="text-lg font-bold text-[#233762] mt-4">{name}</h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>
                    </div>
                    <span
                      className={`mt-4 inline-flex items-center gap-1.5 text-xs font-bold transition-colors ${isActive ? "text-[#233762] group-hover:text-[#CE3A39]" : "text-slate-400 font-medium"
                        }`}
                    >
                      {isActive ? (
                        <>
                          <span>Ingresar</span>
                          <span className="group-hover:translate-x-1 transition-transform duration-200">→</span>
                        </>
                      ) : (
                        <span>En desarrollo</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : activeModule === "generador_tracking" ? (
        /* ==================================================================== */
        /* VISTA GENERADOR DE TRACKING (VISTA PREVIA EN VIVO + TABLA EDITABLE) */
        /* ==================================================================== */
        <div className="flex-1 min-h-[calc(100vh-6px)] flex flex-col bg-slate-50">
          <header className="border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-xs sticky top-0 z-40">
            <div className="w-full max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
              <div className="flex items-center gap-3 sm:gap-4">
                {/* Botón para volver a Operación del día */}
                <button
                  type="button"
                  onClick={() => setActiveModule("operacion_dia")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-[#EFF3F9] text-[#233762] text-xs font-bold transition shadow-2xs group cursor-pointer"
                  title="Regresar a Operación del día"
                >
                  <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                  <span className="hidden sm:inline">Operación del día</span>
                </button>

                <div className="h-7 w-px bg-slate-200 hidden sm:block" />

                <button
                  type="button"
                  onClick={() => setActiveModule("hub")}
                  className="flex items-center group cursor-pointer focus:outline-none transition-transform hover:scale-[1.03]"
                  title="Regresar al Hub Principal"
                >
                  {!logoError ? (
                    <img
                      src="/logo-supplychain.png"
                      alt="SupplyChain México"
                      className="h-10 sm:h-12 w-auto object-contain transition-transform duration-300 drop-shadow-xs"
                      onError={() => setLogoError(true)}
                    />
                  ) : (
                    <AnimatedLogo className="h-10 sm:h-12 w-auto" cycleDuration={8} />
                  )}
                </button>

                <div className="h-9 w-px bg-slate-200 hidden md:block" />

                <div className="hidden sm:flex items-center gap-2.5">
                  <h1 className="text-base font-extrabold text-[#233762] tracking-wide">
                    Generador de Tracking
                  </h1>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#EFF3F9] text-[#233762] font-mono font-bold border border-[#233762]/20">
                    KYNDRYL & BASF
                  </span>
                </div>
              </div>

              {/* Botones de navegación y sesión */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveModule("hub")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-[#EFF3F9] text-[#233762] text-xs font-bold transition shadow-2xs cursor-pointer"
                  title="Ir al Hub Principal"
                >
                  <Home className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Hub</span>
                </button>

                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs text-slate-700 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-medium font-mono text-slate-600">{currentUser?.email}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-slate-100 text-[#CE3A39]">
                    {roleConfig.code}
                  </span>
                </div>

                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 text-slate-600 hover:text-[#CE3A39] text-xs font-semibold transition shadow-2xs cursor-pointer"
                  title="Cerrar sesión"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Cerrar sesión</span>
                </button>
              </div>
            </div>
          </header>

          {/* Componente Modular TrackingGenerator */}
          <TrackingGenerator
            batchData={batchData}
            apiBase={API_BASE}
            triggerToast={triggerToast}
            userName={currentUser?.name || "Usuario Seko"}
          />
        </div>
      ) : activeModule === "transporte" ? (
        /* ==================================================================== */
        /* VISTA TRANSPORTE - RASTREO DE ENVÍOS MULTI-CARRIER (FEDEX / ESTAFETA) */
        /* ==================================================================== */
        <div className="flex-1 min-h-[calc(100vh-6px)] flex flex-col bg-slate-50">
          <header className="border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-xs sticky top-0 z-40">
            <div className="w-full max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
              <div className="flex items-center gap-3 sm:gap-4">
                {/* Botón para volver a Asset Management */}
                <button
                  type="button"
                  onClick={() => setActiveModule("modules")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-[#EFF3F9] text-[#233762] text-xs font-bold transition shadow-2xs group cursor-pointer"
                  title="Regresar a Asset Management"
                >
                  <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                  <span className="hidden sm:inline">Regresar</span>
                </button>

                <div className="h-7 w-px bg-slate-200 hidden sm:block" />

                <button
                  type="button"
                  onClick={() => setActiveModule("hub")}
                  className="flex items-center group cursor-pointer focus:outline-none transition-transform hover:scale-[1.03]"
                  title="Regresar al Hub Principal"
                >
                  {!logoError ? (
                    <img
                      src="/logo-supplychain.png"
                      alt="SupplyChain México"
                      className="h-10 sm:h-12 w-auto object-contain transition-transform duration-300 drop-shadow-xs"
                      onError={() => setLogoError(true)}
                    />
                  ) : (
                    <AnimatedLogo className="h-10 sm:h-12 w-auto" cycleDuration={8} />
                  )}
                </button>

                <div className="h-9 w-px bg-slate-200 hidden md:block" />

                <div className="hidden sm:flex items-center gap-2.5">
                  <h1 className="text-base font-extrabold text-[#233762] tracking-wide">
                    Transporte · Rastreo de Envíos
                  </h1>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#EFF3F9] text-[#233762] font-mono font-bold border border-[#233762]/20">
                    FEDEX & ESTAFETA
                  </span>
                </div>
              </div>

              {/* Botones de navegación y sesión */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveModule("hub")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-[#EFF3F9] text-[#233762] text-xs font-bold transition shadow-2xs cursor-pointer"
                  title="Ir al Hub Principal"
                >
                  <Home className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Hub</span>
                </button>

                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs text-slate-700 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-medium font-mono text-slate-600">{currentUser?.email}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-slate-100 text-[#CE3A39]">
                    {roleConfig.code}
                  </span>
                </div>

                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 text-slate-600 hover:text-[#CE3A39] text-xs font-semibold transition shadow-2xs cursor-pointer"
                  title="Cerrar sesión"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Cerrar sesión</span>
                </button>
              </div>
            </div>
          </header>

          {/* Componente Modular TransportTracker */}
          <TransportTracker
            initialTracking={initialTracking}
            batchData={batchData}
            apiBase={API_BASE}
            triggerToast={triggerToast}
            userEmail={currentUser?.email || "operador@supplychain.mx"}
            userRole={roleConfig.code}
          />
        </div>
      ) : activeModule === "historial" ? (
        /* ==================================================================== */
        /* VISTA HISTORIAL - TRACKINGS Y CIERRES DEL DÍA (LOCAL)                */
        /* ==================================================================== */
        <div className="flex-1 min-h-[calc(100vh-6px)] flex flex-col bg-slate-50">
          <HistoryView
            apiBase={API_BASE}
            onBack={() => setActiveModule("operacion_dia")}
            onNavigateHome={() => setActiveModule("hub")}
            triggerToast={triggerToast}
            userEmail={currentUser?.email}
          />
        </div>
      ) : activeModule === "calendario" ? (
        /* ==================================================================== */
        /* VISTA CALENDARIO - PLANIFICACIONES, CITAS Y RECOLECCIONES            */
        /* ==================================================================== */
        <div className="flex-1 min-h-[calc(100vh-6px)] flex flex-col bg-slate-50">
          <CalendarPlanner
            onBack={() => setActiveModule("modules")}
            onNavigateHome={() => setActiveModule("hub")}
          />
        </div>
      ) : activeModule === "csm" ? (
        /* ==================================================================== */
        /* VISTA CSM (ACCESIBLE PARA ADMIN Y CSM)                              */
        /* ==================================================================== */
        <div className="flex-1 min-h-[calc(100vh-6px)] flex flex-col py-6 px-6 sm:px-10 max-w-6xl mx-auto w-full">
          <div className="w-full flex items-center justify-between gap-3 text-xs mb-6 pb-3 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setActiveModule("hub")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-[#EFF3F9] text-[#233762] font-bold transition shadow-2xs group cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span>Regresar al Hub</span>
            </button>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 shadow-2xs text-slate-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-medium text-slate-600">{currentUser?.email}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200">
                  {roleConfig.code}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 text-slate-600 hover:text-[#CE3A39] transition font-medium shadow-2xs cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Cerrar sesión</span>
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-extrabold text-[#233762]">Customer Service (CSM)</h1>
                <p className="text-xs text-slate-500 mt-1">
                  Mesa de atención para incidencias de entrega, conciliación de reportes y auditoría de servicio.
                </p>
              </div>

              {canEnterAsset && (
                <button
                  type="button"
                  onClick={() => setActiveModule("asset_management")}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#233762] hover:bg-[#1B2A4A] text-white text-xs font-bold shadow-sm cursor-pointer self-start sm:self-auto"
                >
                  <Zap className="w-4 h-4" />
                  <span>Ver Asset Management</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-[#EFF3F9] text-[#233762] flex items-center justify-center mb-4">
                  <Headset className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Validación de Incidencias</h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Revisión de órdenes con semáforo amarillo (colonia ambigua) o rojo (bloqueo por código postal o teléfono).
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-4">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Cierres Diarios ServiceNow</h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Descarga y auditoría de Cierre.xlsx para conciliar los números de guía con las tareas de ServiceNow.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-red-50 text-[#CE3A39] flex items-center justify-center mb-4">
                  <Truck className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Trazabilidad de Envíos</h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Monitoreo de estatus de guías sincronizadas y reportes de discrepancia para clientes KST.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : activeModule === "almacen" ? (
        /* ==================================================================== */
        /* VISTA ALMACÉN (ACCESIBLE PARA ADMIN Y ALMACEN)                       */
        /* ==================================================================== */
        <div className="flex-1 min-h-[calc(100vh-6px)] flex flex-col py-6 px-6 sm:px-10 max-w-6xl mx-auto w-full">
          <div className="w-full flex items-center justify-between gap-3 text-xs mb-6 pb-3 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setActiveModule("hub")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-[#EFF3F9] text-[#233762] font-bold transition shadow-2xs group cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span>Regresar al Hub</span>
            </button>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 shadow-2xs text-slate-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-medium text-slate-600">{currentUser?.email}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-red-50 text-[#CE3A39] border border-[#CE3A39]/30">
                  {roleConfig.code}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 text-slate-600 hover:text-[#CE3A39] transition font-medium shadow-2xs cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Cerrar sesión</span>
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-extrabold text-[#233762]">Almacén Lerma</h1>
                <p className="text-xs text-slate-500 mt-1">
                  Operación física de empaque, picking, verificación de hardware e impresión de etiquetas de paquetería.
                </p>
              </div>

              {canEnterAsset && (
                <button
                  type="button"
                  onClick={() => setActiveModule("asset_management")}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#CE3A39] hover:bg-[#B02E2D] text-white text-xs font-bold shadow-md shadow-red-200 cursor-pointer self-start sm:self-auto"
                >
                  <FileText className="w-4 h-4" />
                  <span>Ver Asset Management</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-[#FDF2F2] text-[#CE3A39] flex items-center justify-center mb-4">
                  <FileText className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Impresión de Etiquetas PDF</h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Descarga directa del consolidado de etiquetas térmicas Techship para adherir a los paquetes.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-[#EFF3F9] text-[#233762] flex items-center justify-center mb-4">
                  <Package className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Picking y Preparación Física</h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Revisión física del equipo de computación según número de RITM y par de Retorno (-1).
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-4">
                  <Truck className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Despacho y Salida a Ruta</h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Manifiesto de recolección y entrega a la unidad de transporte o paquetería local.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : activeModule === "users" ? (
        /* ==================================================================== */
        /* VISTA GESTIÓN DE USUARIOS (ACCESIBLE PARA ADMIN)                     */
        /* ==================================================================== */
        <div className="flex-1 min-h-[calc(100vh-6px)] flex flex-col py-6 px-6 sm:px-10 max-w-7xl mx-auto w-full">
          <div className="w-full flex items-center justify-between gap-3 text-xs mb-6 pb-3 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setActiveModule("hub")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-[#EFF3F9] text-[#233762] font-bold transition shadow-2xs group cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span>Regresar al Hub</span>
            </button>

            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-[#CE3A39] bg-red-50 border border-[#CE3A39]/30 px-3 py-1 rounded-full">
                ADMINISTRADOR GENERAL
              </span>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-extrabold text-[#233762]">Gestión de Usuarios y Accesos</h1>
                <p className="text-xs text-slate-500 mt-1">
                  Catálogo local de usuarios corporativos y asignación de roles RBAC en tiempo real.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewUserModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#CE3A39] hover:bg-[#B02E2D] text-white text-xs font-bold shadow-md shadow-red-200 cursor-pointer self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" />
                <span>+ Nuevo Usuario</span>
              </button>
            </div>

            {/* Tarjetas Métricas */}
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
                      <th className="py-3 px-4">Cambio de Rol Rápido</th>
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

                          <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-600">{usr.email}</td>

                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border ${usr.role === "ADMIN"
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

                          <td className="py-3 px-4 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleToggleUserActive(usr.id)}
                              disabled={isSelf}
                              title={isSelf ? "No puedes desactivar tu cuenta" : "Alternar estado"}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition cursor-pointer ${usr.isActive
                                ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                                : "bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200"
                                } ${isSelf ? "opacity-70 cursor-not-allowed" : ""}`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${usr.isActive ? "bg-emerald-500" : "bg-slate-400"
                                  }`}
                              />
                              <span>{usr.isActive ? "Activo" : "Inactivo"}</span>
                            </button>
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(usr.id)}
                              disabled={isSelf}
                              title={isSelf ? "No puedes eliminarte a ti mismo" : "Eliminar usuario"}
                              className={`p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer ${isSelf ? "opacity-30 cursor-not-allowed" : ""
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
          </div>

          {/* Modal Crear Nuevo Usuario */}
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
      ) : activeModule === "roles" ? (
        /* ==================================================================== */
        /* VISTA MATRIZ DE ROLES (ACCESIBLE PARA ADMIN)                        */
        /* ==================================================================== */
        <div className="flex-1 min-h-[calc(100vh-6px)] flex flex-col py-6 px-6 sm:px-10 max-w-7xl mx-auto w-full">
          <div className="w-full flex items-center justify-between gap-3 text-xs mb-6 pb-3 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setActiveModule("hub")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-[#EFF3F9] text-[#233762] font-bold transition shadow-2xs group cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span>Regresar al Hub</span>
            </button>

            <span className="text-xs font-mono font-bold text-[#233762] bg-[#EFF3F9] border border-[#233762]/30 px-3 py-1 rounded-full">
              MATRIZ DE ACCESOS RBAC
            </span>
          </div>

          <div className="space-y-8">
            <div>
              <h1 className="text-2xl font-extrabold text-[#233762]">Matriz de Roles y Permisos Operativos (RBAC)</h1>
              <p className="text-xs text-slate-500 mt-1">
                Especificación del alcance operativo y accesos autorizados para cada perfil de la organización.
              </p>
            </div>

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
                      className={`absolute top-0 left-0 w-full h-1.5 ${isRed ? "bg-[#CE3A39]" : "bg-[#233762]"
                        }`}
                    />

                    <div>
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

                      <div className="mt-5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                          Acceso a las 3 Opciones del Hub
                        </span>
                        <div className="space-y-1.5 mt-2">
                          <div className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-slate-50/70">
                            <span className="font-medium text-slate-700">Asset Management</span>
                            {roleKey === "ADMIN" || roleKey === "ASSET_MANAGER" ? (
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

                          <div className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-slate-50/70">
                            <span className="font-medium text-slate-700">CSM (Customer Service)</span>
                            {roleKey === "ADMIN" || roleKey === "CSM" ? (
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

                          <div className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-slate-50/70">
                            <span className="font-medium text-slate-700">Almacén Lerma</span>
                            {roleKey === "ADMIN" || roleKey === "ALMACEN" ? (
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
                        </div>
                      </div>

                      <div className="mt-5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                          Permisos Operativos en Asset Management
                        </span>
                        <div className="space-y-1.5 mt-2">
                          {[
                            { ok: perms.canUpload, label: "Subir reporte SCTASK" },
                            { ok: perms.canEditRows, label: "Editar direcciones SEPOMEX" },
                            { ok: perms.canProcessLive, label: "Timbrar guías Techship (--live)" },
                            { ok: perms.canSyncClosing, label: "Sincronizar cierre y PDF" },
                            { ok: perms.canArchive, label: "Limpiar tabla / Archivar" },
                            { ok: perms.allowedDownloads.cierre_excel, label: "Descargar Cierre_*.xlsx" },
                            { ok: perms.allowedDownloads.etiquetas_pdf, label: "Descargar Etiquetas_*.pdf" },
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
                                  <span>Sí</span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-red-600">
                                  <Lock className="w-3.5 h-3.5 text-red-500" />
                                  <span>No</span>
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
        </div>
      ) : activeModule === "profile" ? (
        /* ==================================================================== */
        /* VISTA PERFIL DE USUARIO                                             */
        /* ==================================================================== */
        <div className="flex-1 min-h-[calc(100vh-6px)] flex flex-col py-6 px-6 sm:px-10 max-w-4xl mx-auto w-full">
          <div className="w-full flex items-center justify-between gap-3 text-xs mb-6 pb-3 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setActiveModule("hub")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-[#EFF3F9] text-[#233762] font-bold transition shadow-2xs group cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span>Regresar al Hub</span>
            </button>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 text-slate-600 hover:text-[#CE3A39] transition font-medium shadow-2xs cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar sesión</span>
            </button>
          </div>

          <div className="space-y-6">
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
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-[#233762] mb-3">Alcance y Permisos de tu Perfil</h3>
              <p className="text-xs text-slate-600 leading-relaxed mb-4">{roleConfig.description}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 flex items-center justify-between">
                  <span>Acceso a Asset Management:</span>
                  <span className="font-bold">{canEnterAsset ? "Autorizado" : "Restringido"}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 flex items-center justify-between">
                  <span>Acceso a CSM:</span>
                  <span className="font-bold">{canEnterCSM ? "Autorizado" : "Restringido"}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 flex items-center justify-between">
                  <span>Acceso a Almacén Lerma:</span>
                  <span className="font-bold">{canEnterAlmacen ? "Autorizado" : "Restringido"}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 flex items-center justify-between">
                  <span>Gestión de Usuarios y Roles:</span>
                  <span className="font-bold">{activeRole === "ADMIN" ? "Autorizado" : "Restringido"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ==================================================================== */
        /* VISTA DASHBOARD DE OPERACIÓN (AUTOMATIZADOR DE OPERACIÓN)            */
        /* ==================================================================== */
        <>
          <header className="border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-xs sticky top-0 z-40">
            <div className="w-full max-w-[1540px] mx-auto px-8 lg:px-12 xl:px-16 h-20 flex items-center justify-between">
              <div className="flex items-center gap-3 sm:gap-4">
                {/* Botón para volver a Operación del día */}
                <button
                  type="button"
                  onClick={() => setActiveModule("operacion_dia")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-[#EFF3F9] text-[#233762] text-xs font-bold transition shadow-2xs group cursor-pointer"
                  title="Regresar a Operación del día"
                >
                  <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                  <span className="hidden sm:inline">Operación del día</span>
                </button>

                <div className="h-7 w-px bg-slate-200 hidden sm:block" />

                <button
                  type="button"
                  onClick={() => setActiveModule("hub")}
                  className="flex items-center group cursor-pointer focus:outline-none transition-transform hover:scale-[1.03]"
                  title="Regresar al Hub Principal"
                >
                  <AnimatedLogo className="h-12 sm:h-14 w-auto" cycleDuration={8} />
                </button>

                <div className="h-9 w-px bg-slate-200 hidden md:block" />

                <div className="hidden sm:flex items-center gap-2.5">
                  <h1 className="text-base font-extrabold text-[#233762] tracking-wide">
                    Automatizador de operación
                  </h1>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#EFF3F9] text-[#233762] font-mono font-bold border border-[#233762]/20">
                    KST / Kyndryl
                  </span>
                </div>
              </div>

              {/* Usuario activo y Cerrar sesión */}
              <div className="flex items-center gap-3">
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-700">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-medium font-mono text-slate-600">{currentUser?.email}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-slate-200 text-[#CE3A39]">
                    {roleConfig.code}
                  </span>
                </div>

                <button
                  onClick={() => setActiveModule("hub")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-[#EFF3F9] text-[#233762] text-xs font-bold transition cursor-pointer"
                  title="Ir al Hub"
                >
                  <Home className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Hub</span>
                </button>

                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 text-slate-600 hover:text-[#CE3A39] text-xs font-semibold transition shadow-2xs cursor-pointer"
                  title="Cerrar sesión"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Cerrar sesión</span>
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 w-full max-w-[1540px] mx-auto px-8 lg:px-12 xl:px-16 py-6 space-y-6 relative z-10">
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
                disabled={actionLoading === "archive" || !hasOrders}
                title="Archivar el lote actual y limpiar la tabla (se resguarda en data/archive)"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-[#FDF2F2] text-[#CE3A39] border border-[#CE3A39]/30 text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs cursor-pointer"
              >
                <Archive className="w-4 h-4" />
                <span>
                  {actionLoading === "archive" ? "Limpiando..." : "Limpiar tabla / Archivar"}
                </span>
              </button>
            </div>

            {/* ZONA 1: Ingesta (4 col) y 4 Tarjetas KPI (2 col c/u = 8 col) - Altura Compactada y Equilibrada */}
            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-5 items-stretch">
              {/* Dropzone de Ingesta (xl:col-span-4) alineado a la misma altura h-full min-h-[135px] */}
              <div className="md:col-span-2 xl:col-span-4 bg-white border-2 border-dashed border-slate-300 hover:border-[#233762] rounded-2xl p-5 flex flex-col justify-between shadow-sm transition-colors relative overflow-hidden group h-full min-h-[135px]">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".xlsx,.xls"
                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
                  disabled={uploading}
                />
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-[#EFF3F9] text-[#233762] border border-[#233762]/20 group-hover:scale-105 transition-transform shrink-0">
                    <UploadCloud className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-[#233762]">Ingestar Reporte ServiceNow</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Arrastra el archivo SCTASK_SHP_Combined_Report_MX_*.xlsx</p>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-mono truncate max-w-[200px]" title={batchData?.batch_filename}>
                    {batchData?.batch_filename ? batchData.batch_filename : "Sin archivo activo"}
                  </span>
                  <button
                    type="button"
                    className="px-3.5 py-1.5 rounded-lg bg-[#233762] hover:bg-[#1B2A4A] text-white font-semibold shadow-xs transition cursor-pointer"
                  >
                    {uploading ? "Procesando..." : "Examinar..."}
                  </button>
                </div>
              </div>

              {/* Tarjeta KPI 1: Total Órdenes */}
              <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 min-h-[135px] flex flex-col justify-between shadow-sm relative overflow-hidden transition-all hover:shadow-md">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-[#233762]" />
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#233762]">Total Órdenes</span>
                  <Package className="w-4 h-4 text-[#233762]" />
                </div>
                <div>
                  <span className="text-4xl font-extrabold tracking-tight font-mono text-[#233762] my-2 block">
                    {batchData?.metrics.total_orders || 0}
                  </span>
                  <p className="text-[11px] text-slate-400">Ida y Retorno (-1)</p>
                </div>
              </div>

              {/* Tarjeta KPI 2: Confirmadas 100% */}
              <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 min-h-[135px] flex flex-col justify-between shadow-sm relative overflow-hidden transition-all hover:shadow-md">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-emerald-500" />
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Confirmadas</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <span className="text-4xl font-extrabold tracking-tight font-mono text-emerald-600 my-2 block">
                    {batchData?.metrics.confirmed_100 || 0}
                  </span>
                  <p className="text-[11px] text-emerald-600/80">Semáforo Verde</p>
                </div>
              </div>

              {/* Tarjeta KPI 3: Por Revisar */}
              <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 min-h-[135px] flex flex-col justify-between shadow-sm relative overflow-hidden transition-all hover:shadow-md">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-amber-500" />
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Por Revisar</span>
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <span className="text-4xl font-extrabold tracking-tight font-mono text-amber-600 my-2 block">
                    {batchData?.metrics.review || 0}
                  </span>
                  <p className="text-[11px] text-amber-700/80">Semáforo Amarillo</p>
                </div>
              </div>

              {/* Tarjeta KPI 4: Bloqueadas por Error */}
              <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 min-h-[135px] flex flex-col justify-between shadow-sm relative overflow-hidden transition-all hover:shadow-md">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-[#CE3A39]" />
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#CE3A39]">Bloqueadas</span>
                  <XCircle className="w-4 h-4 text-[#CE3A39]" />
                </div>
                <div>
                  <span className="text-4xl font-extrabold tracking-tight font-mono text-[#CE3A39] my-2 block">
                    {batchData?.metrics.error_blocked || 0}
                  </span>
                  <p className="text-[11px] text-[#CE3A39]/80">Teléfono / CP Inválido</p>
                </div>
              </div>
            </section>

            {/* ZONA 2: Barra Maestra de Acciones Techship y Descargas - Mejor Distribución y Bloque Identificador */}
            <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-4.5 shadow-sm flex flex-wrap items-center justify-between gap-4">
              {/* Lado Izquierdo: Bloque Identificador + Botones de Acción Operativa */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/90 mr-1 shadow-2xs">
                  <Zap className="w-3.5 h-3.5 text-[#CE3A39]" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                    FLUJO TECHSHIP API:
                  </span>
                </div>

                <button
                  onClick={handleTechshipDryRun}
                  disabled={!hasOrders || actionLoading === "dry_run" || actionLoading === "live"}
                  title="Verifica en Techship cuáles órdenes ya tienen guía (anti-duplicados) y cuáles están listas sin consumir guías reales"
                  className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#EFF3F9] hover:bg-[#E2E8F0] text-[#233762] border border-[#233762]/25 text-xs sm:text-sm font-bold shadow-2xs transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-[#233762]" />
                  <span>{actionLoading === "dry_run" ? "Verificando..." : "Simular / Anti-Duplicados"}</span>
                </button>

                <button
                  onClick={() => setShowLiveModal(true)}
                  disabled={!hasOrders || actionLoading === "live"}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#CE3A39] hover:bg-[#B02E2D] text-white text-xs sm:text-sm font-bold shadow-md shadow-red-200 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Zap className="w-4 h-4 fill-white" />
                  <span>{actionLoading === "live" ? "Timbrando..." : "1. Timbrar Guías en Techship"}</span>
                </button>

                <button
                  onClick={handleSyncClosing}
                  disabled={!hasOrders || actionLoading === "sync"}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Truck className="w-4 h-4" />
                  <span>{actionLoading === "sync" ? "Sincronizando..." : "2. Sincronizar Cierre y Etiquetas"}</span>
                </button>
              </div>

              {/* Lado Derecho: Descargas Agrupadas */}
              {batchData ? (
                <div className="flex flex-wrap items-center gap-2 border-t lg:border-t-0 lg:border-l border-slate-200 pt-3 lg:pt-0 lg:pl-4">
                  <span className="text-xs text-slate-500 font-bold mr-1 hidden sm:inline">Descargas:</span>

                  <button
                    onClick={() => handleDownload("cierre_excel")}
                    disabled={batchData.files_available?.cierre_excel === false}
                    title={
                      batchData.files_available?.cierre_excel === false
                        ? "Disponible tras ejecutar '2. Sincronizar Cierre y Etiquetas'"
                        : "Descargar Cierre_*.xlsx (ServiceNow 12 columnas)"
                    }
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#EFF3F9] hover:bg-[#E2E8F0] text-[#233762] border border-[#233762]/30 text-xs font-mono font-bold transition shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-[#233762]" />
                    <span>Cierre.xlsx</span>
                  </button>

                  <button
                    onClick={() => handleDownload("etiquetas_pdf")}
                    disabled={batchData.files_available?.etiquetas_pdf === false}
                    title={
                      batchData.files_available?.etiquetas_pdf === false
                        ? "Disponible tras ejecutar '2. Sincronizar Cierre y Etiquetas'"
                        : "Descargar o imprimir PDF consolidado de etiquetas"
                    }
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FDF2F2] hover:bg-[#FEE2E2] text-[#CE3A39] border border-[#CE3A39]/30 text-xs font-mono font-bold transition shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#CE3A39]" />
                    <span>Etiquetas.pdf</span>
                  </button>

                  <button
                    onClick={() => handleDownload("techship_excel")}
                    disabled={batchData.files_available?.techship_excel === false}
                    title="Descargar Guias_Techship_Importada_*.xlsx"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-mono font-medium transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-slate-600" />
                    <span>Techship.xlsx</span>
                  </button>

                  <button
                    onClick={() => handleDownload("auditoria_excel")}
                    disabled={batchData.files_available?.auditoria_excel === false}
                    title="Descargar Auditoria_Direcciones_*.xlsx (Detalle SEPOMEX e Incidencias)"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-mono font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-amber-700" />
                    <span>Auditoría.xlsx</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 border-t lg:border-t-0 lg:border-l border-slate-200 pt-3 lg:pt-0 lg:pl-4 text-xs text-slate-400 italic">
                  <FileSpreadsheet className="w-3.5 h-3.5 opacity-50" />
                  <span>Sin archivos para descargar</span>
                </div>
              )}
            </section>

            {/* ZONA 3: Tabla de Órdenes y Auditoría */}
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
              <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50/80">
                <div
                  className={`flex items-center gap-1.5 p-1 rounded-xl bg-slate-200/70 text-xs font-bold transition-opacity ${!hasOrders ? "opacity-50" : ""
                    }`}
                >
                  <button
                    disabled={!hasOrders}
                    onClick={() => setActiveTab("ALL")}
                    className={`px-3 py-1.5 rounded-lg transition ${!hasOrders
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
                    className={`px-3 py-1.5 rounded-lg transition ${!hasOrders
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
                    className={`px-3 py-1.5 rounded-lg transition ${!hasOrders
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
                    className={`px-3 py-1.5 rounded-lg transition hidden sm:inline ${!hasOrders
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
                    className={`px-3 py-1.5 rounded-lg transition hidden sm:inline ${!hasOrders
                      ? "text-slate-400 cursor-not-allowed"
                      : activeTab === "RETURN"
                        ? "bg-slate-700 text-white"
                        : "text-slate-600 hover:text-slate-900 cursor-pointer"
                      }`}
                  >
                    Solo Retorno ({returnCount})
                  </button>
                </div>

                {/* Botón para eliminar órdenes seleccionadas */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRequestDeleteSelectedOrders}
                    disabled={!hasOrders || selectedOrderIds.size === 0}
                    title="Eliminar órdenes seleccionadas del lote para que no se procesen"
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition shadow-2xs ${selectedOrderIds.size > 0
                      ? "border-red-200 bg-red-50 text-[#CE3A39] hover:bg-red-100 cursor-pointer"
                      : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                      }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>
                      Eliminar seleccionadas {selectedOrderIds.size > 0 ? `(${selectedOrderIds.size})` : ""}
                    </span>
                  </button>
                </div>

                <div className="relative flex-1 max-w-xs">
                  <Search
                    className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${!hasOrders ? "text-slate-300" : "text-slate-400"
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

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#233762] text-white font-semibold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-3 w-10 text-center select-none">
                        <input
                          type="checkbox"
                          disabled={!hasOrders || filteredOrders.length === 0}
                          checked={
                            filteredOrders.length > 0 &&
                            filteredOrders.every((o) => selectedOrderIds.has(o.order_id))
                          }
                          onChange={handleToggleSelectAllOrders}
                          className="w-3.5 h-3.5 rounded text-[#233762] focus:ring-0 cursor-pointer"
                          aria-label="Seleccionar todas las órdenes"
                        />
                      </th>
                      <th className="py-3 px-4">Tipo</th>
                      <th className="py-3 px-4">Orden (RITM)</th>
                      <th className="py-3 px-4">Semáforo</th>
                      <th className="py-3 px-4">Destinatario / Empleado</th>
                      <th className="py-3 px-4">Teléfono</th>
                      <th className="py-3 px-4">Dirección (1: Calle / 2: Col / 3: Ref)</th>
                      <th className="py-3 px-4">CP / Ciudad</th>
                      <th className="py-3 px-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-400 font-medium">
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

                        const isSelected = selectedOrderIds.has(order.order_id);

                        return (
                          <tr
                            key={order.order_id}
                            className={`transition-colors ${isSelected
                              ? "bg-blue-50/70 hover:bg-blue-100/60"
                              : isError
                                ? "bg-red-50/50 hover:bg-red-50/80"
                                : isWarning
                                  ? "bg-amber-50/30 hover:bg-amber-50/60"
                                  : "hover:bg-slate-50"
                              }`}
                          >
                            <td className="py-3 px-3 text-center select-none">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelectOrder(order.order_id)}
                                className="w-3.5 h-3.5 rounded text-[#233762] focus:ring-0 cursor-pointer"
                                aria-label={`Seleccionar orden ${order.order_id}`}
                              />
                            </td>
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

                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="font-mono font-bold text-[#233762]">{order.order_id}</div>
                              {order.tracking_number && (
                                <div
                                  className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono font-semibold"
                                  title="Guía Estafeta asignada en Techship"
                                >
                                  <Truck className="w-2.5 h-2.5" />
                                  <span>{order.tracking_number}</span>
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="flex flex-col items-start gap-0.5">
                                {isGreen && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[11px]">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    100% Confirmada
                                  </span>
                                )}
                                {isWarning && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-bold text-[11px]">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    Revisar Dirección
                                  </span>
                                )}
                                {isError && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-bold text-[11px]">
                                    <XCircle className="w-3.5 h-3.5" />
                                    Error / Bloqueada
                                  </span>
                                )}
                                {!isGreen && order.incidents && order.incidents.length > 0 && (
                                  <span
                                    className="text-[10px] text-slate-500 max-w-[190px] truncate pl-1"
                                    title={order.incidents.join(" | ")}
                                  >
                                    {order.incidents[0].replace(/^\[(ERROR|REVISAR|CORREGIDO)\]\s*/, "")}
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="font-bold text-slate-800">{order.recipient_name}</div>
                              <div className="text-[11px] text-slate-500 truncate max-w-[180px]">{order.email}</div>
                            </td>

                            <td className="py-3 px-4 whitespace-nowrap font-mono">
                              {order.phone.includes("ERROR") || order.phone.length !== 10 ? (
                                <span className="text-red-700 font-bold bg-red-100 px-1.5 py-0.5 rounded border border-red-300">
                                  {order.phone || "FALTA"}
                                </span>
                              ) : (
                                <span className="text-slate-700 font-semibold">{order.phone}</span>
                              )}
                            </td>

                            <td className="py-3 px-4 max-w-xs">
                              <div className="text-slate-800 font-mono text-[11px] truncate font-semibold" title={order.address1}>
                                <span className="text-slate-400 font-normal mr-1">1:</span>
                                {order.address1}
                              </div>
                              <div className="text-[11px] text-slate-600 truncate" title={order.address2}>
                                <span className="text-slate-400 font-mono mr-1">2:</span>
                                {order.address2 || "—"}
                              </div>
                              {order.address3 && (
                                <div
                                  className="text-[10px] text-[#233762] bg-[#EFF3F9] px-1.5 py-0.5 rounded mt-0.5 truncate font-mono border border-[#233762]/15"
                                  title={`Dirección 3 (Referencias / Int): ${order.address3}`}
                                >
                                  <span className="font-bold mr-1">3:</span>
                                  {order.address3}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="font-mono text-[#233762] font-bold">CP {order.zip}</div>
                              <div className="text-[11px] text-slate-500">
                                {order.city}, {order.state}
                              </div>
                            </td>

                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(order)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white hover:bg-[#233762] hover:text-white text-[#233762] border border-[#233762]/30 text-xs font-bold transition shadow-2xs cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  <span>Corregir</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRequestDeleteSingleOrder(order)}
                                  title="Eliminar fila del lote (no procesar)"
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white hover:bg-red-50 text-slate-500 hover:text-[#CE3A39] border border-slate-200 hover:border-red-200 text-xs font-semibold transition shadow-2xs cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-[#CE3A39]" />
                                  <span>Eliminar</span>
                                </button>
                              </div>
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

          {/* MODAL DE CONFIRMACIÓN: ELIMINAR FILAS DEL LOTE OPERATIVO */}
          {deleteOrderDialog && (
            <div
              className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
              onClick={() => setDeleteOrderDialog(null)}
            >
              <div
                className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-red-50 border border-red-100 text-[#CE3A39] flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-extrabold text-slate-900">
                        {deleteOrderDialog.mode === "single"
                          ? "¿Estás seguro de eliminar esta orden del lote?"
                          : `¿Estás seguro de eliminar ${deleteOrderDialog.count} orden(es) del lote?`}
                      </h3>
                      <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                        {deleteOrderDialog.mode === "single" ? (
                          <>
                            Se excluirá la orden{" "}
                            <span className="font-bold font-mono text-slate-900">{deleteOrderDialog.targetLabel}</span>{" "}
                            del lote operativo para que no sea timbrada ni procesada en Techship.
                          </>
                        ) : (
                          <>
                            Estás a punto de excluir{" "}
                            <span className="font-bold text-slate-900">{deleteOrderDialog.count} orden(es)</span> del lote
                            operativo para que no sean timbradas ni procesadas en Techship.
                          </>
                        )}
                      </p>

                      {/* Opción de eliminar contraparte (-1) */}
                      <label className="flex items-start gap-2.5 mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 cursor-pointer hover:bg-slate-100/70 transition">
                        <input
                          type="checkbox"
                          checked={deleteOrderDialog.includeCounterparts}
                          onChange={(e) =>
                            setDeleteOrderDialog({
                              ...deleteOrderDialog,
                              includeCounterparts: e.target.checked,
                            })
                          }
                          className="w-4 h-4 rounded text-[#233762] focus:ring-[#233762] border-slate-300 mt-0.5 cursor-pointer"
                        />
                        <span className="leading-snug">
                          Eliminar también su orden par de Retorno (<span className="font-mono font-bold">-1</span>) para evitar envíos huérfanos.
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      onClick={() => setDeleteOrderDialog(null)}
                      className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading === "delete_order"}
                      onClick={handleConfirmDeleteOrders}
                      className="px-4 py-2 rounded-xl bg-[#CE3A39] hover:bg-[#B02E2D] text-white text-xs font-bold transition shadow-sm shadow-red-200 cursor-pointer disabled:opacity-50"
                    >
                      {actionLoading === "delete_order" ? "Eliminando..." : "Sí, eliminar del lote"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MODAL DE EDICIÓN EN CALIENTE */}
          {editingOrder && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
              <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[#EFF3F9] text-[#233762]">
                      <Edit3 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold text-[#233762] flex items-center gap-2">
                        Corregir Orden <span className="font-mono text-[#CE3A39]">{editingOrder.order_id}</span>
                        <span className="text-xs font-medium text-slate-500">({editingOrder.recipient_name})</span>
                      </h3>
                      <p className="text-xs text-slate-500">
                        Edita las 3 líneas de dirección para la guía Estafeta y re-evalúa con SEPOMEX en tiempo real.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditingOrder(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSavePatch} className="p-6 space-y-3.5 overflow-y-auto">
                  {/* Banner de incidencias detectadas en la orden */}
                  {editingOrder.incidents && editingOrder.incidents.length > 0 && (
                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-amber-800">
                        <AlertTriangle className="w-4 h-4 text-[#CE3A39] shrink-0" />
                        <span>Diagnóstico SEPOMEX / Incidencias detectadas en esta orden:</span>
                      </div>
                      <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-900/90 font-mono">
                        {editingOrder.incidents.map((inc, i) => (
                          <li key={i}>{inc}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-[#233762]">
                          Teléfono de Contacto (10 dígitos)
                        </label>
                        <span
                          className={`text-[10px] font-mono font-bold ${
                            editFormData.phone.replace(/\D/g, "").length === 10
                              ? "text-emerald-600"
                              : "text-[#CE3A39]"
                          }`}
                        >
                          {editFormData.phone.replace(/\D/g, "").length}/10 dígitos
                        </span>
                      </div>
                      <div className="relative">
                        <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          required
                          maxLength={10}
                          value={editFormData.phone}
                          onChange={(e) =>
                            setEditFormData({ ...editFormData, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })
                          }
                          className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-slate-50 border border-slate-300 font-mono text-slate-900 focus:outline-none focus:border-[#233762]"
                          placeholder="Ej. 5576682213"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#233762] mb-1">
                        Servicio Estafeta (Techship)
                      </label>
                      <select
                        value={editFormData.service_code}
                        onChange={(e) => setEditFormData({ ...editFormData, service_code: e.target.value })}
                        className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 border border-slate-300 font-semibold text-slate-800 focus:outline-none focus:border-[#233762]"
                      >
                        <option value="70">70 - Estafeta Express (Día Siguiente)</option>
                        <option value="60">60 - Estafeta Terrestre (Estándar)</option>
                      </select>
                    </div>
                  </div>

                  {/* Línea 1: Address 1 */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-[#233762]">
                        Dirección 1: Calle y Número Exterior (Address 1)
                      </label>
                      <span className="text-[10px] font-mono text-slate-500">
                        {editFormData.address1.length}/50 chars
                      </span>
                    </div>
                    <input
                      type="text"
                      required
                      maxLength={50}
                      value={editFormData.address1}
                      onChange={(e) => setEditFormData({ ...editFormData, address1: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 border border-slate-300 font-mono text-slate-900 focus:outline-none focus:border-[#233762]"
                      placeholder="Calle y número exterior..."
                    />
                  </div>

                  {/* Línea 2: Address 2 (Colonia con Selector Oficial SEPOMEX) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-[#233762]">
                        Dirección 2: Colonia / Asentamiento Oficial SEPOMEX (Address 2)
                      </label>
                      <span className="text-[10px] font-mono text-slate-500">
                        {editFormData.address2.length}/50 chars
                      </span>
                    </div>
                    {sepomexColonias.length > 0 && (
                      <div className="mb-1.5">
                        <select
                          value={sepomexColonias.includes(editFormData.address2) ? editFormData.address2 : ""}
                          onChange={(e) => {
                            if (e.target.value) {
                              setEditFormData({ ...editFormData, address2: e.target.value.slice(0, 50) });
                            }
                          }}
                          className="w-full px-3 py-1.5 text-xs rounded-xl bg-[#EFF3F9] border border-[#233762]/25 text-[#233762] font-semibold focus:outline-none focus:border-[#233762] cursor-pointer"
                        >
                          <option value="">
                            ✨ Seleccionar colonia oficial del CP {editFormData.zip} ({sepomexColonias.length} disponibles)...
                          </option>
                          {sepomexColonias.map((col, idx) => (
                            <option key={idx} value={col}>
                              {col}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <input
                      type="text"
                      maxLength={50}
                      value={editFormData.address2}
                      onChange={(e) => setEditFormData({ ...editFormData, address2: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-[#233762]"
                      placeholder="Colonia oficial..."
                    />
                  </div>

                  {/* Línea 3: Address 3 (Referencias, Edificio, Piso, Interior) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-[#233762] flex items-center gap-1.5">
                        <span>Dirección 3: Referencias / Edificio / Piso / Interior (Address 3)</span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono">
                          Impresa en Guía
                        </span>
                      </label>
                      <span className="text-[10px] font-mono text-slate-500">
                        {editFormData.address3.length}/50 chars
                      </span>
                    </div>
                    <input
                      type="text"
                      maxLength={50}
                      value={editFormData.address3}
                      onChange={(e) => setEditFormData({ ...editFormData, address3: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 border border-slate-300 font-mono text-slate-900 focus:outline-none focus:border-[#233762]"
                      placeholder="Ej. Edificio B Depto 302, Entre calles X y Y, Portón negro..."
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#233762] mb-1">
                        Código Postal (Auto-SEPOMEX)
                      </label>
                      <input
                        type="text"
                        maxLength={5}
                        value={editFormData.zip}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "").slice(0, 5);
                          setEditFormData({ ...editFormData, zip: val });
                          if (val.length === 5) {
                            void fetchSepomexByCp(val, true);
                          }
                        }}
                        className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 border border-slate-300 font-mono text-[#233762] font-bold focus:outline-none focus:border-[#233762]"
                        placeholder="5 dígitos"
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
                    <div className="flex items-center gap-2 pt-1">
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

                  <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingOrder(null)}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-semibold transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={actionLoading === "patch"}
                        onClick={() => void submitOrderPatch(true)}
                        className="px-4 py-2 rounded-xl bg-[#EFF3F9] hover:bg-[#E2E8F0] text-[#233762] border border-[#233762]/30 text-xs sm:text-sm font-bold transition cursor-pointer disabled:opacity-50"
                      >
                        Guardar y Siguiente con Incidencia →
                      </button>
                      <button
                        type="submit"
                        disabled={actionLoading === "patch"}
                        className="px-5 py-2 rounded-xl bg-[#233762] hover:bg-[#1B2A4A] text-white text-xs sm:text-sm font-bold shadow-sm transition cursor-pointer disabled:opacity-50"
                      >
                        {actionLoading === "patch" ? "Guardando..." : "Guardar y Revalidar"}
                      </button>
                    </div>
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
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleArchiveConfirm}
                    disabled={actionLoading === "archive"}
                    className="px-5 py-2 rounded-xl bg-[#CE3A39] hover:bg-[#B02E2D] text-white text-xs font-bold shadow-sm transition disabled:opacity-50 cursor-pointer"
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
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleTechshipProcess}
                    className="px-5 py-2 rounded-xl bg-[#CE3A39] hover:bg-[#B02E2D] text-white text-xs font-bold shadow-md shadow-red-200 transition cursor-pointer"
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
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition cursor-pointer"
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
                      {simResults.details?.map((item: any, idx: number) => {
                        const isSuccess =
                          item.status === "OK" ||
                          item.status === "LISTA" ||
                          item.status === "TIMBRADA" ||
                          item.status === "SIMULACION_OK";
                        const isDuplicate = item.status === "DUPLICADO";

                        return (
                          <div key={idx} className="p-3 flex items-center justify-between hover:bg-slate-50">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-[#233762]">{item.order}</span>
                                {item.type && (
                                  <span className="text-[11px] text-slate-500 font-normal">({item.type})</span>
                                )}
                                {item.tracking && item.tracking !== "Generada" && (
                                  <span className="text-[10px] font-mono font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                    Guía: {item.tracking}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-600 font-sans mt-0.5">{item.message}</div>
                            </div>
                            <div>
                              {isSuccess ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                                  {item.status === "TIMBRADA" ? "TIMBRADA" : "ACEPTADA"}
                                </span>
                              ) : isDuplicate ? (
                                <span className="px-2 py-0.5 rounded bg-[#EFF3F9] text-[#233762] font-bold text-[10px]">
                                  YA EXISTE {item.shipment_id ? `(ID ${item.shipment_id})` : ""}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-red-100 text-[#CE3A39] font-bold text-[10px]">
                                  BLOQUEADA
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
                  <button
                    onClick={() => setSimResults(null)}
                    className="px-4 py-1.5 rounded-xl bg-[#233762] text-white text-xs font-bold transition hover:bg-[#1B2A4A] cursor-pointer"
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
