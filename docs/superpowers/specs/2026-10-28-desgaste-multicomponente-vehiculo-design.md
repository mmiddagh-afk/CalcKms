# Especificación de Diseño: Desgaste Multicomponente y Modal de Vehículo

**Fecha:** 2026-10-28  
**Proyecto:** CalcKms (Mi Ahorro Vehicular)  
**Estado:** Listo para aprobación final  

---

## 1. Resumen Ejecutivo
Implementar en el módulo **Mantenimiento** (`#seccionMantenimiento` y `#seccionControlMant`) un sistema de **Desgaste Multicomponente** gestionado a través de un nuevo **Modal de Vehículo** (`#modalVehiculo`).

El conductor podrá configurar de forma independiente la reserva para 4 componentes clave:
1. **Llantas**
2. **Frenos**
3. **Cambio de Aceite**
4. **Extras** (imprevistos, amortiguación, batería, etc.)

Cada componente se define mediante:
- **Precio aproximado ($):** costo estimado del repuesto y mano de obra.
- **Vida útil / intervalo (KM):** distancia estimada tras la cual se debe realizar el reemplazo.

El sistema calcula la tasa individual de cada componente ($\text{precio} / \text{km}$) y consolida la suma de las 4 tasas en un único costo de desgaste por kilómetro. Dicha tasa combinada **reemplaza el cálculo manual de Costo Meta**, alimentando directamente la reserva diaria de mantenimiento en el Cierre del Día y proyectando el dinero esperado en el Control de Mantenimiento según los kilómetros acumulados en el ciclo.

---

## 2. Objetivos, No-Objetivos y Anti-Objetivos

### 2.1 Objetivos (Goals)
- Permitir la configuración paramétrica de los 4 componentes desde el Modal de Vehículo accesible desde `#seccionVehiculoInfo` y desde `#seccionMantenimiento`.
- Calcular en tiempo real la tasa por kilómetro individual ($\$/\text{km}$) de cada componente y la tasa total combinada.
- Reemplazar el cálculo manual estático de `metaMantenimiento` por la tasa dinámica derivada de los componentes, proyectando el "Debería tener" en función de los kilómetros reales recorridos en el ciclo.
- Persistir los valores en Firebase Firestore (colección `settings`) y almacenamiento local, con soporte offline transparente (cola offline).
- Mantener compatibilidad total tanto en la vista móvil (diseño ergonómico para pulgar) como en la vista modular de escritorio.

### 2.2 No-Objetivos (Non-Goals)
- No separar el dinero en 4 sobres o fondos independientes en Firebase: la recaudación diaria y el ahorro acumulado se mantienen en una sola bolsa unificada de Mantenimiento (`ahorroActual`), tal como definió el usuario.
- No alterar el flujo existente de cobro en cascada FIFO ni el descuento por emergencias, los cuales continúan deduciendo del fondo unificado.

### 2.3 Anti-Objetivos (Anti-Goals)
- No sobrecargar la tarjeta principal de Mantenimiento con 8 inputs visibles permanentes que rompan la jerarquía visual en celulares de pantalla pequeña.
- No bloquear al usuario si algún componente queda en 0 o vacío: cada componente es opcional y solo suma si tiene valores válidos ($>0$).
- No romper la persistencia offline ni causar regresiones en el cálculo del cierre diario ni del historial.

---

## 3. Enfoques Considerados y Selección

### Enfoque 1: Modal de Vehículo centralizado + Micro-resumen en Mantenimiento (Seleccionado)
- **Descripción:** La configuración vive en un modal accesible desde `#seccionVehiculoInfo` ("Mi Vehículo") y desde un botón en Mantenimiento. Mantenimiento muestra la tasa combinada calculada y el desglose de componentes.
- **Ventajas:** Mantiene limpio el espacio en pantalla; experiencia móvil de primera categoría; centraliza los datos del auto en su entidad lógica correspondiente.
- **Trade-off:** Requiere un clic para modificar las configuraciones de los componentes.

