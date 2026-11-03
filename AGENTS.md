# Contexto del proyecto
Automatiza órdenes de despacho y recolección de equipos (Seko Logistics / Kyndryl): procesa reportes de ServiceNow (Excel), valida direcciones contra catálogo local SEPOMEX (SQLite), genera y timbra guías en Estafeta vía Techship API v3, y rastrea envíos multi-carrier (Estafeta y FedEx). Incluye un dashboard operativo (FastAPI + Next.js).

# Stack y estructura
- Backend: Python 3.10+ con FastAPI (`src/api/server.py`). Núcleo en `src/`: `generar_guias.py`, `validador_postal.py`, `techship_client.py`, `asignar_tracking.py`, y módulo `src/tracking/` (servicio, caché, adaptadores FedEx y Estafeta).
- Frontend: Next.js 16.4 (App Router, Turbopack, Tailwind) + React 19 en `frontend/`. Vista principal: `frontend/src/app/page.tsx`.
- Datos: `data/input/` (reportes crudos), `data/output/` (entregables), `data/archive/`, `data/sepomex.db` (SQLite local).
- CLI & Scripts: `main.py` (pipeline end-to-end), `scripts/descargar_sepomex.py`, `tests/test_tracking.py`.
- Entorno de trabajo: Windows (scripts PowerShell, Batch y VBS; manejo de codificación UTF-8 y bloqueos de archivo WinError 32). No hay scripts de automatización para Linux/macOS.

# Cómo correr
- Instalar: `pip install -r requirements.txt` | `cd frontend && npm install`
- Backend: `python -m uvicorn src.api.server:app --host 0.0.0.0 --port 8000 --reload`
- Frontend: `cd frontend && npm run dev` (puerto 3000) o `frontend\iniciar_dev.bat`
- Ambos en segundo plano: `iniciar_dashboard.bat` (vía VBS) o `.\start_app.ps1`. Detener: `detener_dashboard.bat`
- Pipeline CLI: `python main.py -i "<archivo.xlsx>"` (simulación por defecto) | `--live` (timbrado REAL en Estafeta).
- Tests: `python -m unittest discover -s tests` o `python tests/test_tracking.py` (usa unittest estándar de Python).

# Reglas críticas para agentes
- NUNCA ejecutar timbrados reales ni llamar a Techship, Estafeta o FedEx en pruebas. En API usar siempre `dry_run: true`; en CLI usar `main.py` SIN `--live`.
- NO modificar `generar_guias.py`, `techship_client.py` ni `validador_postal.py` sin petición explícita.
- NO tocar archivos `.env` reales ni escribir secretos. Consultar únicamente variables en `.env.example`.
- NO reintentar automáticamente llamadas POST de timbrado (riesgo de doble cobro). Antes de reintentar, consultar con GET anti-duplicados (`/api/v3/shipments`).
- Los roles del frontend (`localStorage`) y cabeceras `X-User-Email`/`X-User-Role` son informativos y falsificables: NO constituyen control de acceso seguro.
- Antes de editar en `frontend/`, leer `frontend/AGENTS.md`: Next.js 16 tiene cambios incompatibles; revisar `node_modules/next/dist/docs/`.
- Regla postal SEPOMEX: política estricta de "cero alucinaciones" (solo catálogo local SQLite). Direcciones comprimidas a ≤50 caracteres (límite Estafeta); número interior protegido al inicio de `Address 2`.

# Git (GitFlow)
- Trabajar exclusivamente en la rama `feature/*` actual. NUNCA trabajar directo en `main` ni `develop`.
- La IA NO debe ejecutar `commit`, `push`, `merge`, `rebase`, `checkout`, `reset` ni `stash`. Solo `git status`, `git diff` y `git log`. Los commits y merges los realiza el usuario.

# Estado de seguridad
- Protección X-API-Key: NO implementada aún en endpoints de `server.py`. Endpoints con efectos reales desprotegidos.
- Autenticación existente: solo `TRACKING_API_AUTH_TOKEN` (Bearer) en `/api/tracking/*`, inactiva si la variable está vacía.
- Backend en `--host 0.0.0.0` y CORS abierto (`allow_origins=["*"]`): expuesto a la red local sin autenticación.

# Pendientes conocidos
- Implementar validación de `X-API-Key` en FastAPI para endpoints críticos (`/api/techship/process`, batches, etc.).
- Envolver tareas síncronas pesadas en FastAPI con `run_in_threadpool` para no bloquear el event loop.
- Paralelizar la sincronización de trackings (`sincronizar_tracking_desde_api`) con `ThreadPoolExecutor` (4-8 hilos).
- Reintentos con backoff exponencial únicamente en consultas GET, nunca en POST de timbrado.
- Centralizar datos de Seko Lerma, dimensiones y cliente KST (actualmente hardcodeados en varios scripts).
- Control de excepciones `PermissionError` (WinError 32) al guardar archivos Excel abiertos por operadores.
- En producción: configurar `TRACKING_MOCK_FALLBACK=false` y restringir CORS a dominios autorizados.
