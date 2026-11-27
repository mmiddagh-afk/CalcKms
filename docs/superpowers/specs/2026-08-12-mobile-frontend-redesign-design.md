# Design Spec: Rediseño Frontend Móvil - CalcKms

**Fecha**: 2026-08-12  
**Estado**: Aprobado por el usuario  
**Propósito**: Rediseñar la experiencia móvil de CalcKms (Mi Ahorro Vehicular) para permitir la carga ultrarrápida e intuitiva de kilómetros diarios y gastos de gasolina.

---

## 1. Objetivos de UX y Negocio

1. **Reducción de Fricción**: Permitir al conductor registrar kilómetros recorridos y recargas de gasolina en 2 toques desde cualquier pantalla.
2. **Navegación Fija e Intuitiva**: Reemplazar la grilla dispersa por una barra de navegación inferior (`BottomNav`) fija y accesible con el pulgar.
3. **Claridad Visual**: Dashboard limpio con métricas clave (Ganancia Libre, Total a Separar, Costo por KM) en formato de alto contraste para uso vehicular.

---

## 2. Arquitectura de Navegación y UI

### 2.1 Bottom Navigation Bar
Barra fija en la parte inferior de la pantalla móvil (`position: fixed; bottom: 0;`):
* **Solapa 1 (`#navInicio`)**: Icono `Home` - Dashboard principal con estado del día y métricas.
* **Solapa 2 (`#navHistorial`)**: Icono `Clock` - Historial de cierres de día y recargas.
* **Solapa 3 (`#navModulos`)**: Icono `Grid` - Accesos a Mantenimiento, Rentabilidad y Calculadora.
* **Solapa 4 (`#navAjustes`)**: Icono `Settings` - Sincronización Firebase, Tema Claro/Oscuro.

### 2.2 Central Floating Action Button (FAB) & Speed Dial
* Ubicado en el centro de la `BottomNav` con elevación visual (`#fabMainBtn`).
* Al presionar `#fabMainBtn`:
  * Alterna el estado activo con rotación del icono `+` a `x`.
  * Despliega la capa de overlay traslúcida (`#speedDialOverlay`).
  * Muestra 2 burbujas rápidas con animación `slide-up-fade`:
    1. **`#fabKmBtn` (Cargar KM)**: Icono `Route`, abre Bottom Sheet de Kilómetros.
    2. **`#fabGasolinaBtn` (Cargar Gasolina)**: Icono `Fuel`, abre Bottom Sheet de Gasolina.

---

## 3. Bottom Sheets de Carga Rápida

### 3.1 Bottom Sheet: Cargar KM (`#sheetCargaKm`)
* **Disparador**: Pulsación en burbuja `#fabKmBtn`.
* **Componentes**:
  * Header con título "Registrar KM de Hoy" y botón de cierre (`x`).
  * Input numérico grande con auto-focus (`#inputQuickKm`) y sufijo "km".
  * Card interactivo con vista previa del costo estimado de mantenimiento y gasolina derivado de los KM ingresados.
  * Botón primario de acción: `"Guardar Kilometraje"` (`#btnSaveQuickKm`).

### 3.2 Bottom Sheet: Cargar Gasolina (`#sheetCargaGasolina`)
* **Disparador**: Pulsación en burbuja `#fabGasolinaBtn`.
* **Componentes**:
  * Header con título "Carga de Gasolina" y botón de cierre (`x`).
  * Input principal de Monto ($) (`#inputQuickGasMonto`).
  * Selector rápido de Método de Pago: `[ Efectivo | Tarjeta | Deuda / A pagar ]`.
  * Input opcional de Litros (`#inputQuickGasLitros`).
  * Botón primario de acción: `"Registrar Carga"` (`#btnSaveQuickGasolina`).

---

## 4. Cambios en Código e Integración

### 4.1 HTML (`index.html`)
* Adición de contenedor `#mobileBottomNavContainer` con botones de navegación y FAB Speed Dial.
* Adición de estructuras de modales Bottom Sheet para `#sheetCargaKm` y `#sheetCargaGasolina`.
* Reorganización de contenedores de módulos para responder a las solapas activas.

### 4.2 CSS (`styles.css`)
* Estilos para `.bottom-nav-bar` y `.fab-speed-dial`.
* Clases de animación `.speed-dial-open`, `.bottom-sheet-slide-up`.
* Margen inferior de seguridad (`pb-20` / `env(safe-area-inset-bottom)`) para evitar solapamiento entre la barra fija y el contenido del dashboard.

### 4.3 JavaScript (`script.js`)
* Handlers de eventos para abrir/cerrar Bottom Sheets y activar/desactivar Speed Dial.
* Conexión directa de los formularios del sheet con las funciones de cálculo existentes (`agregarDeuda()`, guardado local y Firebase sync).

---

## 5. Plan de Verificación

1. **Prueba en Dispositivo Móvil / Resizing**: Probar en anchos de pantalla de 360px, 390px y 414px (iOS y Android).
2. **Prueba de Flujo de Carga**:
   * Abrir FAB `+` -> Cargar 150 KM -> Confirmar -> Verificar actualización inmediata de costo por KM y saldo.
   * Abrir FAB `+` -> Cargar $10.000 de gasolina -> Confirmar -> Verificar actualización de historial y deudas.
3. **Prueba de Navegación**: Alternar entre las 4 pestañas fijas verificando que la vista cambie suavemente sin perder el estado de la sesión.
