const { join, dirname } = require('node:path');
const { program } = require(join(dirname(require.resolve('playwright/package.json')), 'lib', 'program.js'));
program.parseAsync(['node', 'playwright', 'install', 'chromium', '--no-remove']).then(() => process.exit(0), () => process.exit(1));
