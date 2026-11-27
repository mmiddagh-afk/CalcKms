const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const scriptContent = fs.readFileSync('script.js', 'utf8');

// Extraer buildHistorialGroup
const match = scriptContent.match(/function buildHistorialGroup[\s\S]*?\n\}/);
assert.ok(match, 'buildHistorialGroup debe existir en script.js');

// Helper mock para renderHistorialKmsItem y renderHistorialExtraItem
const scriptContext = {
    renderHistorialKmsItem: (item) => `<div data-item-id="${item.id}">KMS</div>`,
    renderHistorialExtraItem: (item) => `<div data-item-id="${item.id}">EXTRA</div>`,
    toFiniteNumber: (val, fallback) => (Number.isFinite(Number(val)) ? Number(val) : fallback)
};

vm.runInNewContext(match[0], scriptContext);
const buildHistorialGroup = scriptContext.buildHistorialGroup;
assert.equal(typeof buildHistorialGroup, 'function', 'buildHistorialGroup debe ser una función');

// Test 1: Grupo kms con deuda debe incluir #boxCobroCascadaKms y elementos requeridos
const kmsItemsConDeuda = [
    { id: 1, maint: 50, gas: 50, kms: 100, isExtra: false },
    { id: 2, maint: 20, gas: 30, kms: 50, isExtra: false }
];
const htmlConDeuda = buildHistorialGroup('Kilometraje', '2 movimientos', 'kms', kmsItemsConDeuda, 0);
assert.ok(htmlConDeuda.includes('id="boxCobroCascadaKms"'), 'Debe renderizar boxCobroCascadaKms');
assert.ok(htmlConDeuda.includes('id="cobroCascadaKmsMonto"'), 'Debe incluir el input de monto');
assert.ok(htmlConDeuda.includes('id="btnCobroCascadaKms"'), 'Debe incluir el botón de cobrar');
assert.ok(htmlConDeuda.includes('onclick="ejecutarCobroCascadaKms()"'), 'Debe tener onclick ejecutarCobroCascadaKms');
assert.ok(htmlConDeuda.includes('onclick="llenarTodoCobroCascadaKms(70)"'), 'Debe tener onclick llenarTodoCobroCascadaKms con 70');
assert.ok(htmlConDeuda.includes('Pagar Todo ($70)'), 'Debe mostrar el total acumulado en el botón pagar todo');
assert.ok(htmlConDeuda.includes('min="1"'), 'Input debe tener min="1"');
assert.ok(htmlConDeuda.includes('max="70"'), 'Input debe tener max="70"');

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
