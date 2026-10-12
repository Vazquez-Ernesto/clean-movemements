import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  analyzeCsvReport, analyzePayments, compareIds, datePattern, fieldPaths, looksLikeZip, parseCsv,
} from '../src/analyze.js';
import { createClient, isAllowed } from '../src/client.js';
import { readConfig } from '../src/main.js';
import { tokenKind } from '../src/spike.js';

describe('lista cerrada de operaciones', () => {
  it('permite solo las lecturas y la creación de reportes', () => {
    assert.ok(isAllowed('GET', '/v1/payments/search'));
    assert.ok(isAllowed('GET', '/v1/account/settlement_report/list'));
    assert.ok(isAllowed('POST', '/v1/account/release_report'));
    assert.ok(isAllowed('GET', '/v1/account/settlement_report/archivo-1.csv'));
  });

  it('rechaza pagos, devoluciones, cambios de configuración y rutas extrañas', () => {
    assert.ok(!isAllowed('POST', '/v1/payments'));
    assert.ok(!isAllowed('POST', '/v1/payments/123/refunds'));
    assert.ok(!isAllowed('PUT', '/v1/payments/123'));
    assert.ok(!isAllowed('POST', '/v1/account/settlement_report/config'));
    assert.ok(!isAllowed('PUT', '/v1/account/settlement_report/config'));
    assert.ok(!isAllowed('GET', '/v1/account/settlement_report/../../payments'));
    assert.ok(!isAllowed('GET', '/v1/account/settlement_report/a/b'));
    assert.ok(!isAllowed('DELETE', '/v1/account/settlement_report/archivo.csv'));
  });

  it('no sale a la red con una operación no permitida', async () => {
    let called = false;
    const client = createClient({ baseUrl: 'http://x', accessToken: 't', fetchImpl: async () => { called = true; } });
    await assert.rejects(client.request('POST', '/v1/payments', { body: {} }), /no permitida/);
    assert.equal(called, false);
  });

  it('manda el token en el encabezado y no registra nombres de archivo', async () => {
    const seen = [];
    const client = createClient({
      baseUrl: 'http://x', accessToken: 'APP_USR-secreto',
      fetchImpl: async (url, init) => { seen.push({ url, init }); return new Response('ok', { status: 200 }); },
    });
    await client.request('GET', '/v1/account/settlement_report/reporte-123456.csv', { raw: true });
    assert.equal(seen[0].init.headers.Authorization, 'Bearer APP_USR-secreto');
    assert.ok(!seen[0].url.includes('APP_USR-secreto'));
    assert.equal(client.calls[0].endpoint, 'GET /v1/account/settlement_report/{file_name}');
  });
});

describe('tokenKind', () => {
  it('distingue producción, prueba y desconocido', () => {
    assert.equal(tokenKind('APP_USR-1'), 'produccion');
    assert.equal(tokenKind('TEST-1'), 'prueba');
    assert.equal(tokenKind('otro'), 'desconocido');
  });
});

describe('analyzePayments', () => {
  const payments = [
    { id: 1, date_created: '2026-10-01T10:00:00.000-04:00', status: 'approved', operation_type: 'money_transfer', transaction_amount: 10.25, collector_id: 9, payer: { id: '7', email: 'x@y.z' } },
    { id: 2, date_created: '2026-10-03T10:00:00.000-04:00', status: 'approved', operation_type: 'regular_payment', transaction_amount: '5.5', collector_id: 8, payer: { id: '9' } },
  ];

  it('cuenta categorías, tipos de importe y roles sin copiar valores personales', () => {
    const r = analyzePayments(payments, { userId: '9' });
    assert.deepEqual(r.categories.operation_type, { money_transfer: 1, regular_payment: 1 });
    assert.deepEqual(r.amounts.transaction_amount, { jsonTypes: ['number', 'string'], maxDecimals: 2 });
    assert.deepEqual(r.roles, { received: 1, sent: 1, both: 0, neither: 0 });
    assert.equal(r.distinctCollectorIds, 2);
    assert.deepEqual(r.dateRange, { field: 'date_created', oldest: '2026-10-01', newest: '2026-10-03' });
    assert.ok(r.fields.includes('payer.email'));
    assert.ok(!JSON.stringify(r).includes('x@y.z'));
  });

  it('sin MP_USER_ID no calcula roles', () => {
    assert.equal(analyzePayments(payments).roles, null);
  });

  it('lista campos anidados un solo nivel', () => {
    assert.deepEqual(fieldPaths({ a: 1, b: { c: { d: 1 } } }), ['a', 'b', 'b.c']);
  });
});

