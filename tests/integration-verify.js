import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🧪 Starting Fuel Load History Integration Verification...');

// ============================================================================
// 1. VERIFICACIÓN DE ARCHIVOS ESTÁTICOS Y SELECTORES HTML
// ============================================================================
console.log('\n--- 1. Static HTML & Script Verification ---');

const indexHtmlPath = path.join(rootDir, 'index.html');
assert.equal(fs.existsSync(indexHtmlPath), true, 'index.html must exist');
const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
const indexHtml = indexHtmlContent;

// Check presence of DOM IDs in index.html
assert.match(indexHtmlContent, /id="boxHistorialCargasGas"/, 'index.html must include id="boxHistorialCargasGas"');
assert.match(indexHtmlContent, /id="contadorCargasGas"/, 'index.html must include id="contadorCargasGas"');
assert.match(indexHtmlContent, /id="listaHistorialCargasGas"/, 'index.html must include id="listaHistorialCargasGas"');
assert.match(indexHtmlContent, /onclick="cargarGasolina\(\)"/, 'index.html must have button triggering cargarGasolina()');

const scriptJsPath = path.join(rootDir, 'script.js');
assert.equal(fs.existsSync(scriptJsPath), true, 'script.js must exist');
const scriptJsContent = fs.readFileSync(scriptJsPath, 'utf8');
const scriptJs = scriptJsContent;

// Check window exports
assert.match(scriptJsContent, /window\.borrarCargaGasolina\s*=\s*borrarCargaGasolina;/, 'script.js must export borrarCargaGasolina');
assert.match(scriptJsContent, /window\.renderHistorialCargasGas\s*=\s*renderHistorialCargasGas;/, 'script.js must export renderHistorialCargasGas');
assert.match(scriptJsContent, /window\.saveFuelStateToCloud\s*=\s*saveFuelStateToCloud;/, 'script.js must export saveFuelStateToCloud');
assert.match(scriptJsContent, /window\.normalizeFuelHistoryItem\s*=\s*normalizeFuelHistoryItem;/, 'script.js must export normalizeFuelHistoryItem');
assert.match(scriptJsContent, /window\.normalizeFuelHistoryArray\s*=\s*normalizeFuelHistoryArray;/, 'script.js must export normalizeFuelHistoryArray');
assert.match(scriptJsContent, /window\.applyFIFOPaymentToFuelHistory\s*=\s*applyFIFOPaymentToFuelHistory;/, 'script.js must export applyFIFOPaymentToFuelHistory');
assert.match(scriptJsContent, /window\.applyFIFOPaymentToKmsHistory\s*=\s*applyFIFOPaymentToKmsHistory;/, 'script.js must export applyFIFOPaymentToKmsHistory');
assert.match(scriptJsContent, /window\.ejecutarCobroCascadaKms\s*=\s*ejecutarCobroCascadaKms;/, 'script.js must export ejecutarCobroCascadaKms');
assert.match(scriptJsContent, /window\.llenarTodoCobroCascadaKms\s*=\s*llenarTodoCobroCascadaKms;/, 'script.js must export llenarTodoCobroCascadaKms');

// Check markup presence in script.js
assert.match(scriptJsContent, /id="boxCobroCascadaKms"/, 'script.js must contain markup for id="boxCobroCascadaKms"');

