# Descuento de Ahorro y Costo Meta de Mantenimiento por Emergencias Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar una fila de descuento rápido en la tarjeta de Mantenimiento (`#seccionMantenimiento`) para deducir gastos e imprevistos de emergencia simultáneamente del ahorro acumulado (`ahorroActual`) y del costo meta (`metaMantenimiento`), recalculando métricas en tiempo real y desplegando a Netlify.

**Architecture:** Función algorítmica pura `calculateMaintenanceDeduction` desacoplada y validada mediante TDD con Node.js assert; integración en el DOM dentro de `#seccionMantenimiento` en `index.html`; función orquestadora `aplicarDescuentoMantenimiento` en `script.js` con soporte para Enter, persistencia atómica con `saveSettingToCloudNow`, confirmación preventiva y feedback visual/háptico; suite de integración en `tests/integration-verify.js`; y despliegue final en producción a Netlify.

**Tech Stack:** Vanilla JavaScript (ES6+), HTML5, Tailwind CSS, Lucide Icons, Firestore Client SDK, Node.js Test Runner / Assertions, Netlify CLI.

## Global Constraints

- Nunca añadir atribución de IA ("Co-Authored-By", etc.) en los mensajes de commit. Usar estrictamente Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`).
- Seguir metodología TDD estricta: escribir primero el test que falla, verificar el fallo, implementar el código mínimo, verificar que pase, y commitear.
- Preservar comentarios existentes y docstrings en `script.js` e `index.html`.
- Usar clases de estilo existentes (`input-calc`, variables para dark mode) para mantener coherencia visual absoluta.

---

### Task 1: Función Pura `calculateMaintenanceDeduction` con TDD

**Files:**
- Create: `tests/maintenance-deduction-logic.test.js`
- Modify: `script.js`

**Interfaces:**
- Produces: `calculateMaintenanceDeduction(currentSavings, currentGoal, deductionAmount) -> { newSavings: number, newGoal: number, deducted: number }`

- [ ] **Step 1: Escribir el test que falla para `calculateMaintenanceDeduction`**

Crear el archivo `tests/maintenance-deduction-logic.test.js`:
```javascript
const assert = require('assert');
const vm = require('vm');
const fs = require('fs');

const scriptContext = {};
let calculateMaintenanceDeduction;

try {
    const content = fs.readFileSync('script.js', 'utf8');
    const fnMatch = content.match(/function calculateMaintenanceDeduction[\s\S]*?\n\}/);
    if (fnMatch) {
        vm.runInNewContext(fnMatch[0], scriptContext);
        calculateMaintenanceDeduction = scriptContext.calculateMaintenanceDeduction;
    }
} catch (e) {}

if (typeof calculateMaintenanceDeduction !== 'function') {
    calculateMaintenanceDeduction = () => ({ newSavings: 0, newGoal: 0, deducted: 0 });
}

// Test 1: Deducción estándar presupuestada ($580 ahorro, $1390 meta, descuento $80)
const res1 = calculateMaintenanceDeduction(580, 1390, 80);
assert.strictEqual(res1.newSavings, 500, 'Ahorro debe quedar en 500');
assert.strictEqual(res1.newGoal, 1310, 'Meta debe quedar en 1310');
assert.strictEqual(res1.deducted, 80, 'Deducción debe ser 80');

// Test 2: Deducción mayor al ahorro disponible ($100 ahorro, $500 meta, descuento $150)
const res2 = calculateMaintenanceDeduction(100, 500, 150);
assert.strictEqual(res2.newSavings, 0, 'Ahorro debe quedar en 0 sin ser negativo');
assert.strictEqual(res2.newGoal, 350, 'Meta debe quedar en 350');
assert.strictEqual(res2.deducted, 150, 'Deducción debe ser 150');

// Test 3: Deducción mayor a la meta ($200 ahorro, $150 meta, descuento $250)
const res3 = calculateMaintenanceDeduction(200, 150, 250);
assert.strictEqual(res3.newSavings, 0, 'Ahorro debe quedar en 0');
assert.strictEqual(res3.newGoal, 0, 'Meta debe quedar en 0 sin ser negativa');
assert.strictEqual(res3.deducted, 250);

