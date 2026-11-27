# Rediseño Frontend Móvil CalcKms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar la interfaz móvil de CalcKms añadiendo una Bottom Navigation Bar fija, un botón FAB central con Speed Dial (`+ KM` y `+ Gasolina`) y dos Bottom Sheets para la carga ultra-rápida de kilómetros diarios y pagos de combustible.

**Architecture:** Incorporación de elementos HTML semánticos en `index.html` para la Bottom Nav y Bottom Sheets, estilos CSS fluidos con animaciones y soporte para bordes/safe-areas en `styles.css`, y controladores de eventos en `script.js` integrados con la lógica de cálculo y persistencia existente.

**Tech Stack:** HTML5, Vanilla CSS / Tailwind CSS, JavaScript ES6+, Lucide Icons.

## Global Constraints
- Layout móvil responsivo optimizado para anchos de 320px a 440px sin scroll horizontal.
- Mantener la compatibilidad total con la lógica existente en `script.js` (`agregarDeuda()`, `abrirHistorialDesktopModal()`, Sync Firebase).
- Convención de commits: Conventional Commits (`feat:`, `style:`, `fix:`). No incluir "Co-Authored-By".

---

### Task 1: Estructura HTML de la Bottom Navigation Bar y Bottom Sheets

**Files:**
- Modify: `index.html:1050-1080`

**Interfaces:**
- Consumes: Iconos Lucide (`home`, `clock-3`, `grid`, `settings`, `plus`, `route`, `fuel`, `x`).
- Produces: IDs `#mobileBottomNavContainer`, `#fabMainBtn`, `#fabKmBtn`, `#fabGasolinaBtn`, `#sheetCargaKm`, `#sheetCargaGasolina`.

- [ ] **Step 1: Añadir marcado HTML de Bottom Navigation Bar y FAB Speed Dial**

Agregar antes del cierre de `</body>` en `index.html`:

