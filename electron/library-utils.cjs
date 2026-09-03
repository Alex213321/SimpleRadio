const crypto = require('node:crypto');
const path = require('node:path');
const { WALLPAPER_IDS } = require('./wallpapers.cjs');

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus']);

const DEFAULT_SETTINGS = Object.freeze({
  wallpaperId: 'anime-girl',
  wallpaperOpacity: 0.9,
  wallpaperDim: 0.48,
  wallpaperBlur: 0
});

function cleanText(value, fallback = '') {
  return String(value || fallback)
    .replace(/[_]+/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTrackFilename(filePath) {
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const partMatch = base.match(/(?:^|\s)p(\d{1,3})\s+\d{3}\.(.+?)(?:-BV[^\s]*_p\d+)?$/i);
  const order = partMatch ? Number(partMatch[1]) : Number.MAX_SAFE_INTEGER;
  let core = partMatch ? partMatch[2] : base;

  core = core
    .replace(/^\d{1,4}[.、\s-]+/, '')
    .replace(/-BV[\w-]+(?:_p\d+)?$/i, '')
    .replace(/_p\d+$/i, '')
    .trim();

  const divider = core.indexOf('-');
  let artist = divider > 0 ? core.slice(0, divider) : '未知艺术家';
  let title = divider > 0 ? core.slice(divider + 1) : core;
  artist = cleanText(artist, '未知艺术家');
  title = cleanText(title, '未知曲目');
  return { title, artist, order };
}

function createTrackId(filePath) {
  return crypto.createHash('sha1').update(path.resolve(filePath).toLowerCase()).digest('hex').slice(0, 24);
}

function createPlaylistId(sourcePath) {
  return `folder-${crypto.createHash('sha1').update(normalizePath(sourcePath)).digest('hex').slice(0, 16)}`;
}

function normalizePath(filePath) {
  return path.resolve(filePath).replace(/[\\/]+$/, '').toLowerCase();
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function normalizeSettings(settings = {}) {
  return {
    wallpaperId: WALLPAPER_IDS.has(settings.wallpaperId) ? settings.wallpaperId : DEFAULT_SETTINGS.wallpaperId,
    wallpaperOpacity: clamp(settings.wallpaperOpacity, 0.2, 1, DEFAULT_SETTINGS.wallpaperOpacity),
    wallpaperDim: clamp(settings.wallpaperDim, 0, 0.85, DEFAULT_SETTINGS.wallpaperDim),
    wallpaperBlur: clamp(settings.wallpaperBlur, 0, 18, DEFAULT_SETTINGS.wallpaperBlur)
  };
}

// Discard retired fields when loading older catalogs or saved libraries.
function stripRetiredTrackFields(track) {
  const { lyricsRaw, lyricsSource, lyricsReview, ...musicTrack } = track;
  return musicTrack;
}

function normalizePlayer(player = {}, validIds = new Set()) {
  const queueIds = Array.isArray(player.queueIds)
    ? player.queueIds.filter((id) => validIds.has(id)).slice(0, 10000)
    : [];
  const currentTrackId = validIds.has(player.currentTrackId) ? player.currentTrackId : null;
  return {
    currentTrackId,
    queueIds,
    queueIndex: Number.isInteger(player.queueIndex)
      ? Math.max(-1, Math.min(player.queueIndex, queueIds.length - 1))
      : -1,
    currentTime: clamp(player.currentTime, 0, 86400, 0),
    volume: clamp(player.volume, 0, 1, 0.78),
    muted: Boolean(player.muted),
    shuffle: false,
    repeat: player.repeat === 'one' ? 'one' : 'all',
    activeView: ['home', 'stage', 'favorites', 'recent'].includes(player.activeView) ? player.activeView : 'home'
  };
}

function createDefaultState() {
  return {
    schemaVersion: 2,
    tracks: [],
    playlists: [],
    player: normalizePlayer(),
    settings: { ...DEFAULT_SETTINGS },
    statistics: {
      totalListenedSeconds: 0,
      totalPlayCount: 0,
      lastListeningAt: null
    },
    updatedAt: new Date().toISOString()
  };
}

module.exports = {
  AUDIO_EXTENSIONS,
  DEFAULT_SETTINGS,
  cleanText,
  clamp,
  createDefaultState,
  createPlaylistId,
  createTrackId,
  normalizePath,
  normalizePlayer,
  normalizeSettings,
  stripRetiredTrackFields,
  parseTrackFilename
};
