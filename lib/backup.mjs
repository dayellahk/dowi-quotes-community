import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const maximumBackupBytes = 50 * 1024 * 1024;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const assetID = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function createBackup(db, directory) {
  const workspace = structuredClone(db);
  if (workspace.webhooks) workspace.webhooks.secret = '';
  const files = [];
  let bytesUsed = Buffer.byteLength(JSON.stringify(workspace));
  for (const asset of workspace.assets ?? []) {
    if (!assetID(asset.id)) throw Error('Backup contains an invalid attachment identifier');
    const location = path.join(directory, asset.id);
    let fd;
    try { fd = fs.openSync(location, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); }
    catch (error) { if (error.code === 'ENOENT') throw Error(`Backup cannot complete: attachment ${asset.name} is missing`); throw error; }
    let bytes;
    try {
      const size = fs.fstatSync(fd).size;
      if (size !== asset.size || size > 5 * 1024 * 1024) throw Error('Backup attachment size is invalid');
      bytesUsed += Math.ceil(size / 3) * 4 + 500;
      if (bytesUsed > maximumBackupBytes) throw Error('Backup exceeds the 50 MB export limit. Use a server filesystem backup for this workspace.');
      bytes = fs.readFileSync(fd);
    } finally { fs.closeSync(fd); }
    const sha256 = digest(bytes);
    if (asset.sha256 && asset.sha256 !== sha256) throw Error(`Backup cannot complete: attachment ${asset.name} failed its integrity check`);
    files.push({ id: asset.id, size: bytes.length, sha256, base64: bytes.toString('base64') });
  }
  const backup = { format: 'dowi-quotes-backup', version: 1, createdAt: new Date().toISOString(), workspace, workspaceSha256: digest(JSON.stringify(workspace)), files, exclusions: ['Workspace passwords and SMTP credentials', 'Webhook signing secret; reconfigure after recovery'] };
  const result = JSON.stringify(backup);
  if (Buffer.byteLength(result) > maximumBackupBytes) throw Error('Backup exceeds the 50 MB export limit. Use a server filesystem backup for this workspace.');
  return result;
}

export function restoreBackup(input, destination) {
  if (Buffer.byteLength(input) > maximumBackupBytes) throw Error('Backup exceeds the 50 MB recovery limit');
  const backup = JSON.parse(input);
  if (backup.format !== 'dowi-quotes-backup' || backup.version !== 1) throw Error('Unsupported backup format');
  const db = backup.workspace;
  if (!db || !db.settings || !['quotes','contacts','items','templates','assets'].every(key => Array.isArray(db[key])) || !Array.isArray(backup.files)) throw Error('Backup workspace is incomplete');
  if (digest(JSON.stringify(db)) !== backup.workspaceSha256) throw Error('Workspace integrity check failed');
  const ids = new Set();
  const decoded = [];
  for (const file of backup.files) {
    if (!assetID(file.id) || ids.has(file.id)) throw Error('Invalid or duplicate backup attachment');
    ids.add(file.id);
    const asset = db.assets.find(asset => asset.id === file.id);
    if (!asset || typeof file.base64 !== 'string') throw Error('Unknown backup attachment');
    const bytes = Buffer.from(file.base64, 'base64');
    if (bytes.toString('base64') !== file.base64 || bytes.length !== file.size || bytes.length !== asset.size || bytes.length > 5 * 1024 * 1024 || digest(bytes) !== file.sha256 || asset.sha256 && asset.sha256 !== file.sha256) throw Error('Attachment integrity check failed');
    decoded.push({ id: file.id, bytes });
  }
  if (ids.size !== db.assets.length || db.assets.some(asset => !ids.has(asset.id))) throw Error('Backup is missing attachment content');
  // Recovery must not resend historical email or webhook deliveries.
  if (db.webhooks) Object.assign(db.webhooks, { secret: '', enabled: false, paused: true });
  for (const mail of db.mailDeliveries ?? []) if (['Queued','Delivering'].includes(mail.status)) { mail.status = 'Cancelled'; mail.error = 'Recovered from backup; automatic sending disabled'; }
  for (const delivery of db.deliveries ?? []) if (['Pending','Delivering','Retrying'].includes(delivery.status)) { delivery.status = 'Failed'; delivery.error = 'Recovered from backup; automatic delivery disabled'; }
  // Atomically claim a new private directory before creating any restored files.
  try { fs.mkdirSync(destination, { recursive: false, mode: 0o700 }); }
  catch (error) { if (error.code === 'EEXIST') throw Error('Restore destination must not exist; existing workspaces are never overwritten'); throw error; }
  try {
    fs.mkdirSync(path.join(destination, 'files'), { mode: 0o700 });
    for (const file of decoded) fs.writeFileSync(path.join(destination, 'files', file.id), file.bytes, { mode: 0o600, flag: 'wx' });
    fs.writeFileSync(path.join(destination, 'workspace.json'), JSON.stringify(db, null, 2), { mode: 0o600, flag: 'wx' });
  } catch (error) { fs.rmSync(destination, { recursive: true, force: true }); throw error; }
  return { quotes: db.quotes.length, contacts: db.contacts.length, files: decoded.length };
}
