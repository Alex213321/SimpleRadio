const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { COLLECTIONS, parseCuratedFilename, loadCatalog, migrateCatalogState, resolveCatalogPath } = require('../electron/catalog.cjs');
const { createDefaultState } = require('../electron/library-utils.cjs');
const { LibraryStore } = require('../electron/store.cjs');
const root = path.resolve(__dirname, '..', 'bundled-library');
const catalog = loadCatalog(root);

test('built-in manifest does not include retired lyric data', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.doesNotMatch(JSON.stringify(manifest), /lyricsRaw|lyricsSource|lyricsReview/);
});

test('all seven curated playlists contain exactly 50 / 6 / 100 / 40 / 15 / 23 / 3 tracks', () => {
  assert.equal(catalog.tracks.length, 237);
  assert.deepEqual(catalog.playlists.map((playlist) => playlist.trackIds.length), [50, 6, 100, 40, 15, 23, 3]);
  assert.equal(new Set(catalog.tracks.map((track) => track.id)).size, 237);
  for (const track of catalog.tracks) {
    assert.ok(track.duration > 0);
    assert.ok(track.album && track.artist && track.title);
    assert.doesNotMatch(track.title + track.artist, /BV[\w]+|豪装|Hi-res|未知|_pNA/);
    assert.ok(catalog.playlists.find((playlist) => playlist.id === track.collectionId).trackIds.includes(track.id));
  }
});

test('every bundled audio matches the source-derived SHA256 manifest', () => {
  for (const track of catalog.tracks) {
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(track.path)).digest('hex'), track.sha256, track.title);
  }
});

test('collection filename rules preserve singer, clean title, duets and numeric order', () => {
  const chen = COLLECTIONS.find((item) => item.key === 'chen');
  assert.equal(parseCuratedFilename('陈楚生《庙堂之外（电影《长安的荔枝》片尾曲）》百万豪装录音棚.mp3', chen).title, '庙堂之外');
  assert.equal(parseCuratedFilename('陈楚生&王赫野《不如回家喝自来水》百万豪装.mp3', chen).artist, '陈楚生 / 王赫野');
  const mao = COLLECTIONS.find((item) => item.key === 'mao');
  assert.deepEqual(parseCuratedFilename('在百万豪装录音棚大声听 毛不易《一荤一素》【Hi-res】.mp3', mao), { title: '一荤一素', artist: '毛不易', order: Number.MAX_SAFE_INTEGER, album: '毛不易精选' });
  const mandarin = COLLECTIONS.find((item) => item.key === 'mandarin');
  assert.deepEqual(parseCuratedFilename('35.突然的自我- 伍佰.mp3', mandarin), { title: '突然的自我', artist: '伍佰', order: 35, album: '经典华语歌曲' });
  const english = COLLECTIONS.find((item) => item.key === 'english');
  assert.equal(parseCuratedFilename("04.Please Don't Go - Joel Adams.mp3", english).artist, 'Joel Adams');
  const tao = COLLECTIONS.find((item) => item.key === 'tao');
  assert.deepEqual(parseCuratedFilename('12.Melody - 陶喆.mp3', tao), { title: 'Melody', artist: '陶喆', order: 12, album: '陶喆精选' });
  const medley = COLLECTIONS.find((item) => item.key === 'medley');
  assert.deepEqual(parseCuratedFilename('宝石GEM现场合集.mp3', medley), { title: '宝石 GEM · 现场合集', artist: '宝石 GEM', order: 2, album: '长篇串烧精选' });
});

test('legacy Chen records are replaced once; Jay favorites, queues and lifetime stats survive', () => {
  const jay = catalog.tracks[0];
  const chen = catalog.tracks.find((track) => track.collectionId === 'seed-chen-6');
  const original = { ...createDefaultState(), tracks: [
    { ...jay, id: 'old-jay', path: path.join('D:\\音乐播放器开发', jay.sourceFolder, jay.sourceFileName), favorite: true, listenedSeconds: 240, playCount: 3 },
    { id: 'old-chen', path: path.join('D:\\音乐播放器开发', chen.sourceFolder, chen.sourceFileName), title: '未整理的旧陈楚生文件名', favorite: true },
    { id: 'duplicate-chen', path: path.join('D:\\音乐播放器开发', chen.sourceFolder, chen.sourceFileName) }
  ], playlists: [{ id: 'old-chen-folder', trackIds: ['old-chen', 'duplicate-chen'] }], player: { currentTrackId: 'old-jay', queueIds: ['old-jay', 'old-chen', 'missing'], currentTime: 13, volume: .4 }, statistics: { totalListenedSeconds: 500, totalPlayCount: 5 } };
  const next = migrateCatalogState(original, catalog);
  assert.equal(next.tracks.length, 237);
  assert.equal(next.tracks.filter((track) => track.collectionId === 'seed-chen-6').length, 6);
  assert.equal(next.playlists.some((playlist) => playlist.id === 'old-chen-folder'), false);
  assert.equal(next.tracks[0].favorite, true);
  assert.equal(next.tracks[0].playCount, 3);
  assert.deepEqual(next.player.queueIds, [jay.id, chen.id]);
  assert.equal(next.player.currentTime, 13);
  assert.equal(next.statistics.totalListenedSeconds, 500);
  assert.deepEqual(migrateCatalogState(next, catalog), next);
  assert.equal(original.tracks.length, 3);
});

test('migration creates a recoverable backup and rebases bundled paths on every start', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'simple-radio-catalog-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new LibraryStore(dir);
  store.save();
  store.applyCatalog(catalog);
  assert.equal(fs.readdirSync(dir).filter((name) => name.endsWith('.bak')).length, 1);
  store.setFavorite(catalog.tracks[0].id, true);
  const relocated = { ...catalog, tracks: catalog.tracks.map((track) => ({ ...track, path: path.join(dir, track.fileName) })) };
  store.applyCatalog(relocated);
  assert.equal(fs.readdirSync(dir).filter((name) => name.endsWith('.bak')).length, 1);
  assert.equal(store.state.tracks[0].favorite, true);
  assert.equal(store.state.tracks[0].path, relocated.tracks[0].path);
});

test('catalog path traversal and absolute paths are rejected', () => {
  assert.throws(() => resolveCatalogPath(root, '../outside.mp3'));
  assert.throws(() => resolveCatalogPath(root, 'D:\\outside.mp3'));
});
