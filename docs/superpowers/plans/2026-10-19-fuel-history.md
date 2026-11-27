# Fuel Load History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un histórico compacto de las últimas 5 cargas de gasolina en la sección Deudas y Extras de CalcKms, sincronizado en Firestore y con opción de borrar/revertir.

**Architecture:** Se almacena el array `historialCargasGas` (máx 5 elementos) en el documento `settings` junto a `deudaCombustible`, garantizando persistencia atómica offline y online. La interfaz renderiza las filas compactas con fecha, hora, monto y botón para borrar/revertir.

**Tech Stack:** Vanilla JavaScript (ES Modules), Firebase Firestore Web SDK v11, Tailwind CSS, Lucide Icons, HTML5.

## Global Constraints

- No framework ni bundlers (Vanilla JS directo en `script.js` e `index.html`).
- Commits convencionales sin atribución AI ni "Co-Authored-By".
- Mantener compatibilidad con temas claro/oscuro y responsive móvil (<1100px) y desktop.
- No ejecutar builds después de los cambios.
- Persistencia offline mediante cola `calcKmsOfflineQueueV1`.

---

### Task 1: Normalización y Lógica de Datos en script.js

**Files:**
- Modify: `script.js:40-60` (estado global y settingsInputs)
- Modify: `script.js:460-520` (cola offline)
- Modify: `script.js:1040-1070` (listener settings)
- Test: `tests/fuel-history-logic.test.js`

**Interfaces:**
- Consumes: `currentDeudaCombustible`, `settingsRef`, `setDoc`, `enqueueOfflineOperation`
- Produces: `normalizeFuelHistoryItem(raw, fallbackId)`, `normalizeFuelHistoryArray(items)`, `currentFuelHistory`, `saveFuelStateToCloud(nuevaDeuda, nuevoHistorial)`

- [ ] **Step 1: Crear test unitario en Node para las funciones de normalización**

Crear `tests/fuel-history-logic.test.js`:
```javascript
import assert from 'node:assert/strict';

function normalizeFuelHistoryItem(raw, fallbackId = Date.now()) {
    const item = raw && typeof raw === 'object' ? raw : {};
    const parsedId = Number(item.id);
    const id = Number.isFinite(parsedId) ? Math.trunc(parsedId) : Math.trunc(fallbackId);
    const monto = Math.max(0, Math.round(Number(item.monto) || 0));
    return {
        id,
        monto,
        fecha: String(item.fecha ?? '').trim(),
        hora: String(item.hora ?? '').trim(),
        fechaISO: String(item.fechaISO ?? '').trim()
    };
}

function normalizeFuelHistoryArray(items) {
    if (!Array.isArray(items)) return [];
    const used = new Set();
    const result = [];
    for (let i = 0; i < items.length; i++) {
        const it = normalizeFuelHistoryItem(items[i], Date.now() + i);
        if (it.monto <= 0) continue;
        let id = it.id;
        while (used.has(id)) id += 1;
        used.add(id);
        result.push(id === it.id ? it : { ...it, id });
        if (result.length >= 5) break;
    }
    return result;
}

// Tests
const sample = [
    { id: 1, monto: 20, fecha: '19 oct', hora: '10:00', fechaISO: '2026-10-19' },
    { id: 1, monto: 30, fecha: '19 oct', hora: '11:00', fechaISO: '2026-10-19' },
    { id: 3, monto: 0 },
    { id: 4, monto: 15 },
    { id: 5, monto: 25 },
    { id: 6, monto: 40 },
    { id: 7, monto: 50 }
];

const normalized = normalizeFuelHistoryArray(sample);
assert.equal(normalized.length, 5, 'Debe limitar a un máximo de 5 elementos');
assert.equal(normalized[0].monto, 20);
assert.equal(normalized[1].id, 2, 'Debe resolver IDs duplicados');
assert.equal(normalized.find(x => x.id === 3), undefined, 'Debe descartar montos <= 0');

console.log('✅ normalizeFuelHistoryArray tests passed.');
```

