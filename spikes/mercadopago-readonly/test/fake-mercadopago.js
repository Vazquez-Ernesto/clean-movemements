import { createServer } from 'node:http';

export const TEST_TOKEN = 'APP_USR-0000000000000000-000000-faketokenvalue-987654321';
export const TEST_USER_ID = '987654321';
const DAY_MS = 24 * 60 * 60 * 1000;

// Valores "trampa": si aparecen en el reporte, el reporte filtra datos personales.
export const SENSITIVE_MARKERS = [
  'ana.perez@example.com', '30123456', 'Ana Perez', 'Regalo cumpleanos Bruno',
  'ref-secreta-123', '15432.77', '15432,77', '98765.43', '5550001', 'faketokenvalue',
  'settlement-new-987654321', 'settlement-old-987654321', TEST_USER_ID,
];

/**
 * Datos ilustrativos. Las columnas del CSV son una suposición para probar el
 * analizador: no documentan el formato real de Mercado Pago.
 */
export function defaultFixtures(nowMs) {
  const payments = [];
  for (let i = 0; i < 130; i += 1) {
    const received = i % 3 !== 0;
    payments.push({
      id: 5550001 + i,
      date_created: new Date(nowMs - (i % 55) * DAY_MS - 60_000).toISOString(),
      status: i % 10 === 0 ? 'refunded' : 'approved',
      status_detail: 'accredited',
      operation_type: received ? 'money_transfer' : 'regular_payment',
      payment_type_id: received ? 'account_money' : 'credit_card',
      payment_method_id: received ? 'account_money' : 'visa',
      currency_id: 'ARS',
      transaction_amount: i === 0 ? 15432.77 : 98765.43,
      transaction_details: { net_received_amount: 98765.43, total_paid_amount: 98765.43 },
      collector_id: received ? Number(TEST_USER_ID) : 2000 + i,
      payer: {
        id: received ? String(3000 + i) : TEST_USER_ID,
        email: 'ana.perez@example.com',
        first_name: 'Ana Perez',
        identification: { type: 'DNI', number: '30123456' },
      },
      description: 'Regalo cumpleanos Bruno',
      external_reference: 'ref-secreta-123',
      live_mode: true,
    });
  }
  // Pagos viejos, fuera del período consultado.
  for (let i = 0; i < 5; i += 1) {
    payments.push({ ...payments[1], id: 5559000 + i, date_created: new Date(nowMs - 300 * DAY_MS).toISOString() });
  }

  const header = [
    'SOURCE_ID', 'USER_ID', 'EXTERNAL_REFERENCE', 'TRANSACTION_TYPE', 'PAYMENT_METHOD_TYPE',
    'TRANSACTION_AMOUNT', 'TRANSACTION_CURRENCY', 'TRANSACTION_DATE', 'SETTLEMENT_NET_AMOUNT',
    'DESCRIPTION', 'PAYER_NAME', 'PAYER_ID_TYPE', 'PAYER_ID_NUMBER', 'OPERATION_TAGS', 'COUPON_AMOUNT',
  ];
  const csvRows = [header.join(';')];
  const types = ['SETTLEMENT', 'SETTLEMENT', 'REFUND', 'WITHDRAWAL'];
  for (let i = 0; i < 40; i += 1) {
    csvRows.push([
      String(5550001 + i), TEST_USER_ID, 'ref-secreta-123', types[i % types.length], 'account_money',
      i === 0 ? '15432,77' : '100,5', 'ARS', '2026-10-01T10:00:00.000-04:00', '"98765,43"',
      '"Regalo cumpleanos Bruno; con punto y coma"', 'Ana Perez', 'DNI', '30123456', `{"store":"1234${i}"}`, '',
    ].join(';'));
  }

  return {
    payments,
    settlementConfig: {
      columns: header.map((key) => ({ key })), separator: ';', display_timezone: 'GMT-04',
      notification_email_list: ['ana.perez@example.com'], file_name_prefix: 'settlement-987654321',
    },
    settlementCsv: `﻿${csvRows.join('\r\n')}\r\n`,
    // XLSX simulado: solo la firma ZIP inicial.
    releaseXlsx: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]),
  };
}

