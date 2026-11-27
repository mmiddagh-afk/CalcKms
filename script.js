import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, onSnapshot, setDoc, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

function resolveFirebaseConfig() {
    const raw = typeof __firebase_config !== 'undefined'
        ? __firebase_config
        : (typeof window !== 'undefined' ? window.__firebase_config : undefined);
    if (!raw) return null;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!parsed || typeof parsed !== 'object') return null;
        if (!parsed.apiKey || !parsed.projectId || String(parsed.apiKey).startsWith('TU_')) {
            return null;
        }
        return parsed;
    } catch (error) {
        console.error('Configuracion de Firebase invalida:', error);
        return null;
    }
}

const firebaseConfig = resolveFirebaseConfig();
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app';
const app = firebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
let db = null;
if (app) {
    try {
        db = initializeFirestore(app, {
            localCache: persistentLocalCache({
                tabManager: persistentMultipleTabManager()
            })
        });
    } catch (error) {
        console.warn('Fallback a getFirestore (persistencia offline no disponible):', error);
        db = getFirestore(app);
    }
}
const themeStorageKey = 'calcKmsThemeMode';

let currentUser = null;
let currentStorageId = null;
let unsubscribeSettings = null;
let unsubscribeHistory = null;
let currentHistory = [];
let currentDeudaCombustible = 0;
let currentFuelHistory = [];
let editId = null;
let parcialId = null;
let parcialCategoria = null;
let editExtraId = null;
let lastHistoryHash = '';
let currentGasTotal = 0;
let currentMaintTotal = 0;
let currentGrandTotal = 0;
let prevGrandTotal = 0;
let firebaseReady = false;

const inputSaveTimeouts = {};
const offlineQueueKey = 'calcKmsOfflineQueueV1';
let offlineQueue = [];
let offlineSyncInProgress = false;
let lastHistoryWriteMode = 'cloud';
const settingsInputs = [
    'precioLitro', 'consumo', 'kmMeta', 'metaMantenimiento', 'ahorroActual', 'kmRecorridosCiclo', 'deudaCombustible', 'deudaUber', 'metaGananciaNeta', 'historialCargasGas',
    'vehiculoLlantasPrecio', 'vehiculoLlantasKm', 'vehiculoLlantasAhorrado',
    'vehiculoFrenosPrecio', 'vehiculoFrenosKm', 'vehiculoFrenosAhorrado',
    'vehiculoAceitePrecio', 'vehiculoAceiteKm', 'vehiculoAceiteAhorrado',
    'vehiculoExtrasPrecio', 'vehiculoExtrasKm', 'vehiculoExtrasAhorrado'
];
const settingsInputSet = new Set(settingsInputs);

const htmlEscapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => htmlEscapeMap[c]);
const sanitizeStorageId = (id) => String(id ?? '').trim().replace(/[^a-zA-Z0-9-_]/g, '_');
const getCurrentUserStorageId = () => (currentUser ? sanitizeStorageId(currentUser.uid) : null);
const toFiniteNumber = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

const currencyFormatter = new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const totalFormatter = new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const formatCurrency = (val) => currencyFormatter.format(val);
const formatTotal = (val) => totalFormatter.format(Math.round(val));

let currentThemeMode = 'light';

function updateThemeButtonsUI() {
    const lightBtn = document.getElementById('themeLightBtn');
    const darkBtn = document.getElementById('themeDarkBtn');
    if (lightBtn) lightBtn.classList.toggle('active', currentThemeMode === 'light');
    if (darkBtn) darkBtn.classList.toggle('active', currentThemeMode === 'dark');

    const toggleBtn = document.getElementById('themeToggleBtn');
    if (toggleBtn) {
        toggleBtn.innerHTML = currentThemeMode === 'dark'
            ? '<i data-lucide="sun" class="w-5 h-5 text-amber-400"></i>'
            : '<i data-lucide="moon" class="w-5 h-5 text-gray-600"></i>';
        toggleBtn.setAttribute('title', currentThemeMode === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: toggleBtn });
    }
}

function toggleThemeMode() {
    const nextMode = currentThemeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(nextMode);
}

function applyThemeMode(mode) {
    const normalized = mode === 'dark' ? 'dark' : 'light';
    currentThemeMode = normalized;
    document.body.classList.toggle('theme-dark', normalized === 'dark');
    document.documentElement.classList.toggle('theme-dark', normalized === 'dark');
    updateThemeButtonsUI();
}

function getSavedThemeMode() {
    try {
        const raw = localStorage.getItem(themeStorageKey);
        if (raw === 'dark' || raw === 'light') return raw;
    } catch (error) {
        console.warn('No se pudo leer tema local:', error);
    }
    return 'light';
}

function setThemeMode(mode) {
    const normalized = mode === 'dark' ? 'dark' : 'light';
    applyThemeMode(normalized);
    try {
        localStorage.setItem(themeStorageKey, normalized);
    } catch (error) {
        console.warn('No se pudo guardar tema local:', error);
    }
}

function getToastContainer() {
    let container = document.getElementById('toastContainer');
    if (container) return container;

    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
}

function closeToastElement(toastEl) {
    if (!toastEl || toastEl.dataset.closing === '1') return;
    toastEl.dataset.closing = '1';
    toastEl.classList.remove('app-toast-show');
    setTimeout(() => toastEl.remove(), 240);
}

function showToast(message, type = 'info', options = {}) {
    const text = String(message ?? '').trim();
    if (!text) return;

    const normalizedType = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';
    const duration = Number.isFinite(Number(options.duration)) ? Number(options.duration) : (normalizedType === 'error' ? 5200 : 3200);
    const safeDuration = Math.max(1400, duration);
    const container = getToastContainer();

    const toast = document.createElement('div');
    toast.className = `app-toast app-toast-${normalizedType}`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', normalizedType === 'error' ? 'assertive' : 'polite');

    const messageEl = document.createElement('div');
    messageEl.className = 'app-toast-message';
    messageEl.textContent = text;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'app-toast-close';
    closeBtn.setAttribute('aria-label', 'Cerrar notificacion');
    closeBtn.textContent = 'x';
    closeBtn.addEventListener('click', () => closeToastElement(toast));

    toast.appendChild(messageEl);
    toast.appendChild(closeBtn);
    container.appendChild(toast);

    window.requestAnimationFrame(() => toast.classList.add('app-toast-show'));

    let timer = setTimeout(() => closeToastElement(toast), safeDuration);
    toast.addEventListener('mouseenter', () => clearTimeout(timer));
    toast.addEventListener('mouseleave', () => {
        clearTimeout(timer);
        timer = setTimeout(() => closeToastElement(toast), 1400);
    });
}

function resolveActionButton(target) {
    if (!target) return null;
    if (target instanceof HTMLElement) return target;
    if (typeof target === 'string') return document.querySelector(target);
    return null;
}

function rememberButtonOriginalState(button) {
    if (!button || button.dataset.feedbackOriginalHtml) return;
    button.dataset.feedbackOriginalHtml = button.innerHTML;
    button.dataset.feedbackOriginalClass = button.className;
    button.dataset.feedbackOriginalDisabled = button.disabled ? '1' : '0';
}

function restoreButtonOriginalState(button) {
    if (!button?.dataset.feedbackOriginalHtml) return;
    button.innerHTML = button.dataset.feedbackOriginalHtml;
    button.className = button.dataset.feedbackOriginalClass || button.className;
    button.disabled = button.dataset.feedbackOriginalDisabled === '1';
    button.removeAttribute('aria-busy');
    delete button.dataset.actionState;
    delete button.dataset.feedbackOriginalHtml;
    delete button.dataset.feedbackOriginalClass;
    delete button.dataset.feedbackOriginalDisabled;
    delete button.dataset.feedbackRestoreTimer;
    if (typeof lucide !== 'undefined' && button.querySelector?.('[data-lucide]')) lucide.createIcons({ root: button });
}

function setActionButtonState(button, state, label) {
    if (!button) return;
    rememberButtonOriginalState(button);
    button.dataset.actionState = state;
    button.disabled = state === 'loading';
    button.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
    button.classList.add('action-feedback-btn');
    const safeLabel = escapeHtml(label || 'Procesando...');
    button.innerHTML = `<span class="action-feedback-indicator" aria-hidden="true"></span><span>${safeLabel}</span>`;
}

function scheduleButtonRestore(button, delay = 1200) {
    if (!button) return;
    const previousTimer = Number(button.dataset.feedbackRestoreTimer);
    if (previousTimer) window.clearTimeout(previousTimer);
    const timer = window.setTimeout(() => restoreButtonOriginalState(button), delay);
    button.dataset.feedbackRestoreTimer = String(timer);
}

const inFlightActions = new Set();

async function runActionWithFeedback(buttonTarget, labels, action, actionKey) {
    const key = actionKey || (typeof buttonTarget === 'string' ? buttonTarget : (buttonTarget?.id || buttonTarget?.getAttribute?.('onclick') || buttonTarget?.dataset?.action || 'anonymous_action'));
    if (inFlightActions.has(key)) {
        return { feedbackMode: 'skipped' };
    }
    inFlightActions.add(key);

    const button = resolveActionButton(buttonTarget);
    const copy = {
        loading: 'Guardando...',
        success: 'Guardado',
        pending: 'Pendiente offline',
        error: 'Error',
        ...labels
    };

    setActionButtonState(button, 'loading', copy.loading);
    try {
        const result = await action();
        const state = result?.feedbackMode === 'pending' ? 'pending' : 'success';
        setActionButtonState(button, state, copy[state]);
        scheduleButtonRestore(button, state === 'pending' ? 1800 : 1100);
        return result;
    } catch (error) {
        console.error('Accion fallida:', error);
        setActionButtonState(button, 'error', copy.error);
        scheduleButtonRestore(button, 1600);
        throw error;
    } finally {
        inFlightActions.delete(key);
    }
}

function feedbackModeFromWriteModes(...modes) {
    return modes.includes('queued') || modes.includes('unavailable') ? 'pending' : 'success';
}

function updateMetricText(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    const nextValue = String(value);
    if (el.textContent === nextValue) return;
    el.textContent = nextValue;
    el.classList.remove('metric-value-updated');
    void el.offsetWidth;
    el.classList.add('metric-value-updated');
}

