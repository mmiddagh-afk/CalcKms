const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const scriptContext = {
    toFiniteNumber: (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)
};

let calculateComponentWearRate;
let calculateMulticomponentWear;
let calculateMaintenanceMetrics;
let distributeMaintenanceDeduction;

try {
    const content = fs.readFileSync('script.js', 'utf8');
    const fnsMatch = content.match(/function calculateComponentWearRate[\s\S]*?function calculateMaintenanceMetrics[\s\S]*?\n\}/);
    if (fnsMatch) {
        vm.runInNewContext(fnsMatch[0], scriptContext);
        calculateComponentWearRate = scriptContext.calculateComponentWearRate;
        calculateMulticomponentWear = scriptContext.calculateMulticomponentWear;
        calculateMaintenanceMetrics = scriptContext.calculateMaintenanceMetrics;
        distributeMaintenanceDeduction = scriptContext.distributeMaintenanceDeduction;
    }
} catch (e) {
    // Si no existen todavía, permanecerán undefined para fallar en RED
}

// 1. Tests para calculateComponentWearRate(precio, km)
assert.strictEqual(typeof calculateComponentWearRate, 'function', 'calculateComponentWearRate debe ser una función');

// Test 1.1: Tasa normal (Llantas $200 por 40.000 km -> 0.005 / km)
assert.strictEqual(calculateComponentWearRate(200, 40000), 0.005, '200 / 40000 debe ser 0.005');

// Test 1.2: Valores en cero o vacíos no deben dar NaN ni Infinity
assert.strictEqual(calculateComponentWearRate(200, 0), 0, 'KM = 0 debe retornar tasa 0');
assert.strictEqual(calculateComponentWearRate(0, 5000), 0, 'Precio = 0 debe retornar tasa 0');
assert.strictEqual(calculateComponentWearRate(-100, 5000), 0, 'Precio negativo debe normalizarse a 0');
assert.strictEqual(calculateComponentWearRate(200, -5000), 0, 'KM negativo debe normalizarse a 0');
assert.strictEqual(calculateComponentWearRate(null, undefined), 0, 'Nulos deben retornar 0');

// 2. Tests para calculateMulticomponentWear(components)
assert.strictEqual(typeof calculateMulticomponentWear, 'function', 'calculateMulticomponentWear debe ser una función');

const sampleComponents = {
    llantas: { precio: 200, km: 40000 },  // 0.005
    frenos: { precio: 100, km: 25000 },   // 0.004
    aceite: { precio: 50, km: 5000 },     // 0.010
    extras: { precio: 60, km: 10000 }     // 0.006
};
const resWear = calculateMulticomponentWear(sampleComponents);
assert.strictEqual(resWear.rates.llantas, 0.005);
assert.strictEqual(resWear.rates.frenos, 0.004);
assert.strictEqual(resWear.rates.aceite, 0.010);
assert.strictEqual(resWear.rates.extras, 0.006);
// Total: 0.005 + 0.004 + 0.010 + 0.006 = 0.025
assert(Math.abs(resWear.totalRate - 0.025) < 0.00001, `Tasa total esperada 0.025, obtenida: ${resWear.totalRate}`);

// Test 2.1: Cálculo con ahorros individuales por componente
const sampleComponentsWithSavings = {
    llantas: { precio: 200, km: 40000, ahorrado: 50 },
    frenos: { precio: 100, km: 25000, ahorrado: 25 },
    aceite: { precio: 50, km: 5000, ahorrado: 50 },
    extras: { precio: 60, km: 10000, ahorrado: 0 }
};
const resWearWithSavings = calculateMulticomponentWear(sampleComponentsWithSavings);
assert.strictEqual(resWearWithSavings.totalSavings, 125, 'Total savings debe ser 50 + 25 + 50 + 0 = 125');
assert.strictEqual(resWearWithSavings.savings.llantas, 50);
assert.strictEqual(resWearWithSavings.savings.aceite, 50);
assert.strictEqual(resWearWithSavings.progress.llantas, 25, '50 / 200 = 25%');
assert.strictEqual(resWearWithSavings.progress.aceite, 100, '50 / 50 = 100%');
assert.strictEqual(resWearWithSavings.isCovered.aceite, true);
assert.strictEqual(resWearWithSavings.isCovered.llantas, false);

// 3. Tests para calculateMaintenanceMetrics(params)
assert.strictEqual(typeof calculateMaintenanceMetrics, 'function', 'calculateMaintenanceMetrics debe ser una función');