// Test 4: Deducción 0 o negativa no altera valores
const res4 = calculateMaintenanceDeduction(500, 1000, 0);
assert.strictEqual(res4.newSavings, 500);
assert.strictEqual(res4.newGoal, 1000);
assert.strictEqual(res4.deducted, 0);

const res5 = calculateMaintenanceDeduction(500, 1000, -50);
assert.strictEqual(res5.newSavings, 500);
assert.strictEqual(res5.newGoal, 1000);
assert.strictEqual(res5.deducted, 0);

// Test 5: Manejo de inputs inválidos o no numéricos
const res6 = calculateMaintenanceDeduction('500', '1000', '100');
assert.strictEqual(res6.newSavings, 400);
assert.strictEqual(res6.newGoal, 900);
assert.strictEqual(res6.deducted, 100);

console.log('✅ All calculateMaintenanceDeduction logic tests passed.');
```

- [ ] **Step 2: Ejecutar el test para comprobar que falla**

Run: `node tests/maintenance-deduction-logic.test.js`  
Expected: FAIL con error de aserción (stub devuelve `{ newSavings: 0, newGoal: 0, deducted: 0 }`).

- [ ] **Step 3: Implementar `calculateMaintenanceDeduction` en `script.js`**

Agregar la función en `script.js` (cerca de la línea 1324, antes de `calcular()`):
```javascript
/**
 * Calcula los nuevos montos de ahorro y costo meta tras un gasto o emergencia.
 * @param {number} currentSavings - Ahorro acumulado actual (ahorroActual).
 * @param {number} currentGoal - Presupuesto meta actual (metaMantenimiento).
 * @param {number} deductionAmount - Monto del gasto/emergencia a descontar.
 * @returns {{ newSavings: number, newGoal: number, deducted: number }}
 */
function calculateMaintenanceDeduction(currentSavings, currentGoal, deductionAmount) {
    const validDeduction = Math.max(0, toFiniteNumber(deductionAmount, 0));
    if (validDeduction <= 0) {
        return {
            newSavings: Math.max(0, toFiniteNumber(currentSavings, 0)),
            newGoal: Math.max(0, toFiniteNumber(currentGoal, 0)),
            deducted: 0
        };
    }
    const savings = Math.max(0, toFiniteNumber(currentSavings, 0));
    const goal = Math.max(0, toFiniteNumber(currentGoal, 0));

    return {
        newSavings: Math.max(0, savings - validDeduction),
        newGoal: Math.max(0, goal - validDeduction),
        deducted: validDeduction
    };
}
```

- [ ] **Step 4: Ejecutar el test para verificar que pase**

Run: `node tests/maintenance-deduction-logic.test.js`  
Expected: `✅ All calculateMaintenanceDeduction logic tests passed.`

- [ ] **Step 5: Commit**

```bash
git add tests/maintenance-deduction-logic.test.js script.js
git commit -m "feat(maintenance): add pure calculateMaintenanceDeduction logic with tests"
```

---

### Task 2: Marcado HTML y Estilos en `#seccionMantenimiento`

**Files:**
- Modify: `index.html:435-445`

**Interfaces:**
- Produces: Elementos `#descuentoMantenimiento` (input numérico) y `#btnDescontarMantenimiento` (botón de acción rápida con handler `onclick="aplicarDescuentoMantenimiento()"`) en `#seccionMantenimiento`.

- [ ] **Step 1: Agregar el bloque de descuento en `index.html`**

En `index.html`, ubicar el bloque inferior de campos avanzados dentro de `#seccionMantenimiento` (alrededor de la línea 437, debajo del campo `kmRecorridosCiclo`):

```html
                    <div class="flex items-center justify-between">
                        <span class="text-xs text-gray-400">KM Recorridos</span>
                        <input type="number" id="kmRecorridosCiclo" placeholder="0"
                            class="input-calc text-xs font-bold text-gray-700 text-right bg-transparent outline-none w-20">
                    </div>
                    <div class="flex items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-slate-800">
                        <div class="flex items-center gap-1.5">
                            <i data-lucide="circle-minus" class="w-3.5 h-3.5 text-amber-500"></i>
                            <span class="text-xs text-gray-400 dark:text-slate-400">Gasto / Emergencia</span>
                        </div>
                        <div class="flex items-center gap-1.5">
                            <span class="text-xs text-gray-400">$</span>
                            <input type="number" id="descuentoMantenimiento" placeholder="0" inputmode="numeric"
                                class="input-calc text-xs font-bold text-gray-700 dark:text-slate-200 text-right bg-transparent outline-none w-16 border-b border-gray-200 dark:border-slate-700 focus:border-amber-500">
                            <button type="button" id="btnDescontarMantenimiento" onclick="aplicarDescuentoMantenimiento()"
                                class="px-2.5 py-1 text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 dark:text-amber-300 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 rounded-lg active:scale-95 transition-all">
                                Descontar
                            </button>
                        </div>
                    </div>
```

