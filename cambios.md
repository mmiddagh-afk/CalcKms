# Mejora móvil premium - Plan de cambios

> **Para Gemini Flash 3.5:** ejecuta este plan de forma secuencial. No rediseñes toda la app. No cambies la lógica de cálculo, Firebase, historial ni fórmulas. El objetivo es mejorar la experiencia móvil para que el usuario pueda ir a cada sección fácil, cómodo y con sensación premium.

**Proyecto:** `E:\Webs Uber\CalcKms`  
**Stack actual:** HTML estático + Tailwind CDN + CSS propio + JavaScript vanilla ES modules + Firebase.  
**Archivos a modificar:**
- `E:\Webs Uber\CalcKms\index.html`
- `E:\Webs Uber\CalcKms\styles.css`
- `E:\Webs Uber\CalcKms\script.js`

**Meta final:**
- En móvil, la app debe sentirse como una app nativa premium.
- El usuario debe poder entrar a cada sección con 1 toque.
- Debe existir una navegación inferior cómoda para el pulgar.
- La pantalla principal debe mantener el resumen/cierre del día y accesos rápidos.
- Cada módulo debe abrirse como pantalla independiente con botón de volver.
- No romper escritorio.

---

## Reglas obligatorias antes de tocar código

1. Haz una copia mental de la estructura actual:
   - `index.html` ya tiene:
     - `#mobileModuleToolbar`
     - `#mobileModuleHome`
     - secciones con `data-mobile-module`
     - `<nav class="bottom-nav">`
     - un script inline con lógica antigua de bottom nav
   - `script.js` ya tiene:
     - `mobileModuleMap`
     - `openMobileModule()`
     - `closeMobileModule()`
     - `initMobileModuleShell()`
   - `styles.css` ya tiene CSS móvil, pero actualmente oculta `.bottom-nav` en móvil con `display: none !important;`.

2. No cambies IDs usados por la lógica existente:
   - `kmHoy`
   - `gananciaLibre`
   - `totalDiario`
   - `gastoGasolinaHoy`
   - `gastoMantenimientoHoy`
   - `seccionCierreDia`
   - `seccionGasolina`
   - `seccionMantenimiento`
   - `seccionControlMant`
   - `seccionResumenGanancias`
   - `seccionDeudasExtras`
   - `seccionHistorial`
   - `mobileModuleToolbar`
   - `mobileModuleHome`

3. No borres Firebase ni funciones de cálculo.

4. Si agregas listeners, hazlo en `script.js`, no en un nuevo framework.

5. Después de cada cambio visual, verifica que en móvil ancho menor a `1100px` no se vea todo apilado: solo debe verse Home o el módulo activo.

---

# Resultado visual esperado

## Estado móvil inicial

Debe verse:

1. Header superior con nombre de app y ajustes.
2. Tarjeta principal `CIERRE DEL DIA`.
3. Bloque `Accesos rapidos / Modulos` con tarjetas.
4. Bottom nav premium fija abajo con:
   - Inicio
   - Calcular
   - Modulos
   - Historial
   - Ajustes

La barra inferior debe estar visible en móvil excepto cuando se abra un módulo, donde puede seguir visible o cambiar a modo compacto. Recomendación: mantenerla visible siempre para sensación app, pero el botón volver arriba debe existir igual.

## Estado móvil al abrir un módulo

Debe verse:

1. Toolbar superior con botón volver e indicador del módulo.
2. Solo el contenido del módulo elegido.
3. Bottom nav sigue visible para saltar rápido a otra sección.
4. No debe aparecer el resto de secciones.

---

# Tarea 1 - Convertir la bottom nav en navegación premium real

## Archivo

Modificar: `E:\Webs Uber\CalcKms\index.html`

## Qué hacer

Busca el bloque actual cerca del comentario:

```html
<!-- ==================== BOTTOM NAV ==================== -->
<nav class="bottom-nav fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[440px] bg-white border-t border-gray-200 flex items-center justify-around py-2 px-4 z-30">
```

Reemplaza todo el `<nav class="bottom-nav ..."> ... </nav>` por este bloque:

