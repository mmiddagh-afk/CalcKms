# Rediseño Modo Oscuro (Midnight Slate) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar y actualizar los estilos del Modo Oscuro en `styles.css` aplicando la paleta "Midnight Slate" con tarjetas elevadas, inputs hundidos y acentos de alto contraste.

**Architecture:** Modificación de las reglas `body.theme-dark` en `styles.css` para redefinir variables cromaticas, fondos de contenedores, tarjetas, bordes, tipografía y componentes (Sidebar, BottomNav y Bottom Sheets).

**Tech Stack:** CSS3 Vanilla / Tailwind Overrides.

## Global Constraints
- Paleta base: `#090D16` (fondo general), `#0F172A` (Sidebar/Header), `#1E293B` (tarjetas), `#090D16` (inputs hundidos).
- Acentos neón: `#34D399` (Ganancias/Verde), `#FB7185` (Rojo/Deudas), `#60A5FA` (Azul/Gasolina), `#FBBF24` (Ámbar/Mantenimiento).
- Convención de commits: Conventional Commits (`style:`, `feat:`). No incluir "Co-Authored-By".

---

### Task 1: Fondos Base, Tarjetas e Inputs en Dark Mode

**Files:**
- Modify: `styles.css:269-330`

**Interfaces:**
- Consumes: Selector `body.theme-dark`.
- Produces: Fondos de contenedores, bordes e inputs renovados.

- [ ] **Step 1: Actualizar las reglas base de `body.theme-dark` en `styles.css`**

Reemplazar el bloque `body.theme-dark` inicial por:

```css
body.theme-dark {
    background: #090D16 !important;
    color: #F8FAFC;

    --btn-secondary-bg: rgba(30, 41, 59, 0.85);
    --btn-secondary-hover: rgba(51, 65, 85, 0.95);
    --btn-secondary-text: #E2E8F0;
    --btn-secondary-border: rgba(100, 116, 139, 0.45);
    --btn-secondary-shadow: rgba(0, 0, 0, 0.25);

    --btn-danger-bg: rgba(88, 28, 28, 0.55);
    --btn-danger-hover: rgba(153, 27, 27, 0.7);
    --btn-danger-text: #FECDD3;
    --btn-danger-border: rgba(244, 63, 94, 0.45);
    --btn-danger-shadow: rgba(0, 0, 0, 0.25);
}

body.theme-dark .app-container,
body.theme-dark .bg-\[\#F2F2F7\] {
    background: #090D16 !important;
}

body.theme-dark .bg-white {
    background-color: #1E293B !important;
}

body.theme-dark .bg-gray-50 {
    background-color: #090D16 !important;
}

body.theme-dark .bg-gray-100 {
    background-color: #0F172A !important;
}

body.theme-dark .border-gray-50,
body.theme-dark .border-gray-100,
body.theme-dark .border-gray-200 {
    border-color: #334155 !important;
}

body.theme-dark input,
body.theme-dark select {
    background-color: #090D16 !important;
    color: #F8FAFC !important;
    border-color: #334155 !important;
}

body.theme-dark input::placeholder {
    color: #475569 !important;
}
```

- [ ] **Step 2: Commit de los fondos base e inputs**

```bash
git add styles.css
git commit -m "style: update dark mode base backgrounds cards and sunken inputs"
```

---

### Task 2: Jerarquía Tipográfica y Acentos Neón en Dark Mode

**Files:**
- Modify: `styles.css:313-450`

**Interfaces:**
- Consumes: Clases `.text-gray-*`, `.text-slate-*`, `.text-emerald-*`, `.text-red-*`, `.text-blue-*`, `.text-orange-*`.
- Produces: Contraste optimizado de textos y badges.

- [ ] **Step 1: Actualizar tipografía y acentos neón en `styles.css`**

Actualizar las clases de texto para `body.theme-dark`:

