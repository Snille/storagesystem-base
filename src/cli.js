import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Store, restore } from './store.js';

const [command, ...args] = process.argv.slice(2);
let store;
try {
  if (command === 'restore') {
    if (args.length !== 2) throw new Error('Usage: npm run inventory -- restore BACKUP.sqlite NEW-DATABASE.sqlite');
    console.log(JSON.stringify(await restore(...args), null, 2));
  } else {
    const path = process.env.STORAGE_DB || './data/storage.sqlite';
    if (!['audit', 'import', 'export', 'backup'].includes(command)) throw new Error('Usage: npm run inventory -- audit | import INVENTORY.json [SETTINGS.json] | export OUTPUT.json | backup OUTPUT.sqlite | restore BACKUP.sqlite NEW-DATABASE.sqlite');
    if (command !== 'import' && !existsSync(path)) throw new Error('Database does not exist. Set STORAGE_DB to an existing database.');
    store = new Store(path, { readOnly: command !== 'import' });
    if (command === 'audit') {
      const audit = store.audit(); console.log(JSON.stringify(audit, null, 2)); process.exitCode = audit.ok ? 0 : 1;
    } else if (command === 'import') {
      if (!args[0]) throw new Error('An inventory JSON file is required.');
      const input = JSON.parse(readFileSync(args[0], 'utf8').replace(/^\uFEFF/, ''));
      const settings = args[1] ? JSON.parse(readFileSync(args[1], 'utf8').replace(/^\uFEFF/, '')) : {};
      console.log(JSON.stringify({ imported: store.importLegacy(input, settings), audit: store.audit() }, null, 2));
    } else if (command === 'export') {
      if (!args[0]) throw new Error('An output path is required.');
      writeFileSync(args[0], JSON.stringify(store.read(), null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      console.log('Inventory exported. Settings and credentials are excluded.');
    } else {
      if (!args[0]) throw new Error('A backup destination is required.');
      await store.backup(args[0]); console.log('SQLite backup created. It includes settings; protect it as sensitive data.');
    }
  }
} catch (error) {
  console.error(error.name === 'InputError' ? error.message : 'Operation failed. Check arguments, input schema, file paths and permissions.');
  process.exitCode = 1;
} finally { store?.close(); }
