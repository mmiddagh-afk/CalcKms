const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');

// 1. Verificar disparador #seccionVehiculoInfo
assert(html.includes('id="seccionVehiculoInfo"'), 'Debe existir #seccionVehiculoInfo');
assert(html.includes('abrirModalVehiculo()'), 'Debe tener handler para abrirModalVehiculo()');

// 2. Verificar disparador y badges en #seccionMantenimiento
assert(html.includes('id="btnConfigurarVehiculo"'), 'Debe existir #btnConfigurarVehiculo en Mantenimiento');
assert(html.includes('id="badgeDesgasteMulticomponente"'), 'Debe existir #badgeDesgasteMulticomponente');
assert(html.includes('id="mantenimientoDesgloseComponentes"'), 'Debe existir #mantenimientoDesgloseComponentes');

// 3. Verificar estructura de #modalVehiculo
assert(html.includes('id="modalVehiculo"'), 'Debe existir #modalVehiculo');
assert(html.includes('id="btnCerrarModalVehiculo"'), 'Debe existir #btnCerrarModalVehiculo');
assert(html.includes('id="btnGuardarVehiculo"'), 'Debe existir #btnGuardarVehiculo');

// 4. Verificar inputs y elementos de los 4 componentes
const requiredInputs = [
    'vehiculoLlantasPrecio', 'vehiculoLlantasKm', 'vehiculoLlantasTasa', 'vehiculoLlantasAhorrado', 'vehiculoLlantasProgreso',
    'vehiculoFrenosPrecio', 'vehiculoFrenosKm', 'vehiculoFrenosTasa', 'vehiculoFrenosAhorrado', 'vehiculoFrenosProgreso',
    'vehiculoAceitePrecio', 'vehiculoAceiteKm', 'vehiculoAceiteTasa', 'vehiculoAceiteAhorrado', 'vehiculoAceiteProgreso',
    'vehiculoExtrasPrecio', 'vehiculoExtrasKm', 'vehiculoExtrasTasa', 'vehiculoExtrasAhorrado', 'vehiculoExtrasProgreso'
];
requiredInputs.forEach((id) => {
    assert(html.includes(`id="${id}"`), `Debe existir elemento con id="${id}"`);
});

// 5. Verificar resumen del modal
assert(html.includes('id="vehiculoTotalTasaKm"'), 'Debe existir #vehiculoTotalTasaKm');
assert(html.includes('id="vehiculoTotalProyeccionCiclo"'), 'Debe existir #vehiculoTotalProyeccionCiclo');
assert(html.includes('id="vehiculoTotalAhorrado"'), 'Debe existir #vehiculoTotalAhorrado');

console.log('✅ All vehicle-modal-dom tests passed.');