describe('parseCsv', () => {
  it('detecta el separador, quita el BOM y respeta comillas', () => {
    const { separator, header, rows } = parseCsv('﻿A;B;C\r\n1;"x;y";"di""ce"\r\n\r\n2;;3\r\n');
    assert.equal(separator, ';');
    assert.deepEqual(header, ['A', 'B', 'C']);
    assert.deepEqual(rows, [['1', 'x;y', 'di"ce'], ['2', '', '3']]);
  });

  it('acepta coma como separador y archivo sin salto final', () => {
    assert.deepEqual(parseCsv('A,B\n1,2').rows, [['1', '2']]);
  });
});

describe('analyzeCsvReport', () => {
  const csv = parseCsv([
    'SOURCE_ID;TRANSACTION_TYPE;TRANSACTION_AMOUNT;TRANSACTION_DATE;PAYER_NAME;OPERATION_TAGS;EMPTY_FEE',
    '1;SETTLEMENT;10,50;2026-10-01T10:00:00.000-04:00;Ana;{"store":"12345"};',
    '2;REFUND;-3;2026-10-02T10:00:00.000-04:00;Bruno;{"store":"67890"};',
  ].join('\n'));

  it('describe columnas sin copiar valores personales', () => {
    const r = analyzeCsvReport(csv);
    assert.equal(r.rows, 2);
    assert.deepEqual(r.idColumns.SOURCE_ID, { presentIn: 2, of: 2, unique: true });
    assert.deepEqual(r.amountColumns.TRANSACTION_AMOUNT, { decimalSeparators: [','], maxDecimals: 2, nonNumeric: 0 });
    assert.deepEqual(r.categories.TRANSACTION_TYPE, { REFUND: 1, SETTLEMENT: 1 });
    assert.match(r.categories.OPERATION_TAGS.omitted, /omitidos/);
    assert.deepEqual(r.dateColumns.TRANSACTION_DATE.formats, ['dddd-dd-ddTdd:dd:dd.ddd-dd:dd']);
    assert.deepEqual(r.emptyColumns, ['EMPTY_FEE']);
    const text = JSON.stringify(r);
    for (const value of ['Ana', 'Bruno', '12345', '10,50']) assert.ok(!text.includes(value), value);
  });

  it('cuenta las filas con una cantidad de columnas distinta del encabezado', () => {
    assert.equal(analyzeCsvReport(parseCsv('A;B\n1;2\n3')).malformedRows, 1);
  });
});

describe('utilidades', () => {
  it('datePattern no conserva dígitos', () => {
    assert.equal(datePattern('2026-10-01 10:00'), 'dddd-dd-dd dd:dd');
  });

  it('looksLikeZip reconoce la firma de un XLSX', () => {
    assert.equal(looksLikeZip(new Uint8Array([0x50, 0x4b, 3, 4])), true);
    assert.equal(looksLikeZip(new TextEncoder().encode('A;B')), false);
  });

  it('compareIds detecta diferencias', () => {
    assert.equal(compareIds([{ id: 1 }], [{ id: 1 }]).identical, true);
    assert.equal(compareIds([{ id: 1 }], [{ id: 2 }]).identical, false);
  });
});

describe('readConfig', () => {
  it('exige el token y valida rangos', () => {
    const { errors } = readConfig({ SPIKE_REPORT_DAYS: '61', SPIKE_REPORTS: 'otro', MP_USER_ID: 'abc' });
    assert.equal(errors.length, 4);
  });

  it('aplica valores por defecto', () => {
    const { errors, config } = readConfig({ MP_ACCESS_TOKEN: 'APP_USR-x' });
    assert.deepEqual(errors, []);
    assert.equal(config.baseUrl, 'https://api.mercadopago.com');
    assert.equal(config.searchDays, 60);
    assert.equal(config.reportDays, 30);
    assert.deepEqual(config.reports, ['settlement', 'release']);
  });

  it('permite desactivar los reportes', () => {
    const { errors, config } = readConfig({ MP_ACCESS_TOKEN: 'APP_USR-x', SPIKE_REPORTS: '' });
    assert.deepEqual(errors, []);
    assert.deepEqual(config.reports, []);
  });
});
