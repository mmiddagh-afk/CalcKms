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

// Tests normalizeFuelHistoryItem
const singleItem = normalizeFuelHistoryItem({ id: '105', monto: '24.8', fecha: ' 19 oct ', hora: ' 14:30 ', fechaISO: ' 2026-10-19 ' });
assert.equal(singleItem.id, 105);
assert.equal(singleItem.monto, 25);
assert.equal(singleItem.fecha, '19 oct');
assert.equal(singleItem.hora, '14:30');
assert.equal(singleItem.fechaISO, '2026-10-19');

const fallbackItem = normalizeFuelHistoryItem(null, 999);
assert.equal(fallbackItem.id, 999);
assert.equal(fallbackItem.monto, 0);
assert.equal(fallbackItem.fecha, '');

// Tests normalizeFuelHistoryArray
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

assert.deepEqual(normalizeFuelHistoryArray(null), [], 'Null debe devolver array vacio');
assert.deepEqual(normalizeFuelHistoryArray([]), [], 'Array vacio debe devolver array vacio');

console.log('✅ normalizeFuelHistoryArray tests passed.');

// Tests applyFIFOPaymentToFuelHistory (FIFO partial payments)
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

// Historial ordenado: índice 0 = más reciente (id: 2, 20), índice 1 = más antigua (id: 1, 30)
const fifoHistory = [
    { id: 2, monto: 20, fecha: '19 oct', hora: '12:00', fechaISO: '2026-10-19' },
    { id: 1, monto: 30, fecha: '19 oct', hora: '10:00', fechaISO: '2026-10-19' }
];

// Pago 0 o negativo no modifica
assert.deepEqual(applyFIFOPaymentToFuelHistory(fifoHistory, 0), fifoHistory);
assert.deepEqual(applyFIFOPaymentToFuelHistory(fifoHistory, -10), fifoHistory);
assert.deepEqual(applyFIFOPaymentToFuelHistory([], 10), []);
assert.deepEqual(applyFIFOPaymentToFuelHistory(null, 10), []);

// Pago parcial que reduce la más antigua sin eliminarla
const resParcial = applyFIFOPaymentToFuelHistory(fifoHistory, 10);
assert.equal(resParcial.length, 2);
assert.equal(resParcial[0].id, 2);
assert.equal(resParcial[0].monto, 20); // Reciente intacta
assert.equal(resParcial[1].id, 1);
assert.equal(resParcial[1].monto, 20); // Antigua reducida de 30 a 20

// Pago exacto que liquida la más antigua por completo
const resLiquidaAntigua = applyFIFOPaymentToFuelHistory(fifoHistory, 30);
assert.equal(resLiquidaAntigua.length, 1);
assert.equal(resLiquidaAntigua[0].id, 2);
assert.equal(resLiquidaAntigua[0].monto, 20);

// Pago que liquida la más antigua y reduce la siguiente más antigua
const resLiquidaYMuerdeSiguiente = applyFIFOPaymentToFuelHistory(fifoHistory, 35);
assert.equal(resLiquidaYMuerdeSiguiente.length, 1);
assert.equal(resLiquidaYMuerdeSiguiente[0].id, 2);
assert.equal(resLiquidaYMuerdeSiguiente[0].monto, 15);

// Pago que supera todas las cargas
const resSuperaTodo = applyFIFOPaymentToFuelHistory(fifoHistory, 100);
assert.deepEqual(resSuperaTodo, []);

console.log('✅ applyFIFOPaymentToFuelHistory FIFO tests passed.');
