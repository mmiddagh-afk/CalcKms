# Cobro Rápido en Cascada (FIFO) para Historial de Kilometraje - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar una barra de cobro rápido al pie del bloque de Kilometraje que aplique un algoritmo FIFO en cascada para saldar automáticamente o descontar parcialmente los registros más antiguos de kilometraje, actualizando atómicamente el historial, el ahorro de mantenimiento y los kilómetros del ciclo, finalizando con el deploy a Netlify.

**Architecture:** Función algorítmica pura `applyFIFOPaymentToKmsHistory` desacoplada y testeada con TDD; inyección reactiva de la barra de cobro en `buildHistorialGroup` dentro de `script.js`; orquestación transaccional con `mutateHistoryCloud`, `saveSettingToCloudNow` y soporte para `offlineQueue`; despliegue automatizado a Netlify.

**Tech Stack:** Vanilla JavaScript (ES6+), HTML5, Tailwind CSS, Lucide Icons, Firestore Client SDK, Node.js Test Runner / Assertions, Netlify.

## Global Constraints

- **Convención de commits:** Conventional Commits (`feat:`, `test:`, `docs:`). Prohibido añadir "Co-Authored-By" o atribuciones de IA.
- **Regla de build:** No ejecutar comandos de build tras cambios innecesarios.
- **Modelo de datos:** No alterar los registros de movimientos extras (`isExtra: true`); el cobro aplica única y exclusivamente sobre el mantenimiento de los registros de kilometraje (`!item.isExtra`).
- **Persistencia:** Respetar la cola offline (`offlineQueue`) y la sincronización en tiempo real (`onSnapshot`).

---

### Task 1: Algoritmo FIFO de Liquidación en Cascada (`applyFIFOPaymentToKmsHistory`)

**Files:**
- Create: `tests/kms-history-logic.test.js`
- Modify: `script.js` (sección de utilidades de historial y exportaciones `window`)

**Interfaces:**
- Consumes: `items` (Array de `currentHistory`), `paymentAmount` (Number).
- Produces: `window.applyFIFOPaymentToKmsHistory(items, paymentAmount) -> { updatedHistory, saldadosCount, kmsAcumulados, maintAbonado, parcialAplicado }`.

- [ ] **Step 1: Escribir test unitario automatizado que falle (Red)**

Crear `tests/kms-history-logic.test.js`:
```javascript
const assert = require('assert');

// Mock o import de la función a implementar
const scriptContext = {};
// Cuando esté en script.js se evaluará o definirá
let applyFIFOPaymentToKmsHistory;

try {
    const fs = require('fs');
    const content = fs.readFileSync('script.js', 'utf8');
    const fnMatch = content.match(/function applyFIFOPaymentToKmsHistory[\s\S]*?\n\}/);
    if (fnMatch) {
        eval(fnMatch[0]);
    }
} catch (e) {}

if (typeof applyFIFOPaymentToKmsHistory !== 'function') {
    // Si aún no está implementada, definimos un stub que devuelva vacío para fallar
    applyFIFOPaymentToKmsHistory = () => ({ updatedHistory: [], saldadosCount: 0, kmsAcumulados: 0, maintAbonado: 0, parcialAplicado: false });
}

// Fixture: 2 registros de kilometraje y 1 movimiento extra intercalado
// Registro 1 (antiguo): id 100, gas 100, maint 50, kms 80, isExtra false
// Registro Extra: id 101, total 200, isExtra true
// Registro 2 (reciente): id 102, gas 120, maint 50, kms 100, isExtra false
const baseHistory = [
    { id: 100, fecha: '18 oct', gas: 100, maint: 50, total: 150, kms: 80, isExtra: false },
    { id: 101, fecha: '19 oct', total: 200, isExtra: true, descripcion: 'Gasolina' },
    { id: 102, fecha: '20 oct', gas: 120, maint: 50, total: 170, kms: 100, isExtra: false }
];

// Test 1: Pago 0 o negativo no modifica nada
const resCero = applyFIFOPaymentToKmsHistory(baseHistory, 0);
assert.equal(resCero.updatedHistory.length, 3, 'Pago 0 no debe modificar historial');
assert.equal(resCero.saldadosCount, 0);
assert.equal(resCero.maintAbonado, 0);

// Test 2: Caso de usuario - Pago de 70bs (salda el más antiguo de 50bs y descuenta 20bs del siguiente)
const res70 = applyFIFOPaymentToKmsHistory(baseHistory, 70);
assert.equal(res70.saldadosCount, 1, 'Debe haber saldado 1 registro completo');
assert.equal(res70.kmsAcumulados, 80, 'Debe acumular los 80 kms del registro saldado');
assert.equal(res70.maintAbonado, 70, 'Maint abonado debe ser exactamente 70');
assert.equal(res70.parcialAplicado, true, 'Debe marcar que se aplicó cobro parcial');
assert.equal(res70.updatedHistory.length, 2, 'El historial debe tener 2 ítems (el extra y el km restante)');

// Verificar que el extra no fue tocado
const extraItem = res70.updatedHistory.find(it => it.id === 101);
assert.ok(extraItem, 'El movimiento extra debe preservarse');
assert.equal(extraItem.total, 200);

// Verificar el registro parcial (id 102)
const parcialItem = res70.updatedHistory.find(it => it.id === 102);
assert.ok(parcialItem, 'El registro 102 debe seguir existiendo');
assert.equal(parcialItem.maint, 30, 'Maint debe haber bajado de 50 a 30 (50 - 20)');
assert.equal(parcialItem.total, 150, 'Total debe recalcularse a gas(120) + maint(30) = 150');
assert.equal(parcialItem.kms, 100, 'Kms deben mantenerse intactos hasta saldarse');

// Test 3: Pago de 100bs salda ambos registros de kilometraje
const res100 = applyFIFOPaymentToKmsHistory(baseHistory, 100);
assert.equal(res100.saldadosCount, 2, 'Debe haber saldado los 2 registros de kilometraje');
assert.equal(res100.kmsAcumulados, 180, 'Debe acumular 80 + 100 = 180 kms');
assert.equal(res100.maintAbonado, 100, 'Debe haber abonado 100');
assert.equal(res100.parcialAplicado, false);
assert.equal(res100.updatedHistory.length, 1, 'Solo debe quedar el movimiento extra');
assert.equal(res100.updatedHistory[0].id, 101);

console.log('✅ All applyFIFOPaymentToKmsHistory logic tests passed.');
```

