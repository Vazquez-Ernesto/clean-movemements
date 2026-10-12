import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';

export const TEST_API_KEY = 'test-api-key';
export const TEST_API_SECRET = 'test-api-secret';
const DAY_MS = 24 * 60 * 60 * 1000;

// Valores "trampa": si aparecen en el reporte, el reporte filtra datos sensibles.
export const SENSITIVE_MARKERS = [
  '1234.56789012', '0.98765432', 'TFakeAddressMustNotLeak', 'txid-must-not-leak',
  '777.000001', '31337.4242', TEST_API_KEY, TEST_API_SECRET,
];

export function defaultFixtures(nowMs) {
  // 1500 depósitos en los últimos 60 días (más de 1000 en una ventana, para
  // ejercitar la paginación) y 5 de hace 200 días (fuera del período consultado).
  const deposits = [];
  for (let i = 0; i < 1505; i += 1) {
    const daysAgo = i < 1500 ? i % 60 : 200;
    deposits.push({
      id: `dep-${i}`, amount: i === 0 ? '1234.56789012' : '10.5', coin: i % 2 ? 'USDT' : 'BTC',
      network: i % 2 ? 'TRX' : 'BTC', status: 1, address: 'TFakeAddressMustNotLeak',
      txId: 'txid-must-not-leak', insertTime: nowMs - daysAgo * DAY_MS - 1000, transferType: 0,
    });
  }
  return {
    restrictions: {
      ipRestrict: false, createTime: nowMs - 10 * DAY_MS, enableReading: true,
      enableWithdrawals: false, enableInternalTransfer: false, enableMargin: false,
      enableFutures: false, permitsUniversalTransfer: false, enableVanillaOptions: false,
      enableSpotAndMarginTrading: false, enablePortfolioMarginTrading: false,
    },
    balances: [
      { asset: 'BTC', free: '0.98765432', locked: '0.00000000' },
      { asset: 'USDT', free: '777.000001', locked: '0' },
      { asset: 'DUST', free: '0', locked: '0' },
    ],
    deposits,
    withdrawals: [
      { id: 'wd-1', amount: '31337.4242', transactionFee: '1', coin: 'USDT', network: 'TRX', status: 6,
        address: 'TFakeAddressMustNotLeak', txId: 'txid-must-not-leak', applyTime: isoUtc(nowMs - 5 * DAY_MS), transferType: 0 },
    ],
    symbols: ['BTCUSDT', 'ETHUSDT', 'USDTARS', 'BNBBTC'],
    trades: {
      BTCUSDT: Array.from({ length: 2300 }, (_, i) => ({
        symbol: 'BTCUSDT', id: 100 + i, orderId: 9000 + Math.floor(i / 2), price: '60000.12', qty: '0.001',
        quoteQty: '60.00012', commission: '0.00000100', commissionAsset: 'BTC',
        time: nowMs - 400 * DAY_MS + i * 60_000, isBuyer: true, isMaker: false, isBestMatch: true,
      })),
      USDTARS: [{ symbol: 'USDTARS', id: 1, orderId: 1, price: '1200.5', qty: '10', quoteQty: '12005',
        commission: '0.01', commissionAsset: 'USDT', time: nowMs - 3 * DAY_MS, isBuyer: false, isMaker: true, isBestMatch: true }],
    },
    convert: [
      { quoteId: 'q-1', orderId: 1, orderStatus: 'SUCCESS', fromAsset: 'USDT', fromAmount: '20', toAsset: 'BTC',
        toAmount: '0.0003', ratio: '0.000015', inverseRatio: '66666.6', createTime: nowMs - 10 * DAY_MS },
    ],
  };
}

