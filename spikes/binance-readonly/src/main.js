import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from './client.js';
import { renderMarkdown } from './report.js';
import { runSpike } from './spike.js';

export function readConfig(env) {
  const errors = [];
  const apiKey = env.BINANCE_API_KEY?.trim();
  const apiSecret = env.BINANCE_API_SECRET?.trim();
  if (!apiKey) errors.push('Falta BINANCE_API_KEY.');
  if (!apiSecret) errors.push('Falta BINANCE_API_SECRET.');

  const lookbackDays = Number(env.SPIKE_LOOKBACK_DAYS ?? 90);
  if (!Number.isInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 365) {
    errors.push('SPIKE_LOOKBACK_DAYS debe ser un entero entre 1 y 365.');
  }
  const maxSymbols = Number(env.SPIKE_MAX_SYMBOLS ?? 30);
  const maxTradePages = Number(env.SPIKE_MAX_TRADE_PAGES ?? 20);
  if (!Number.isInteger(maxSymbols) || maxSymbols < 1) errors.push('SPIKE_MAX_SYMBOLS debe ser un entero positivo.');
  if (!Number.isInteger(maxTradePages) || maxTradePages < 1) errors.push('SPIKE_MAX_TRADE_PAGES debe ser un entero positivo.');

  return {
    errors,
    config: {
      apiKey,
      apiSecret,
      baseUrl: (env.BINANCE_BASE_URL ?? 'https://api.binance.com').replace(/\/$/, ''),
      lookbackDays,
      maxSymbols,
      maxTradePages,
      symbols: (env.SPIKE_SYMBOLS ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
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
  const jsonPath = join(config.outDir, `binance-spike-${stamp}.json`);
  const mdPath = join(config.outDir, `binance-spike-${stamp}.md`);
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
