# Reglas de Estandarización de Diseño, Homogeneidad y Baja Saturación Visual (Seko Logistics)

Esta regla es de cumplimiento estricto y permanente en todas las pantallas, componentes, módulos y submódulos de la plataforma (especialmente en todo el ecosistema de **Asset Management**). Antes de realizar cualquier modificación visual o crear nuevos componentes, el agente **DEBE** verificar el cumplimiento de cada punto.

## 1. Sistema Semántico de Color (Reducción de Saturación Visual)
- **Azul Marino (`#233762`):** Estructura, navegación, acciones secundarias importantes, pestaña/filtro activo (`bg-[#233762] text-white`), encabezados de tabla (`bg-[#233762] text-white`) y valores numéricos de KPIs (`text-[#233762] font-mono`).
- **Rojo Corporativo (`#CE3A39`):** EXCLUSIVAMENTE para:
  1. La **acción principal única** de la pantalla (ej. *Timbrar guías en Techship*, *Generar PDF*).
  2. **Errores reales** o bloqueos de validación (ej. teléfono inválido, envío con incidencia/retraso).
  3. **Acciones destructivas en `hover`** (ej. *Eliminar*, *Limpiar tabla / Archivar*, *Cerrar sesión*): en estado normal deben lucir neutros (`border-slate-200/300 text-slate-600`) y solo pintarse de rojo al pasar el cursor (`hover:bg-red-50 hover:border-red-200 hover:text-[#CE3A39]`).
- **Verde (`emerald-500`) / Ámbar (`amber-500`) / Rojo (`#CE3A39`):** EXCLUSIVAMENTE para el punto indicador de `8px` (`w-2 h-2 rounded-full`) del semáforo de estado. **PROHIBIDO** usar fondos verdes, ámbar, morados, índigo, celestes o rojos en tarjetas KPI, pestañas de filtro, botones de descarga o badges de categoría/carrier.
- **Gris (`slate-*`):** Todo lo demás. Badges de rol (`ASSET_MANAGER`), badges de cliente (`KYNDRYL & BASF`), badges de tipo (`ENTREGA`, `RETORNO`), badges de carrier (`FEDEX`, `ESTAFETA`), botones de descarga y contenedores auxiliares deben usar `slate` (`bg-slate-100 text-slate-600 border-slate-200` o `bg-slate-50 text-slate-700 border-slate-200`).
- **Fondo y Superficies:** Fondo general `bg-slate-50`; tarjetas principales blancas (`bg-white border border-slate-200 rounded-2xl p-5 shadow-sm`). Evitar sombras redundantes.

## 2. Cabecera, Logo y Franja Superior Bicolor
- **Vistas Hub / Selección de Módulos:**
  - Logo corporativo `/logo-supplychain.png` centrado en la parte superior (`h-20 sm:h-24 w-auto`), con fallback a `<AnimatedLogo className="h-20 sm:h-24 w-auto" cycleDuration={8} />`.
  - Franja superior bicolor de `6px` (`h-1.5`).
- **Vistas Operativas (Asset Management):**
  - Franja superior bicolor sutil de `3px` (`h-[3px]`: 50% `#233762` y 50% `#CE3A39`).
  - Badge de rol de usuario en el header siempre en gris neutro (`bg-slate-100 text-slate-600`), nunca en rojo.

## 3. Estandarización y Simetría de Cuadrículas de Módulos (Hubs)
- **Dimensiones idénticas fijas en todas las pantallas:**
  - Todas las tarjetas de selección de módulos y submódulos **DEBEN medir exactamente lo mismo**:
    - **Ancho exacto:** `w-[300px]` (NUNCA usar anchos dinámicos como `w-full` dentro de grids variables).
    - **Altura exacta:** `h-[275px] min-h-[275px]`.
- **Contenedor exterior de módulos:**
  - Usar siempre: `flex flex-wrap justify-center gap-6 w-full max-w-5xl mx-auto` (o `max-w-7xl` para cuadrículas con 4 módulos).
- **Estructura interna fija de cada tarjeta:**
  - Badge superior derecha en tipografía mono: `text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full` alternando tonos oficiales (`#EFF3F9 text-[#233762]` / `#FDF2F2 text-[#CE3A39]`).
  - Contenedor de icono centrado de `w-14 h-14 rounded-2xl` con zoom suave al hover (`group-hover:scale-110`).
  - Título centrado: `text-lg font-bold text-[#233762] group-hover:text-[#CE3A39] transition-colors mt-4`.
  - Descripción centrada: `text-xs text-slate-500 mt-2 line-clamp-3 leading-relaxed px-1`.
  - Enlace inferior alineado: `Ingresar al módulo →` (`text-[#233762] group-hover:text-[#CE3A39] transition-colors`).
  - Línea de base institucional de acento: `h-1 bg-[#233762] group-hover:bg-[#CE3A39] transition-colors duration-300`.

## 4. Tarjetas KPI Operativas Homogéneas
- Tarjetas blancas (`bg-white border border-slate-200 rounded-2xl p-5 shadow-sm`), sin bordes superiores de colores ni cajas de iconos multicolores.
- Encabezado con etiqueta en `text-[11px] font-semibold uppercase tracking-wider text-slate-500` y punto de `8px` (`w-2 h-2 rounded-full`) del color del semáforo.
- Número principal siempre en azul marino monospace (`text-3xl` o `text-4xl font-bold font-mono text-[#233762] mt-2`).
- Subtítulo descriptivo en `text-xs text-slate-400 mt-1`.
- Cuando la tarjeta actúa como filtro activo, resaltarla con `border-[#233762] ring-2 ring-[#233762]/15`.

## 5. Tablas, Pestañas, Badges y Descargas
- **Pestañas y filtros:** El filtro o pestaña activa siempre usa `bg-[#233762] text-white` (nunca rojo sólido ni colores decorativos).
- **Badges de categoría / carrier / tipo:** Siempre neutros (`bg-slate-100 text-slate-600 border border-slate-200`).
- **Semáforo / estatus en filas:** Punto de `8px` (`w-2 h-2 rounded-full`) + texto corto en `text-xs font-medium text-slate-700`, dejando explicaciones largas en `title` (tooltip). Conservar fondo tenue de fila únicamente para alertas rojas reales (`bg-red-50/30`).
- **Botones de descarga / exportación:** Todos con el mismo estilo neutro (`bg-slate-50 border border-slate-200 text-slate-700 hover:bg-[#EFF3F9] hover:text-[#233762] hover:border-[#233762]/30`), usando `<Lock />` y `opacity-40` si están deshabilitados.

## 6. Navegación y Botones
- Botones de regreso con estilo píldora: `rounded-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-[#233762] transition font-semibold`.
- Icono de flecha izquierda en rojo corporativo: `<ArrowLeft className="w-3.5 h-3.5 text-[#CE3A39]" />`.

## 7. Checklist Obligatorio Pre-Cambio para el Agente
Antes de editar cualquier vista de UI, el agente debe confirmar:
1. ¿Se mantiene intacta toda la lógica, handlers, estados y permisos RBAC?
2. ¿El color `#CE3A39` se usa únicamente en la acción principal, errores reales y `hover` destructivo?
3. ¿Todas las tarjetas KPI son blancas con punto de `8px` y número en `#233762`?
4. ¿Las pestañas activas están en `#233762` y los badges de rol/carrier/categoría en `slate` neutro?

