const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { WALLPAPER_DEFINITIONS } = require('../electron/wallpapers.cjs');

const root = path.resolve(__dirname, '..');
const assetRoot = path.join(root, 'assets', 'wallpapers');

test('all fifteen supplied wallpapers match the internal SHA256 manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(assetRoot, 'supplied-manifest.json'), 'utf8'));
  assert.equal(manifest.count, 15);
  assert.equal(manifest.wallpapers.length, 15);
  assert.deepEqual(manifest.wallpapers.reduce((counts, item) => ({ ...counts, [item.type]: (counts[item.type] || 0) + 1 }), {}), { image: 9, video: 6 });
  for (const wallpaper of manifest.wallpapers) {
    const filePath = path.join(assetRoot, wallpaper.fileName);
    assert.equal(fs.statSync(filePath).size, wallpaper.size, wallpaper.name);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'), wallpaper.sha256, wallpaper.name);
    assert.ok(WALLPAPER_DEFINITIONS.some((item) => item.fileName === wallpaper.fileName && item.name === wallpaper.name));
  }
});

test('every image and dynamic wallpaper has a bundled lightweight preview', () => {
  const mediaWallpapers = WALLPAPER_DEFINITIONS.filter((wallpaper) => ['image', 'video'].includes(wallpaper.type));
  assert.equal(mediaWallpapers.length, 17);
  for (const wallpaper of mediaWallpapers) {
    assert.ok(wallpaper.posterFileName, wallpaper.name);
    const posterPath = path.join(assetRoot, wallpaper.posterFileName);
    assert.ok(fs.existsSync(posterPath), wallpaper.name);
    assert.ok(fs.statSync(posterPath).size > 4_000, wallpaper.name);
  }
});