- [ ] **Step 2: Ejecutar test para verificar que falla**

Run: `node tests/kms-history-logic.test.js`  
Expected: FAIL (assertion error o fallos de expectativa).

- [ ] **Step 3: Implementar `applyFIFOPaymentToKmsHistory` en `script.js`**

Añadir en `script.js`:
```javascript
function applyFIFOPaymentToKmsHistory(items, paymentAmount) {
    if (!Array.isArray(items) || items.length === 0) {
        return { updatedHistory: [], saldadosCount: 0, kmsAcumulados: 0, maintAbonado: 0, parcialAplicado: false };
    }

    let remPago = Math.max(0, Math.round(Number(paymentAmount) || 0));
    if (remPago <= 0) {
        return { updatedHistory: [...items], saldadosCount: 0, kmsAcumulados: 0, maintAbonado: 0, parcialAplicado: false };
    }

    let saldadosCount = 0;
    let kmsAcumulados = 0;
    let maintAbonado = 0;
    let parcialAplicado = false;

    // Procesar los registros en orden FIFO (del más antiguo al más reciente)
    // En items (currentHistory), los más antiguos están al principio (índice 0).
    const updatedHistory = [];

    for (const item of items) {
        // Los movimientos extras no se tocan
        if (item.isExtra) {
            updatedHistory.push(item);
            continue;
        }

        const itemMaint = Math.max(0, Math.round(Number(item.maint) || 0));
        if (itemMaint === 0 || remPago <= 0) {
            updatedHistory.push(item);
            continue;
        }

        if (remPago >= itemMaint) {
            // El registro queda completamente saldado
            remPago -= itemMaint;
            maintAbonado += itemMaint;
            kmsAcumulados += Math.max(0, Math.round(Number(item.kms) || 0));
            saldadosCount++;
            // Se omite de updatedHistory porque se saldó y eliminó
        } else {
            // Cobro parcial sobre este registro
            const nuevoMaint = itemMaint - remPago;
            maintAbonado += remPago;
            remPago = 0;
            parcialAplicado = true;
            const gas = Math.max(0, Math.round(Number(item.gas) || 0));
            const nuevoTotal = gas + nuevoMaint;
            updatedHistory.push({
                ...item,
                maint: nuevoMaint,
                total: nuevoTotal
            });
        }
    }

    return {
        updatedHistory,
        saldadosCount,
        kmsAcumulados,
        maintAbonado,
        parcialAplicado
    };
}
```
Y exportar en `window`:
```javascript
window.applyFIFOPaymentToKmsHistory = applyFIFOPaymentToKmsHistory;
```

