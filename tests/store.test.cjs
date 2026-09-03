const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LibraryStore } = require('../electron/store.cjs');

test('favorites, playlists, wallpaper settings and listening statistics survive a reload', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'simple-radio-store-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new LibraryStore(directory);
  store.addTracks([{
    id: 'track-1',
    path: path.join(directory, 'song.mp3'),
    title: '测试歌曲',
    artist: '本地艺术家',
    album: '测试歌单',
    duration: 180,
    favorite: false,
    playCount: 0,
    listenedSeconds: 0
  }]);
  store.upsertFolderPlaylist(directory, ['track-1'], { name: '我的歌单' });
  store.setFavorite('track-1', true);
  store.saveSettings({ wallpaperId: 'deep-tide', wallpaperOpacity: .82, wallpaperDim: .3, wallpaperBlur: 4 });
  store.recordListening({ trackId: 'track-1', seconds: 12, started: true, markPlay: true, playToken: 'one-play' });

  const restored = new LibraryStore(directory);
  assert.equal(restored.state.tracks[0].favorite, true);
  assert.equal(restored.state.tracks[0].playCount, 1);
  assert.equal(restored.state.tracks[0].listenedSeconds, 12);
  assert.equal(restored.state.statistics.totalListenedSeconds, 12);
  assert.equal(restored.state.playlists[0].name, '我的歌单');
  assert.equal(restored.state.settings.wallpaperId, 'deep-tide');
  assert.equal(restored.state.settings.wallpaperOpacity, .82);
  assert.equal(restored.state.settings.wallpaperDim, .3);
  assert.equal(restored.state.settings.wallpaperBlur, 4);
});

test('loading legacy saved data removes retired text and settings without losing listening data', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'simple-radio-retired-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'library.json'), JSON.stringify({
    tracks: [{ id: 'saved-track', title: '本地歌曲', favorite: true, playCount: 6, listenedSeconds: 700,
      lastPlayedAt: '2026-08-30T10:00:00Z', lyricsRaw: 'retired text', lyricsSource: 'sidecar', lyricsReview: { text: true } }],
    settings: { wallpaperId: 'color-light', wallpaperOpacity: .95, wallpaperDim: .2, wallpaperBlur: 2,
      lyricFontSize: 52, lyricSpread: 1.3, lyricGlow: .8, lyricOffsetY: 40 },
    player: { currentTrackId: 'saved-track', queueIds: ['saved-track'], currentTime: 75, repeat: 'one', activeView: 'stage' },
    statistics: { totalListenedSeconds: 700, totalPlayCount: 6 }
  }));
  const store = new LibraryStore(directory);
  store.save();
  const saved = JSON.parse(fs.readFileSync(store.filePath, 'utf8'));
  assert.doesNotMatch(JSON.stringify(saved), /lyric/i);
  assert.equal(saved.tracks[0].favorite, true);
  assert.equal(saved.tracks[0].playCount, 6);
  assert.equal(saved.tracks[0].lastPlayedAt, '2026-08-30T10:00:00Z');
  assert.equal(saved.statistics.totalListenedSeconds, 700);
  assert.equal(saved.player.currentTime, 75);
  assert.equal(saved.player.repeat, 'one');
  assert.equal(saved.player.activeView, 'stage');
  assert.equal(saved.settings.wallpaperId, 'color-light');
});
