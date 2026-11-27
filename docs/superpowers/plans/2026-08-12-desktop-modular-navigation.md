# Rediseño Desktop Modular Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar la navegación modular por Sidebar Lateral Izquierdo para pantallas de escritorio (≥1024px), permitiendo cambiar de módulo en el panel principal manteniendo la vista responsiva.

**Architecture:** Incorporación del Sidebar `<aside id="desktopSidebar">` en `index.html`, definición de layout flex/grid y animaciones en `styles.css`, y controladores de cambio de solapa en `script.js` mediante `switchDesktopTab()`.

**Tech Stack:** HTML5, Vanilla CSS / Tailwind CSS, JavaScript ES6+, Lucide Icons.

## Global Constraints
- Layout responsivo: Sidebar visible solo en pantallas ≥1024px (`hidden lg:flex`).
- En pantallas móviles (<1024px) se mantiene intacta la BottomNav con FAB Speed Dial.
- Convención de commits: Conventional Commits (`feat:`, `style:`, `fix:`). No incluir "Co-Authored-By".

---

### Task 1: Estructura HTML del Sidebar Desktop

**Files:**
- Modify: `index.html:42-45`

**Interfaces:**
- Consumes: Iconos Lucide (`home`, `fuel`, `wrench`, `bar-chart-3`, `wallet`, `clock-3`, `settings`).
- Produces: ID `#desktopSidebar`, botones `#btnDesktopNavInicio`, `#btnDesktopNavGasolina`, `#btnDesktopNavMantenimiento`, `#btnDesktopNavIngresos`, `#btnDesktopNavDeudas`, `#btnDesktopNavHistorial`, `#btnDesktopNavAjustes`.

- [ ] **Step 1: Añadir marcado HTML del Sidebar dentro de `.app-container`**

Modificar la apertura de `.app-container` en `index.html` para estructurar en 2 columnas en desktop:

```html
    <!-- Contenedor Principal APP -->
    <div class="app-container w-full max-w-[440px] lg:max-w-[1280px] bg-[#F2F2F7] sm:rounded-[2rem] sm:shadow-2xl overflow-hidden min-h-screen sm:min-h-0 lg:h-[calc(100vh-3rem)] relative flex flex-col lg:flex-row">

        <!-- ==================== DESKTOP SIDEBAR ==================== -->
        <aside id="desktopSidebar" class="hidden lg:flex flex-col w-64 bg-white border-r border-gray-200/80 p-5 shrink-0 justify-between select-none">
            <div>
                <!-- Brand Logo -->
                <div class="flex items-center gap-3 mb-8 px-2">
                    <div class="w-10 h-10 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-xl flex items-center justify-center text-white shadow-md">
                        <i data-lucide="car" class="w-6 h-6"></i>
                    </div>
                    <div>
                        <h2 class="text-sm font-black text-slate-900 leading-tight">Mi Ahorro</h2>
                        <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Vehicular</span>
                    </div>
                </div>

                <!-- Navigation List -->
                <nav class="space-y-1">
                    <button type="button" id="btnDesktopNavInicio" onclick="switchDesktopTab('inicio')" class="desktop-nav-item active flex items-center gap-3 w-full px-3.5 py-3 rounded-xl text-xs font-bold text-emerald-600 bg-emerald-50 transition-all">
                        <i data-lucide="home" class="w-4 h-4"></i>
                        <span>Inicio</span>
                    </button>
                    <button type="button" id="btnDesktopNavGasolina" onclick="switchDesktopTab('gasolina')" class="desktop-nav-item flex items-center gap-3 w-full px-3.5 py-3 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all">
                        <i data-lucide="fuel" class="w-4 h-4"></i>
                        <span>Gasolina</span>
                    </button>
                    <button type="button" id="btnDesktopNavMantenimiento" onclick="switchDesktopTab('mantenimiento')" class="desktop-nav-item flex items-center gap-3 w-full px-3.5 py-3 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all">
                        <i data-lucide="wrench" class="w-4 h-4"></i>
                        <span>Mantenimiento</span>
                    </button>
                    <button type="button" id="btnDesktopNavIngresos" onclick="switchDesktopTab('ingresos')" class="desktop-nav-item flex items-center gap-3 w-full px-3.5 py-3 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all">
                        <i data-lucide="bar-chart-3" class="w-4 h-4"></i>
                        <span>Rentabilidad</span>
                    </button>
                    <button type="button" id="btnDesktopNavDeudas" onclick="switchDesktopTab('deudas')" class="desktop-nav-item flex items-center gap-3 w-full px-3.5 py-3 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all">
                        <i data-lucide="wallet" class="w-4 h-4"></i>
                        <span>Deudas y Extras</span>
                    </button>
                    <button type="button" id="btnDesktopNavHistorial" onclick="switchDesktopTab('historial')" class="desktop-nav-item flex items-center gap-3 w-full px-3.5 py-3 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all">
                        <i data-lucide="clock-3" class="w-4 h-4"></i>
                        <span>Historial</span>
                    </button>
                    <button type="button" id="btnDesktopNavAjustes" onclick="switchDesktopTab('ajustes')" class="desktop-nav-item flex items-center gap-3 w-full px-3.5 py-3 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all">
                        <i data-lucide="settings" class="w-4 h-4"></i>
                        <span>Ajustes</span>
                    </button>
                </nav>
            </div>
        </aside>

        <!-- Main Wrapper Container -->
        <div class="flex-grow flex flex-col overflow-hidden relative">
```