```html
<!-- ==================== BOTTOM NAV MOBILE PREMIUM ==================== -->
<nav id="mobileBottomNav" class="bottom-nav" aria-label="Navegacion principal movil">
    <button type="button" class="nav-tab active" data-mobile-nav="home" aria-label="Ir al inicio">
        <i data-lucide="home" class="w-5 h-5"></i>
        <span>Inicio</span>
    </button>

    <button type="button" class="nav-tab nav-tab-primary" data-mobile-nav="cierre" aria-label="Ir a calcular kilometros">
        <span class="nav-tab-primary-icon">
            <i data-lucide="plus" class="w-5 h-5"></i>
        </span>
        <span>Calcular</span>
    </button>

    <button type="button" class="nav-tab" data-mobile-nav="modules" aria-label="Ver modulos">
        <i data-lucide="layout-grid" class="w-5 h-5"></i>
        <span>Modulos</span>
    </button>

    <button type="button" class="nav-tab" data-mobile-nav="historial" aria-label="Abrir historial">
        <i data-lucide="clock-3" class="w-5 h-5"></i>
        <span>Historial</span>
    </button>

    <button type="button" class="nav-tab" data-mobile-nav="ajustes" aria-label="Abrir ajustes">
        <i data-lucide="settings" class="w-5 h-5"></i>
        <span>Ajustes</span>
    </button>
</nav>
```

## Importante

- Ya no uses `data-tab="dashboard"`, `data-tab="historial"`, `data-tab="ajustes"`.
- Usa solo `data-mobile-nav`.
- Mantén el ID `mobileBottomNav`.

---

# Tarea 2 - Eliminar la lógica inline antigua de bottom nav

## Archivo

Modificar: `E:\Webs Uber\CalcKms\index.html`

## Qué hacer

Al final de `index.html`, dentro del `<script>` inline, busca el bloque que empieza con:

```js
// Bottom Nav Tab Logic
 document.querySelectorAll('.nav-tab').forEach(tab => {
```

Ese bloque termina antes de:

```html
</script>

<script type="module" src="script.js"></script>
```

Elimina completo ese bloque de lógica de bottom nav.

## Deja intacto dentro del script inline

Mantén estas partes:
- Reorden visual Fase 2
- `updateClock()`
- `setInterval(updateClock, 30000)`
- MutationObserver de deuda combustible

## Motivo

La navegación debe vivir en `script.js`, porque ahí ya existe el sistema `openMobileModule()` y `closeMobileModule()`.

---

# Tarea 3 - Mejorar el home móvil con mensaje premium y CTA claro

## Archivo

Modificar: `E:\Webs Uber\CalcKms\index.html`

## Qué hacer

Dentro de:

```html
<section id="mobileModuleHome" class="mobile-module-home mx-4 mt-3 animate-slide-up-fade" aria-labelledby="mobile-modules-heading">
```

Justo después del bloque del título y antes de:

```html
<div class="mobile-module-grid" role="list">
```

Inserta este bloque:

```html
<div class="mobile-home-premium-card" aria-label="Resumen de navegacion movil">
    <div>
        <p class="mobile-home-kicker">Acceso rapido</p>
        <h3>Gestiona tu dia sin perder tiempo</h3>
        <p>Calcula kilometros, revisa gastos y consulta historial desde una experiencia optimizada para el pulgar.</p>
    </div>
    <button type="button" class="mobile-home-cta" data-mobile-open="ingresos" data-mobile-title="Ingresos y rentabilidad">
        Ver rentabilidad
        <i data-lucide="arrow-right" class="w-4 h-4"></i>
    </button>
</div>
```

## Nota

Este botón usa `data-mobile-open`, por eso funcionará con `initMobileModuleShell()`.

---

# Tarea 4 - CSS premium para bottom nav visible en móvil

## Archivo

Modificar: `E:\Webs Uber\CalcKms\styles.css`

## Qué hacer

Al final de `styles.css`, agrega este bloque completo:

