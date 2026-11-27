const assert = require('assert');
const fs = require('fs');

const scriptContent = fs.readFileSync('script.js', 'utf8');

// 1. Verificar registro de las 12 claves en settingsInputs
const expectedKeys = [
    'vehiculoLlantasPrecio', 'vehiculoLlantasKm', 'vehiculoLlantasAhorrado',
    'vehiculoFrenosPrecio', 'vehiculoFrenosKm', 'vehiculoFrenosAhorrado',
    'vehiculoAceitePrecio', 'vehiculoAceiteKm', 'vehiculoAceiteAhorrado',
    'vehiculoExtrasPrecio', 'vehiculoExtrasKm', 'vehiculoExtrasAhorrado'
];

expectedKeys.forEach((key) => {
    assert(scriptContent.includes(`'${key}'`), `settingsInputs debe incluir '${key}'`);
});

// 2. Verificar existencia de las funciones requeridas en script.js
assert(scriptContent.includes('function abrirModalVehiculo'), 'Debe existir abrirModalVehiculo()');
assert(scriptContent.includes('function cerrarModalVehiculo'), 'Debe existir cerrarModalVehiculo()');
assert(scriptContent.includes('function actualizarPreviewVehiculoModal'), 'Debe existir actualizarPreviewVehiculoModal()');
assert(scriptContent.includes('function guardarConfiguracionVehiculo'), 'Debe existir guardarConfiguracionVehiculo()');
assert(scriptContent.includes('function distributeMaintenanceDeduction'), 'Debe existir distributeMaintenanceDeduction()');

// 3. Verificar export en window
assert(scriptContent.includes('window.abrirModalVehiculo = abrirModalVehiculo'), 'abrirModalVehiculo debe estar en window');
assert(scriptContent.includes('window.cerrarModalVehiculo = cerrarModalVehiculo'), 'cerrarModalVehiculo debe estar en window');
assert(scriptContent.includes('window.guardarConfiguracionVehiculo = guardarConfiguracionVehiculo'), 'guardarConfiguracionVehiculo debe estar en window');
assert(scriptContent.includes('window.distributeMaintenanceDeduction = distributeMaintenanceDeduction'), 'distributeMaintenanceDeduction debe estar en window');

// 4. Verificar manejo de Escape para modalVehiculo
assert(scriptContent.includes("'modalVehiculo'"), "El listener de Escape debe incluir 'modalVehiculo'");

console.log('✅ All vehicle-modal-integration tests passed.');