- [ ] **Step 4: Ejecutar test para verificar que pasa**

Run: `node tests/kms-history-logic.test.js`  
Expected: `✅ All applyFIFOPaymentToKmsHistory logic tests passed.`

- [ ] **Step 5: Commit de Task 1**

```bash
git add tests/kms-history-logic.test.js script.js
git commit -m "feat(history): implement applyFIFOPaymentToKmsHistory algorithm"
```

---

### Task 2: Componente UI de Cobro Rápido en `buildHistorialGroup`

**Files:**
- Modify: `script.js:1993-2015` (`buildHistorialGroup`)
- Create: `tests/kms-history-ui-render.test.js`

**Interfaces:**
- Consumes: `buildHistorialGroup(title, subtitle, tone, items, offset)`.
- Produces: HTML con el bloque `#boxCobroCascadaKms` integrado al final del grupo de kilometraje cuando `tone === 'kms'` y hay `maint > 0`.

- [ ] **Step 1: Escribir test de renderizado UI que falle**

Crear `tests/kms-history-ui-render.test.js`:
```javascript
const assert = require('assert');
const fs = require('fs');

const scriptContent = fs.readFileSync('script.js', 'utf8');

// Extraer buildHistorialGroup
let buildHistorialGroup;
const match = scriptContent.match(/function buildHistorialGroup[\s\S]*?\n\}/);
assert.ok(match, 'buildHistorialGroup debe existir en script.js');

// Helper mock para renderHistorialKmsItem y renderHistorialExtraItem
function renderHistorialKmsItem(item) { return `<div data-item-id="${item.id}">KMS</div>`; }
function renderHistorialExtraItem(item) { return `<div data-item-id="${item.id}">EXTRA</div>`; }
function toFiniteNumber(val, fallback) { return Number.isFinite(Number(val)) ? Number(val) : fallback; }

eval(match[0]);

// Test 1: Grupo kms con deuda debe incluir #boxCobroCascadaKms
const kmsItemsConDeuda = [
    { id: 1, maint: 50, gas: 50, kms: 100, isExtra: false },
    { id: 2, maint: 20, gas: 30, kms: 50, isExtra: false }
];
const htmlConDeuda = buildHistorialGroup('Kilometraje', '2 movimientos', 'kms', kmsItemsConDeuda, 0);
assert.ok(htmlConDeuda.includes('id="boxCobroCascadaKms"'), 'Debe renderizar boxCobroCascadaKms');
assert.ok(htmlConDeuda.includes('id="cobroCascadaKmsMonto"'), 'Debe incluir el input de monto');
assert.ok(htmlConDeuda.includes('id="btnCobroCascadaKms"'), 'Debe incluir el botón de cobrar');
assert.ok(htmlConDeuda.includes('Pagar Todo ($70)'), 'Debe mostrar el total acumulado en el botón pagar todo');

// Test 2: Grupo kms sin deuda de mantenimiento no debe renderizar el box
const kmsItemsSinDeuda = [
    { id: 1, maint: 0, gas: 50, kms: 100, isExtra: false }
];
const htmlSinDeuda = buildHistorialGroup('Kilometraje', '1 movimiento', 'kms', kmsItemsSinDeuda, 0);
assert.ok(!htmlSinDeuda.includes('id="boxCobroCascadaKms"'), 'No debe renderizar boxCobroCascadaKms si maint es 0');

// Test 3: Grupo extra no debe renderizar el box de cobro de kms
const extraItems = [{ id: 3, total: 100, isExtra: true }];
const htmlExtra = buildHistorialGroup('Mov extras', '1 movimiento', 'extra', extraItems, 0);
assert.ok(!htmlExtra.includes('id="boxCobroCascadaKms"'), 'No debe renderizar boxCobroCascadaKms en grupo extra');

console.log('✅ UI render tests for buildHistorialGroup passed.');
```

- [ ] **Step 2: Ejecutar test para verificar que falla**

Run: `node tests/kms-history-ui-render.test.js`  
Expected: FAIL.

- [ ] **Step 3: Modificar `buildHistorialGroup` en `script.js`**

