"use client";

import React, { useState, useMemo } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  Truck,
  Package,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  X,
  Filter,
  ArrowLeft,
  Home,
  CalendarDays,
  User,
} from "lucide-react";

export type EventCategory = "entrega" | "recoleccion" | "cierre" | "mantenimiento";

export interface ScheduledEvent {
  id: string;
  title: string;
  category: EventCategory;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  reference?: string; // SCTASK, Guía, etc.
  carrierOrLocation?: string;
  contact?: string;
  status: "programada" | "confirmada" | "completada" | "cancelada";
  notes?: string;
}

const CATEGORY_CONFIG: Record<
  EventCategory,
  { label: string; bgBadge: string; textBadge: string; dotColor: string; icon: React.ElementType }
> = {
  entrega: {
    label: "Cita de Entrega",
    bgBadge: "bg-[#EFF3F9]",
    textBadge: "text-[#233762] border-[#233762]/20",
    dotColor: "bg-[#233762]",
    icon: Package,
  },
  recoleccion: {
    label: "Recolección (Pickup)",
    bgBadge: "bg-[#FDF2F2]",
    textBadge: "text-[#CE3A39] border-[#CE3A39]/20",
    dotColor: "bg-[#CE3A39]",
    icon: Truck,
  },
  cierre: {
    label: "Cierre de Lote",
    bgBadge: "bg-emerald-50",
    textBadge: "text-emerald-700 border-emerald-200",
    dotColor: "bg-emerald-600",
    icon: FileSpreadsheet,
  },
  mantenimiento: {
    label: "Mantenimiento / Cita Técnica",
    bgBadge: "bg-amber-50",
    textBadge: "text-amber-800 border-amber-200",
    dotColor: "bg-amber-500",
    icon: AlertCircle,
  },
};

const INITIAL_EVENTS: ScheduledEvent[] = [
  {
    id: "evt-1",
    title: "Recolección Estafeta (Lote KST 58 órdenes)",
    category: "recoleccion",
    date: "2026-11-03",
    time: "16:30",
    reference: "Lote MX_11-03",
    carrierOrLocation: "Estafeta Express - Almacén Cuautitlán",
    contact: "Operador de Ruta #4",
    status: "confirmada",
    notes: "Lote preparado y embalado con manifiesto de 58 guías.",
  },
  {
    id: "evt-2",
    title: "Cita Entrega Masiva Laptops Kyndryl",
    category: "entrega",
    date: "2026-11-04",
    time: "10:00",
    reference: "SCTASK009412",
    carrierOrLocation: "Torre Mayor Reforma 505, Piso 14",
    contact: "Coordinador TI Kyndryl",
    status: "programada",
    notes: "Acceso con identificación oficial requerida en recepción.",
  },
  {
    id: "evt-3",
    title: "Cierre Semanal y Manifiesto ServiceNow",
    category: "cierre",
    date: "2026-11-06",
    time: "18:00",
    reference: "Cierre_06_Noviembre_2026",
    carrierOrLocation: "Seko Logistics Hub México",
    contact: "Equipo Automatización N8N",
    status: "programada",
    notes: "Consolidación de trackings semanales para carga a ServiceNow.",
  },
  {
    id: "evt-4",
    title: "Revisión y Diagnóstico de Equipos en Retorno",
    category: "mantenimiento",
    date: "2026-11-09",
    time: "11:30",
    reference: "RET-2026-88",
    carrierOrLocation: "Laboratorio Técnico Kyndryl",
    contact: "Soporte Nivel 2",
    status: "programada",
    notes: "Revisión de 12 equipos con reporte de pantalla y teclado.",
  },
  {
    id: "evt-5",
    title: "Recolección Programada FedEx Express",
    category: "recoleccion",
    date: "2026-11-11",
    time: "14:00",
    reference: "PICKUP-FX-9921",
    carrierOrLocation: "Oficinas Toluca Lerma",
    contact: "FedEx Pickup Dispatch",
    status: "programada",
    notes: "Envío urgente con horario límite 15:00 hrs.",
  },
];

interface CalendarPlannerProps {
  onBack: () => void;
  onNavigateHome?: () => void;
}

