# Reglas de Estandarización de Diseño e Identidad Visual (Seko Logistics)

Esta regla es de cumplimiento estricto y permanente en todas las pantallas, componentes, módulos y submódulos de la plataforma.

## 1. Paleta de Colores Corporativa Oficial (Exclusiva)
- **Azul Primario (Seko Navy):** `#233762`
- **Rojo Secundario (Seko Red):** `#CE3A39`
- **Fondo Suave Navy:** `#EFF3F9`
- **Fondo Suave Red:** `#FDF2F2`
- **Prohibido terminantemente:** Utilizar colores ajenos a los oficiales (como amarillo/ámbar, morado, violeta, naranja o azul celeste brillante) para módulos, bordes, badges o acentos.

## 2. Logo Corporativo Centrado en la Cabecera
- En todas las ventanas y vistas principales de módulos/hubs, el **logo corporativo de SupplyChain México** debe aparecer centrado en la parte superior:
  - Imagen `/logo-supplychain.png` con tamaño estándar (`h-20 sm:h-24 w-auto`).
  - Fallback a `<AnimatedLogo className="h-20 sm:h-24 w-auto" cycleDuration={8} />`.

## 3. Franja Superior Bicolor Institucional (Top Ribbon)
- Todas las ventanas deben conservar la franja superior de 6px en la parte más alta:
  - 50% `#233762` (Navy) y 50% `#CE3A39` (Red).

## 4. Estandarización y Simetría de Cuadrículas y Tarjetas de Módulos
- **Dimensiones idénticas fijas en todas las pantallas:**
  - Todas las tarjetas de módulos y submódulos (Hub, Asset Management, Operación del Día, Transporte, Reportes o futuros módulos) **DEBEN medir exactamente lo mismo**:
    - **Ancho exacto:** `w-[300px]` (NUNCA usar anchos dinámicos como `w-full` dentro de columnas grid variables que alteren el ancho entre pantallas).
    - **Altura exacta:** `h-[275px] min-h-[275px]`.
- **Contenedor exterior de módulos:**
  - Usar siempre: `flex flex-wrap justify-center gap-6 w-full max-w-5xl mx-auto` (o `max-w-7xl` para cuadrículas con 4 módulos) para que las tarjetas conserven su proporción homogénea de 300px × 275px en cualquier resolución.
- **Estructura interna fija de cada tarjeta:**
  - Placa o badge superior derecha en tipografía mono: `text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full` alternando tonos oficiales (`#EFF3F9` / `#FDF2F2`).
  - Contenedor de icono centrado de `w-14 h-14 rounded-2xl` con sombra ligera y efecto zoom suave al hover (`group-hover:scale-110`).
  - Título centrado con cambio de color al hover: `text-lg font-bold text-[#233762] group-hover:text-[#CE3A39] transition-colors mt-4`.
  - Descripción centrada con límite de 3 líneas: `text-xs text-slate-500 mt-2 line-clamp-3 leading-relaxed px-1`.
  - Enlace inferior alineado a la misma altura: `Ingresar al módulo →` (`text-[#233762] group-hover:text-[#CE3A39] transition-colors`).
  - Línea de base institucional de acento: `h-1 bg-[#233762] group-hover:bg-[#CE3A39] transition-colors duration-300`.

## 5. Navegación y Botones
- Botones de regreso con estilo píldora: `rounded-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-[#233762] transition shadow-2xs font-semibold`.
- Icono de flecha izquierda en rojo corporativo: `<ArrowLeft className="w-3.5 h-3.5 text-[#CE3A39]" />`.

