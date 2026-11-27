const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const scriptContent = fs.readFileSync('script.js', 'utf8');

// 1. Verificación de presencia de funciones en script.js
const matchLlenar = scriptContent.match(/function llenarTodoCobroCascadaKms[\s\S]*?\n\}/);
const matchEjecutar = scriptContent.match(/async function ejecutarCobroCascadaKms[\s\S]*?\n\}/);

assert.ok(matchLlenar, 'llenarTodoCobroCascadaKms debe existir en script.js');
assert.ok(matchEjecutar, 'ejecutarCobroCascadaKms debe existir en script.js');

// 2. Verificación de exports en window
assert.ok(scriptContent.includes('window.ejecutarCobroCascadaKms = ejecutarCobroCascadaKms;'), 'Debe exportar ejecutarCobroCascadaKms en window');
assert.ok(scriptContent.includes('window.llenarTodoCobroCascadaKms = llenarTodoCobroCascadaKms;'), 'Debe exportar llenarTodoCobroCascadaKms en window');

// 3. Verificación de atajo de teclado Enter (en handleEnterForInput o event listener)
const hasEnterSupport = scriptContent.includes('cobroCascadaKmsMonto: ejecutarCobroCascadaKms') ||
    (scriptContent.includes('cobroCascadaKmsMonto') && scriptContent.includes('ejecutarCobroCascadaKms()'));
assert.ok(hasEnterSupport, 'Debe soportar atajo Enter para cobroCascadaKmsMonto');

