# Plan de Implementación: Desgaste Multicomponente y Modal de Vehículo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar en CalcKms el sistema de Desgaste Multicomponente para Mantenimiento (Llantas, Frenos, Aceite y Extras) gestionado desde el Modal de Vehículo, reemplazando el cálculo manual de Costo Meta por una tasa dinámica por km que frena al alcanzar la meta del ciclo.

**Architecture:** La lógica matemática se aísla en funciones puras desacopladas del DOM y de Firebase (`calculateComponentWearRate`, `calculateMulticomponentWear`, `calculateMaintenanceMetrics`). En el DOM se introduce `#modalVehiculo` accesible desde `#seccionVehiculoInfo` y `#seccionMantenimiento`. Los 8 parámetros de componentes se persisten en Firestore y localStorage reutilizando la infraestructura de sincronización reactiva y cola offline existente en `script.js`.

**Tech Stack:** HTML5, Tailwind CSS, Vanilla JavaScript (ES Modules), Firebase Firestore, Node.js (`assert` para suite de pruebas).

**Spec:** [`docs/superpowers/specs/2026-10-28-desgaste-multicomponente-vehiculo-design.md`](file:///e:/Webs%20Uber/CalcKms/docs/superpowers/specs/2026-10-28-desgaste-multicomponente-vehiculo-design.md)

## Global Constraints
- Nunca añadir "Co-Authored-By" o atribuciones de IA a los commits. Usar conventional commits (`feat:`, `test:`, `fix:`, etc.).
- Nunca ejecutar build tras los cambios (este proyecto es HTML/JS estático desplegado en Netlify).
- Preservar la integridad de los IDs existentes y la sincronización con Firebase Firestore.
- Mantener diseño responsive (móvil pulgar-first y desktop modular) y soporte de modo oscuro (`body.theme-dark`).

## Review Focus
1. **División por cero en componentes:** Si el usuario ingresa KM = 0 o vacío con precio > 0, la tasa del componente debe ser 0.00 y no `Infinity` ni `NaN`.
2. **Freno exacto de cuota diaria al alcanzar la meta:** Cuando `ahorroActual >= metaMantenimientoProyectada`, `ahorroMantenimientoPorKm` debe ser exactamente 0 para no restar dinero de la ganancia libre diaria, mostrando el badge `#msgMetaAlcanzada`.
3. **Persistencia y merge seguro en Firestore:** Guardar los 8 campos de vehículo usando `{ merge: true }` sin sobreescribir ni borrar otros ajustes como `precioLitro` o `deudaCombustible`.
4. **Descuento de emergencias con componentes activos:** Al aplicar `#descuentoMantenimiento` con componentes configurados, debe descontar de `ahorroActual` sin alterar la tasa intrínseca de desgaste por km del auto.
5. **Fallback cuando no hay componentes configurados:** Si todos los componentes están en 0 o vacíos, el sistema debe operar en modo manual histórico con `metaMantenimiento` sin romper cálculos previos.

---

### Task 1: Funciones Puras de Desgaste Multicomponente y Tests Unitarios

**Files:**
- Create: `tests/multicomponent-wear-logic.test.js`
- Modify: `script.js:540-570` (exportar funciones puras de desgaste)

**Interfaces:**
- Produces:
  - `calculateComponentWearRate(precio, km): number`
  - `calculateMulticomponentWear(components): { rates: Object, totalRate: number }`
  - `calculateMaintenanceMetrics(params): { totalRate: number, projectedGoal: number, expectedSavings: number, ratePerKm: number, isGoalReached: number, savingsDifference: number }`

- [ ] **Step 1: Escribir el test fallando para la lógica de cálculo**

Crear `tests/multicomponent-wear-logic.test.js` testeando:
- Tasa individual `calculateComponentWearRate(precio, km)` con valores válidos, 0 km, valores negativos y nulos.
- Tasa total combinada de los 4 componentes (Llantas, Frenos, Aceite, Extras).
- `calculateMaintenanceMetrics`:
  - `ahorroActual < projectedGoal`: `ratePerKm === totalRate`, `isGoalReached === false`.
  - `ahorroActual >= projectedGoal`: `ratePerKm === 0`, `isGoalReached === true`.
  - `totalRate === 0`: fallback a manual.

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `node tests/multicomponent-wear-logic.test.js`  
Expected: FAIL con "calculateComponentWearRate is not defined" o similar.

- [ ] **Step 3: Implementar las funciones puras en `script.js`**

Implementar en `script.js`:
```javascript
function calculateComponentWearRate(precio, km) {
    const p = Math.max(0, toFiniteNumber(precio, 0));
    const k = Math.max(0, toFiniteNumber(km, 0));
    if (p <= 0 || k <= 0) return 0;
    return p / k;
}

function calculateMulticomponentWear(components = {}) {
    const keys = ['llantas', 'frenos', 'aceite', 'extras'];
    const rates = {};
    let totalRate = 0;
    keys.forEach((key) => {
        const comp = components[key] || {};
        const rate = calculateComponentWearRate(comp.precio, comp.km);
        rates[key] = rate;
        totalRate += rate;
    });
    return { rates, totalRate };
}

function calculateMaintenanceMetrics({ components, kmMeta = 5000, ahorroActual = 0, kmRecorridosCiclo = 0, fallbackMeta = 0 }) {
    const { rates, totalRate } = calculateMulticomponentWear(components);
    const safeKmMeta = Math.max(1, toFiniteNumber(kmMeta, 5000));
    const safeAhorro = Math.max(0, toFiniteNumber(ahorroActual, 0));
    const safeKmRecorridos = Math.max(0, toFiniteNumber(kmRecorridosCiclo, 0));

    if (totalRate > 0) {
        const projectedGoal = Math.round(safeKmMeta * totalRate);
        const expectedSavings = Math.round(safeKmRecorridos * totalRate);
        const isGoalReached = safeAhorro >= projectedGoal;
        const ratePerKm = isGoalReached ? 0 : totalRate;
        const savingsDifference = safeAhorro - expectedSavings;

        return {
            isComponentMode: true,
            rates,
            totalRate,
            projectedGoal,
            expectedSavings,
            ratePerKm,
            isGoalReached,
            savingsDifference
        };
    }

    // Modo manual de respaldo
    const safeFallbackMeta = Math.max(0, toFiniteNumber(fallbackMeta, 0));
    const faltanteDinero = safeFallbackMeta - safeAhorro;
    const faltanteKm = safeKmMeta - safeKmRecorridos;
    let fallbackRate = 0;
    if (faltanteDinero > 0 && faltanteKm > 0) {
        fallbackRate = faltanteDinero / faltanteKm;
    } else if (faltanteDinero > 0 && faltanteKm <= 0) {
        fallbackRate = safeFallbackMeta / safeKmMeta;
    }
    const expectedSavings = safeKmMeta > 0 ? (safeKmRecorridos / safeKmMeta) * safeFallbackMeta : 0;

    return {
        isComponentMode: false,
        rates: {},
        totalRate: 0,
        projectedGoal: safeFallbackMeta,
        expectedSavings: Math.round(expectedSavings),
        ratePerKm: faltanteDinero <= 0 ? 0 : fallbackRate,
        isGoalReached: safeFallbackMeta > 0 && faltanteDinero <= 0,
        savingsDifference: safeAhorro - expectedSavings
    };
}
```
Exponer en `window` para accesibilidad en el navegador y pruebas.

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `node tests/multicomponent-wear-logic.test.js`  
Expected: PASS

- [ ] **Step 5: Commit de Task 1**

```bash
git add tests/multicomponent-wear-logic.test.js script.js
git commit -m "feat: add multicomponent wear pure calculation logic and tests"
```

---

### Task 2: Maquetado del Modal de Vehículo y Estilos en `index.html` y `styles.css`

**Files:**
- Modify: `index.html:797-810` (hacer interactivo `#seccionVehiculoInfo`)
- Modify: `index.html:420-450` (añadir botón de configurar vehículo y badge en Mantenimiento)
- Modify: `index.html:1070-1085` (añadir `#modalVehiculo`)
- Modify: `styles.css:1100-1200` (estilos para `#modalVehiculo` y micro-badges de componentes)
- Create: `tests/vehicle-modal-dom.test.js`

**Interfaces:**
- Consumes: `calculateMulticomponentWear`, `formatCurrency`, `formatTotal`
- Produces: IDs en DOM:
  - Disparadores: `#seccionVehiculoInfo` (cursor pointer, `onclick="abrirModalVehiculo()"`), `#btnConfigurarVehiculo`
  - Modal: `#modalVehiculo`, `#modalVehiculoContent`, `#btnCerrarModalVehiculo`
  - Inputs de componentes:
    - `#vehiculoLlantasPrecio`, `#vehiculoLlantasKm`, `#vehiculoLlantasTasa`
    - `#vehiculoFrenosPrecio`, `#vehiculoFrenosKm`, `#vehiculoFrenosTasa`
    - `#vehiculoAceitePrecio`, `#vehiculoAceiteKm`, `#vehiculoAceiteTasa`
    - `#vehiculoExtrasPrecio`, `#vehiculoExtrasKm`, `#vehiculoExtrasTasa`
  - Resumen modal: `#vehiculoTotalTasaKm`, `#vehiculoTotalProyeccionCiclo`, `#btnGuardarVehiculo`
  - En Mantenimiento: `#badgeDesgasteMulticomponente`, `#mantenimientoDesgloseComponentes`

- [ ] **Step 1: Escribir test DOM para verificar estructura del modal**

Crear `tests/vehicle-modal-dom.test.js` verificando que:
- `index.html` contiene `#modalVehiculo` con todos los inputs requeridos y botón `#btnGuardarVehiculo`.
- `#seccionVehiculoInfo` tiene el atributo/handler para invocar `abrirModalVehiculo()`.
- `#seccionMantenimiento` contiene el acceso a la configuración del vehículo.

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `node tests/vehicle-modal-dom.test.js`  
Expected: FAIL con elementos no encontrados en `index.html`.

- [ ] **Step 3: Agregar el marcado HTML en `index.html` y estilos en `styles.css`**

- En `#seccionVehiculoInfo`: convertir la tarjeta estática en un botón/tarjeta interactiva con `role="button"`, hover effect (`hover:border-emerald-200 cursor-pointer`), chevron indicator y `onclick="abrirModalVehiculo()"`.
- En `#seccionMantenimiento`: agregar badge dinámico `#badgeDesgasteMulticomponente` y botón `#btnConfigurarVehiculo`.
- Antes del cierre de modales en `index.html`: insertar `#modalVehiculo` siguiendo el diseño premium y accesible existente (backdrop blur, animaciones `animate-modal-backdrop` y `animate-modal-content`, 4 bloques de componentes con inputs `inputmode="numeric"`, y footer con proyección del ciclo y botón guardar).
- En `styles.css`: agregar las reglas para la tarjeta de componentes del modal, micro-badges de $/km y soporte dark mode (`body.theme-dark`).

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `node tests/vehicle-modal-dom.test.js`  
Expected: PASS

- [ ] **Step 5: Commit de Task 2**

```bash
git add index.html styles.css tests/vehicle-modal-dom.test.js
git commit -m "feat: add vehicle modal markup and styles for multicomponent wear"
```

---

### Task 3: Cableado Reactivo, Persistencia en Firestore y Actualización de `calcular()`

**Files:**
- Modify: `script.js:50-60` (añadir claves a `settingsInputs`)
- Modify: `script.js:560-612` (`aplicarDescuentoMantenimiento`)
- Modify: `script.js:1435-1590` (`calcular`)
- Modify: `script.js:2700-2730` (`Escape` y listeners)
- Modify: `script.js:3150-3600` (funciones del modal y exports globales)
- Create: `tests/vehicle-modal-integration.test.js`

**Interfaces:**
- Consumes: Funciones puras de Task 1, elementos DOM de Task 2, `saveSettingToCloudNow`, `showToast`
- Produces:
  - `window.abrirModalVehiculo()`
  - `window.cerrarModalVehiculo()`
  - `window.guardarConfiguracionVehiculo()`
  - `window.actualizarPreviewVehiculoModal()`
  - Sincronización en tiempo real en `setupRealtimeListeners` y `calcular()`

- [ ] **Step 1: Escribir test de integración para el flujo del modal y recálculo**

Crear `tests/vehicle-modal-integration.test.js` verificando que:
- Al cambiar valores en los inputs del modal, la previsualización de tasas por km y el total proyectado se actualizan de inmediato.
- Al guardar el modal, se recopilan los 8 valores, se persisten y se llama a `calcular()`.
- `calcular()` refleja la tasa combinada en `ahorroMantenimientoPorKm`, muestra el desglose en Mantenimiento, actualiza "Debería tener" con `kmRecorridosCiclo * tasaTotal` y frena en `$0` cuando `ahorroActual >= metaMantenimientoProyectada`.
- `aplicarDescuentoMantenimiento()` con componentes activos deduce de `ahorroActual` sin alterar la tasa del auto.

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `node tests/vehicle-modal-integration.test.js`  
Expected: FAIL porque las funciones de control del modal no existen en `script.js`.

- [ ] **Step 3: Implementar la integración en `script.js`**

1. Añadir las 8 claves a `settingsInputs`:
   `['vehiculoLlantasPrecio', 'vehiculoLlantasKm', 'vehiculoFrenosPrecio', 'vehiculoFrenosKm', 'vehiculoAceitePrecio', 'vehiculoAceiteKm', 'vehiculoExtrasPrecio', 'vehiculoExtrasKm']`.
2. Implementar `abrirModalVehiculo()`, `cerrarModalVehiculo()`, `actualizarPreviewVehiculoModal()` y `guardarConfiguracionVehiculo()`.
3. Conectar la tecla `Escape` en el document listener para cerrar `#modalVehiculo`.
4. En `setupRealtimeListeners`: hidratar los 8 inputs cuando lleguen datos de Firestore.
5. En `calcular()`:
   - Leer los 8 campos mediante `getInputVal`.
   - Llamar a `calculateMaintenanceMetrics(...)`.
   - Si `isComponentMode`:
     - Ocultar input manual `#metaMantenimiento` o mostrar badge de meta proyectada (`formatTotal(metrics.projectedGoal)`).
     - Actualizar `#ahorroMantenimientoPorKm` con `formatCurrency(metrics.ratePerKm)`.
     - Mostrar desglose de componentes en `#mantenimientoDesgloseComponentes`.
     - Actualizar `#ctrlAhorroMeta` con `metrics.projectedGoal`.
     - Actualizar `#ctrlDeberiaAhorro` con `formatTotal(metrics.expectedSavings)`.
     - Actualizar `#ctrlBalanceValor` con `metrics.savingsDifference`.
     - Si `metrics.isGoalReached`, mostrar `#msgMetaAlcanzada` ("Meta OK").
   - Si no hay componentes (`!isComponentMode`):
     - Mantener el flujo manual histórico.
6. En `aplicarDescuentoMantenimiento`:
   - Si hay componentes activos, descontar únicamente de `ahorroActual` y persistir dicho campo. Si está en modo manual, descontar de ambos como antes.

- [ ] **Step 4: Ejecutar la suite completa de pruebas**

Run:
```bash
node tests/multicomponent-wear-logic.test.js
node tests/vehicle-modal-dom.test.js
node tests/vehicle-modal-integration.test.js
node tests/maintenance-deduction-logic.test.js
node tests/kms-history-logic.test.js
node tests/fuel-history-logic.test.js
```
Expected: PASS en todos los tests sin regresiones.

- [ ] **Step 5: Commit de Task 3**

```bash
git add script.js tests/vehicle-modal-integration.test.js
git commit -m "feat: wire vehicle modal, firebase persistence and reactive multicomponent calculation"
```

---

### Task 4: Verificación Visual, Modo Oscuro y Documentación

**Files:**
- Modify: `styles.css` (ajustes finos de responsividad y dark mode si se detectan detalles)
- Modify: `cambios.md` (registrar la nueva funcionalidad implementada)

**Interfaces:**
- Consumes: App en ejecución
- Produces: `cambios.md` actualizado con notas de versión

- [ ] **Step 1: Verificar estilos de modo oscuro y adaptabilidad móvil**

Comprobar que en `body.theme-dark` los nuevos elementos de `#modalVehiculo` y los badges en `#seccionMantenimiento` tengan contraste adecuado, bordes sutiles y no muestren texto con fondos blancos duros.

- [ ] **Step 2: Actualizar `cambios.md`**

Documentar la incorporación del Desgaste Multicomponente y el Modal de Vehículo.

- [ ] **Step 3: Ejecutar todos los tests del repositorio**

Run: `Get-ChildItem tests/*.test.js | ForEach-Object { node $_.FullName }`  
Expected: Todos los tests pasan con éxito.

- [ ] **Step 4: Commit de Task 4**

```bash
git add styles.css cambios.md
git commit -m "docs: record multicomponent wear and vehicle modal in changelog"
```
