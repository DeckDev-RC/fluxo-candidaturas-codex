import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { embeddedBrowserEnabled } = require('../startup-config.cjs');

test('navegador embutido independe do provedor e só obedece ao opt-out explícito', () => {
  assert.equal(embeddedBrowserEnabled({ env: {} }), true);
  assert.equal(embeddedBrowserEnabled({ env: { FLUXO_DESKTOP_SEM_NAVEGADOR_EMBUTIDO: '1' } }), false);
});
