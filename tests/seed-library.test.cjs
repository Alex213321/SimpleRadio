const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { collectAudioFiles } = require('../electron/scanner.cjs');
const { parseTrackFilename } = require('../electron/library-utils.cjs');

const seedPath = path.resolve(__dirname, '..', '..', '周杰伦歌单');

test('the supplied seed directory contains exactly 50 MP3 files', async (t) => {
  if (!fs.existsSync(seedPath)) return t.skip('seed directory is not present');
  const files = await collectAudioFiles([seedPath]);
  assert.equal(files.length, 50);
  assert.ok(files.every((file) => path.extname(file).toLowerCase() === '.mp3'));
});

test('seed filenames produce 50 unique titles in part order', async (t) => {
  if (!fs.existsSync(seedPath)) return t.skip('seed directory is not present');
  const files = await collectAudioFiles([seedPath]);
  const parsed = files.map(parseTrackFilename).sort((a, b) => a.order - b.order);
  assert.equal(new Set(parsed.map((track) => track.title)).size, 50);
  assert.equal(parsed[0].title, '晴天');
  assert.equal(parsed.at(-1).title, '爱的飞行日记');
  assert.deepEqual(parsed.map((track) => track.order), Array.from({ length: 50 }, (_, index) => index + 1));
});
