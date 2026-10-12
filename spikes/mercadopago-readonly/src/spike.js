import {
  DAY_MS, analyzeCsvReport, analyzePayments, compareIds, looksLikeZip, parseCsv,
} from './analyze.js';

export const SPIKE_VERSION = '0.1.0';

const SEARCH_LIMIT = 50; // máximo documentado por página
const SEARCH_MAX_OFFSET = 10000; // máximo documentado
const REPORT_KINDS = {
  settlement: { title: 'Reporte "Todas las transacciones"', path: '/v1/account/settlement_report' },
  release: { title: 'Reporte "Liquidaciones"', path: '/v1/account/release_report' },
};
const SAFE_CONFIG_KEYS = new Set(['separator', 'display_timezone', 'report_translation', 'frequency', 'scheduled', 'file_name_prefix_set']);

export function tokenKind(token) {
  if (token.startsWith('APP_USR-')) return 'produccion';
  if (token.startsWith('TEST-')) return 'prueba';
  return 'desconocido';
}

/**
 * Ejecuta el spike de solo lectura y devuelve un reporte sin importes,
 * nombres, correos, documentos, descripciones ni identificadores de pagos.
 */
export async function runSpike(config, {
  client, now = Date.now, sleep = defaultSleep, pause = () => sleep(200), log = () => {},
}) {
  const report = {
    spike: 'mercadopago-readonly',
    version: SPIKE_VERSION,
    generatedAt: new Date(now()).toISOString(),
    config: {
      baseUrl: config.baseUrl,
      tokenKind: tokenKind(config.accessToken),
      searchDays: config.searchDays,
      reportDays: config.reportDays,
      reports: config.reports,
      userIdConfigured: Boolean(config.userId),
    },
    aborted: null,
    checks: [],
  };
  const state = { stopped: false, stopReason: null };

  async function check(id, title, fn) {
    if (state.stopped) {
      report.checks.push({ id, title, status: 'OMITIDO', reason: state.stopReason });
      return null;
    }
    log(`→ ${title}`);
    const callsBefore = client.calls.length;
    const started = performance.now();
    try {
      const findings = await fn();
      report.checks.push({ id, title, status: 'OK', durationMs: Math.round(performance.now() - started), requests: client.calls.length - callsBefore, findings });
      return findings;
    } catch (error) {
      if (error.isRateLimit) {
        state.stopped = true;
        state.stopReason = 'Límite de API alcanzado (HTTP 429); se detuvo el spike para no insistir.';
      }
      report.checks.push({ id, title, status: 'FALLÓ', durationMs: Math.round(performance.now() - started), requests: client.calls.length - callsBefore, error: describeError(error) });
      return null;
    }
  }

  async function call(method, path, options) {
    const body = await client.request(method, path, options);
    await pause();
    return body;
  }

  // 0. Tipo de token: los reportes de cuentas de prueba salen vacíos.
  if (report.config.tokenKind === 'prueba') {
    state.stopped = true;
    state.stopReason = 'El Access Token es de prueba (TEST-): los reportes de cuentas de prueba no tienen datos. Usá las credenciales de producción.';
    report.aborted = state.stopReason;
  }

  // 1. Búsqueda de pagos
  const endMs = now();
  const searchQuery = {
    sort: 'date_created',
    criteria: 'desc',
    range: 'date_created',
    begin_date: new Date(endMs - config.searchDays * DAY_MS).toISOString(),
    end_date: new Date(endMs).toISOString(),
  };
  let firstPage = null;
  await check('payments-search', `Buscar pagos de ${config.searchDays} días (GET /v1/payments/search)`, async () => {
    const all = [];
    let total = null;
    let pages = 0;
    for (let offset = 0; offset <= SEARCH_MAX_OFFSET - SEARCH_LIMIT; offset += SEARCH_LIMIT) {
      const body = await call('GET', '/v1/payments/search', { query: { ...searchQuery, limit: SEARCH_LIMIT, offset } });
      const results = body?.results ?? [];
      if (firstPage === null) firstPage = results;
      all.push(...results);
      total = body?.paging?.total ?? total;
      pages += 1;
      if (results.length < SEARCH_LIMIT || pages >= config.maxSearchPages) break;
    }
    return {
      pagingTotal: total,
      fetched: all.length,
      pages,
      truncated: total !== null && all.length < total,
      payments: analyzePayments(all, { userId: config.userId }),
    };
  });

  // 2. Prueba de borde: ¿qué pasa si se piden más de 50 por página?
  await check('payments-search-limit', 'Comprobar el máximo de 50 resultados por página', async () => {
    try {
      const body = await call('GET', '/v1/payments/search', { query: { ...searchQuery, limit: SEARCH_LIMIT + 1, offset: 0 } });
      const returned = body?.results?.length ?? 0;
      return {
        rejected: false,
        returned,
        pagingLimit: body?.paging?.limit ?? null,
        behavior: returned > SEARCH_LIMIT ? 'aceptó más de 50' : 'aceptó la solicitud y devolvió hasta 50',
      };
    } catch (error) {
      if (error.isRateLimit) throw error;
      return { rejected: true, error: describeError(error) };
    }
  });

  // 3 y 4. Reportes asincrónicos
  for (const kind of config.reports) {
    const { title, path } = REPORT_KINDS[kind];
    await check(`${kind}-report`, `${title} (${path})`, () => runReportFlow({ call, path, config, now, sleep, log }));
  }

  // 5. Estabilidad de lectura
  await check('read-stability', 'Repetir la primera página de pagos y comparar ids', async () => {
    if (!firstPage?.length) return { tested: false, reason: 'No hubo pagos para comparar.' };
    const body = await call('GET', '/v1/payments/search', { query: { ...searchQuery, limit: SEARCH_LIMIT, offset: 0 } });
    return { tested: true, ...compareIds(firstPage, body?.results ?? []) };
  });

  report.rateLimit = summarizeCalls(client.calls);
  report.observations = buildObservations(report);
  return report;
}