- [ ] **Step 2: Verificar presencia en el DOM mediante test o script**

Ejecutar en consola:
```powershell
Select-String -Path .\index.html -Pattern "descuentoMantenimiento"
```
Expected: Coincidencia con `#descuentoMantenimiento` y `#btnDescontarMantenimiento`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(ui): add maintenance emergency deduction row in maintenance card"
```

---

### Task 3: Controlador de Interacción y Persistencia (`aplicarDescuentoMantenimiento`)

**Files:**
- Create: `tests/maintenance-deduction-actions.test.js`
- Modify: `script.js`

**Interfaces:**
- Consumes: `calculateMaintenanceDeduction`, `getInputVal`, `saveSettingToCloudNow`, `calcular`, `showToast`, `formatTotal`
- Produces: `aplicarDescuentoMantenimiento()` en el ámbito global `window` / módulo de interacción.

- [ ] **Step 1: Escribir el test que falla para la acción `aplicarDescuentoMantenimiento`**

Crear `tests/maintenance-deduction-actions.test.js`:
```javascript
const assert = require('assert');
const fs = require('fs');

const htmlContent = fs.readFileSync('index.html', 'utf8');
const scriptContent = fs.readFileSync('script.js', 'utf8');

// 1. Verificar existencia del input y botón en index.html
assert.ok(htmlContent.includes('id="descuentoMantenimiento"'), 'Debe existir input descuentoMantenimiento en HTML');
assert.ok(htmlContent.includes('id="btnDescontarMantenimiento"'), 'Debe existir botón btnDescontarMantenimiento en HTML');
assert.ok(htmlContent.includes('aplicarDescuentoMantenimiento()'), 'Botón debe invocar aplicarDescuentoMantenimiento()');

// 2. Verificar existencia de la función en script.js
assert.ok(scriptContent.includes('async function aplicarDescuentoMantenimiento'), 'Debe existir async function aplicarDescuentoMantenimiento');
assert.ok(scriptContent.includes("saveSettingToCloudNow('ahorroActual'"), 'Debe persistir ahorroActual');
assert.ok(scriptContent.includes("saveSettingToCloudNow('metaMantenimiento'"), 'Debe persistir metaMantenimiento');