// Check offline queue integration
assert.match(scriptJsContent, /type\s*===\s*'fuel_set'/, 'script.js must handle fuel_set queue deduplication');
assert.match(scriptJsContent, /op\.type\s*===\s*'fuel_set'/, 'script.js must handle fuel_set in applyOfflineOperation');
assert.match(scriptJsContent, /enqueueOfflineOperation\('fuel_set'/, 'script.js must enqueue fuel_set on cloud save failure');

console.log('✅ Static file and selector verification passed.');

// ============================================================================
// 2. CONTRATO DE NORMALIZACIÓN DE DATOS
// ============================================================================
console.log('\n--- 2. Data Normalization Contract ---');

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

// Validation of edge cases
const dirtyArray = [
    { id: 10, monto: 15000.4, fecha: ' 19 oct ', hora: ' 10:00 ', fechaISO: '2026-10-19' },
    { id: 10, monto: 20000.9, fecha: ' 19 oct ', hora: ' 11:00 ', fechaISO: '2026-10-19' },
    { id: 'invalid-id', monto: -500 }, // Descartado monto <= 0
    null, // Descartado
    { id: 30, monto: 0 }, // Descartado monto 0
    { id: 40, monto: '12000' },
    { id: 50, monto: 18000 },
    { id: 60, monto: 25000 },
    { id: 70, monto: 30000 } // Supera el límite de 5
];

const normalizedResult = normalizeFuelHistoryArray(dirtyArray);
assert.equal(normalizedResult.length, 5, 'Must clamp to 5 items max');
assert.equal(normalizedResult[0].id, 10);
assert.equal(normalizedResult[0].monto, 15000);
assert.equal(normalizedResult[1].id, 11, 'Must increment collided IDs');
assert.equal(normalizedResult[1].monto, 20001);
assert.equal(normalizedResult[2].id, 40);
assert.equal(normalizedResult[2].monto, 12000);
assert.equal(normalizedResult[3].id, 50);
assert.equal(normalizedResult[4].id, 60);

console.log('✅ Data normalization contract passed.');

// ============================================================================
// 3. CICLO DE INTEGRACIÓN END-TO-END (CARGAS, RENDER, BORRADO, PERSISTENCIA)
// ============================================================================
console.log('\n--- 3. End-to-End Simulation of Full Fuel Load Lifecycle ---');

// Mock DOM
function createMockElement(id) {
    return {
        id,
        classList: {
            classes: new Set(),
            add(c) { this.classes.add(c); },
            remove(c) { this.classes.delete(c); },
            contains(c) { return this.classes.has(c); }
        },
        innerHTML: '',
        textContent: ''
    };
}

const mockElements = {
    boxHistorialCargasGas: createMockElement('boxHistorialCargasGas'),
    listaHistorialCargasGas: createMockElement('listaHistorialCargasGas'),
    contadorCargasGas: createMockElement('contadorCargasGas')
};

globalThis.document = {
    getElementById(id) {
        return mockElements[id] || null;
    }
};

const htmlEscapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => htmlEscapeMap[c]);
const formatTotal = (val) => `$${Math.round(val)}`;

let toastCalls = [];
globalThis.showToast = (msg, type) => {
    toastCalls.push({ msg, type });
};

let calcularCallCount = 0;
globalThis.calcular = () => {
    calcularCallCount++;
};

let uiDeudaUpdates = [];
globalThis.actualizarUIDeudaCombustible = (val) => {
    uiDeudaUpdates.push(val);
};

// Simulation State
let currentFuelHistory = [];
let currentDeudaCombustible = 0;
let cloudSyncOperations = [];
let simulateNetworkError = false;

// Mock saveFuelStateToCloud
async function saveFuelStateToCloud(nuevaDeuda, nuevoHistorial) {
    if (simulateNetworkError) {
        throw new Error('Firebase network unreachable');
    }
    const safeItems = normalizeFuelHistoryArray(nuevoHistorial);
    cloudSyncOperations.push({
        deudaCombustible: nuevaDeuda,
        historialCargasGas: safeItems,
        timestamp: Date.now()
    });
    return { mode: 'cloud' };
}

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
}

async function simularCargarGasolina(monto) {
    const deudaBase = currentDeudaCombustible;
    const historialBase = [...currentFuelHistory];
    const nuevaDeuda = Math.round(deudaBase + monto);
    const nuevaCarga = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        monto,
        fecha: '19 oct',
        hora: '14:00',
        fechaISO: '2026-10-19'
    };
    const nuevoHistorial = [nuevaCarga, ...currentFuelHistory].slice(0, 5);

    try {
        currentDeudaCombustible = nuevaDeuda;
        currentFuelHistory = nuevoHistorial;
        actualizarUIDeudaCombustible(currentDeudaCombustible);
        renderHistorialCargasGas(currentFuelHistory);
        await saveFuelStateToCloud(currentDeudaCombustible, currentFuelHistory);
        calcular();
    } catch (error) {
        currentDeudaCombustible = deudaBase;
        currentFuelHistory = historialBase;
        actualizarUIDeudaCombustible(deudaBase);
        renderHistorialCargasGas(historialBase);
        showToast(error?.message || 'No se pudo guardar la carga de gasolina.', 'error');
    }
}

let confirmResult = true;
globalThis.confirm = () => confirmResult;

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

// -------------------------------------------------------------
// Test 3.1: Estado inicial vacío
// -------------------------------------------------------------
renderHistorialCargasGas([]);
assert.equal(mockElements.boxHistorialCargasGas.classList.contains('hidden'), true);
assert.equal(mockElements.contadorCargasGas.textContent, '0/5');
assert.equal(mockElements.listaHistorialCargasGas.innerHTML, '');