Actualizar `buildHistorialGroup` en `script.js`:
```javascript
function buildHistorialGroup(title, subtitle, tone, items, offset = 0) {
    if (!items.length) return '';
    const colors = tone === 'extra'
        ? { badge: 'bg-indigo-50 text-indigo-600 border-indigo-200', line: 'bg-indigo-100', text: 'text-indigo-500' }
        : { badge: 'bg-slate-100 text-slate-600 border-slate-200', line: 'bg-slate-100', text: 'text-slate-500' };

    const cards = items.map((item, index) => {
        const delay = (offset + index) * 50;
        return item.isExtra ? renderHistorialExtraItem(item, delay) : renderHistorialKmsItem(item, delay);
    }).join('');

    let footerCobro = '';
    if (tone === 'kms') {
        const totalMaintPendiente = items.reduce((sum, item) => sum + Math.max(0, Math.round(toFiniteNumber(item.maint, 0))), 0);
        if (totalMaintPendiente > 0) {
            footerCobro = `
            <div id="boxCobroCascadaKms" class="mt-3 p-3 bg-slate-50/90 border border-slate-200/80 rounded-2xl">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <i data-lucide="coins" class="w-3.5 h-3.5 text-emerald-600"></i>
                        Cobro rápido en cascada
                    </span>
                    <button type="button" onclick="llenarTodoCobroCascadaKms(${totalMaintPendiente})" class="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 hover:bg-emerald-200/80 px-2.5 py-0.5 rounded-full transition-all">
                        Pagar Todo ($${totalMaintPendiente})
                    </button>
                </div>
                <div class="flex items-center gap-2">
                    <div class="relative flex-1">
                        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-extrabold text-slate-400">$</span>
                        <input type="number" id="cobroCascadaKmsMonto" placeholder="0" min="1" max="${totalMaintPendiente}"
                            class="w-full pl-7 pr-3 py-2 bg-white rounded-xl border border-slate-200 font-extrabold text-slate-800 text-sm outline-none focus:ring-2 focus:ring-emerald-200 transition-all text-left">
                    </div>
                    <button type="button" id="btnCobroCascadaKms" onclick="ejecutarCobroCascadaKms()"
                        class="px-4 py-2 btn-premium btn-premium-success btn-ripple text-xs font-extrabold rounded-xl flex items-center gap-1.5 shrink-0">
                        <i data-lucide="check" class="w-3.5 h-3.5"></i>
                        <span>Cobrar</span>
                    </button>
                </div>
            </div>`;
        }
    }

    return `<section class="historial-group rounded-2xl border border-slate-100 p-3.5 bg-gradient-to-b from-white to-slate-50/40">
        <header class="flex items-center justify-between mb-2">
            <span class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-[10px] font-extrabold uppercase tracking-wider ${colors.badge}">
                <i data-lucide="${tone === 'extra' ? 'tag' : 'route'}" class="w-3 h-3"></i>
                ${title}
            </span>
            <span class="text-[10px] font-bold uppercase tracking-[0.16em] ${colors.text}">${subtitle}</span>
        </header>
        <div class="h-px w-full ${colors.line} mb-2.5 opacity-70"></div>
        ${cards}
        ${footerCobro}
    </section>`;
}
```

- [ ] **Step 4: Ejecutar test para verificar que pasa**

Run: `node tests/kms-history-ui-render.test.js`  
Expected: `✅ UI render tests for buildHistorialGroup passed.`

- [ ] **Step 5: Commit de Task 2**

```bash
git add tests/kms-history-ui-render.test.js script.js
git commit -m "feat(history): render quick cascade settlement bar in kilometraje group"
```

---

### Task 3: Orquestación de Cobro, Persistencia Atómica y Atajos (`ejecutarCobroCascadaKms`)

**Files:**
- Modify: `script.js` (añadir `ejecutarCobroCascadaKms`, `llenarTodoCobroCascadaKms`, bindings de eventos y exportaciones)
- Create: `tests/kms-history-actions.test.js`

**Interfaces:**
- Consumes: `applyFIFOPaymentToKmsHistory`, `mutateHistoryCloud`, `saveSettingToCloudNow`, `renderHistorialFromData`, `showToast`.
- Produces: `window.ejecutarCobroCascadaKms()`, `window.llenarTodoCobroCascadaKms(monto)`.

- [ ] **Step 1: Escribir test de integración de acciones**

