const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { WALLPAPER_DEFINITIONS } = require('../electron/wallpapers.cjs');
const { COLLECTIONS: COLLECTIONS_FOR_TEST } = require('../electron/catalog.cjs');

const root = path.resolve(__dirname, '..');

test('renderer keeps a strict local content security policy', () => {
  const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
  assert.match(html, /default-src 'self'/);
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /https?:\/\//);
});

test('main window uses isolation, sandbox and no Node integration', () => {
  const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
  const shell = styles.match(/\.app-shell \{[^}]+\}/)?.[0] || '';
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /transparent:\s*true/);
  assert.match(main, /hasShadow:\s*false/);
  assert.match(shell, /clip-path:\s*inset\(0 round 28px\)/);
  assert.doesNotMatch(shell, /box-shadow:\s*0 28px 80px/);
  assert.doesNotMatch(main, /server\.listen|createServer\s*\(/);
});

test('close hides to a tray whose menu can restore or fully exit', () => {
  const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
  assert.match(main, /new Tray\(trayIcon\)/);
  assert.match(main, /label: '显示 SimpleRadio'/);
  assert.match(main, /label: '退出'/);
  assert.match(main, /mainWindow\.on\('close',[\s\S]*?event\.preventDefault\(\);[\s\S]*?mainWindow\.hide\(\)/);
  assert.match(main, /app\.on\('before-quit',[\s\S]*?isQuitting = true/);
  assert.match(main, /mainWindow\.setOpacity\(0\)/);
  assert.match(main, /requestAnimationFrame\(\(\) => requestAnimationFrame/);
  assert.match(main, /mainWindow\.setOpacity\(1\)/);
  assert.match(main, /lastTrayReveal = \{ guarded: canGuardOpacity, framePrepared: Boolean\(framePrepared\) \}/);
});

test('new SR artwork is wired to the window, tray and Windows package', () => {
  const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const png = fs.readFileSync(path.join(root, 'assets', 'icon.png'));
  const ico = fs.readFileSync(path.join(root, 'assets', 'icon.ico'));
  assert.equal(png.readUInt32BE(16), 512);
  assert.equal(png.readUInt32BE(20), 512);
  assert.ok(png.length > 100_000);
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.ok(ico.readUInt16LE(4) >= 7);
  assert.match(main, /icon: projectAssetPath\('assets', 'icon\.png'\)/);
  assert.match(main, /process\.platform === 'win32' \? 'icon\.ico' : 'icon\.png'/);
  assert.equal(manifest.build.win.icon, 'assets/icon.ico');
  assert.ok(manifest.build.files.includes('!assets/icon-source-v*.png'));
});

test('appearance contains only skin and three wallpaper parameters', () => {
  const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
  assert.deepEqual([...html.matchAll(/data-appearance-section="([^"]+)"/g)].map((match) => match[1]), ['skin']);
  assert.deepEqual([...html.matchAll(/data-setting="([^"]+)"/g)].map((match) => match[1]), ['wallpaperOpacity', 'wallpaperDim', 'wallpaperBlur']);
  assert.doesNotMatch(html, /data-panel-tab|role="tablist"/);
  assert.doesNotMatch(html, /visualizer|visualCanvas|visualPanel|data-visual/);
  assert.doesNotMatch(renderer, /SimpleVisualizer|AudioContext|createAnalyser/);
  assert.equal(fs.existsSync(path.join(root, 'src', 'visualizer.js')), false);
});

test('stage preserves song information without a cover block, page overlay or lyric layer', () => {
  const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
  const stage = html.match(/<section id="stageView"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(stage, /id="stageTitle"/);
  assert.match(stage, /id="stageArtist"/);
  assert.doesNotMatch(stage, /id="stageCover"/);
  assert.match(styles, /\.stage-heading \{[^}]*left: 4\.5%; top: 12%; width: 31%;/);
  assert.doesNotMatch(styles, /\.stage-cover|\.stage-view::before/);
  assert.match(styles, /\.stage-view \{[^}]*background: transparent/);
  assert.doesNotMatch(html + renderer + styles, /lyric|暂无歌词|静静听完|沉浸声场/i);
  assert.equal(fs.existsSync(path.join(root, 'src', 'lyrics.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'electron', 'lyric-catalog.cjs')), false);
});

test('primary navigation exposes home, stage, favorites and recent in order', () => {
  const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
  const rail = html.match(/<nav class="floating-rail"[\s\S]*?<\/nav>/)?.[0] || '';
  const views = [...rail.matchAll(/data-view="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(views, ['home', 'stage', 'favorites', 'recent']);
  assert.match(html, /id="favoritesView"/);
  assert.match(html, /id="recentView"/);
});

test('fixed catalog exposes no import action or IPC and search still renders inline', () => {
  const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
  const imports = [...html.matchAll(/data-import="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(imports, []);
  const preload = fs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
  assert.doesNotMatch(preload + main, /library:import-|importFiles|importFolder|importPaths|webUtils/);
  assert.doesNotMatch(renderer, /importMusic|dropOverlay|pathForFile/);
  assert.doesNotMatch(html, /重新导入|添加歌曲|导入歌单/);
  assert.match(html, /id="searchResults"/);
  assert.doesNotMatch(renderer, /openTracksDialog\('search'/);
  assert.doesNotMatch(html, /PRIVATE IMMERSIVE PLAYER|所有记录仅保存在这台电脑/);
});

test('player transport keeps only previous, toggle, next and two-state playback mode', () => {
  const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
  const transport = html.match(/<div class="transport">([\s\S]*?)<\/div>/)?.[1] || '';
  const actions = [...transport.matchAll(/data-player="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(actions, ['previous', 'toggle', 'next', 'repeat']);
  assert.match(html, /data-toggle-stage/);
  assert.match(renderer, /state\.player\.repeat === 'one' \? 'all' : 'one'/);
});

test('progress supports pointer dragging and favorites expose play all', () => {
  const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
  assert.match(html, /id="favoritesPlayAll"[^>]+data-play-favorites/);
  assert.match(renderer, /refs\.progress\.addEventListener\('pointerdown'/);
  assert.match(renderer, /refs\.progress\.addEventListener\('change'/);
  assert.match(renderer, /function commitProgressSeek/);
});

test('every launch enters home, recent history is capped at ten and dialog selection refreshes', () => {
  const renderer = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
  assert.match(renderer, /switchView\('home'\);/);
  assert.match(renderer, /\.sort\([\s\S]*?\.slice\(0, 10\);/);
  assert.match(renderer, /renderHome\(\);\s*if \(refs\.collectionDialog\.open\) refreshOpenDialog\(\);/);
});

test('three formerly similar playlists keep distinct colors with harmonious soft patterns', () => {
  const variants = ['chen', 'tao', 'medley'].map((key) => COLLECTIONS_FOR_TEST.find((item) => item.key === key));
  assert.equal(new Set(variants.map((item) => item.variant)).size, 3);
  assert.equal(new Set(variants.map((item) => item.colors.join('/'))).size, 3);
  const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
  for (const variant of ['wind', 'soft-glow', 'horizon-glow']) assert.match(styles, new RegExp(`data-variant="${variant}"`));
  assert.doesNotMatch(styles, /data-variant="(?:soft-glow|horizon-glow)"[^\n]*(?:repeating-radial-gradient|repeating-linear-gradient)/);
});

test('skin panel exposes four gradients, nine supplied images and eight videos', () => {
  const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
  assert.equal(WALLPAPER_DEFINITIONS.length, 21);
  assert.deepEqual(WALLPAPER_DEFINITIONS.reduce((counts, item) => ({ ...counts, [item.type]: (counts[item.type] || 0) + 1 }), {}), { static: 4, video: 8, image: 9 });
  assert.equal(new Set(WALLPAPER_DEFINITIONS.map((item) => item.id)).size, 21);
  assert.equal(new Set(WALLPAPER_DEFINITIONS.map((item) => item.name)).size, 21);
  assert.ok(WALLPAPER_DEFINITIONS.some((item) => item.name === '绛瞳予心'));
  assert.ok(WALLPAPER_DEFINITIONS.some((item) => item.name === '冰澜映瞳'));
  assert.ok(WALLPAPER_DEFINITIONS.some((item) => item.name === '雨眠软云'));
  assert.match(main, /WALLPAPER_DEFINITIONS/);
  assert.match(main, /app\.getPath\('userData'\), 'built-in-wallpapers'/);
  assert.match(main, /fs\.writeFileSync\(temporaryPath, fs\.readFileSync\(sourcePath\)\)/);
  assert.equal(WALLPAPER_DEFINITIONS.filter((item) => item.type === 'video' && item.posterFileName).length, 8);
  assert.equal(WALLPAPER_DEFINITIONS.filter((item) => ['image', 'video'].includes(item.type) && item.posterFileName).length, 17);
  assert.match(renderer, /wallpaper\.previewUrl/);
  assert.match(renderer, /data-wallpaper-preview/);
  assert.doesNotMatch(renderer, /wallpaper-preview-media|video\.currentTime = frameTime/);
  assert.match(renderer, /syncWallpaperOptionSelection\(\)/);
  const wallpaperBranch = renderer.match(/if \(target\.dataset\.wallpaper\) \{[\s\S]*?\n    \}/)?.[0] || '';
  assert.doesNotMatch(wallpaperBranch, /renderWallpapers\(\)/);
});

test('appearance panel opens on a lightweight compositor-only path', () => {
  const renderer = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
  const panel = styles.match(/\.control-panel \{[^}]+\}/)?.[0] || '';
  const previewHighlight = styles.match(/\.wallpaper-preview::after \{[^}]+\}/)?.[0] || '';
  assert.match(panel, /backdrop-filter:\s*none/);
  assert.match(panel, /transform:\s*translate3d/);
  assert.match(panel, /contain:\s*layout paint style/);
  assert.match(styles, /\.wallpaper-option \{[^}]*content-visibility:\s*auto/);
  assert.doesNotMatch(previewHighlight, /filter:/);
  assert.match(renderer, /wallpaper\.previewUrl \|\| \(wallpaper\.type === 'image' \? wallpaper\.mediaUrl : null\)/);
  assert.match(renderer, /requestAnimationFrame\(\(\) => requestAnimationFrame\(resolve\)\)/);
  assert.match(renderer, /controlPanelOpenSamples\.push/);
  const initialize = renderer.match(/async function initialize\(\) \{[\s\S]*?\n  \}/)?.[0] || '';
  assert.equal((initialize.match(/renderWallpapers\(\)/g) || []).length, 0);
});