- [ ] **Step 2: Ejecutar test unitario**

Run: `node tests/fuel-history-logic.test.js`  
Expected: `✅ normalizeFuelHistoryArray tests passed.`

- [ ] **Step 3: Integrar funciones y estado en `script.js`**

En `script.js`:
1. Declarar variable global `let currentFuelHistory = [];` cerca de `currentDeudaCombustible`.
2. Añadir `'historialCargasGas'` a `settingsInputs` y `settingsInputSet`.
3. Implementar `normalizeFuelHistoryItem` y `normalizeFuelHistoryArray`.
4. En `setupRealtimeListeners(storageId)` dentro del listener de `settingsRef`:
```javascript
if (data.historialCargasGas !== undefined) {
    currentFuelHistory = normalizeFuelHistoryArray(data.historialCargasGas);
    if (typeof renderHistorialCargasGas === 'function') {
        renderHistorialCargasGas(currentFuelHistory);
    }
}
```
5. En `applyOfflineOperation(op)`, dar soporte al tipo `fuel_set`:
```javascript
if (op.type === 'fuel_set') {
    const safeItems = normalizeFuelHistoryArray(op.payload?.historialCargasGas || []);
    const safeDeuda = op.payload?.deudaCombustible ?? 0;
    await setDoc(settingsRef, { deudaCombustible: safeDeuda, historialCargasGas: safeItems }, { merge: true });
    return true;
}
```
6. Crear helper `saveFuelStateToCloud(nuevaDeuda, nuevoHistorial)`:
```javascript
async function saveFuelStateToCloud(nuevaDeuda, nuevoHistorial) {
    if (!currentUser || !currentStorageId) return { mode: 'unavailable' };
    const targetStorageId = currentStorageId;
    const safeItems = normalizeFuelHistoryArray(nuevoHistorial);
    try {
        const { settingsRef } = getDocRefs(targetStorageId);
        await setDoc(settingsRef, {
            deudaCombustible: nuevaDeuda,
            historialCargasGas: safeItems
        }, { merge: true });
        flushOfflineQueue();
        return { mode: 'cloud' };
    } catch (error) {
        console.error('Error guardando estado de combustible en la nube:', error);
        enqueueOfflineOperation('fuel_set', {
            deudaCombustible: nuevaDeuda,
            historialCargasGas: safeItems
        }, targetStorageId);
        return { mode: 'queued' };
    }
}
```

- [ ] **Step 4: Verificar sintaxis de script.js**

Run: `node -c script.js`  
Expected: Exit code 0 (sin errores de sintaxis).

- [ ] **Step 5: Commit de Task 1**

```bash
git add tests/fuel-history-logic.test.js script.js
git commit -m "feat: add fuel load history normalization and persistence logic"
```

---

### Task 2: Marcado HTML y Estilos en index.html

**Files:**
- Modify: `index.html:740-755` (sección Deudas y Extras)
- Modify: `styles.css` (si se requieren estilos de hover/animación específicos)

**Interfaces:**
- Consumes: `#cargaGasolina`
- Produces: `#boxHistorialCargasGas`, `#contadorCargasGas`, `#listaHistorialCargasGas`

- [ ] **Step 1: Agregar el contenedor de historial de cargas en `index.html`**

Insertar debajo del div de `Cargar Gasolina` (`#cargaGasolina`) en `index.html`:
```html
                <!-- Historial Últimas Cargas de Gasolina -->
                <div id="boxHistorialCargasGas" class="hidden py-3 border-b border-gray-50 animate-slide-up-fade">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                            <i data-lucide="history" class="w-3.5 h-3.5 text-blue-500"></i>
                            Últimas Cargas
                        </span>
                        <span id="contadorCargasGas" class="text-[9px] font-bold text-gray-400 uppercase bg-gray-100 px-2 py-0.5 rounded-full">0/5</span>
                    </div>
                    <div id="listaHistorialCargasGas" class="space-y-1.5" role="list">
                        <!-- Items generados dinámicamente -->
                    </div>
                </div>
```