console.log('✅ All maintenance deduction action assertions passed.');
```

- [ ] **Step 2: Ejecutar test para comprobar que falla**

Run: `node tests/maintenance-deduction-actions.test.js`  
Expected: FAIL con `AssertionError: Debe existir async function aplicarDescuentoMantenimiento`.

- [ ] **Step 3: Implementar `aplicarDescuentoMantenimiento` y binding de Enter en `script.js`**

Agregar la función `aplicarDescuentoMantenimiento` en `script.js`:
```javascript
async function aplicarDescuentoMantenimiento() {
    const inputDescuento = document.getElementById('descuentoMantenimiento');
    if (!inputDescuento) return;

    const montoDescuento = parseFloat(inputDescuento.value);
    if (!Number.isFinite(montoDescuento) || montoDescuento <= 0) {
        showToast('Ingresá un monto válido mayor a $0.', 'warning');
        return;
    }

    const ahorroActual = getInputVal('ahorroActual');
    const metaMantenimiento = getInputVal('metaMantenimiento');

    if (montoDescuento > ahorroActual && ahorroActual > 0) {
        const confirmar = confirm(
            `El gasto (${formatTotal(montoDescuento)}) supera el ahorro acumulado (${formatTotal(ahorroActual)}).\n¿Deseas descontar y dejar el fondo en $0?`
        );
        if (!confirmar) return;
    }

    const { newSavings, newGoal } = calculateMaintenanceDeduction(ahorroActual, metaMantenimiento, montoDescuento);

    const btn = document.getElementById('btnDescontarMantenimiento');
    if (btn) btn.disabled = true;

    try {
        navigator.vibrate?.(10);

        const inputAhorro = document.getElementById('ahorroActual');
        const inputMeta = document.getElementById('metaMantenimiento');
        if (inputAhorro) inputAhorro.value = newSavings;
        if (inputMeta) inputMeta.value = newGoal;

        await Promise.all([
            saveSettingToCloudNow('ahorroActual', newSavings),
            saveSettingToCloudNow('metaMantenimiento', newGoal)
        ]);

        inputDescuento.value = '';
        calcular();
        showToast(`Descontados ${formatTotal(montoDescuento)} de mantenimiento.`, 'success');
    } catch (err) {
        console.error('Error aplicando descuento de mantenimiento:', err);
        showToast('Error al persistir el descuento.', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}
```

Y en el listener de inicio / setup de eventos (o al inicializar la app en `script.js`):
```javascript
const inputDescuentoEl = document.getElementById('descuentoMantenimiento');
if (inputDescuentoEl) {
    inputDescuentoEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            aplicarDescuentoMantenimiento();
        }
    });
}
```

- [ ] **Step 4: Ejecutar test para verificar que pase**

Run: `node tests/maintenance-deduction-actions.test.js`  
Expected: `✅ All maintenance deduction action assertions passed.`

- [ ] **Step 5: Commit**

```bash
git add tests/maintenance-deduction-actions.test.js script.js
git commit -m "feat(maintenance): wire up aplicarDescuentoMantenimiento with cloud sync and enter trigger"
```

---

### Task 4: Integración en la Suite de Verificación Global

**Files:**
- Modify: `tests/integration-verify.js`

- [ ] **Step 1: Agregar el bloque de verificación de descuento de mantenimiento en `tests/integration-verify.js`**

Agregar la sección 6 en `tests/integration-verify.js`:
```javascript
console.log('\n--- 6. Maintenance Emergency Deduction Integration Verification ---');

// 1. Verificar selectores en index.html
const inputDescMatch = indexHtml.includes('id="descuentoMantenimiento"');
const btnDescMatch = indexHtml.includes('id="btnDescontarMantenimiento"');
assert.ok(inputDescMatch, 'descuentoMantenimiento input present in index.html');
assert.ok(btnDescMatch, 'btnDescontarMantenimiento button present in index.html');

// 2. Verificar lógica matemática de deducción
const vm = require('vm');
const scriptContext = {};
const fnMatch = scriptJs.match(/function calculateMaintenanceDeduction[\s\S]*?\n\}/);
assert.ok(fnMatch, 'calculateMaintenanceDeduction function found in script.js');
vm.runInNewContext(fnMatch[0], scriptContext);
const deductionFn = scriptContext.calculateMaintenanceDeduction;

const dedRes = deductionFn(580, 1390, 80);
assert.strictEqual(dedRes.newSavings, 500, 'New savings must be 500');
assert.strictEqual(dedRes.newGoal, 1310, 'New goal must be 1310');

console.log('✅ Maintenance emergency deduction verification passed.');
```

- [ ] **Step 2: Ejecutar la suite completa de integración**

Run: `node tests/integration-verify.js`  
Expected: `🎉 ALL INTEGRATION VERIFICATION CHECKS PASSED SUCCESSFULLY!` con la sección 6 incluida.

- [ ] **Step 3: Commit**

```bash
git add tests/integration-verify.js
git commit -m "test(verify): integrate maintenance deduction checks into full verification suite"
```

---

### Task 5: Deploy a Netlify

**Files:**
- N/A (Git remote & Netlify deploy)

- [ ] **Step 1: Comprobar git status y verificar que el working tree esté limpio**

Run: `git status`  
Expected: Working tree clean, nada pendiente de commitear.

- [ ] **Step 2: Desplegar a Netlify**

Run: `netlify deploy --prod --dir=.` o `git push origin main`  
Expected: Deploy completado exitosamente y sitio en producción publicado.

- [ ] **Step 3: Verificar estado en vivo**

Verificar en la consola de Netlify o URL de producción que el deploy finalice con status exitoso.
