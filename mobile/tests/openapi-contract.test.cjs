const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

test('API 목록은 OpenAPI 0.3.0의 경로·메서드·operationId와 일치한다', () => {
  const spec = readFileSync(resolve(__dirname, '../../docs/openapi.yaml'), 'utf8');
  const catalog = readFileSync(resolve(__dirname, '../src/integration/catalog.ts'), 'utf8');
  const operations = [];
  let path;
  let method;

  for (const line of spec.split(/\r?\n/)) {
    const pathMatch = line.match(/^  (\/[^:]+):$/);
    if (pathMatch) {
      path = pathMatch[1];
      method = undefined;
      continue;
    }
    const methodMatch = line.match(/^    (get|post|put|patch|delete):$/);
    if (methodMatch) {
      method = methodMatch[1].toUpperCase();
      continue;
    }
    const idMatch = line.match(/^      operationId: (API-\d+)$/);
    if (idMatch && path && method) operations.push([idMatch[1], method, path]);
  }

  const entries = [
    ...catalog.matchAll(/^  '(API-\d+)': \['(GET|POST|PUT|PATCH|DELETE)', '([^']+)'/gm),
  ].map(([, id, entryMethod, entryPath]) => [id, entryMethod, entryPath]);

  assert.equal(operations.length, 47);
  assert.equal(new Set(operations.map(([id]) => id)).size, operations.length);
  assert.equal(new Set(entries.map(([id]) => id)).size, entries.length);
  assert.deepEqual(
    entries.sort(([left], [right]) => left.localeCompare(right)),
    operations.sort(([left], [right]) => left.localeCompare(right)),
  );
});