async function runReportFlow({ call, path, config, now, sleep, log }) {
  const findings = {};

  // Configuración existente (solo claves y valores no personales)
  try {
    const cfg = await call('GET', `${path}/config`);
    findings.config = {
      exists: true,
      keys: Object.keys(cfg ?? {}).sort(),
      safeValues: Object.fromEntries(Object.entries(cfg ?? {}).filter(([k, v]) => SAFE_CONFIG_KEYS.has(k) && typeof v !== 'object')),
      columnsCount: Array.isArray(cfg?.columns) ? cfg.columns.length : null,
    };
  } catch (error) {
    if (error.isRateLimit) throw error;
    findings.config = { exists: false, error: describeError(error) };
  }

  const listBefore = asList(await call('GET', `${path}/list`));
  findings.listBefore = { entries: listBefore.length, entryKeys: keysOf(listBefore) };
  const known = new Set(listBefore.map((e) => e.file_name).filter(Boolean));

  const endMs = now();
  const created = await call('POST', path, {
    body: {
      begin_date: new Date(endMs - config.reportDays * DAY_MS).toISOString(),
      end_date: new Date(endMs).toISOString(),
    },
  });
  findings.creation = { responseKeys: Object.keys(created ?? {}).sort() };

  // Espera a que aparezca un archivo nuevo en la lista.
  const deadline = now() + config.reportTimeoutMs;
  let entry = null;
  let polls = 0;
  while (!entry && now() < deadline) {
    await sleep(config.pollMs);
    polls += 1;
    log(`  … esperando el reporte (consulta ${polls})`);
    const list = asList(await call('GET', `${path}/list`));
    entry = list.find((e) => e.file_name && !known.has(e.file_name)) ?? null;
  }
  findings.generation = { polls, ready: Boolean(entry), waitedSeconds: Math.round((polls * config.pollMs) / 1000) };
  if (!entry) {
    throw new Error(`El reporte no apareció en la lista tras ${findings.generation.waitedSeconds} s (SPIKE_REPORT_TIMEOUT_MINUTES).`);
  }
  findings.generation.entryKeys = Object.keys(entry).sort();

  const file = await call('GET', `${path}/${entry.file_name}`, { raw: true });
  findings.file = { contentType: file.contentType.split(';')[0], bytes: file.bytes.length };
  if (looksLikeZip(file.bytes)) {
    findings.file.format = 'xlsx';
    findings.file.note = 'El archivo es XLSX: el spike no lo analiza. Si se puede, configurá el reporte en CSV y repetí.';
    return findings;
  }
  findings.file.format = 'csv';
  findings.csv = analyzeCsvReport(parseCsv(new TextDecoder('utf-8').decode(file.bytes)));
  return findings;
}

function asList(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.results)) return body.results;
  return [];
}