// Test 3.1: Componentes activos, ahorro menor a meta -> debe separar cuota completa
const metrics1 = calculateMaintenanceMetrics({
    components: sampleComponents,
    kmMeta: 5000,
    ahorroActual: 50,
    kmRecorridosCiclo: 1000,
    fallbackMeta: 1000
});
assert.strictEqual(metrics1.isComponentMode, true);
assert(Math.abs(metrics1.totalRate - 0.025) < 0.00001);
// Meta proyectada para 5000 km a 0.025 = 125
assert.strictEqual(metrics1.projectedGoal, 125, 'Meta proyectada debe ser 5000 * 0.025 = 125');
// Esperado para 1000 km = 25
assert.strictEqual(metrics1.expectedSavings, 25, 'Ahorro esperado debe ser 1000 * 0.025 = 25');
// Tasa por km activa
assert.strictEqual(metrics1.ratePerKm, 0.025);
assert.strictEqual(metrics1.isGoalReached, false);
// Diferencia: 50 ahorrado - 25 esperado = +25 superávit
assert.strictEqual(metrics1.savingsDifference, 25);

// Test 3.2: Meta alcanzada (ahorroActual >= projectedGoal) -> ratePerKm debe ser 0
const metrics2 = calculateMaintenanceMetrics({
    components: sampleComponents,
    kmMeta: 5000,
    ahorroActual: 130, // mayor a 125
    kmRecorridosCiclo: 3000,
    fallbackMeta: 1000
});
assert.strictEqual(metrics2.isGoalReached, true, 'isGoalReached debe ser true');
assert.strictEqual(metrics2.ratePerKm, 0, 'ratePerKm debe ser 0 cuando la meta se cumple');

// Test 3.3: Sin componentes (totalRate = 0) -> fallback a cálculo manual
const metricsFallback = calculateMaintenanceMetrics({
    components: {},
    kmMeta: 5000,
    ahorroActual: 200,
    kmRecorridosCiclo: 2000,
    fallbackMeta: 600
});
assert.strictEqual(metricsFallback.isComponentMode, false);
assert.strictEqual(metricsFallback.totalRate, 0);
assert.strictEqual(metricsFallback.projectedGoal, 600);
// Faltan 400 en 3000 km -> 400 / 3000 = 0.1333333333
assert(Math.abs(metricsFallback.ratePerKm - (400 / 3000)) < 0.0001);

// 4. Tests para distributeMaintenanceDeduction(components, montoDescuento)
assert.strictEqual(typeof distributeMaintenanceDeduction, 'function', 'distributeMaintenanceDeduction debe ser una función');

const compsDeduction = {
    llantas: { precio: 200, km: 40000, ahorrado: 50 },
    frenos: { precio: 100, km: 25000, ahorrado: 25 },
    aceite: { precio: 50, km: 5000, ahorrado: 50 },
    extras: { precio: 60, km: 10000, ahorrado: 0 }
}; // total 125

// Caso 4.1: Deducción parcial proporcional (descuento 25 -> nuevo total 100, ratio 0.8)
const dedRes1 = distributeMaintenanceDeduction(compsDeduction, 25);
assert.strictEqual(dedRes1.newTotalSavings, 100);
assert.strictEqual(dedRes1.distributedSavings.llantas, 40);
assert.strictEqual(dedRes1.distributedSavings.frenos, 20);
assert.strictEqual(dedRes1.distributedSavings.aceite, 40);
assert.strictEqual(dedRes1.distributedSavings.extras, 0);

// Caso 4.2: Deducción que supera el ahorro acumulado -> todo queda en 0
const dedRes2 = distributeMaintenanceDeduction(compsDeduction, 200);
assert.strictEqual(dedRes2.newTotalSavings, 0);
assert.strictEqual(dedRes2.distributedSavings.llantas, 0);
assert.strictEqual(dedRes2.distributedSavings.frenos, 0);
assert.strictEqual(dedRes2.distributedSavings.aceite, 0);
assert.strictEqual(dedRes2.distributedSavings.extras, 0);

// Caso 4.3: Deducción 0 o negativa no altera nada
const dedRes3 = distributeMaintenanceDeduction(compsDeduction, 0);
assert.strictEqual(dedRes3.newTotalSavings, 125);
assert.strictEqual(dedRes3.distributedSavings.llantas, 50);

console.log('✅ All multicomponent-wear-logic tests passed successfully.');
