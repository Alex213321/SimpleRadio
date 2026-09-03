const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');

const MIME_TYPES = Object.freeze({
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
});

function contentTypeForPath(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function parseByteRange(header, size) {
  if (typeof header !== 'string' || !Number.isFinite(size) || size <= 0) return null;
  const match = header.trim().match(/^bytes=(\d*)-(\d*)$/i);
  if (!match || (!match[1] && !match[2])) return null;
  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

function responseHeaders(filePath, length) {
  return new Headers({
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Length': String(length),
    'Content-Type': contentTypeForPath(filePath),
    'X-Content-Type-Options': 'nosniff'
  });
}

function createFileResponse(request, filePath) {
  const stat = fs.statSync(filePath);
  const rangeHeader = request.headers.get('range');
  const range = rangeHeader ? parseByteRange(rangeHeader, stat.size) : null;
  if (rangeHeader && !range) {
    return new Response(null, {
      status: 416,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes */${stat.size}`,
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }
  if (range) {
    const length = range.end - range.start + 1;
    const headers = responseHeaders(filePath, length);
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
    const body = request.method === 'HEAD' ? null : Readable.toWeb(fs.createReadStream(filePath, range));
    return new Response(body, { status: 206, headers });
  }
  const headers = responseHeaders(filePath, stat.size);
  const body = request.method === 'HEAD' ? null : Readable.toWeb(fs.createReadStream(filePath));
  return new Response(body, { status: 200, headers });
}

module.exports = { contentTypeForPath, createFileResponse, parseByteRange };