function keysOf(list) {
  return [...new Set(list.flatMap((e) => Object.keys(e ?? {})))].sort();
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function describeError(error) {
  if (error?.name === 'MercadoPagoApiError') {
    return { status: error.status, error: error.error, message: error.message };
  }
  return { message: String(error?.message ?? error) };
}

function summarizeCalls(calls) {
  const byEndpoint = {};
  const rateHeaderNames = new Set();
  for (const c of calls) {
    const e = (byEndpoint[c.endpoint] ??= { requests: 0, errors: 0, maxDurationMs: 0 });
    e.requests += 1;
    if (c.status >= 400) e.errors += 1;
    e.maxDurationMs = Math.max(e.maxDurationMs, c.durationMs);
    for (const name of Object.keys(c.rateHeaders)) rateHeaderNames.add(name);
  }
  return { totalRequests: calls.length, rateLimitHeadersSeen: [...rateHeaderNames].sort(), byEndpoint };
}

/** Conclusiones automáticas que alimentan INTEGRATIONS_ASSESSMENT.md. */
function buildObservations(report) {
  const out = [];
  const byId = Object.fromEntries(report.checks.map((c) => [c.id, c]));
  if (report.aborted) out.push(`Spike abortado: ${report.aborted}`);
  if (report.config.tokenKind === 'desconocido') out.push('El Access Token no tiene un prefijo conocido (APP_USR- o TEST-).');

  const search = byId['payments-search'];
  if (search?.status === 'OK') {
    const f = search.findings;
    const p = f.payments;
    out.push(`Búsqueda de pagos: ${f.fetched} de ${f.pagingTotal ?? '?'} pagos${f.truncated ? ' (truncado por SPIKE_MAX_SEARCH_PAGES)' : ''}; id ${p.id.unique ? 'único' : 'NO único'} en ${p.id.presentIn}/${p.id.of}.`);
    if (p.categories.operation_type) out.push(`Tipos de operación vistos: ${Object.keys(p.categories.operation_type).join(', ')}.`);
    if (p.roles) {
      out.push(`Pagos respecto de tu usuario: ${p.roles.received} recibidos, ${p.roles.sent} hechos por vos, ${p.roles.both} ambos, ${p.roles.neither} ninguno.`);
    } else if (p.count) {
      out.push(`Cobradores distintos: ${p.distinctCollectorIds}; pagadores distintos: ${p.distinctPayerIds}. ${interpretRoles(p)}`);
    }
    for (const [name, a] of Object.entries(p.amounts)) {
      if (a.jsonTypes.includes('number')) out.push(`Importe "${name}" llega como número JSON: el backend debe leerlo como decimal exacto (BigDecimal), no como double.`);
    }
  }

  const limit = byId['payments-search-limit']?.findings;
  if (limit) out.push(`Pedir 51 por página: ${limit.rejected ? `rechazado (${limit.error.message})` : limit.behavior}.`);

  for (const kind of ['settlement', 'release']) {
    const c = byId[`${kind}-report`];
    if (!c) continue;
    if (c.status === 'OK') {
      const f = c.findings;
      const csv = f.csv;
      out.push(`${c.title}: generado tras ~${f.generation.waitedSeconds} s; formato ${f.file.format}${csv ? `; ${csv.rows} filas, ${csv.columns.length} columnas` : ''}.`);
      if (csv) {
        const ids = Object.entries(csv.idColumns).filter(([, v]) => v.unique && v.presentIn === v.of).map(([k]) => k);
        out.push(`${c.title}: columnas id únicas y completas: ${ids.join(', ') || 'ninguna'}.`);
        const types = csv.categories.TRANSACTION_TYPE;
        if (types && !types.omitted) out.push(`${c.title}: TRANSACTION_TYPE vistos: ${Object.keys(types).join(', ')}.`);
      }
    } else if (c.status === 'FALLÓ') {
      out.push(`${c.title}: falló (${c.error.message}).`);
    }
  }

  const stability = byId['read-stability']?.findings;
  if (stability?.tested) out.push(`Lectura repetida de pagos: ${stability.identical ? 'idéntica' : `DISTINTA (${stability.onlyInFirst}/${stability.onlyInSecond})`}.`);
  return out;
}

function interpretRoles(p) {
  if (p.distinctCollectorIds === 1 && p.distinctPayerIds > 1) {
    return 'Parece que la búsqueda devuelve solo pagos que recibiste.';
  }
  if (p.distinctPayerIds === 1 && p.distinctCollectorIds > 1) {
    return 'Parece que la búsqueda devuelve solo pagos que hiciste.';
  }
  return 'Con estos datos no se puede inferir qué pagos devuelve; configurá MP_USER_ID para precisarlo.';
}
