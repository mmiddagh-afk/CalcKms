import assert from 'node:assert/strict';

// Helper mock functions
const htmlEscapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => htmlEscapeMap[c]);
const formatTotal = (val) => `$${Math.round(val)}`;

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

let mockElements = {};
globalThis.document = {
    getElementById(id) {
        return mockElements[id] || null;
    }
};

let toastCalls = [];
globalThis.showToast = (msg, type) => {
    toastCalls.push({ msg, type });
};

let calcularCalled = false;
globalThis.calcular = () => {
    calcularCalled = true;
};

let uidUpdates = [];
globalThis.actualizarUIDeudaCombustible = (val) => {
    uidUpdates.push(val);
};

let cloudSaves = [];
let mockSaveReject = false;
globalThis.saveFuelStateToCloud = async (deuda, hist) => {
    if (mockSaveReject) {
        throw new Error('Network failure');
    }
    cloudSaves.push({ deuda, hist });
    return { mode: 'cloud' };
};

let confirmResponse = true;
globalThis.confirm = () => confirmResponse;

// State
let currentFuelHistory = [];
let currentDeudaCombustible = 0;

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

// ---------------- TESTS ----------------

// Setup elements
mockElements = {
    boxHistorialCargasGas: createMockElement('boxHistorialCargasGas'),
    listaHistorialCargasGas: createMockElement('listaHistorialCargasGas'),
    contadorCargasGas: createMockElement('contadorCargasGas')
};

// Test 1: render empty history
renderHistorialCargasGas([]);
assert.equal(mockElements.boxHistorialCargasGas.classList.contains('hidden'), true);
assert.equal(mockElements.listaHistorialCargasGas.innerHTML, '');
assert.equal(mockElements.contadorCargasGas.textContent, '0/5');
assert.deepEqual(currentFuelHistory, []);

// Test 2: render with items (including XSS attempt)
const sampleItems = [
    { id: 101, monto: 25000, fecha: '<script>alert(1)</script>', hora: '14:30' },
    { id: 102, monto: 30000, fecha: '19 oct', hora: '18:45' }
];
renderHistorialCargasGas(sampleItems);
assert.equal(mockElements.boxHistorialCargasGas.classList.contains('hidden'), false);
assert.equal(mockElements.contadorCargasGas.textContent, '2/5');
assert.equal(currentFuelHistory.length, 2);
assert.match(mockElements.listaHistorialCargasGas.innerHTML, /\+\$25000/);
assert.match(mockElements.listaHistorialCargasGas.innerHTML, /onclick="borrarCargaGasolina\(101\)"/);
assert.doesNotMatch(mockElements.listaHistorialCargasGas.innerHTML, /<script>/, 'Must sanitize XSS characters');
assert.match(mockElements.listaHistorialCargasGas.innerHTML, /&lt;script&gt;/, 'Must escape HTML tags');

// Test 3: borrarCargaGasolina - user cancels
currentDeudaCombustible = 55000;
confirmResponse = false;
toastCalls = [];
await borrarCargaGasolina(101);
assert.equal(currentDeudaCombustible, 55000, 'Deuda no debe cambiar al cancelar');
assert.equal(currentFuelHistory.length, 2, 'Historial no debe cambiar al cancelar');
assert.equal(toastCalls.length, 1);
assert.equal(toastCalls[0].type, 'info');

// Test 4: borrarCargaGasolina - user confirms
confirmResponse = true;
cloudSaves = [];
uidUpdates = [];
calcularCalled = false;
toastCalls = [];

await borrarCargaGasolina(101);
assert.equal(currentDeudaCombustible, 30000, 'Deuda debe reducirse por 25000');
assert.equal(currentFuelHistory.length, 1, 'Historial debe quedar con 1 elemento');
assert.equal(currentFuelHistory[0].id, 102);
assert.equal(mockElements.contadorCargasGas.textContent, '1/5');
assert.equal(cloudSaves.length, 1);
assert.equal(cloudSaves[0].deuda, 30000);
assert.equal(uidUpdates[uidUpdates.length - 1], 30000);
assert.equal(calcularCalled, true);
assert.equal(toastCalls[0].type, 'success');

// Test 5: borrarCargaGasolina - rollback on save failure
mockSaveReject = true;
toastCalls = [];
uidUpdates = [];

