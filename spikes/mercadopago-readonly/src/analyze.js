export const DAY_MS = 24 * 60 * 60 * 1000;

/** Nombres de campos en notación con puntos (un nivel de anidamiento por objeto). */
export function fieldPaths(record, prefix = '', depth = 0) {
  const paths = [];
  for (const [name, value] of Object.entries(record ?? {})) {
    const path = prefix ? `${prefix}.${name}` : name;
    paths.push(path);
    if (depth < 1 && value && typeof value === 'object' && !Array.isArray(value)) {
      paths.push(...fieldPaths(value, path, depth + 1));
    }
  }
  return paths;
}

function get(record, path) {
  return path.split('.').reduce((v, key) => (v == null ? undefined : v[key]), record);
}

// Campos de pagos cuyos valores son categorías técnicas, no datos personales.
export const PAYMENT_CATEGORICAL_FIELDS = [
  'status', 'status_detail', 'operation_type', 'payment_type_id', 'payment_method_id',
  'currency_id', 'live_mode', 'money_release_status',
];
const PAYMENT_AMOUNT_FIELDS = [
  'transaction_amount', 'transaction_amount_refunded', 'net_received_amount',
  'transaction_details.net_received_amount', 'transaction_details.total_paid_amount',
];

function decimalsOfNumber(n) {
  const s = String(n);
  if (s.includes('e')) return null;
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}

/**
 * Describe los pagos sin exponer valores personales: campos, categorías
 * técnicas, tipos de los importes, unicidad del id, rango de fechas y cuántos
 * cobradores/pagadores distintos hay (solo cantidades, no identificadores).
 */
export function analyzePayments(payments, { userId } = {}) {
  const fields = new Set();
  for (const p of payments) for (const f of fieldPaths(p)) fields.add(f);

  const categories = {};
  for (const name of PAYMENT_CATEGORICAL_FIELDS) {
    const counts = {};
    for (const p of payments) {
      const v = get(p, name);
      if (v !== undefined && v !== null) counts[String(v)] = (counts[String(v)] ?? 0) + 1;
    }
    if (Object.keys(counts).length) categories[name] = counts;
  }

  const amounts = {};
  for (const name of PAYMENT_AMOUNT_FIELDS) {
    const values = payments.map((p) => get(p, name)).filter((v) => v !== undefined && v !== null);
    if (!values.length) continue;
    const types = [...new Set(values.map((v) => typeof v))].sort();
    const decimals = values.map((v) => (typeof v === 'number' ? decimalsOfNumber(v) : null)).filter((d) => d !== null);
    amounts[name] = { jsonTypes: types, maxDecimals: decimals.length ? Math.max(...decimals) : null };
  }

  const ids = payments.map((p) => p.id).filter((v) => v !== undefined && v !== null);
  const times = payments.map((p) => Date.parse(p.date_created)).filter(Number.isFinite);
  const distinct = (path) => new Set(payments.map((p) => get(p, path)).filter((v) => v !== undefined && v !== null).map(String)).size;

  let roles = null;
  if (userId) {
    roles = { received: 0, sent: 0, both: 0, neither: 0 };
    for (const p of payments) {
      const received = String(p.collector_id ?? '') === String(userId);
      const sent = String(get(p, 'payer.id') ?? '') === String(userId);
      roles[received && sent ? 'both' : received ? 'received' : sent ? 'sent' : 'neither'] += 1;
    }
  }

  return {
    count: payments.length,
    fields: [...fields].sort(),
    categories,
    amounts,
    id: { presentIn: ids.length, of: payments.length, unique: new Set(ids.map(String)).size === ids.length },
    dateRange: times.length
      ? { field: 'date_created', oldest: isoDay(Math.min(...times)), newest: isoDay(Math.max(...times)) }
      : null,
    distinctCollectorIds: distinct('collector_id'),
    distinctPayerIds: distinct('payer.id'),
    roles,
  };
}

function isoDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Parser CSV mínimo con comillas, separador detectado (`;` o `,`) y BOM. */
export function parseCsv(text) {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.slice(0, clean.search(/\r?\n|$/));
  const separator = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === separator) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v !== '')) rows.push(row);
  const [header = [], ...data] = rows;
  return { separator, header, rows: data };
}

const CATEGORICAL_COLUMN = /(^|_)(TYPE|STATUS|CURRENCY|METHOD|SITE|UNIT|TAGS)($|_)/;
const ID_COLUMN = /(^|_)ID$/;
const AMOUNT_COLUMN = /(AMOUNT|FEE|BALANCE|TAX)/;
const DATE_COLUMN = /DATE/;
const MAX_CATEGORY_VALUES = 40;

/**
 * Describe un reporte CSV sin copiar valores: columnas, filas, columnas
 * vacías, unicidad de columnas *_ID, decimales y separador decimal de los
 * importes, formato y rango de fechas, y valores de columnas categóricas
 * (solo si son pocos, cortos y no numéricos).
 */
export function analyzeCsvReport({ separator, header, rows }) {
  const columns = header.map((h) => h.trim());
  const column = (i) => rows.map((r) => (r[i] ?? '').trim());
  const result = {
    separator, columns, rows: rows.length,
    emptyColumns: [], idColumns: {}, amountColumns: {}, dateColumns: {}, categories: {},
    malformedRows: rows.filter((r) => r.length !== columns.length).length,
  };

  columns.forEach((name, i) => {
    const values = column(i).filter((v) => v !== '');
    if (!values.length) { result.emptyColumns.push(name); return; }

    if (ID_COLUMN.test(name)) {
      result.idColumns[name] = { presentIn: values.length, of: rows.length, unique: new Set(values).size === values.length };
    }
    if (AMOUNT_COLUMN.test(name)) {
      const separators = new Set();
      let maxDecimals = 0;
      let nonNumeric = 0;
      for (const v of values) {
        const m = /^-?\d+(?:([.,])(\d+))?$/.exec(v);
        if (!m) { nonNumeric += 1; continue; }
        if (m[1]) separators.add(m[1]);
        maxDecimals = Math.max(maxDecimals, m[2]?.length ?? 0);
      }
      result.amountColumns[name] = { decimalSeparators: [...separators].sort(), maxDecimals, nonNumeric };
    }
    if (DATE_COLUMN.test(name)) {
      const formats = new Set(values.map(datePattern));
      const times = values.map((v) => Date.parse(v)).filter(Number.isFinite);
      result.dateColumns[name] = {
        formats: [...formats].sort(),
        oldest: times.length ? isoDay(Math.min(...times)) : null,
        newest: times.length ? isoDay(Math.max(...times)) : null,
      };
    }
    if (CATEGORICAL_COLUMN.test(name)) {
      const distinct = [...new Set(values)];
      const safe = distinct.length <= MAX_CATEGORY_VALUES &&
        distinct.every((v) => v.length <= 40 && !/\d{4,}/.test(v) && !v.includes('@'));
      result.categories[name] = safe
        ? Object.fromEntries(distinct.sort().map((v) => [v, values.filter((x) => x === v).length]))
        : { omitted: `valores omitidos (${distinct.length} distintos o con aspecto de dato personal)` };
    }
  });
  return result;
}

/** Convierte un valor de fecha en un patrón sin datos: 2026-10-01T10:00:00.000-04:00 → dddd-dd-ddTdd:dd:dd.ddd-dd:dd */
export function datePattern(value) {
  return value.replace(/\d/g, 'd');
}

export function compareIds(first, second) {
  const a = new Set(first.map((p) => String(p.id)));
  const b = new Set(second.map((p) => String(p.id)));
  const onlyInFirst = [...a].filter((id) => !b.has(id)).length;
  const onlyInSecond = [...b].filter((id) => !a.has(id)).length;
  return { firstCount: first.length, secondCount: second.length, identical: !onlyInFirst && !onlyInSecond, onlyInFirst, onlyInSecond };
}

/** Indica si los bytes son un XLSX (ZIP) en lugar de texto CSV. */
export function looksLikeZip(bytes) {
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}
