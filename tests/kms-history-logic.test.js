const assert = require('assert');
const vm = require('vm');

// Mock o import de la función a implementar
const scriptContext = {};
let applyFIFOPaymentToKmsHistory;

try {
    const fs = require('fs');
    const content = fs.readFileSync('script.js', 'utf8');
    const fnMatch = content.match(/function applyFIFOPaymentToKmsHistory[\s\S]*?\n\}/);
    if (fnMatch) {
        vm.runInNewContext(fnMatch[0], scriptContext);
        applyFIFOPaymentToKmsHistory = scriptContext.applyFIFOPaymentToKmsHistory;
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

const resNegativo = applyFIFOPaymentToKmsHistory(baseHistory, -50);
assert.equal(resNegativo.updatedHistory.length, 3, 'Pago negativo no debe modificar historial');
assert.equal(resNegativo.saldadosCount, 0);
assert.equal(resNegativo.maintAbonado, 0);

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

// Test 4: Manejo de arrays vacíos y nulos
const resVacio = applyFIFOPaymentToKmsHistory([], 50);
assert.deepEqual(resVacio.updatedHistory, []);
assert.equal(resVacio.saldadosCount, 0);

const resNull = applyFIFOPaymentToKmsHistory(null, 50);
assert.deepEqual(resNull.updatedHistory, []);
assert.equal(resNull.saldadosCount, 0);

// Test 5: Pago que supera el monto total de mantenimiento pendiente
const resExcedente = applyFIFOPaymentToKmsHistory(baseHistory, 250);
assert.equal(resExcedente.saldadosCount, 2);
assert.equal(resExcedente.kmsAcumulados, 180);
assert.equal(resExcedente.maintAbonado, 100);
assert.equal(resExcedente.parcialAplicado, false);
assert.equal(resExcedente.updatedHistory.length, 1);
assert.equal(resExcedente.updatedHistory[0].id, 101);

console.log('✅ All applyFIFOPaymentToKmsHistory logic tests passed.');

if (typeof module !== 'undefined') {
    module.exports = { applyFIFOPaymentToKmsHistory };
}