```css
/* ============================================
   MOBILE PREMIUM NAVIGATION - CAMBIOS 2026-06-30
   ============================================ */

@media (max-width: 1099px) {
    .app-container {
        padding-bottom: calc(82px + env(safe-area-inset-bottom));
    }

    #dashboardLayout {
        padding-bottom: calc(108px + env(safe-area-inset-bottom)) !important;
        scroll-padding-bottom: calc(108px + env(safe-area-inset-bottom));
    }

    .bottom-nav {
        position: fixed !important;
        left: 50% !important;
        right: auto !important;
        bottom: max(10px, env(safe-area-inset-bottom)) !important;
        transform: translateX(-50%) !important;
        width: calc(100% - 24px) !important;
        max-width: 416px !important;
        height: 72px !important;
        display: grid !important;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        align-items: center;
        gap: 4px;
        padding: 8px 8px !important;
        border: 1px solid rgba(148, 163, 184, 0.22) !important;
        border-radius: 28px !important;
        background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(248, 250, 252, 0.88)) !important;
        box-shadow:
            0 24px 70px -34px rgba(15, 23, 42, 0.72),
            inset 0 1px 0 rgba(255, 255, 255, 0.72) !important;
        backdrop-filter: blur(22px) saturate(1.18);
        z-index: 80 !important;
    }

    .nav-tab {
        min-width: 0;
        height: 56px;
        border: 0;
        border-radius: 22px;
        background: transparent;
        color: #64748b;
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        font-size: 9px;
        font-weight: 900;
        letter-spacing: -0.02em;
        transition:
            transform 180ms ease,
            background 180ms ease,
            color 180ms ease,
            box-shadow 180ms ease;
        -webkit-tap-highlight-color: transparent;
    }

    .nav-tab i {
        stroke-width: 2.4;
    }

    .nav-tab span {
        line-height: 1;
    }

    .nav-tab.active {
        color: #059669 !important;
        background: rgba(16, 185, 129, 0.10) !important;
        box-shadow: inset 0 0 0 1px rgba(16, 185, 129, 0.12);
    }

    .nav-tab:active {
        transform: translateY(1px) scale(0.96);
    }

    .nav-tab-primary {
        transform: translateY(-10px);
    }

    .nav-tab-primary:active {
        transform: translateY(-8px) scale(0.96);
    }

    .nav-tab-primary-icon {
        width: 46px;
        height: 46px;
        margin-top: -12px;
        margin-bottom: -2px;
        border-radius: 20px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        background: linear-gradient(135deg, #10b981, #059669);
        box-shadow: 0 18px 36px -18px rgba(5, 150, 105, 0.72);
    }

    .nav-tab-primary.active {
        background: transparent !important;
        box-shadow: none !important;
    }

    .nav-tab-primary.active .nav-tab-primary-icon {
        background: linear-gradient(135deg, #34d399, #059669);
    }

    body.mobile-module-open .bottom-nav {
        display: grid !important;
    }
}

body.theme-dark .bottom-nav {
    background:
        linear-gradient(180deg, rgba(15, 23, 42, 0.94), rgba(2, 6, 23, 0.90)) !important;
    border-color: rgba(148, 163, 184, 0.18) !important;
    box-shadow: 0 24px 76px -34px rgba(0, 0, 0, 0.95) !important;
}

body.theme-dark .nav-tab {
    color: #94a3b8;
}

body.theme-dark .nav-tab.active {
    color: #6ee7b7 !important;
    background: rgba(52, 211, 153, 0.12) !important;
    box-shadow: inset 0 0 0 1px rgba(52, 211, 153, 0.14);
}
```

## Muy importante

En el CSS existente hay reglas que ocultan `.bottom-nav` en móvil:

```css
body.mobile-module-open .bottom-nav {
    display: none !important;
}

.bottom-nav {
    display: none !important;
}
```

No necesitas borrarlas si agregas el bloque anterior al final del archivo, porque el bloque nuevo debe ganar por orden y especificidad. Si sigue sin verse la barra, entonces cambia esas reglas antiguas a comentario.

---

# Tarea 5 - CSS para la tarjeta premium del home móvil

## Archivo

Modificar: `E:\Webs Uber\CalcKms\styles.css`

## Qué hacer

Debajo del bloque CSS de la Tarea 4, agrega:

