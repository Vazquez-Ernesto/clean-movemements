import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { createClient, isAllowed } from '../src/client.js';
import { renderMarkdown } from '../src/report.js';
import { runSpike } from '../src/spike.js';
import {
  SENSITIVE_MARKERS, TEST_TOKEN, TEST_USER_ID, startFakeMercadoPago,
} from './fake-mercadopago.js';

function configFor(baseUrl, overrides = {}) {
  return {
    accessToken: TEST_TOKEN, baseUrl, userId: null, searchDays: 60, reportDays: 30,
    maxSearchPages: 20, reports: ['settlement', 'release'], pollMs: 15_000, reportTimeoutMs: 10 * 60_000,
    ...overrides,
  };
}

// Reloj virtual: las esperas entre consultas no demoran las pruebas.
function virtualClock() {
  let t = Date.now();
  return { now: () => t, sleep: async (ms) => { t += ms; }, pause: async () => {} };
}

async function run(fakeOptions = {}, configOverrides = {}) {
  const fake = await startFakeMercadoPago(fakeOptions);
  try {
    const config = configFor(fake.baseUrl, configOverrides);
    const report = await runSpike(config, { client: createClient(config), ...virtualClock() });
    return { report, calls: fake.calls };
  } finally {
    await fake.close();
  }
}

const byId = (report, id) => report.checks.find((c) => c.id === id);

describe('spike contra un Mercado Pago falso: camino feliz', () => {
  let report;
  let calls;
  before(async () => ({ report, calls } = await run({}, { userId: TEST_USER_ID })));

  it('completa todas las verificaciones', () => {
    assert.equal(report.aborted, null);
    assert.deepEqual(report.checks.filter((c) => c.status !== 'OK').map((c) => c.id), []);
  });

  it('solo usa operaciones de la lista permitida', () => {
    for (const op of calls) {
      const [method, path] = op.split(' ');
      assert.ok(isAllowed(method, path.replace('{file_name}', 'x.csv')), op);
    }
  });

  it('pagina la búsqueda de pagos de a 50 y excluye lo que está fuera del período', () => {
    const f = byId(report, 'payments-search').findings;
    assert.equal(f.pagingTotal, 130);
    assert.equal(f.fetched, 130);
    assert.equal(f.pages, 3);
    assert.equal(f.payments.id.unique, true);
  });

  it('identifica roles, tipos de operación e importes numéricos', () => {
    const p = byId(report, 'payments-search').findings.payments;
    assert.equal(p.roles.received + p.roles.sent, 130);
    assert.ok(p.roles.received > 0 && p.roles.sent > 0);
    assert.deepEqual(Object.keys(p.categories.operation_type).sort(), ['money_transfer', 'regular_payment']);
    assert.deepEqual(p.amounts.transaction_amount.jsonTypes, ['number']);
    assert.ok(report.observations.some((o) => o.includes('BigDecimal')));
    assert.ok(report.observations.some((o) => /\d+ recibidos, \d+ hechos por vos/.test(o)));
    assert.ok(!report.observations.some((o) => o.includes('configurá MP_USER_ID')), 'no pide MP_USER_ID si ya está');
  });

  it('registra que pedir 51 por página fue rechazado', () => {
    assert.equal(byId(report, 'payments-search-limit').findings.rejected, true);
  });

  it('genera, espera, descarga y analiza el reporte CSV de "Todas las transacciones"', () => {
    const f = byId(report, 'settlement-report').findings;
    assert.equal(f.config.exists, true);
    assert.equal(f.config.safeValues.separator, ';');
    assert.equal(f.listBefore.entries, 1);
    assert.equal(f.generation.ready, true);
    assert.equal(f.generation.polls, 2);
    assert.equal(f.file.format, 'csv');
    assert.equal(f.csv.rows, 40);
    assert.equal(f.csv.malformedRows, 0, 'respeta los ; dentro de comillas');
    assert.deepEqual(Object.keys(f.csv.categories.TRANSACTION_TYPE).sort(), ['REFUND', 'SETTLEMENT', 'WITHDRAWAL']);
    assert.deepEqual(f.csv.amountColumns.TRANSACTION_AMOUNT.decimalSeparators, [',']);
    assert.ok(f.csv.emptyColumns.includes('COUPON_AMOUNT'));
  });

  it('reconoce un reporte XLSX sin intentar parsearlo y tolera la falta de configuración', () => {
    const f = byId(report, 'release-report').findings;
    assert.equal(f.config.exists, false);
    assert.equal(f.file.format, 'xlsx');
    assert.equal(f.csv, undefined);
  });

  it('las lecturas repetidas devuelven los mismos ids', () => {
    assert.equal(byId(report, 'read-stability').findings.identical, true);
  });

  it('el reporte no contiene datos personales, importes, ids, nombres de archivo ni el token', () => {
    const text = JSON.stringify(report) + renderMarkdown(report);
    for (const marker of SENSITIVE_MARKERS) assert.ok(!text.includes(marker), `filtró: ${marker}`);
  });
});