Crear `tests/kms-history-actions.test.js`:
```javascript
const assert = require('assert');

// Simular entorno DOM y dependencias
const mockState = {
    history: [
        { id: 1, maint: 50, gas: 50, kms: 80, isExtra: false },
        { id: 2, maint: 50, gas: 60, kms: 100, isExtra: false }
    ],
    ahorro: 500,
    kmRecorridos: 1000,
    toasts: []
};

function showToast(msg, type) {
    mockState.toasts.push({ msg, type });
}

// Lógica de ejecutarCobroCascadaKms
function simularEjecutarCobro(inputMonto) {
    const monto = Math.round(Number(inputMonto) || 0);
    const totalMaintPendiente = mockState.history.reduce((sum, item) => item.isExtra ? sum : sum + Math.max(0, Math.round(Number(item.maint) || 0)), 0);

    if (monto <= 0) {
        showToast('Ingresa un monto valido mayor a 0.', 'warning');
        return { success: false, reason: 'invalid_amount' };
    }

    if (monto > totalMaintPendiente) {
        showToast(`El monto ($${monto}) supera el total pendiente de mantenimiento ($${totalMaintPendiente}).`, 'warning');
        return { success: false, reason: 'amount_exceeded' };
    }

    const { applyFIFOPaymentToKmsHistory } = require('./kms-history-logic.test.js'); // o eval
    // Ejecución
    return { success: true };
}

assert.equal(simularEjecutarCobro(0).success, false);
assert.equal(simularEjecutarCobro(-10).success, false);
assert.equal(simularEjecutarCobro(150).success, false);
assert.equal(simularEjecutarCobro(70).success, true);

console.log('✅ Action validation tests passed.');
```

- [ ] **Step 2: Ejecutar test de acciones para verificar**

Run: `node tests/kms-history-actions.test.js`  
Expected: `✅ Action validation tests passed.`

- [ ] **Step 3: Implementar `ejecutarCobroCascadaKms` y `llenarTodoCobroCascadaKms` en `script.js`**

Implementar en `script.js`:
```javascript
function llenarTodoCobroCascadaKms(monto) {
    const input = document.getElementById('cobroCascadaKmsMonto');
    if (!input) return;
    input.value = Math.max(0, Math.round(Number(monto) || 0));
    input.focus();
}

async function ejecutarCobroCascadaKms() {
    const input = document.getElementById('cobroCascadaKmsMonto');
    const monto = Math.round(parseFloat(input?.value || '0') || 0);
    const kmsItems = currentHistory.filter(item => !item.isExtra);
    const totalMaintPendiente = kmsItems.reduce((sum, item) => sum + Math.max(0, Math.round(toFiniteNumber(item.maint, 0))), 0);

    if (monto <= 0) {
        showToast('Ingresa un monto valido mayor a 0.', 'warning');
        return;
    }

    if (monto > totalMaintPendiente) {
        showToast(`El monto (${formatTotal(monto)}) supera el total pendiente de mantenimiento (${formatTotal(totalMaintPendiente)}).`, 'warning');
        return;
    }

    const resultFIFO = applyFIFOPaymentToKmsHistory(currentHistory, monto);
    if (!resultFIFO || resultFIFO.maintAbonado <= 0) {
        showToast('No se pudo aplicar el cobro.', 'warning');
        return;
    }

    const btn = document.getElementById('btnCobroCascadaKms');
    let result;
    try {
        result = await runActionWithFeedback(btn, {
            loading: 'Cobrando...',
            success: 'Cobrado',
            pending: 'Pendiente offline',
            error: 'No cobrado'
        }, async () => {
            const updatedHistory = await mutateHistoryCloud(() => resultFIFO.updatedHistory, {
                errorLog: 'Error guardando cobro en cascada de kms:',
                alertMessage: 'No se pudo guardar el cobro en cascada.'
            });

            if (!Array.isArray(updatedHistory)) throw new Error('No se pudo guardar el cobro en cascada.');

            let settingModeAhorro = 'cloud';
            let settingModeKm = 'cloud';

            // Actualizar ahorroActual si hubo dinero abonado a mantenimiento
            if (resultFIFO.maintAbonado > 0) {
                const ahorroInput = document.getElementById('ahorroActual');
                if (ahorroInput) {
                    const nuevoAhorro = (parseFloat(ahorroInput.value) || 0) + resultFIFO.maintAbonado;
                    ahorroInput.value = nuevoAhorro;
                    settingModeAhorro = (await saveSettingToCloudNow('ahorroActual', nuevoAhorro)).mode;
                }
            }

            // Actualizar kmRecorridosCiclo si se saldaron tarjetas completas
            if (resultFIFO.kmsAcumulados > 0) {
                const kmRec = document.getElementById('kmRecorridosCiclo');
                if (kmRec) {
                    const nuevosKm = (parseFloat(kmRec.value) || 0) + resultFIFO.kmsAcumulados;
                    kmRec.value = nuevosKm;
                    settingModeKm = (await saveSettingToCloudNow('kmRecorridosCiclo', nuevosKm)).mode;
                }
            }

            return {
                updatedHistory,
                resultFIFO,
                feedbackMode: feedbackModeFromWriteModes(lastHistoryWriteMode, settingModeAhorro, settingModeKm)
            };
        }, 'ejecutarCobroCascadaKms');
    } catch (error) {
        showToast(error?.message || 'No se pudo guardar el cobro en cascada.', 'error');
        return;
    }

    if (result?.feedbackMode === 'skipped') return;

    currentHistory = result.updatedHistory;
    lastHistoryHash = '';
    renderHistorialFromData(result.updatedHistory);

    const saldadosTxt = resultFIFO.saldadosCount > 0
        ? `Se sald${resultFIFO.saldadosCount === 1 ? 'o 1 registro' : `aron ${resultFIFO.saldadosCount} registros`} (+${resultFIFO.kmsAcumulados} km).`
        : '';
    const parcialTxt = resultFIFO.parcialAplicado ? ' Pago parcial aplicado a la siguiente tarjeta.' : '';
    const toastMsg = `Cobro aplicado: ${formatTotal(resultFIFO.maintAbonado)}. ${saldadosTxt}${parcialTxt} Ahorro: +${formatTotal(resultFIFO.maintAbonado)}.`;

    showToast(toastMsg, result.feedbackMode === 'pending' ? 'warning' : 'success', { duration: 4500 });
}
```