async function runTests() {
    // Context setup
    const elements = {};
    function mockElement(id, initialProps = {}) {
        elements[id] = {
            id,
            value: '',
            disabled: false,
            dataset: {},
            classList: {
                classes: new Set(),
                add(c) { this.classes.add(c); },
                remove(c) { this.classes.delete(c); },
                contains(c) { return this.classes.has(c); }
            },
            focus() { this.focused = true; },
            ...initialProps
        };
        return elements[id];
    }

    const toasts = [];
    const cloudSettingsSaved = [];
    let cloudHistoryMutations = [];
    let historyRendered = null;
    let calcularCalled = 0;

    const mockDoc = {
        getElementById(id) {
            return elements[id] || null;
        }
    };

    const ctx = {
        document: mockDoc,
        toFiniteNumber: (val, fallback) => (Number.isFinite(Number(val)) ? Number(val) : fallback),
        formatTotal: (val) => `$${Math.round(val)}`,
        showToast: (msg, type, opts) => {
            toasts.push({ msg, type, opts });
        },
        calcular: () => {
            calcularCalled++;
        },
        renderHistorialFromData: (items) => {
            historyRendered = items;
        },
        saveSettingToCloudNow: async (key, val) => {
            cloudSettingsSaved.push({ key, val });
            return { mode: 'cloud' };
        },
        mutateHistoryCloud: async (mutator, opts) => {
            const next = mutator(ctx.currentHistory);
            cloudHistoryMutations.push({ next, opts });
            return next;
        },
        runActionWithFeedback: async (btn, labels, action, key) => {
            return await action();
        },
        feedbackModeFromWriteModes: (...modes) => {
            return modes.includes('queued') || modes.includes('unavailable') ? 'pending' : 'success';
        },
        lastHistoryWriteMode: 'cloud',
        currentHistory: [],
        lastHistoryHash: 'some-hash',
        applyFIFOPaymentToKmsHistory: null
    };

    // Extract applyFIFOPaymentToKmsHistory from script.js
    const matchFIFO = scriptContent.match(/function applyFIFOPaymentToKmsHistory[\s\S]*?\n\}/);
    assert.ok(matchFIFO, 'applyFIFOPaymentToKmsHistory debe existir');
    vm.runInNewContext(matchFIFO[0], ctx);

    // Run llenarTodoCobroCascadaKms and ejecutarCobroCascadaKms in context
    vm.runInNewContext(matchLlenar[0], ctx);
    vm.runInNewContext(matchEjecutar[0], ctx);

    // Test llenarTodoCobroCascadaKms
    const inputCobro = mockElement('cobroCascadaKmsMonto', { value: '' });
    ctx.llenarTodoCobroCascadaKms(120);
    assert.equal(inputCobro.value, 120, 'llenarTodoCobroCascadaKms debe asignar monto');
    assert.equal(inputCobro.focused, true, 'llenarTodoCobroCascadaKms debe hacer focus');

    // Test llenarTodoCobroCascadaKms sin elemento no debe fallar
    const prevCobroEl = elements['cobroCascadaKmsMonto'];
    delete elements['cobroCascadaKmsMonto'];
    assert.doesNotThrow(() => ctx.llenarTodoCobroCascadaKms(50), 'No debe fallar si input no existe');
    elements['cobroCascadaKmsMonto'] = prevCobroEl;

    // Test ejecutarCobroCascadaKms: Validación monto <= 0
    inputCobro.value = '0';
    toasts.length = 0;
    await ctx.ejecutarCobroCascadaKms();
    assert.equal(toasts.length, 1, 'Debe mostrar 1 toast');
    assert.equal(toasts[0].type, 'warning');
    assert.ok(toasts[0].msg.includes('mayor a 0'), 'Debe advertir sobre monto mayor a 0');
    assert.equal(cloudHistoryMutations.length, 0, 'No debe mutar historia');

    // Test ejecutarCobroCascadaKms: Validación monto negativo
    inputCobro.value = '-25';
    toasts.length = 0;
    await ctx.ejecutarCobroCascadaKms();
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].type, 'warning');
    assert.equal(cloudHistoryMutations.length, 0);

    // Setup base history
    ctx.currentHistory = [
        { id: 1, gas: 50, maint: 50, total: 100, kms: 80, isExtra: false },
        { id: 2, total: 30, isExtra: true },
        { id: 3, gas: 60, maint: 50, total: 110, kms: 100, isExtra: false }
    ];
    // Total maint pendiente en kms es 50 + 50 = 100.
    mockElement('ahorroActual', { value: '500' });
    mockElement('kmRecorridosCiclo', { value: '1000' });
    mockElement('btnCobroCascadaKms');

    // Test ejecutarCobroCascadaKms: Validación monto > total pendiente
    inputCobro.value = '150';
    toasts.length = 0;
    await ctx.ejecutarCobroCascadaKms();
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].type, 'warning');
    assert.ok(toasts[0].msg.includes('supera el total pendiente'), 'Debe advertir que supera total pendiente');
    assert.equal(cloudHistoryMutations.length, 0);

    // Test ejecutarCobroCascadaKms: Cobro parcial de 70 (salda id 1 y descuenta 20 de id 3)
    inputCobro.value = '70';
    toasts.length = 0;
    cloudSettingsSaved.length = 0;
    cloudHistoryMutations.length = 0;
    historyRendered = null;
    calcularCalled = 0;

    await ctx.ejecutarCobroCascadaKms();

    // Verificaciones de estado resultante
    assert.equal(cloudHistoryMutations.length, 1, 'Debe realizar 1 mutación de historial en la nube');
    const mutated = cloudHistoryMutations[0].next;
    assert.equal(mutated.length, 2, 'Debe quedar el extra y el km id 3 con saldo restante');
    assert.equal(mutated.find(i => i.id === 1), undefined, 'Item 1 debe haber sido saldado y eliminado');
    const item3 = mutated.find(i => i.id === 3);
    assert.equal(item3.maint, 30, 'Item 3 debe tener maint 30');
    assert.equal(item3.total, 90, 'Item 3 debe tener total 90 (gas 60 + maint 30)');

    // Verificaciones de cloud settings
    const ahorroSave = cloudSettingsSaved.find(s => s.key === 'ahorroActual');
    assert.ok(ahorroSave, 'Debe persistir ahorroActual');
    assert.equal(ahorroSave.val, 570, 'Ahorro debe ser 500 + 70 = 570');
    assert.equal(elements.ahorroActual.value, 570);

    const kmSave = cloudSettingsSaved.find(s => s.key === 'kmRecorridosCiclo');
    assert.ok(kmSave, 'Debe persistir kmRecorridosCiclo');
    assert.equal(kmSave.val, 1080, 'Kms deben ser 1000 + 80 = 1080');
    assert.equal(elements.kmRecorridosCiclo.value, 1080);

    // Verificaciones de UI y render
    assert.deepEqual(historyRendered, mutated, 'renderHistorialFromData debe llamarse con el nuevo historial');
    assert.deepEqual(ctx.currentHistory, mutated, 'currentHistory debe actualizarse');
    assert.equal(ctx.lastHistoryHash, '', 'lastHistoryHash debe resetearse');
    assert.equal(calcularCalled, 1, 'calcular() debe ser invocado');

    // Verificaciones de toast
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].type, 'success');
    assert.ok(toasts[0].msg.includes('$70'), 'Toast debe indicar monto cobrado $70');
    assert.ok(toasts[0].msg.includes('1 registro (+80 km)'), 'Toast debe indicar 1 registro saldado y +80 km');
    assert.ok(toasts[0].msg.includes('Pago parcial aplicado'), 'Toast debe indicar pago parcial');

    // Test ejecutarCobroCascadaKms: Cobro total restante (30)
    inputCobro.value = '30';
    toasts.length = 0;
    cloudSettingsSaved.length = 0;
    cloudHistoryMutations.length = 0;
    calcularCalled = 0;

    await ctx.ejecutarCobroCascadaKms();

    assert.equal(cloudHistoryMutations.length, 1);
    const mutatedRestante = cloudHistoryMutations[0].next;
    assert.equal(mutatedRestante.length, 1, 'Solo debe quedar el extra');
    assert.equal(mutatedRestante[0].id, 2);

    const ahorroSave2 = cloudSettingsSaved.find(s => s.key === 'ahorroActual');
    assert.equal(ahorroSave2.val, 600, 'Ahorro debe ser 570 + 30 = 600');

    const kmSave2 = cloudSettingsSaved.find(s => s.key === 'kmRecorridosCiclo');
    assert.equal(kmSave2.val, 1180, 'Kms deben ser 1080 + 100 = 1180');

    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].type, 'success');
    assert.ok(toasts[0].msg.includes('1 registro (+100 km)'));
    assert.ok(!toasts[0].msg.includes('Pago parcial aplicado'), 'No debe indicar pago parcial');

    // Test error handling
    ctx.mutateHistoryCloud = async () => {
        throw new Error('Fallo de red simulado');
    };
    inputCobro.value = '10';
    toasts.length = 0;
    // Current history has 0 maint now in kms, let's add one
    ctx.currentHistory = [{ id: 10, gas: 0, maint: 20, total: 20, kms: 10, isExtra: false }];
    await ctx.ejecutarCobroCascadaKms();
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].type, 'error');
    assert.ok(toasts[0].msg.includes('Fallo de red simulado'));

    console.log('✅ Action validation and orchestration tests passed.');
}

runTests().catch(err => {
    console.error(err);
    process.exit(1);
});
