const path = require('node:path');
const { readManifest, verifyFiles } = require('./resource-tools.cjs');
const { loadCatalog } = require('../electron/catalog.cjs');

(async () => {
  const root = path.resolve(__dirname, '..');
  const manifest = readManifest(root);
  const checked = await verifyFiles(root, manifest.files);
  const catalog = loadCatalog(path.join(root, 'bundled-library'));
  console.log(`资源验证通过：${checked} 个文件，${catalog.playlists.length} 张歌单 / ${catalog.tracks.length} 首歌曲。`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