function isoUtc(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

/** Inicia un Binance falso. Devuelve { baseUrl, calls, close }. */
export async function startFakeBinance({ now = Date.now, fixtures = defaultFixtures(now()), rateLimitOn = null } = {}) {
  const calls = [];

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const endpoint = `${req.method} ${url.pathname}`;
    calls.push(endpoint);
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', 'x-mbx-used-weight-1m': String(calls.length * 5), ...headers });
      res.end(JSON.stringify(body));
    };
    const fail = (code, msg) => send(400, { code, msg });

    if (rateLimitOn === endpoint) return send(429, { code: -1003, msg: 'Too many requests.' }, { 'retry-after': '30' });
    if (endpoint === 'GET /api/v3/time') return send(200, { serverTime: now() });
    if (endpoint === 'GET /api/v3/exchangeInfo') return send(200, { symbols: fixtures.symbols.map((symbol) => ({ symbol })) });

    // Todo lo demás es SIGNED: se verifica key, firma y timestamp.
    const raw = url.search.slice(1);
    const sigIndex = raw.lastIndexOf('&signature=');
    if (req.headers['x-mbx-apikey'] !== TEST_API_KEY || sigIndex < 0) {
      return send(401, { code: -2015, msg: 'Invalid API-key, IP, or permissions for action.' });
    }
    const expected = createHmac('sha256', TEST_API_SECRET).update(raw.slice(0, sigIndex)).digest('hex');
    if (raw.slice(sigIndex + '&signature='.length) !== expected) {
      return fail(-1022, 'Signature for this request is not valid.');
    }
    const p = url.searchParams;
    if (Math.abs(now() - Number(p.get('timestamp'))) > Number(p.get('recvWindow') ?? 5000)) {
      return fail(-1021, 'Timestamp for this request is outside of the recvWindow.');
    }
    const num = (name) => (p.has(name) ? Number(p.get(name)) : undefined);
    const page = (list) => list.slice(num('offset') ?? 0, (num('offset') ?? 0) + (num('limit') ?? 1000));
    const inRange = (t, s, e) => (s === undefined || t >= s) && (e === undefined || t <= e);

    switch (endpoint) {
      case 'GET /sapi/v1/account/apiRestrictions':
        return send(200, fixtures.restrictions);
      case 'GET /api/v3/account': {
        const omit = p.get('omitZeroBalances') === 'true';
        const balances = omit ? fixtures.balances.filter((b) => Number(b.free) + Number(b.locked) > 0) : fixtures.balances;
        return send(200, { makerCommission: 10, canTrade: true, accountType: 'SPOT', balances, permissions: ['SPOT'] });
      }
      case 'POST /sapi/v3/asset/getUserAsset':
        return send(200, fixtures.balances.filter((b) => b.free !== '0').map((b) => ({ ...b, freeze: '0', withdrawing: '0', ipoable: '0', btcValuation: '0' })));
      case 'GET /sapi/v1/capital/deposit/hisrec':
      case 'GET /sapi/v1/capital/withdraw/history': {
        const s = num('startTime'); const e = num('endTime');
        if (s !== undefined && e !== undefined && e - s >= 90 * DAY_MS) {
          return fail(-1127, 'The interval between startTime and endTime must be less than 90 days.');
        }
        const deposits = endpoint.includes('deposit');
        const list = deposits ? fixtures.deposits : fixtures.withdrawals;
        const field = deposits ? 'insertTime' : 'applyTime';
        const time = (r) => (typeof r[field] === 'number' ? r[field] : Date.parse(`${r[field].replace(' ', 'T')}Z`));
        return send(200, page(list.filter((r) => inRange(time(r), s, e))));
      }
      case 'GET /api/v3/myTrades': {
        const symbol = p.get('symbol');
        if (!symbol) return fail(-1102, "Mandatory parameter 'symbol' was not sent.");
        const s = num('startTime'); const e = num('endTime');
        if (s !== undefined && e !== undefined && e - s > DAY_MS) {
          return fail(-1127, 'More than 24 hours between startTime and endTime.');
        }
        const all = fixtures.trades[symbol] ?? [];
        const fromId = num('fromId');
        const filtered = all.filter((t) => (fromId === undefined || t.id >= fromId) && inRange(t.time, s, e));
        return send(200, filtered.slice(0, num('limit') ?? 500));
      }
      case 'GET /sapi/v1/convert/tradeFlow': {
        const s = num('startTime'); const e = num('endTime');
        if (s === undefined || e === undefined) return fail(-1102, 'startTime and endTime are mandatory.');
        if (e - s > 30 * DAY_MS) return fail(-1127, 'The interval between startTime and endTime must be within 30 days.');
        const list = fixtures.convert.filter((c) => inRange(c.createTime, s, e));
        return send(200, { list, startTime: s, endTime: e, limit: num('limit') ?? 100, moreData: false });
      }
      default:
        return send(404, { code: -1, msg: `Fake: endpoint no implementado ${endpoint}` });
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    calls,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