```html
<!-- Bottom Navigation Bar & FAB Speed Dial (Mobile) -->
<div id="mobileBottomNavContainer" class="fixed bottom-0 left-0 right-0 z-40 lg:hidden flex justify-center pointer-events-none">
    <div class="w-full max-w-[440px] relative pointer-events-auto">
        
        <!-- Speed Dial Overlay -->
        <div id="speedDialOverlay" class="fixed inset-0 bg-slate-900/40 backdrop-blur-xs opacity-0 pointer-events-none transition-opacity duration-300 z-30" onclick="toggleSpeedDial(false)"></div>
        
        <!-- Speed Dial Options -->
        <div id="speedDialMenu" class="absolute bottom-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 opacity-0 pointer-events-none transition-all duration-300 transform translate-y-4 z-40">
            <button type="button" id="fabGasolinaBtn" onclick="openQuickSheet('gasolina')" class="flex items-center gap-2.5 px-4 py-2.5 bg-blue-600 text-white font-bold text-xs rounded-full shadow-lg hover:bg-blue-700 active:scale-95 transition-all">
                <i data-lucide="fuel" class="w-4 h-4"></i>
                <span>Cargar Gasolina</span>
            </button>
            <button type="button" id="fabKmBtn" onclick="openQuickSheet('km')" class="flex items-center gap-2.5 px-4 py-2.5 bg-emerald-600 text-white font-bold text-xs rounded-full shadow-lg hover:bg-emerald-700 active:scale-95 transition-all">
                <i data-lucide="route" class="w-4 h-4"></i>
                <span>Cargar KM</span>
            </button>
        </div>

        <!-- Bottom Navigation Bar -->
        <nav class="bg-white/95 backdrop-blur-md border-t border-gray-200/80 px-4 py-2 flex items-center justify-between relative z-40 shadow-lg">
            <button type="button" id="navInicioBtn" onclick="switchMobileTab('inicio')" class="flex flex-col items-center gap-1 text-emerald-600 active:scale-95 transition-transform">
                <i data-lucide="home" class="w-5 h-5"></i>
                <span class="text-[10px] font-bold">Inicio</span>
            </button>
            <button type="button" id="navHistorialBtn" onclick="switchMobileTab('historial')" class="flex flex-col items-center gap-1 text-gray-400 hover:text-gray-600 active:scale-95 transition-transform">
                <i data-lucide="clock-3" class="w-5 h-5"></i>
                <span class="text-[10px] font-medium">Historial</span>
            </button>
            
            <!-- Floating FAB Center Button -->
            <div class="relative -top-5">
                <button type="button" id="fabMainBtn" onclick="toggleSpeedDial()" class="w-14 h-14 bg-gradient-to-tr from-emerald-600 to-teal-500 text-white rounded-full shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-300 border-4 border-[#F2F2F7]">
                    <i data-lucide="plus" id="fabIcon" class="w-7 h-7 transition-transform duration-300"></i>
                </button>
            </div>

            <button type="button" id="navModulosBtn" onclick="switchMobileTab('modulos')" class="flex flex-col items-center gap-1 text-gray-400 hover:text-gray-600 active:scale-95 transition-transform">
                <i data-lucide="grid" class="w-5 h-5"></i>
                <span class="text-[10px] font-medium">Módulos</span>
            </button>
            <button type="button" id="navAjustesBtn" onclick="switchMobileTab('ajustes')" class="flex flex-col items-center gap-1 text-gray-400 hover:text-gray-600 active:scale-95 transition-transform">
                <i data-lucide="settings" class="w-5 h-5"></i>
                <span class="text-[10px] font-medium">Ajustes</span>
            </button>
        </nav>
    </div>
</div>

<!-- Modal Bottom Sheet: Quick KM -->
<div id="sheetCargaKm" class="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-xs opacity-0 pointer-events-none transition-opacity duration-300">
    <div class="w-full max-w-[440px] bg-white rounded-t-3xl p-6 shadow-2xl transform translate-y-full transition-transform duration-300 ease-out">
        <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
                <div class="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                    <i data-lucide="route" class="w-5 h-5"></i>
                </div>
                <h3 class="text-base font-bold text-slate-800">Registrar KM de Hoy</h3>
            </div>
            <button type="button" onclick="closeQuickSheet('km')" class="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
                <i data-lucide="x" class="w-5 h-5"></i>
            </button>
        </div>
        <div class="mb-4">
            <label class="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Kilómetros recorridos</label>
            <div class="flex items-baseline gap-2 border-b-2 border-emerald-500 pb-2">
                <input type="number" id="inputQuickKm" placeholder="0" class="text-4xl font-black text-slate-800 bg-transparent outline-none w-full">
                <span class="text-lg font-bold text-gray-400">km</span>
            </div>
        </div>
        <button type="button" id="btnSaveQuickKm" onclick="submitQuickKm()" class="w-full py-3.5 bg-emerald-600 text-white font-bold text-sm rounded-2xl shadow-lg hover:bg-emerald-700 active:scale-95 transition-all">
            Guardar Kilometraje
        </button>
    </div>
</div>

<!-- Modal Bottom Sheet: Quick Gasolina -->
<div id="sheetCargaGasolina" class="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-xs opacity-0 pointer-events-none transition-opacity duration-300">
    <div class="w-full max-w-[440px] bg-white rounded-t-3xl p-6 shadow-2xl transform translate-y-full transition-transform duration-300 ease-out">
        <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
                <div class="p-2 bg-blue-50 text-blue-600 rounded-xl">
                    <i data-lucide="fuel" class="w-5 h-5"></i>
                </div>
                <h3 class="text-base font-bold text-slate-800">Cargar Gasolina</h3>
            </div>
            <button type="button" onclick="closeQuickSheet('gasolina')" class="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
                <i data-lucide="x" class="w-5 h-5"></i>
            </button>
        </div>
        <div class="mb-4">
            <label class="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Monto Pagado ($)</label>
            <div class="flex items-baseline gap-1 border-b-2 border-blue-500 pb-2 mb-3">
                <span class="text-3xl font-bold text-blue-600">$</span>
                <input type="number" id="inputQuickGasMonto" placeholder="0" class="text-4xl font-black text-slate-800 bg-transparent outline-none w-full">
            </div>
            <label class="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Tipo de pago / Categoría</label>
            <select id="selectQuickGasTipo" class="w-full p-3 bg-gray-50 rounded-xl text-xs font-bold text-slate-700 border border-gray-200 outline-none">
                <option value="Combustible">Combustible</option>
                <option value="Deuda Combustible">Deuda Combustible</option>
            </select>
        </div>
        <button type="button" id="btnSaveQuickGasolina" onclick="submitQuickGasolina()" class="w-full py-3.5 bg-blue-600 text-white font-bold text-sm rounded-2xl shadow-lg hover:bg-blue-700 active:scale-95 transition-all">
            Registrar Carga
        </button>
    </div>
</div>
```

