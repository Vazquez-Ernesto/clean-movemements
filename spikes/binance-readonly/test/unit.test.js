import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DAY_MS, analyzeRecords, compareReads, decimalsOf, evaluatePermissions, splitWindows,
} from '../src/analyze.js';
import { createClient, sign } from '../src/client.js';
import { readConfig } from '../src/main.js';

describe('sign', () => {
  it('reproduce el ejemplo HMAC-SHA256 de la documentación de Binance', () => {
    const secret = 'NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j';
    const query = 'symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559';
    assert.equal(sign(query, secret), 'c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71');
  });
});

describe('createClient', () => {
  const fakeFetch = (captured) => async (url, init) => {
    captured.push({ url, init });
    return new Response('{"ok":true}', { status: 200, headers: { 'x-mbx-used-weight-1m': '20' } });
  };

  it('rechaza endpoints fuera de la lista permitida sin salir a la red', async () => {
    const captured = [];
    const client = createClient({ baseUrl: 'http://x', apiKey: 'k', apiSecret: 's', fetchImpl: fakeFetch(captured) });
    for (const [method, path] of [
      ['POST', '/api/v3/order'],
      ['POST', '/sapi/v1/capital/withdraw/apply'],
      ['DELETE', '/api/v3/openOrders'],
      ['POST', '/api/v3/account'],
    ]) {
      await assert.rejects(client.request(method, path), /no permitido/);
    }
    assert.equal(captured.length, 0);
  });

  it('firma con timestamp y recvWindow, manda la key en el encabezado y nunca el secret', async () => {
    const captured = [];
    const client = createClient({
      baseUrl: 'http://x', apiKey: 'mi-key', apiSecret: 'mi-secret', fetchImpl: fakeFetch(captured), now: () => 1_000,
    });
    await client.request('GET', '/api/v3/account', { omitZeroBalances: true });
    const { url, init } = captured[0];
    const query = new URL(url).search.slice(1);
    const [unsigned, signature] = query.split('&signature=');
    assert.equal(unsigned, 'omitZeroBalances=true&recvWindow=5000&timestamp=1000');
    assert.equal(signature, sign(unsigned, 'mi-secret'));
    assert.equal(init.headers['X-MBX-APIKEY'], 'mi-key');
    assert.ok(!url.includes('mi-secret') && !url.includes('mi-key'));
    assert.deepEqual(client.calls[0].weights, { 'x-mbx-used-weight-1m': 20 });
    assert.ok(!('url' in client.calls[0]), 'el registro de llamadas no guarda la URL firmada');
  });

  it('no firma los endpoints públicos', async () => {
    const captured = [];
    const client = createClient({ baseUrl: 'http://x', apiKey: 'k', apiSecret: 's', fetchImpl: fakeFetch(captured) });
    await client.request('GET', '/api/v3/time');
    assert.ok(!captured[0].url.includes('signature'));
    assert.deepEqual(captured[0].init.headers, {});
  });

  it('marca los errores 429 y 418 como límite de API', async () => {
    const client = createClient({
      baseUrl: 'http://x', apiKey: 'k', apiSecret: 's',
      fetchImpl: async () => new Response('{"code":-1003,"msg":"Too many requests."}', { status: 429, headers: { 'retry-after': '30' } }),
    });
    await assert.rejects(client.request('GET', '/api/v3/time'), (e) => e.isRateLimit && e.code === -1003 && e.retryAfter === '30');
  });
});

describe('splitWindows', () => {
  it('cubre el rango completo sin huecos ni solapamientos y respeta el máximo', () => {
    const start = 0;
    const end = 90 * DAY_MS;
    const windows = splitWindows(start, end, 89 * DAY_MS);
    assert.equal(windows.length, 2);
    assert.equal(windows[0][0], start);
    assert.equal(windows.at(-1)[1], end - 1);
    for (let i = 1; i < windows.length; i += 1) assert.equal(windows[i][0], windows[i - 1][1] + 1);
    for (const [s, e] of windows) assert.ok(e - s < 89 * DAY_MS);
  });

  it('devuelve una sola ventana si el rango es menor al máximo', () => {
    assert.deepEqual(splitWindows(10, 20, 100), [[10, 19]]);
  });
});

