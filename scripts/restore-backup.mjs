import fs from 'node:fs';
import path from 'node:path';
import {restoreBackup, maximumBackupBytes} from '../lib/backup.mjs';
const [source, destination, extra] = process.argv.slice(2);
try {
  if (!source || !destination || extra) throw Error('Usage: node scripts/restore-backup.mjs <backup.json> <new-data-directory>');
  if (fs.statSync(source).size > maximumBackupBytes) throw Error('Backup exceeds the 50 MB recovery limit');
  const result = restoreBackup(fs.readFileSync(source, 'utf8'), path.resolve(destination));
  console.log(`Restored ${result.quotes} quotes, ${result.contacts} contacts and ${result.files} files into ${path.resolve(destination)}. Email and webhook delivery remain disabled until reconfigured.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
