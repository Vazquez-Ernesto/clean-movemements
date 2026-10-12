import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from './client.js';
import { renderMarkdown } from './report.js';
import { runSpike } from './spike.js';

const REPORT_KINDS = ['settlement', 'release'];

function intInRange(env, name, fallback, min, max, errors) {
  const value = Number(env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    errors.push(`${name} debe ser un entero entre ${min} y ${max}.`);
  }
  return value;
}

export function readConfig(env) {
  const errors = [];
  const accessToken = env.MP_ACCESS_TOKEN?.trim();
  if (!accessToken) errors.push('Falta MP_ACCESS_TOKEN.');

  // Pagos: la API devuelve hasta 12 meses. Reportes: período máximo de 60 días.
  const searchDays = intInRange(env, 'SPIKE_SEARCH_DAYS', 60, 1, 365, errors);
  const reportDays = intInRange(env, 'SPIKE_REPORT_DAYS', 30, 1, 60, errors);
  const maxSearchPages = intInRange(env, 'SPIKE_MAX_SEARCH_PAGES', 20, 1, 200, errors);
  const pollSeconds = intInRange(env, 'SPIKE_POLL_SECONDS', 15, 5, 300, errors);
  const timeoutMinutes = intInRange(env, 'SPIKE_REPORT_TIMEOUT_MINUTES', 10, 1, 60, errors);

  const reports = (env.SPIKE_REPORTS ?? REPORT_KINDS.join(','))
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const unknown = reports.filter((r) => !REPORT_KINDS.includes(r));
  if (unknown.length) errors.push(`SPIKE_REPORTS solo admite: ${REPORT_KINDS.join(', ')} (o vacío).`);

  const userId = env.MP_USER_ID?.trim() || null;
  if (userId && !/^\d+$/.test(userId)) errors.push('MP_USER_ID debe ser numérico.');

  return {
    errors,
    config: {
      accessToken,
      baseUrl: (env.MP_BASE_URL ?? 'https://api.mercadopago.com').replace(/\/$/, ''),
      userId,
      searchDays,
      reportDays,
      maxSearchPages,
      reports: [...new Set(reports)],
      pollMs: pollSeconds * 1000,
      reportTimeoutMs: timeoutMinutes * 60 * 1000,
      outDir: resolve(env.SPIKE_OUT_DIR ?? 'out'),
    },
  };
}

async function main() {
  const { errors, config } = readConfig(process.env);
  if (errors.length) {
    console.error(errors.join('\n'));
    console.error('Copiá .env.example a .env y completalo (ver README.md).');
    process.exit(64);
  }

  const client = createClient(config);
  const report = await runSpike(config, { client, log: (m) => console.log(m) });

  await mkdir(config.outDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  const jsonPath = join(config.outDir, `mercadopago-spike-${stamp}.json`);
  const mdPath = join(config.outDir, `mercadopago-spike-${stamp}.md`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(mdPath, renderMarkdown(report));

  console.log('\nObservaciones:');
  for (const o of report.observations) console.log(`- ${o}`);
  console.log(`\nReporte: ${mdPath}`);
  process.exit(report.aborted ? 2 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Error inesperado: ${error.message}`);
    process.exit(1);
  });
}
