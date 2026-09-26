import assert from 'node:assert/strict';
import test from 'node:test';

import { assertCurrentReferences, referencedVersions } from '../scripts/check-readme-version.mjs';

const current = '[`dsh-auditor-mcp-connector@0.0.1`](https://www.npmjs.com/package/dsh-auditor-mcp-connector) and [Release v0.0.1](https://github.com/duhu2000/dsh-auditor-mcp-connector/releases/tag/v0.0.1)';

test('README version guard accepts matching npm and release references', () => {
  assert.doesNotThrow(() => assertCurrentReferences('README.md', current, '0.0.1'));
});

test('README version guard rejects stale references', () => {
  assert.throws(
    () => assertCurrentReferences('README.md', current, '0.0.2'),
    /references 0\.0\.1, expected 0\.0\.2/,
  );
});

test('README version guard requires both reference types', () => {
  assert.throws(
    () => assertCurrentReferences('README.md', 'dsh-auditor-mcp-connector@0.0.1', '0.0.1'),
    /missing GitHub Release/,
  );
});

test('referencedVersions returns every captured semantic version', () => {
  assert.deepEqual(
    referencedVersions('v0.0.1 and v0.0.2', /v(\d+\.\d+\.\d+)/g),
    ['0.0.1', '0.0.2'],
  );
});