function getLocalISODate(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getHistoryDateKey(item) {
    const iso = String(item?.fechaISO ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;

    const fecha = String(item?.fecha ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f.]/g, '')
        .trim();
    const match = fecha.match(/^(\d{1,2})\s+([a-z]+)/);
    if (!match) return null;

    const months = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12, dec: 12 };
    const day = Number(match[1]);
    const month = months[match[2]];
    if (!day || !month) return null;
    return `${new Date().getFullYear()}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function dateKeyToUtcTime(dateKey) {
    const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function parseMoneyInput(rawValue) {
    const text = String(rawValue ?? '').trim();
    if (!text) return null;

    let normalized = text.replace(/\s+/g, '');
    let sign = '';
    if (normalized.startsWith('-')) {
        sign = '-';
        normalized = normalized.slice(1);
    }
    if (!normalized) return null;

    const hasComma = normalized.includes(',');
    const hasDot = normalized.includes('.');

    if (hasComma && hasDot) {
        normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
            ? normalized.replace(/\./g, '').replace(/,/g, '.')
            : normalized.replace(/,/g, '');
    } else if (hasComma) {
        const commaCount = (normalized.match(/,/g) || []).length;
        if (commaCount > 1) {
            normalized = normalized.replace(/,/g, '');
        } else {
            const [left = '', right = ''] = normalized.split(',');
            const looksLikeThousands = /^\d+$/.test(left) && /^\d+$/.test(right) && right.length === 3;
            normalized = looksLikeThousands ? `${left}${right}` : `${left}.${right}`;
        }
    } else if (hasDot) {
        const dotCount = (normalized.match(/\./g) || []).length;
        if (dotCount > 1) {
            normalized = normalized.replace(/\./g, '');
        } else {
            const [left = '', right = ''] = normalized.split('.');
            const looksLikeThousands = /^\d+$/.test(left) && /^\d+$/.test(right) && right.length === 3;
            if (looksLikeThousands) normalized = `${left}${right}`;
        }
    }

    const value = Number(sign + normalized);
    return Number.isFinite(value) ? value : null;
}

function normalizeDeudaCombustibleMonto(rawValue, allowZero = false, allowNegative = false) {
    const parsed = parseMoneyInput(rawValue);
    if (parsed === null) return null;

    const rounded = Math.round(parsed);
    if (!Number.isFinite(rounded)) return null;
    if (allowNegative) return rounded;
    if (allowZero ? rounded < 0 : rounded <= 0) return null;

    return rounded;
}

function updateText(id, val) {
    const el = document.getElementById(id);
    const strVal = String(val);
    if (el && el.textContent !== strVal) el.textContent = strVal;
}

function toggleBox(id, show) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('hidden', !show);
}

function getInputVal(id, fallback = 0) {
    const el = document.getElementById(id);
    return el ? (parseFloat(el.value) || fallback) : fallback;
}

function normalizeHistoryItem(raw, fallbackId = Date.now()) {
    const item = raw && typeof raw === 'object' ? raw : {};
    const parsedId = Number(item.id);
    const id = Number.isFinite(parsedId) ? Math.trunc(parsedId) : Math.trunc(fallbackId);
    const gas = Math.round(toFiniteNumber(item.gas, 0));
    const maint = Math.round(toFiniteNumber(item.maint, 0));
    const isExtra = Boolean(item.isExtra);
    return {
        ...item,
        id,
        gas,
        maint,
        total: isExtra ? Math.round(toFiniteNumber(item.total, gas + maint)) : (gas + maint),
        kms: Math.max(0, Math.round(toFiniteNumber(item.kms, 0))),
        horas: Math.max(0, Math.round(toFiniteNumber(item.horas, 0) * 100) / 100),
        ingresos: Math.round(toFiniteNumber(item.ingresos, 0)),
        fechaISO: String(item.fechaISO ?? '').trim(),
        fecha: String(item.fecha ?? '').trim(),
        hora: String(item.hora ?? '').trim(),
        descripcion: String(item.descripcion ?? '').trim().slice(0, 120),
        isExtra
    };
}

function normalizeHistoryArray(items) {
    if (!Array.isArray(items)) return [];
    const used = new Set();
    return items.map((it, i) => normalizeHistoryItem(it, Date.now() + i)).map((it) => {
        let id = it.id;
        while (used.has(id)) id += 1;
        used.add(id);
        return id === it.id ? it : { ...it, id };
    });
}

function normalizeFuelHistoryItem(raw, fallbackId = Date.now()) {
    const item = raw && typeof raw === 'object' ? raw : {};
    const parsedId = Number(item.id);
    const id = Number.isFinite(parsedId) ? Math.trunc(parsedId) : Math.trunc(fallbackId);
    const monto = Math.max(0, Math.round(Number(item.monto) || 0));
    return {
        id,
        monto,
        fecha: String(item.fecha ?? '').trim(),
        hora: String(item.hora ?? '').trim(),
        fechaISO: String(item.fechaISO ?? '').trim()
    };
}

function normalizeFuelHistoryArray(items) {
    if (!Array.isArray(items)) return [];
    const used = new Set();
    const result = [];
    for (let i = 0; i < items.length; i++) {
        const it = normalizeFuelHistoryItem(items[i], Date.now() + i);
        if (it.monto <= 0) continue;
        let id = it.id;
        while (used.has(id)) id += 1;
        used.add(id);
        result.push(id === it.id ? it : { ...it, id });
        if (result.length >= 5) break;
    }
    return result;
}

function applyFIFOPaymentToFuelHistory(items, paymentAmount) {
    if (!Array.isArray(items) || items.length === 0) return [];
    let remPago = Math.max(0, Math.round(Number(paymentAmount) || 0));
    if (remPago <= 0) return normalizeFuelHistoryArray(items);

    // Los ítems están ordenados de más reciente a más antiguo (índice 0 = más reciente).
    // FIFO consume primero las cargas más antiguas (desde el final hacia el principio).
    const reversed = [...items].reverse();
    const nextReversed = [];

    for (const item of reversed) {
        if (remPago <= 0) {
            nextReversed.push(item);
            continue;
        }
        const itemMonto = Math.max(0, Math.round(Number(item.monto) || 0));
        if (remPago >= itemMonto) {
            remPago -= itemMonto;
            // La carga queda completamente saldada y se elimina
        } else {
            const nuevoMonto = itemMonto - remPago;
            remPago = 0;
            nextReversed.push({ ...item, monto: nuevoMonto });
        }
    }

    return normalizeFuelHistoryArray(nextReversed.reverse());
}

function applyFIFOPaymentToKmsHistory(items, paymentAmount) {
    if (!Array.isArray(items) || items.length === 0) {
        return { updatedHistory: [], saldadosCount: 0, kmsAcumulados: 0, maintAbonado: 0, parcialAplicado: false };
    }

    let remPago = Math.max(0, Math.round(Number(paymentAmount) || 0));
    if (remPago <= 0) {
        return { updatedHistory: [...items], saldadosCount: 0, kmsAcumulados: 0, maintAbonado: 0, parcialAplicado: false };
    }

    let saldadosCount = 0;
    let kmsAcumulados = 0;
    let maintAbonado = 0;
    let parcialAplicado = false;

    // Procesar los registros en orden FIFO (del más antiguo al más reciente)
    // En items (currentHistory), los más antiguos están al principio (índice 0).
    const updatedHistory = [];

    for (const item of items) {
        // Los movimientos extras no se tocan
        if (item.isExtra) {
            updatedHistory.push(item);
            continue;
        }

        const itemMaint = Math.max(0, Math.round(Number(item.maint) || 0));
        if (itemMaint === 0 || remPago <= 0) {
            updatedHistory.push(item);
            continue;
        }

        if (remPago >= itemMaint) {
            // El registro queda completamente saldado
            remPago -= itemMaint;
            maintAbonado += itemMaint;
            kmsAcumulados += Math.max(0, Math.round(Number(item.kms) || 0));
            saldadosCount++;
            // Se omite de updatedHistory porque se saldó y eliminó
        } else {
            // Cobro parcial sobre este registro
            const nuevoMaint = itemMaint - remPago;
            maintAbonado += remPago;
            remPago = 0;
            parcialAplicado = true;
            const gas = Math.max(0, Math.round(Number(item.gas) || 0));
            const nuevoTotal = gas + nuevoMaint;
            updatedHistory.push({
                ...item,
                maint: nuevoMaint,
                total: nuevoTotal
            });
        }
    }

    return {
        updatedHistory,
        saldadosCount,
        kmsAcumulados,
        maintAbonado,
        parcialAplicado
    };
}

/**
 * Calcula los nuevos montos de ahorro y costo meta tras un gasto o emergencia.
 * @param {number} currentSavings - Ahorro acumulado actual (ahorroActual).
 * @param {number} currentGoal - Presupuesto meta actual (metaMantenimiento).
 * @param {number} deductionAmount - Monto del gasto/emergencia a descontar.
 * @returns {{ newSavings: number, newGoal: number, deducted: number }}
 */
/**
 * Calcula la tasa de desgaste por km para un componente individual ($/km).
 * @param {number} precio - Precio aproximado del componente o servicio.
 * @param {number} km - Vida útil o intervalo en kilómetros.
 * @returns {number} Tasa por kilómetro (0 si precio o km son inválidos o <= 0).
 */
function calculateComponentWearRate(precio, km) {
    const p = Math.max(0, toFiniteNumber(precio, 0));
    const k = Math.max(0, toFiniteNumber(km, 0));
    if (p <= 0 || k <= 0) return 0;
    return p / k;
}

/**
 * Calcula las tasas individuales y la tasa total combinada para los 4 componentes.
 * @param {Object} components - Objeto con llantas, frenos, aceite, extras ({ precio, km }).
 * @returns {{ rates: Object, totalRate: number }}
 */
function calculateMulticomponentWear(components = {}) {
    const keys = ['llantas', 'frenos', 'aceite', 'extras'];
    const rates = {};
    const savings = {};
    const progress = {};
    const remaining = {};
    const isCovered = {};
    let totalRate = 0;
    let totalSavings = 0;

    keys.forEach((key) => {
        const comp = components[key] || {};
        const rate = calculateComponentWearRate(comp.precio, comp.km);
        rates[key] = rate;
        totalRate += rate;

        const p = Math.max(0, toFiniteNumber(comp.precio, 0));
        const a = Math.max(0, toFiniteNumber(comp.ahorrado, 0));
        savings[key] = a;
        totalSavings += a;
        remaining[key] = Math.max(0, p - a);
        progress[key] = p > 0 ? Math.min(100, Math.round((a / p) * 100)) : 0;
        isCovered[key] = p > 0 && a >= p;
    });

    return { rates, totalRate, savings, totalSavings, progress, remaining, isCovered };
}

/**
 * Distribuye una deducción de mantenimiento proporcionalmente entre los componentes que tienen ahorro.
 * @param {Object} components - Componentes del vehículo con campo 'ahorrado'.
 * @param {number} montoDescuento - Monto a restar de los ahorros.
 * @returns {{ newTotalSavings: number, distributedSavings: Object }}
 */
function distributeMaintenanceDeduction(components = {}, montoDescuento = 0) {
    const keys = ['llantas', 'frenos', 'aceite', 'extras'];
    const currentSavings = {};
    let totalSavings = 0;

    keys.forEach((key) => {
        const a = Math.max(0, toFiniteNumber(components[key]?.ahorrado, 0));
        currentSavings[key] = a;
        totalSavings += a;
    });

    const m = Math.max(0, toFiniteNumber(montoDescuento, 0));
    if (m <= 0) {
        return { newTotalSavings: totalSavings, distributedSavings: currentSavings };
    }

    if (m >= totalSavings) {
        const zeroSavings = {};
        keys.forEach((k) => { zeroSavings[k] = 0; });
        return { newTotalSavings: 0, distributedSavings: zeroSavings };
    }

    const newTotalSavings = totalSavings - m;
    const ratio = newTotalSavings / totalSavings;
    const distributedSavings = {};
    let runningSum = 0;
    let maxKey = keys[0];
    let maxVal = -1;

    keys.forEach((key) => {
        const val = Math.round(currentSavings[key] * ratio);
        distributedSavings[key] = val;
        runningSum += val;
        if (currentSavings[key] > maxVal) {
            maxVal = currentSavings[key];
            maxKey = key;
        }
    });

    const diff = newTotalSavings - runningSum;
    if (diff !== 0 && maxKey) {
        distributedSavings[maxKey] = Math.max(0, distributedSavings[maxKey] + diff);
    }

    return { newTotalSavings, distributedSavings };
}

/**
 * Calcula todas las métricas de mantenimiento en base al desgaste multicomponente o fallback manual.
 * @param {Object} params
 * @param {Object} params.components
 * @param {number} params.kmMeta
 * @param {number} params.ahorroActual
 * @param {number} params.kmRecorridosCiclo
 * @param {number} params.fallbackMeta
 * @returns {{ isComponentMode: boolean, rates: Object, totalRate: number, projectedGoal: number, expectedSavings: number, ratePerKm: number, isGoalReached: boolean, savingsDifference: number }}
 */
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

async function aplicarDescuentoMantenimiento() {
    const actionKey = 'aplicarDescuentoMantenimiento';
    if (typeof inFlightActions !== 'undefined' && inFlightActions.has(actionKey)) return;
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

    const componentes = typeof getVehiculoComponentesFromInputs === 'function'
        ? getVehiculoComponentesFromInputs()
        : { llantas: {}, frenos: {}, aceite: {}, extras: {} };
    const wear = typeof calculateMulticomponentWear === 'function'
        ? calculateMulticomponentWear(componentes)
        : { totalRate: 0, totalSavings: 0 };
    const isComponentMode = wear.totalRate > 0;

    let newSavings, newGoal, distributedSavings;
    if (isComponentMode) {
        if (typeof distributeMaintenanceDeduction === 'function') {
            const ded = distributeMaintenanceDeduction(componentes, montoDescuento);
            newSavings = ded.newTotalSavings;
            distributedSavings = ded.distributedSavings;
        } else {
            newSavings = Math.max(0, ahorroActual - montoDescuento);
        }
        newGoal = metaMantenimiento;
    } else {
        const deductionRes = calculateMaintenanceDeduction(ahorroActual, metaMantenimiento, montoDescuento);
        newSavings = deductionRes.newSavings;
        newGoal = deductionRes.newGoal;
    }

    const btn = document.getElementById('btnDescontarMantenimiento');
    if (typeof inFlightActions !== 'undefined') inFlightActions.add(actionKey);
    if (btn) btn.disabled = true;

    try {
        navigator.vibrate?.(10);

        const inputAhorro = document.getElementById('ahorroActual');
        const inputMeta = document.getElementById('metaMantenimiento');
        if (inputAhorro) inputAhorro.value = newSavings;
        if (inputMeta) inputMeta.value = newGoal;

        if (isComponentMode) {
            const saves = [saveSettingToCloudNow('ahorroActual', newSavings)];
            if (distributedSavings) {
                const keys = ['llantas', 'frenos', 'aceite', 'extras'];
                const capKeys = { llantas: 'Llantas', frenos: 'Frenos', aceite: 'Aceite', extras: 'Extras' };
                keys.forEach((k) => {
                    const cap = capKeys[k];
                    const val = distributedSavings[k] || 0;
                    saves.push(saveSettingToCloudNow(`vehiculo${cap}Ahorrado`, val));
                    const el = document.getElementById(`vehiculo${cap}Ahorrado`);
                    if (el) el.value = val;
                });
            }
            await Promise.all(saves);
        } else {
            await Promise.all([
                saveSettingToCloudNow('ahorroActual', newSavings),
                saveSettingToCloudNow('metaMantenimiento', newGoal)
            ]);
        }

        inputDescuento.value = '';
        calcular();
        showToast(`Descontados ${formatTotal(montoDescuento)} de mantenimiento.`, 'success');
    } catch (err) {
        console.error('Error aplicando descuento de mantenimiento:', err);
        showToast('Error al persistir el descuento.', 'error');
    } finally {
        if (typeof inFlightActions !== 'undefined') inFlightActions.delete(actionKey);
        if (btn) btn.disabled = false;
    }
}

function clearPendingInputSaves() {
    Object.keys(inputSaveTimeouts).forEach((k) => {
        clearTimeout(inputSaveTimeouts[k]);
        delete inputSaveTimeouts[k];
    });
}

function loadOfflineQueue() {
    try {
        const raw = localStorage.getItem(offlineQueueKey);
        const parsed = raw ? JSON.parse(raw) : [];
        offlineQueue = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn('No se pudo cargar cola offline:', error);
        offlineQueue = [];
    }
    updatePendingOpsBadge();
}

function persistOfflineQueue() {
    try {
        localStorage.setItem(offlineQueueKey, JSON.stringify(offlineQueue));
    } catch (error) {
        console.warn('No se pudo guardar cola offline:', error);
    }
    updatePendingOpsBadge();
}

function updatePendingOpsBadge() {
    const badge = document.getElementById('pendingOpsBadge');
    const count = offlineQueue.length;
    document.body.classList.toggle('has-pending-ops', count > 0);
    if (!badge) return;

    badge.setAttribute('aria-live', 'polite');
    badge.title = count > 0
        ? `${count} operacion${count > 1 ? 'es' : ''} pendiente${count > 1 ? 's' : ''} de sincronizacion`
        : 'Sin operaciones pendientes';

    if (count > 0) {
        badge.classList.remove('hidden');
        badge.classList.add('pending-ops-active');
        badge.textContent = `${count} pendiente${count > 1 ? 's' : ''}`;
    } else {
        badge.classList.add('hidden');
        badge.classList.remove('pending-ops-active');
        badge.textContent = '0 pendientes';
    }
}

function enqueueOfflineOperation(type, payload, storageId = currentStorageId) {
    const targetStorageId = sanitizeStorageId(storageId);
    if (!targetStorageId) return;

    const op = {
        opId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        storageId: targetStorageId,
        payload,
        createdAt: Date.now()
    };

    if (type === 'input_set') {
        offlineQueue = offlineQueue.filter((entry) => !(entry.type === 'input_set' && entry.storageId === targetStorageId && entry.payload?.id === payload?.id));
    }

    if (type === 'history_set') {
        offlineQueue = offlineQueue.filter((entry) => !(entry.type === 'history_set' && entry.storageId === targetStorageId));
    }

    if (type === 'fuel_set') {
        offlineQueue = offlineQueue.filter((entry) => !(entry.type === 'fuel_set' && entry.storageId === targetStorageId));
    }

    offlineQueue.push(op);
    persistOfflineQueue();
    return op;
}

async function applyOfflineOperation(op) {
    if (!op?.type || !op?.storageId) return false;
    const { settingsRef, historyRef } = getDocRefs(op.storageId);

    if (op.type === 'input_set') {
        const inputId = op.payload?.id;
        if (!inputId) return true;
        await setDoc(settingsRef, { [inputId]: op.payload?.value ?? '' }, { merge: true });
        return true;
    }

    if (op.type === 'history_set') {
        const safeItems = normalizeHistoryArray(op.payload?.items || []);
        await setDoc(historyRef, { items: safeItems, lastUpdate: new Date() }, { merge: true });
        return true;
    }

    if (op.type === 'fuel_set') {
        const safeItems = normalizeFuelHistoryArray(op.payload?.historialCargasGas || []);
        const safeDeuda = op.payload?.deudaCombustible ?? 0;
        await setDoc(settingsRef, { deudaCombustible: safeDeuda, historialCargasGas: safeItems }, { merge: true });
        return true;
    }

    return true;
}

async function flushOfflineQueue(options = {}) {
    if (offlineSyncInProgress || offlineQueue.length === 0) return;
    if (!navigator.onLine || !currentUser) return;

    offlineSyncInProgress = true;
    const initialCount = offlineQueue.length;
    try {
        while (offlineQueue.length > 0) {
            const op = offlineQueue[0];
            try {
                await applyOfflineOperation(op);
                offlineQueue.shift();
                persistOfflineQueue();
            } catch (error) {
                console.warn('Sync offline pendiente fallo, se reintentara:', error);
                const isPermanent = error && (
                    error.code === 'permission-denied' || 
                    error.code === 'invalid-argument' || 
                    error.code === 'not-found'
                );
                op.retries = (op.retries || 0) + 1;
                if (isPermanent || op.retries >= 3) {
                    console.error('Descartando operacion offline tras fallo permanente o exceso de reintentos:', op, error);
                    offlineQueue.shift();
                    persistOfflineQueue();
                    continue;
                }
                break;
            }
        }
    } finally {
        offlineSyncInProgress = false;
        updatePendingOpsBadge();
        const syncedCount = initialCount - offlineQueue.length;
        if (options.notify && syncedCount > 0 && offlineQueue.length === 0) {
            showToast(`${syncedCount} operacion${syncedCount > 1 ? 'es' : ''} sincronizada${syncedCount > 1 ? 's' : ''}.`, 'success', { duration: 2600 });
        }
    }
}

function getDocRefs(storageId) {
    if (!db) return null;
    const normalizedId = sanitizeStorageId(storageId);
    const isPrivate = normalizedId === getCurrentUserStorageId();
    if (isPrivate) {
        return {
            settingsRef: doc(db, 'artifacts', appId, 'users', normalizedId, 'data', 'settings'),
            historyRef: doc(db, 'artifacts', appId, 'users', normalizedId, 'data', 'history')
        };
    }
    return {
        settingsRef: doc(db, 'artifacts', appId, 'public', 'data', 'shared_settings', normalizedId),
        historyRef: doc(db, 'artifacts', appId, 'public', 'data', 'shared_history', normalizedId)
    };
}

function initLucideIcons() {
    if (typeof lucide !== 'undefined') lucide.createIcons();
    else window.addEventListener('load', () => typeof lucide !== 'undefined' && lucide.createIcons(), { once: true });
}

function actualizarEstadoConexion(texto, claseColor) {
    const dot = document.getElementById('statusConexion');
    const label = document.getElementById('textoConexion');
    if (!dot || !label) return;
    dot.className = `w-2 h-2 rounded-full transition-colors ${claseColor}`;
    label.innerText = texto;
}

function updateFirebasePreloader(visible, text = 'Conectando a Firebase...') {
    const preloader = document.getElementById('firebasePreloader');
    const preloaderText = document.getElementById('firebasePreloaderText');
    if (!preloader) return;

    const normalizedText = String(text || '').toLowerCase();
    const state = normalizedText.includes('error') || normalizedText.includes('no se pudo')
        ? 'error'
        : normalizedText.includes('cargando') || normalizedText.includes('sincronizando')
            ? 'syncing'
            : normalizedText.includes('esperando') || normalizedText.includes('sin conexion')
                ? 'offline'
                : 'connecting';
    preloader.dataset.state = state;

    if (preloaderText) preloaderText.textContent = text;

    if (visible) {
        preloader.classList.remove('firebase-preloader-hidden');
        preloader.setAttribute('aria-hidden', 'false');
    } else {
        preloader.classList.add('firebase-preloader-hidden');
        preloader.setAttribute('aria-hidden', 'true');
    }
}

function markFirebaseReady() {
    firebaseReady = true;
    updateFirebasePreloader(false);
    document.body.classList.add('firebase-ready');
    flushOfflineQueue();
}

function isDesktopViewport() {
    return window.matchMedia('(min-width: 1024px)').matches;
}

function syncDesktopHistorialTrigger() { /* noop: desktopHistorialTrigger retirado */ }

function cerrarHistorialDesktopModal() {
    document.body.classList.remove('desktop-history-modal-open');
}

function abrirHistorialDesktopModal() {
    if (!isDesktopViewport()) {
        const historial = document.getElementById('seccionHistorial');
        if (historial) {
            historial.classList.remove('hidden');
            historial.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
    }

    if (document.body.classList.contains('desktop-history-modal-open')) {
        cerrarHistorialDesktopModal();
        return;
    }

    if (!currentHistory.length) {
        showToast('No hay movimientos en el historial todavia.', 'info');
        return;
    }

    const historial = document.getElementById('seccionHistorial');
    if (!historial) return;
    const settingsDetails = document.querySelector('header details');
    if (settingsDetails?.open) settingsDetails.open = false;
    historial.classList.remove('hidden');
    document.body.classList.add('desktop-history-modal-open');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function mostrarHistorialSegunPantalla() {
    if (isDesktopViewport()) {
        abrirHistorialDesktopModal();
        return;
    }
    const historial = document.getElementById('seccionHistorial');
    if (!historial) return;
    historial.classList.remove('hidden');
    historial.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const mobileModuleMap = {
    gasolina: {
        title: 'Gasolina',
        selector: '#seccionGasolina'
    },
    mantenimiento: {
        title: 'Mantenimiento',
        selector: '#seccionMantenimiento, #seccionControlMant'
    },
    ingresos: {
        title: 'Ingresos y rentabilidad',
        selector: '#seccionResumenGanancias'
    },
    deudas: {
        title: 'Deudas y extras',
        selector: '#seccionDeudasExtras'
    },
    historial: {
        title: 'Historial',
        selector: '#seccionHistorial'
    },
    ajustes: {
        title: 'Ajustes',
        selector: 'header details[data-mobile-module="ajustes"]',
        isSettings: true
    }
};

function isMobileModuleViewport() {
    return window.matchMedia('(max-width: 1023px)').matches;
}

function setMobileModuleTitle(title) {
    const titleEl = document.getElementById('mobileModuleTitle');
    if (titleEl) titleEl.textContent = title || 'Modulo';
}

function clearMobileModuleActiveState() {
    document.querySelectorAll('.mobile-module-active').forEach((el) => {
        el.classList.remove('mobile-module-active');
    });
}

function closeMobileSettingsModule() {
    const settingsDetails = document.querySelector('header details[data-mobile-module="ajustes"]');
    if (settingsDetails) settingsDetails.open = false;
}

function focusFirstVisibleModuleControl(moduleId) {
    const mapEntry = mobileModuleMap[moduleId];
    const root = mapEntry?.isSettings
        ? document.querySelector('header details[data-mobile-module="ajustes"]')
        : document.querySelector('.mobile-module-active');
    const focusable = root?.querySelector('input, button, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable) {
        window.setTimeout(() => focusable.focus({ preventScroll: true }), 180);
    }
}

function openMobileModule(moduleId, explicitTitle) {
    if (!isMobileModuleViewport()) {
        if (moduleId === 'historial') abrirHistorialDesktopModal();
        if (moduleId === 'ajustes') {
            const settingsDetails = document.querySelector('header details[data-mobile-module="ajustes"]');
            if (settingsDetails) settingsDetails.open = true;
        }
        return;
    }

    const mapEntry = mobileModuleMap[moduleId];
    if (!mapEntry) return;

    clearMobileModuleActiveState();
    closeMobileSettingsModule();
    document.body.classList.add('mobile-module-open');
    document.body.dataset.mobileModule = moduleId;
    setMobileModuleTitle(explicitTitle || mapEntry.title);
    updateMobileBottomNavActive(moduleId);

    if (mapEntry.isSettings) {
        const settingsDetails = document.querySelector(mapEntry.selector);
        if (settingsDetails) {
            settingsDetails.open = true;
            settingsDetails.classList.add('mobile-module-active');
        }
    } else {
        document.querySelectorAll(mapEntry.selector).forEach((section, index) => {
            section.classList.add('mobile-module-active');
            section.style.setProperty('--mobile-module-index', String(index));
        });
    }

    window.cerrarHistorialDesktopModal?.();
    const scrollTarget = document.querySelector('.app-container') || document.body;
    scrollTarget.scrollTo?.({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    focusFirstVisibleModuleControl(moduleId);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeMobileModule() {
    clearMobileModuleActiveState();
    closeMobileSettingsModule();
    document.body.classList.remove('mobile-module-open');
    delete document.body.dataset.mobileModule;
    setMobileModuleTitle('Inicio');
    updateMobileBottomNavActive('home');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function updateMobileBottomNavActive(activeId) {
    document.querySelectorAll('[data-mobile-nav]').forEach((button) => {
        const isActive = button.dataset.mobileNav === activeId;
        button.classList.toggle('active', isActive);
        if (isActive) {
            button.setAttribute('aria-current', 'page');
        } else {
            button.removeAttribute('aria-current');
        }
    });

    // Sincronizar también la barra de navegación móvil activa
    const navTabMap = {
        home: 'inicio',
        cierre: 'inicio',
        inicio: 'inicio',
        modules: 'modulos',
        modulos: 'modulos',
        historial: 'historial',
        ajustes: 'ajustes'
    };
    const tabName = navTabMap[activeId] || 'inicio';
    const btnMap = {
        inicio: 'navInicioBtn',
        historial: 'navHistorialBtn',
        modulos: 'navModulosBtn',
        ajustes: 'navAjustesBtn'
    };
    Object.keys(btnMap).forEach((tab) => {
        const btn = document.getElementById(btnMap[tab]);
        if (btn) {
            if (tab === tabName) {
                btn.className = 'flex flex-col items-center gap-1 text-emerald-600 active:scale-95 transition-transform';
                btn.querySelector('span')?.classList.replace('font-medium', 'font-bold');
            } else {
                btn.className = 'flex flex-col items-center gap-1 text-gray-400 hover:text-gray-600 active:scale-95 transition-transform';
                btn.querySelector('span')?.classList.replace('font-bold', 'font-medium');
            }
        }
    });
}

function scrollMobileHomeToModules() {
    closeMobileModule();
    window.setTimeout(() => {
        const modules = document.getElementById('mobileModuleHome');
        if (modules) {
            modules.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        updateMobileBottomNavActive('modules');
    }, 80);
}

function scrollMobileHomeToCierre() {
    closeMobileModule();
    window.setTimeout(() => {
        const cierre = document.getElementById('seccionCierreDia');
        const input = document.getElementById('kmHoy');
        if (cierre) {
            cierre.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        if (input) {
            window.setTimeout(() => input.focus({ preventScroll: true }), 260);
        }
        updateMobileBottomNavActive('cierre');
    }, 80);
}

function openMobileNavDestination(destination) {
    if (!destination) return;

    if (!isMobileModuleViewport()) {
        if (destination === 'historial') abrirHistorialDesktopModal();
        if (destination === 'ajustes') {
            const settingsDetails = document.querySelector('header details[data-mobile-module="ajustes"]');
            if (settingsDetails) settingsDetails.open = true;
        }
        return;
    }

    if (destination === 'home') {
        closeMobileModule();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        updateMobileBottomNavActive('home');
        return;
    }

    if (destination === 'cierre') {
        scrollMobileHomeToCierre();
        return;
    }

    if (destination === 'modules') {
        scrollMobileHomeToModules();
        return;
    }

    if (destination === 'historial') {
        openMobileModule('historial', 'Historial');
        updateMobileBottomNavActive('historial');
        return;
    }

    if (destination === 'ajustes') {
        openMobileModule('ajustes', 'Ajustes');
        updateMobileBottomNavActive('ajustes');
    }
}

function initMobileBottomNav() {
    document.querySelectorAll('[data-mobile-nav]').forEach((button) => {
        button.addEventListener('click', () => {
            openMobileNavDestination(button.dataset.mobileNav);
        });
    });
}

function initMobileModuleShell() {
    initMobileBottomNav();

    document.querySelectorAll('[data-mobile-open]').forEach((button) => {
        button.addEventListener('click', () => {
            button.classList.remove('mobile-module-pressed');
            void button.offsetWidth;
            button.classList.add('mobile-module-pressed');
            openMobileModule(button.dataset.mobileOpen, button.dataset.mobileTitle);
        });
    });

    document.getElementById('btnCargarGasolinaHome')?.addEventListener('click', () => {
        window.setTimeout(() => {
            const input = document.getElementById('cargaGasolina');
            if (input) input.focus({ preventScroll: true });
        }, 300);
    });

    document.getElementById('mobileModuleBackBtn')?.addEventListener('click', closeMobileModule);

    let wasMobile = isMobileModuleViewport();
    window.addEventListener('resize', () => {
        const isMobile = isMobileModuleViewport();
        if (wasMobile !== isMobile) {
            wasMobile = isMobile;
            if (!isMobile) closeMobileModule();
        }
    });
}

const activeCurrencyAnimations = new Map();

function animateCurrency(id, start, end, duration = 600) {
    const obj = document.getElementById(id);
    if (!obj) return;
    const prevRaf = activeCurrencyAnimations.get(id);
    if (prevRaf) {
        window.cancelAnimationFrame(prevRaf);
        activeCurrencyAnimations.delete(id);
    }
    if (start === end) {
        obj.innerHTML = formatTotal(end);
        return;
    }
    obj.classList.add('metric-value-counting');
    let startTs = null;
    let rafId = null;
    const step = (ts) => {
        if (!startTs) startTs = ts;
        const p = Math.min((ts - startTs) / duration, 1);
        const ease = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
        obj.innerHTML = formatTotal(start + (end - start) * ease);
        if (p < 1) {
            rafId = window.requestAnimationFrame(step);
            activeCurrencyAnimations.set(id, rafId);
        } else {
            activeCurrencyAnimations.delete(id);
            obj.innerHTML = formatTotal(end);
            obj.classList.remove('metric-value-counting');
            obj.classList.remove('metric-value-updated');
            void obj.offsetWidth;
            obj.classList.add('metric-value-updated');
        }
    };
    rafId = window.requestAnimationFrame(step);
    activeCurrencyAnimations.set(id, rafId);
}

async function initAuth() {
    firebaseReady = false;
    if (!auth) {
        actualizarEstadoConexion('Sin configurar', 'bg-amber-500');
        updateFirebasePreloader(false);
        showToast('Configura firebase-config.js usando firebase-config.example.js.', 'warning', { duration: 5000 });
        return;
    }
    updateFirebasePreloader(true, 'Conectando a Firebase...');

    try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            try { await signInWithCustomToken(auth, __initial_auth_token); }
            catch (e) { console.warn('Token failed, fallback anonymous', e); await signInAnonymously(auth); }
        } else {
            await signInAnonymously(auth);
        }
    } catch (error) {
        console.error('Auth error', error);
        actualizarEstadoConexion(`Error: ${error.code || 'Desconocido'}`, 'bg-red-500');
        updateFirebasePreloader(true, 'No se pudo conectar a Firebase');
        showToast('No se pudo conectar a Firebase.', 'error');
    }
}

function conectarSincronizacion(idPropuesto) {
    if (!idPropuesto) return;
    const cleanId = sanitizeStorageId(idPropuesto);
    if (!cleanId) return;

    firebaseReady = false;
    clearPendingInputSaves();
    if (unsubscribeSettings) unsubscribeSettings();
    if (unsubscribeHistory) unsubscribeHistory();

    currentStorageId = cleanId;
    updateFirebasePreloader(true, 'Sincronizando datos...');

    const btnSync = document.getElementById('btnSync');
    const statusSync = document.getElementById('statusSync');
    if (btnSync) btnSync.innerText = 'Conectado';
    if (statusSync) {
        const tipo = cleanId === getCurrentUserStorageId() ? 'Privada' : 'Compartida';
        statusSync.textContent = `Base de datos: ${cleanId} (${tipo})`;
    }

    setupRealtimeListeners(currentStorageId);
    flushOfflineQueue();
}

function generarClaveSincronizacionSegura() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const maxValidByte = 256 - (256 % chars.length); // 248: rechazo para evitar modulo bias
    let key = '';
    while (key.length < 16) {
        const array = new Uint8Array(24);
        crypto.getRandomValues(array);
        for (let i = 0; i < array.length && key.length < 16; i++) {
            if (array[i] < maxValidByte) {
                key += chars[array[i] % chars.length];
            }
        }
    }
    const input = document.getElementById('syncIdInput');
    if (input) {
        input.value = key;
    }
    if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(key).then(() => {
            showToast('Clave segura generada y copiada al portapapeles.', 'success');
        }).catch(() => {
            showToast('Clave segura generada en el campo.', 'info');
        });
    } else {
        showToast('Clave segura generada en el campo.', 'info');
    }
    return key;
}

function manejarClickSincronizar() {
    const input = document.getElementById('syncIdInput');
    const cleanId = sanitizeStorageId(input?.value || '');
    if (cleanId.length < 8) {
        showToast('La clave debe tener al menos 8 caracteres (recomendado 12+).', 'warning');
        return;
    }
    localStorage.setItem('mySyncId', cleanId);
    if (input) input.value = cleanId;
    conectarSincronizacion(cleanId);
    showToast(`Sincronizacion activada. Clave: ${cleanId}`, 'success', { duration: 4200 });
}

if (auth) {
onAuthStateChanged(auth, (user) => {
    if (!user) {
        currentUser = null;
        firebaseReady = false;
        actualizarEstadoConexion('Desconectado', 'bg-red-500');
        updateFirebasePreloader(true, 'Esperando conexion con Firebase...');
        return;
    }

    currentUser = user;
    actualizarEstadoConexion('En linea', 'bg-emerald-500');
    updateFirebasePreloader(true, 'Conectado. Cargando datos...');

    const savedSyncId = localStorage.getItem('mySyncId');
    if (savedSyncId) {
        const input = document.getElementById('syncIdInput');
        if (input) input.value = savedSyncId;
        conectarSincronizacion(savedSyncId);
    } else {
        conectarSincronizacion(user.uid);
    }

    flushOfflineQueue();
});
}

function setupRealtimeListeners(storageId) {
    if (!currentUser || !storageId) return;
    const refs = getDocRefs(storageId);
    if (!refs) return;
    const { settingsRef, historyRef } = refs;

    unsubscribeSettings = onSnapshot(settingsRef, (docSnap) => {
        const data = docSnap.exists() ? docSnap.data() : {};
        settingsInputs.forEach((key) => {
            if (key === 'historialCargasGas') return;
            const rawVal = data[key];
            const el = document.getElementById(key);
            if (el && document.activeElement !== el) {
                el.value = rawVal !== undefined ? rawVal : (key === 'kmMeta' ? '5000' : '');
            }
            if (key === 'deudaCombustible') {
                currentDeudaCombustible = rawVal !== undefined
                    ? (normalizeDeudaCombustibleMonto(rawVal, true, true) ?? 0)
                    : 0;
                actualizarUIDeudaCombustible(currentDeudaCombustible);
            }
        });
        // Siempre re-sincronizar: si el doc o el campo no existen (clave nueva / cuenta vieja),
        // se resetea a [] para no arrastrar el historial de otra base de datos.
        const fuelHistoryRaw = docSnap.exists() ? docSnap.data().historialCargasGas : undefined;
        renderHistorialCargasGas(normalizeFuelHistoryArray(fuelHistoryRaw));
        markFirebaseReady();
        calcular();
    }, (error) => {
        console.error('Error settings:', error);
        updateFirebasePreloader(true, 'Error sincronizando configuracion');
        showToast('Error sincronizando configuracion.', 'error');
    });

    unsubscribeHistory = onSnapshot(historyRef, (docSnap) => {
        const historyList = docSnap.exists() ? (docSnap.data().items || []) : [];
        renderHistorialFromData(normalizeHistoryArray(historyList));
        markFirebaseReady();
    }, (error) => {
        console.error('Error historial:', error);
        updateFirebasePreloader(true, 'Error sincronizando historial');
        showToast('Error sincronizando historial.', 'error');
    });
}

window.saveInputToCloud = (id, value) => {
    const safeId = String(id || '').trim();
    if (!settingsInputSet.has(safeId)) return;
    if (!currentUser || !currentStorageId) return;
    const targetStorageId = currentStorageId;
    if (inputSaveTimeouts[safeId]) clearTimeout(inputSaveTimeouts[safeId]);
    inputSaveTimeouts[safeId] = setTimeout(async () => {
        delete inputSaveTimeouts[safeId];
        try {
            const { settingsRef } = getDocRefs(targetStorageId);
            await setDoc(settingsRef, { [safeId]: value }, { merge: true });
            flushOfflineQueue();
        } catch (e) {
            console.error('Error guardando input:', e);
            enqueueOfflineOperation('input_set', { id: safeId, value }, targetStorageId);
        }
    }, 800);
};

async function saveSettingToCloudNow(id, value) {
    const safeId = String(id || '').trim();
    if (!settingsInputSet.has(safeId)) return { mode: 'ignored' };
    if (!currentUser || !currentStorageId) return { mode: 'unavailable' };

    const targetStorageId = currentStorageId;
    if (inputSaveTimeouts[safeId]) {
        clearTimeout(inputSaveTimeouts[safeId]);
        delete inputSaveTimeouts[safeId];
    }

    try {
        const { settingsRef } = getDocRefs(targetStorageId);
        await setDoc(settingsRef, { [safeId]: value }, { merge: true });
        flushOfflineQueue();
        return { mode: 'cloud' };
    } catch (error) {
        console.error('Error guardando setting inmediato:', error);
        enqueueOfflineOperation('input_set', { id: safeId, value }, targetStorageId);
        return { mode: 'queued' };
    }
}

async function saveFuelStateToCloud(nuevaDeuda, nuevoHistorial) {
    if (!currentUser || !currentStorageId) return { mode: 'unavailable' };
    const targetStorageId = currentStorageId;
    const safeItems = normalizeFuelHistoryArray(nuevoHistorial);
    try {
        const { settingsRef } = getDocRefs(targetStorageId);
        await setDoc(settingsRef, {
            deudaCombustible: nuevaDeuda,
            historialCargasGas: safeItems
        }, { merge: true });
        flushOfflineQueue();
        return { mode: 'cloud' };
    } catch (error) {
        console.error('Error guardando estado de combustible en la nube:', error);
        enqueueOfflineOperation('fuel_set', {
            deudaCombustible: nuevaDeuda,
            historialCargasGas: safeItems
        }, targetStorageId);
        return { mode: 'queued' };
    }
}

async function mutateHistoryCloud(mutator, options = {}) {
    if (!currentUser || !currentStorageId) {
        lastHistoryWriteMode = 'unavailable';
        return null;
    }
    const targetStorageId = currentStorageId;
    const { historyRef } = getDocRefs(targetStorageId);
    let updatedItems = null;

    try {
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(historyRef);
            const existing = snap.exists() ? normalizeHistoryArray(snap.data().items || []) : [];
            const candidate = mutator(existing);
            updatedItems = normalizeHistoryArray(Array.isArray(candidate) ? candidate : existing);
            tx.set(historyRef, { items: updatedItems, lastUpdate: new Date() }, { merge: true });
        });
        lastHistoryWriteMode = 'cloud';
        flushOfflineQueue();
        return updatedItems;
    } catch (e) {
        console.error(options.errorLog || 'Error actualizando historial:', e);
        const localBase = normalizeHistoryArray(currentHistory);
        const candidate = mutator(localBase);
        updatedItems = normalizeHistoryArray(Array.isArray(candidate) ? candidate : localBase);
        enqueueOfflineOperation('history_set', { items: updatedItems }, targetStorageId);
        lastHistoryWriteMode = 'queued';

        if (options.alertMessage && navigator.onLine) {
            const detail = e?.message ? ` (${e.message})` : '';
            showToast(options.alertMessage + detail, 'error');
        }
        return updatedItems;
    }
}

async function addHistoryItemToCloud(item) {
    const normalizedItem = normalizeHistoryItem(item, Date.now());
    return mutateHistoryCloud((items) => [...items, normalizedItem], {
        errorLog: 'Error guardando historial:',
        alertMessage: 'Error al guardar en la nube.'
    });
}

async function overwriteHistoryCloud(newHistoryArray) {
    return mutateHistoryCloud(() => normalizeHistoryArray(newHistoryArray), {
        errorLog: 'Error sobrescribiendo historial:',
        alertMessage: 'No se pudo actualizar el historial.'
    });
}
function calcular() {
    const precioLitro = getInputVal('precioLitro');
    const consumo = getInputVal('consumo');
    const kmMeta = getInputVal('kmMeta', 5000);
    const metaMantenimiento = getInputVal('metaMantenimiento');
    const ahorroActual = getInputVal('ahorroActual');
    const kmRecorridosCiclo = getInputVal('kmRecorridosCiclo');
    const kmHoy = getInputVal('kmHoy');
    const ingresosHoy = getInputVal('ingresosHoy');
    const deudaUber = Math.round(getInputVal('deudaUber'));
    const metaGananciaNeta = getInputVal('metaGananciaNeta');
    const progresoKmSimple = (kmMeta > 0) ? Math.min(100, Math.max(0, (kmRecorridosCiclo / kmMeta) * 100)) : 0;
    updateText('progressPercent', `${Math.round(progresoKmSimple)}%`);
    const barraKmSimple = document.getElementById('barraKmSimple');
    if (barraKmSimple) barraKmSimple.style.width = `${progresoKmSimple}%`;
    const uberTeDebe = Math.max(0, deudaUber);
    const debesAUber = Math.max(0, -deudaUber);
    const sobreMantenimiento = Math.max(0, Math.round(ahorroActual - uberTeDebe));

    const deudaUberEstado = document.getElementById('deudaUberEstado');
    if (deudaUberEstado) {
        if (uberTeDebe > 0) {
            deudaUberEstado.textContent = `Te deben ${formatTotal(uberTeDebe)}`;
            deudaUberEstado.className = 'text-[10px] font-bold text-violet-600 uppercase';
        } else if (debesAUber > 0) {
            deudaUberEstado.textContent = `Debes ${formatTotal(debesAUber)}`;
            deudaUberEstado.className = 'text-[10px] font-bold text-amber-600 uppercase';
        } else {
            deudaUberEstado.textContent = 'Sin deuda';
            deudaUberEstado.className = 'text-[10px] font-bold text-gray-400 uppercase';
        }
    }

    let costoGasolinaPorKm = 0;
    if (precioLitro > 0 && consumo > 0) costoGasolinaPorKm = (consumo / 100) * precioLitro;

    const vehiculoComponentes = getVehiculoComponentesFromInputs();
    const metricsMantenimiento = calculateMaintenanceMetrics({
        components: vehiculoComponentes,
        kmMeta,
        ahorroActual,
        kmRecorridosCiclo,
        fallbackMeta: metaMantenimiento
    });

    const isComponentMode = metricsMantenimiento.isComponentMode;
    const ahorroMantenimientoPorKm = metricsMantenimiento.ratePerKm;
    const metaMantenimientoEfectiva = metricsMantenimiento.projectedGoal;
    const isMetaMantenimientoAlcanzada = metricsMantenimiento.isGoalReached;

    // Actualizar UI del badge y desglose en Mantenimiento
    toggleBox('badgeDesgasteMulticomponente', isComponentMode);
    toggleBox('mantenimientoDesgloseComponentes', isComponentMode);

    const inputMetaMant = document.getElementById('metaMantenimiento');
    if (inputMetaMant) {
        if (isComponentMode) {
            inputMetaMant.readOnly = true;
            inputMetaMant.value = metaMantenimientoEfectiva > 0 ? metaMantenimientoEfectiva : '';
            inputMetaMant.title = 'Meta calculada en base a los componentes del vehículo';
        } else {
            inputMetaMant.readOnly = false;
            inputMetaMant.title = '';
        }
    }

    const inputAhorroMant = document.getElementById('ahorroActual');
    if (inputAhorroMant) {
        if (isComponentMode) {
            inputAhorroMant.readOnly = true;
            inputAhorroMant.title = 'Ahorro sincronizado con los sobres del vehículo (abrí el modal para modificar)';
        } else {
            inputAhorroMant.readOnly = false;
            inputAhorroMant.title = '';
        }
    }

    const listaChips = document.getElementById('mantenimientoListaChips');
    if (listaChips && isComponentMode) {
        const labelsMap = { llantas: 'Llantas', frenos: 'Frenos', aceite: 'Aceite', extras: 'Extras' };
        listaChips.innerHTML = Object.keys(metricsMantenimiento.rates)
            .filter((k) => metricsMantenimiento.rates[k] > 0)
            .map((k) => `<span class="component-chip"><span>${labelsMap[k] || k}:</span> ${formatCurrency(metricsMantenimiento.rates[k])}/km</span>`)
            .join('');
    }

    // Actualizar tarjeta de "Mi Vehículo" en Inicio
    const badgeVehiculo = document.getElementById('badgeVehiculoEstado');
    const subtextoVehiculo = document.getElementById('subtextoVehiculoInfo');
    if (badgeVehiculo) {
        badgeVehiculo.textContent = isComponentMode ? `${formatCurrency(metricsMantenimiento.totalRate)}/km` : 'Configurar';
    }
    if (subtextoVehiculo) {
        subtextoVehiculo.textContent = isComponentMode
            ? `Meta: ${formatTotal(metaMantenimientoEfectiva)} · ${kmMeta} km`
            : 'Desgaste multicomponente';
    }

    toggleBox('boxGasolinaResult', costoGasolinaPorKm > 0);
    updateText('costoGasolinaPorKm', formatCurrency(costoGasolinaPorKm));
    toggleBox('boxMantenimientoResult', ahorroMantenimientoPorKm > 0 || isMetaMantenimientoAlcanzada);
    toggleBox('msgMetaAlcanzada', isMetaMantenimientoAlcanzada);
    updateText('ahorroMantenimientoPorKm', formatCurrency(ahorroMantenimientoPorKm));

    const seccionCtrl = document.getElementById('seccionControlMant');
    if (seccionCtrl) {
        if (metaMantenimientoEfectiva > 0 && kmMeta > 0) {
            seccionCtrl.classList.remove('hidden');
            const kmFaltantes = Math.max(0, kmMeta - kmRecorridosCiclo);
            const porcentajeKm = Math.min(100, (kmRecorridosCiclo / kmMeta) * 100);
            updateText('ctrlKmActual', String(Math.round(kmRecorridosCiclo)));
            updateText('ctrlKmMeta', String(Math.round(kmMeta)));
            updateText('ctrlKmFaltan', String(Math.round(kmFaltantes)));
            const barraKm = document.getElementById('barraKm');
            if (barraKm) barraKm.style.width = `${porcentajeKm}%`;

            const kmsPendientesHistorial = currentHistory.reduce((sum, item) => item.isExtra ? sum : sum + Math.max(0, Math.round(toFiniteNumber(item.kms, 0))), 0);
            const kmsComprometidos = kmRecorridosCiclo + kmsPendientesHistorial;
            const kmsFaltantesComprometidos = kmMeta - kmsComprometidos;

            // Mostrar el desglose en el nuevo apartado
            updateText('ctrlKmComprometidosTotal', String(Math.round(kmsComprometidos)));
            updateText('ctrlKmComprometidosMetaLabel', String(Math.round(kmMeta)));
            updateText('ctrlKmCicloHoy', String(Math.round(kmRecorridosCiclo)));
            updateText('ctrlKmHistorialAcum', String(Math.round(kmsPendientesHistorial)));

            // Colorear el total según si supera o no la meta
            const totalEl = document.getElementById('ctrlKmComprometidosTotal');
            if (totalEl) {
                totalEl.className = kmsComprometidos >= kmMeta
                    ? 'font-extrabold text-red-500'
                    : kmsComprometidos >= kmMeta * 0.8
                        ? 'font-extrabold text-amber-500'
                        : 'font-extrabold';
            }
            const alertaKmBox = document.getElementById('ctrlKmComprometidosBox');
            const alertaKmTitulo = document.getElementById('ctrlKmComprometidosTitulo');
            const alertaKmBadge = document.getElementById('ctrlKmComprometidosBadge');
            const alertaKmMsg = document.getElementById('ctrlKmComprometidosMsg');
            const pendingText = kmsPendientesHistorial > 0 ? ` Incluye ${Math.round(kmsPendientesHistorial)} km pendientes del historial.` : '';

            if (alertaKmBox && alertaKmTitulo && alertaKmBadge && alertaKmMsg) {
                if (kmsComprometidos >= kmMeta) {
                    alertaKmBox.className = 'mt-2 rounded-xl border px-3 py-2 maintenance-km-alert maintenance-km-alert-danger';
                    alertaKmTitulo.textContent = 'Mantenimiento alcanzado';
                    alertaKmBadge.textContent = kmsComprometidos > kmMeta ? 'Pasado' : 'Meta';
                    alertaKmMsg.textContent = `Ya llevas ${Math.round(kmsComprometidos)} km comprometidos de ${Math.round(kmMeta)} km.${pendingText} Revisá el mantenimiento.`;
                } else if (kmsFaltantesComprometidos <= 500) {
                    alertaKmBox.className = 'mt-2 rounded-xl border px-3 py-2 maintenance-km-alert maintenance-km-alert-warning';
                    alertaKmTitulo.textContent = 'Mantenimiento cerca';
                    alertaKmBadge.textContent = `${Math.round(kmsFaltantesComprometidos)} km`;
                    alertaKmMsg.textContent = `Te quedan aprox. ${Math.round(kmsFaltantesComprometidos)} km para la meta usando km comprometidos.${pendingText}`;
                } else {
                    alertaKmBox.classList.add('hidden');
                }
            }

            const porcentajeAhorro = Math.min(100, (ahorroActual / metaMantenimientoEfectiva) * 100);
            updateText('ctrlAhorroActual', String(Math.round(ahorroActual)));
            updateText('ctrlAhorroMeta', String(Math.round(metaMantenimientoEfectiva)));
            const barraAhorro = document.getElementById('barraAhorro');
            if (barraAhorro) barraAhorro.style.width = `${porcentajeAhorro}%`;

            const ahorroEsperado = metricsMantenimiento.expectedSavings;
            const diferenciaAhorro = metricsMantenimiento.savingsDifference;
            updateText('ctrlDeberiaAhorro', formatTotal(ahorroEsperado));
            updateText('ctrlTieneAhorro', formatTotal(ahorroActual));
            updateText('ctrlSobreMantenimiento', formatTotal(sobreMantenimiento));
            const sobreHint = document.getElementById('ctrlSobreMantenimientoHint');
            if (sobreHint) {
                if (uberTeDebe > 0) {
                    sobreHint.textContent = `Uber te debe ${formatTotal(uberTeDebe)}. En el sobre de mantenimiento deberias tener ${formatTotal(sobreMantenimiento)}.`;
                    sobreHint.className = 'text-[10px] text-right text-violet-500 mb-3';
                } else if (debesAUber > 0) {
                    sobreHint.textContent = `Debes a Uber ${formatTotal(debesAUber)}. Ese monto separalo en sobre Uber; mantenimiento no se toca.`;
                    sobreHint.className = 'text-[10px] text-right text-amber-500 mb-3';
                } else {
                    sobreHint.textContent = 'Sin ajuste por deuda Uber.';
                    sobreHint.className = 'text-[10px] text-right text-gray-400 mb-3';
                }
            }

            const elBalanceValor = document.getElementById('ctrlBalanceValor');
            const elBalanceLabel = document.getElementById('ctrlBalanceLabel');
            const elBalanceMsg = document.getElementById('ctrlBalanceMsg');
            if (elBalanceValor && elBalanceLabel && elBalanceMsg) {
                if (diferenciaAhorro >= 0) {
                    elBalanceValor.textContent = `+${formatTotal(diferenciaAhorro)}`;
                    elBalanceValor.className = 'text-lg font-black text-emerald-600';
                    elBalanceLabel.textContent = 'Superavit';
                    elBalanceMsg.textContent = 'Vas adelantado, buen ritmo de ahorro.';
                    elBalanceMsg.className = 'text-[10px] text-center mt-3 text-emerald-500 font-medium';
                } else {
                    elBalanceValor.textContent = formatTotal(diferenciaAhorro);
                    elBalanceValor.className = 'text-lg font-black text-red-500';
                    elBalanceLabel.textContent = 'Deficit';
                    elBalanceMsg.textContent = `Te falta ahorrar ${formatTotal(Math.abs(diferenciaAhorro))} para cuadrar.`;
                    elBalanceMsg.className = 'text-[10px] text-center mt-3 text-red-500 font-medium';
                }
                if (ahorroActual >= metaMantenimiento) {
                    elBalanceValor.textContent = 'Meta OK';
                    elBalanceValor.className = 'text-lg font-black text-emerald-600';
                    elBalanceLabel.textContent = 'Completado';
                    elBalanceMsg.textContent = 'Ya tienes el ahorro completo para el mantenimiento.';
                    elBalanceMsg.className = 'text-[10px] text-center mt-3 text-emerald-600 font-bold';
                }
            }
        } else {
            seccionCtrl.classList.add('hidden');
        }
    }

    const gastoGasolinaCalc = costoGasolinaPorKm * kmHoy;
    const gastoMantCalc = ahorroMantenimientoPorKm * kmHoy;
    const MINIMO = 10;

    if (kmHoy > 0) {
        currentGasTotal = gastoGasolinaCalc > 0 ? Math.max(MINIMO, gastoGasolinaCalc) : 0;
        currentMaintTotal = gastoMantCalc > 0 ? Math.max(MINIMO, gastoMantCalc) : 0;
    } else {
        currentGasTotal = 0;
        currentMaintTotal = 0;
    }

    currentGrandTotal = currentGasTotal + currentMaintTotal;
    updateMetricText('gastoGasolinaHoy', formatTotal(currentGasTotal));
    updateMetricText('gastoMantenimientoHoy', formatTotal(currentMaintTotal));
    animateCurrency('totalDiario', prevGrandTotal, currentGrandTotal);
    prevGrandTotal = currentGrandTotal;

    const balance = ingresosHoy - currentGrandTotal;
    const gananciaLibreDisplay = formatTotal(balance);

    const elGanancia = document.getElementById('gananciaLibre');
    const elMensaje = document.getElementById('mensajeBalance');
    const estadoBadge = document.getElementById('estadoJornadaBadge');
    const estadoBadgeText = document.getElementById('estadoJornadaBadgeText');
    if (elGanancia && elMensaje) {
        let statusLabel = 'Calculando';
        let statusTone = 'neutral';
        let statusMessage = 'Esperando datos para cerrar la jornada.';
        let gainClass = 'text-4xl font-black tracking-tight text-slate-500 leading-none';
        let messageClass = 'text-[11px] mt-2 text-slate-500';

        if (ingresosHoy > 0) {
            const margenRatio = currentGrandTotal > 0 ? (balance / currentGrandTotal) : 0;
            const mantenimientoActivo = currentMaintTotal > 0;

            if (balance < 0) {
                statusLabel = 'Deficit';
                statusTone = 'danger';
                statusMessage = `Vas en rojo por ${formatTotal(Math.abs(balance))}.`;
                gainClass = 'text-4xl font-black tracking-tight text-red-500 leading-none';
                messageClass = 'text-[11px] mt-2 text-red-500';
            } else if (mantenimientoActivo && balance > 0 && balance < currentMaintTotal) {
                statusLabel = 'Ajustado';
                statusTone = 'warning';
                statusMessage = 'Ganando, pero con poco margen para mantenimiento.';
                gainClass = 'text-4xl font-black tracking-tight text-amber-500 leading-none';
                messageClass = 'text-[11px] mt-2 text-amber-600';
            } else if (metaMantenimiento > 0 && ahorroActual < metaMantenimiento && balance >= 0) {
                statusLabel = 'Falta separar';
                statusTone = 'warning';
                statusMessage = `Te faltan ${formatTotal(Math.max(0, metaMantenimiento - ahorroActual))} para cubrir mantenimiento.`;
                gainClass = 'text-4xl font-black tracking-tight text-emerald-600 leading-none';
                messageClass = 'text-[11px] mt-2 text-amber-600';
            } else if (balance >= 0 && metaMantenimiento > 0 && ahorroActual >= metaMantenimiento) {
                statusLabel = 'Meta cubierta';
                statusTone = 'success';
                statusMessage = 'Meta de mantenimiento cubierta. Excelente cierre.';
                gainClass = 'text-4xl font-black tracking-tight text-emerald-600 leading-none';
                messageClass = 'text-[11px] mt-2 text-emerald-600';
            } else if (margenRatio >= 0.45) {
                statusLabel = 'Buen ritmo';
                statusTone = 'success';
                statusMessage = 'Buen ritmo: cierre saludable y con margen.';
                gainClass = 'text-4xl font-black tracking-tight text-emerald-600 leading-none';
                messageClass = 'text-[11px] mt-2 text-emerald-600';
            } else if (balance >= 0) {
                statusLabel = 'Ajustado';
                statusTone = 'warning';
                statusMessage = 'Vas positivo, pero conviene cuidar gastos.';
                gainClass = 'text-4xl font-black tracking-tight text-amber-500 leading-none';
                messageClass = 'text-[11px] mt-2 text-amber-600';
            }
        }

        elGanancia.className = gainClass;
        elMensaje.innerText = statusMessage;
        elMensaje.className = messageClass;

        if (estadoBadge) {
            const badgeClassByTone = {
                success: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-[10px] font-bold text-emerald-600 uppercase tracking-wide',
                warning: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-100 text-[10px] font-bold text-amber-600 uppercase tracking-wide',
                danger: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 border border-red-100 text-[10px] font-bold text-red-500 uppercase tracking-wide',
                neutral: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wide'
            };
            estadoBadge.className = badgeClassByTone[statusTone] || badgeClassByTone.neutral;
            if (estadoBadgeText) estadoBadgeText.textContent = statusLabel;
        }
    }
    updateMetricText('gananciaLibre', gananciaLibreDisplay);

    const horasTotales = getInputVal('horasTrabajadas') + (getInputVal('minutosTrabajados') / 60);
    const rentabilidadBox = document.getElementById('rentabilidadHoraBox');
    const rentabilidadLiquidaValor = document.getElementById('rentabilidadHoraValor');
    const rentabilidadBrutaValor = document.getElementById('rentabilidadBrutaValor');
    if (rentabilidadBox && rentabilidadLiquidaValor) {
        if (horasTotales > 0 && ingresosHoy > 0) {
            rentabilidadBox.classList.remove('hidden');
            if (rentabilidadBrutaValor) rentabilidadBrutaValor.textContent = `${formatCurrency(ingresosHoy / horasTotales)}/h`;
            const rentabilidadLiquida = balance / horasTotales;
            rentabilidadLiquidaValor.textContent = `${formatCurrency(rentabilidadLiquida)}/h`;
            rentabilidadLiquidaValor.className = rentabilidadLiquida >= 0 ? 'text-base font-black text-emerald-600' : 'text-base font-black text-red-500';
        } else {
            rentabilidadBox.classList.add('hidden');
        }
    }

    // Rentabilidad por KM 
    const rentabilidadKmBox = document.getElementById('rentabilidadKmBox');
    const rentabilidadBrutaKmValor = document.getElementById('rentabilidadBrutaKmValor');
    const rentabilidadLiquidaKmValor = document.getElementById('rentabilidadLiquidaKmValor');
    if (rentabilidadKmBox && rentabilidadBrutaKmValor && rentabilidadLiquidaKmValor) {
        if (kmHoy > 0 && ingresosHoy > 0) {
            rentabilidadKmBox.classList.remove('hidden');
            rentabilidadBrutaKmValor.textContent = `${formatCurrency(ingresosHoy / kmHoy)}/km`;
            const rentabilidadLiquidaKm = balance / kmHoy;
            rentabilidadLiquidaKmValor.textContent = `${formatCurrency(rentabilidadLiquidaKm)}/km`;
            rentabilidadLiquidaKmValor.className = rentabilidadLiquidaKm >= 0 ? 'text-base font-black text-emerald-600' : 'text-base font-black text-red-500';
        } else {
            rentabilidadKmBox.classList.add('hidden');
        }
    }

    const metaBrutaBox = document.getElementById('metaBrutaBox');
    const metaBrutaValor = document.getElementById('metaBrutaValor');
    if (metaBrutaBox && metaBrutaValor) {
        if (metaGananciaNeta > 0) {
            const mantenimientoPendiente = currentHistory.reduce((sum, item) => item.isExtra ? sum : sum + Math.round(toFiniteNumber(item.maint, 0)), 0);
            const saldoEnContra = Math.max(0, Math.round(currentDeudaCombustible)) + mantenimientoPendiente;
            metaBrutaBox.classList.remove('hidden');
            updateMetricText('metaBrutaValor', formatTotal(metaGananciaNeta + saldoEnContra));
        } else {
            metaBrutaBox.classList.add('hidden');
        }
    }

    updateProgressRing(balance, metaGananciaNeta);
    updateModuleValueBadges();
}

function createConfetti(element) {
    const colors = ['#10b981', '#34d399', '#6ee7b7', '#fbbf24', '#f59e0b', '#ec4899', '#8b5cf6'];
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    for (let i = 0; i < 7; i++) {
        const p = document.createElement('div');
        p.className = 'confetti-particle';
        p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        p.style.left = `${centerX}px`;
        p.style.top = `${centerY}px`;
        const angle = (Math.PI * 2 * i) / 7;
        const velocity = 28 + Math.random() * 46;
        p.style.setProperty('--tx', `${Math.cos(angle) * velocity}px`);
        p.style.setProperty('--ty', `${Math.sin(angle) * velocity - 58}px`);
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 820);
    }
}

async function agregarDeuda() {
    navigator.vibrate?.(8);
    const kmHoy = getInputVal('kmHoy');
    if (kmHoy <= 0) {
        showToast('No se puede agregar al historial con 0 km.', 'warning');
        return;
    }

    if (currentGrandTotal <= 0 && !confirm('El total calculado es 0. Deseas guardarlo de todas formas?')) {
        showToast('Registro cancelado.', 'info');
        return;
    }
    const horasTotales = getInputVal('horasTrabajadas') + (getInputVal('minutosTrabajados') / 60);
    const ingresosHoy = getInputVal('ingresosHoy');

    const item = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        fechaISO: getLocalISODate(),
        fecha: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
        hora: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        gas: Math.round(currentGasTotal),
        maint: Math.round(currentMaintTotal),
        kms: Math.round(kmHoy),
        horas: Math.round(horasTotales * 100) / 100,
        ingresos: Math.round(ingresosHoy),
        total: Math.round(currentGasTotal + currentMaintTotal),
        isExtra: false
    };



    const btn = document.querySelector('[onclick="agregarDeuda()"]');
    let result;
    try {
        result = await runActionWithFeedback(btn, {
            loading: 'Guardando...',
            success: 'Agregado',
            pending: 'Pendiente offline',
            error: 'No guardado'
        }, async () => {
            const updatedHistory = await addHistoryItemToCloud(item);
            if (!Array.isArray(updatedHistory)) throw new Error('No se pudo guardar el registro en historial.');
            return {
                updatedHistory,
                feedbackMode: feedbackModeFromWriteModes(lastHistoryWriteMode)
            };
        }, 'agregarDeuda');
    } catch (error) {
        showToast(error?.message || 'No se pudo guardar el registro en historial.', 'error');
        return;
    }

    if (result?.feedbackMode === 'skipped') return;

    currentHistory = result.updatedHistory;
    lastHistoryHash = '';
    renderHistorialFromData(result.updatedHistory);
    if (btn && result.feedbackMode !== 'pending') createConfetti(btn);

    const kmHoyInput = document.getElementById('kmHoy');
    const ingresosInput = document.getElementById('ingresosHoy');
    if (kmHoyInput) kmHoyInput.value = '';
    if (ingresosInput) ingresosInput.value = '';
    calcular();
    mostrarHistorialSegunPantalla();
    showToast(result.feedbackMode === 'pending' ? 'Deuda guardada en cola offline.' : 'Deuda agregada al historial.', result.feedbackMode === 'pending' ? 'warning' : 'success');
}

async function guardarExtra() {
    const descInput = document.getElementById('extraDesc');
    const montoInput = document.getElementById('extraMonto');
    const desc = (descInput?.value || '').trim();
    const monto = parseFloat(montoInput?.value || '');
    if (!desc || !Number.isFinite(monto)) {
        showToast('Ingresa una descripcion y un monto valido.', 'warning');
        return;
    }

    let result;
    try {
        result = await runActionWithFeedback('[onclick="guardarExtra()"]', {
            loading: 'Guardando...',
            success: 'Agregado',
            pending: 'Pendiente offline',
            error: 'No guardado'
        }, async () => {
            const updatedHistory = await addHistoryItemToCloud({
                id: Date.now() + Math.floor(Math.random() * 1000),
                fechaISO: getLocalISODate(),
                fecha: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
                hora: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                gas: 0,
                maint: 0,
                total: Math.round(monto),
                descripcion: desc,
                isExtra: true
            });
            if (!Array.isArray(updatedHistory)) throw new Error('No se pudo guardar el movimiento extra.');
            return {
                updatedHistory,
                feedbackMode: feedbackModeFromWriteModes(lastHistoryWriteMode)
            };
        }, 'guardarExtra');
    } catch (error) {
        showToast(error?.message || 'No se pudo guardar el movimiento extra.', 'error');
        return;
    }

    if (result?.feedbackMode === 'skipped') return;

    currentHistory = result.updatedHistory;
    lastHistoryHash = '';
    renderHistorialFromData(result.updatedHistory);
    if (descInput) descInput.value = '';
    if (montoInput) montoInput.value = '';
    showToast(result.feedbackMode === 'pending' ? 'Movimiento extra guardado en cola offline.' : 'Movimiento extra agregado.', result.feedbackMode === 'pending' ? 'warning' : 'success');
    mostrarHistorialSegunPantalla();
}
function createCoinEffect(element) {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    for (let i = 0; i < 4; i++) {
        const coin = document.createElement('div');
        coin.className = 'coin-particle';
        coin.innerText = '$';
        const offsetX = (Math.random() - 0.5) * 42;
        const fallDistance = 42 + Math.random() * 42;
        const rotation = 90 + Math.random() * 220;
        const delay = Math.random() * 0.2;
        coin.style.left = `${centerX + offsetX}px`;
        coin.style.top = `${centerY}px`;
        coin.style.setProperty('--fall-distance', `${fallDistance}px`);
        coin.style.setProperty('--rotation', `${rotation}deg`);
        coin.style.animationDelay = `${delay}s`;
        document.body.appendChild(coin);
        setTimeout(() => coin.remove(), 1000 + delay * 1000);
    }
}

async function saldarDeuda(id) {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return;
    const actionKey = `saldarDeuda_${numericId}`;
    if (typeof inFlightActions !== 'undefined' && inFlightActions.has(actionKey)) return;
    if (!confirm('Ya generaste este dinero? Al saldar, se borrara de la lista.')) {
        showToast('Operacion cancelada.', 'info');
        return;
    }
    if (typeof inFlightActions !== 'undefined') inFlightActions.add(actionKey);

    const applySideEffects = async (item) => {
        if (!item) return { maint: 0, kms: 0 };
        const maint = Math.max(0, toFiniteNumber(item.maint, 0));
        if (maint > 0) {
            const ahorroInput = document.getElementById('ahorroActual');
            if (ahorroInput) {
                const nuevoAhorro = (parseFloat(ahorroInput.value) || 0) + maint;
                ahorroInput.value = nuevoAhorro;
                await saveSettingToCloudNow('ahorroActual', nuevoAhorro);
            }
        }
        const kms = Math.max(0, toFiniteNumber(item.kms, 0));
        if (kms > 0) {
            const kmRec = document.getElementById('kmRecorridosCiclo');
            if (kmRec) {
                const nuevosKm = (parseFloat(kmRec.value) || 0) + kms;
                kmRec.value = nuevosKm;
                await saveSettingToCloudNow('kmRecorridosCiclo', nuevosKm);
            }
        }
        return { maint: Math.round(maint), kms: Math.round(kms) };
    };

    const removeItem = async () => {
        let removed = null;
        const updatedHistory = await mutateHistoryCloud((items) => {
            removed = null;
            const next = [];
            for (const item of items) {
                if (item.id === numericId && !removed) removed = item;
                else next.push(item);
            }
            return next;
        }, { errorLog: 'Error saldando deuda:', alertMessage: 'No se pudo saldar la deuda.' });
        return { updatedHistory, removed };
    };

    const btn = document.querySelector(`[data-action="saldar"][data-id="${numericId}"]`) || document.querySelector(`button[onclick="saldarDeuda(${numericId})"]`);
    const row = btn?.closest('[role="listitem"]');

    const finalize = async () => {
        try {
            const { updatedHistory, removed } = await removeItem();
            const pagos = removed ? await applySideEffects(removed) : { maint: 0, kms: 0 };
            if (Array.isArray(updatedHistory)) {
                currentHistory = updatedHistory;
                lastHistoryHash = '';
                renderHistorialFromData(updatedHistory);
                const maintTxt = formatTotal(pagos.maint);
                const kmsTxt = pagos.kms > 0 ? ` KM acumulados: ${pagos.kms}.` : '';
                showToast(`Pago aplicado. Mantenimiento: ${maintTxt}.${kmsTxt}`, 'success', { duration: 4200 });
            } else calcular();
        } finally {
            if (typeof inFlightActions !== 'undefined') inFlightActions.delete(actionKey);
        }
    };

    if (btn && row) {
        btn.disabled = true;
        btn.style.pointerEvents = 'none';
        btn.classList.add('animate-saldado-flash');
        createCoinEffect(btn);
        row.classList.add('animate-row-fade-out');
        setTimeout(() => finalize(), 700);
    } else {
        await finalize();
    }
}

async function borrarFila(id) {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return;
    const actionKey = `borrarFila_${numericId}`;
    if (typeof inFlightActions !== 'undefined' && inFlightActions.has(actionKey)) return;
    if (!confirm('Seguro que quieres eliminar este registro?')) {
        showToast('Eliminacion cancelada.', 'info');
        return;
    }
    if (typeof inFlightActions !== 'undefined') inFlightActions.add(actionKey);

    try {
        let removed = null;
        const updatedHistory = await mutateHistoryCloud((items) => {
            removed = null;
            const next = [];
            for (const item of items) {
                if (item.id === numericId && !removed) removed = item;
                else next.push(item);
            }
            return next;
        }, { errorLog: 'Error borrando fila:', alertMessage: 'No se pudo borrar el registro.' });

        if (!Array.isArray(updatedHistory)) return;

        currentHistory = updatedHistory;
        lastHistoryHash = '';
        renderHistorialFromData(updatedHistory);
        showToast('Registro eliminado.', 'success');
    } finally {
        if (typeof inFlightActions !== 'undefined') inFlightActions.delete(actionKey);
    }
}

async function limpiarHistorial() {
    if (!confirm('Estas seguro de BORRAR TODAS las deudas?')) {
        showToast('Limpieza cancelada.', 'info');
        return;
    }
    const updatedHistory = await mutateHistoryCloud(() => [], { errorLog: 'Error limpiando historial:', alertMessage: 'No se pudo limpiar el historial.' });
    if (!Array.isArray(updatedHistory)) return;
    currentHistory = updatedHistory;
    lastHistoryHash = '';
    renderHistorialFromData(updatedHistory);
    showToast('Historial limpiado.', 'success');
}

function actualizarTotalesHistorial() {
    const rawDeudaGas = Math.round(currentDeudaCombustible);
    // Para el cálculo de la deuda total consolidada, no permitimos que el saldo a favor compense mantenimiento.
    const deudaRealGasForSum = Math.max(0, rawDeudaGas);
    const mantenimientoPendiente = currentHistory.reduce((sum, item) => item.isExtra ? sum : sum + Math.round(toFiniteNumber(item.maint, 0)), 0);
    const totalAcumulado = deudaRealGasForSum + mantenimientoPendiente;

    // Actualizar UI del bloque de Gasolina
    const gasVal = document.getElementById('historialTotalGas');
    if (gasVal) {
        if (rawDeudaGas < 0) {
            gasVal.textContent = `+${formatTotal(Math.abs(rawDeudaGas))}`;
            gasVal.className = 'text-lg font-extrabold text-emerald-600'; // Verde para saldo a favor
        } else if (rawDeudaGas > 0) {
            gasVal.textContent = formatTotal(rawDeudaGas);
            gasVal.className = 'text-lg font-extrabold text-blue-600'; // Azul para deuda de gas
        } else {
            gasVal.textContent = '$0';
            gasVal.className = 'text-lg font-extrabold text-gray-400'; // Gris para cero
        }
    }

    updateMetricText('historialTotalMaint', formatTotal(mantenimientoPendiente));

    // Actualizar UI del Gran Total Acumulado
    const gran = document.getElementById('historialGranTotal');
    if (gran) {
        if (totalAcumulado > 0) {
            gran.className = 'text-2xl font-black text-red-500'; // Rojo porque hay deuda pendiente real
            gran.textContent = formatTotal(totalAcumulado);
        } else {
            gran.className = 'text-2xl font-black text-slate-800'; // Neutro si está al día
            gran.textContent = '$0';
        }
    }
}

function actualizarPromediosHistorial() {
    const box = document.getElementById('promediosHistorialBox');
    if (!box) return;

    const items = currentHistory.filter((item) => !item.isExtra);
    const dias = new Set(items.map(getHistoryDateKey).filter(Boolean));
    const dateTimes = [...dias].map(dateKeyToUtcTime).filter(Number.isFinite);
    const diasTrabajados = dias.size;

    if (!diasTrabajados) {
        box.classList.add('hidden');
        return;
    }

    const totalGas = items.reduce((sum, item) => sum + Math.max(0, Math.round(toFiniteNumber(item.gas, 0))), 0);
    const totalMant = items.reduce((sum, item) => sum + Math.max(0, Math.round(toFiniteNumber(item.maint, 0))), 0);
    const gasDia = totalGas / diasTrabajados;
    const mantDia = totalMant / diasTrabajados;
    const totalDia = gasDia + mantDia;

    box.classList.remove('hidden');
    updateMetricText('promediosDiasTrabajados', `${items.length} registro${items.length === 1 ? '' : 's'}`);
    updateMetricText('promedioGasDia', formatTotal(gasDia));
    updateMetricText('promedioMantDia', formatTotal(mantDia));
    updateMetricText('promedioTotalDia', formatTotal(totalDia));

    const calendarioBox = document.getElementById('promediosCalendarioBox');
    const calendarioGas = document.getElementById('promedioCalendarioGas');
    const calendarioMant = document.getElementById('promedioCalendarioMant');
    const calendarioTotal = document.getElementById('promedioCalendarioTotal');
    const calendarioHint = document.getElementById('promedioCalendarioHint');
    if (calendarioBox && calendarioGas && calendarioMant && calendarioTotal && calendarioHint && dateTimes.length) {
        const minTime = Math.min(...dateTimes);
        const maxTime = Math.max(...dateTimes);
        const diasCalendario = Math.max(1, Math.round((maxTime - minTime) / 86400000) + 1);
        const gasCalendarioDia = totalGas / diasCalendario;
        const mantCalendarioDia = totalMant / diasCalendario;
        const totalCalendarioDia = gasCalendarioDia + mantCalendarioDia;
        calendarioBox.classList.toggle('hidden', diasCalendario <= diasTrabajados);
        updateMetricText('promedioCalendarioGas', formatTotal(gasCalendarioDia));
        updateMetricText('promedioCalendarioMant', formatTotal(mantCalendarioDia));
        updateMetricText('promedioCalendarioTotal', formatTotal(totalCalendarioDia));
        calendarioHint.textContent = `${diasCalendario} dias`;
    }
}

function renderHistorialExtraItem(item, delay) {
    const total = Math.round(toFiniteNumber(item.total, 0));
    const colorClass = total < 0 ? 'text-red-500' : 'text-emerald-600';
    const fecha = escapeHtml(item.fecha || '-');
    const hora = escapeHtml(item.hora || '--:--');
    const descripcion = escapeHtml(item.descripcion || 'Movimiento extra');
    return `<div role="listitem" data-item-id="${item.id}" class="animate-slide-up-fade historial-ledger-item historial-ledger-item-extra relative flex flex-col p-3.5 bg-white rounded-2xl border border-indigo-50 shadow-sm hover:border-indigo-200 transition-all group mb-2" style="animation-delay:${delay}ms;">
        <div class="absolute left-0 top-3.5 bottom-3.5 w-1 bg-indigo-500 rounded-r-full"></div>
        <div class="flex justify-between items-center gap-2">
            <div class="pl-3">
                <span class="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block mb-0.5">${fecha} · ${hora}</span>
                <div class="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                    <i data-lucide="tag" class="w-3 h-3 text-indigo-400"></i>
                    ${descripcion}
                </div>
            </div>
            <span class="font-black ${colorClass} text-lg tracking-tight">$${Math.round(total)}</span>
        </div>
        <div class="historial-actions-row flex items-center justify-between gap-2 pt-2 mt-2 border-t border-indigo-50">
            <div class="historial-actions-secondary flex items-center gap-1.5">
                <button data-action="editarExtra" data-id="${item.id}" class="historial-action-btn historial-action-soft">Editar</button>
            </div>
            <button data-action="saldar" data-id="${item.id}" class="historial-action-btn historial-action-primary">
                <i data-lucide="check" class="w-3.5 h-3.5"></i>
                <span>Saldar</span>
            </button>
        </div>
    </div>`;
}

function renderHistorialKmsItem(item, delay) {
    const gas = Math.round(toFiniteNumber(item.gas, 0));
    const maint = Math.round(toFiniteNumber(item.maint, 0));
    const total = Math.round(toFiniteNumber(item.total, gas + maint));
    const kms = Math.max(0, Math.round(toFiniteNumber(item.kms, 0)));
    const horas = Math.max(0, toFiniteNumber(item.horas, 0));
    const horasDisplay = Number.isInteger(horas) ? String(horas) : horas.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    const fecha = escapeHtml(item.fecha || '-');
    const hora = escapeHtml(item.hora || '--:--');
    return `<div role="listitem" data-item-id="${item.id}" class="animate-slide-up-fade historial-ledger-item relative flex flex-col p-3.5 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg transition-all group mb-2 hover-lift" style="animation-delay:${delay}ms;">
        <div class="flex justify-between items-start gap-2 mb-2.5">
            <div>
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 block">${fecha}</span>
                <span class="text-[11px] font-medium text-slate-500">${hora}</span>
            </div>
            <div class="text-right">
                <span class="block text-xl font-black text-slate-800 tracking-tight">$${Math.round(total)}</span>
                <span class="text-[10px] font-bold text-slate-400 uppercase">Total Ref</span>
            </div>
        </div>
        <div class="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50 rounded-xl mb-2.5 text-[11px]">
            <span class="historial-mini-badge"><i data-lucide="route" class="w-3 h-3"></i>${kms} km</span>
            ${horas > 0 ? `<span class="historial-mini-badge"><i data-lucide="clock" class="w-3 h-3"></i>${horasDisplay}h</span>` : ''}
            <span class="historial-mini-badge"><i data-lucide="fuel" class="w-3 h-3"></i>$${gas} ref</span>
            <span class="historial-mini-badge"><i data-lucide="wrench" class="w-3 h-3"></i>$${maint} mant</span>
        </div>
        <div class="historial-actions-row flex items-center justify-between gap-2 pt-2 border-t border-slate-50">
            <div class="historial-actions-secondary flex items-center gap-1.5">
                <button data-action="editar" data-id="${item.id}" class="historial-action-btn historial-action-soft">Editar</button>
                <button data-action="borrar" data-id="${item.id}" class="historial-action-btn historial-action-danger">Borrar</button>
            </div>
            <div class="historial-actions-primary flex items-center gap-1.5">
                <button data-action="parcial" data-id="${item.id}" class="historial-action-btn historial-action-warning">
                    <i data-lucide="minus-circle" class="w-3.5 h-3.5"></i>
                    <span>Parcial</span>
                </button>
                <button data-action="saldar" data-id="${item.id}" class="historial-action-btn historial-action-success">
                    <i data-lucide="check" class="w-3.5 h-3.5"></i>
                    <span>Saldar</span>
                </button>
            </div>
        </div>
    </div>`;
}

function buildHistorialGroup(title, subtitle, tone, items, offset = 0) {
    if (!items.length) return '';
    const colors = tone === 'extra'
        ? { badge: 'bg-indigo-50 text-indigo-600 border-indigo-200', line: 'bg-indigo-100', text: 'text-indigo-500' }
        : { badge: 'bg-slate-100 text-slate-600 border-slate-200', line: 'bg-slate-100', text: 'text-slate-500' };

    const cards = items.map((item, index) => {
        const delay = (offset + index) * 50;
        return item.isExtra ? renderHistorialExtraItem(item, delay) : renderHistorialKmsItem(item, delay);
    }).join('');

    let footerCobro = '';
    if (tone === 'kms') {
        const totalMaintPendiente = items.reduce((sum, item) => item.isExtra ? sum : sum + Math.max(0, Math.round(toFiniteNumber(item.maint, 0))), 0);
        if (totalMaintPendiente > 0) {
            footerCobro = `
            <div id="boxCobroCascadaKms" class="mt-3 p-3 rounded-2xl transition-all">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <i data-lucide="coins" class="w-3.5 h-3.5 text-emerald-600"></i>
                        Cobro rápido en cascada
                    </span>
                    <button type="button" onclick="llenarTodoCobroCascadaKms(${totalMaintPendiente})" class="btn-cobro-cascada-todo text-[10px] font-bold text-emerald-700 bg-emerald-100/80 hover:bg-emerald-200/80 px-2.5 py-0.5 rounded-full border border-emerald-200 transition-all">
                        Pagar Todo ($${totalMaintPendiente})
                    </button>
                </div>
                <div class="flex items-center gap-2">
                    <div class="relative flex-1">
                        <span class="cobro-cascada-currency absolute left-3 top-1/2 -translate-y-1/2 text-sm font-extrabold text-slate-400">$</span>
                        <input type="number" id="cobroCascadaKmsMonto" placeholder="0" min="1" max="${totalMaintPendiente}"
                            class="w-full pl-7 pr-3 py-2 bg-white rounded-xl border border-slate-200 font-extrabold text-slate-800 text-sm outline-none focus:ring-2 focus:ring-emerald-200 transition-all text-left">
                    </div>
                    <button type="button" id="btnCobroCascadaKms" onclick="ejecutarCobroCascadaKms()"
                        class="px-4 py-2 btn-premium btn-premium-success btn-ripple text-xs font-extrabold rounded-xl flex items-center gap-1.5 shrink-0">
                        <i data-lucide="check" class="w-3.5 h-3.5"></i>
                        <span>Cobrar</span>
                    </button>
                </div>
            </div>`;
        }
    }

    return `<section class="historial-group rounded-2xl border border-slate-100 p-3.5 bg-gradient-to-b from-white to-slate-50/40">
        <header class="flex items-center justify-between mb-2">
            <span class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-[10px] font-extrabold uppercase tracking-wider ${colors.badge}">
                <i data-lucide="${tone === 'extra' ? 'tag' : 'route'}" class="w-3 h-3"></i>
                ${title}
            </span>
            <span class="text-[10px] font-bold uppercase tracking-[0.16em] ${colors.text}">${subtitle}</span>
        </header>
        <div class="h-px w-full ${colors.line} mb-2.5 opacity-70"></div>
        ${cards}
        ${footerCobro}
    </section>`;
}

function renderHistorialFromData(historial) {
    const safeHistorial = normalizeHistoryArray(historial);
    const newHash = JSON.stringify(safeHistorial);
    if (newHash === lastHistoryHash) return;
    lastHistoryHash = newHash;
    currentHistory = safeHistorial;

    const container = document.getElementById('seccionHistorial');
    const lista = document.getElementById('listaHistorial');
    if (!container || !lista) return;

    if (safeHistorial.length === 0) {
        lista.innerHTML = `
            <div class="mobile-empty-state historial-empty-state">
                <div class="mobile-empty-icon">
                    <i data-lucide="clock-3" class="w-7 h-7"></i>
                </div>
                <h3>Aun no tienes movimientos</h3>
                <p>Agrega tus kilometros del dia y aqui veras el historial de gastos, mantenimiento y extras.</p>
                <button type="button" class="mobile-empty-action" data-mobile-nav="cierre">
                    Agregar primer registro
                    <i data-lucide="arrow-right" class="w-4 h-4"></i>
                </button>
            </div>
        `;
        lista.querySelector('[data-mobile-nav="cierre"]')?.addEventListener('click', () => {
            openMobileNavDestination('cierre');
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();

        if (isDesktopViewport() && !container.classList.contains('desktop-module-active')) {
            container.classList.add('hidden');
            cerrarHistorialDesktopModal();
        } else {
            container.classList.remove('hidden');
        }

        syncDesktopHistorialTrigger();
        actualizarTotalesHistorial();
        actualizarPromediosHistorial();
        calcular();
        return;
    }

    container.classList.remove('hidden');

    const orderedItems = [...safeHistorial].reverse();
    const kmsItems = orderedItems.filter((item) => !item.isExtra);
    const extraItems = orderedItems.filter((item) => item.isExtra);

    const groups = [
        buildHistorialGroup('Kilometraje', `${kmsItems.length} movimiento${kmsItems.length === 1 ? '' : 's'}`, 'kms', kmsItems, 0),
        buildHistorialGroup('Mov extras', `${extraItems.length} movimiento${extraItems.length === 1 ? '' : 's'}`, 'extra', extraItems, kmsItems.length)
    ].filter(Boolean);

    lista.innerHTML = groups.join('<div class="h-2"></div>');

    actualizarTotalesHistorial();
    actualizarPromediosHistorial();
    syncDesktopHistorialTrigger();

    if (typeof lucide !== 'undefined') lucide.createIcons();
    calcular();
}
function abrirModalEdicion(id) {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return;
    const item = currentHistory.find((row) => row.id === numericId);
    if (!item) return;
    editId = numericId;
    const gas = document.getElementById('editGas');
    const maint = document.getElementById('editMaint');
    if (gas) gas.value = item.gas || 0;
    if (maint) maint.value = item.maint || 0;
    calcularTotalEdicion();
    document.getElementById('modalEditor')?.classList.remove('hidden');
}

function cerrarModal() {
    document.getElementById('modalEditor')?.classList.add('hidden');
    editId = null;
}

function calcularTotalEdicion() {
    const total = getInputVal('editGas') + getInputVal('editMaint');
    const display = document.getElementById('editTotalDisplay');
    if (!display) return;
    display.textContent = formatTotal(total);
    display.className = total < 0 ? 'text-2xl font-black text-red-500' : 'text-2xl font-black text-slate-800';
}

async function guardarEdicion() {
    if (!editId) return;
    const gas = Math.round(getInputVal('editGas'));
    const maint = Math.round(getInputVal('editMaint'));
    const total = gas + maint;
    const targetId = editId;

    let result;
    try {
        result = await runActionWithFeedback('[onclick="guardarEdicion()"]', {
            loading: 'Guardando...',
            success: 'Actualizado',
            pending: 'Pendiente offline',
            error: 'No guardado'
        }, async () => {
            const updatedHistory = await mutateHistoryCloud((items) => items.map((item) => (item.id === targetId ? { ...item, gas, maint, total } : item)), {
                errorLog: 'Error guardando edicion:',
                alertMessage: 'No se pudo guardar la edicion.'
            });
            if (!Array.isArray(updatedHistory)) throw new Error('No se pudo guardar la edicion.');
            return {
                updatedHistory,
                feedbackMode: feedbackModeFromWriteModes(lastHistoryWriteMode)
            };
        }, 'guardarEdicion');
    } catch (error) {
        showToast(error?.message || 'No se pudo guardar la edicion.', 'error');
        return;
    }

    if (result?.feedbackMode === 'skipped') return;

    currentHistory = result.updatedHistory;
    lastHistoryHash = '';
    renderHistorialFromData(result.updatedHistory);
    cerrarModal();
    showToast(result.feedbackMode === 'pending' ? 'Edicion guardada en cola offline.' : 'Registro actualizado.', result.feedbackMode === 'pending' ? 'warning' : 'success');
    calcular();
}

function abrirModalParcial(id) {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return;
    const item = currentHistory.find((row) => row.id === numericId);
    if (!item) return;
    parcialId = numericId;
    parcialCategoria = 'maint';

    const maint = Math.max(0, Math.round(toFiniteNumber(item.maint, 0)));
    if (maint <= 0) {
        parcialId = null;
        parcialCategoria = null;
        showToast('Este registro no tiene mantenimiento pendiente.', 'info');
        return;
    }

    toggleBox('parcialInfoDeuda', true);
    toggleBox('parcialMontoBox', true);
    const montoInput = document.getElementById('parcialMonto');
    updateText('parcialDeudaPendiente', formatTotal(maint));
    updateText('parcialResta', `Restan: ${formatTotal(maint)}`);

    if (montoInput) {
        montoInput.value = '';
        montoInput.max = maint;
        montoInput.oninput = () => {
            const val = parseFloat(montoInput.value) || 0;
            const resta = Math.max(0, maint - val);
            updateText('parcialResta', `Restan: ${formatTotal(resta)}`);
        };
    }

    document.getElementById('modalParcial')?.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
    montoInput?.focus();
}

function cerrarModalParcial() {
    document.getElementById('modalParcial')?.classList.add('hidden');
    parcialId = null;
    parcialCategoria = null;
}

function seleccionarCategoriaParcial() {
    // Compatibilidad: ahora el pago parcial es solo para mantenimiento.
}

async function guardarParcial() {
    if (!parcialId) return;
    const item = currentHistory.find((row) => row.id === parcialId);
    if (!item) return;

    const montoInput = document.getElementById('parcialMonto');
    const montoPago = Math.round(parseFloat(montoInput?.value || '0') || 0);
    if (montoPago <= 0) {
        showToast('Ingresa un monto valido mayor a 0.', 'warning');
        return;
    }

    const deudaActual = Math.max(0, Math.round(toFiniteNumber(item.maint, 0)));

    if (montoPago > deudaActual) {
        showToast(`El monto (${formatTotal(montoPago)}) supera la deuda pendiente (${formatTotal(deudaActual)}).`, 'warning');
        return;
    }

    const targetId = parcialId;
    const deduccionReal = Math.min(deudaActual, montoPago);
    const saldadoCompleto = deduccionReal >= deudaActual;
    const kmsASumar = saldadoCompleto ? Math.max(0, Math.round(toFiniteNumber(item.kms, 0))) : 0;

    let result;
    try {
        result = await runActionWithFeedback('[onclick="guardarParcial()"]', {
            loading: 'Aplicando...',
            success: 'Aplicado',
            pending: 'Pendiente offline',
            error: 'No aplicado'
        }, async () => {
            const updatedHistory = await mutateHistoryCloud((items) => {
                if (saldadoCompleto) {
                    return items.filter((it) => it.id !== targetId);
                }
                return items.map((it) => {
                    if (it.id !== targetId) return it;
                    const newGas = Math.round(toFiniteNumber(it.gas, 0));
                    const newMaint = Math.max(0, Math.round(toFiniteNumber(it.maint, 0)) - deduccionReal);
                    const newTotal = newGas + newMaint;
                    return { ...it, gas: newGas, maint: newMaint, total: newTotal };
                });
            }, {
                errorLog: 'Error guardando pago parcial:',
                alertMessage: 'No se pudo guardar el pago parcial.'
            });

            if (!Array.isArray(updatedHistory)) throw new Error('No se pudo guardar el pago parcial.');

            let settingMode = 'cloud';
            let settingModeKm = 'cloud';
            const ahorroInput = document.getElementById('ahorroActual');
            if (ahorroInput && deduccionReal > 0) {
                const nuevoAhorro = (parseFloat(ahorroInput.value) || 0) + deduccionReal;
                ahorroInput.value = nuevoAhorro;
                settingMode = (await saveSettingToCloudNow('ahorroActual', nuevoAhorro)).mode;
            }

            if (kmsASumar > 0) {
                const kmRec = document.getElementById('kmRecorridosCiclo');
                if (kmRec) {
                    const nuevosKm = (parseFloat(kmRec.value) || 0) + kmsASumar;
                    kmRec.value = nuevosKm;
                    settingModeKm = (await saveSettingToCloudNow('kmRecorridosCiclo', nuevosKm)).mode;
                }
            }

            return {
                updatedHistory,
                deduccionReal,
                saldadoCompleto,
                kmsASumar,
                feedbackMode: feedbackModeFromWriteModes(lastHistoryWriteMode, settingMode, settingModeKm)
            };
        }, 'guardarParcial');
    } catch (error) {
        showToast(error?.message || 'No se pudo guardar el pago parcial.', 'error');
        return;
    }

    if (result?.feedbackMode === 'skipped') return;

    currentHistory = result.updatedHistory;
    lastHistoryHash = '';
    renderHistorialFromData(result.updatedHistory);
    cerrarModalParcial();

    const kmsMsg = result.kmsASumar > 0 ? ` (+${result.kmsASumar} km acumulados)` : '';
    const detalleMsg = result.saldadoCompleto
        ? `Registro saldado por completo: ${formatTotal(deduccionReal)}${kmsMsg}.`
        : `Pago parcial aplicado. Mantenimiento abonado: ${formatTotal(deduccionReal)}.`;

    showToast(
        result.feedbackMode === 'pending'
            ? `Operación registrada en cola offline: ${formatTotal(deduccionReal)}.`
            : detalleMsg,
        result.feedbackMode === 'pending' ? 'warning' : 'success',
        { duration: result.saldadoCompleto ? 4200 : 3200 }
    );
    calcular();
}

function ajustarMontoParcial(delta) {
    if (!parcialId) return;
    const item = currentHistory.find((row) => row.id === parcialId);
    if (!item) return;
    const deuda = Math.max(0, Math.round(toFiniteNumber(item.maint, 0)));
    const montoInput = document.getElementById('parcialMonto');
    if (!montoInput) return;
    const current = parseFloat(montoInput.value) || 0;
    const nuevo = Math.max(0, Math.min(deuda, current + delta));
    montoInput.value = nuevo;
    const resta = Math.max(0, deuda - nuevo);
    updateText('parcialResta', `Restan: ${formatTotal(resta)}`);
}

function llenarTodoParcial() {
    if (!parcialId) return;
    const item = currentHistory.find((row) => row.id === parcialId);
    if (!item) return;
    const deuda = Math.max(0, Math.round(toFiniteNumber(item.maint, 0)));
    const montoInput = document.getElementById('parcialMonto');
    if (!montoInput) return;
    montoInput.value = deuda;
    updateText('parcialResta', `Restan: ${formatTotal(0)}`);
}

function llenarTodoCobroCascadaKms(monto) {
    const input = document.getElementById('cobroCascadaKmsMonto');
    if (!input) return;
    input.value = Math.max(0, Math.round(Number(monto) || 0));
    input.focus();
}

async function ejecutarCobroCascadaKms() {
    const input = document.getElementById('cobroCascadaKmsMonto');
    const monto = Math.round(parseFloat(input?.value || '0') || 0);
    const kmsItems = (Array.isArray(currentHistory) ? currentHistory : []).filter((item) => !item.isExtra);
    const totalMaintPendiente = kmsItems.reduce((sum, item) => sum + Math.max(0, Math.round(toFiniteNumber(item.maint, 0))), 0);

    if (monto <= 0) {
        showToast('Ingresa un monto valido mayor a 0.', 'warning');
        return;
    }

    if (monto > totalMaintPendiente) {
        showToast(`El monto (${formatTotal(monto)}) supera el total pendiente de mantenimiento (${formatTotal(totalMaintPendiente)}).`, 'warning');
        return;
    }

    let resultFIFO = applyFIFOPaymentToKmsHistory(currentHistory, monto);
    if (!resultFIFO || resultFIFO.maintAbonado <= 0) {
        showToast('No se pudo aplicar el cobro.', 'warning');
        return;
    }

    const btn = document.getElementById('btnCobroCascadaKms');
    let result;
    try {
        result = await runActionWithFeedback(btn, {
            loading: 'Cobrando...',
            success: 'Cobrado',
            pending: 'Pendiente offline',
            error: 'No cobrado'
        }, async () => {
            let txResultFIFO = null;
            const updatedHistory = await mutateHistoryCloud((items) => {
                txResultFIFO = applyFIFOPaymentToKmsHistory(items, monto);
                return txResultFIFO.updatedHistory;
            }, {
                errorLog: 'Error guardando cobro en cascada de kms:',
                alertMessage: 'No se pudo guardar el cobro en cascada.'
            });
            if (txResultFIFO) resultFIFO = txResultFIFO;

            if (!Array.isArray(updatedHistory)) throw new Error('No se pudo guardar el cobro en cascada.');

            let settingModeAhorro = 'cloud';
            let settingModeKm = 'cloud';

            // Actualizar ahorroActual si hubo dinero abonado a mantenimiento
            if (resultFIFO.maintAbonado > 0) {
                const ahorroInput = document.getElementById('ahorroActual');
                if (ahorroInput) {
                    const nuevoAhorro = (parseFloat(ahorroInput.value) || 0) + resultFIFO.maintAbonado;
                    ahorroInput.value = nuevoAhorro;
                    const resAhorro = await saveSettingToCloudNow('ahorroActual', nuevoAhorro);
                    settingModeAhorro = resAhorro?.mode || 'cloud';
                }
            }

            // Actualizar kmRecorridosCiclo si se saldaron tarjetas completas
            if (resultFIFO.kmsAcumulados > 0) {
                const kmRec = document.getElementById('kmRecorridosCiclo');
                if (kmRec) {
                    const nuevosKm = (parseFloat(kmRec.value) || 0) + resultFIFO.kmsAcumulados;
                    kmRec.value = nuevosKm;
                    const resKm = await saveSettingToCloudNow('kmRecorridosCiclo', nuevosKm);
                    settingModeKm = resKm?.mode || 'cloud';
                }
            }

            return {
                updatedHistory,
                resultFIFO,
                feedbackMode: feedbackModeFromWriteModes(lastHistoryWriteMode, settingModeAhorro, settingModeKm)
            };
        }, 'ejecutarCobroCascadaKms');
    } catch (error) {
        showToast(error?.message || 'No se pudo guardar el cobro en cascada.', 'error');
        return;
    }

    if (result?.feedbackMode === 'skipped') return;

    currentHistory = result.updatedHistory;
    lastHistoryHash = '';
    renderHistorialFromData(result.updatedHistory);

    const saldadosTxt = resultFIFO.saldadosCount > 0
        ? `Se sald${resultFIFO.saldadosCount === 1 ? 'o 1 registro' : `aron ${resultFIFO.saldadosCount} registros`} (+${resultFIFO.kmsAcumulados} km).`
        : '';
    const parcialTxt = resultFIFO.parcialAplicado ? ' Pago parcial aplicado a la siguiente tarjeta.' : '';
    const toastMsg = `Cobro aplicado: ${formatTotal(resultFIFO.maintAbonado)}. ${saldadosTxt}${parcialTxt} Ahorro: +${formatTotal(resultFIFO.maintAbonado)}.`;

    showToast(toastMsg, result.feedbackMode === 'pending' ? 'warning' : 'success', { duration: 4500 });
    if (typeof calcular === 'function') calcular();
}

const inputs = document.querySelectorAll('.input-calc');
inputs.forEach((input) => {
    input.addEventListener('input', (event) => {
        const inputId = String(event.target?.id || '').trim();
        if (settingsInputSet.has(inputId)) {
            window.saveInputToCloud?.(inputId, event.target.value);
        }
        calcular();
    });
});

document.querySelectorAll('input[type="number"], input[type="text"]').forEach((input) => {
    input.addEventListener('focus', (event) => {
        setTimeout(() => event.target.select(), 0);
    });
});

function focusNextVisibleInput(currentInput) {
    const inputs = Array.from(document.querySelectorAll('input[type="number"], input[type="text"]'))
        .filter((el) => !el.disabled && !el.readOnly && el.getClientRects().length > 0);
    const idx = inputs.indexOf(currentInput);
    if (idx >= 0 && idx < inputs.length - 1) {
        const next = inputs[idx + 1];
        next.focus();
        next.select?.();
        return true;
    }
    currentInput.blur();
    return false;
}

function handleEnterForInput(inputEl) {
    const id = inputEl.id || '';
    const actionById = {
        syncIdInput: manejarClickSincronizar,
        kmHoy: agregarDeuda,
        cargaGasolina: cargarGasolina,
        pagoDeudaCombustibleMonto: guardarPagoDeudaCombustible,
        cobroCascadaKmsMonto: ejecutarCobroCascadaKms,
        extraMonto: guardarExtra,
        editGas: guardarEdicion,
        editMaint: guardarEdicion,
        parcialMonto: guardarParcial,
        editExtraMonto: guardarEdicionExtra,
        editDeudaCombustible: guardarEdicionDeudaCombustible
    };

    if (id === 'extraDesc' || id === 'editExtraDesc') {
        return focusNextVisibleInput(inputEl);
    }
    if (id === 'descuentoMantenimiento') {
        return;
    }

    const action = actionById[id];
    if (typeof action === 'function') {
        action();
        return true;
    }
    return focusNextVisibleInput(inputEl);
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        if (!document.getElementById('modalEditor')?.classList.contains('hidden')) return cerrarModal();
        if (!document.getElementById('modalParcial')?.classList.contains('hidden')) return cerrarModalParcial();
        if (!document.getElementById('modalPagoDeudaCombustible')?.classList.contains('hidden')) return cerrarModalPagoDeudaCombustible();
        if (!document.getElementById('modalEditarExtra')?.classList.contains('hidden')) return cerrarModalExtra();
        if (!document.getElementById('modalDeudaCombustible')?.classList.contains('hidden')) return cerrarModalDeudaCombustible();
        if (!document.getElementById('modalVehiculo')?.classList.contains('hidden')) return cerrarModalVehiculo();
        if (document.getElementById('sheetCargaKm')?.classList.contains('bottom-sheet-open')) return closeQuickSheet('km');
        if (document.getElementById('sheetCargaGasolina')?.classList.contains('bottom-sheet-open')) return closeQuickSheet('gasolina');
        if (document.getElementById('mobileBottomNavContainer')?.classList.contains('speed-dial-active')) return toggleSpeedDial(false);
        if (document.body.classList.contains('mobile-module-open')) return closeMobileModule();
        if (document.body.classList.contains('desktop-history-modal-open')) return cerrarHistorialDesktopModal();
    }
    if (event.key !== 'Enter' || event.isComposing) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.type !== 'number' && target.type !== 'text') return;
    event.preventDefault();
    handleEnterForInput(target);
});

const listaHistorial = document.getElementById('listaHistorial');
if (listaHistorial) {
    listaHistorial.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        const action = button.dataset.action;
        const id = Number(button.dataset.id);
        if (!Number.isFinite(id)) return;
        if (action === 'editar') abrirModalEdicion(id);
        if (action === 'editarExtra') editarExtra(id);
        if (action === 'parcial') abrirModalParcial(id);
        if (action === 'borrar') borrarFila(id);
        if (action === 'saldar') saldarDeuda(id);
    });
}

const deudaCombustibleModal = document.getElementById('modalDeudaCombustible');
if (deudaCombustibleModal) {
    deudaCombustibleModal.addEventListener('click', (event) => {
        if (event.target === deudaCombustibleModal) cerrarModalDeudaCombustible();
    });
}

const pagoDeudaCombustibleModal = document.getElementById('modalPagoDeudaCombustible');
if (pagoDeudaCombustibleModal) {
    pagoDeudaCombustibleModal.addEventListener('click', (event) => {
        if (event.target === pagoDeudaCombustibleModal) cerrarModalPagoDeudaCombustible();
    });
}

const inputDescuentoEl = document.getElementById('descuentoMantenimiento');
if (inputDescuentoEl) {
    inputDescuentoEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            aplicarDescuentoMantenimiento();
        }
    });
}

async function editarExtra(id) {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return;
    const item = currentHistory.find((row) => row.id === numericId);
    if (!item) return;
    editExtraId = numericId;

    const descInput = document.getElementById('editExtraDesc');
    const montoInput = document.getElementById('editExtraMonto');
    if (descInput) descInput.value = item.descripcion || '';
    if (montoInput) montoInput.value = item.total || 0;

    document.getElementById('modalEditarExtra')?.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function cerrarModalExtra() {
    document.getElementById('modalEditarExtra')?.classList.add('hidden');
    editExtraId = null;
}

async function guardarEdicionExtra() {
    if (!editExtraId) return;
    const desc = (document.getElementById('editExtraDesc')?.value || '').trim().slice(0, 120);
    const montoRaw = document.getElementById('editExtraMonto')?.value ?? '';
    const montoNumber = parseFloat(montoRaw);

    if (!desc) {
        showToast('La descripcion no puede estar vacia.', 'warning');
        return;
    }

    if (!Number.isFinite(montoNumber) || montoNumber === 0) {
        showToast('Ingresa un monto valido distinto de 0.', 'warning');
        return;
    }

    const monto = Math.round(montoNumber);

    const targetId = editExtraId;
    let result;
    try {
        result = await runActionWithFeedback('[onclick="guardarEdicionExtra()"]', {
            loading: 'Guardando...',
            success: 'Actualizado',
            pending: 'Pendiente offline',
            error: 'No guardado'
        }, async () => {
            const updatedHistory = await mutateHistoryCloud((items) => items.map((it) => {
                if (it.id !== targetId) return it;
                return { ...it, descripcion: desc, total: monto };
            }), {
                errorLog: 'Error editando extra:',
                alertMessage: 'No se pudo editar el movimiento extra.'
            });
            if (!Array.isArray(updatedHistory)) throw new Error('No se pudo editar el movimiento extra.');
            return {
                updatedHistory,
                feedbackMode: feedbackModeFromWriteModes(lastHistoryWriteMode)
            };
        }, 'guardarEdicionExtra');
    } catch (error) {
        showToast(error?.message || 'No se pudo editar el movimiento extra.', 'error');
        return;
    }

    if (result?.feedbackMode === 'skipped') return;

    currentHistory = result.updatedHistory;
    lastHistoryHash = '';
    renderHistorialFromData(result.updatedHistory);
    cerrarModalExtra();
    showToast(result.feedbackMode === 'pending' ? 'Movimiento extra actualizado en cola offline.' : 'Movimiento extra actualizado.', result.feedbackMode === 'pending' ? 'warning' : 'success');
}

async function cargarGasolina() {
    const input = document.getElementById('cargaGasolina');
    const monto = normalizeDeudaCombustibleMonto(input?.value);
    if (monto === null) {
        showToast('Ingresa un monto valido mayor a 0 para la carga de gasolina.', 'warning');
        return;
    }

    const deudaBase = normalizeDeudaCombustibleMonto(currentDeudaCombustible, true, true) ?? 0;
    const historialBase = [...currentFuelHistory];
    const nuevaDeuda = Math.round(deudaBase + monto);
    const nuevaCarga = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        monto,
        fecha: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
        hora: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        fechaISO: getLocalISODate()
    };
    const nuevoHistorial = [nuevaCarga, ...currentFuelHistory].slice(0, 5);

    const btn = document.querySelector('[onclick="cargarGasolina()"]');
    let result;
    try {
        result = await runActionWithFeedback(btn, {
            loading: 'Guardando...',
            success: 'Cargado',
            pending: 'Pendiente offline',
            error: 'No guardado'
        }, async () => {
            currentDeudaCombustible = nuevaDeuda;
            currentFuelHistory = nuevoHistorial;
            actualizarUIDeudaCombustible(currentDeudaCombustible);
            renderHistorialCargasGas(currentFuelHistory);
            const settingResult = await saveFuelStateToCloud(currentDeudaCombustible, currentFuelHistory);
            return {
                feedbackMode: feedbackModeFromWriteModes(settingResult.mode)
            };
        }, 'cargarGasolina');
    } catch (error) {
        currentDeudaCombustible = deudaBase;
        currentFuelHistory = historialBase;
        actualizarUIDeudaCombustible(deudaBase);
        renderHistorialCargasGas(historialBase);
        showToast(error?.message || 'No se pudo guardar la carga de gasolina.', 'error');
        return;
    }

    if (result?.feedbackMode === 'skipped') return;

    if (input) input.value = '';
    showToast(result.feedbackMode === 'pending' ? `Carga registrada en cola offline: ${formatTotal(monto)}.` : `Carga registrada: ${formatTotal(monto)}.`, result.feedbackMode === 'pending' ? 'warning' : 'success');
    calcular();
}

function renderHistorialCargasGas(items) {
    const box = document.getElementById('boxHistorialCargasGas');
    const lista = document.getElementById('listaHistorialCargasGas');
    const contador = document.getElementById('contadorCargasGas');
    if (!box || !lista) return;

    const safeItems = normalizeFuelHistoryArray(items);
    currentFuelHistory = safeItems;

    if (safeItems.length === 0) {
        box.classList.add('hidden');
        lista.innerHTML = '';
        if (contador) contador.textContent = '0/5';
        return;
    }

    box.classList.remove('hidden');
    if (contador) contador.textContent = `${safeItems.length}/5`;

    lista.innerHTML = safeItems.map((item) => {
        const fecha = escapeHtml(item.fecha || '-');
        const hora = escapeHtml(item.hora || '--:--');
        const monto = Math.round(item.monto || 0);
        return `
            <div role="listitem" class="flex items-center justify-between p-2 bg-gray-50 rounded-xl border border-gray-100 text-xs">
                <div class="flex items-center gap-2">
                    <div class="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <i data-lucide="fuel" class="w-3.5 h-3.5"></i>
                    </div>
                    <div>
                        <span class="font-bold text-gray-700 block text-[11px] leading-tight">+${formatTotal(monto)}</span>
                        <span class="text-[9px] text-gray-400 font-medium">${fecha} · ${hora}</span>
                    </div>
                </div>
                <button type="button" onclick="borrarCargaGasolina(${item.id})"
                    class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    title="Eliminar carga y restar de deuda">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
            </div>
        `;
    }).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function borrarCargaGasolina(id) {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return;
    const item = currentFuelHistory.find((c) => c.id === numericId);
    if (!item) return;

    if (!confirm(`¿Eliminar esta carga de ${formatTotal(item.monto)}? Se restará de la deuda de combustible.`)) {
        showToast('Eliminación cancelada.', 'info');
        return;
    }

    const deudaAnterior = currentDeudaCombustible;
    const historialAnterior = [...currentFuelHistory];
    const nuevaDeuda = Math.round(deudaAnterior - item.monto);
    const nuevoHistorial = currentFuelHistory.filter((c) => c.id !== numericId);

    try {
        currentDeudaCombustible = nuevaDeuda;
        currentFuelHistory = nuevoHistorial;
        actualizarUIDeudaCombustible(currentDeudaCombustible);
        renderHistorialCargasGas(currentFuelHistory);
        const { mode } = await saveFuelStateToCloud(currentDeudaCombustible, currentFuelHistory);
        const isPending = feedbackModeFromWriteModes(mode) === 'pending';
        showToast(
            isPending
                ? `Carga de ${formatTotal(item.monto)} eliminada (pendiente de sincronizacion).`
                : `Carga de ${formatTotal(item.monto)} eliminada y restada de deuda.`,
            isPending ? 'warning' : 'success'
        );
        calcular();
    } catch (error) {
        currentDeudaCombustible = deudaAnterior;
        currentFuelHistory = historialAnterior;
        actualizarUIDeudaCombustible(deudaAnterior);
        renderHistorialCargasGas(historialAnterior);
        showToast('No se pudo eliminar la carga de gasolina.', 'error');
    }
}

function getDeudaCombustiblePendiente() {
    return Math.round(toFiniteNumber(currentDeudaCombustible, 0));
}

function actualizarBotonPagoCombustible(deuda) {
    const btn = document.getElementById('btnPagoDeudaCombustible');
    const texto = document.getElementById('textoBtnPagoDeudaCombustible');
    if (!btn || !texto) return;

    if (deuda > 0) {
        texto.textContent = 'Pagar Deuda Combustible';
        btn.className = 'w-full py-3 btn-premium btn-premium-blue btn-ripple text-xs font-bold rounded-2xl flex items-center justify-center gap-2';
    } else {
        texto.textContent = 'Añadir Saldo Extra Gasolina';
        btn.className = 'w-full py-3 btn-premium btn-premium-success btn-ripple text-xs font-bold rounded-2xl flex items-center justify-center gap-2';
    }
}

function syncModalPagoDeudaCombustible() {
    const deuda = getDeudaCombustiblePendiente();
    const input = document.getElementById('pagoDeudaCombustibleMonto');
    const pago = Math.max(0, Math.round(parseFloat(input?.value || '0') || 0));
    const resta = deuda - pago;

    const tituloPendiente = document.getElementById('pagoDeudaCombustiblePendienteTitulo');
    const valorPendiente = document.getElementById('pagoDeudaCombustiblePendiente');

    if (valorPendiente) {
        if (deuda > 0) {
            if (tituloPendiente) tituloPendiente.textContent = 'Deuda pendiente';
            valorPendiente.textContent = formatTotal(deuda);
            valorPendiente.className = 'text-sm font-extrabold text-gray-700';
        } else if (deuda < 0) {
            if (tituloPendiente) tituloPendiente.textContent = 'Saldo a favor';
            valorPendiente.textContent = formatTotal(Math.abs(deuda));
            valorPendiente.className = 'text-sm font-extrabold text-emerald-600';
        } else {
            if (tituloPendiente) tituloPendiente.textContent = 'Deuda pendiente';
            valorPendiente.textContent = '$0';
            valorPendiente.className = 'text-sm font-extrabold text-gray-700';
        }
    }

    const elResta = document.getElementById('pagoDeudaCombustibleResta');
    if (elResta) {
        if (resta > 0) {
            elResta.textContent = `Restan: ${formatTotal(resta)}`;
            elResta.className = 'text-[10px] text-gray-400 text-center mb-4';
        } else if (resta < 0) {
            elResta.textContent = `Saldo a favor resultante: ${formatTotal(Math.abs(resta))}`;
            elResta.className = 'text-[10px] text-emerald-500 font-bold text-center mb-4';
        } else {
            elResta.textContent = 'Restan: $0';
            elResta.className = 'text-[10px] text-gray-400 text-center mb-4';
        }
    }

    if (input) {
        input.removeAttribute('max');
    }

    return { deuda, pago, resta };
}

function abrirModalPagoDeudaCombustible() {
    const modal = document.getElementById('modalPagoDeudaCombustible');
    const input = document.getElementById('pagoDeudaCombustibleMonto');
    if (!modal || !input) return;

    input.value = '';
    input.oninput = () => syncModalPagoDeudaCombustible();
    syncModalPagoDeudaCombustible();
    modal.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
    setTimeout(() => {
        input.focus();
        input.select();
    }, 0);
}

function cerrarModalPagoDeudaCombustible() {
    document.getElementById('modalPagoDeudaCombustible')?.classList.add('hidden');
}

function ajustarPagoDeudaCombustible(delta) {
    const input = document.getElementById('pagoDeudaCombustibleMonto');
    if (!input) return;
    const current = parseFloat(input.value) || 0;
    const nuevo = Math.max(0, Math.round(current + delta));
    input.value = String(nuevo);
    syncModalPagoDeudaCombustible();
}

function llenarTodoPagoDeudaCombustible() {
    const input = document.getElementById('pagoDeudaCombustibleMonto');
    if (!input) return;
    const deuda = getDeudaCombustiblePendiente();
    if (deuda > 0) {
        input.value = String(deuda);
    } else {
        input.value = '0';
    }
    syncModalPagoDeudaCombustible();
}

async function guardarPagoDeudaCombustible() {
    const input = document.getElementById('pagoDeudaCombustibleMonto');
    const deuda = getDeudaCombustiblePendiente();
    const monto = Math.max(0, Math.round(parseFloat(input?.value || '0') || 0));

    if (monto <= 0) {
        showToast('Ingresa un monto valido mayor a 0.', 'warning');
        input?.focus();
        return;
    }

    const nuevaDeuda = deuda - monto;
    const deudaAnterior = currentDeudaCombustible;
    const historialAnterior = [...currentFuelHistory];
    const debeLimpiarHistorial = deuda > 0 && nuevaDeuda <= 0;
    const nuevoHistorial = debeLimpiarHistorial
        ? []
        : applyFIFOPaymentToFuelHistory(currentFuelHistory, monto);

    let result;
    try {
        result = await runActionWithFeedback('[onclick="guardarPagoDeudaCombustible()"]', {
            loading: 'Aplicando...',
            success: 'Aplicado',
            pending: 'Pendiente offline',
            error: 'No aplicado'
        }, async () => {
            currentDeudaCombustible = nuevaDeuda;
            currentFuelHistory = nuevoHistorial;
            actualizarUIDeudaCombustible(nuevaDeuda);
            renderHistorialCargasGas(currentFuelHistory);
            const settingResult = await saveFuelStateToCloud(nuevaDeuda, nuevoHistorial);
            return {
                feedbackMode: feedbackModeFromWriteModes(settingResult.mode)
            };
        }, 'guardarPagoDeudaCombustible');
    } catch (error) {
        currentDeudaCombustible = deudaAnterior;
        currentFuelHistory = historialAnterior;
        actualizarUIDeudaCombustible(deudaAnterior);
        renderHistorialCargasGas(historialAnterior);
        showToast(error?.message || 'No se pudo aplicar el pago de combustible.', 'error');
        return;
    }

    if (result?.feedbackMode === 'skipped') return;

    cerrarModalPagoDeudaCombustible();

    let mensajeExito = `Pago de deuda combustible aplicado: ${formatTotal(monto)}.`;
    if (deuda <= 0) {
        mensajeExito = `Saldo a favor añadido: ${formatTotal(monto)}.`;
    } else if (monto > deuda) {
        mensajeExito = `Pago aplicado: ${formatTotal(monto)}. Excedente de ${formatTotal(monto - deuda)} guardado como saldo a favor.`;
    }

    showToast(
        result.feedbackMode === 'pending'
            ? `Operacion registrada en cola offline: ${formatTotal(monto)}.`
            : mensajeExito,
        result.feedbackMode === 'pending' ? 'warning' : 'success'
    );
    calcular();
}

function actualizarUIDeudaCombustible(deuda) {
    const badge = document.getElementById('deudaCombustibleBadge');
    const valor = document.getElementById('deudaCombustibleValor');
    if (!badge || !valor) return;
    const deudaNormalizada = normalizeDeudaCombustibleMonto(deuda, true, true) ?? 0;
    if (deudaNormalizada > 0) {
        badge.classList.remove('hidden');
        valor.textContent = formatTotal(deudaNormalizada);
        valor.className = 'text-sm font-extrabold text-gray-800';
    } else if (deudaNormalizada < 0) {
        badge.classList.remove('hidden');
        valor.textContent = `+${formatTotal(Math.abs(deudaNormalizada))}`;
        valor.className = 'text-sm font-extrabold text-emerald-600';
    } else {
        badge.classList.add('hidden');
        valor.textContent = '$0';
    }
    actualizarTotalesHistorial();
    actualizarBotonPagoCombustible(deudaNormalizada);
    updateModuleValueBadges();
}

function editarDeudaCombustible() {
    const modal = document.getElementById('modalDeudaCombustible');
    const input = document.getElementById('editDeudaCombustible');
    if (!modal || !input) return;

    const valorActual = normalizeDeudaCombustibleMonto(currentDeudaCombustible, true, true) ?? 0;
    input.value = String(valorActual);
    modal.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
    setTimeout(() => {
        input.focus();
        input.select();
    }, 0);
}

function cerrarModalDeudaCombustible() {
    document.getElementById('modalDeudaCombustible')?.classList.add('hidden');
}

async function guardarEdicionDeudaCombustible() {
    const input = document.getElementById('editDeudaCombustible');
    const valor = normalizeDeudaCombustibleMonto(input?.value, true, true);
    if (valor === null) {
        showToast('Ingresa un monto valido.', 'warning');
        input?.focus();
        return;
    }

    let result;
    try {
        result = await runActionWithFeedback('[onclick="guardarEdicionDeudaCombustible()"]', {
            loading: 'Guardando...',
            success: 'Actualizado',
            pending: 'Pendiente offline',
            error: 'No guardado'
        }, async () => {
            currentDeudaCombustible = valor;
            const settingResult = await saveSettingToCloudNow('deudaCombustible', valor);
            actualizarUIDeudaCombustible(valor);
            return {
                feedbackMode: feedbackModeFromWriteModes(settingResult.mode)
            };
        }, 'guardarEdicionDeudaCombustible');
    } catch (error) {
        showToast(error?.message || 'No se pudo guardar la deuda de combustible.', 'error');
        return;
    }

    if (result?.feedbackMode === 'skipped') return;

    cerrarModalDeudaCombustible();
    showToast(result.feedbackMode === 'pending' ? 'Deuda de combustible guardada en cola offline.' : 'Deuda de combustible actualizada.', result.feedbackMode === 'pending' ? 'warning' : 'success');
    calcular();
}

async function borrarDeudaCombustible() {
    if (!confirm('Estas seguro de borrar la deuda de combustible?')) {
        showToast('Operacion cancelada.', 'info');
        return;
    }
    currentDeudaCombustible = 0;
    currentFuelHistory = [];
    actualizarUIDeudaCombustible(0);
    renderHistorialCargasGas(currentFuelHistory);
    await saveFuelStateToCloud(0, []);
    showToast('Deuda de combustible borrada.', 'success');
    calcular();
}
function updateProgressRing(balance, meta) {
    const ring = document.getElementById('progressRing');
    const pct = document.getElementById('progressRingPct');
    if (!ring || !pct) return;
    if (!meta || meta <= 0) {
        ring.style.strokeDashoffset = '163.4';
        pct.textContent = '0%';
        return;
    }
    const ratio = Math.min(1, Math.max(0, balance / meta));
    const circumference = 163.4;
    ring.style.strokeDashoffset = String(circumference * (1 - ratio));
    pct.textContent = `${Math.round(ratio * 100)}%`;
    // Color semántico del ring según progreso
    if (ratio >= 1) {
        ring.style.stroke = '#10b981';
    } else if (ratio >= 0.5) {
        ring.style.stroke = '#f59e0b';
    } else {
        ring.style.stroke = '#ef4444';
    }
}
function updateModuleValueBadges() {
    // Gasolina — costo por km calculado
    const gasBadge = document.getElementById('moduleValueGasolina');
    if (gasBadge) {
        const precioLitro = getInputVal('precioLitro');
        const consumo = getInputVal('consumo');
        if (precioLitro > 0 && consumo > 0) {
            const costoPorKm = (consumo / 100) * precioLitro;
            gasBadge.textContent = `${formatCurrency(costoPorKm)}/km`;
        } else {
            gasBadge.textContent = '';
        }
    }

    // Mantenimiento — progreso de ahorro
    const maintBadge = document.getElementById('moduleValueMaint');
    if (maintBadge) {
        const ahorro = getInputVal('ahorroActual');
        const meta = getInputVal('metaMantenimiento');
        if (meta > 0) {
            const pct = Math.min(100, Math.round((ahorro / meta) * 100));
            maintBadge.textContent = `${pct}% guardado`;
        } else {
            maintBadge.textContent = '';
        }
    }

    // Ingresos — total del día si hay
    const ingresosBadge = document.getElementById('moduleValueIngresos');
    if (ingresosBadge) {
        const ingresos = getInputVal('ingresosHoy');
        ingresosBadge.textContent = ingresos > 0 ? formatTotal(ingresos) : '';
    }

    // Deudas — deuda de combustible actual
    const deudasBadge = document.getElementById('moduleValueDeudas');
    if (deudasBadge) {
        if (currentDeudaCombustible > 0) {
            deudasBadge.textContent = formatTotal(currentDeudaCombustible);
            deudasBadge.style.color = '';
        } else if (currentDeudaCombustible < 0) {
            deudasBadge.textContent = `+${formatTotal(Math.abs(currentDeudaCombustible))}`;
            deudasBadge.style.color = '#059669';
        } else {
            deudasBadge.textContent = '';
        }
    }

    // Historial — cantidad de registros
    const historialBadge = document.getElementById('moduleValueHistorial');
    if (historialBadge) {
        const count = currentHistory.length;
        historialBadge.textContent = count > 0 ? `${count} registros` : '';
    }
}
// (Sistema antiguo de Bottom Sheet con templates eliminado en favor de sheetCargaKm y sheetCargaGasolina)

// ==================== MOBILE BOTTOM NAV & SPEED DIAL LOGIC ====================
function toggleSpeedDial(forceState) {
    const container = document.getElementById('mobileBottomNavContainer');
    if (!container) return;
    
    if (typeof forceState === 'boolean') {
        container.classList.toggle('speed-dial-active', forceState);
    } else {
        container.classList.toggle('speed-dial-active');
    }
    

}

function openQuickSheet(type) {
    toggleSpeedDial(false);
    if (type === 'km') {
        const sheet = document.getElementById('sheetCargaKm');
        if (sheet) {
            sheet.classList.add('bottom-sheet-open');
            const input = document.getElementById('inputQuickKm');
            const kmActual = document.getElementById('kmHoy');
            if (input && kmActual) input.value = kmActual.value || '';
            setTimeout(() => input && input.focus(), 150);
        }
    } else if (type === 'gasolina') {
        const sheet = document.getElementById('sheetCargaGasolina');
        if (sheet) {
            sheet.classList.add('bottom-sheet-open');
            const input = document.getElementById('inputQuickGasMonto');
            setTimeout(() => input && input.focus(), 150);
        }
    }
}

function closeQuickSheet(type) {
    if (type === 'km') {
        const sheet = document.getElementById('sheetCargaKm');
        if (sheet) sheet.classList.remove('bottom-sheet-open');
    } else if (type === 'gasolina') {
        const sheet = document.getElementById('sheetCargaGasolina');
        if (sheet) sheet.classList.remove('bottom-sheet-open');
    }
}

function submitQuickKm() {
    const input = document.getElementById('inputQuickKm');
    const kmHoyInput = document.getElementById('kmHoy');
    if (!input || !kmHoyInput) return;
    
    const valor = parseFloat(input.value) || 0;
    if (valor <= 0) {
        showToast('Ingresa un kilometraje valido mayor a 0.', 'warning');
        return;
    }

    kmHoyInput.value = valor;
    
    // Disparar evento input para actualizar cálculos automáticos
    kmHoyInput.dispatchEvent(new Event('input', { bubbles: true }));
    
    input.value = '';
    closeQuickSheet('km');
}

function submitQuickGasolina() {
    const montoInput = document.getElementById('inputQuickGasMonto');
    if (!montoInput) return;
    
    const monto = parseFloat(montoInput.value) || 0;
    if (monto <= 0) {
        showToast('Ingresa un monto valido mayor a 0.', 'warning');
        return;
    }
    
    const cargaGasolinaInput = document.getElementById('cargaGasolina');
    if (cargaGasolinaInput) {
        cargaGasolinaInput.value = monto;
        cargarGasolina();
    }
    
    montoInput.value = '';
    closeQuickSheet('gasolina');
}

function switchMobileTab(tabName) {
    toggleSpeedDial(false);
    
    const tabs = ['inicio', 'historial', 'modulos', 'ajustes'];
    const btnMap = {
        inicio: 'navInicioBtn',
        historial: 'navHistorialBtn',
        modulos: 'navModulosBtn',
        ajustes: 'navAjustesBtn'
    };
    
    tabs.forEach(tab => {
        const btn = document.getElementById(btnMap[tab]);
        if (btn) {
            if (tab === tabName) {
                btn.className = 'flex flex-col items-center gap-1 text-emerald-600 active:scale-95 transition-transform';
                btn.querySelector('span')?.classList.replace('font-medium', 'font-bold');
            } else {
                btn.className = 'flex flex-col items-center gap-1 text-gray-400 hover:text-gray-600 active:scale-95 transition-transform';
                btn.querySelector('span')?.classList.replace('font-bold', 'font-medium');
            }
        }
    });
    
    if (tabName === 'inicio') {
        if (typeof closeMobileModule === 'function') {
            closeMobileModule();
        }
        const main = document.getElementById('seccionCierreDia');
        if (main) main.scrollIntoView({ behavior: 'smooth' });
    } else if (tabName === 'historial') {
        if (typeof openMobileModule === 'function') {
            openMobileModule('historial', 'Historial');
        } else if (typeof abrirHistorialDesktopModal === 'function') {
            abrirHistorialDesktopModal();
        }
    } else if (tabName === 'modulos') {
        if (typeof scrollMobileHomeToModules === 'function') {
            scrollMobileHomeToModules();
        } else {
            const homeMod = document.getElementById('mobileModuleHome');
            if (homeMod) homeMod.scrollIntoView({ behavior: 'smooth' });
        }
    } else if (tabName === 'ajustes') {
        if (typeof openMobileModule === 'function') {
            openMobileModule('ajustes', 'Ajustes');
        } else {
            const syncDetails = document.querySelector('details[data-mobile-module="ajustes"]');
            if (syncDetails) syncDetails.open = true;
        }
    }
}

// ==================== DESKTOP MODULAR TAB SWITCHING ====================
function switchDesktopTab(moduleName) {
    const layout = document.getElementById('dashboardLayout');
    if (!layout) return;

    layout.classList.add('desktop-modular-view');

    const btnMap = {
        inicio: 'btnDesktopNavInicio',
        gasolina: 'btnDesktopNavGasolina',
        mantenimiento: 'btnDesktopNavMantenimiento',
        ingresos: 'btnDesktopNavIngresos',
        deudas: 'btnDesktopNavDeudas',
        historial: 'btnDesktopNavHistorial'
    };

    const sectionMap = {
        inicio: 'seccionCierreDia',
        gasolina: 'seccionGasolina',
        mantenimiento: 'seccionMantenimiento',
        ingresos: 'seccionResumenGanancias',
        deudas: 'seccionDeudasExtras',
        historial: 'seccionHistorial'
    };

    Object.keys(btnMap).forEach(key => {
        const btn = document.getElementById(btnMap[key]);
        if (btn) {
            if (key === moduleName) {
                btn.className = 'desktop-nav-item active flex items-center gap-3 w-full px-3.5 py-3 rounded-xl text-xs font-bold text-emerald-600 bg-emerald-50 transition-all';
            } else {
                btn.className = 'desktop-nav-item flex items-center gap-3 w-full px-3.5 py-3 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all';
            }
        }
    });

    // Ocultar o mostrar secciones
    document.querySelectorAll('section[data-mobile-module], #seccionVehiculoInfo').forEach(sec => {
        sec.classList.remove('desktop-module-active');
        sec.classList.add('hidden');
    });

    if (moduleName === 'inicio') {
        layout.classList.remove('desktop-modular-view');
        document.querySelectorAll('section[data-mobile-module], #seccionVehiculoInfo').forEach(sec => {
            sec.classList.remove('desktop-module-active');
            if (sec.id !== 'seccionHistorial') {
                sec.classList.remove('hidden');
            }
        });
        if (typeof calcular === 'function') calcular();
    } else if (moduleName === 'ajustes') {
        const settingsDetails = document.querySelector('header details[data-mobile-module="ajustes"]');
        if (settingsDetails) settingsDetails.open = true;
    } else {
        const targetSections = document.querySelectorAll(`section[data-mobile-module="${moduleName}"]`);
        if (targetSections.length > 0) {
            targetSections.forEach(sec => {
                sec.classList.remove('hidden');
                sec.classList.add('desktop-module-active');
            });
        } else {
            const targetId = sectionMap[moduleName];
            if (targetId) {
                const targetSec = document.getElementById(targetId);
                if (targetSec) {
                    targetSec.classList.remove('hidden');
                    targetSec.classList.add('desktop-module-active');
                }
            }
        }
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.calcular = calcular;
window.openMobileModule = openMobileModule;
window.closeMobileModule = closeMobileModule;
window.scrollMobileHomeToModules = scrollMobileHomeToModules;
window.conectarSincronizacion = conectarSincronizacion;
window.manejarClickSincronizar = manejarClickSincronizar;
window.generarClaveSincronizacionSegura = generarClaveSincronizacionSegura;
window.renderHistorialFromData = renderHistorialFromData;
window.addHistoryItemToCloud = addHistoryItemToCloud;
window.overwriteHistoryCloud = overwriteHistoryCloud;
window.abrirModalEdicion = abrirModalEdicion;
window.cerrarModal = cerrarModal;
window.calcularTotalEdicion = calcularTotalEdicion;
window.guardarEdicion = guardarEdicion;
window.limpiarHistorial = limpiarHistorial;
window.agregarDeuda = agregarDeuda;
window.guardarExtra = guardarExtra;
window.saldarDeuda = saldarDeuda;
window.borrarFila = borrarFila;
window.cargarGasolina = cargarGasolina;
window.borrarCargaGasolina = borrarCargaGasolina;
window.renderHistorialCargasGas = renderHistorialCargasGas;
window.setThemeMode = setThemeMode;
window.toggleThemeMode = toggleThemeMode;
window.abrirHistorialDesktopModal = abrirHistorialDesktopModal;
window.cerrarHistorialDesktopModal = cerrarHistorialDesktopModal;
window.abrirModalPagoDeudaCombustible = abrirModalPagoDeudaCombustible;
window.cerrarModalPagoDeudaCombustible = cerrarModalPagoDeudaCombustible;
window.ajustarPagoDeudaCombustible = ajustarPagoDeudaCombustible;
window.llenarTodoPagoDeudaCombustible = llenarTodoPagoDeudaCombustible;
window.guardarPagoDeudaCombustible = guardarPagoDeudaCombustible;
window.actualizarUIDeudaCombustible = actualizarUIDeudaCombustible;
window.editarDeudaCombustible = editarDeudaCombustible;
window.cerrarModalDeudaCombustible = cerrarModalDeudaCombustible;
window.guardarEdicionDeudaCombustible = guardarEdicionDeudaCombustible;
window.borrarDeudaCombustible = borrarDeudaCombustible;
window.saveFuelStateToCloud = saveFuelStateToCloud;
window.normalizeFuelHistoryItem = normalizeFuelHistoryItem;
window.normalizeFuelHistoryArray = normalizeFuelHistoryArray;
window.applyFIFOPaymentToFuelHistory = applyFIFOPaymentToFuelHistory;
window.applyFIFOPaymentToKmsHistory = applyFIFOPaymentToKmsHistory;

function getVehiculoComponentesFromInputs() {
    return {
        llantas: {
            precio: getInputVal('vehiculoLlantasPrecio'),
            km: getInputVal('vehiculoLlantasKm'),
            ahorrado: getInputVal('vehiculoLlantasAhorrado')
        },
        frenos: {
            precio: getInputVal('vehiculoFrenosPrecio'),
            km: getInputVal('vehiculoFrenosKm'),
            ahorrado: getInputVal('vehiculoFrenosAhorrado')
        },
        aceite: {
            precio: getInputVal('vehiculoAceitePrecio'),
            km: getInputVal('vehiculoAceiteKm'),
            ahorrado: getInputVal('vehiculoAceiteAhorrado')
        },
        extras: {
            precio: getInputVal('vehiculoExtrasPrecio'),
            km: getInputVal('vehiculoExtrasKm'),
            ahorrado: getInputVal('vehiculoExtrasAhorrado')
        }
    };
}

function actualizarPreviewVehiculoModal() {
    const comps = getVehiculoComponentesFromInputs();
    const { rates, totalRate, totalSavings, progress, isCovered } = calculateMulticomponentWear(comps);
    const kmMeta = getInputVal('kmMeta', 5000);

    const keys = ['llantas', 'frenos', 'aceite', 'extras'];
    const capKeys = { llantas: 'Llantas', frenos: 'Frenos', aceite: 'Aceite', extras: 'Extras' };

    keys.forEach((k) => {
        const cap = capKeys[k];
        updateText(`vehiculo${cap}Tasa`, `${formatCurrency(rates[k])} / km`);

        const progEl = document.getElementById(`vehiculo${cap}Progreso`);
        if (progEl) {
            if (isCovered[k]) {
                progEl.textContent = 'Meta OK';
                progEl.className = 'text-[9px] font-extrabold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded';
            } else {
                progEl.textContent = `${progress[k]}%`;
                progEl.className = 'text-[9px] font-bold text-gray-400';
            }
        }

        const infoEl = document.getElementById(`vehiculo${cap}AhorradoInfo`);
        if (infoEl) {
            infoEl.textContent = `${formatTotal(comps[k].ahorrado)} de ${formatTotal(comps[k].precio)}`;
        }
    });

    updateText('vehiculoTotalTasaKm', `${formatCurrency(totalRate)} / km`);
    updateText('vehiculoTotalAhorrado', formatTotal(totalSavings));
    updateText('vehiculoMetaCicloKmsLabel', String(Math.round(kmMeta)));
    updateText('vehiculoTotalProyeccionCiclo', formatTotal(Math.round(kmMeta * totalRate)));
}

function abrirModalVehiculo() {
    const modal = document.getElementById('modalVehiculo');
    if (!modal) return;
    actualizarPreviewVehiculoModal();
    modal.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
    const firstInput = document.getElementById('vehiculoLlantasPrecio');
    setTimeout(() => {
        if (firstInput) {
            firstInput.focus();
            firstInput.select();
        }
    }, 50);
}

function cerrarModalVehiculo() {
    const modal = document.getElementById('modalVehiculo');
    if (modal) modal.classList.add('hidden');
}

async function guardarConfiguracionVehiculo() {
    const btn = document.getElementById('btnGuardarVehiculo');
    const comps = getVehiculoComponentesFromInputs();
    const { totalRate, totalSavings } = calculateMulticomponentWear(comps);

    const vehicleFields = {
        vehiculoLlantasPrecio: comps.llantas.precio,
        vehiculoLlantasKm: comps.llantas.km,
        vehiculoLlantasAhorrado: comps.llantas.ahorrado,
        vehiculoFrenosPrecio: comps.frenos.precio,
        vehiculoFrenosKm: comps.frenos.km,
        vehiculoFrenosAhorrado: comps.frenos.ahorrado,
        vehiculoAceitePrecio: comps.aceite.precio,
        vehiculoAceiteKm: comps.aceite.km,
        vehiculoAceiteAhorrado: comps.aceite.ahorrado,
        vehiculoExtrasPrecio: comps.extras.precio,
        vehiculoExtrasKm: comps.extras.km,
        vehiculoExtrasAhorrado: comps.extras.ahorrado
    };

    // Sincronización automática unificada (Opción A): actualiza ahorroActual
    if (totalRate > 0 || totalSavings > 0) {
        vehicleFields.ahorroActual = totalSavings;
    }

    let result;
    try {
        result = await runActionWithFeedback(btn, {
            loading: 'Guardando...',
            success: 'Guardado',
            pending: 'Pendiente offline',
            error: 'No guardado'
        }, async () => {
            const promises = Object.entries(vehicleFields).map(([key, val]) => saveSettingToCloudNow(key, val));
            const modes = await Promise.all(promises);
            return {
                feedbackMode: feedbackModeFromWriteModes(...modes.map(m => m.mode))
            };
        }, 'guardarConfiguracionVehiculo');
    } catch (err) {
        showToast('Error al guardar la configuración del vehículo.', 'error');
        return;
    }

    if (result?.feedbackMode === 'skipped') return;

    const inputAhorro = document.getElementById('ahorroActual');
    if (inputAhorro && (totalRate > 0 || totalSavings > 0)) {
        inputAhorro.value = totalSavings;
    }

    cerrarModalVehiculo();
    calcular();
    showToast(
        result.feedbackMode === 'pending'
            ? 'Configuración guardada en cola offline.'
            : (totalRate > 0
                ? `Desgaste configurado: ${formatCurrency(totalRate)} / km (Ahorro: ${formatTotal(totalSavings)}).`
                : 'Configuración de vehículo guardada.'),
        result.feedbackMode === 'pending' ? 'warning' : 'success'
    );
}

// Inicializar listeners del modal de vehículo
const modalVehiculoEl = document.getElementById('modalVehiculo');
if (modalVehiculoEl) {
    modalVehiculoEl.addEventListener('click', (event) => {
        if (event.target === modalVehiculoEl) cerrarModalVehiculo();
    });
}

const vehicleInputIds = [
    'vehiculoLlantasPrecio', 'vehiculoLlantasKm', 'vehiculoLlantasAhorrado',
    'vehiculoFrenosPrecio', 'vehiculoFrenosKm', 'vehiculoFrenosAhorrado',
    'vehiculoAceitePrecio', 'vehiculoAceiteKm', 'vehiculoAceiteAhorrado',
    'vehiculoExtrasPrecio', 'vehiculoExtrasKm', 'vehiculoExtrasAhorrado'
];
vehicleInputIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('input', () => {
            actualizarPreviewVehiculoModal();
        });
    }
});

window.getVehiculoComponentesFromInputs = getVehiculoComponentesFromInputs;
window.actualizarPreviewVehiculoModal = actualizarPreviewVehiculoModal;
window.abrirModalVehiculo = abrirModalVehiculo;
window.cerrarModalVehiculo = cerrarModalVehiculo;
window.guardarConfiguracionVehiculo = guardarConfiguracionVehiculo;
window.distributeMaintenanceDeduction = distributeMaintenanceDeduction;
window.calculateMaintenanceDeduction = calculateMaintenanceDeduction;
window.calculateComponentWearRate = calculateComponentWearRate;
window.calculateMulticomponentWear = calculateMulticomponentWear;
window.calculateMaintenanceMetrics = calculateMaintenanceMetrics;
window.aplicarDescuentoMantenimiento = aplicarDescuentoMantenimiento;
window.ejecutarCobroCascadaKms = ejecutarCobroCascadaKms;
window.llenarTodoCobroCascadaKms = llenarTodoCobroCascadaKms;
window.editarExtra = editarExtra;
window.cerrarModalExtra = cerrarModalExtra;
window.guardarEdicionExtra = guardarEdicionExtra;
window.abrirModalParcial = abrirModalParcial;
window.cerrarModalParcial = cerrarModalParcial;
window.seleccionarCategoriaParcial = seleccionarCategoriaParcial;
window.guardarParcial = guardarParcial;
window.ajustarMontoParcial = ajustarMontoParcial;
window.llenarTodoParcial = llenarTodoParcial;
// exports de bottom sheet anterior eliminados
window.toggleSpeedDial = toggleSpeedDial;
window.openQuickSheet = openQuickSheet;
window.closeQuickSheet = closeQuickSheet;
window.submitQuickKm = submitQuickKm;
window.submitQuickGasolina = submitQuickGasolina;
window.switchMobileTab = switchMobileTab;
window.switchDesktopTab = switchDesktopTab;

window.addEventListener('online', async () => {
    if (currentUser) {
        actualizarEstadoConexion('Reintentando sync', 'bg-emerald-500');
    }
    await flushOfflineQueue({ notify: true });
    if (currentUser) actualizarEstadoConexion('En linea', 'bg-emerald-500');
    showToast('Conexion restablecida.', 'success', { duration: 2200 });
});

window.addEventListener('offline', () => {
    actualizarEstadoConexion('Sin internet', 'bg-amber-500');
    showToast('Sin conexion a internet.', 'warning', { duration: 2600 });
});

const desktopViewportQuery = window.matchMedia('(min-width: 1024px)');
desktopViewportQuery.addEventListener('change', (event) => {
    if (!event.matches) cerrarHistorialDesktopModal();
});

loadOfflineQueue();
initLucideIcons();
applyThemeMode(getSavedThemeMode());
initMobileModuleShell();
syncDesktopHistorialTrigger();
initAuth();
calcular();