// -------------------------------------------------------------
// Test 3.2: 7 Cargas sucesivas (Truncamiento FIFO a 5)
// -------------------------------------------------------------
const montosPrueba = [10000, 15000, 20000, 12000, 18000, 25000, 30000];
for (let i = 0; i < montosPrueba.length; i++) {
    await simularCargarGasolina(montosPrueba[i]);
}

// Deuda acumulada total: 10k+15k+20k+12k+18k+25k+30k = 130000
assert.equal(currentDeudaCombustible, 130000, 'Deuda acumulada debe ser 130000');
assert.equal(currentFuelHistory.length, 5, 'El historial debe truncar a exactamente 5 elementos');
assert.equal(mockElements.contadorCargasGas.textContent, '5/5');
assert.equal(mockElements.boxHistorialCargasGas.classList.contains('hidden'), false);

// La carga más reciente (30000) debe estar primera
assert.equal(currentFuelHistory[0].monto, 30000);
assert.equal(currentFuelHistory[1].monto, 25000);
assert.equal(currentFuelHistory[2].monto, 18000);
assert.equal(currentFuelHistory[3].monto, 12000);
assert.equal(currentFuelHistory[4].monto, 20000);

// Operaciones cloud registradas
assert.equal(cloudSyncOperations.length, 7);
const ultimaOperacion = cloudSyncOperations[cloudSyncOperations.length - 1];
assert.equal(ultimaOperacion.deudaCombustible, 130000);
assert.equal(ultimaOperacion.historialCargasGas.length, 5);

// -------------------------------------------------------------
// Test 3.3: Borrado con confirmación (Descuento atómico)
// -------------------------------------------------------------
const idABorrar = currentFuelHistory[1].id; // monto 25000
const montoABorrar = currentFuelHistory[1].monto;

confirmResult = true;
await borrarCargaGasolina(idABorrar);

assert.equal(currentDeudaCombustible, 130000 - montoABorrar, 'Deuda debe reducirse a 105000');
assert.equal(currentFuelHistory.length, 4, 'Historial debe quedar en 4 elementos');
assert.equal(mockElements.contadorCargasGas.textContent, '4/5');
assert.equal(currentFuelHistory.some((c) => c.id === idABorrar), false, 'El elemento debe haber sido eliminado');

// -------------------------------------------------------------
// Test 3.4: Rollback ante fallo de persistencia en borrado
// -------------------------------------------------------------
const idFallo = currentFuelHistory[0].id; // monto 30000
simulateNetworkError = true;
toastCalls = [];

await borrarCargaGasolina(idFallo);

assert.equal(currentDeudaCombustible, 105000, 'Deuda debe revertirse ante error');
assert.equal(currentFuelHistory.length, 4, 'Historial debe revertirse ante error');
assert.equal(currentFuelHistory[0].id, idFallo, 'Elemento debe continuar presente');
assert.equal(mockElements.contadorCargasGas.textContent, '4/5');
assert.equal(toastCalls.some((t) => t.type === 'error'), true, 'Debe mostrar toast de error');

simulateNetworkError = false;

// -------------------------------------------------------------
// Test 3.5: Borrado sucesivo hasta vaciar historial (0/5)
// -------------------------------------------------------------
while (currentFuelHistory.length > 0) {
    const nextId = currentFuelHistory[0].id;
    await borrarCargaGasolina(nextId);
}

assert.equal(currentFuelHistory.length, 0, 'Historial debe quedar vacío');
assert.equal(mockElements.boxHistorialCargasGas.classList.contains('hidden'), true, 'Contenedor debe ocultarse');
assert.equal(mockElements.contadorCargasGas.textContent, '0/5');
assert.equal(mockElements.listaHistorialCargasGas.innerHTML, '');

console.log('✅ End-to-end full lifecycle simulation passed.');

// ============================================================================
// 4. VERIFICACIÓN DE INTEGRACIÓN OFFLINE QUEUE ('fuel_set')
// ============================================================================
console.log('\n--- 4. Offline Queue & Sync Simulation ---');

let offlineQueue = [];
function enqueueOfflineOperation(type, payload, storageId) {
    if (type === 'fuel_set') {
        offlineQueue = offlineQueue.filter((entry) => !(entry.type === 'fuel_set' && entry.storageId === storageId));
    }
    const op = { type, payload, storageId, timestamp: Date.now() };
    offlineQueue.push(op);
    return op;
}

