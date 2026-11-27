# Especificación de Diseño: Cobro Rápido en Cascada (FIFO) para Historial de Kilometraje

**Fecha:** 2026-10-21  
**Proyecto:** CalcKms (Mi Ahorro Vehicular)  
**Estado:** Aprobado  

---

## 1. Resumen Ejecutivo
Implementar un componente interactivo de cobro rápido al pie de la sección de **Kilometraje** en el historial, que permita al usuario ingresar un monto monetario a cobrar y descontarlo automáticamente en cascada siguiendo una política **FIFO (First-In, First-Out)** sobre los registros de kilometraje pendientes. Si un registro se cubre por completo, se salda al 100% (eliminándose del historial, sumando su mantenimiento al ahorro y sus kilómetros al ciclo acumulado). Si se cubre parcialmente, descuenta el mantenimiento de dicho registro y abona la diferencia al ahorro.

---

## 2. Requerimientos

### 2.1 Requerimientos Funcionales
- **Entrada de Cobro:** Un input numérico `#cobroCascadaKmsMonto` y botón `#btnCobroCascadaKms` ubicados inmediatamente debajo de las tarjetas de kilometraje (y antes del bloque de *Mov Extras*).
- **Acceso rápido "Pagar Todo":** Botón de atajo que llena el input con el total exacto adeudado de mantenimiento entre todas las tarjetas de kilometraje.
- **Disparador:** El cobro se puede ejecutar tanto al presionar el botón `Cobrar` como al presionar la tecla `Enter` en el input.
- **Algoritmo FIFO en Cascada:**
  - Aplica exclusivamente sobre los registros de tipo kilometraje (`!item.isExtra`). Los movimientos extras no son afectados.
  - Procesa los registros ordenados desde el más antiguo al más reciente (cronológico por `id` o `fechaISO`).
  - Cada peso ingresado descuenta del campo `maint` (mantenimiento) del registro actual.
  - Si el saldo a cobrar es mayor o igual al `maint` del ítem: el registro queda completamente saldado, se elimina del historial, se suma su `maint` original a `ahorroActual` y sus `kms` a `kmRecorridosCiclo`.
  - Si el saldo a cobrar es menor al `maint` del ítem: se descuenta parcialmente `item.maint = item.maint - saldoRestante`, se recalcula `item.total = item.gas + item.maint`, y se suma el importe abonado a `ahorroActual` (los `kms` permanecen en la tarjeta).
- **Validaciones preventivas:**
  - Monto debe ser mayor a 0 y finito.
  - Monto no puede superar la deuda total acumulada de mantenimiento en las tarjetas de kilometraje (`totalMaintPendiente`). Si supera, se bloquea y se muestra un toast de advertencia.
- **Visibilidad reactiva:** Si la deuda de mantenimiento pendiente en las tarjetas de kilometraje es 0 o no hay tarjetas de kilometraje, el bloque de cobro se oculta para no saturar la interfaz.
- **Feedback al usuario:** Toast con desglose claro (monto cobrado, cantidad de registros saldados, kilómetros sumados al ciclo y nuevo ahorro generado).

### 2.2 Requerimientos No Funcionales
- **Función Pura Desacoplada:** La lógica matemática debe residir en `applyFIFOPaymentToKmsHistory(items, paymentAmount)` para permitir tests unitarios automatizados sin dependencias del DOM ni de Firebase.
- **Persistencia Atómica y Resiliente:** Sincronización a través de `mutateHistoryCloud` combinada con `saveSettingToCloudNow` para `ahorroActual` y `kmRecorridosCiclo`, con soporte para la cola offline (`offlineQueue`).
- **Rendimiento:** Cero reflows innecesarios; actualización directa mediante `renderHistorialFromData`.

---

## 3. Modelo de Datos y Especificación Algorítmica

### 3.1 Función `applyFIFOPaymentToKmsHistory(items, paymentAmount)`
Firma:
```javascript
function applyFIFOPaymentToKmsHistory(items, paymentAmount)
```
Parámetros:
- `items`: Array de registros del historial (`currentHistory`).
- `paymentAmount`: Número positivo correspondiente al monto a cobrar.

Retorna:
```javascript
{
  updatedHistory: Array,        // Nuevo array con las modificaciones y eliminaciones
  saldadosCount: Number,        // Cantidad de registros completamente saldados
  kmsAcumulados: Number,        // Kms sumados provenientes de registros saldados
  maintAbonado: Number,         // Monto real total abonado a mantenimiento
  parcialAplicado: Boolean      // Indica si la última tarjeta afectada fue parcial
}
```

