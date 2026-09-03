const fs = require('node:fs');
const path = require('node:path');
const { cleanText, parseTrackFilename, normalizePlayer, normalizeSettings, stripRetiredTrackFields } = require('./library-utils.cjs');

const COLLECTIONS = [
  { id: 'seed-jay-50', key: 'jay', folder: '周杰伦歌单', count: 50, format: 'jay', name: '周杰伦 · 50 首精选', album: '周杰伦精选', eyebrow: 'SIGNATURE COLLECTION', description: '五十段熟悉旋律，组成 SimpleRadio 的第一张本地歌单。', colors: ['#cf7d9a', '#7665cb'] },
  { id: 'seed-chen-6', key: 'chen', folder: '陈楚生歌单', count: 6, format: 'quoted', artist: '陈楚生', name: '陈楚生 · 风起时', album: '陈楚生精选', eyebrow: 'VOICE IN THE WIND', description: '把故事唱进风里，在温柔而坚定的声音中，慢慢靠岸。', colors: ['#e7b56e', '#315069'], variant: 'wind' },
  { id: 'seed-mandarin-100', key: 'mandarin', folder: '经典华语歌曲', count: 100, format: 'title-artist', name: '经典华语 · 时光留声', album: '经典华语歌曲', eyebrow: 'MANDARIN MEMORIES', description: '一百首耳熟能详的旋律，把青春、相遇与想念重新播放。', colors: ['#d48770', '#9864a4'] },
  { id: 'seed-english-40', key: 'english', folder: '经典英语歌曲', count: 40, format: 'title-artist', name: '经典英语 · 漫游耳畔', album: '经典英语歌曲', eyebrow: 'TIMELESS ENGLISH', description: '从轻快心跳到深夜独白，让四十首旋律陪你自由漫游。', colors: ['#6c9fd2', '#517caa'] },
  { id: 'seed-mao-15', key: 'mao', folder: '毛不易歌单', count: 15, format: 'quoted', artist: '毛不易', name: '毛不易 · 人间小事', album: '毛不易精选', eyebrow: 'STORIES OF EVERYDAY', description: '一荤一素，一程山路，把平凡日子里未说出口的话唱给你听。', colors: ['#83aa8d', '#bd9c6b'] },
  { id: 'seed-tao-23', key: 'tao', folder: '陶喆歌单', count: 23, format: 'title-artist', name: '陶喆 · 灵魂留声', album: '陶喆精选', eyebrow: 'SOULFUL DAVID', description: '二十三首经典，把 R&B 的律动、温柔与锋芒收进一张私藏唱片。', colors: ['#d95f79', '#57458d'], variant: 'soft-glow' },
  { id: 'seed-medley-3', key: 'medley', folder: '歌曲串烧', count: 3, format: 'compilation', name: '精选串烧 · 一次听尽', album: '长篇串烧精选', eyebrow: 'LONG PLAY SESSIONS', description: '三段长篇连播，从中文 R&B 到现场热浪与游戏声场，一次沉浸到底。', colors: ['#39bcae', '#3c6fc3'], variant: 'horizon-glow' }
];

const COMPILATION_TRACKS = Object.freeze({
  '中文R&B音乐合集': { order: 1, title: '中文 R&B · 音乐合集', artist: '群星' },
  '宝石GEM现场合集': { order: 2, title: '宝石 GEM · 现场合集', artist: '宝石 GEM' },
  '无畏契约音乐合集': { order: 3, title: '无畏契约 · 音乐合集', artist: '群星' }
});

function parseCuratedFilename(filePath, collection) {
  const base = path.basename(filePath, path.extname(filePath));
  let result;
  if (collection.format === 'jay') result = parseTrackFilename(filePath);
  else if (collection.format === 'title-artist') {
    const match = base.match(/^(\d+)\.\s*(.+?)\s*-\s*(.+)$/);
    if (!match) throw new Error(`无法整理歌曲名称：${base}`);
    result = { order: Number(match[1]), title: match[2], artist: match[3] };
  } else if (collection.format === 'compilation') {
    result = COMPILATION_TRACKS[base];
    if (!result) throw new Error(`无法整理串烧名称：${base}`);
  } else {
    // The outer title brackets may contain a film title in another pair of brackets.
    const begin = base.indexOf('《');
    const end = base.lastIndexOf('》');
    if (begin < 0 || end <= begin) throw new Error(`无法整理歌曲名称：${base}`);
    const prefix = base.slice(0, begin);
    const artistStart = prefix.indexOf(collection.artist);
    result = {
      title: base.slice(begin + 1, end).replace(/[（(].*?[）)]/g, '').trim(),
      artist: artistStart >= 0 ? prefix.slice(artistStart).trim() : collection.artist,
      order: Number.MAX_SAFE_INTEGER
    };
  }
  return { ...result, title: cleanText(result.title), artist: cleanText(result.artist.replace(/[&、]/g, ' / ')), album: collection.album };
}