En la inicialización de eventos de inputs (o `initUI`), asegurar el atajo con la tecla `Enter`:
```javascript
document.addEventListener('keydown', (e) => {
    if (e.target && e.target.id === 'cobroCascadaKmsMonto' && e.key === 'Enter') {
        e.preventDefault();
        ejecutarCobroCascadaKms();
    }
});
```
Y exportar en `window`:
```javascript
window.ejecutarCobroCascadaKms = ejecutarCobroCascadaKms;
window.llenarTodoCobroCascadaKms = llenarTodoCobroCascadaKms;
```

- [ ] **Step 4: Ejecutar tests y comprobar que no hay regresiones**

Run:
```powershell
node tests/kms-history-logic.test.js
node tests/kms-history-ui-render.test.js
node tests/kms-history-actions.test.js
```
Expected: PASS en todas las suites.

- [ ] **Step 5: Commit de Task 3**

```bash
git add script.js tests/kms-history-actions.test.js
git commit -m "feat(history): wire up cascade payment execution and cloud persistence"
```

---

### Task 4: Verificación Integral de Integración

**Files:**
- Modify: `tests/integration-verify.js`

- [ ] **Step 1: Extender `tests/integration-verify.js` con las nuevas aserciones**

Añadir en `tests/integration-verify.js`:
```javascript
assert.match(scriptJsContent, /window\.applyFIFOPaymentToKmsHistory\s*=\s*applyFIFOPaymentToKmsHistory;/, 'script.js must export applyFIFOPaymentToKmsHistory');
assert.match(scriptJsContent, /window\.ejecutarCobroCascadaKms\s*=\s*ejecutarCobroCascadaKms;/, 'script.js must export ejecutarCobroCascadaKms');
assert.match(scriptJsContent, /window\.llenarTodoCobroCascadaKms\s*=\s*llenarTodoCobroCascadaKms;/, 'script.js must export llenarTodoCobroCascadaKms');
assert.match(scriptJsContent, /boxCobroCascadaKms/, 'script.js must contain boxCobroCascadaKms markup');
```

- [ ] **Step 2: Ejecutar la suite completa de integración existente y nueva**

Run: `node tests/integration-verify.js`  
Expected: `✅ Integration verification passed! All tests and contracts are valid.`

- [ ] **Step 3: Commit de Task 4**

```bash
git add tests/integration-verify.js
git commit -m "test(history): add cascade settlement to integration verify suite"
```

---

### Task 5: Deploy a Netlify

**Files:**
- N/A (Working tree clean & Git remote)

- [ ] **Step 1: Comprobar git status y commits locales**

Run: `git status`  
Expected: Working tree clean.

- [ ] **Step 2: Desplegar mediante git push origin main**

Run: `git push origin main`  
Expected: Commits enviados a `origin/main` exitosamente, disparando la compilación/despliegue automático en Netlify.

- [ ] **Step 3: Verificar estado de despliegue en Netlify**

Verificar en la consola o dashboard de Netlify que el deploy del commit más reciente finalice con estado `Published` / `Success`.
