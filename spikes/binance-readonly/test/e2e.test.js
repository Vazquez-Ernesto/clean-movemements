import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { ALLOWED_ENDPOINTS, createClient } from '../src/client.js';
import { renderMarkdown } from '../src/report.js';
import { runSpike } from '../src/spike.js';
import {
  SENSITIVE_MARKERS, TEST_API_KEY, TEST_API_SECRET, defaultFixtures, startFakeBinance,
} from './fake-binance.js';

const noPause = async () => {};

function configFor(baseUrl, overrides = {}) {
  return {
    apiKey: TEST_API_KEY, apiSecret: TEST_API_SECRET, baseUrl,
    lookbackDays: 90, maxSymbols: 30, maxTradePages: 20, symbols: [], ...overrides,
  };
}

async function run(fakeOptions = {}, configOverrides = {}) {
  const fake = await startFakeBinance(fakeOptions);
  try {
    const config = configFor(fake.baseUrl, configOverrides);
    const client = createClient(config);
    const report = await runSpike(config, { client, pause: noPause });
    return { report, calls: fake.calls };
  } finally {
    await fake.close();
  }
}

const byId = (report, id) => report.checks.find((c) => c.id === id);

describe('spike contra un Binance falso: camino feliz', () => {
  let report;
  let calls;
  before(async () => ({ report, calls } = await run()));

  it('completa todas las verificaciones', () => {
    assert.equal(report.aborted, null);
    assert.deepEqual(report.checks.filter((c) => c.status !== 'OK').map((c) => c.id), []);
  });

  it('solo llama endpoints de la lista permitida', () => {
    for (const endpoint of calls) assert.ok(ALLOWED_ENDPOINTS.has(endpoint), endpoint);
  });

  it('confirma que la key es de solo lectura antes de leer datos', () => {
    assert.equal(byId(report, 'permissions').findings.readOnly, true);
    assert.ok(calls.indexOf('GET /sapi/v1/account/apiRestrictions') < calls.indexOf('GET /api/v3/account'));
  });

  it('lee depósitos por ventanas, pagina y excluye lo que está fuera del período', () => {
    const deposits = byId(report, 'deposits').findings;
    assert.equal(deposits.count, 1500);
    assert.deepEqual(deposits.idCandidates.id, { presentIn: 1500, of: 1500, unique: true });
    assert.deepEqual(deposits.categories.network, ['BTC', 'TRX']);
    assert.ok(calls.filter((c) => c === 'GET /sapi/v1/capital/deposit/hisrec').length >= 3, 'pagina más de 1000 registros');
  });

  it('interpreta las fechas en texto de los retiros', () => {
    const withdrawals = byId(report, 'withdrawals').findings;
    assert.equal(withdrawals.count, 1);
    assert.match(withdrawals.dateRange.oldest, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('descubre pares a partir de los activos y lee todo el historial de trades por fromId', () => {
    const discovery = byId(report, 'symbol-discovery').findings;
    assert.ok(discovery.symbols.includes('BTCUSDT'));
    assert.ok(discovery.symbols.includes('USDTARS'));
    const trades = byId(report, 'trades').findings;
    assert.equal(trades.perSymbol.BTCUSDT.count, 2300);
    assert.equal(trades.perSymbol.BTCUSDT.pages, 3);
    assert.equal(trades.perSymbol.USDTARS.count, 1);
    // El historial de trades no está limitado al período consultado.
    assert.ok(trades.perSymbol.BTCUSDT.dateRange.oldest < byId(report, 'deposits').findings.dateRange.oldest);
  });

  it('confirma que myTrades rechaza rangos de más de 24 h', () => {
    const limit = byId(report, 'trades-window-limit').findings;
    assert.equal(limit.rejected, true);
    assert.equal(limit.error.code, -1127);
  });

  it('lee Convert en ventanas de 30 días', () => {
    assert.equal(byId(report, 'convert').findings.count, 1);
  });

  it('las lecturas repetidas devuelven los mismos identificadores', () => {
    const stability = byId(report, 'read-stability').findings;
    assert.equal(stability.deposits.identical, true);
    assert.equal(stability.trades.identical, true);
  });

  it('el reporte no contiene importes, direcciones, txIds ni credenciales', () => {
    const text = JSON.stringify(report) + renderMarkdown(report);
    for (const marker of SENSITIVE_MARKERS) assert.ok(!text.includes(marker), `filtró: ${marker}`);
  });

  it('registra el uso de peso de la API', () => {
    assert.ok(report.rateLimit.maxWeightHeaders['x-mbx-used-weight-1m'] > 0);
  });
});

describe('spike contra un Binance falso: casos de seguridad y error', () => {
  it('aborta sin leer datos si la key permite retiros', async () => {
    const fixtures = defaultFixtures(Date.now());
    fixtures.restrictions.enableWithdrawals = true;
    const { report, calls } = await run({ fixtures });
    assert.match(report.aborted, /enableWithdrawals/);
    assert.deepEqual(calls, ['GET /api/v3/time', 'GET /sapi/v1/account/apiRestrictions']);
    assert.ok(report.checks.slice(2).every((c) => c.status === 'OMITIDO'));
  });

  it('aborta si la key tiene un permiso de escritura desconocido', async () => {
    const fixtures = defaultFixtures(Date.now());
    fixtures.restrictions.enableNewDangerousThing = true;
    const { report, calls } = await run({ fixtures });
    assert.ok(report.aborted);
    assert.ok(!calls.includes('GET /api/v3/account'));
  });

  it('aborta si las credenciales son inválidas', async () => {
    const fake = await startFakeBinance();
    try {
      const config = configFor(fake.baseUrl, { apiSecret: 'secret-incorrecto' });
      const report = await runSpike(config, { client: createClient(config), pause: noPause });
      assert.equal(byId(report, 'permissions').status, 'FALLÓ');
      assert.match(report.aborted, /No se pudieron verificar/);
      assert.ok(!JSON.stringify(report).includes('secret-incorrecto'));
    } finally {
      await fake.close();
    }
  });

  it('se detiene ante un límite de API y no sigue insistiendo', async () => {
    const { report, calls } = await run({ rateLimitOn: 'GET /sapi/v1/capital/withdraw/history' });
    assert.equal(byId(report, 'withdrawals').status, 'FALLÓ');
    const later = report.checks.slice(report.checks.findIndex((c) => c.id === 'withdrawals') + 1);
    assert.ok(later.every((c) => c.status === 'OMITIDO'));
    assert.equal(calls.at(-1), 'GET /sapi/v1/capital/withdraw/history');
  });

  it('con un período largo respeta el límite de 90 días e incluye los depósitos antiguos', async () => {
    const { report } = await run({}, { lookbackDays: 365 });
    assert.equal(byId(report, 'deposits').status, 'OK');
    assert.equal(byId(report, 'withdrawals').status, 'OK');
    assert.equal(byId(report, 'convert').status, 'OK');
    assert.equal(byId(report, 'deposits').findings.count, 1505);
  });

  it('usa los símbolos configurados sin consultar exchangeInfo', async () => {
    const { report, calls } = await run({}, { symbols: ['USDTARS'] });
    assert.ok(!calls.includes('GET /api/v3/exchangeInfo'));
    assert.deepEqual(Object.keys(byId(report, 'trades').findings.perSymbol), ['USDTARS']);
  });
});