```css
/* ============================================
   MOBILE HOME PREMIUM CARD
   ============================================ */

@media (max-width: 1099px) {
    .mobile-home-premium-card {
        border: 1px solid rgba(16, 185, 129, 0.16);
        border-radius: 28px;
        padding: 16px;
        margin-bottom: 14px;
        background:
            radial-gradient(circle at top right, rgba(16, 185, 129, 0.18), transparent 9rem),
            linear-gradient(145deg, rgba(255, 255, 255, 0.96), rgba(236, 253, 245, 0.72));
        box-shadow: 0 18px 48px -34px rgba(15, 23, 42, 0.62);
        overflow: hidden;
        position: relative;
    }

    .mobile-home-premium-card::after {
        content: '';
        position: absolute;
        right: -32px;
        bottom: -38px;
        width: 112px;
        height: 112px;
        border-radius: 999px;
        background: rgba(16, 185, 129, 0.10);
    }

    .mobile-home-kicker {
        color: #059669;
        font-size: 10px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.22em;
        margin-bottom: 4px;
    }

    .mobile-home-premium-card h3 {
        color: #0f172a;
        font-size: 20px;
        line-height: 1.05;
        font-weight: 950;
        letter-spacing: -0.055em;
        margin: 0 0 6px;
        max-width: 280px;
    }

    .mobile-home-premium-card p:not(.mobile-home-kicker) {
        color: #64748b;
        font-size: 12px;
        line-height: 1.45;
        font-weight: 700;
        max-width: 310px;
        margin: 0;
    }

    .mobile-home-cta {
        margin-top: 14px;
        position: relative;
        z-index: 1;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: 0;
        border-radius: 16px;
        padding: 11px 13px;
        color: #ffffff;
        background: linear-gradient(135deg, #10b981, #059669);
        box-shadow: 0 16px 34px -20px rgba(5, 150, 105, 0.78);
        font-size: 12px;
        font-weight: 900;
    }

    .mobile-home-cta:active {
        transform: translateY(1px) scale(0.98);
    }
}

body.theme-dark .mobile-home-premium-card {
    border-color: rgba(52, 211, 153, 0.16);
    background:
        radial-gradient(circle at top right, rgba(52, 211, 153, 0.12), transparent 9rem),
        linear-gradient(145deg, rgba(15, 23, 42, 0.92), rgba(6, 78, 59, 0.32));
}

body.theme-dark .mobile-home-premium-card h3 {
    color: #e5e7eb;
}

body.theme-dark .mobile-home-premium-card p:not(.mobile-home-kicker) {
    color: #94a3b8;
}
```

---

# Tarea 6 - Hacer que el toolbar móvil sea más premium y no tape contenido

## Archivo

Modificar: `E:\Webs Uber\CalcKms\styles.css`

## Qué hacer

Al final de `styles.css`, debajo de lo anterior, agrega:

```css
/* ============================================
   MOBILE MODULE TOOLBAR PREMIUM
   ============================================ */

@media (max-width: 1099px) {
    body.mobile-module-open .mobile-module-toolbar {
        display: flex !important;
        top: 54px;
        margin: 0 12px 10px;
        border-radius: 24px;
        border: 1px solid rgba(148, 163, 184, 0.16);
        background: rgba(255, 255, 255, 0.86);
        box-shadow: 0 18px 46px -34px rgba(15, 23, 42, 0.68);
    }

    .mobile-module-back-btn {
        flex: 0 0 auto;
    }

    body.mobile-module-open .desktop-dashboard > [data-mobile-module].mobile-module-active {
        margin-top: 12px !important;
    }

    body.mobile-module-open[data-mobile-module="ajustes"] header details[data-mobile-module="ajustes"].mobile-module-active > div {
        top: 142px !important;
        border-radius: 26px !important;
    }
}

body.theme-dark.mobile-module-open .mobile-module-toolbar {
    background: rgba(15, 23, 42, 0.86) !important;
    border-color: rgba(148, 163, 184, 0.16) !important;
}
```

---

# Tarea 7 - Mover toda la lógica de bottom nav a script.js

## Archivo

Modificar: `E:\Webs Uber\CalcKms\script.js`

## Qué hacer

Busca la función existente:

```js
function closeMobileModule() {
```

Reemplázala completa por esta versión:

```js
function closeMobileModule() {
    clearMobileModuleActiveState();
    closeMobileSettingsModule();
    document.body.classList.remove('mobile-module-open');
    delete document.body.dataset.mobileModule;
    setMobileModuleTitle('Inicio');
    updateMobileBottomNavActive('home');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}
```

## Luego agrega estas funciones nuevas antes de `function initMobileModuleShell()`

```js
function updateMobileBottomNavActive(activeId) {
    document.querySelectorAll('[data-mobile-nav]').forEach((button) => {
        const isActive = button.dataset.mobileNav === activeId;
        button.classList.toggle('active', isActive);
        if (isActive) {
            button.setAttribute('aria-current', 'page');
        } else {
            button.removeAttribute('aria-current');
        }
    });
}

function scrollMobileHomeToModules() {
    closeMobileModule();
    window.setTimeout(() => {
        const modules = document.getElementById('mobileModuleHome');
        if (modules) {
            modules.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        updateMobileBottomNavActive('modules');
    }, 80);
}

function scrollMobileHomeToCierre() {
    closeMobileModule();
    window.setTimeout(() => {
        const cierre = document.getElementById('seccionCierreDia');
        const input = document.getElementById('kmHoy');
        if (cierre) {
            cierre.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        if (input) {
            window.setTimeout(() => input.focus({ preventScroll: true }), 260);
        }
        updateMobileBottomNavActive('cierre');
    }, 80);
}

function openMobileNavDestination(destination) {
    if (!destination) return;

    if (!isMobileModuleViewport()) {
        if (destination === 'historial') abrirHistorialDesktopModal();
        if (destination === 'ajustes') {
            const settingsDetails = document.querySelector('header details[data-mobile-module="ajustes"]');
            if (settingsDetails) settingsDetails.open = true;
        }
        return;
    }

    if (destination === 'home') {
        closeMobileModule();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        updateMobileBottomNavActive('home');
        return;
    }

    if (destination === 'cierre') {
        scrollMobileHomeToCierre();
        return;
    }

    if (destination === 'modules') {
        scrollMobileHomeToModules();
        return;
    }

    if (destination === 'historial') {
        openMobileModule('historial', 'Historial');
        updateMobileBottomNavActive('historial');
        return;
    }

    if (destination === 'ajustes') {
        openMobileModule('ajustes', 'Ajustes');
        updateMobileBottomNavActive('ajustes');
    }
}

function initMobileBottomNav() {
    document.querySelectorAll('[data-mobile-nav]').forEach((button) => {
        button.addEventListener('click', () => {
            openMobileNavDestination(button.dataset.mobileNav);
        });
    });
}
```

## Luego modifica `openMobileModule()`

Dentro de `openMobileModule(moduleId, explicitTitle)`, después de:

```js
setMobileModuleTitle(explicitTitle || mapEntry.title);
```

Agrega:

```js
updateMobileBottomNavActive(moduleId);
```

## Luego modifica `initMobileModuleShell()`

Busca:

```js
function initMobileModuleShell() {
```

Dentro de esa función, al inicio, agrega:

```js
initMobileBottomNav();
```

Debe quedar así:

```js
function initMobileModuleShell() {
    initMobileBottomNav();

    document.querySelectorAll('[data-mobile-open]').forEach((button) => {
        button.addEventListener('click', () => {
            button.classList.remove('mobile-module-pressed');
            void button.offsetWidth;
            button.classList.add('mobile-module-pressed');
            openMobileModule(button.dataset.mobileOpen, button.dataset.mobileTitle);
        });
    });

    document.getElementById('mobileModuleBackBtn')?.addEventListener('click', closeMobileModule);

    window.addEventListener('resize', () => {
        if (!isMobileModuleViewport()) closeMobileModule();
    });
}
```

---

# Tarea 8 - Asegurar que Historial móvil siempre pueda abrirse

## Archivo

Modificar: `E:\Webs Uber\CalcKms\script.js`

## Problema actual

`renderHistorialFromData()` puede llamar a `cerrarHistorialDesktopModal()` cuando no hay historial. Eso está bien para escritorio, pero en móvil el usuario debe poder abrir el módulo historial aunque esté vacío.