await borrarCargaGasolina(102);
assert.equal(currentDeudaCombustible, 30000, 'Deuda debe restaurarse tras error');
assert.equal(currentFuelHistory.length, 1, 'Historial debe restaurarse tras error');
assert.equal(mockElements.contadorCargasGas.textContent, '1/5');
assert.equal(toastCalls[0].type, 'error');
assert.equal(toastCalls[0].msg, 'No se pudo eliminar la carga de gasolina.');

// Test 6: delete remaining item until 0
mockSaveReject = false;
await borrarCargaGasolina(102);
assert.equal(currentDeudaCombustible, 0);
assert.equal(currentFuelHistory.length, 0);
assert.equal(mockElements.boxHistorialCargasGas.classList.contains('hidden'), true);
assert.equal(mockElements.contadorCargasGas.textContent, '0/5');

// Test 7: FIFO deduction on partial payment in guardarPagoDeudaCombustible
function applyFIFOPaymentToFuelHistory(items, paymentAmount) {
    if (!Array.isArray(items) || items.length === 0) return [];
    let remPago = Math.max(0, Math.round(Number(paymentAmount) || 0));
    if (remPago <= 0) return normalizeFuelHistoryArray(items);

    const reversed = [...items].reverse();
    const nextReversed = [];

    for (const item of reversed) {
        if (remPago <= 0) {
            nextReversed.push(item);
            continue;
        }
        const itemMonto = Math.max(0, Math.round(Number(item.monto) || 0));
        if (remPago >= itemMonto) {
            remPago -= itemMonto;
        } else {
            const nuevoMonto = itemMonto - remPago;
            remPago = 0;
            nextReversed.push({ ...item, monto: nuevoMonto });
        }
    }

    return normalizeFuelHistoryArray(nextReversed.reverse());
}

async function simularPagoDeudaCombustible(monto) {
    const deuda = currentDeudaCombustible;
    const nuevaDeuda = deuda - monto;
    const debeLimpiarHistorial = deuda > 0 && nuevaDeuda <= 0;
    const nuevoHistorial = debeLimpiarHistorial
        ? []
        : applyFIFOPaymentToFuelHistory(currentFuelHistory, monto);

    currentDeudaCombustible = nuevaDeuda;
    currentFuelHistory = nuevoHistorial;
    actualizarUIDeudaCombustible(nuevaDeuda);
    renderHistorialCargasGas(currentFuelHistory);
    await saveFuelStateToCloud(nuevaDeuda, nuevoHistorial);
}

// Inicializar con 2 cargas: Reciente: 20k (id: 201), Antigua: 30k (id: 202). Total deuda = 50k
currentDeudaCombustible = 50000;
renderHistorialCargasGas([
    { id: 201, monto: 20000, fecha: '19 oct', hora: '14:00' },
    { id: 202, monto: 30000, fecha: '19 oct', hora: '10:00' }
]);
assert.equal(currentFuelHistory.length, 2);

// Pago parcial de 10k: debe reducir la más antigua (id: 202) de 30k a 20k
await simularPagoDeudaCombustible(10000);
assert.equal(currentDeudaCombustible, 40000);
assert.equal(currentFuelHistory.length, 2);
assert.equal(currentFuelHistory[0].id, 201);
assert.equal(currentFuelHistory[0].monto, 20000); // Reciente intacta
assert.equal(currentFuelHistory[1].id, 202);
assert.equal(currentFuelHistory[1].monto, 20000); // Antigua reducida

// Pago de 25k: liquida completamente la más antigua (20k) y reduce la reciente en 5k (de 20k a 15k)
await simularPagoDeudaCombustible(25000);
assert.equal(currentDeudaCombustible, 15000);
assert.equal(currentFuelHistory.length, 1);
assert.equal(currentFuelHistory[0].id, 201);
assert.equal(currentFuelHistory[0].monto, 15000);

// Pago que cancela el resto de la deuda (15k): deuda queda en 0 y el historial se limpia
await simularPagoDeudaCombustible(15000);
assert.equal(currentDeudaCombustible, 0);
assert.equal(currentFuelHistory.length, 0);
assert.equal(mockElements.boxHistorialCargasGas.classList.contains('hidden'), true);
assert.equal(mockElements.contadorCargasGas.textContent, '0/5');

console.log('✅ All UI render, delete action, and FIFO payment tests passed.');
