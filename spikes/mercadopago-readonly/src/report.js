const STATUS_ICON = { OK: '✅', 'FALLÓ': '❌', OMITIDO: '⏭️' };

export function renderMarkdown(report) {
  const lines = [];
  lines.push('# Reporte del spike Mercado Pago (solo lectura)', '');
  lines.push(`- Generado: ${report.generatedAt}`);
  lines.push(`- Versión del spike: ${report.version}`);
  lines.push(`- Tipo de token: ${report.config.tokenKind}`);
  lines.push(`- Días de búsqueda de pagos: ${report.config.searchDays} · días por reporte: ${report.config.reportDays}`);
  lines.push(`- Solicitudes totales: ${report.rateLimit?.totalRequests ?? 0}`);
  if (report.aborted) lines.push('', `> **Abortado:** ${report.aborted}`);
  lines.push('', '> Este reporte no contiene importes, nombres, correos, documentos, descripciones, referencias ni identificadores de pagos o de archivos.', '');

  lines.push('## Observaciones', '');
  for (const o of report.observations ?? []) lines.push(`- ${o}`);
  lines.push('');

  lines.push('## Verificaciones', '', '| Estado | Verificación | Solicitudes | Duración (ms) |', '|---|---|---|---|');
  for (const c of report.checks) {
    lines.push(`| ${STATUS_ICON[c.status] ?? ''} ${c.status} | ${c.title} | ${c.requests ?? '—'} | ${c.durationMs ?? '—'} |`);
  }
  lines.push('');

  lines.push('## Encabezados de límites de API vistos', '');
  const headers = report.rateLimit?.rateLimitHeadersSeen ?? [];
  lines.push(headers.length ? headers.map((h) => `- \`${h}\``).join('\n') : 'Ninguno.');
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
