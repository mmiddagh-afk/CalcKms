# Design Spec: Rediseño de Colores Modo Oscuro (Midnight Slate) - CalcKms

**Fecha**: 2026-08-12  
**Estado**: Aprobado por el usuario  
**Propósito**: Renovar la paleta cromática del Modo Oscuro de CalcKms a una estética "Midnight Slate", mejorando el contraste, la legibilidad nocturna y la jerarquía visual de métricas.

---

## 1. Sistema Cromatico Base (Midnight Slate)

### 1.1 Fondos y Estructura
* `body.theme-dark`, `body.theme-dark .app-container`, `body.theme-dark .bg-[#F2F2F7]`: `#090D16` (Slate Profundo).
* `body.theme-dark #desktopSidebar`, `body.theme-dark .app-header`, `body.theme-dark .bottom-nav`: `#0F172A` (Slate Medio).
* `body.theme-dark .bg-white`, `body.theme-dark section`, `body.theme-dark .cierre-main-card`: `#1E293B` (Tarjetas Elevadas).

### 1.2 Bordes y Separadores
* `body.theme-dark .border-gray-100`, `body.theme-dark .border-gray-200`, `body.theme-dark .border-slate-100`: `#334155` (Borde sutil).

### 1.3 Inputs y Selectores (Hundidos)
* `body.theme-dark input`, `body.theme-dark select`, `body.theme-dark .bg-gray-50`: `#090D16` con borde `#334155`.
* Foco de input: `focus:border-emerald-400`, `focus:ring-emerald-500/20`.

---

## 2. Jerarquía Tipográfica y Acentos

### 2.1 Colores de Texto
* Títulos principales (`.text-gray-900`, `.text-slate-900`, `h1`, `h2`, `h3`): `#F8FAFC` (Blanco Slate).
* Texto secundario (`.text-gray-800`, `.text-gray-700`, `.text-slate-700`): `#CBD5E1`.
* Leyendas y etiquetas (`.text-gray-500`, `.text-gray-400`, `.text-slate-400`): `#94A3B8`.
* Textos atenuados (`.text-gray-300`, `.text-gray-200`): `#64748B`.

### 2.2 Acentos Neón de Métricas
* **Ganancia Neta / Esmeralda**: `#34D399` (`.text-emerald-500`, `.text-emerald-600` -> `#34D399`).
* **Total a Separar / Gastos / Danger**: `#FB7185` (`.text-red-500`, `.text-red-600` -> `#FB7185`).
* **Gasolina / Acciones Secundarias**: `#60A5FA` (`.text-blue-500`, `.text-blue-600` -> `#60A5FA`).
* **Mantenimiento**: `#FBBF24` (`.text-orange-500`, `.text-amber-500` -> `#FBBF24`).

---

## 3. Componentes Específicos en Dark Mode

### 3.1 Bottom Sheets & Speed Dial
* `#sheetCargaKm > div`, `#sheetCargaGasolina > div`: Fondo `#1E293B`, texto `#F8FAFC`, inputs `#090D16`.
* `#speedDialOverlay`: `rgba(2, 6, 23, 0.7)` con backdrop blur.

### 3.2 Desktop Sidebar & Bottom Nav Bar
* `#desktopSidebar`: Fondo `#0F172A`, borde derecho `#1E293B`.
* `.desktop-nav-item.active`: Fondo `rgba(16, 185, 129, 0.15)`, texto `#34D399`.
* `#mobileBottomNavContainer nav`: Fondo `rgba(15, 23, 42, 0.95)`, borde superior `#334155`.

---

## 4. Plan de Verificación

1. Activar el Modo Oscuro desde Ajustes (o invocar `setThemeMode('dark')`).
2. Verificar contraste en escritorio (Sidebar, Header, Tarjeta de Cierre del Día, Resumen de Ganancias).
3. Verificar contraste en móvil (BottomNav, FAB Speed Dial, Bottom Sheets de KM y Gasolina).
4. Asegurar que los inputs numéricos sean claramente visibles con su fondo hundido `#090D16` y texto `#F8FAFC`.