- [ ] **Step 2: Verificar apertura de etiquetas y estructura en `index.html`**

Revisar que la indentación y cierre de tags sea idéntica al resto de las cards.

- [ ] **Step 3: Commit de Task 2**

```bash
git add index.html
git commit -m "feat: add fuel load history container in debt section"
```

---

### Task 3: Renderizado, Acción de Carga y Acción de Borrado en script.js

**Files:**
- Modify: `script.js:2378-2420` (`cargarGasolina`)
- Modify: `script.js:2740-2780` (renderizado de UI)
- Modify: `script.js:3030-3085` (exports globales)

**Interfaces:**
- Consumes: `currentFuelHistory`, `currentDeudaCombustible`, `saveFuelStateToCloud`, `#listaHistorialCargasGas`, `#boxHistorialCargasGas`, `#contadorCargasGas`
- Produces: `renderHistorialCargasGas(items)`, `borrarCargaGasolina(id)`, actualización de `cargarGasolina()`

- [ ] **Step 1: Implementar función `renderHistorialCargasGas(items)`**

```javascript
function renderHistorialCargasGas(items) {
    const box = document.getElementById('boxHistorialCargasGas');
    const lista = document.getElementById('listaHistorialCargasGas');
    const contador = document.getElementById('contadorCargasGas');
    if (!box || !lista) return;

    const safeItems = normalizeFuelHistoryArray(items);
    currentFuelHistory = safeItems;

    if (safeItems.length === 0) {
        box.classList.add('hidden');
        lista.innerHTML = '';
        if (contador) contador.textContent = '0/5';
        return;
    }

    box.classList.remove('hidden');
    if (contador) contador.textContent = `${safeItems.length}/5`;

    lista.innerHTML = safeItems.map((item) => {
        const fecha = escapeHtml(item.fecha || '-');
        const hora = escapeHtml(item.hora || '--:--');
        const monto = Math.round(item.monto || 0);
        return `
            <div role="listitem" class="flex items-center justify-between p-2 bg-gray-50 rounded-xl border border-gray-100 text-xs">
                <div class="flex items-center gap-2">
                    <div class="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <i data-lucide="fuel" class="w-3.5 h-3.5"></i>
                    </div>
                    <div>
                        <span class="font-bold text-gray-700 block text-[11px] leading-tight">+${formatTotal(monto)}</span>
                        <span class="text-[9px] text-gray-400 font-medium">${fecha} · ${hora}</span>
                    </div>
                </div>
                <button type="button" onclick="borrarCargaGasolina(${item.id})"
                    class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    title="Eliminar carga y restar de deuda">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
            </div>
        `;
    }).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();
}
```

- [ ] **Step 2: Actualizar `cargarGasolina()` para insertar en el histórico**