describe('evaluatePermissions', () => {
  const base = { ipRestrict: false, enableReading: true, enableWithdrawals: false, enableSpotAndMarginTrading: false };

  it('acepta una key solo de lectura', () => {
    const r = evaluatePermissions(base);
    assert.equal(r.readOnly, true);
    assert.deepEqual(r.writePermissions, []);
  });

  it('rechaza una key con retiros o trading habilitados', () => {
    const r = evaluatePermissions({ ...base, enableWithdrawals: true, enableSpotAndMarginTrading: true });
    assert.equal(r.readOnly, false);
    assert.deepEqual(r.writePermissions, ['enableSpotAndMarginTrading', 'enableWithdrawals']);
  });

  it('rechaza indicadores nuevos que Binance pudiera agregar', () => {
    assert.equal(evaluatePermissions({ ...base, enableSomethingNew: true }).readOnly, false);
    assert.equal(evaluatePermissions({ ...base, permitsAnything: true }).readOnly, false);
  });

  it('rechaza una key sin permiso de lectura o una respuesta vacía', () => {
    assert.equal(evaluatePermissions({ ...base, enableReading: false }).readOnly, false);
    assert.equal(evaluatePermissions(null).readOnly, false);
  });
});

describe('analyzeRecords', () => {
  it('describe la forma de los datos sin copiar sus valores', () => {
    const records = [
      { id: 1, amount: '1.12345678', network: 'TRX', status: 1, applyTime: '2026-10-01 10:00:00' },
      { id: 2, amount: '2.5', network: 'BTC', status: 1, applyTime: '2026-10-05 23:59:59' },
      { id: 2, amount: 3.1, network: 'BTC', status: 6, applyTime: '2026-09-30 00:00:00' },
    ];
    const r = analyzeRecords(records, { dateField: 'applyTime', categoricalFields: ['network', 'status'] });
    assert.equal(r.count, 3);
    assert.deepEqual(r.amountDecimals, { amount: 8 });
    assert.deepEqual(r.numericAmountFields, ['amount']);
    assert.deepEqual(r.idCandidates.id, { presentIn: 3, of: 3, unique: false });
    assert.deepEqual(r.dateRange, { field: 'applyTime', oldest: '2026-09-30', newest: '2026-10-05' });
    assert.deepEqual(r.categories, { network: ['BTC', 'TRX'], status: ['1', '6'] });
    assert.ok(!JSON.stringify(r).includes('1.12345678'));
  });

  it('cuenta decimales de strings decimales', () => {
    assert.equal(decimalsOf('10'), 0);
    assert.equal(decimalsOf('0.00000001'), 8);
    assert.equal(decimalsOf('abc'), null);
  });

  it('compara dos lecturas por identificador', () => {
    assert.equal(compareReads([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 1 }], 'id').identical, true);
    const diff = compareReads([{ id: 1 }], [{ id: 1 }, { id: 3 }], 'id');
    assert.equal(diff.identical, false);
    assert.equal(diff.onlyInSecond, 1);
  });
});

describe('readConfig', () => {
  it('exige key y secret y valida los números', () => {
    const { errors } = readConfig({ SPIKE_LOOKBACK_DAYS: '0' });
    assert.equal(errors.length, 3);
  });

  it('normaliza los símbolos configurados y aplica valores por defecto', () => {
    const { errors, config } = readConfig({ BINANCE_API_KEY: 'k', BINANCE_API_SECRET: 's', SPIKE_SYMBOLS: ' btcusdt, ,usdtars ' });
    assert.deepEqual(errors, []);
    assert.deepEqual(config.symbols, ['BTCUSDT', 'USDTARS']);
    assert.equal(config.baseUrl, 'https://api.binance.com');
    assert.equal(config.lookbackDays, 90);
  });
});