### Enfoque 2: Inputs directos inline en la tarjeta Mantenimiento
- **Descripción:** Incrustar los 8 campos dentro de `#seccionMantenimiento`.
- **Descartado:** Alarga drásticamente la tarjeta, estira el scroll móvil y compite visualmente con el Cierre del Día y los controles de ahorro.

---

## 4. Requerimientos Detallados

### 4.1 Requerimientos Funcionales

#### 4.1.1 Disparadores del Modal de Vehículo
- Clic en `#seccionVehiculoInfo` (tarjeta "Mi Vehículo" en la solapa Inicio).
- Clic en el botón `#btnConfigurarVehiculo` ubicado en `#seccionMantenimiento`.
- El modal se cierra con el botón "x", presionando la tecla `Escape` o haciendo clic en el backdrop oscuro.

#### 4.1.2 Estructura y Controles del Modal de Vehículo (`#modalVehiculo`)
- **Cabecera:** Icono de vehículo, título "Configuración de Vehículo" y subtítulo "Desgaste Multicomponente".
- **4 Secciones de Componentes:**
  - **Llantas:** Inputs `#vehiculoLlantasPrecio` ($) y `#vehiculoLlantasKm` (KM). Tasa en vivo: `#vehiculoLlantasTasa`.
  - **Frenos:** Inputs `#vehiculoFrenosPrecio` ($) y `#vehiculoFrenosKm` (KM). Tasa en vivo: `#vehiculoFrenosTasa`.
  - **Cambio de Aceite:** Inputs `#vehiculoAceitePrecio` ($) y `#vehiculoAceiteKm` (KM). Tasa en vivo: `#vehiculoAceiteTasa`.
  - **Extras:** Inputs `#vehiculoExtrasPrecio` ($) y `#vehiculoExtrasKm` (KM). Tasa en vivo: `#vehiculoExtrasTasa`.
- **Resumen al pie del Modal:**
  - Badge con el **Costo Total por KM:** `#vehiculoTotalTasaKm` (`$X.XX / km`).
  - Proyección de ahorro para el ciclo actual (ej. 5.000 km): `#vehiculoTotalProyeccionCiclo`.
- **Botón de Guardar:** `#btnGuardarVehiculo` con feedback táctil y toast informativo.

#### 4.1.3 Lógica Matemática (Función Pura)
Para cada componente $i \in \{\text{llantas}, \text{frenos}, \text{aceite}, \text{extras}\}$:
$$\text{tasa}_i = \begin{cases} \frac{\text{precio}_i}{\text{km}_i} & \text{si } \text{precio}_i > 0 \text{ y } \text{km}_i > 0 \\ 0 & \text{en otro caso} \end{cases}$$

Tasa total combinada:
$$\text{tasaTotal} = \sum_{i} \text{tasa}_i$$

Integración con Mantenimiento en `calcular()`:
- Si $\text{tasaTotal} > 0$:
  - Meta proyectada del ciclo para el Control de Mantenimiento:
    $$\text{metaMantenimientoProyectada} = \text{kmMeta} \times \text{tasaTotal}$$
  - Condición de tope de ahorro:
    - Si $\text{ahorroActual} \ge \text{metaMantenimientoProyectada}$:
      - `ahorroMantenimientoPorKm = 0` (se frena la separación diaria de mantenimiento para que no siga descontando de la ganancia libre del día).
      - Se activa el badge `#msgMetaAlcanzada` ("Meta OK").
    - Si $\text{ahorroActual} < \text{metaMantenimientoProyectada}$:
      - `ahorroMantenimientoPorKm = tasaTotal` (se descuenta la cuota de desgaste correspondiente por cada km recorrido hoy).
  - El ahorro esperado acumulado ("Debería tener"):
    $$\text{ahorroEsperado} = \text{kmRecorridosCiclo} \times \text{tasaTotal}$$
  - La diferencia o balance ("Superávit" / "Déficit"):
    $$\text{diferenciaAhorro} = \text{ahorroActual} - \text{ahorroEsperado}$$
