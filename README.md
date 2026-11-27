# Mi Ahorro Vehicular (`CalcKms`)

App web para calcular el ahorro vehicular, el kilometraje diario, las cargas y deudas de combustible, el mantenimiento por desgaste y la rentabilidad neta, con sincronización en tiempo real mediante Firebase.

## Funcionalidades principales

- **Registro diario de kilómetros:** cálculo de ahorro según meta de kilometraje y seguimiento del ciclo actual.
- **Control de gasolina:** gestión de precio por litro, consumo, cargas realizadas, deuda de combustible e historial reciente.
- **Mantenimiento y desgaste del vehículo:** ahorro y seguimiento por componentes (llantas, frenos, aceite y extras) con pagos parciales y deducciones.
- **Ingresos y rentabilidad:** cálculo de ganancia libre frente a la meta de ganancia neta y deudas operativas.
- **Historial y edición:** listado de movimientos diarios, pagos de mantenimiento/combustible y edición o eliminación de registros.
- **Modo claro / oscuro y diseño adaptable:** interfaz responsiva con vista móvil tipo app y vista de escritorio.
- **Persistencia en la nube y soporte offline:** autenticación anónima y caché persistente con Firebase Firestore, más cola de sincronización local (`calcKmsOfflineQueueV1`).

## Stack tecnológico

- **Frontend:** HTML5 (`index.html`), Tailwind CSS (CDN), estilos propios (`styles.css`), iconos Lucide.
- **Lógica:** JavaScript vanilla con ES Modules (`script.js`).
- **Backend / Persistencia:** Firebase Auth y Cloud Firestore (SDK modular v11.6.1).
- **Despliegue:** estático (configurado para Netlify en `.netlify`).

## Estructura del proyecto

```text
CalcKms/
├── index.html      # Estructura de la aplicación y modales
├── styles.css      # Estilos personalizados y tema claro/oscuro
├── script.js       # Lógica de cálculo, UI y sincronización con Firebase
├── favicon.svg     # Ícono de la aplicación
├── icon.png        # Ícono adicional
└── tests/          # Pruebas unitarias y de integración en Node.js
```

## Uso local y configuracion de Firebase

1. Copia `firebase-config.example.js` como `firebase-config.js` en la raiz del proyecto:

```bash
cp firebase-config.example.js firebase-config.js
```

2. Completa `firebase-config.js` con las credenciales web de tu proyecto Firebase (Auth anonimo + Cloud Firestore habilitados). Ese archivo esta ignorado en `.gitignore` para no exponer tus credenciales en Git.

3. Al utilizar ES Modules, servi la carpeta raiz con cualquier servidor HTTP estatico, por ejemplo:

```bash
npx serve .
```

O con Python:

```bash
python -m http.server 8080
```

Luego abri la URL local en el navegador.

## Pruebas

Los archivos en `tests/` utilizan `node:assert/strict` y pueden ejecutarse con Node.js (por ejemplo, `node tests/fuel-history-logic.test.js`).
