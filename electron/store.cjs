const fs = require('node:fs');
const { migrateCatalogState } = require('./catalog.cjs');
const path = require('node:path');
const {
  createDefaultState,
  createPlaylistId,
  normalizePath,
  normalizePlayer,
  normalizeSettings,
  stripRetiredTrackFields
} = require('./library-utils.cjs');

class LibraryStore {
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, 'library.json');
    this.state = createDefaultState();
    this.playTokens = new Set();
    this.load();
  }

  load() {
    try {
      if (!fs.existsSync(this.filePath)) return this.state;
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      const defaults = createDefaultState();
      this.state = {
        ...defaults,
        ...raw,
        tracks: Array.isArray(raw.tracks) ? raw.tracks.map(stripRetiredTrackFields) : [],
        playlists: Array.isArray(raw.playlists) ? raw.playlists : [],
        settings: normalizeSettings(raw.settings),
        statistics: { ...defaults.statistics, ...(raw.statistics || {}) }
      };
      const ids = new Set(this.state.tracks.map((track) => track.id));
      this.state.player = normalizePlayer(raw.player, ids);
    } catch (error) {
      try { fs.copyFileSync(this.filePath, `${this.filePath}.broken-${Date.now()}`); } catch {}
      console.error('[store] failed to load state:', error);
      this.state = createDefaultState();
    }
    return this.state;
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.state.updatedAt = new Date().toISOString();
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(temporary, this.filePath);
  }

  applyCatalog(catalog) {
    const next = migrateCatalogState(this.state, catalog);
    if (this.state.catalogRevision !== catalog.revision && fs.existsSync(this.filePath)) {
      const backup = `${this.filePath}.before-catalog-${Date.now()}.bak`;
      fs.copyFileSync(this.filePath, backup);
    }
    this.state = next;
    this.save();
  }

  addTracks(incoming) {
    const existing = new Map(this.state.tracks.map((track) => [track.id, track]));
    let added = 0;
    for (const incomingTrack of incoming) {
      const track = stripRetiredTrackFields(incomingTrack);
      const previous = existing.get(track.id);
      if (previous) {
        existing.set(track.id, {
          ...previous,
          title: track.title || previous.title,
          artist: track.artist || previous.artist,
          album: track.album || previous.album,
          duration: track.duration || previous.duration,
          coverPath: track.coverPath || previous.coverPath,
          fingerprint: track.fingerprint || previous.fingerprint,
          order: Number.isFinite(track.order) ? track.order : previous.order
        });
      } else {
        existing.set(track.id, track);
        added += 1;
      }
    }
    this.state.tracks = [...existing.values()];
    this.save();
    return added;
  }

  trackIdsForFiles(files) {
    const wanted = new Set(files.map(normalizePath));
    return this.state.tracks
      .filter((track) => wanted.has(normalizePath(track.path)))
      .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
      .map((track) => track.id);
  }

  upsertFolderPlaylist(sourcePath, trackIds, options = {}) {
    const id = options.id || createPlaylistId(sourcePath);
    const now = new Date().toISOString();
    const previous = this.state.playlists.find((playlist) => playlist.id === id);
    const playlist = {
      id,
      name: String(options.name || path.basename(sourcePath) || '本地歌单').slice(0, 80),
      description: String(options.description || `${trackIds.length} 首本地音乐`).slice(0, 180),
      kind: options.kind || 'folder',
      sourcePath,
      colors: Array.isArray(options.colors) ? options.colors.slice(0, 2) : ['#bca7ff', '#6acfc0'],
      trackIds: [...new Set(trackIds)].slice(0, 10000),
      createdAt: previous?.createdAt || now,
      updatedAt: now
    };
    this.state.playlists = [playlist, ...this.state.playlists.filter((item) => item.id !== id)];
    this.save();
    return playlist;
  }

  setFavorite(trackId, favorite) {
    const track = this.state.tracks.find((item) => item.id === trackId);
    if (!track) return false;
    track.favorite = Boolean(favorite);
    this.save();
    return track.favorite;
  }

  savePlayer(player) {
    this.state.player = normalizePlayer(player, new Set(this.state.tracks.map((track) => track.id)));
    this.save();
    return this.state.player;
  }

  saveSettings(settings) {
    this.state.settings = normalizeSettings({ ...this.state.settings, ...settings });
    this.save();
    return this.state.settings;
  }

  recordListening(payload = {}) {
    const track = this.state.tracks.find((item) => item.id === payload.trackId);
    if (!track) return null;
    const now = new Date().toISOString();
    const seconds = Math.max(0, Math.min(30, Number(payload.seconds) || 0));
    if (seconds > 0) {
      track.listenedSeconds = Math.max(0, Number(track.listenedSeconds) || 0) + seconds;
      this.state.statistics.totalListenedSeconds = Math.max(0, Number(this.state.statistics.totalListenedSeconds) || 0) + seconds;
    }
    if (payload.started) {
      track.lastPlayedAt = now;
      this.state.statistics.lastListeningAt = now;
    }
    const token = String(payload.playToken || '').slice(0, 100);
    if (payload.markPlay && token && !this.playTokens.has(token)) {
      this.playTokens.add(token);
      if (this.playTokens.size > 300) this.playTokens.delete(this.playTokens.values().next().value);
      track.playCount = Math.max(0, Math.floor(Number(track.playCount) || 0)) + 1;
      this.state.statistics.totalPlayCount = Math.max(0, Math.floor(Number(this.state.statistics.totalPlayCount) || 0)) + 1;
    }
    this.save();
    return {
      trackId: track.id,
      playCount: track.playCount,
      listenedSeconds: track.listenedSeconds,
      lastPlayedAt: track.lastPlayedAt,
      statistics: this.state.statistics
    };
  }
}

module.exports = { LibraryStore };