- [ ] **Step 2: Commit del marcado HTML**

```bash
git add index.html
git commit -m "feat: add bottom navigation bar, fab speed dial and quick bottom sheets markup"
```

---

### Task 2: Estilos CSS para Bottom Navigation, FAB y Bottom Sheets

**Files:**
- Modify: `styles.css`

**Interfaces:**
- Consumes: Clases Tailwind y variables CSS existentes.
- Produces: Reglas de posicionamiento, animaciones de despliegue y compatibilidad safe-area.

- [ ] **Step 1: Añadir reglas de animación y posicionamiento en `styles.css`**

Agregar al final de `styles.css`:

```css
/* ==================== BOTTOM NAV & SPEED DIAL ==================== */
.speed-dial-active #speedDialOverlay {
    opacity: 1 !important;
    pointer-events: auto !important;
}

.speed-dial-active #speedDialMenu {
    opacity: 1 !important;
    pointer-events: auto !important;
    transform: translate(-50%, 0) !important;
}

.speed-dial-active #fabIcon {
    transform: rotate(135deg);
}

.bottom-sheet-open {
    opacity: 1 !important;
    pointer-events: auto !important;
}

.bottom-sheet-open > div {
    transform: translateY(0) !important;
}

/* Adjust padding bottom on main container for mobile bottom nav space */
@media (max-width: 1023px) {
    .desktop-dashboard {
        padding-bottom: 6.5rem !important;
    }
}
```

- [ ] **Step 2: Commit de los cambios de estilos**

```bash
git add styles.css
git commit -m "style: add mobile bottom navigation and speed dial animation styles"
```

---

### Task 3: Lógica JS para Interacción del Speed Dial, Bottom Sheets y Solapas

**Files:**
- Modify: `script.js`

**Interfaces:**
- Consumes: Funciones existentes `agregarDeuda()`, `kmHoy` input handler.
- Produces: Funciones globales `toggleSpeedDial()`, `switchMobileTab()`, `openQuickSheet()`, `closeQuickSheet()`, `submitQuickKm()`, `submitQuickGasolina()`.

- [ ] **Step 1: Agregar controladores en `script.js`**

Agregar al final de `script.js`:

```javascript
// ==================== MOBILE BOTTOM NAV & SPEED DIAL LOGIC ====================
function toggleSpeedDial(forceState) {
    const container = document.getElementById('mobileBottomNavContainer');
    if (!container) return;
    
    if (typeof forceState === 'boolean') {
        container.classList.toggle('speed-dial-active', forceState);
    } else {
        container.classList.toggle('speed-dial-active');
    }
    
    if (window.lucide) {
        lucide.createIcons();
    }
}

function openQuickSheet(type) {
    toggleSpeedDial(false);
    if (type === 'km') {
        const sheet = document.getElementById('sheetCargaKm');
        if (sheet) {
            sheet.classList.add('bottom-sheet-open');
            const input = document.getElementById('inputQuickKm');
            const kmActual = document.getElementById('kmHoy');
            if (input && kmActual) input.value = kmActual.value || '';
            setTimeout(() => input && input.focus(), 150);
        }
    } else if (type === 'gasolina') {
        const sheet = document.getElementById('sheetCargaGasolina');
        if (sheet) {
            sheet.classList.add('bottom-sheet-open');
            const input = document.getElementById('inputQuickGasMonto');
            setTimeout(() => input && input.focus(), 150);
        }
    }
}

function closeQuickSheet(type) {
    if (type === 'km') {
        const sheet = document.getElementById('sheetCargaKm');
        if (sheet) sheet.classList.remove('bottom-sheet-open');
    } else if (type === 'gasolina') {
        const sheet = document.getElementById('sheetCargaGasolina');
        if (sheet) sheet.classList.remove('bottom-sheet-open');
    }
}

function submitQuickKm() {
    const input = document.getElementById('inputQuickKm');
    const kmHoyInput = document.getElementById('kmHoy');
    if (!input || !kmHoyInput) return;
    
    const valor = parseFloat(input.value) || 0;
    kmHoyInput.value = valor;
    
    // Disparar evento input para actualizar cálculos automáticos
    kmHoyInput.dispatchEvent(new Event('input', { bubbles: true }));
    
    closeQuickSheet('km');
}

function submitQuickGasolina() {
    const montoInput = document.getElementById('inputQuickGasMonto');
    const tipoSelect = document.getElementById('selectQuickGasTipo');
    if (!montoInput) return;
    
    const monto = parseFloat(montoInput.value) || 0;
    const tipo = tipoSelect ? tipoSelect.value : 'Combustible';
    
    if (monto > 0) {
        const conceptoInput = document.getElementById('montoDeudaCon');
        const montoInputOrig = document.getElementById('montoDeudaVal');
        
        if (conceptoInput && montoInputOrig) {
            conceptoInput.value = tipo;
            montoInputOrig.value = monto;
            if (typeof agregarDeuda === 'function') {
                agregarDeuda();
            }
        }
    }
    
    montoInput.value = '';
    closeQuickSheet('gasolina');
}

function switchMobileTab(tabName) {
    toggleSpeedDial(false);
    
    const tabs = ['inicio', 'historial', 'modulos', 'ajustes'];
    const btnMap = {
        inicio: 'navInicioBtn',
        historial: 'navHistorialBtn',
        modulos: 'navModulosBtn',
        ajustes: 'navAjustesBtn'
    };
    
    tabs.forEach(tab => {
        const btn = document.getElementById(btnMap[tab]);
        if (btn) {
            if (tab === tabName) {
                btn.className = 'flex flex-col items-center gap-1 text-emerald-600 active:scale-95 transition-transform';
                btn.querySelector('span')?.classList.replace('font-medium', 'font-bold');
            } else {
                btn.className = 'flex flex-col items-center gap-1 text-gray-400 hover:text-gray-600 active:scale-95 transition-transform';
                btn.querySelector('span')?.classList.replace('font-bold', 'font-medium');
            }
        }
    });
    
    if (tabName === 'inicio') {
        const main = document.getElementById('seccionCierreDia');
        if (main) main.scrollIntoView({ behavior: 'smooth' });
    } else if (tabName === 'historial') {
        if (typeof abrirHistorialDesktopModal === 'function') {
            abrirHistorialDesktopModal();
        }
    } else if (tabName === 'modulos') {
        const homeMod = document.getElementById('mobileModuleHome');
        if (homeMod) homeMod.scrollIntoView({ behavior: 'smooth' });
    } else if (tabName === 'ajustes') {
        const syncDetails = document.querySelector('details[data-mobile-module="ajustes"]');
        if (syncDetails) syncDetails.open = true;
    }
}
```

- [ ] **Step 2: Commit de los cambios en JS**

```bash
git add script.js
git commit -m "feat: add mobile bottom navigation, speed dial and quick sheets logic"
```

---

### Task 4: Verificación Manual y Pruebas de Integración

**Files:**
- Visual / Browser Testing: `index.html`

- [ ] **Step 1: Probar en navegador la UI responsiva**
  - Abrir la aplicación y emular dispositivo móvil (375px de ancho).
  - Hacer clic en la solapa "Inicio" -> verificar scroll al Dashboard.
  - Hacer clic en la solapa "Historial" -> verificar apertura del modal de historial.
- [ ] **Step 2: Probar el flujo de carga rápida de KM**
  - Presionar FAB `+` -> Hacer clic en "Cargar KM".
  - Ingresar `120` en el Bottom Sheet -> Presionar "Guardar Kilometraje".
  - Verificar que el input `#kmHoy` tenga `120` y los cálculos del hero section se recalculen.
- [ ] **Step 3: Probar el flujo de carga rápida de Gasolina**
  - Presionar FAB `+` -> Hacer clic en "Cargar Gasolina".
  - Ingresar `15000` -> Presionar "Registrar Carga".
  - Verificar que la lista de movimientos/deudas contenga la entrada de Combustible por $15.000.
