const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function safePath(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes(':') || relative.startsWith('/') || relative.split('/').some(p => !p || p === '.' || p === '..')) throw new Error(`无效资源路径：${relative}`);
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) throw new Error('资源路径越界');
  return resolved;
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', bytes => hash.update(bytes));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function readManifest(projectRoot) {
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets', 'resource-manifest.json'), 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error('资源校验清单无效');
  const seen = new Set();
  for (const file of manifest.files) {
    safePath(projectRoot, file.path);
    if (!/^(bundled-library\/|assets\/wallpapers\/)/.test(file.path) || seen.has(file.path) || !Number.isSafeInteger(file.size) || file.size <= 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error(`资源条目无效：${file.path}`);
    seen.add(file.path);
  }
  return manifest;
}

async function verifyFiles(root, files) {
  for (const file of files) {
    const target = safePath(root, file.path);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile() || fs.statSync(target).size !== file.size) throw new Error(`资源缺失/大小不符：${file.path}。请先执行 npm run resources:import。`);
    if (await sha256(target) !== file.sha256) throw new Error(`SHA256 不符：${file.path}`);
  }
  return files.length;
}

module.exports = { safePath, sha256, readManifest, verifyFiles };
