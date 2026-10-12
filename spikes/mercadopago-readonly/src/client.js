/**
 * Lista cerrada de operaciones que el spike puede hacer. Todas son de lectura,
 * salvo la creación de reportes: genera un archivo en tu cuenta (como hacerlo
 * desde el panel), pero no mueve dinero ni cambia configuraciones.
 */
const FILE_NAME = '[A-Za-z0-9._-]+';
export const ALLOWED_OPERATIONS = [
  { method: 'GET', pattern: /^\/v1\/payments\/search$/ },
  { method: 'GET', pattern: /^\/v1\/account\/(settlement|release)_report\/config$/ },
  { method: 'GET', pattern: /^\/v1\/account\/(settlement|release)_report\/list$/ },
  { method: 'POST', pattern: /^\/v1\/account\/(settlement|release)_report$/ },
  { method: 'GET', pattern: new RegExp(`^/v1/account/(settlement|release)_report/${FILE_NAME}$`) },
];

export function isAllowed(method, path) {
  return ALLOWED_OPERATIONS.some((op) => op.method === method && op.pattern.test(path));
}

export class MercadoPagoApiError extends Error {
  constructor(status, body) {
    const detail = body?.message ?? body?.error ?? 'respuesta sin detalle';
    super(`HTTP ${status}${body?.error ? ` · ${body.error}` : ''}: ${detail}`);
    this.name = 'MercadoPagoApiError';
    this.status = status;
    this.error = body?.error ?? null;
    this.isRateLimit = status === 429;
  }
}

const RATE_HEADER_PREFIXES = ['x-ratelimit', 'ratelimit', 'retry-after'];

export function createClient({ baseUrl, accessToken, fetchImpl = fetch }) {
  const calls = [];

  async function request(method, path, { query = {}, body, raw = false } = {}) {
    if (!isAllowed(method, path)) {
      throw new Error(`Operación no permitida en el spike: ${method} ${path}`);
    }
    const search = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) search.append(name, String(value));
    }
    const headers = { Authorization: `Bearer ${accessToken}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const started = performance.now();
    const res = await fetchImpl(`${baseUrl}${path}${search.size ? `?${search}` : ''}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const durationMs = Math.round(performance.now() - started);

    const rateHeaders = {};
    for (const [name, value] of res.headers) {
      if (RATE_HEADER_PREFIXES.some((p) => name.toLowerCase().startsWith(p))) rateHeaders[name.toLowerCase()] = value;
    }
    // Se registra la operación sin la ruta concreta: los nombres de archivo de
    // los reportes pueden incluir datos de la cuenta.
    const endpoint = `${method} ${path.replace(new RegExp(`(_report/)(?!config$|list$)${FILE_NAME}$`), '$1{file_name}')}`;
    calls.push({ endpoint, status: res.status, durationMs, rateHeaders });

    if (raw && res.ok) {
      return { contentType: res.headers.get('content-type') ?? '', bytes: new Uint8Array(await res.arrayBuffer()) };
    }
    const text = await res.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!res.ok) throw new MercadoPagoApiError(res.status, parsed);
    return parsed;
  }

  return { request, calls };
}
