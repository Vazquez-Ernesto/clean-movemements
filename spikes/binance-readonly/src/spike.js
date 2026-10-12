import {
  DAY_MS, analyzeRecords, compareReads, evaluatePermissions, splitWindows,
} from './analyze.js';

export const SPIKE_VERSION = '0.1.0';

// Pares de cotización con los que se buscan los símbolos operados.
const QUOTE_ASSETS = ['USDT', 'BTC', 'ETH', 'BNB', 'FDUSD', 'USDC', 'ARS'];
// Depósitos y retiros: la documentación exige un rango menor a 90 días.
const CAPITAL_WINDOW_MS = 89 * DAY_MS;
const CONVERT_WINDOW_MS = 30 * DAY_MS;
const PAGE_LIMIT = 1000;

/**
 * Ejecuta el spike de solo lectura y devuelve un reporte sin importes,
 * direcciones ni identificadores de transacciones.
 */
export async function runSpike(config, { client, now = Date.now, pause = defaultPause, log = () => {} }) {
  const report = {
    spike: 'binance-readonly',
    version: SPIKE_VERSION,
    generatedAt: new Date(now()).toISOString(),
    config: {
      baseUrl: config.baseUrl,
      lookbackDays: config.lookbackDays,
      maxSymbols: config.maxSymbols,
      maxTradePages: config.maxTradePages,
      symbolsConfigured: config.symbols.length > 0,
    },
    aborted: null,
    checks: [],
  };
  const state = { stopped: false, stopReason: null };
  const endMs = now();
  const startMs = endMs - config.lookbackDays * DAY_MS;

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
      report.checks.push({
        id, title, status: 'OK',
        durationMs: Math.round(performance.now() - started),
        requests: client.calls.length - callsBefore,
        findings,
      });
      return findings;
    } catch (error) {
      if (error.isRateLimit) {
        state.stopped = true;
        state.stopReason = `Límite de API alcanzado (HTTP ${error.status}); se detuvo el spike para no insistir.`;
      }
      report.checks.push({
        id, title, status: 'FALLÓ',
        durationMs: Math.round(performance.now() - started),
        requests: client.calls.length - callsBefore,
        error: describeError(error),
      });
      return null;
    }
  }

  async function call(method, path, params) {
    const body = await client.request(method, path, params);
    await pause();
    return body;
  }

  async function paginateByOffset(path, extraParams) {
    const all = [];
    for (let offset = 0; ; offset += PAGE_LIMIT) {
      const page = await call('GET', path, { ...extraParams, offset, limit: PAGE_LIMIT });
      all.push(...page);
      if (page.length < PAGE_LIMIT) return all;
    }
  }

  // 1. Reloj
  await check('clock', 'Sincronizar reloj con el servidor', async () => {
    const offsetMs = await client.syncClock();
    return { offsetMs };
  });

  // 2. Permisos de la key: si no es de solo lectura, se aborta todo.
  const permissions = await check('permissions', 'Verificar que la key sea de solo lectura', async () =>
    evaluatePermissions(await call('GET', '/sapi/v1/account/apiRestrictions')));
  if (!permissions || !permissions.readOnly) {
    state.stopped = true;
    state.stopReason = permissions
      ? `La key no es de solo lectura (permisos de escritura: ${permissions.writePermissions.join(', ') || 'ninguno'}; lectura: ${permissions.enableReading}).`
      : 'No se pudieron verificar los permisos de la key.';
    report.aborted = state.stopReason;
  }

  // 3. Saldos spot
  const heldAssets = new Set();
  await check('spot-balances', 'Leer saldos spot (GET /api/v3/account)', async () => {
    const account = await call('GET', '/api/v3/account', { omitZeroBalances: true });
    const balances = account.balances ?? [];
    for (const b of balances) heldAssets.add(b.asset);
    return {
      accountFields: Object.keys(account).sort(),
      accountType: account.accountType ?? null,
      balances: analyzeRecords(balances, { categoricalFields: ['asset'] }),
    };
  });

  // 4. Activos del usuario (endpoint no verificado en la documentación leída)
  await check('user-assets', 'Leer activos del usuario (POST /sapi/v3/asset/getUserAsset)', async () => {
    const assets = await call('POST', '/sapi/v3/asset/getUserAsset', { needBtcValuation: false });
    for (const a of assets) heldAssets.add(a.asset);
    return analyzeRecords(assets, { categoricalFields: ['asset'] });
  });

  // 5. Depósitos
  const capitalWindows = splitWindows(startMs, endMs, CAPITAL_WINDOW_MS);
  let firstDepositRead = null;
  await check('deposits', `Leer depósitos de ${config.lookbackDays} días en ${capitalWindows.length} ventana(s)`, async () => {
    const all = [];
    for (const [s, e] of capitalWindows) {
      const page = await paginateByOffset('/sapi/v1/capital/deposit/hisrec', { startTime: s, endTime: e });
      if (firstDepositRead === null) firstDepositRead = page;
      all.push(...page);
    }
    for (const d of all) heldAssets.add(d.coin);
    return analyzeRecords(all, { dateField: 'insertTime', categoricalFields: ['coin', 'network', 'status'] });
  });

  // 6. Retiros
  await check('withdrawals', `Leer retiros de ${config.lookbackDays} días en ${capitalWindows.length} ventana(s)`, async () => {
    const all = [];
    for (const [s, e] of capitalWindows) {
      all.push(...await paginateByOffset('/sapi/v1/capital/withdraw/history', { startTime: s, endTime: e }));
    }
    for (const w of all) heldAssets.add(w.coin);
    return analyzeRecords(all, {
      dateField: 'applyTime', categoricalFields: ['coin', 'network', 'status', 'transferType'],
    });
  });

  // 7. Descubrir los símbolos operados (myTrades exige indicar el símbolo)
  const discovery = await check('symbol-discovery', 'Descubrir pares a consultar en myTrades', async () => {
    if (config.symbols.length) {
      return { source: 'configurados', symbols: config.symbols, candidates: config.symbols.length, truncated: false };
    }
    const info = await call('GET', '/api/v3/exchangeInfo');
    const valid = new Set((info.symbols ?? []).map((s) => s.symbol));
    const candidates = [];
    for (const asset of [...heldAssets].sort()) {
      for (const quote of QUOTE_ASSETS) {
        if (asset === quote) continue;
        for (const symbol of [asset + quote, quote + asset]) {
          if (valid.has(symbol) && !candidates.includes(symbol)) candidates.push(symbol);
        }
      }
    }
    return {
      source: 'heurística (activos con saldo, depósitos o retiros × monedas de cotización)',
      symbols: candidates.slice(0, config.maxSymbols),
      candidates: candidates.length,
      truncated: candidates.length > config.maxSymbols,
      assetsConsidered: heldAssets.size,
    };
  });

  // 8. Operaciones (trades) por símbolo, paginando por fromId desde el principio
  let firstTradesRead = null;
  await check('trades', 'Leer historial de operaciones por par (GET /api/v3/myTrades)', async () => {
    const perSymbol = {};
    const all = [];
    for (const symbol of discovery?.symbols ?? []) {
      const trades = [];
      let fromId = 0;
      let pages = 0;
      let truncated = false;
      for (;;) {
        const page = await call('GET', '/api/v3/myTrades', { symbol, fromId, limit: PAGE_LIMIT });
        if (firstTradesRead === null && page.length) firstTradesRead = { symbol, page };
        trades.push(...page);
        pages += 1;
        if (page.length < PAGE_LIMIT) break;
        if (pages >= config.maxTradePages) { truncated = true; break; }
        fromId = page[page.length - 1].id + 1;
      }
      if (trades.length) {
        const summary = analyzeRecords(trades, { dateField: 'time' });
        perSymbol[symbol] = { count: trades.length, pages, truncated, dateRange: summary.dateRange };
      }
      all.push(...trades);
    }
    return {
      symbolsQueried: discovery?.symbols?.length ?? 0,
      symbolsWithTrades: Object.keys(perSymbol).length,
      perSymbol,
      overall: analyzeRecords(all, { dateField: 'time', categoricalFields: ['commissionAsset'] }),
    };
  });

  // 9. Prueba negativa: ¿rechaza un rango mayor a 24 h, como dice la documentación?
  await check('trades-window-limit', 'Confirmar el límite de 24 h entre startTime y endTime en myTrades', async () => {
    const symbol = firstTradesRead?.symbol ?? discovery?.symbols?.[0];
    if (!symbol) return { tested: false, reason: 'No hay pares para probar.' };
    try {
      await call('GET', '/api/v3/myTrades', { symbol, startTime: endMs - 2 * DAY_MS, endTime: endMs, limit: 1 });
      return { tested: true, symbol, rejected: false, note: 'Binance aceptó 48 h: la documentación podría estar desactualizada.' };
    } catch (error) {
      if (error.isRateLimit) throw error;
      return { tested: true, symbol, rejected: true, error: describeError(error) };
    }
  });

  // 10. Conversiones (Convert)
  await check('convert', 'Leer historial de Convert (GET /sapi/v1/convert/tradeFlow)', async () => {
    const all = [];
    for (const [s, e] of splitWindows(startMs, endMs, CONVERT_WINDOW_MS)) {
      const body = await call('GET', '/sapi/v1/convert/tradeFlow', { startTime: s, endTime: e, limit: PAGE_LIMIT });
      all.push(...(body?.list ?? []));
    }
    return analyzeRecords(all, { dateField: 'createTime', categoricalFields: ['fromAsset', 'toAsset', 'orderStatus'] });
  });

  // 11. Idempotencia de lectura: repetir la misma consulta devuelve lo mismo
  await check('read-stability', 'Repetir lecturas y comparar identificadores', async () => {
    const result = {};
    if (firstDepositRead !== null) {
      const [s, e] = capitalWindows[0];
      const again = await paginateByOffset('/sapi/v1/capital/deposit/hisrec', { startTime: s, endTime: e });
      result.deposits = compareReads(firstDepositRead, again, 'id');
    }
    if (firstTradesRead) {
      const again = await call('GET', '/api/v3/myTrades', { symbol: firstTradesRead.symbol, fromId: 0, limit: PAGE_LIMIT });
      result.trades = compareReads(firstTradesRead.page, again, 'id');
    }
    return result;
  });

  report.rateLimit = summarizeCalls(client.calls);
  report.observations = buildObservations(report);
  return report;
}

