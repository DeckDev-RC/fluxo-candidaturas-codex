import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

test('design system defines a friendly local workspace visual language', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(css, /--color-primary:/);
  assert.match(css, /--color-surface:/);
  assert.match(css, /--radius-xl:/);
  assert.match(css, /--shadow-soft:/);
  assert.match(css, /\.topbar\s*\{[^}]*position:\s*sticky/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*?\.topbar\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(css, /\.next-action\s*\{[^}]*border-radius:/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /\.primary-button/);
});
