import { createHmac } from 'node:crypto';

/**
 * Lista cerrada de endpoints que el spike puede usar. Todos son de lectura.
 * Cualquier otro endpoint (órdenes, retiros, transferencias) se rechaza antes
 * de salir a la red, aunque la key tuviera permisos para hacerlo.
 */
export const ALLOWED_ENDPOINTS = new Map([
  ['GET /api/v3/time', { signed: false }],
  ['GET /api/v3/exchangeInfo', { signed: false }],
  ['GET /sapi/v1/account/apiRestrictions', { signed: true }],
  ['GET /api/v3/account', { signed: true }],
  ['GET /api/v3/myTrades', { signed: true }],
  ['GET /sapi/v1/capital/deposit/hisrec', { signed: true }],
  ['GET /sapi/v1/capital/withdraw/history', { signed: true }],
  // Es POST, pero solo consulta activos (USER_DATA). No mueve fondos.
  ['POST /sapi/v3/asset/getUserAsset', { signed: true }],
  ['GET /sapi/v1/convert/tradeFlow', { signed: true }],
]);

export class BinanceApiError extends Error {
  constructor(status, code, msg) {
    super(`HTTP ${status}${code !== undefined ? ` · código ${code}` : ''}: ${msg}`);
    this.name = 'BinanceApiError';
    this.status = status;
    this.code = code;
    this.isRateLimit = status === 429 || status === 418;
  }
}

/** Firma HMAC-SHA256 del query string, como pide Binance para endpoints SIGNED. */
export function sign(queryString, secret) {
  return createHmac('sha256', secret).update(queryString).digest('hex');
}

const WEIGHT_HEADER_PREFIXES = ['x-mbx-used-weight', 'x-sapi-used'];

export function createClient({
  baseUrl,
  apiKey,
  apiSecret,
  fetchImpl = fetch,
  now = Date.now,
  recvWindow = 5000,
}) {
  let clockOffsetMs = 0;
  const calls = [];

  async function request(method, path, params = {}) {
    const endpoint = `${method} ${path}`;
    const rule = ALLOWED_ENDPOINTS.get(endpoint);
    if (!rule) {
      throw new Error(`Endpoint no permitido en el spike: ${endpoint}`);
    }

    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) query.append(name, String(value));
    }
    const headers = {};
    if (rule.signed) {
      query.append('recvWindow', String(recvWindow));
      query.append('timestamp', String(now() + clockOffsetMs));
      query.append('signature', sign(query.toString(), apiSecret));
      headers['X-MBX-APIKEY'] = apiKey;
    }

    const started = performance.now();
    const res = await fetchImpl(`${baseUrl}${path}?${query}`, { method, headers });
    const durationMs = Math.round(performance.now() - started);

    const weights = {};
    for (const [name, value] of res.headers) {
      if (WEIGHT_HEADER_PREFIXES.some((p) => name.toLowerCase().startsWith(p))) {
        weights[name.toLowerCase()] = Number(value);
      }
    }
    // Nunca se guarda la URL: contiene la firma y los parámetros de la cuenta.
    calls.push({ endpoint, status: res.status, durationMs, weights });

    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!res.ok) {
      const err = new BinanceApiError(res.status, body?.code, body?.msg ?? 'respuesta sin detalle');
      err.retryAfter = res.headers.get('retry-after');
      throw err;
    }
    return body;
  }

  async function syncClock() {
    const before = now();
    const { serverTime } = await request('GET', '/api/v3/time');
    const after = now();
    clockOffsetMs = serverTime - Math.round((before + after) / 2);
    return clockOffsetMs;
  }

  return { request, syncClock, calls };
}
