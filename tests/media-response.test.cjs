const test = require('node:test');
const assert = require('node:assert/strict');
const { contentTypeForPath, parseByteRange } = require('../electron/media-response.cjs');

test('parses open, bounded and suffix byte ranges for seekable media', () => {
  assert.deepEqual(parseByteRange('bytes=100-', 1000), { start: 100, end: 999 });
  assert.deepEqual(parseByteRange('bytes=100-199', 1000), { start: 100, end: 199 });
  assert.deepEqual(parseByteRange('bytes=-120', 1000), { start: 880, end: 999 });
  assert.equal(parseByteRange('bytes=1000-', 1000), null);
  assert.equal(parseByteRange('bytes=2-1', 1000), null);
});

test('maps local audio and video files to explicit media types', () => {
  assert.equal(contentTypeForPath('track.mp3'), 'audio/mpeg');
  assert.equal(contentTypeForPath('track.flac'), 'audio/flac');
  assert.equal(contentTypeForPath('wallpaper.mp4'), 'video/mp4');
});