/**
 * Inicia un Mercado Pago falso. Opciones:
 * - readyAfterPolls: consultas a /list necesarias para que aparezca el reporte.
 * - searchLimitBehavior: 'reject' o 'clamp' cuando se piden más de 50.
 * - rateLimitOn: operación que responde 429.
 */
export async function startFakeMercadoPago({
  now = Date.now, fixtures = defaultFixtures(now()), readyAfterPolls = 2,
  searchLimitBehavior = 'reject', rateLimitOn = null, neverReady = false,
} = {}) {
  const calls = [];
  const reports = {
    settlement: { files: [{ id: 1, file_name: 'settlement-old-987654321.csv', created_from: 'manual' }], pending: null, polls: 0 },
    release: { files: [], pending: null, polls: 0 },
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let body = '';
    for await (const chunk of req) body += chunk;
    const op = `${req.method} ${url.pathname}`;
    calls.push(op.replace(/(_report\/)(?!config$|list$)[^/]+$/, '$1{file_name}'));

    const json = (status, payload) => {
      res.writeHead(status, { 'content-type': 'application/json', 'x-ratelimit-remaining': '99' });
      res.end(JSON.stringify(payload));
    };
    const error = (status, message, err = 'bad_request') => json(status, { message, error: err, status, cause: [] });

    if (req.headers.authorization !== `Bearer ${TEST_TOKEN}`) return error(401, 'invalid access token', 'unauthorized');
    if (rateLimitOn && op.startsWith(rateLimitOn)) return error(429, 'Too many requests', 'too_many_requests');

    if (op === 'GET /v1/payments/search') {
      const p = url.searchParams;
      const limit = Number(p.get('limit') ?? 30);
      const offset = Number(p.get('offset') ?? 0);
      if (limit > 50 && searchLimitBehavior === 'reject') return error(400, 'limit must be less than or equal to 50');
      const begin = Date.parse(p.get('begin_date'));
      const end = Date.parse(p.get('end_date'));
      const matching = fixtures.payments
        .filter((x) => { const t = Date.parse(x.date_created); return t >= begin && t <= end; })
        .sort((a, b) => Date.parse(b.date_created) - Date.parse(a.date_created));
      const effective = Math.min(limit, 50);
      return json(200, { paging: { total: matching.length, limit: effective, offset }, results: matching.slice(offset, offset + effective) });
    }

    const match = /^\/v1\/account\/(settlement|release)_report(\/.*)?$/.exec(url.pathname);
    if (!match) return error(404, `Fake: operación no implementada ${op}`, 'not_found');
    const kind = match[1];
    const rest = match[2] ?? '';
    const state = reports[kind];

    if (req.method === 'GET' && rest === '/config') {
      return kind === 'settlement' ? json(200, fixtures.settlementConfig) : error(404, 'config not found', 'not_found');
    }
    if (req.method === 'POST' && rest === '') {
      const { begin_date: b, end_date: e } = JSON.parse(body || '{}');
      if (!b || !e) return error(400, 'begin_date and end_date are required');
      if (Date.parse(e) - Date.parse(b) > 60 * DAY_MS) return error(400, 'The maximum period is 60 days');
      state.pending = { id: 99, file_name: `${kind}-new-987654321.${kind === 'release' ? 'xlsx' : 'csv'}`, created_from: 'manual', begin_date: b, end_date: e };
      state.polls = 0;
      return json(202, { id: 99, status: 'pending', begin_date: b, end_date: e });
    }
    if (req.method === 'GET' && rest === '/list') {
      if (state.pending) {
        state.polls += 1;
        if (!neverReady && state.polls >= readyAfterPolls) { state.files.push(state.pending); state.pending = null; }
      }
      return json(200, state.files);
    }
    if (req.method === 'GET' && rest.length > 1) {
      const file = state.files.find((f) => f.file_name === rest.slice(1));
      if (!file) return error(404, 'file not found', 'not_found');
      if (kind === 'release') {
        res.writeHead(200, { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        return res.end(fixtures.releaseXlsx);
      }
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8' });
      return res.end(fixtures.settlementCsv);
    }
    return error(404, `Fake: operación no implementada ${op}`, 'not_found');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    calls,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
