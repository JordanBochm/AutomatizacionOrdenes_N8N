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
- **Dimensiones idénticas:** Todos los módulos o submódulos en cuadrículas deben tener exactamente la misma altura y ancho (`h-[275px] min-h-[275px]` o proporción fija).
- **Estructura fija en tarjetas:**
  - Placa o badge superior derecha en tipografía mono (`[10px] uppercase font-bold px-2 py-0.5 rounded-full`) alternando tonos oficiales (`#EFF3F9` / `#FDF2F2`).
  - Contenedor de icono centrado de `w-14 h-14 rounded-2xl` con sombra ligera y efecto zoom suave al hover.
  - Título y descripción con límite de líneas estándar (`line-clamp-3`).
  - Enlace inferior alineado a la misma altura: `Ingresar al módulo →` (`text-[#233762] group-hover:text-[#CE3A39]`).
  - Línea de base institucional de 1px: `bg-[#233762] group-hover:bg-[#CE3A39]`.

## 5. Navegación y Botones
- Botones de regreso con estilo píldora: `rounded-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-[#233762] transition shadow-2xs font-semibold`.
- Icono de flecha izquierda en rojo corporativo: `<ArrowLeft className="w-3.5 h-3.5 text-[#CE3A39]" />`.