function resolveCatalogPath(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw new Error('曲库资源路径无效');
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('曲库资源路径越界');
  return resolved;
}

function loadCatalog(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.tracks) || !Array.isArray(manifest.playlists)) throw new Error('内置曲库清单无效');
  const ids = new Set();
  const tracks = manifest.tracks.map((track) => {
    if (ids.has(track.id)) throw new Error(`重复歌曲编号：${track.id}`);
    ids.add(track.id);
    const filePath = resolveCatalogPath(root, track.mediaPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size !== track.size) throw new Error(`内置歌曲缺失或损坏：${track.title}`);
    return { ...stripRetiredTrackFields(track), path: filePath, coverPath: track.coverFile ? resolveCatalogPath(root, track.coverFile) : null };
  });
  for (const collection of COLLECTIONS) {
    const playlist = manifest.playlists.find((item) => item.id === collection.id);
    if (!playlist || playlist.trackIds.length !== collection.count || new Set(playlist.trackIds).size !== collection.count || playlist.trackIds.some((id) => !ids.has(id))) throw new Error(`歌单不完整：${collection.folder}`);
  }
  if (tracks.length !== COLLECTIONS.reduce((sum, item) => sum + item.count, 0) || manifest.playlists.length !== COLLECTIONS.length) throw new Error('内置曲库数量不符');
  return { ...manifest, tracks };
}

function migrateCatalogState(state, catalog) {
  const oldTracks = Array.isArray(state.tracks) ? state.tracks : [];
  const idMap = new Map();
  const matched = new Set();
  const tracks = catalog.tracks.map((track) => {
    // Match the original file or canonical ID, never merge equal titles across playlists.
    const old = oldTracks.find((item) => !matched.has(item.id) && (item.id === track.id
      || track.legacyIds?.includes(item.id)
      || ((item.sourceFileName || path.basename(item.path || '')) === track.sourceFileName
        && (item.collectionId === track.collectionId || path.basename(path.dirname(item.path || '')) === track.sourceFolder))));
    if (old) { matched.add(old.id); idMap.set(old.id, track.id); }
    return { ...stripRetiredTrackFields(track),
      favorite: Boolean(old?.favorite),
      playCount: Math.max(0, Number(old?.playCount) || 0),
      listenedSeconds: Math.max(0, Number(old?.listenedSeconds) || 0),
      lastPlayedAt: old?.lastPlayedAt || null,
      addedAt: old?.addedAt || catalog.createdAt
    };
  });
  const mapId = (id) => idMap.get(id) || (tracks.some((track) => track.id === id) ? id : null);
  const currentTrackId = mapId(state.player?.currentTrackId);
  const queueIds = (state.player?.queueIds || []).map(mapId).filter(Boolean);
  const player = normalizePlayer({ ...state.player, currentTrackId, queueIds,
    currentTime: currentTrackId ? state.player?.currentTime : 0,
    queueIndex: currentTrackId ? queueIds.indexOf(currentTrackId) : -1
  }, new Set(tracks.map((track) => track.id)));
  return { ...state, schemaVersion: 3, catalogRevision: catalog.revision, tracks,
    playlists: catalog.playlists.map((playlist) => ({ ...playlist, kind: 'curated' })),
    player, settings: normalizeSettings(state.settings),
    // Lifetime listening totals are retained even if a replaced track has no match.
    statistics: { ...state.statistics }
  };
}

module.exports = { COLLECTIONS, parseCuratedFilename, resolveCatalogPath, loadCatalog, migrateCatalogState };
