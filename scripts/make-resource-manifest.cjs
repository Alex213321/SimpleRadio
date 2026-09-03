// Maintainer utility: generate a new pinned asset inventory from a reviewed release.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { sha256 } = require('./resource-tools.cjs');
const { WALLPAPER_DEFINITIONS } = require('../electron/wallpapers.cjs');

app.whenReady().then(async () => {
  if (!process.argv[2]) throw new Error('需要已解压的成品目录参数');
  const fromProject = process.argv[2] === '--project';
  const release = path.resolve(process.argv[2]);
  const project = path.resolve(__dirname, '..');
  const files = [];
  const add = async (source, relative) => files.push({ path: relative, size: fs.statSync(source).size, sha256: await sha256(source) });
  async function walk(source, relative) {
    for (const item of fs.readdirSync(source, { withFileTypes: true })) {
      if (item.isSymbolicLink()) throw new Error('不接受符号链接资源');
      if (item.isDirectory()) await walk(path.join(source, item.name), `${relative}/${item.name}`);
      else await add(path.join(source, item.name), `${relative}/${item.name}`);
    }
  }
  await walk(fromProject ? path.join(project, 'bundled-library') : path.join(release, 'resources', 'music-library'), 'bundled-library');
  const wallpaperRoot = fromProject ? path.join(project, 'assets', 'wallpapers') : path.join(release, 'resources', 'app.asar', 'assets', 'wallpapers');
  for (const file of ['supplied-manifest.json', ...WALLPAPER_DEFINITIONS.flatMap(item => [item.fileName, item.posterFileName]).filter(Boolean)]) await add(path.join(wallpaperRoot, file), `assets/wallpapers/${file}`);
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  fs.writeFileSync(path.join(project, 'assets', 'resource-manifest.json'), JSON.stringify({ version: 1, release: require('../package.json').version, files }, null, 2) + '\n');
  console.log(`资源清单：${files.length} 个文件`);
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
