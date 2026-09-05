import { resolve } from 'node:path';
import { createPersistenceAuthority } from '../src/persistence-authority.mjs';

const args = process.argv.slice(2);
const rootIndex = args.indexOf('--root');
if (rootIndex < 0 || !args[rootIndex + 1]) {
  console.error('Uso: node scripts/migrate-persistence.mjs --root <diretório-Fluxo> [--export]');
  process.exitCode = 2;
} else {
  const authority = createPersistenceAuthority({ rootDir: resolve(args[rootIndex + 1]) });
  try {
    const result = args.includes('--rollback') ? await authority.rollbackToJson() : await authority.migrateLegacy();
    if (args.includes('--export')) await authority.exportCompatibility();
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify({ code: error.code ?? 'persistence_migration_failed', message: error.message }));
    process.exitCode = 1;
  } finally { authority.close(); }
}
