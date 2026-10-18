import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBackup, restoreBackup } from '../lib/backup.mjs';

test('staff backup includes attachment bytes and private records, restores safely, and never resends deliveries', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dowi-backup-test-'));
  const dir = path.join(root, 'live');
  const server = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: '3112', DATA_DIR: dir, INTERNAL_PASSWORD: 'backup-test' }, stdio: ['ignore','pipe','pipe'] });
  const request = async (url, method = 'GET', body, staff = true) => {
    const response = await fetch('http://127.0.0.1:3112' + url, { method, headers: { 'Content-Type': 'application/json', ...(staff ? { Authorization: 'Basic ' + Buffer.from('admin:backup-test').toString('base64') } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json(), headers: response.headers };
  };
  try {
    await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(() => { throw Error('Test server failed'); })]);
    assert.equal((await request('/api/backup', 'GET', undefined, false)).status, 401);
    const workspace = (await request('/api/workspace')).data;
    const bytes = Buffer.from('%PDF-1.4\nBackup round-trip\n%%EOF\n');
    const asset = (await request('/api/assets', 'POST', { name: 'scope.pdf', base64: bytes.toString('base64') })).data;
    const quote = (await request('/api/quotes', 'POST', { title: 'Backup round-trip', contactId: workspace.contacts[0].id, tax: 0, expires: new Date(Date.now()+86400000).toISOString(), items: [{ name: 'Service', price: 500, cost: 100, qty: 1 }], attachments: [asset] })).data;
    await request('/api/webhooks', 'PUT', { url: 'https://example.com/hooks', baseURL: 'http://127.0.0.1:3112', secret: 'excluded-signing-secret', enabled: false, events: [] });
    const response = await request('/api/backup');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-disposition'), /Dowi-Quotes-Backup/);
    const backup = response.data;
    assert.equal(backup.workspace.webhooks.secret, '');
    assert.equal(backup.workspace.quotes.find(q => q.id === quote.id).items[0].cost, 100);
    assert.deepEqual(Buffer.from(backup.files[0].base64, 'base64'), bytes);
    const restored = path.join(root, 'recovered');
    assert.equal(restoreBackup(JSON.stringify(backup), restored).files, 1);
    assert.deepEqual(fs.readFileSync(path.join(restored, 'files', asset.id)), bytes);
    const db = JSON.parse(fs.readFileSync(path.join(restored, 'workspace.json')));
    assert.equal(db.quotes.find(q => q.id === quote.id).token, quote.token);
    assert.equal(db.webhooks.enabled, false);
    assert.throws(() => restoreBackup(JSON.stringify(backup), restored), /must not exist/);
    const tampered = structuredClone(backup); tampered.files[0].base64 = Buffer.from('damaged').toString('base64');
    assert.throws(() => restoreBackup(JSON.stringify(tampered), path.join(root, 'damaged')), /integrity/);
    assert.equal(fs.existsSync(path.join(root, 'damaged')), false);
    const changedWorkspace = structuredClone(backup); changedWorkspace.workspace.settings.company = 'Changed';
    assert.throws(() => restoreBackup(JSON.stringify(changedWorkspace), path.join(root, 'changed')), /integrity/);
    const live = structuredClone(backup.workspace);
    live.mailDeliveries.push({ status: 'Queued' }); live.deliveries.push({ status: 'Retrying' });
    restoreBackup(createBackup(live, path.join(dir, 'files')), path.join(root, 'paused'));
    const paused = JSON.parse(fs.readFileSync(path.join(root, 'paused/workspace.json')));
    assert.equal(paused.mailDeliveries.at(-1).status, 'Cancelled');
    assert.equal(paused.deliveries.at(-1).status, 'Failed');
    fs.unlinkSync(path.join(dir, 'files', asset.id));
    assert.equal((await request('/api/backup')).status, 400, 'Missing attachments must fail the entire backup');
  } finally {
    if (server.exitCode === null) { const closed = once(server, 'exit'); server.kill(); await closed; }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
