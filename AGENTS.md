# Contexto del proyecto
Automatiza órdenes de despacho y recolección de equipos (Seko Logistics / Kyndryl): procesa reportes de ServiceNow (Excel), valida direcciones contra catálogo local SEPOMEX (SQLite), genera y timbra guías en Estafeta vía Techship API v3, y rastrea envíos multi-carrier (Estafeta y FedEx). Incluye un dashboard operativo (FastAPI + Next.js).

# Stack y estructura
- Backend: Python 3.10+ con FastAPI (`src/api/server.py`). Núcleo en `src/`: `generar_guias.py`, `validador_postal.py`, `techship_client.py`, `asignar_tracking.py`, y módulo `src/tracking/` (servicio, caché, adaptadores FedEx y Estafeta).
- Frontend: Next.js 16.4 (App Router, Turbopack, Tailwind) + React 19 en `frontend/`. Vista principal: `frontend/src/app/page.tsx`.
- Datos: `data/input/` (reportes crudos), `data/output/` (entregables), `data/archive/`, `data/sepomex.db` (SQLite local).
- CLI & Scripts: `main.py` (pipeline end-to-end), `scripts/descargar_sepomex.py`, `tests/test_tracking.py`.
- Entorno de trabajo: Windows (scripts PowerShell, Batch y VBS; manejo de codificación UTF-8 y bloqueos de archivo WinError 32). No hay scripts de automatización para Linux/macOS.

# Metodología de Trabajo Git (GitFlow Estricto - Obligatorio y Permanente)
LA IA SIEMPRE DEBE OPERAR BAJO EL FLUJO GITFLOW EN CADA TAREA O REQUERIMIENTO:
1. **Ramas Principales:**
   - `main`: Código estable y probado en producción.
   - `develop`: Rama base de desarrollo e integración de funcionalidades.
2. **Ciclo de Trabajo Obligatorio (Feature Branching):**
   - **NUNCA** desarrollar ni comitear directamente sobre `main` ni `develop`.
   - Para cada requerimiento, cambio o corrección, la IA debe:
     a) Asegurarse de estar sobre `develop` actualizado.
     b) Crear una rama temática: `feature/<nombre-descriptivo>` (o `hotfix/<nombre>` si es emergencia directa de producción).
     c) Realizar las modificaciones, validaciones y tests en esa rama `feature/*`.
     d) Al terminar la tarea y confirmar con el usuario, comitear en la rama `feature/*` y fusionar (merge) hacia `develop`.
     e) Cuando el usuario solicite pase a producción, fusionar `develop` hacia `main`.
3. **Hotfixes:**
   - Se crean desde `main` bajo el prefijo `hotfix/<nombre>`, se resuelven y se fusionan tanto a `main` como a `develop`.

# Reglas de Estandarización de Identidad Visual y Homogeneidad (UI - Obligatorio y Permanente)
ANTES DE REALIZAR CUALQUIER CAMBIO EN EL FRONTEND O CREAR UN COMPONENTE, LA IA DEBE VERIFICAR Y RESPETAR ESTRICTAMENTE ESTAS REGLAS DE HOMOGENEIDAD Y BAJA SATURACIÓN VISUAL:

1. **Sistema Semántico de Color (Cero Saturación Visual):**
   - **Azul Marino (`#233762`):** Estructura, navegación, acciones normales/secundarias principales, pestaña o filtro activo (`bg-[#233762] text-white`), encabezados de tabla (`bg-[#233762] text-white`) y números de KPI (`text-[#233762] font-mono`).
   - **Rojo Corporativo (`#CE3A39`):** EXCLUSIVAMENTE para:
     a) La **única acción primaria crítica** de la vista (ej. *Timbrar guías*, *Generar PDF*). Máximo 1 botón rojo sólido por vista operativa.
     b) **Errores reales** o bloqueos de validación (ej. teléfono inválido, guía retrasada/incidencia).
     c) **Acciones destructivas en `hover`** (ej. *Eliminar*, *Limpiar tabla / Archivar*, *Cerrar sesión*: en reposo usan borde/texto `slate` y solo cambian a `hover:bg-red-50 hover:border-red-200 hover:text-[#CE3A39]`).
   - **Verde (`emerald-500`) / Ámbar (`amber-500`) / Rojo (`#CE3A39`):** EXCLUSIVAMENTE para el punto indicador (`w-2 h-2 rounded-full` de `8px`) del semáforo de estado de órdenes/envíos/equipos. **NUNCA** usar fondos verdes, ámbar, morados, celestes o rojos en tarjetas KPI, pestañas de filtro, botones de descarga ni badges de categoría/carrier/rol.
   - **Gris (`slate-*`):** Todo lo demás. Badges de rol (`ASSET_MANAGER`, `ADMIN`), badges de cliente (`KYNDRYL & BASF`), badges de tipo (`ENTREGA`, `RETORNO`), badges de carrier (`FEDEX`, `ESTAFETA`), botones de descarga y contenedores secundarios deben ser neutros (`bg-slate-100 text-slate-600 border-slate-200` o `bg-slate-50 text-slate-700 border-slate-200`).
   - **Fondos y Sombras:** Fondo de página `bg-slate-50`; tarjetas principales blancas (`bg-white border border-slate-200 rounded-2xl p-5 shadow-sm`). Prohibido anidar sombras redundantes.

2. **Encabezado Unificado Obligatorio (en todos los módulos, submódulos y vistas nuevas):**
   - **Todo módulo, submódulo o vista interna nueva** (excepto el Hub Principal) DEBE incluir exactamente el mismo encabezado pegajoso (`sticky top-0 z-40` de `h-20`):
     - `<header className="border-b border-slate-200 bg-white/95 backdrop-blur-md sticky top-0 z-40">`
     - Contenedor interno: `<div className="w-full max-w-[1540px] mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 h-20 flex items-center justify-between">`
     - **Izquierda (`flex items-center gap-3 sm:gap-4`):** botón circular de regreso (`w-9 h-9 rounded-full flex items-center justify-center border border-slate-200 bg-white hover:bg-[#EFF3F9] text-[#233762] transition group cursor-pointer` con `<ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />`), separador vertical (`h-7 w-px bg-slate-200 hidden sm:block`), y el logo oficial horizontal clicable que regresa al Hub Principal (`<AnimatedLogo className="h-9 sm:h-10 w-auto" horizontal staticOnly />`).
     - **Derecha (`hidden sm:flex items-center gap-2.5`):** título de la vista (`text-base font-extrabold text-[#233762] tracking-wide`) acompañado de `<ClientSwitcherPill />` cuando el módulo opere por cliente.
   - En el **Hub Principal** (`hub`): logo oficial `/logo-supplychain.png` centrado (fallback `<AnimatedLogo />`), franja superior bicolor institucional y badge de rol de usuario siempre neutro (`bg-slate-100`).
   - En vistas operativas: franja superior bicolor institucional (`50% #233762` y `50% #CE3A39`).

3. **Proporciones, Márgenes y Contenedor Estandarizado (Base: Automatizador de Operación — Obligatorio en Todo Módulo Nuevo):**
   - CADA VEZ QUE SE AGREGUE UN MÓDULO, SUBMÓDULO O INTERFAZ NUEVA, DEBE REPLICAR EXACTAMENTE LOS MÁRGENES Y PROPORCIONES DEL **AUTOMATIZADOR DE OPERACIÓN**:
     - **Contenedor principal de contenido (`<main>` o wrapper raíz):** `flex-1 w-full max-w-[1540px] mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 py-5` (PROHIBIDO usar `max-w-7xl`, `max-w-6xl`, `max-w-4xl` o anchos libres sin `max-w-[1540px]`, para que los bordes izquierdo y derecho del contenido alineen al píxel con el encabezado).
     - **Ritmo vertical entre secciones:** `space-y-4` o `flex flex-col gap-4` (`16px` uniformes; evitar `py-8`, `mb-8` o `gap-6` excesivos).
     - **Contenedores y tarjetas operativas:** `bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm` y grillas de KPIs/bloques con `gap-4`.