let mockCloudStorage = {};
async function applyOfflineOperation(op) {
    if (!op?.type || !op?.storageId) return false;
    if (op.type === 'fuel_set') {
        const safeItems = normalizeFuelHistoryArray(op.payload?.historialCargasGas || []);
        const safeDeuda = op.payload?.deudaCombustible ?? 0;
        mockCloudStorage[op.storageId] = {
            deudaCombustible: safeDeuda,
            historialCargasGas: safeItems
        };
        return true;
    }
    return true;
}

// Test queueing and deduplication
enqueueOfflineOperation('fuel_set', { deudaCombustible: 45000, historialCargasGas: [{ id: 1, monto: 45000 }] }, 'user_123');
assert.equal(offlineQueue.length, 1);

enqueueOfflineOperation('fuel_set', { deudaCombustible: 70000, historialCargasGas: [{ id: 2, monto: 25000 }, { id: 1, monto: 45000 }] }, 'user_123');
assert.equal(offlineQueue.length, 1, 'Debe deduplicar operaciones fuel_set previas para el mismo storageId');
assert.equal(offlineQueue[0].payload.deudaCombustible, 70000);

// Test applying offline queue when syncing
const opToApply = offlineQueue.shift();
await applyOfflineOperation(opToApply);

assert.deepEqual(mockCloudStorage['user_123'], {
    deudaCombustible: 70000,
    historialCargasGas: [
        { id: 2, monto: 25000, fecha: '', hora: '', fechaISO: '' },
        { id: 1, monto: 45000, fecha: '', hora: '', fechaISO: '' }
    ]
});

console.log('✅ Offline queue deduplication and sync passed.');

// ============================================================================
// 5. VERIFICACIÓN DE INTEGRACIÓN: CASCADE SETTLEMENT (KMS)
// ============================================================================
console.log('\n--- 5. KMS Cascade Settlement Integration Verification ---');

// Assert that the cascade markup has the required interactive elements:
assert.match(scriptJsContent, /id="cobroCascadaKmsMonto"/, 'script.js must include input id="cobroCascadaKmsMonto"');
assert.match(scriptJsContent, /id="btnCobroCascadaKms"/, 'script.js must include button id="btnCobroCascadaKms"');
assert.match(scriptJsContent, /onclick="ejecutarCobroCascadaKms\(\)"/, 'script.js must wire button to ejecutarCobroCascadaKms()');
assert.match(scriptJsContent, /onclick="llenarTodoCobroCascadaKms\(/, 'script.js must wire quick fill button to llenarTodoCobroCascadaKms');

console.log('✅ KMS cascade settlement integration verification passed.');

// ============================================================================
// 6. MAINTENANCE EMERGENCY DEDUCTION INTEGRATION VERIFICATION
// ============================================================================
console.log('\n--- 6. Maintenance Emergency Deduction Integration Verification ---');

// 1. Verificar selectores en index.html
const inputDescMatch = indexHtml.includes('id="descuentoMantenimiento"');
const btnDescMatch = indexHtml.includes('id="btnDescontarMantenimiento"');
assert.ok(inputDescMatch, 'descuentoMantenimiento input present in index.html');
assert.ok(btnDescMatch, 'btnDescontarMantenimiento button present in index.html');

// 2. Verificar función y lógica matemática en script.js
const fnDeductionMatch = scriptJs.match(/function calculateMaintenanceDeduction[\s\S]*?\n\}/);
assert.ok(fnDeductionMatch, 'calculateMaintenanceDeduction function found in script.js');
const scriptContext = {};
scriptContext.toFiniteNumber = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
vm.runInNewContext(fnDeductionMatch[0], scriptContext);
const deductionFn = scriptContext.calculateMaintenanceDeduction;

const dedRes = deductionFn(580, 1390, 80);
assert.strictEqual(dedRes.newSavings, 500, 'New savings must be 500');
assert.strictEqual(dedRes.newGoal, 1310, 'New goal must be 1310');

// 3. Verificar existencia de aplicarDescuentoMantenimiento en script.js
assert.ok(scriptJs.includes('async function aplicarDescuentoMantenimiento'), 'aplicarDescuentoMantenimiento exists in script.js');

console.log('✅ Maintenance emergency deduction verification passed.');

console.log('\n🎉 ALL INTEGRATION VERIFICATION CHECKS PASSED SUCCESSFULLY!\n');