## Qué hacer

Busca en `renderHistorialFromData(historial)` el bloque:

```js
if (safeHistorial.length === 0) {
```

Dentro de ese bloque, si aparece:

```js
cerrarHistorialDesktopModal();
```

Cámbialo por:

```js
if (isDesktopViewport()) cerrarHistorialDesktopModal();
```

## Motivo

En móvil, Historial debe ser una pantalla vacía elegante, no una sección que se cierra sola.

---

# Tarea 9 - Estado vacío premium para historial

## Archivo

Modificar: `E:\Webs Uber\CalcKms\script.js`

## Qué hacer

En `renderHistorialFromData(historial)`, dentro del bloque `if (safeHistorial.length === 0)`, asegúrate de que `lista.innerHTML` use este HTML exacto o equivalente:

```js
lista.innerHTML = `
    <div class="mobile-empty-state historial-empty-state">
        <div class="mobile-empty-icon">
            <i data-lucide="clock-3" class="w-7 h-7"></i>
        </div>
        <h3>Aun no tienes movimientos</h3>
        <p>Agrega tus kilometros del dia y aqui veras el historial de gastos, mantenimiento y extras.</p>
        <button type="button" class="mobile-empty-action" data-mobile-nav="cierre">
            Agregar primer registro
            <i data-lucide="arrow-right" class="w-4 h-4"></i>
        </button>
    </div>
`;
```

Después de asignar ese HTML, agrega este listener porque el botón fue creado dinámicamente:

```js
lista.querySelector('[data-mobile-nav="cierre"]')?.addEventListener('click', () => {
    openMobileNavDestination('cierre');
});
```

Después de eso llama:

```js
if (typeof lucide !== 'undefined') lucide.createIcons();
```

## CSS para este estado vacío

En `styles.css`, al final, agrega:

```css
/* ============================================
   MOBILE EMPTY STATES
   ============================================ */

.mobile-empty-state {
    min-height: 280px;
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 28px;
    padding: 28px 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    background:
        radial-gradient(circle at top, rgba(16, 185, 129, 0.10), transparent 9rem),
        rgba(255, 255, 255, 0.88);
    box-shadow: 0 18px 48px -34px rgba(15, 23, 42, 0.62);
}

.mobile-empty-icon {
    width: 62px;
    height: 62px;
    border-radius: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #059669;
    background: rgba(16, 185, 129, 0.11);
    margin-bottom: 14px;
}

.mobile-empty-state h3 {
    color: #0f172a;
    font-size: 20px;
    font-weight: 950;
    letter-spacing: -0.045em;
    margin: 0 0 6px;
}

.mobile-empty-state p {
    color: #64748b;
    font-size: 12px;
    line-height: 1.45;
    font-weight: 700;
    max-width: 280px;
    margin: 0 auto 16px;
}

.mobile-empty-action {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 0;
    border-radius: 16px;
    padding: 12px 14px;
    color: #ffffff;
    background: linear-gradient(135deg, #10b981, #059669);
    box-shadow: 0 16px 34px -20px rgba(5, 150, 105, 0.78);
    font-size: 12px;
    font-weight: 900;
}

body.theme-dark .mobile-empty-state {
    background:
        radial-gradient(circle at top, rgba(52, 211, 153, 0.10), transparent 9rem),
        rgba(15, 23, 42, 0.84);
    border-color: rgba(148, 163, 184, 0.15);
}

body.theme-dark .mobile-empty-state h3 {
    color: #e5e7eb;
}

body.theme-dark .mobile-empty-state p {
    color: #94a3b8;
}
```

---

# Tarea 10 - Añadir microinteracciones premium a tarjetas de módulos

## Archivo

Modificar: `E:\Webs Uber\CalcKms\styles.css`

## Qué hacer

Agrega al final:

```css
/* ============================================
   MOBILE MODULE MICROINTERACTIONS
   ============================================ */

@media (max-width: 1099px) {
    .mobile-module-card {
        touch-action: manipulation;
    }

    .mobile-module-card:focus-visible,
    .nav-tab:focus-visible,
    .mobile-home-cta:focus-visible,
    .mobile-empty-action:focus-visible {
        outline: 3px solid rgba(16, 185, 129, 0.28);
        outline-offset: 3px;
    }

    .mobile-module-card:hover {
        transform: translateY(-1px);
    }

    .mobile-module-card strong,
    .mobile-module-card small,
    .mobile-module-card i {
        pointer-events: none;
    }
}

@media (prefers-reduced-motion: reduce) {
    .mobile-module-card,
    body.mobile-module-open .desktop-dashboard > [data-mobile-module].mobile-module-active,
    .nav-tab,
    .mobile-home-cta,
    .mobile-empty-action {
        animation: none !important;
        transition: none !important;
    }
}
```

---

# Tarea 11 - Verificación manual obligatoria

Como este proyecto no tiene suite de tests visible, haz verificación manual en navegador.

## Verificar en móvil, ancho 390px o similar

1. Cargar la app.
2. Confirmar que se ve la bottom nav con 5 botones.
3. Tocar `Inicio`:
   - Debe cerrar cualquier módulo.
   - Debe ir arriba.
4. Tocar `Calcular`:
   - Debe ir a `CIERRE DEL DIA`.
   - Debe enfocar `kmHoy` sin romper scroll.
5. Tocar `Modulos`:
   - Debe ir al grid de módulos.
6. Tocar tarjeta `Gasolina`:
   - Debe abrir solo Gasolina.
   - Debe aparecer toolbar con botón volver.
   - Bottom nav debe seguir visible.
7. Tocar `Mantenimiento` en tarjeta:
   - Debe abrir secciones mantenimiento y control mantenimiento.
8. Tocar `Historial` en bottom nav:
   - Debe abrir Historial aunque esté vacío.
   - Si está vacío, debe verse estado vacío premium.
9. Tocar `Ajustes`:
   - Debe abrir panel de ajustes como módulo.
10. Tocar botón volver:
   - Debe volver a home.

## Verificar en escritorio, ancho mayor a 1100px

1. La navegación desktop no debe romperse.
2. El historial desktop modal debe seguir funcionando.
3. El panel de ajustes del header debe seguir funcionando.
4. Las secciones deben seguir visibles como dashboard.

---

# Tarea 12 - Criterios de aceptación

El cambio se considera completo solo si se cumplen todos:

- [ ] En móvil la bottom nav premium es visible.
- [ ] La bottom nav no tapa botones importantes gracias al padding inferior.
- [ ] `Inicio` vuelve al home.
- [ ] `Calcular` lleva al cierre del día.
- [ ] `Modulos` lleva a las tarjetas.
- [ ] `Historial` abre historial como módulo.
- [ ] `Ajustes` abre ajustes como módulo.
- [ ] El botón volver funciona desde cualquier módulo.
- [ ] El módulo activo es el único visible en móvil.
- [ ] En escritorio no cambia el comportamiento principal.
- [ ] No se modificaron fórmulas ni estructura de datos.
- [ ] No hay errores en consola relacionados con funciones no definidas.

---

# Riesgos y cómo evitarlos

## Riesgo 1: `updateMobileBottomNavActive` no existe cuando se llama

Solución: asegúrate de definir `updateMobileBottomNavActive()` antes de `openMobileModule()` o al menos antes de que se ejecute. En JavaScript, las funciones declaradas con `function nombre()` tienen hoisting, así que puede estar antes de `initMobileModuleShell()`.

## Riesgo 2: el botón dinámico del historial vacío no funciona

Solución: después de `lista.innerHTML = ...`, agrega manualmente el event listener:

```js
lista.querySelector('[data-mobile-nav="cierre"]')?.addEventListener('click', () => {
    openMobileNavDestination('cierre');
});
```

## Riesgo 3: bottom nav sigue oculta

Solución: buscar en `styles.css` reglas con:

```css
.bottom-nav {
    display: none !important;
}
```

y asegurarse de que el bloque nuevo de `MOBILE PREMIUM NAVIGATION` esté al final del archivo. Si aun así no aparece, comentar la regla vieja.

## Riesgo 4: ajustes aparece mal posicionado

Solución: revisar este selector:

```css
body.mobile-module-open[data-mobile-module="ajustes"] header details[data-mobile-module="ajustes"].mobile-module-active > div
```

