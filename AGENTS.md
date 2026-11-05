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

# Reglas de Estandarización de Identidad Visual (UI)
- **Colores Oficiales Exclusivos:**
  - Azul Primario (Seko Navy): `#233762`
  - Rojo Secundario (Seko Red): `#CE3A39`
  - Fondo Suave Navy: `#EFF3F9`
  - Fondo Suave Red: `#FDF2F2`
  - PROHIBIDO usar colores ajenos (ámbar, morado, celeste brillante, violeta, naranja) para tarjetas, badges, bordes o acentos.
- **Cabecera y Logo:**
  - Logo oficial `/logo-supplychain.png` centrado en la parte superior (`h-20 sm:h-24 w-auto`), con fallback a `<AnimatedLogo />`.
  - Franja superior bicolor institucional de 6px (50% `#233762` y 50% `#CE3A39`).
- **Tarjetas y Módulos:**
  - Dimensiones idénticas y simétricas (`h-[275px] min-h-[275px]`).
  - Botón de regreso con estilo píldora (`rounded-full`) y flecha roja (`#CE3A39`).

# Reglas críticas para agentes
- NUNCA ejecutar timbrados reales ni llamar a Techship, Estafeta o FedEx en pruebas. En API usar siempre `dry_run: true`; en CLI usar `main.py` SIN `--live`.
- NO modificar `generar_guias.py`, `techship_client.py` ni `validador_postal.py` sin petición explícita.
- NO tocar archivos `.env` reales ni escribir secretos. Consultar únicamente variables en `.env.example`.
- NO reintentar automáticamente llamadas POST de timbrado (riesgo de doble cobro). Antes de reintentar, consultar con GET anti-duplicados (`/api/v3/shipments`).
- Regla postal SEPOMEX: política estricta de "cero alucinaciones" (solo catálogo local SQLite). Direcciones comprimidas a ≤50 caracteres (límite Estafeta); número interior protegido al inicio de `Address 2`.
