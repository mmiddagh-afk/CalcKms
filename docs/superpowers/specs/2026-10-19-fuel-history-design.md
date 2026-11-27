# Especificación de Diseño: Histórico de Cargas de Gasolina

**Fecha:** 2026-10-19  
**Proyecto:** CalcKms (Mi Ahorro Vehicular)  
**Estado:** Aprobado  

---

## 1. Resumen Ejecutivo
Añadir un componente de historial compacto para registrar las últimas 5 cargas de gasolina directamente en la sección **Deudas y Extras** ([index.html](file:///e:/Webs%20Uber/CalcKms/index.html)), debajo del formulario de carga de combustible. Permite consultar fecha, hora y monto de cada carga, además de brindar la acción de eliminar un registro individual revirtiendo el saldo sumado a la deuda de combustible.

---

## 2. Requerimientos

### 2.1 Funcionales
- **Registro automático:** Toda carga realizada desde el input desktop/móvil `#cargaGasolina` o desde el Quick Sheet `#sheetCargaGasolina` genera una entrada en el histórico de cargas.
- **Límite de retención:** Se mantienen únicamente las últimas 5 cargas (FIFO - las más antiguas se descartan al superar 5).
- **Visualización:**
  - Ubicado en `#seccionDeudasExtras`, inmediatamente después de `#cargaGasolina` y antes de `#extraDesc` (Mov Extra).
  - Cada fila muestra: fecha y hora legibles (`DD MMM · HH:mm`), monto (`+$XX`) y botón para borrar.
  - Oculto si no existen cargas registradas.
- **Acción de reversión/borrado:**
  - Al pulsar el botón de borrar de un registro: confirmación con diálogo.
  - Al confirmar: se descuenta el monto de `currentDeudaCombustible` (permitiendo que quede en 0 o saldo a favor si correspondiese), se elimina el ítem del array y se actualiza la interfaz y el almacenamiento en la nube de forma atómica.

### 2.2 No Funcionales
- **Compatibilidad Offline / Multi-tab:** Integrado en la cola offline de Firestore (`offlineQueue`) y soporte reactivo en tiempo real (`onSnapshot`).
- **Persistencia atómica:** Guardar `deudaCombustible` y `historialCargasGas` juntos en el documento de `settings` para evitar inconsistencias de saldo en caso de desconexión intermedia.

---

## 3. Modelo de Datos y Arquitectura de Persistencia

### 3.1 Estructura en Firestore
En la colección/documento de `settings`:
```json
{
  "deudaCombustible": 50,
  "historialCargasGas": [
    {
      "id": 1729370000000,
      "monto": 25,
      "fecha": "19 oct",
      "hora": "16:35",
      "fechaISO": "2026-10-19"
    }
  ]
}
```

### 3.2 Normalización de Datos
Función `normalizeFuelHistoryItem(raw, fallbackId)`:
- `id`: Entero truncado (fallback `Date.now()`).
- `monto`: Número entero positivo > 0.
- `fecha`: String sanitizado.
- `hora`: String sanitizado.
- `fechaISO`: String formato `YYYY-MM-DD`.

Función `normalizeFuelHistoryArray(items)`:
- Asegura array válido.
- Desduplica IDs.
- Limita longitud máxima a 5 elementos.

---

## 4. Cambios en la Interfaz (UI)

### 4.1 En [index.html](file:///e:/Webs%20Uber/CalcKms/index.html)
Debajo del contenedor de `#cargaGasolina`:
```html
<div id="boxHistorialCargasGas" class="hidden py-3 border-b border-gray-50">
    <div class="flex items-center justify-between mb-2">
        <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <i data-lucide="history" class="w-3 h-3 text-blue-500"></i>
            Últimas cargas de gasolina
        </span>
        <span id="contadorCargasGas" class="text-[9px] font-bold text-gray-400 uppercase bg-gray-100 px-2 py-0.5 rounded-full">0/5</span>
    </div>
    <div id="listaHistorialCargasGas" class="space-y-1.5" role="list"></div>
</div>
```

---

## 5. Cambios en la Lógica ([script.js](file:///e:/Webs%20Uber/CalcKms/script.js))

1. **Estado en memoria:**
   - Variable `let currentFuelHistory = [];`
2. **Listener de Firestore (`setupRealtimeListeners`):**
   - Procesar `data.historialCargasGas` con `normalizeFuelHistoryArray`.
   - Llamar a `renderHistorialCargasGas(currentFuelHistory)`.
3. **Guardado en la nube:**
   - Helper `saveFuelStateToCloud(nuevaDeuda, nuevoHistorial)` que aplica `setDoc(settingsRef, { deudaCombustible: nuevaDeuda, historialCargasGas: nuevoHistorial }, { merge: true })`.
   - Soporte para `offlineQueue` en caso de pérdida de conexión (`enqueueOfflineOperation`).
4. **Función `cargarGasolina()`:**
   - Calcula `nuevaDeuda = deudaBase + monto`.
   - Inserta nueva entrada al inicio de `currentFuelHistory`.
   - Recorta con `slice(0, 5)`.
   - Llama a `saveFuelStateToCloud`.
5. **Función `borrarCargaGasolina(id)`:**
   - Diálogo de confirmación: `"¿Deseas eliminar esta carga de $X? Se restará de la deuda de combustible."`
   - Calcula `nuevaDeuda = currentDeudaCombustible - item.monto`.
   - Filtra el ítem de `currentFuelHistory`.
   - Llama a `saveFuelStateToCloud`.
   - Muestra toast informativo.
6. **Exposición global:**
   - `window.borrarCargaGasolina = borrarCargaGasolina;`
   - `window.renderHistorialCargasGas = renderHistorialCargasGas;`

---

## 6. Manejo de Errores y Casos Borde
- **Array vacío o inexistente en cuentas viejas:** Se inicializa en `[]` sin romper lectura ni UI.
- **Borrado cuando deuda es menor al monto:** Se permite saldo a favor (número negativo) ya soportado nativamente en `normalizeDeudaCombustibleMonto` y `actualizarUIDeudaCombustible`.
- **Offline:** La operación se encola en `calcKmsOfflineQueueV1` y se replica cuando vuelve el evento `online`.
- **Dispositivos móviles:** Reutiliza Lucide icons y respeta temas oscuro y claro sin alterar layouts existentes.
