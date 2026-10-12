export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Divide [startMs, endMs) en ventanas consecutivas de como máximo maxSpanMs,
 * sin huecos ni solapamientos. Binance limita el rango de varias consultas
 * (24 h en myTrades, < 90 días en depósitos/retiros, 30 días en Convert).
 */
export function splitWindows(startMs, endMs, maxSpanMs) {
  if (!(maxSpanMs > 0)) throw new Error('maxSpanMs debe ser positivo');
  const windows = [];
  for (let s = startMs; s < endMs; s += maxSpanMs) {
    windows.push([s, Math.min(s + maxSpanMs, endMs) - 1]);
  }
  return windows;
}

/**
 * Evalúa la respuesta de /sapi/v1/account/apiRestrictions.
 * Es genérica a propósito: cualquier indicador enable... o permits... distinto de
 * enableReading que esté en true se trata como permiso de escritura, incluso
 * si Binance agrega indicadores nuevos en el futuro.
 */
export function evaluatePermissions(restrictions) {
  const writePermissions = Object.entries(restrictions ?? {})
    .filter(([name, value]) =>
      (name.startsWith('enable') || name.startsWith('permits')) &&
      name !== 'enableReading' &&
      value === true)
    .map(([name]) => name)
    .sort();
  const enableReading = restrictions?.enableReading === true;
  return {
    readOnly: enableReading && writePermissions.length === 0,
    enableReading,
    writePermissions,
    ipRestrict: restrictions?.ipRestrict === true,
    flagsReported: Object.keys(restrictions ?? {}).sort(),
  };
}

const AMOUNT_FIELDS = new Set([
  'amount', 'transactionFee', 'qty', 'quoteQty', 'price', 'commission',
  'free', 'locked', 'freeze', 'withdrawing', 'ipoable', 'btcValuation',
  'fromAmount', 'toAmount', 'ratio', 'inverseRatio', 'fee',
]);
const ID_FIELDS = ['id', 'txId', 'orderId', 'tradeId', 'withdrawOrderId', 'orderNo', 'quoteId'];

export function decimalsOf(value) {
  const match = /^-?\d+(?:\.(\d+))?$/.exec(value);
  return match ? (match[1]?.length ?? 0) : null;
}

/** Convierte las fechas de Binance (ms epoch o "YYYY-MM-DD HH:mm:ss") a epoch ms. */
export function toEpochMs(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    // Se asume UTC; está pendiente de confirmar con datos reales.
    return Date.parse(`${value.replace(' ', 'T')}Z`);
  }
  return Number.NaN;
}

/**
 * Describe un conjunto de registros sin exponer sus valores sensibles:
 * cantidad, nombres de campos, decimales observados en importes, tipos de los
 * importes (string o number), unicidad de posibles identificadores externos y
 * rango de fechas (solo día).
 */
export function analyzeRecords(records, { dateField, categoricalFields = [] } = {}) {
  const fields = new Set();
  const amountDecimals = {};
  const numericAmountFields = new Set();

  for (const record of records) {
    for (const [name, value] of Object.entries(record)) {
      fields.add(name);
      if (!AMOUNT_FIELDS.has(name)) continue;
      if (typeof value === 'number') {
        numericAmountFields.add(name);
      } else if (typeof value === 'string') {
        const decimals = decimalsOf(value);
        if (decimals !== null) amountDecimals[name] = Math.max(amountDecimals[name] ?? 0, decimals);
      }
    }
  }

  const idCandidates = {};
  for (const name of ID_FIELDS) {
    if (!fields.has(name)) continue;
    const present = records.map((r) => r[name]).filter((v) => v !== undefined && v !== null && v !== '');
    idCandidates[name] = {
      presentIn: present.length,
      of: records.length,
      unique: new Set(present.map(String)).size === present.length,
    };
  }

  let dateRange = null;
  if (dateField) {
    const times = records.map((r) => toEpochMs(r[dateField])).filter(Number.isFinite);
    if (times.length) {
      dateRange = {
        field: dateField,
        oldest: new Date(Math.min(...times)).toISOString().slice(0, 10),
        newest: new Date(Math.max(...times)).toISOString().slice(0, 10),
      };
    }
  }

  const categories = {};
  for (const name of categoricalFields) {
    const values = [...new Set(records.map((r) => r[name]).filter((v) => v !== undefined && v !== null))];
    if (values.length) categories[name] = values.map(String).sort();
  }

  return {
    count: records.length,
    fields: [...fields].sort(),
    amountDecimals,
    numericAmountFields: [...numericAmountFields].sort(),
    idCandidates,
    dateRange,
    categories,
  };
}

/** Compara dos lecturas del mismo rango por un campo identificador. */
export function compareReads(first, second, idField) {
  const a = new Set(first.map((r) => String(r[idField])));
  const b = new Set(second.map((r) => String(r[idField])));
  const onlyInFirst = [...a].filter((id) => !b.has(id)).length;
  const onlyInSecond = [...b].filter((id) => !a.has(id)).length;
  return {
    idField,
    firstCount: first.length,
    secondCount: second.length,
    identical: onlyInFirst === 0 && onlyInSecond === 0 && first.length === second.length,
    onlyInFirst,
    onlyInSecond,
  };
}
