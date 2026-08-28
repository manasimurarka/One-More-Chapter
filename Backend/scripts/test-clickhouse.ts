import { clickhouseHealthcheck, closeClickhouse } from '../src/clickhouse';
clickhouseHealthcheck().then((healthy) => { if (!healthy) throw new Error('ClickHouse healthcheck returned an unexpected response'); console.log('ClickHouse connection is healthy.'); }).catch((error) => { console.error(error); process.exitCode = 1; }).finally(closeClickhouse);
