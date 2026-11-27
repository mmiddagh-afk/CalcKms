const assert = require('assert');
const vm = require('vm');
const fs = require('fs');

const scriptContext = {
    toFiniteNumber: (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)
};
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
