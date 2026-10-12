const STATUS_ICON = { OK: '✅', 'FALLÓ': '❌', OMITIDO: '⏭️' };

export function renderMarkdown(report) {
  const lines = [];
  lines.push('# Reporte del spike Binance (solo lectura)', '');
  lines.push(`- Generado: ${report.generatedAt}`);
  lines.push(`- Versión del spike: ${report.version}`);
  lines.push(`- Base URL: ${report.config.baseUrl}`);
  lines.push(`- Días consultados: ${report.config.lookbackDays}`);
  lines.push(`- Solicitudes totales: ${report.rateLimit?.totalRequests ?? 0}`);
  if (report.aborted) lines.push('', `> **Abortado:** ${report.aborted}`);
  lines.push('', '> Este reporte no contiene importes, saldos, direcciones, txIds ni identificadores de operaciones.', '');

  lines.push('## Observaciones', '');
  for (const o of report.observations ?? []) lines.push(`- ${o}`);
  lines.push('');

  lines.push('## Verificaciones', '', '| Estado | Verificación | Solicitudes | Duración (ms) |', '|---|---|---|---|');
  for (const c of report.checks) {
    lines.push(`| ${STATUS_ICON[c.status] ?? ''} ${c.status} | ${c.title} | ${c.requests ?? '—'} | ${c.durationMs ?? '—'} |`);
  }
  lines.push('');

  lines.push('## Uso de límites de la API', '');
  const weights = Object.entries(report.rateLimit?.maxWeightHeaders ?? {});
  if (weights.length) {
    lines.push('| Encabezado | Máximo observado |', '|---|---|');
    for (const [name, value] of weights) lines.push(`| \`${name}\` | ${value} |`);
  } else {
    lines.push('No se recibieron encabezados de peso.');
  }
  lines.push('');

  lines.push('## Detalle', '');
  for (const c of report.checks) {
    lines.push(`### ${c.title}`, '');
    if (c.status === 'OMITIDO') lines.push(`Omitido: ${c.reason}`);
    else if (c.status === 'FALLÓ') lines.push('```json', JSON.stringify(c.error, null, 2), '```');
    else lines.push('```json', JSON.stringify(c.findings, null, 2), '```');
    lines.push('');
  }
  return lines.join('\n');
}
