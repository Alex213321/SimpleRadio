// Developer-only build step: never exposed by the desktop renderer.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { scanAudioFiles } = require('../electron/scanner.cjs');
const { COLLECTIONS, parseCuratedFilename } = require('../electron/catalog.cjs');

async function prepareCatalog() {
  const project = path.resolve(__dirname, '..');
  const root = path.join(project, 'bundled-library');
  fs.mkdirSync(root, { recursive: true });
  const tracks = [];
  const playlists = [];
  for (const collection of COLLECTIONS) {
    const source = path.resolve(project, '..', collection.folder);
    const result = await scanAudioFiles([source], { coversPath: path.join(root, 'covers') });
    if (result.failed || result.tracks.length !== collection.count) throw new Error(`${collection.folder}：预期 ${collection.count} 首，实际 ${result.tracks.length} 首，失败 ${result.failed}`);
    const parsed = result.tracks.map((track) => ({ ...track, ...parseCuratedFilename(track.path, collection) }))
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'zh-CN'));
    const trackIds = [];
    for (let index = 0; index < parsed.length; index += 1) {
      const track = parsed[index];
      if (!(track.duration > 0)) throw new Error(`无法读取音频时长：${track.path}`);
      const ordinal = String(index + 1).padStart(3, '0');
      const id = `builtin-${collection.key}-${ordinal}`;
      const fileName = `${ordinal}. ${track.title} - ${track.artist}`.replace(/[<>:"/\\|?*]/g, '·') + path.extname(track.path);
      const mediaPath = `${collection.key}/${fileName}`;
      const destination = path.join(root, mediaPath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const size = fs.statSync(track.path).size;
      // Never rename or modify originals. Copy only the release-owned resource.
      const bytes = fs.readFileSync(track.path);
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      if (!fs.existsSync(destination) || crypto.createHash('sha256').update(fs.readFileSync(destination)).digest('hex') !== sha256) fs.copyFileSync(track.path, destination);
      tracks.push({ id, collectionId: collection.id, sourceFolder: collection.folder, sourceFileName: track.fileName,
        legacyIds: [track.id], fileName, title: track.title, artist: track.artist, album: collection.album,
        order: index + 1, duration: track.duration, size, sha256, mediaPath,
        coverFile: track.coverPath ? path.relative(root, track.coverPath).replace(/\\/g, '/') : null });
      trackIds.push(id);
    }
    const { format, artist, key, count, folder, album, ...presentation } = collection;
    playlists.push({ ...presentation, sourceFolder: folder, kind: 'curated', trackIds });
    console.log(`${collection.name}: ${trackIds.length} 首`);
  }
  const revision = crypto.createHash('sha256').update(JSON.stringify({ tracks, playlists })).digest('hex').slice(0, 16);
  const manifest = { version: 1, revision, createdAt: new Date().toISOString(), tracks, playlists };
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`已生成 ${playlists.length} 张歌单 / ${tracks.length} 首，内置音频 ${(tracks.reduce((sum, track) => sum + track.size, 0) / 1024 ** 3).toFixed(2)} GiB`);
}

prepareCatalog().catch((error) => { console.error(error); process.exitCode = 1; });