En `cargarGasolina()`:
```javascript
async function cargarGasolina() {
    const input = document.getElementById('cargaGasolina');
    const monto = normalizeDeudaCombustibleMonto(input?.value);
    if (monto === null) {
        showToast('Ingresa un monto valido mayor a 0 para la carga de gasolina.', 'warning');
        return;
    }

    const deudaBase = normalizeDeudaCombustibleMonto(currentDeudaCombustible, true, true) ?? 0;
    const nuevaDeuda = Math.round(deudaBase + monto);
    const nuevaCarga = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        monto,
        fecha: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
        hora: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        fechaISO: getLocalISODate()
    };
    const nuevoHistorial = [nuevaCarga, ...currentFuelHistory].slice(0, 5);

    const btn = document.querySelector('[onclick="cargarGasolina()"]');
    let result;
    try {
        result = await runActionWithFeedback(btn, {
            loading: 'Guardando...',
            success: 'Cargado',
            pending: 'Pendiente offline',
            error: 'No guardado'
        }, async () => {
            currentDeudaCombustible = nuevaDeuda;
            currentFuelHistory = nuevoHistorial;
            actualizarUIDeudaCombustible(currentDeudaCombustible);
            renderHistorialCargasGas(currentFuelHistory);
            const settingResult = await saveFuelStateToCloud(currentDeudaCombustible, currentFuelHistory);
            return {
                feedbackMode: feedbackModeFromWriteModes(settingResult.mode)
            };
        }, 'cargarGasolina');
    } catch (error) {
        currentDeudaCombustible = deudaBase;
        actualizarUIDeudaCombustible(deudaBase);
        showToast(error?.message || 'No se pudo guardar la carga de gasolina.', 'error');
        return;
    }

    if (result?.feedbackMode === 'skipped') return;

    if (input) input.value = '';
    showToast(result.feedbackMode === 'pending' ? `Carga registrada en cola offline: ${formatTotal(monto)}.` : `Carga registrada: ${formatTotal(monto)}.`, result.feedbackMode === 'pending' ? 'warning' : 'success');
    calcular();
}
```

- [ ] **Step 3: Implementar `borrarCargaGasolina(id)`**

```javascript
async function borrarCargaGasolina(id) {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return;
    const item = currentFuelHistory.find((c) => c.id === numericId);
    if (!item) return;

    if (!confirm(`¿Eliminar esta carga de ${formatTotal(item.monto)}? Se restará de la deuda de combustible.`)) {
        showToast('Eliminación cancelada.', 'info');
        return;
    }

    const deudaAnterior = currentDeudaCombustible;
    const historialAnterior = [...currentFuelHistory];
    const nuevaDeuda = Math.round(deudaAnterior - item.monto);
    const nuevoHistorial = currentFuelHistory.filter((c) => c.id !== numericId);

    try {
        currentDeudaCombustible = nuevaDeuda;
        currentFuelHistory = nuevoHistorial;
        actualizarUIDeudaCombustible(currentDeudaCombustible);
        renderHistorialCargasGas(currentFuelHistory);
        await saveFuelStateToCloud(currentDeudaCombustible, currentFuelHistory);
        showToast(`Carga de ${formatTotal(item.monto)} eliminada y restada de deuda.`, 'success');
        calcular();
    } catch (error) {
        currentDeudaCombustible = deudaAnterior;
        currentFuelHistory = historialAnterior;
        actualizarUIDeudaCombustible(deudaAnterior);
        renderHistorialCargasGas(historialAnterior);
        showToast('No se pudo eliminar la carga de gasolina.', 'error');
    }
}
```

- [ ] **Step 4: Exponer funciones a `window`**

En la sección final de `script.js`:
```javascript
window.borrarCargaGasolina = borrarCargaGasolina;
window.renderHistorialCargasGas = renderHistorialCargasGas;
```

- [ ] **Step 5: Validar sintaxis y compilar JS**

Run: `node -c script.js`  
Expected: Exit code 0.

- [ ] **Step 6: Commit de Task 3**

```bash
git add script.js
git commit -m "feat: implement fuel load history render and deletion flow"
```

---

### Task 4: Verificación Integral

**Files:**
- Test: `tests/integration-verify.js`

- [ ] **Step 1: Crear script de verificación de simulación**

Crear `tests/integration-verify.js`:
Verificar que la adición de carga y eliminación reversa respetan el límite de 5 ítems, recalculan deuda correctamente y conservan integridad.

- [ ] **Step 2: Ejecutar verificación**

Run: `node tests/integration-verify.js`  
Expected: PASS.

- [ ] **Step 3: Eliminar scripts temporales de testing si aplica o mantener en repo**

- [ ] **Step 4: Commit final de verificación**

```bash
git add tests/
git commit -m "test: add integration test suite for fuel load history"
```