Debe tener `position: fixed`, `left: 16px`, `right: 16px`, `top: 142px`, `max-width: 408px`.

---

# Commit sugerido

Si se usa git, hacer un commit con:

```bash
git add index.html styles.css script.js cambios.md
git commit -m "feat: improve premium mobile navigation"
```


---

# Desgaste Multicomponente y Modal de Vehículo (2026-10-28)

Implementación del sistema de reserva y desgaste multicomponente para el módulo de Mantenimiento de CalcKms.

### Novedades y Funcionalidades
1. **Modal de Vehículo (`#modalVehiculo`)**:
   - Acceso táctil directo desde la tarjeta de información del vehículo en la pantalla principal y botón en la sección Mantenimiento.
   - Configuración individual de 4 componentes clave:
     - **Llantas**: Precio estimado y vida útil en KM.
     - **Frenos**: Precio estimado y vida útil en KM.
     - **Cambio de Aceite**: Precio estimado y vida útil en KM.
     - **Extras e Imprevistos**: Precio estimado y vida útil en KM.
   - Previsualización en tiempo real de la tasa por kilómetro individual (`$/km`) y del desgaste total combinado.
   - Proyección dinámica de la meta del ciclo actual (`kmMeta * tasaTotal`).

2. **Cálculo Reactivo y Fondo Único**:
   - Reemplaza el cálculo manual de Costo Meta cuando hay componentes configurados con tasa mayor a cero.
   - Las tasas de todos los componentes se suman en una única tasa combinada que nutre el fondo de ahorro existente (`ahorroActual`).
   - Detención automática de la separación diaria (`ahorroMantenimientoPorKm = 0`) cuando el ahorro acumulado iguala o supera la meta proyectada (`ahorroActual >= metaMantenimientoProyectada`), activando `#msgMetaAlcanzada`.
   - Compatibilidad hacia atrás: si no hay componentes configurados, se preserva el comportamiento manual tradicional de `metaMantenimiento`.

3. **Gastos e Imprevistos Reales**:
   - La acción de descontar mantenimiento (`aplicarDescuentoMantenimiento`) en modo multicomponente resta exclusivamente del fondo acumulado (`ahorroActual`), preservando la tasa intrínseca de desgaste por kilómetro del auto.

4. **Persistencia y UI**:
   - Sincronización automática con Firestore y cola offline a través de `settingsInputs`.
   - Soporte para cierre con tecla `Escape` y clic en backdrop.
   - Estilos pulidos para tema claro y tema oscuro (`body.theme-dark`), con micro-chips informativos y badges de estado.

---

# Ahorro Individual por Componente y Sincronización Unificada (2026-10-28)

Incorporación de campos de ahorro individual por componente en el modal de vehículo con sincronización contable unificada hacia el fondo general de mantenimiento.

### Novedades y Funcionalidades
1. **Campos de Ahorro Individual por Repuesto (`#vehiculo...Ahorrado`)**:
   - Cada componente (Llantas, Frenos, Aceite, Extras) cuenta ahora con su propio campo de entrada para anotar el monto ahorrado específico.
   - Indicador de progreso en vivo por componente (`%` y `$Ahorrado de $Precio`).
   - Micro-badge **"Meta OK"** cuando un repuesto alcanza o supera el 100% de su precio.

2. **Suma Automática Unificada (Opción A)**:
   - La suma de lo que se asigna a cada repuesto (`ahorroLlantas + ahorroFrenos + ahorroAceite + ahorroExtras`) actualiza de forma automática el total ahorrado de mantenimiento (`ahorroActual`).
   - En la pantalla principal, el campo `ahorroActual` pasa a modo lectura con tooltip informativo cuando el modo multicomponente está activo, garantizando coherencia contable absoluta.
   - Totalizador de ahorro en el footer del modal (`#vehiculoTotalAhorrado`).

3. **Deducciones Proporcionales Limpias (`distributeMaintenanceDeduction`)**:
   - Al registrar un gasto imprevisto o descuento general, el sistema descuenta proporcionalmente de los componentes que tienen saldo, manteniendo intacta la suma contable.