4. **Tarjetas de Módulos (Dimensiones Homogéneas Obligatorias en Hubs):**
   - CADA TARJETA DE MÓDULO O SUBMÓDULO DEBE MEDIR EXACTAMENTE LO MISMO EN TODAS LAS PANTALLAS:
     - Ancho exacto fijado: `w-[300px]` (PROHIBIDO usar anchos porcentuales o columnas grid que cambien el ancho de las tarjetas entre pantallas).
     - Altura exacta fijada: `h-[275px] min-h-[275px]`.
   - Contenedor de módulos: `flex flex-wrap justify-center gap-6 max-w-5xl mx-auto` (o `max-w-7xl` para 4 módulos en desktop) dentro del marco general `max-w-[1540px]`.
   - Estructura interna estandarizada:
     - Badge superior derecha: `text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full` en tonos institucionales suaves (`#EFF3F9 text-[#233762]` / `#FDF2F2 text-[#CE3A39]`), nunca verde brillante.
     - Contenedor de icono centrado: `w-14 h-14 rounded-2xl` con zoom al hover.
     - Título centrado: `text-lg font-bold text-[#233762] group-hover:text-[#CE3A39] transition-colors mt-4`.
     - Descripción centrada: `text-xs text-slate-500 mt-2 line-clamp-3 leading-relaxed px-1`.
     - Enlace inferior alineado: `Ingresar al módulo →` (`text-[#233762] group-hover:text-[#CE3A39]`).
     - Línea de base institucional de acento: `h-1 bg-[#233762] group-hover:bg-[#CE3A39]`.

5. **Tarjetas KPI Operativas (Estándar Limpio):**
   - Tarjeta blanca (`bg-white border border-slate-200 rounded-2xl p-5 shadow-sm`), **sin** franja superior de color y **sin** fondos de tarjeta coloreados (`bg-amber-50`, `bg-emerald-50`, `bg-red-50`, etc.).
   - Cabecera con título en `text-[11px] font-semibold uppercase tracking-wider text-slate-500` acompañado únicamente de un punto (`w-2 h-2 rounded-full`) del color semántico correspondiente.
   - Valor numérico en `text-3xl` o `text-4xl font-bold font-mono text-[#233762] mt-2` (siempre en azul marino `#233762`).
   - Subtítulo en `text-xs text-slate-400 mt-1`.
   - Si la tarjeta filtra la tabla, la tarjeta activa lleva anillo azul marino (`border-[#233762] ring-2 ring-[#233762]/15`).

6. **Tablas, Filtros, Modales y Semáforos:**
   - Pestañas de filtro: la pestaña activa SIEMPRE va en azul marino (`bg-[#233762] text-white`), nunca en rojo, verde o morado.
   - Semáforo o estatus por fila: punto de color de `8px` (`w-2 h-2 rounded-full`) + texto corto legible, evitando píldoras saturadas de múltiples colores. Los detalles largos van en atributo `title` (tooltip).
   - Botones de descarga / exportación: estilo neutro unificado (`bg-slate-50 border border-slate-200 text-slate-700 hover:bg-[#EFF3F9] hover:text-[#233762] hover:border-[#233762]/30`), con icono `<Lock />` y `opacity-40` cuando no estén disponibles.
   - Modales y paneles superpuestos: usar siempre overlay `.fixed.inset-0.z-50` para activar automáticamente el bloqueo global de scroll de fondo (`globals.css`).

# Reglas críticas para agentes
- NUNCA ejecutar timbrados reales ni llamar a Techship, Estafeta o FedEx en pruebas. En API usar siempre `dry_run: true`; en CLI usar `main.py` SIN `--live`.
- NO modificar `generar_guias.py`, `techship_client.py` ni `validador_postal.py` sin petición explícita.
- NO tocar archivos `.env` reales ni escribir secretos. Consultar únicamente variables en `.env.example`.
- NO reintentar automáticamente llamadas POST de timbrado (riesgo de doble cobro). Antes de reintentar, consultar con GET anti-duplicados (`/api/v3/shipments`).
- Regla postal SEPOMEX: política estricta de "cero alucinaciones" (solo catálogo local SQLite). Direcciones comprimidas a ≤50 caracteres (límite Estafeta); número interior protegido al inicio de `Address 2`.
