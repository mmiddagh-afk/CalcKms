# Especificación de Diseño: Descuento de Ahorro y Costo Meta de Mantenimiento por Emergencias

**Fecha:** 2026-10-21  
**Proyecto:** CalcKms (Mi Ahorro Vehicular)  
**Estado:** Aprobado  

---

## 1. Resumen Ejecutivo
Implementar un control directo en la tarjeta de **Mantenimiento** (`#seccionMantenimiento`) que permita registrar gastos o imprevistos mecánicos y de emergencia. Al aplicar un descuento, el importe se deduce simultáneamente de dos lugares:
1. Del **Ahorro Acumulado** (`ahorroActual`), reflejando la salida real del dinero físico en sobre.
2. Del **Costo Meta** (`metaMantenimiento`), dado que dicho gasto ya estaba contemplado en el presupuesto total del ciclo de mantenimiento.

Esta deducción mantiene inalterado el faltante neto de ahorro que resta por cubrir en los kilómetros restantes del ciclo y recalcula de inmediato todas las métricas, cuota por km y barras de progreso.

---

## 2. Requerimientos

### 2.1 Requerimientos Funcionales
- **Entrada Directa en Tarjeta:**
  - Un campo numérico `#descuentoMantenimiento` con `placeholder="0"` y `inputmode="numeric"`.
  - Un botón de acción rápida `#btnDescontarMantenimiento` con texto "Descontar" ubicado en una fila dedicada al pie de `#seccionMantenimiento` (debajo de *KM Recorridos*).
- **Atajo de Teclado:**
  - Al presionar `Enter` en el campo `#descuentoMantenimiento`, se dispara la acción de descuento de forma idéntica a hacer clic en el botón.
- **Regla Contable / Modelo Matemático:**
  - El monto ingresado $D > 0$ se resta de:
    - $\text{Ahorro Nuevo} = \max(0, \text{ahorroActual} - D)$
    - $\text{Costo Meta Nuevo} = \max(0, \text{metaMantenimiento} - D)$
- **Validaciones y Seguridad:**
  - Si el monto ingresado es vacío, $\le 0$ o no numérico: se muestra un toast de advertencia `"Ingresá un monto válido mayor a $0."` y se aborta la operación.
  - Si el monto a descontar supera el ahorro acumulado actual ($D > \text{ahorroActual}$): se solicita confirmación preventiva al usuario mediante diálogo nativo (`confirm`), advirtiendo que el gasto supera el ahorro en mano y dejará el fondo en $\$0$. Si el usuario cancela, no se realiza ningún cambio.
- **Persistencia en la Nube y Almacenamiento Local:**
  - Se persisten de inmediato los nuevos valores de `ahorroActual` y `metaMantenimiento` usando `saveSettingToCloudNow`, garantizando soporte offline mediante la cola persistente del sistema (`offlineQueue`).
- **Recálculo y Reactividad:**
  - Una vez actualizados los valores en el DOM y disparada la persistencia, se invoca `calcular()` para refrescar en tiempo real:
    - Barra y porcentaje de ahorro (`barraAhorro`, `ctrlAhorroActual`, `ctrlAhorroMeta`).
    - Cuota por km de mantenimiento (`ahorroMantenimientoPorKm`).
    - Sección de balance y control (`seccionControlMant`).
    - Badge de navegación móvil (`moduleValueMaint`).
  - Se limpia el input `#descuentoMantenimiento`.
- **Feedback Sensorial:**
  - Haptic feedback mediante `navigator.vibrate?.(10)`.
  - Toast de éxito: `"Descontados $X de mantenimiento."`.
- **Despliegue a Producción:**
  - Una vez implementado y verificado con tests, realizar el deploy a Netlify (`netlify deploy --prod --dir=.` o `git push origin main`), confirmando que la versión quede publicada en vivo.

### 2.2 Requerimientos No Funcionales
- **Función Pura Desacoplada:** La lógica matemática debe aislarse en una función pura `calculateMaintenanceDeduction(currentSavings, currentGoal, deductionAmount)` para facilitar tests unitarios exhaustivos sin dependencias del DOM ni de Firebase.
- **Integridad Visual:** Uso estricto de clases utilitarias existentes (`input-calc`, variables dark mode, bordes y transiciones de Tailwind) preservando la coherencia estilística.
- **Prevención de Doble Envío:** Deshabilitar temporalmente el botón `#btnDescontarMantenimiento` durante la ejecución asíncrona de la persistencia.

---

## 3. Arquitectura y Modelo de Datos

### 3.1 Función Pura de Deducción
```javascript
/**
 * Calcula los nuevos montos de ahorro y costo meta tras un gasto o emergencia.
 * @param {number} currentSavings - Ahorro acumulado actual (ahorroActual).
 * @param {number} currentGoal - Presupuesto meta actual (metaMantenimiento).
 * @param {number} deductionAmount - Monto del gasto/emergencia a descontar.
 * @returns {{ newSavings: number, newGoal: number, deducted: number }}
 */
function calculateMaintenanceDeduction(currentSavings, currentGoal, deductionAmount) {
    const validDeduction = Math.max(0, toFiniteNumber(deductionAmount, 0));
    if (validDeduction <= 0) {
        return {
            newSavings: Math.max(0, toFiniteNumber(currentSavings, 0)),
            newGoal: Math.max(0, toFiniteNumber(currentGoal, 0)),
            deducted: 0
        };
    }
    const savings = Math.max(0, toFiniteNumber(currentSavings, 0));
    const goal = Math.max(0, toFiniteNumber(currentGoal, 0));

    return {
        newSavings: Math.max(0, savings - validDeduction),
        newGoal: Math.max(0, goal - validDeduction),
        deducted: validDeduction
    };
}
```