### 3.2 Lógica Interna del Algoritmo
1. `remPago = Math.max(0, Math.round(Number(paymentAmount) || 0))`.
2. Si `remPago <= 0`, devuelve el historial intacto.
3. Separar `kmsItems` (`!item.isExtra`) y `extraItems` (`item.isExtra`).
4. Los `kmsItems` en `currentHistory` están almacenados cronológicamente (el índice 0 es el más antiguo o el más reciente según convención; en `currentHistory`, `agregarDeuda` hace `push` al array, por lo que el índice 0 es el más antiguo y el último es el más nuevo, mientras que en la UI se muestran en reversa). Se procesan en orden cronológico (más antiguo primero).
5. Para cada ítem de kilometraje:
   - `itemMaint = Math.max(0, Math.round(Number(item.maint) || 0))`.
   - Si `itemMaint === 0` o `remPago === 0`: se conserva tal cual.
   - Si `remPago >= itemMaint`:
     - `remPago -= itemMaint`.
     - `maintAbonado += itemMaint`.
     - `kmsAcumulados += Math.max(0, Math.round(Number(item.kms) || 0))`.
     - `saldadosCount++`.
     - El ítem se descarta (no se incluye en el nuevo array).
   - Si `0 < remPago < itemMaint`:
     - `nuevoMaint = itemMaint - remPago`.
     - `maintAbonado += remPago`.
     - `remPago = 0`.
     - `parcialAplicado = true`.
     - Se actualiza el ítem con `maint = nuevoMaint` y `total = item.gas + nuevoMaint`.
     - Se conserva el ítem modificado.
6. Se reconstruye el historial preservando los `extraItems` en sus posiciones relativas.

---

## 4. Diseño de la Interfaz (UI)

### 4.1 Modificación en `buildHistorialGroup` ([script.js](file:///e:/Webs%20Uber/CalcKms/script.js))
En la construcción del grupo `'Kilometraje'`:
Si `tone === 'kms'` y existe al menos un ítem con `maint > 0`:
Se agrega al pie del grupo (debajo de `${cards}`):
```html
<div id="boxCobroCascadaKms" class="mt-3 p-3 bg-slate-50/90 border border-slate-200/80 rounded-2xl">
    <div class="flex items-center justify-between mb-2">
        <span class="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <i data-lucide="coins" class="w-3.5 h-3.5 text-emerald-600"></i>
            Cobro rápido en cascada
        </span>
        <button type="button" onclick="llenarTodoCobroCascadaKms(${totalMaintPendiente})" class="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 hover:bg-emerald-200/80 px-2.5 py-0.5 rounded-full transition-all">
            Pagar Todo ($${totalMaintPendiente})
        </button>
    </div>
    <div class="flex items-center gap-2">
        <div class="relative flex-1">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-extrabold text-slate-400">$</span>
            <input type="number" id="cobroCascadaKmsMonto" placeholder="0" min="1" max="${totalMaintPendiente}"
                class="w-full pl-7 pr-3 py-2 bg-white rounded-xl border border-slate-200 font-extrabold text-slate-800 text-sm outline-none focus:ring-2 focus:ring-emerald-200 transition-all text-left">
        </div>
        <button type="button" id="btnCobroCascadaKms" onclick="ejecutarCobroCascadaKms()"
            class="px-4 py-2 btn-premium btn-premium-success btn-ripple text-xs font-extrabold rounded-xl flex items-center gap-1.5 shrink-0">
            <i data-lucide="check" class="w-3.5 h-3.5"></i>
            <span>Cobrar</span>
        </button>
    </div>
</div>
```

### 4.2 Atajo de Teclado
Se añade listener en `#cobroCascadaKmsMonto` para que al pulsar `Enter` se invoque directamente `ejecutarCobroCascadaKms()`.

---

## 5. Orquestación y Persistencia Atómica

### 5.1 Función `ejecutarCobroCascadaKms()`
1. Leer y sanitizar el valor de `#cobroCascadaKmsMonto`.
2. Validar que sea un entero finito $> 0$.
3. Validar que no supere `totalMaintPendiente`.
4. Ejecutar `applyFIFOPaymentToKmsHistory(currentHistory, monto)`.
5. Aplicar mutación atómica en Firestore:
   - `currentHistory = result.updatedHistory`.
   - `mutateHistoryCloud(...)`.
   - Si `result.maintAbonado > 0`: actualizar `#ahorroActual` y `saveSettingToCloudNow('ahorroActual', nuevoAhorro)`.
   - Si `result.kmsAcumulados > 0`: actualizar `#kmRecorridosCiclo` y `saveSettingToCloudNow('kmRecorridosCiclo', nuevosKms)`.
6. Refrescar interfaz con `renderHistorialFromData`.
7. Mostrar `showToast` con feedback de éxito.

---

## 6. Casos Borde y Manejo de Errores
- **Monto mayor al total adeudado:** Notificación `warning` preventiva sin alterar el estado.
- **Monto 0 o negativo:** Notificación `warning` solicitando un valor mayor a 0.
- **Historial sin registros o con todo en 0:** Bloque oculto automáticamente.
- **Interrupción o fallo de red:** Se sincroniza localmente en cola `offlineQueue` idéntico a las operaciones existentes de `saldarDeuda` y `guardarParcial`.
- **Mantenimiento parcial con gas intacto:** La tarjeta permanece en el historial con su `gas` inalterado y `maint` recalculado.

---

## 7. Plan de Pruebas Automatizadas
- **Suite unitaria:** `tests/kms-history-logic.test.js` probando:
  1. Liquidación de 1 registro completo con monto exacto.
  2. Liquidación de múltiples registros en orden cronológico (FIFO).
  3. Liquidación de registro antiguo + pago parcial del siguiente (caso de ejemplo del usuario: 2 de 50bs, pago de 70bs $\rightarrow$ salda el 1ero, deja el 2do en 30bs).
  4. Preservación intacta de los movimientos extras (`isExtra: true`).
  5. Manejo de montos mayores al total (debe mantenerse acotado).
- **Suite de integración:** Validación en `tests/integration-verify.js` de las funciones exportadas en `window`.
