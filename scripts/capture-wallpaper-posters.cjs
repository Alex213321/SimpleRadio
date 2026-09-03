// Developer build utility: capture one lightweight static preview from each image/video wallpaper.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { WALLPAPER_DEFINITIONS } = require('../electron/wallpapers.cjs');

const assetRoot = path.resolve(__dirname, '..', 'assets', 'wallpapers');

async function capturePoster(window, wallpaper) {
  const mediaUrl = pathToFileURL(path.join(assetRoot, wallpaper.fileName)).href;
  const isVideo = wallpaper.type === 'video';
  const media = isVideo
    ? `<video id="media" muted playsinline preload="auto" src="${mediaUrl}"></video>`
    : `<img id="media" src="${mediaUrl}" alt="">`;
  const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000;overflow:hidden}#media{width:320px;height:200px;object-fit:cover}</style>${media}`;
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  const dataUrl = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const media = document.querySelector('#media');
    const isVideo = ${isVideo};
    const timer = setTimeout(() => reject(new Error('wallpaper preview timeout')), 15000);
    const capture = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 200;
        const sourceWidth = isVideo ? media.videoWidth : media.naturalWidth;
        const sourceHeight = isVideo ? media.videoHeight : media.naturalHeight;
        const scale = Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight);
        const cropWidth = canvas.width / scale;
        const cropHeight = canvas.height / scale;
        const sourceX = (sourceWidth - cropWidth) / 2;
        const sourceY = (sourceHeight - cropHeight) / 2;
        canvas.getContext('2d').drawImage(media, sourceX, sourceY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
        clearTimeout(timer);
        resolve(canvas.toDataURL('image/jpeg', .86));
      } catch (error) { clearTimeout(timer); reject(error); }
    };
    const prepare = () => {
      if (!isVideo) return capture();
      const target = Number.isFinite(media.duration) && media.duration > 0 ? Math.min(.8, media.duration * .04) : 0;
      if (target <= .03) return capture();
      media.addEventListener('seeked', capture, { once: true });
      media.currentTime = target;
    };
    media.addEventListener('error', () => reject(media.error || new Error('wallpaper decode failed')), { once: true });
    if ((isVideo && media.readyState >= 2) || (!isVideo && media.complete && media.naturalWidth)) prepare();
    else media.addEventListener(isVideo ? 'loadeddata' : 'load', prepare, { once: true });
  })`);
  const bytes = Buffer.from(dataUrl.replace(/^data:image\/jpeg;base64,/, ''), 'base64');
  fs.writeFileSync(path.join(assetRoot, wallpaper.posterFileName), bytes);
  console.log(`${wallpaper.name}: ${wallpaper.posterFileName} (${bytes.length} bytes)`);
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 320,
    height: 200,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: false }
  });
  try {
    for (const wallpaper of WALLPAPER_DEFINITIONS.filter((item) => item.posterFileName)) {
      await capturePoster(window, wallpaper);
    }
  } finally {
    window.destroy();
    app.quit();
  }
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
