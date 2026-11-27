const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

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

// 3. Verificación de exportación en window
assert.ok(scriptContent.includes('window.aplicarDescuentoMantenimiento = aplicarDescuentoMantenimiento;'), 'Debe exportar aplicarDescuentoMantenimiento en window');

// 4. Verificación de listener o soporte Enter para descuentoMantenimiento
const hasEnterSupport = scriptContent.includes("getElementById('descuentoMantenimiento')") &&
    scriptContent.includes("aplicarDescuentoMantenimiento()");
assert.ok(hasEnterSupport, 'Debe configurar listener para el input descuentoMantenimiento');

async function runTests() {
    const elements = {};
    function mockElement(id, initialProps = {}) {
        elements[id] = {
            id,
            value: '',
            disabled: false,
            ...initialProps
        };
        return elements[id];
    }

    const toasts = [];
    const cloudSaved = [];
    let calcularCalled = 0;
    let confirmPrompt = null;
    let confirmResponse = true;

    const ctx = {
        document: {
            getElementById(id) {
                return elements[id] || null;
            }
        },
        navigator: {
            vibrate() {}
        },
        confirm(msg) {
            confirmPrompt = msg;
            return confirmResponse;
        },
        toFiniteNumber: (val, fallback = 0) => (Number.isFinite(Number(val)) ? Number(val) : fallback),
        getInputVal(id, fallback = 0) {
            const el = elements[id];
            return el ? (parseFloat(el.value) || fallback) : fallback;
        },
        formatTotal: (val) => `$${Math.round(val)}`,
        showToast(msg, type) {
            toasts.push({ msg, type });
        },
        calcular() {
            calcularCalled++;
        },
        saveSettingToCloudNow: async (key, val) => {
            cloudSaved.push({ key, val });
            return { mode: 'cloud' };
        },
        console
    };

    // Extract calculateMaintenanceDeduction and aplicarDescuentoMantenimiento from script.js
    const matchCalc = scriptContent.match(/function calculateMaintenanceDeduction[\s\S]*?\n\}/);
    assert.ok(matchCalc, 'calculateMaintenanceDeduction debe existir');
    vm.runInNewContext(matchCalc[0], ctx);

    const matchAplicar = scriptContent.match(/async function aplicarDescuentoMantenimiento[\s\S]*?\n\}/);
    assert.ok(matchAplicar, 'aplicarDescuentoMantenimiento debe existir');
    vm.runInNewContext(matchAplicar[0], ctx);

    // Test 1: Invalid input (0 or negative or non-numeric)
    const inputDescuento = mockElement('descuentoMantenimiento', { value: '0' });
    const btn = mockElement('btnDescontarMantenimiento', { disabled: false });
    const ahorroEl = mockElement('ahorroActual', { value: '500' });
    const metaEl = mockElement('metaMantenimiento', { value: '1000' });

    await ctx.aplicarDescuentoMantenimiento();
    assert.strictEqual(toasts.length, 1);
    assert.strictEqual(toasts[0].type, 'warning');
    assert.strictEqual(cloudSaved.length, 0);

    // Test 2: Valid deduction where amount > ahorro and user cancels confirm
    toasts.length = 0;
    inputDescuento.value = '600';
    confirmResponse = false;
    await ctx.aplicarDescuentoMantenimiento();
    assert.ok(confirmPrompt.includes('$600'));
    assert.strictEqual(cloudSaved.length, 0);
    assert.strictEqual(btn.disabled, false);

    // Test 3: Valid deduction where amount > ahorro and user accepts confirm
    confirmResponse = true;
    await ctx.aplicarDescuentoMantenimiento();
    assert.strictEqual(cloudSaved.length, 2);
    assert.deepStrictEqual(cloudSaved[0], { key: 'ahorroActual', val: 0 });
    assert.deepStrictEqual(cloudSaved[1], { key: 'metaMantenimiento', val: 400 });
    assert.strictEqual(ahorroEl.value, 0);
    assert.strictEqual(metaEl.value, 400);
    assert.strictEqual(inputDescuento.value, '');
    assert.strictEqual(calcularCalled, 1);
    assert.strictEqual(toasts.length, 1);
    assert.strictEqual(toasts[0].type, 'success');
    assert.strictEqual(btn.disabled, false);

    // Test 4: Normal deduction within savings
    toasts.length = 0;
    cloudSaved.length = 0;
    ahorroEl.value = '300';
    metaEl.value = '500';
    inputDescuento.value = '100';
    confirmPrompt = null;
    await ctx.aplicarDescuentoMantenimiento();
    assert.strictEqual(confirmPrompt, null, 'No debe pedir confirmacion si no supera ahorro');
    assert.deepStrictEqual(cloudSaved[0], { key: 'ahorroActual', val: 200 });
    assert.deepStrictEqual(cloudSaved[1], { key: 'metaMantenimiento', val: 400 });
    assert.strictEqual(ahorroEl.value, 200);
    assert.strictEqual(metaEl.value, 400);
    assert.strictEqual(inputDescuento.value, '');
    assert.strictEqual(toasts.length, 1);
    assert.strictEqual(toasts[0].type, 'success');

    // Test 5: Component mode deduction (only ahorroActual is deducted, metaMantenimiento is preserved)
    toasts.length = 0;
    cloudSaved.length = 0;
    ctx.getVehiculoComponentesFromInputs = () => ({ llantas: { precio: 1000, km: 40000 } });
    ctx.calculateMulticomponentWear = () => ({ totalRate: 0.025 });
    ahorroEl.value = '500';
    metaEl.value = '800';
    inputDescuento.value = '150';
    confirmPrompt = null;
    await ctx.aplicarDescuentoMantenimiento();
    assert.strictEqual(confirmPrompt, null);
    assert.strictEqual(cloudSaved.length, 1, 'En modo multicomponente solo se persiste ahorroActual');
    assert.deepStrictEqual(cloudSaved[0], { key: 'ahorroActual', val: 350 });
    assert.strictEqual(ahorroEl.value, 350);
    assert.strictEqual(metaEl.value, 800, 'Meta no debe ser modificada en modo multicomponente');
    assert.strictEqual(inputDescuento.value, '');
    assert.strictEqual(toasts.length, 1);
    assert.strictEqual(toasts[0].type, 'success');

    console.log('✅ All maintenance deduction action assertions passed.');
}

runTests().catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