```css
body.theme-dark .text-gray-900 { color: #F8FAFC !important; }
body.theme-dark .text-gray-800 { color: #E2E8F0 !important; }
body.theme-dark .text-gray-700 { color: #CBD5E1 !important; }
body.theme-dark .text-gray-600 { color: #94A3B8 !important; }
body.theme-dark .text-gray-500 { color: #94A3B8 !important; }
body.theme-dark .text-gray-400 { color: #64748B !important; }
body.theme-dark .text-gray-300 { color: #475569 !important; }
body.theme-dark .text-gray-200 { color: #334155 !important; }

body.theme-dark .text-slate-900 { color: #F8FAFC !important; }
body.theme-dark .text-slate-800 { color: #E2E8F0 !important; }
body.theme-dark .text-slate-700 { color: #CBD5E1 !important; }
body.theme-dark .text-slate-600 { color: #94A3B8 !important; }
body.theme-dark .text-slate-500 { color: #94A3B8 !important; }
body.theme-dark .text-slate-400 { color: #64748B !important; }

/* Neón Accents */
body.theme-dark .text-emerald-500,
body.theme-dark .text-emerald-600 { color: #34D399 !important; }

body.theme-dark .text-red-500,
body.theme-dark .text-red-600 { color: #FB7185 !important; }

body.theme-dark .text-blue-500,
body.theme-dark .text-blue-600 { color: #60A5FA !important; }

body.theme-dark .text-orange-500,
body.theme-dark .text-orange-600,
body.theme-dark .text-amber-500 { color: #FBBF24 !important; }
```

- [ ] **Step 2: Commit de la tipografía y acentos neón**

```bash
git add styles.css
git commit -m "style: enhance dark mode text hierarchy and neon accent colors"
```

---

### Task 3: Estilos Dark Mode para Sidebar, BottomNav y Bottom Sheets

**Files:**
- Modify: `styles.css:327-420` y final de archivo.

**Interfaces:**
- Consumes: Componentes `#desktopSidebar`, `#mobileBottomNavContainer`, `#sheetCargaKm`, `#sheetCargaGasolina`.
- Produces: Apariencia nocturna coherente en todos los componentes.

- [ ] **Step 1: Agregar reglas Dark Mode para componentes nav y sheets**

Agregar/actualizar en `styles.css`:

```css
/* Sidebar & Header en Dark Mode */
body.theme-dark #desktopSidebar,
body.theme-dark .app-header {
    background-color: #0F172A !important;
    border-color: #1E293B !important;
}

body.theme-dark .desktop-nav-item {
    color: #94A3B8 !important;
}

body.theme-dark .desktop-nav-item:hover {
    background-color: #1E293B !important;
    color: #F8FAFC !important;
}

body.theme-dark .desktop-nav-item.active {
    background-color: rgba(52, 211, 153, 0.15) !important;
    color: #34D399 !important;
}

/* Bottom Navigation & Bottom Sheets en Dark Mode */
body.theme-dark #mobileBottomNavContainer nav {
    background-color: rgba(15, 23, 42, 0.95) !important;
    border-color: #334155 !important;
}

body.theme-dark #sheetCargaKm > div,
body.theme-dark #sheetCargaGasolina > div {
    background-color: #1E293B !important;
    color: #F8FAFC !important;
    border-top: 1px solid #334155;
}

body.theme-dark #sheetCargaKm h3,
body.theme-dark #sheetCargaGasolina h3 {
    color: #F8FAFC !important;
}
```

- [ ] **Step 2: Commit de los estilos de componentes en Dark Mode**

```bash
git add styles.css
git commit -m "style: apply midnight slate theme to desktop sidebar bottomnav and bottom sheets"
```

---

### Task 4: Verificación Manual

**Files:**
- Visual Testing: `index.html`

- [ ] **Step 1: Probar alternancia de Tema Claro / Oscuro**
  - Cambiar a Tema Oscuro en la aplicación.
  - Verificar que el fondo sea `#090D16` y las tarjetas sean `#1E293B`.
  - Probar la legibilidad de los números neón de Ganancia Libre, Gastos y Costo por KM.
  - Abrir los Bottom Sheets en móvil y comprobar el contraste de los inputs hundidos `#090D16`.