describe('spike contra un Mercado Pago falso: casos de borde y error', () => {
  it('aborta sin llamar a la API con un token de prueba', async () => {
    const fake = await startFakeMercadoPago();
    try {
      const config = configFor(fake.baseUrl, { accessToken: 'TEST-123' });
      const report = await runSpike(config, { client: createClient(config), ...virtualClock() });
      assert.match(report.aborted, /prueba/);
      assert.deepEqual(fake.calls, []);
    } finally {
      await fake.close();
    }
  });

  it('informa el error si el token es inválido sin exponerlo', async () => {
    const fake = await startFakeMercadoPago();
    try {
      const config = configFor(fake.baseUrl, { accessToken: 'APP_USR-token-invalido-xyz' });
      const report = await runSpike(config, { client: createClient(config), ...virtualClock() });
      assert.equal(byId(report, 'payments-search').status, 'FALLÓ');
      assert.equal(byId(report, 'payments-search').error.status, 401);
      assert.ok(!JSON.stringify(report).includes('token-invalido-xyz'));
    } finally {
      await fake.close();
    }
  });

  it('si la API limita a 50 sin error, lo registra como comportamiento', async () => {
    const { report } = await run({ searchLimitBehavior: 'clamp' });
    const f = byId(report, 'payments-search-limit').findings;
    assert.equal(f.rejected, false);
    assert.equal(f.returned, 50);
  });

  it('corta la espera del reporte al vencer el tiempo máximo', async () => {
    const { report } = await run({ neverReady: true }, { reports: ['settlement'], reportTimeoutMs: 60_000 });
    const c = byId(report, 'settlement-report');
    assert.equal(c.status, 'FALLÓ');
    assert.match(c.error.message, /no apareció en la lista tras 60 s/, 'respeta el tiempo máximo configurado');
    assert.equal(byId(report, 'read-stability').status, 'OK', 'las demás verificaciones siguen');
  });

  it('se detiene ante un 429 y no sigue insistiendo', async () => {
    const { report, calls } = await run({ rateLimitOn: 'POST /v1/account/settlement_report' });
    assert.equal(byId(report, 'settlement-report').status, 'FALLÓ');
    assert.ok(['release-report', 'read-stability'].every((id) => byId(report, id).status === 'OMITIDO'));
    assert.equal(calls.at(-1), 'POST /v1/account/settlement_report');
  });

  it('sin MP_USER_ID infiere qué pagos devuelve la búsqueda solo por cantidades', async () => {
    const { report } = await run({}, { reports: [] });
    const p = byId(report, 'payments-search').findings.payments;
    assert.equal(p.roles, null);
    assert.ok(p.distinctCollectorIds > 1 && p.distinctPayerIds > 1);
    assert.ok(report.observations.some((o) => o.includes('configurá MP_USER_ID')));
  });
});