- Si $\text{tasaTotal} == 0$ (sin componentes configurados):
  - Fallback al comportamiento anterior usando `metaMantenimiento` manual si existe.

#### 4.1.4 Persistencia y Sincronización
- Nuevas claves en `settingsInputs`:
  - `vehiculoLlantasPrecio`, `vehiculoLlantasKm`
  - `vehiculoFrenosPrecio`, `vehiculoFrenosKm`
  - `vehiculoAceitePrecio`, `vehiculoAceiteKm`
  - `vehiculoExtrasPrecio`, `vehiculoExtrasKm`
- Al guardar desde el modal o editar los inputs, se persiste de inmediato en Firebase mediante `setDoc(settingsRef, ..., { merge: true })` y en caso de desconexión se encola en `offlineQueue`.
- El listener en tiempo real (`onSnapshot`) hidrata automáticamente los valores al sincronizar entre dispositivos o al recargar la app.

#### 4.1.5 Reflejo Visual en Mantenimiento (`#seccionMantenimiento`)
- Una pastilla informativa con el desglose rápido de los 4 componentes (micro-etiquetas con el aporte por km de cada uno).
- Botón "Ajustar componentes" que reabre el modal para editar.
- Actualización automática del micro-badge móvil `moduleValueMaint` indicando el estado del fondo.

### 4.2 Decisiones de Arquitectura del Constructor (Builder Calls)
Tras la revisión técnica del diseño, se definieron los siguientes criterios para garantizar robustez y evitar regresiones:

1. **Descuento por Emergencia (`aplicarDescuentoMantenimiento`):**
   - Al estar activo el Desgaste Multicomponente, descontar un gasto o emergencia reduce directamente el fondo físico acumulado (`ahorroActual`). La tasa por km intrínseca del auto no cambia ante una reparación puntual. En modo manual de respaldo (sin componentes), se mantiene la deducción dual histórica (`ahorroActual` y `metaMantenimiento`).
2. **Convivencia del campo `#metaMantenimiento`:**
   - Cuando hay componentes configurados, el campo manual queda oculto o en modo solo lectura mostrando la **Meta Proyectada del Ciclo** ($\text{kmMeta} \times \text{tasaTotal}$), con un badge que indica *"Calculado por componentes"*. No sobreescribe el valor manual histórico en Firestore para que el usuario no pierda su respaldo si algún día limpia los componentes.
3. **Persistencia del Modal de Vehículo:**
   - Los campos calculan la tasa en vivo mientras el usuario teclea. Al presionar `#btnGuardarVehiculo`, se persisten los 8 valores de inmediato en Firestore (`saveSettingToCloudNow`), se despacha haptic feedback y toast de confirmación, y se refresca `calcular()`.
4. **Distancia de proyección del ciclo:**
   - La proyección de ciclo en el modal y en Mantenimiento se sincroniza con `#kmMeta` (por defecto 5.000 km), garantizando coherencia con el odómetro del ciclo actual.

---

## 5. Pruebas y Criterios de Aceptación
1. **Tests unitarios:**
   - Cálculo correcto de tasas individuales y tasa total con valores enteros, decimales y ceros.
   - Manejo seguro de divisiones por cero o valores negativos (debe retornar 0 sin lanzar excepciones).
   - Proyección correcta de meta y ahorro esperado según los kilómetros del ciclo.
2. **Tests de integración UI:**
   - Apertura del modal al pulsar `#seccionVehiculoInfo` y `#btnConfigurarVehiculo`.
   - Cierre con Escape, backdrop y botón "x".
   - Persistencia de los 8 campos y actualización en tiempo real de `calcular()`, `ahorroMantenimientoPorKm`, `gastoMantenimientoHoy` y el cierre del día.
   - Modo oscuro consistente con el resto de la aplicación.
