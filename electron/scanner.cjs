const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { AUDIO_EXTENSIONS, createTrackId, normalizePath, parseTrackFilename } = require('./library-utils.cjs');

async function collectAudioFiles(inputs) {
  const files = [];
  const pending = [...inputs];
  while (pending.length) {
    const current = pending.shift();
    let stats;
    try { stats = await fs.stat(current); } catch { continue; }
    if (stats.isDirectory()) {
      let entries = [];
      try { entries = await fs.readdir(current, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) {
        if (!entry.name.startsWith('.')) pending.push(path.join(current, entry.name));
      }
    } else if (stats.isFile() && AUDIO_EXTENSIONS.has(path.extname(current).toLowerCase())) {
      files.push(path.resolve(current));
    }
    if (files.length >= 10000) break;
  }
  return [...new Map(files.map((file) => [normalizePath(file), file])).values()];
}

async function loadMetadataModule() {
  try { return await import('music-metadata'); } catch (error) {
    console.warn('[scanner] music-metadata unavailable:', error.message);
    return null;
  }
}

async function saveCover(picture, coversPath, trackId) {
  if (!picture?.data || picture.data.length > 5 * 1024 * 1024) return null;
  const mime = String(picture.format || '').toLowerCase();
  const ext = mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : '.jpg';
  await fs.mkdir(coversPath, { recursive: true });
  const coverPath = path.join(coversPath, `${trackId}${ext}`);
  await fs.writeFile(coverPath, picture.data);
  return coverPath;
}

async function scanAudioFiles(inputs, options = {}) {
  const files = await collectAudioFiles(inputs);
  const metadataModule = await loadMetadataModule();
  const existingPaths = options.existingPaths || new Set();
  const importedAt = new Date().toISOString();
  const tracks = [];
  let skipped = 0;
  let failed = 0;

  for (const filePath of files) {
    const wasExisting = existingPaths.has(normalizePath(filePath));
    if (wasExisting) skipped += 1;
    const fallback = parseTrackFilename(filePath);
    const id = createTrackId(filePath);
    try {
      let metadata = null;
      if (metadataModule) {
        try { metadata = await metadataModule.parseFile(filePath, { duration: true, skipCovers: false }); } catch {}
      }
      const common = metadata?.common || {};
      const format = metadata?.format || {};
      const title = String(common.title || fallback.title).trim();
      const artist = String(common.artist || fallback.artist).trim();
      let coverPath = null;
      if (options.coversPath && common.picture?.[0]) {
        try { coverPath = await saveCover(common.picture[0], options.coversPath, id); } catch {}
      }
      tracks.push({
        id,
        path: filePath,
        fileName: path.basename(filePath),
        title: title || fallback.title,
        artist: artist || fallback.artist,
        album: String(common.album || (artist.includes('周杰伦') ? '周杰伦精选' : path.basename(path.dirname(filePath)) || '本地音乐')).trim(),
        duration: Number.isFinite(format.duration) ? Math.round(format.duration * 1000) / 1000 : 0,
        coverPath,
        order: fallback.order,
        addedAt: importedAt,
        lastPlayedAt: null,
        playCount: 0,
        listenedSeconds: 0,
        favorite: false,
        fingerprint: crypto.createHash('sha1').update(`${filePath}:${format.size || 0}`).digest('hex').slice(0, 16)
      });
    } catch (error) {
      console.error('[scanner] failed:', filePath, error);
      failed += 1;
    }
  }

  tracks.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'zh-CN'));
  return { tracks, files, total: files.length, skipped, failed };
}

module.exports = { collectAudioFiles, scanAudioFiles };
