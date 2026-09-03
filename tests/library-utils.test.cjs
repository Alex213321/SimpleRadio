const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  createPlaylistId,
  createTrackId,
  normalizePlayer,
  normalizeSettings,
  parseTrackFilename
} = require('../electron/library-utils.cjs');
const { WALLPAPER_DEFINITIONS } = require('../electron/wallpapers.cjs');

test('cleans the supplied Jay Chou collection filename', () => {
  const parsed = parseTrackFilename('D:/音乐/【周杰伦】50首精选合集 p01 001.周杰伦-晴天-BV1FPjy6TEiE_p1.mp3');
  assert.equal(parsed.title, '晴天');
  assert.equal(parsed.artist, '周杰伦');
  assert.equal(parsed.order, 1);
});

test('track and playlist ids are stable', () => {
  assert.equal(createTrackId('D:/Music/a.mp3'), createTrackId(path.resolve('D:/Music/a.mp3')));
  assert.equal(createPlaylistId('D:/Music/Album'), createPlaylistId('D:/Music/Album/'));
});

test('player state drops unknown ids and clamps values', () => {
  const player = normalizePlayer({ currentTrackId: 'missing', queueIds: ['ok', 'missing'], volume: 8, repeat: 'bad', activeView: 'stage' }, new Set(['ok']));
  assert.equal(player.currentTrackId, null);
  assert.deepEqual(player.queueIds, ['ok']);
  assert.equal(player.volume, 1);
  assert.equal(player.repeat, 'all');
  assert.equal(player.shuffle, false);
  assert.equal(player.activeView, 'stage');
});

test('settings discard removed visual and lyric fields while preserving wallpaper parameters', () => {
  const settings = normalizeSettings({ wallpaperId: 'remote', wallpaperOpacity: .7, wallpaperDim: .3, wallpaperBlur: 4, visualEnabled: true, visualPreset: 'moon-tide', visualIntensity: 1, lyricFontSize: 500, lyricSpread: 1, lyricGlow: .5, lyricOffsetY: 40, beatSensitivity: 1 });
  assert.equal(settings.wallpaperId, 'anime-girl');
  assert.deepEqual(settings, { wallpaperId: 'anime-girl', wallpaperOpacity: .7, wallpaperDim: .3, wallpaperBlur: 4 });
  for (const key of ['visualEnabled', 'visualPreset', 'visualIntensity', 'beatSensitivity', 'motionSpeed', 'lyricFontSize', 'lyricSpread', 'lyricGlow', 'lyricOffsetY']) {
    assert.equal(Object.hasOwn(settings, key), false);
  }
});

test('every built-in wallpaper id survives settings normalization', () => {
  for (const wallpaperId of WALLPAPER_DEFINITIONS.map((wallpaper) => wallpaper.id)) {
    assert.equal(normalizeSettings({ wallpaperId }).wallpaperId, wallpaperId);
  }
});