function defaultPause() {
  return new Promise((resolve) => setTimeout(resolve, 150));
}

export function describeError(error) {
  if (error?.name === 'BinanceApiError') {
    return { status: error.status, code: error.code ?? null, message: error.message };
  }
  return { message: String(error?.message ?? error) };
}

function summarizeCalls(calls) {
  const maxWeights = {};
  const byEndpoint = {};
  for (const c of calls) {
    for (const [name, value] of Object.entries(c.weights)) {
      maxWeights[name] = Math.max(maxWeights[name] ?? 0, value);
    }
    const e = (byEndpoint[c.endpoint] ??= { requests: 0, errors: 0, maxDurationMs: 0 });
    e.requests += 1;
    if (c.status >= 400) e.errors += 1;
    e.maxDurationMs = Math.max(e.maxDurationMs, c.durationMs);
  }
  return { totalRequests: calls.length, maxWeightHeaders: maxWeights, byEndpoint };
}

/** Conclusiones automáticas que alimentan INTEGRATIONS_ASSESSMENT.md. */
function buildObservations(report) {
  const out = [];
  const byId = Object.fromEntries(report.checks.map((c) => [c.id, c]));
  if (report.aborted) out.push(`Spike abortado: ${report.aborted}`);

  const perm = byId.permissions?.findings;
  if (perm) {
    out.push(perm.readOnly
      ? 'La key es de solo lectura según /sapi/v1/account/apiRestrictions.'
      : `La key NO es de solo lectura: ${perm.writePermissions.join(', ')}.`);
    out.push(`Indicadores informados por Binance: ${perm.flagsReported.join(', ')}.`);
  }

  for (const id of ['deposits', 'withdrawals', 'trades', 'convert']) {
    const c = byId[id];
    if (c?.status !== 'OK') continue;
    const f = id === 'trades' ? c.findings.overall : c.findings;
    const ids = Object.entries(f.idCandidates)
      .filter(([, v]) => v.unique && v.presentIn === v.of && v.of > 0)
      .map(([name]) => name);
    out.push(`${id}: ${f.count} registros; identificadores únicos y siempre presentes: ${ids.join(', ') || 'ninguno (o sin datos)'}.`);
    if (f.numericAmountFields.length) {
      out.push(`${id}: ATENCIÓN, importes como número JSON (riesgo de precisión): ${f.numericAmountFields.join(', ')}.`);
    }
  }

  const trades = byId.trades?.findings;
  if (trades) {
    const truncated = Object.entries(trades.perSymbol).filter(([, v]) => v.truncated).map(([s]) => s);
    if (truncated.length) out.push(`Historial de trades truncado por el límite de páginas en: ${truncated.join(', ')}.`);
  }
  if (byId['symbol-discovery']?.findings?.truncated) {
    out.push('Hay más pares candidatos que el máximo configurado (SPIKE_MAX_SYMBOLS).');
  }

  const win = byId['trades-window-limit']?.findings;
  if (win?.tested) {
    out.push(win.rejected
      ? 'myTrades rechazó un rango de 48 h, como indica la documentación.'
      : 'myTrades aceptó un rango de 48 h: revisar la documentación.');
  }

  const stability = byId['read-stability']?.findings;
  for (const [name, r] of Object.entries(stability ?? {})) {
    out.push(`Lectura repetida de ${name}: ${r.identical ? 'idéntica' : `DISTINTA (${r.onlyInFirst} solo en la primera, ${r.onlyInSecond} solo en la segunda)`}.`);
  }

  for (const c of report.checks.filter((x) => x.status === 'FALLÓ')) {
    out.push(`Falló "${c.title}": ${c.error.message}`);
  }
  return out;
}