export default function CalendarPlanner({ onBack, onNavigateHome }: CalendarPlannerProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date(2026, 10, 3)); // Noviembre 2026
  const [selectedDate, setSelectedDate] = useState<string>("2026-11-03");
  const [events, setEvents] = useState<ScheduledEvent[]>(INITIAL_EVENTS);
  const [filterCategory, setFilterCategory] = useState<EventCategory | "all">("all");
  const [showModal, setShowModal] = useState<boolean>(false);

  // Formulario de nueva cita
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState<EventCategory>("entrega");
  const [formDate, setFormDate] = useState(selectedDate);
  const [formTime, setFormTime] = useState("10:00");
  const [formReference, setFormReference] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formContact, setFormContact] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  const dayNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  // Días del mes actual
  const { calendarDays, prevMonthDaysCount } = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);

    // Ajuste para iniciar en Lunes (0 = Dom en JS, convertimos a 0 = Lun)
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const totalDays = lastDay.getDate();
    const days: { dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = [];

    // Días del mes anterior para rellenar
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const m = currentMonth === 0 ? 11 : currentMonth - 1;
      const y = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ dateStr, dayNum: d, isCurrentMonth: false });
    }

    // Días del mes actual
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ dateStr, dayNum: d, isCurrentMonth: true });
    }

    // Días del siguiente mes para completar semanas (múltiplo de 7)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const m = currentMonth === 11 ? 0 : currentMonth + 1;
      const y = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ dateStr, dayNum: d, isCurrentMonth: false });
    }

    return { calendarDays: days, prevMonthDaysCount: startDayOfWeek };
  }, [currentYear, currentMonth]);

  // Mapa de eventos por fecha
  const eventsByDate = useMemo(() => {
    const map: Record<string, ScheduledEvent[]> = {};
    events.forEach((ev) => {
      if (filterCategory === "all" || ev.category === filterCategory) {
        if (!map[ev.date]) map[ev.date] = [];
        map[ev.date].push(ev);
      }
    });
    return map;
  }, [events, filterCategory]);

  // Eventos del día seleccionado
  const selectedDayEvents = useMemo(() => {
    return events
      .filter((ev) => ev.date === selectedDate)
      .filter((ev) => filterCategory === "all" || ev.category === filterCategory)
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [events, selectedDate, filterCategory]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const handleToday = () => {
    const today = new Date(2026, 10, 3);
    setCurrentDate(today);
    setSelectedDate("2026-11-03");
  };

  const handleSaveEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    const newEv: ScheduledEvent = {
      id: `evt-${Date.now()}`,
      title: formTitle.trim(),
      category: formCategory,
      date: formDate,
      time: formTime || "10:00",
      reference: formReference.trim() || undefined,
      carrierOrLocation: formLocation.trim() || undefined,
      contact: formContact.trim() || undefined,
      status: "programada",
      notes: formNotes.trim() || undefined,
    };

    setEvents((prev) => [...prev, newEv]);
    setSelectedDate(formDate);
    setShowModal(false);
    // Limpiar form
    setFormTitle("");
    setFormReference("");
    setFormLocation("");
    setFormContact("");
    setFormNotes("");
  };

  const handleToggleStatus = (id: string) => {
    setEvents((prev) =>
      prev.map((ev) => {
        if (ev.id !== id) return ev;
        const nextStatus = ev.status === "completada" ? "programada" : "completada";
        return { ...ev, status: nextStatus };
      })
    );
  };

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6 animate-fade-in">
      {/* 1. Header con navegación institucional y botón de acción */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-slate-500 hover:text-[#233762] hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
            title="Volver"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          {onNavigateHome && (
            <button
              onClick={onNavigateHome}
              className="p-2 text-slate-500 hover:text-[#233762] hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
              title="Ir al Menú Principal"
            >
              <Home className="w-5 h-5" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-[#EFF3F9] text-[#233762] rounded-lg">
                <CalendarDays className="w-5 h-5" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold text-[#233762] tracking-tight">
                Calendario de Planificaciones y Citas
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Agenda de citas de entrega, recolecciones de paquetería (Pickups) y cierres de lote programados.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={() => {
              setFormDate(selectedDate);
              setShowModal(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#233762] hover:bg-[#1a2b4f] text-white text-xs font-bold rounded-lg shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Cita / Planificación</span>
          </button>
        </div>
      </div>

      {/* 2. Barra de Filtros por Categoría */}
      <div className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-xl border border-slate-200 text-xs shadow-2xs">
        <span className="text-slate-500 font-semibold flex items-center gap-1.5 px-2">
          <Filter className="w-3.5 h-3.5" />
          Filtrar por:
        </span>
        <button
          onClick={() => setFilterCategory("all")}
          className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
            filterCategory === "all"
              ? "bg-[#233762] text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Todos ({events.length})
        </button>
        {(Object.keys(CATEGORY_CONFIG) as EventCategory[]).map((cat) => {
          const cfg = CATEGORY_CONFIG[cat];
          const count = events.filter((e) => e.category === cat).length;
          const Icon = cfg.icon;
          const isSelected = filterCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold border transition-colors ${
                isSelected
                  ? `${cfg.bgBadge} ${cfg.textBadge} ring-2 ring-[#233762]/20`
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{cfg.label}</span>
              <span className="text-[10px] opacity-75 font-mono">({count})</span>
            </button>
          );
        })}
      </div>

      {/* 3. Contenedor Principal: Cuadrícula del Calendario + Panel de Detalle */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna Izquierda (2 spans): Vista Mensual Interactiva */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col gap-4">
          {/* Navegación del Mes */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-[#233762]">
                {monthNames[currentMonth]} {currentYear}
              </h2>
              <button
                onClick={handleToday}
                className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors"
              >
                Hoy
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrevMonth}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
                title="Mes anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleNextMonth}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
                title="Siguiente mes"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Días de la semana */}
          <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-slate-400 uppercase tracking-wider py-1">
            {dayNames.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          {/* Celdas de días */}
          <div className="grid grid-cols-7 gap-1.5">
            {calendarDays.map(({ dateStr, dayNum, isCurrentMonth }) => {
              const dayEvents = eventsByDate[dateStr] || [];
              const isSelected = selectedDate === dateStr;
              const isToday = dateStr === "2026-11-03";

              return (
                <div
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`min-h-[85px] p-1.5 rounded-lg border transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? "border-[#233762] bg-[#EFF3F9]/60 shadow-xs ring-2 ring-[#233762]/30"
                      : isToday
                      ? "border-[#CE3A39]/60 bg-[#FDF2F2]/40 hover:border-slate-300"
                      : isCurrentMonth
                      ? "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                      : "border-slate-100 bg-slate-50/50 text-slate-300 hover:bg-slate-100/50"
                  }`}
                >
                  {/* Encabezado del día */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-mono font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                        isToday
                          ? "bg-[#CE3A39] text-white"
                          : isSelected
                          ? "bg-[#233762] text-white"
                          : isCurrentMonth
                          ? "text-slate-700"
                          : "text-slate-300"
                      }`}
                    >
                      {dayNum}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 font-mono">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  {/* Pills de eventos en la celda */}
                  <div className="flex flex-col gap-1 mt-1 overflow-hidden">
                    {dayEvents.slice(0, 2).map((ev) => {
                      const cfg = CATEGORY_CONFIG[ev.category];
                      return (
                        <div
                          key={ev.id}
                          className={`text-[10px] font-medium truncate px-1.5 py-0.5 rounded border leading-tight ${cfg.bgBadge} ${cfg.textBadge}`}
                          title={`${ev.time} - ${ev.title}`}
                        >
                          <span className="font-mono font-bold mr-1">{ev.time}</span>
                          {ev.title}
                        </div>
                      );
                    })}
                    {dayEvents.length > 2 && (
                      <span className="text-[9px] text-slate-500 font-bold px-1">
                        +{dayEvents.length - 2} más...
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Columna Derecha (1 span): Detalle de Citas del Día Seleccionado */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Agenda del Día
              </span>
              <h3 className="text-base font-bold text-[#233762]">
                {selectedDate}
              </h3>
            </div>
            <button
              onClick={() => {
                setFormDate(selectedDate);
                setShowModal(true);
              }}
              className="p-1.5 text-[#233762] hover:bg-[#EFF3F9] rounded-lg transition-colors border border-slate-200 text-xs font-bold inline-flex items-center gap-1"
              title="Agregar cita en esta fecha"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Añadir</span>
            </button>
          </div>

          {/* Lista de citas */}
          <div className="flex flex-col gap-3 overflow-y-auto max-h-[500px] pr-1">
            {selectedDayEvents.length === 0 ? (
              <div className="text-center py-12 px-4 border border-dashed border-slate-200 rounded-xl">
                <CalendarIcon className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-600">Sin citas ni recolecciones</p>
                <p className="text-xs text-slate-400 mt-1">
                  No hay eventos programados para el {selectedDate}.
                </p>
                <button
                  onClick={() => {
                    setFormDate(selectedDate);
                    setShowModal(true);
                  }}
                  className="mt-4 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors"
                >
                  + Programar Cita
                </button>
              </div>
            ) : (
              selectedDayEvents.map((ev) => {
                const cfg = CATEGORY_CONFIG[ev.category];
                const Icon = cfg.icon;
                const isDone = ev.status === "completada";

                return (
                  <div
                    key={ev.id}
                    className={`p-3.5 rounded-xl border transition-all flex flex-col gap-2 relative overflow-hidden ${
                      isDone
                        ? "bg-slate-50 border-slate-200 opacity-70"
                        : "bg-white border-slate-200 hover:border-slate-300 shadow-2xs"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wider ${cfg.bgBadge} ${cfg.textBadge}`}
                      >
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                      <button
                        onClick={() => handleToggleStatus(ev.id)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors ${
                          isDone
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                            : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                        }`}
                        title="Marcar como completada/pendiente"
                      >
                        {isDone ? "✓ Completada" : "Pendiente"}
                      </button>
                    </div>

                    <h4 className={`text-sm font-bold text-slate-800 ${isDone ? "line-through text-slate-500" : ""}`}>
                      {ev.title}
                    </h4>

                    <div className="grid grid-cols-1 gap-1 text-xs text-slate-500 font-medium">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{ev.time} hrs</span>
                        {ev.reference && (
                          <span className="font-mono text-slate-600 bg-slate-100 px-1 rounded ml-1">
                            Ref: {ev.reference}
                          </span>
                        )}
                      </div>
                      {ev.carrierOrLocation && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span className="truncate">{ev.carrierOrLocation}</span>
                        </div>
                      )}
                      {ev.contact && (
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{ev.contact}</span>
                        </div>
                      )}
                    </div>

                    {ev.notes && (
                      <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100 mt-1 italic">
                        "{ev.notes}"
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 4. Modal para Crear Nueva Cita / Planificación */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="bg-[#233762] text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-[#CE3A39]" />
                <h3 className="text-base font-bold">Nueva Planificación / Cita</h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-300 hover:text-white p-1 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveEvent} className="p-6 flex flex-col gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Título de la cita o planificación *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Recolección FedEx Lote 2, Cita Entrega Reforma..."
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#233762]/30 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tipo de Evento</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as EventCategory)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#233762]/30 text-xs bg-white"
                  >
                    <option value="entrega">Cita de Entrega</option>
                    <option value="recoleccion">Recolección (Pickup)</option>
                    <option value="cierre">Cierre de Lote</option>
                    <option value="mantenimiento">Mantenimiento / Cita Técnica</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Hora</label>
                  <input
                    type="time"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#233762]/30 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Fecha programada</label>
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#233762]/30 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Referencia / SCTASK</label>
                  <input
                    type="text"
                    placeholder="SCTASK / Guía / Lote"
                    value={formReference}
                    onChange={(e) => setFormReference(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#233762]/30 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Contacto / Responsable</label>
                  <input
                    type="text"
                    placeholder="Nombre o transportista"
                    value={formContact}
                    onChange={(e) => setFormContact(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#233762]/30 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Ubicación / Dirección</label>
                <input
                  type="text"
                  placeholder="Oficina, almacén o dirección de entrega"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#233762]/30 text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notas u observaciones</label>
                <textarea
                  rows={2}
                  placeholder="Indicaciones para el chofer o el receptor..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#233762]/30 text-xs resize-none"
                />
              </div>

              {/* Botones */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#233762] hover:bg-[#1a2b4f] text-white font-bold rounded-lg transition-colors shadow-xs"
                >
                  Guardar Cita
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