- [ ] **Step 2: Commit del marcado HTML del Sidebar**

```bash
git add index.html
git commit -m "feat: add desktop sidebar navigation markup"
```

---

### Task 2: Estilos CSS para Sidebar Desktop y Visualización Modular

**Files:**
- Modify: `styles.css`

**Interfaces:**
- Consumes: Tailwind classes y variables CSS existentes.
- Produces: Estilos para `.desktop-nav-item` y visibilidad modular en escritorio.

- [ ] **Step 1: Agregar clases CSS en `styles.css`**

Agregar al final de `styles.css`:

```css
/* ==================== DESKTOP MODULAR SIDEBAR ==================== */
.desktop-nav-item.active {
    background-color: #ECFDF5 !important;
    color: #059669 !important;
    font-weight: 700 !important;
}

@media (min-width: 1024px) {
    .desktop-modular-view section[data-mobile-module] {
        display: none !important;
    }
    .desktop-modular-view section[data-mobile-module].desktop-module-active {
        display: block !important;
    }
}
```

- [ ] **Step 2: Commit de los estilos CSS**

```bash
git add styles.css
git commit -m "style: add desktop sidebar navigation and modular view styles"
```

---

### Task 3: Lógica JS para Cambio de Pestaña Desktop

**Files:**
- Modify: `script.js`

**Interfaces:**
- Consumes: IDs del Sidebar y secciones del Dashboard.
- Produces: Función global `switchDesktopTab(moduleName)`.

- [ ] **Step 1: Agregar controlador `switchDesktopTab` en `script.js`**

Agregar al final de `script.js`:

```javascript
// ==================== DESKTOP MODULAR TAB SWITCHING ====================
function switchDesktopTab(moduleName) {
    const layout = document.getElementById('dashboardLayout');
    if (!layout) return;

    layout.classList.add('desktop-modular-view');

    const btnMap = {
        inicio: 'btnDesktopNavInicio',
        gasolina: 'btnDesktopNavGasolina',
        mantenimiento: 'btnDesktopNavMantenimiento',
        ingresos: 'btnDesktopNavIngresos',
        deudas: 'btnDesktopNavDeudas',
        historial: 'btnDesktopNavHistorial',
        ajustes: 'btnDesktopNavAjustes'
    };

    const sectionMap = {
        inicio: 'seccionCierreDia',
        gasolina: 'seccionGasolina',
        mantenimiento: 'seccionMantenimiento',
        ingresos: 'seccionResumenGanancias',
        deudas: 'seccionDeudasExtras',
        historial: 'seccionHistorial'
    };

    Object.keys(btnMap).forEach(key => {
        const btn = document.getElementById(btnMap[key]);
        if (btn) {
            if (key === moduleName) {
                btn.className = 'desktop-nav-item active flex items-center gap-3 w-full px-3.5 py-3 rounded-xl text-xs font-bold text-emerald-600 bg-emerald-50 transition-all';
            } else {
                btn.className = 'desktop-nav-item flex items-center gap-3 w-full px-3.5 py-3 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all';
            }
        }
    });

    // Ocultar o mostrar secciones
    document.querySelectorAll('section[data-mobile-module]').forEach(sec => {
        sec.classList.remove('desktop-module-active');
        sec.classList.add('hidden');
    });

    if (moduleName === 'inicio') {
        const mainSec = document.getElementById('seccionCierreDia');
        if (mainSec) {
            mainSec.classList.remove('hidden');
            mainSec.classList.add('desktop-module-active');
        }
    } else if (moduleName === 'ajustes') {
        const settingsDetails = document.querySelector('header details[data-mobile-module="ajustes"]');
        if (settingsDetails) settingsDetails.open = true;
    } else {
        const targetId = sectionMap[moduleName];
        if (targetId) {
            const targetSec = document.getElementById(targetId);
            if (targetSec) {
                targetSec.classList.remove('hidden');
                targetSec.classList.add('desktop-module-active');
            }
        }
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.switchDesktopTab = switchDesktopTab;
```

- [ ] **Step 2: Commit del script JS**

```bash
git add script.js
git commit -m "feat: add desktop sidebar tab switching logic"
```

---

### Task 4: Verificación Manual en Navegador

**Files:**
- Visual / Browser Testing: `index.html`

- [ ] **Step 1: Probar responsividad en escritorio**
  - Abrir la app en una pantalla amplia (≥1024px).
  - Verificar la aparición del Sidebar lateral izquierdo a 260px de ancho.
  - Verificar que la barra de navegación móvil permanezca oculta.
- [ ] **Step 2: Probar cambio de pestañas en escritorio**
  - Clic en "Gasolina" -> Se muestra únicamente la sección de Gasolina en el área central.
  - Clic en "Historial" -> Muestra el listado de historial en el área central.
  - Clic en "Inicio" -> Retorna al cierre del día.
