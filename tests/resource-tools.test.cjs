const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { safePath, sha256, verifyFiles, readManifest } = require('../scripts/resource-tools.cjs');

test('resource import rejects absolute paths, traversal and alternate separators', () => {
  for (const value of ['/tmp/x', 'C:/x', '../x', 'a/../x', 'a\\x', 'a//x', '']) assert.throws(() => safePath(__dirname, value));
  assert.equal(safePath(__dirname, 'assets/x.png'), path.join(__dirname, 'assets', 'x.png'));
});

test('resource verification detects missing and changed content', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'simpleradio-resource-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'example'), 'abc');
  const hash = await sha256(path.join(root, 'example'));
  const files = [{ path: 'example', size: 3, sha256: hash }];
  assert.equal(await verifyFiles(root, files), 1);
  fs.writeFileSync(path.join(root, 'example'), 'xyz');
  await assert.rejects(verifyFiles(root, files), /SHA256/);
  await assert.rejects(verifyFiles(root, [{ ...files[0], path: 'missing' }]), /资源缺失/);
});

test('public source ships a complete pinned inventory and has no install-time resource preparation', () => {
  const root = path.resolve(__dirname, '..');
  const manifest = readManifest(root);
  assert.equal(manifest.files.filter(f => f.path.endsWith('.mp3')).length, 237);
  assert.equal(manifest.files.filter(f => f.path.endsWith('-poster.jpg')).length, 17);
  const pkg = require('../package.json');
  assert.equal(pkg.scripts.prepare, undefined);
  assert.ok(pkg.scripts['resources:import']);
  assert.match(pkg.scripts['dist:win'], /resources:verify/);
});
