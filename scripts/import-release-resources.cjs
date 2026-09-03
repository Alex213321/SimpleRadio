// Electron's fs implementation can read the packaged app.asar without an extra unpacker.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { safePath, sha256, readManifest, verifyFiles } = require('./resource-tools.cjs');

app.whenReady().then(async () => {
  const root = path.resolve(__dirname, '..');
  const input = process.argv[2];
  if (!input || input.startsWith('--')) throw new Error('用法：npm run resources:import -- "已合并解压的播放器目录" [--force]');
  const release = path.resolve(input);
  if (!fs.existsSync(path.join(release, 'SimpleRadio.exe')) || !fs.existsSync(path.join(release, 'resources', 'app.asar'))) throw new Error('请选择包含 SimpleRadio.exe 和 resources 的目录');
  const manifest = readManifest(root);
  const force = process.argv.includes('--force');
  const copies = [];
  // Validate every source and conflict before changing destination resources.
  for (const file of manifest.files) {
    const source = file.path.startsWith('bundled-library/')
      ? safePath(path.join(release, 'resources', 'music-library'), file.path.slice('bundled-library/'.length))
      : safePath(path.join(release, 'resources', 'app.asar'), file.path);
    if (!fs.existsSync(source) || fs.statSync(source).size !== file.size || await sha256(source) !== file.sha256) throw new Error(`成品资源缺失或版本不匹配：${file.path}，请合并同版本的 Program 和 Music 包`);
    const destination = safePath(root, file.path);
    if (fs.existsSync(destination)) {
      if (fs.statSync(destination).size === file.size && await sha256(destination) === file.sha256) continue;
      if (!force) throw new Error(`本地资源已改动：${file.path}。先备份；确定替换时加 --force。`);
    }
    copies.push({ source, destination });
  }
  for (const { source, destination } of copies) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    // readFile supports ASAR entries; originals and all personal data remain untouched.
    fs.writeFileSync(destination + '.tmp', fs.readFileSync(source));
    fs.renameSync(destination + '.tmp', destination);
  }
  await verifyFiles(root, manifest.files);
  console.log(`已导入 ${copies.length} 个资源文件；全部 ${manifest.files.length} 个文件通过 SHA256 校验。`);
  app.quit();
}).catch(error => { console.error(error.message); app.exit(1); });
