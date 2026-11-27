# Design Spec: Rediseño Desktop Modular Navigation - CalcKms

**Fecha**: 2026-08-12  
**Estado**: Aprobado por el usuario  
**Propósito**: Rediseñar la experiencia de escritorio (pantallas ≥1024px) introduciendo una navegación modular por Sidebar Lateral Izquierdo y vista de módulo único con resumen superior en vivo.

---

## 1. Objetivos de UX y Estructura Desktop

1. **Navegación Modular por Sidebar**: Reemplazar la vista apilada vertical por un Sidebar lateral fijo (`#desktopSidebar`) que permita cambiar entre módulos con un solo clic.
2. **Área Principal Dinámica**: Mostrar un módulo a la vez en el área central (`#desktopMainContent`), manteniendo un widget compacto en el header con la Ganancia Libre Hoy y el Total a Separar.
3. **Coexistencia Responsive**: En pantallas móviles (<1024px) se mantiene el BottomNav + FAB Speed Dial; en pantallas de escritorio (≥1024px) se activa el Sidebar y se oculta la navegación móvil.

---

## 2. Componentes UI Desktop

### 2.1 Sidebar Lateral Izquierdo (`#desktopSidebar`)
* Ubicación: Panel fijo a la izquierda (`w-64`, `min-h-screen`, `hidden lg:flex flex-col`).
* Secciones del menú:
  1. `#btnDesktopNavInicio`: Icono `Home`, Módulo "Inicio / Cierre del Día" (`#seccionCierreDia`).
  2. `#btnDesktopNavGasolina`: Icono `Fuel`, Módulo "Gasolina" (`#seccionGasolina`).
  3. `#btnDesktopNavMantenimiento`: Icono `Wrench`, Módulo "Mantenimiento" (`#seccionMantenimiento` + `#seccionControlMant`).
  4. `#btnDesktopNavIngresos`: Icono `BarChart3`, Módulo "Rentabilidad" (`#seccionResumenGanancias`).
  5. `#btnDesktopNavDeudas`: Icono `Wallet`, Módulo "Deudas y Extras" (`#seccionDeudasExtras`).
  6. `#btnDesktopNavHistorial`: Icono `Clock`, Módulo "Historial" (`#seccionHistorial`).
  7. `#btnDesktopNavAjustes`: Icono `Settings`, Panel de Sincronización Firebase y Tema.

### 2.2 Top Header & Mini Resumen (`#desktopTopBar`)
* Permanece fijo en la parte superior del contenedor principal.
* Muestra en formato mini el badge de **Ganancia Libre Hoy** y **Total a Separar** actualizados en tiempo real.

---

## 3. Integración en Código

### 3.1 HTML (`index.html`)
* Envolver el contenedor del dashboard en una estructura grid/flex de 2 columnas para escritorio: `#desktopSidebar` a la izquierda y `#desktopMainContent` a la derecha.

### 3.2 CSS (`styles.css`)
* Clases para `.desktop-sidebar`, `.desktop-nav-item`, `.desktop-nav-item.active`.
* Estilos responsive `@media (min-width: 1024px)` para ocultar BottomNav y mostrar Sidebar.

### 3.3 JavaScript (`script.js`)
* Función `switchDesktopTab(moduleName)` que gestiona las clases activas en el Sidebar, oculta todas las secciones del contenedor principal y muestra la sección correspondiente con animación `fade-in`.
* Exposición de `window.switchDesktopTab`.

---

## 4. Plan de Verificación

1. **Verificación Responsive**:
   - Redimensionar navegador a >1024px -> Se visualiza el Sidebar a la izquierda y se oculta la barra de navegación móvil.
   - Redimensionar a <1024px -> Se oculta el Sidebar y permanece visible la barra de navegación móvil con FAB `+`.
2. **Prueba de Interacción de Módulos**:
   - Clic en "Gasolina" -> Se visualiza únicamente el módulo de Gasolina en el panel principal.
   - Clic en "Historial" -> Muestra la sección de historial directamente en el panel principal sin abrir modal flotante.
   - Clic en "Inicio" -> Vuelve a mostrar el Dashboard principal de Cierre del Día.