### 3.2 Función de Interacción y Persistencia
```javascript
async function aplicarDescuentoMantenimiento() {
    const inputDescuento = document.getElementById('descuentoMantenimiento');
    if (!inputDescuento) return;

    const montoDescuento = parseFloat(inputDescuento.value);
    if (!Number.isFinite(montoDescuento) || montoDescuento <= 0) {
        showToast('Ingresá un monto válido mayor a $0.', 'warning');
        return;
    }

    const ahorroActual = getInputVal('ahorroActual');
    const metaMantenimiento = getInputVal('metaMantenimiento');

    if (montoDescuento > ahorroActual && ahorroActual > 0) {
        const confirmar = confirm(
            `El gasto (${formatTotal(montoDescuento)}) supera el ahorro acumulado (${formatTotal(ahorroActual)}).\n¿Deseas descontar y dejar el fondo en $0?`
        );
        if (!confirmar) return;
    }

    const { newSavings, newGoal } = calculateMaintenanceDeduction(ahorroActual, metaMantenimiento, montoDescuento);

    const btn = document.getElementById('btnDescontarMantenimiento');
    if (btn) btn.disabled = true;

    try {
        navigator.vibrate?.(10);

        const inputAhorro = document.getElementById('ahorroActual');
        const inputMeta = document.getElementById('metaMantenimiento');
        if (inputAhorro) inputAhorro.value = newSavings;
        if (inputMeta) inputMeta.value = newGoal;

        await Promise.all([
            saveSettingToCloudNow('ahorroActual', newSavings),
            saveSettingToCloudNow('metaMantenimiento', newGoal)
        ]);

        inputDescuento.value = '';
        calcular();
        showToast(`Descontados ${formatTotal(montoDescuento)} de mantenimiento.`, 'success');
    } catch (err) {
        console.error('Error aplicando descuento de mantenimiento:', err);
        showToast('Error al persistir el descuento.', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}
```

---

## 4. Estructura UI y Componentes en el DOM

### 4.1 Fragmento HTML en `#seccionMantenimiento` (dentro de `index.html`)
Debajo del bloque `KM Recorridos`:
```html
<div class="flex items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-slate-800">
    <div class="flex items-center gap-1.5">
        <i data-lucide="circle-minus" class="w-3.5 h-3.5 text-amber-500"></i>
        <span class="text-xs text-gray-400 dark:text-slate-400">Gasto / Emergencia</span>
    </div>
    <div class="flex items-center gap-1.5">
        <span class="text-xs text-gray-400">$</span>
        <input type="number" id="descuentoMantenimiento" placeholder="0" inputmode="numeric"
            class="input-calc text-xs font-bold text-gray-700 dark:text-slate-200 text-right bg-transparent outline-none w-16 border-b border-gray-200 dark:border-slate-700 focus:border-amber-500">
        <button type="button" id="btnDescontarMantenimiento" onclick="aplicarDescuentoMantenimiento()"
            class="px-2.5 py-1 text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 dark:text-amber-300 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 rounded-lg active:scale-95 transition-all">
            Descontar
        </button>
    </div>
</div>
```

---

## 5. Casos Borde y Manejo de Errores

| Caso Borde | Comportamiento Esperado |
|---|---|
| Input vacío o con texto no numérico | Toast advertencia: `"Ingresá un monto válido mayor a $0."`, sin alteración de datos. |
| Monto $\le 0$ | Toast advertencia y sin cambios. |
| Monto mayor al ahorro acumulado ($D > \text{ahorroActual}$) | Diálogo de confirmación. Si confirma: `ahorroActual = 0` y `metaMantenimiento = \max(0, meta - D)`. Si cancela: aborta. |
| Monto mayor al costo meta ($D > \text{metaMantenimiento}$) | El costo meta se limita a $0$ mediante `Math.max(0, ...)`, sin permitir montos negativos. |
| Desconexión a internet / modo offline | `saveSettingToCloudNow` encola la mutación en `offlineQueue` y el recálculo local se efectúa con éxito. |
| Presión de tecla `Enter` en `#descuentoMantenimiento` | Ejecuta `aplicarDescuentoMantenimiento()` sin requerir click manual. |

---

## 6. Estrategia de Testing
- **Test Unitario:** Agregar suite en `tests/maintenance-deduction.test.js` (o suite de integración equivalente en el proyecto) verificando:
  1. Deducción estándar ($580 ahorro, $1390 meta, descuento de $80 -> $500 ahorro, $1310 meta).
  2. Deducción parcial con ahorro menor al descuento ($100 ahorro, $500 meta, descuento $150 -> $0 ahorro, $350 meta).
  3. Valores inválidos (negativos, cero, strings).
- **Test de Interacción DOM:** Verificar que al invocar la función con el elemento en el DOM se actualicen los inputs, se limpie el campo y se invoque `calcular()`.
