const { app, BrowserWindow, dialog, ipcMain, Menu, protocol, shell, Tray } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { LibraryStore } = require('./store.cjs');
const { loadCatalog } = require('./catalog.cjs');
const { createFileResponse } = require('./media-response.cjs');
const { WALLPAPER_DEFINITIONS } = require('./wallpapers.cjs');

// Isolate automated QA from the listener's library and settings.
if (process.env.SIMPLERADIO_TEST_USER_DATA && (process.env.SIMPLERADIO_SMOKE_REPORT || process.env.SIMPLERADIO_SCREENSHOT_PATH)) {
  app.setPath('userData', path.resolve(process.env.SIMPLERADIO_TEST_USER_DATA));
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'simple-radio',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true
    }
  },
  {
    scheme: 'simple-wallpaper',
    privileges: {
      standard: true,
      secure: true,
      stream: true
    }
  }
]);

let mainWindow = null;
let tray = null;
let isQuitting = false;
let lastTrayReveal = { guarded: false, framePrepared: false };
let store = null;
let wallpaperRegistryCache = null;

function projectAssetPath(...parts) {
  if (!app.isPackaged) return path.join(__dirname, '..', ...parts);
  const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked', ...parts);
  if (fs.existsSync(unpacked)) return unpacked;
  return path.join(app.getAppPath(), ...parts);
}

function stableWallpaperPath(fileName) {
  const sourcePath = app.isPackaged
    ? path.join(app.getAppPath(), 'assets', 'wallpapers', fileName)
    : projectAssetPath('assets', 'wallpapers', fileName);
  if (!app.isPackaged || !fs.existsSync(sourcePath)) return sourcePath;
  try {
    const destinationDirectory = path.join(app.getPath('userData'), 'built-in-wallpapers');
    const destinationPath = path.join(destinationDirectory, fileName);
    const temporaryPath = `${destinationPath}.tmp`;
    fs.mkdirSync(destinationDirectory, { recursive: true });
    const sourceSize = fs.statSync(sourcePath).size;
    const destinationSize = fs.existsSync(destinationPath) ? fs.statSync(destinationPath).size : -1;
    if (sourceSize !== destinationSize) {
      fs.writeFileSync(temporaryPath, fs.readFileSync(sourcePath));
      fs.renameSync(temporaryPath, destinationPath);
    }
    return destinationPath;
  } catch (error) {
    console.error('[wallpaper-copy]', error);
    return sourcePath;
  }
}

function wallpaperRegistry() {
  if (wallpaperRegistryCache) return wallpaperRegistryCache;
  wallpaperRegistryCache = WALLPAPER_DEFINITIONS.map((wallpaper) => ({
    ...wallpaper,
    ...(wallpaper.fileName ? { filePath: stableWallpaperPath(wallpaper.fileName) } : {}),
    ...(wallpaper.posterFileName ? { posterPath: stableWallpaperPath(wallpaper.posterFileName) } : {})
  }));
  return wallpaperRegistryCache;
}

function protocolUrl(kind, id) {
  return `simple-radio://${kind}/${encodeURIComponent(id)}`;
}

function wallpaperProtocolUrl(id, kind = 'asset') {
  return `simple-wallpaper://${kind}/${encodeURIComponent(id)}`;
}

function publicState() {
  return {
    ...store.state,
    tracks: store.state.tracks.map(({ path: filePath, coverPath, fingerprint, ...track }) => ({
      ...track,
      mediaUrl: protocolUrl('track', track.id),
      coverUrl: coverPath ? protocolUrl('cover', track.id) : null,
      available: fs.existsSync(filePath)
    })),
    wallpapers: wallpaperRegistry().map(({ filePath, posterPath, ...wallpaper }) => ({
      ...wallpaper,
      mediaUrl: filePath ? wallpaperProtocolUrl(wallpaper.id) : null,
      previewUrl: posterPath && fs.existsSync(posterPath) ? wallpaperProtocolUrl(wallpaper.id, 'preview') : null,
      available: !filePath || fs.existsSync(filePath)
    }))
  };
}

function initializeCatalog() {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, 'music-library')
    : path.resolve(__dirname, '..', 'bundled-library');
  store.applyCatalog(loadCatalog(root));
}

function registerMediaProtocol() {
  protocol.handle('simple-radio', async (request) => {
    let targetPath = null;
    try {
      const url = new URL(request.url);
      const kind = url.hostname;
      const id = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      if (kind === 'track' || kind === 'cover') {
        const track = store.state.tracks.find((item) => item.id === id);
        targetPath = kind === 'track' ? track?.path : track?.coverPath;
      }
      if (!targetPath || !fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
        return new Response('Not found', { status: 404, headers: { 'X-Content-Type-Options': 'nosniff' } });
      }
      return createFileResponse(request, targetPath);
    } catch (error) {
      console.error('[protocol]', error);
      return new Response('Unable to read media', { status: 500 });
    }
  });
}

function registerWallpaperProtocol() {
  const registered = protocol.registerFileProtocol('simple-wallpaper', (request, callback) => {
    try {
      const url = new URL(request.url);
      const id = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      const wallpaper = wallpaperRegistry().find((item) => item.id === id);
      const targetPath = url.hostname === 'preview' ? wallpaper?.posterPath : wallpaper?.filePath;
      if (!targetPath || !fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) return callback({ error: -6 });
      callback({ path: targetPath });
    } catch {
      callback({ error: -6 });
    }
  });
  if (!registered) throw new Error('无法注册动态壁纸文件协议');
}

async function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
    mainWindow.focus();
    return;
  }
  const canGuardOpacity = process.platform === 'win32';
  if (canGuardOpacity) mainWindow.setOpacity(0);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  let framePrepared = false;
  try {
    framePrepared = await Promise.race([
      mainWindow.webContents.executeJavaScript(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))`),
      new Promise((resolve) => setTimeout(() => resolve(false), 180))
    ]);
  } catch {
    framePrepared = false;
  }
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (canGuardOpacity) mainWindow.setOpacity(1);
  mainWindow.focus();
  lastTrayReveal = { guarded: canGuardOpacity, framePrepared: Boolean(framePrepared) };
}

function createTray() {
  if (tray) return;
  const trayIcon = projectAssetPath('assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
  tray = new Tray(trayIcon);
  tray.setToolTip('SimpleRadio');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 SimpleRadio', click: showMainWindow },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } }
  ]));
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 930,
    minWidth: 960,
    minHeight: 680,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    icon: projectAssetPath('assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximized', true));
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximized', false));
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
    if (process.platform === 'win32') mainWindow.setOpacity(0);
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (!target.startsWith('file://')) event.preventDefault();
  });

  if (process.argv.includes('--dev')) mainWindow.webContents.openDevTools({ mode: 'detach' });

  const screenshotPath = process.env.SIMPLERADIO_SCREENSHOT_PATH;
  const smokeReport = process.env.SIMPLERADIO_SMOKE_REPORT;
  if (screenshotPath || smokeReport) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        let trayHiddenByClose = null;
        try {
          if (process.env.SIMPLERADIO_SMOKE_ENTER === '1') {
            await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-enter-app]')?.click()`);
            await new Promise((resolve) => setTimeout(resolve, 900));
          }
          if (process.env.SIMPLERADIO_SMOKE_PLAY === '1') {
            await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-play-playlist=' + ${JSON.stringify(process.env.SIMPLERADIO_SMOKE_PLAYLIST || 'seed-jay-50')} + ']')?.click()`);
            await new Promise((resolve) => setTimeout(resolve, 2500));
          }
          if (process.env.SIMPLERADIO_SMOKE_CURRENT_STAGE === '1') {
            await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-open-current-stage]')?.click()`);
            await new Promise((resolve) => setTimeout(resolve, 1200));
          }
          if (['home', 'stage', 'favorites', 'recent'].includes(process.env.SIMPLERADIO_SMOKE_VIEW)) {
            const smokeView = JSON.stringify(process.env.SIMPLERADIO_SMOKE_VIEW);
            await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-view=' + ${smokeView} + ']')?.click()`);
            await new Promise((resolve) => setTimeout(resolve, 1200));
          }
          if (process.env.SIMPLERADIO_SMOKE_SEARCH) {
            const smokeSearch = JSON.stringify(process.env.SIMPLERADIO_SMOKE_SEARCH);
            await mainWindow.webContents.executeJavaScript(`(() => { const input = document.querySelector('#searchInput'); input.focus(); input.value = ${smokeSearch}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
            await new Promise((resolve) => setTimeout(resolve, 700));
          }
          if (process.env.SIMPLERADIO_SMOKE_TOGGLE_STAGE_COUNT) {
            const count = Math.max(0, Math.min(4, Number(process.env.SIMPLERADIO_SMOKE_TOGGLE_STAGE_COUNT) || 0));
            for (let index = 0; index < count; index += 1) {
              await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-toggle-stage]')?.click()`);
              await new Promise((resolve) => setTimeout(resolve, 350));
            }
          }
          if (process.env.SIMPLERADIO_SMOKE_TOGGLE_REPEAT_COUNT) {
            const count = Math.max(0, Math.min(4, Number(process.env.SIMPLERADIO_SMOKE_TOGGLE_REPEAT_COUNT) || 0));
            for (let index = 0; index < count; index += 1) {
              await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-player="repeat"]')?.click()`);
              await new Promise((resolve) => setTimeout(resolve, 250));
            }
          }
          if (process.env.SIMPLERADIO_SMOKE_DRAG_PROGRESS) {
            const ratio = Math.max(0.05, Math.min(0.95, Number(process.env.SIMPLERADIO_SMOKE_DRAG_PROGRESS) || 0.5));
            mainWindow.show();
            mainWindow.focus();
            await new Promise((resolve) => setTimeout(resolve, 250));
            const rect = await mainWindow.webContents.executeJavaScript(`(() => { const box = document.querySelector('#progress').getBoundingClientRect(); return { left: box.left, top: box.top, width: box.width, height: box.height }; })()`);
            const startX = Math.round(rect.left + rect.width * 0.08);
            const endX = Math.round(rect.left + rect.width * ratio);
            const y = Math.round(rect.top + rect.height / 2);
            mainWindow.webContents.sendInputEvent({ type: 'mouseDown', x: startX, y, button: 'left', clickCount: 1 });
            await new Promise((resolve) => setTimeout(resolve, 80));
            for (let step = 1; step <= 6; step += 1) {
              mainWindow.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(startX + (endX - startX) * step / 6), y, button: 'left' });
              await new Promise((resolve) => setTimeout(resolve, 55));
            }
            mainWindow.webContents.sendInputEvent({ type: 'mouseUp', x: endX, y, button: 'left', clickCount: 1 });
            await new Promise((resolve) => setTimeout(resolve, 250));
            await mainWindow.webContents.executeJavaScript(`(() => {
              const input = document.querySelector('#progress');
              const box = input.getBoundingClientRect();
              const start = box.left + box.width * 0.08;
              const end = box.left + box.width * ${ratio};
              input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 91, button: 0, clientX: start }));
              input.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 91, button: 0, clientX: end }));
              input.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 91, button: 0, clientX: end }));
            })()`);
            await new Promise((resolve) => setTimeout(resolve, 900));
          }
          if (process.env.SIMPLERADIO_SMOKE_SET_CURRENT_TIME) {
            const target = Math.max(0, Number(process.env.SIMPLERADIO_SMOKE_SET_CURRENT_TIME) || 0);
            await mainWindow.webContents.executeJavaScript(`document.querySelector('#audio').currentTime = ${target}`);
            await new Promise((resolve) => setTimeout(resolve, 900));
          }
          if (process.env.SIMPLERADIO_SMOKE_FAVORITES_PLAY_ALL === '1') {
            await mainWindow.webContents.executeJavaScript(`(() => { const heart = document.querySelector('#favoriteButton'); if (!heart.classList.contains('active')) heart.click(); })()`);
            await new Promise((resolve) => setTimeout(resolve, 400));
            await mainWindow.webContents.executeJavaScript(`document.querySelector('.floating-rail [data-view="favorites"]')?.click()`);
            await new Promise((resolve) => setTimeout(resolve, 350));
            await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-play-favorites]')?.click()`);
            await new Promise((resolve) => setTimeout(resolve, 1200));
          }
          if (process.env.SIMPLERADIO_SMOKE_WALLPAPER) {
            const wallpaperId = JSON.stringify(process.env.SIMPLERADIO_SMOKE_WALLPAPER);
            await mainWindow.webContents.executeJavaScript(`[...document.querySelectorAll('[data-wallpaper]')].find((item) => item.dataset.wallpaper === ${wallpaperId})?.click()`);
            await new Promise((resolve) => setTimeout(resolve, 700));
          }
          if (process.env.SIMPLERADIO_SMOKE_CONTROLS_ALL_VIEWS === '1') {
            for (const view of ['home', 'stage', 'favorites', 'recent']) {
              await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-view="${view}"]')?.click()`);
              await new Promise((resolve) => setTimeout(resolve, 100));
              await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-open-controls]')?.click()`);
              await new Promise((resolve) => setTimeout(resolve, 320));
              await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-close-controls]')?.click()`);
              await new Promise((resolve) => setTimeout(resolve, 140));
            }
            await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-view="home"]')?.click()`);
          }
          if (process.env.SIMPLERADIO_SMOKE_CONTROLS === '1') {
            await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-open-controls]')?.click()`);
            await new Promise((resolve) => setTimeout(resolve, 700));
          }
          if (process.env.SIMPLERADIO_SMOKE_CONTROLS_SCROLL_BOTTOM === '1') {
            await mainWindow.webContents.executeJavaScript(`(() => { const panel = document.querySelector('#controlPanel'); panel.scrollTop = panel.scrollHeight; })()`);
            await new Promise((resolve) => setTimeout(resolve, 700));
          }
          if (process.env.SIMPLERADIO_SMOKE_OPEN_PLAYLIST) {
            const playlistId = JSON.stringify(process.env.SIMPLERADIO_SMOKE_OPEN_PLAYLIST);
            await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-open-playlist=' + ${playlistId} + ']')?.click()`);
            await new Promise((resolve) => setTimeout(resolve, 400));
          }
          if (process.env.SIMPLERADIO_SMOKE_SELECT_DIALOG_INDEX) {
            const index = Math.max(0, Number(process.env.SIMPLERADIO_SMOKE_SELECT_DIALOG_INDEX) || 0);
            await mainWindow.webContents.executeJavaScript(`document.querySelectorAll('#dialogTracks [data-play-track]')[${index}]?.click()`);
            await new Promise((resolve) => setTimeout(resolve, 1200));
          }
          if (process.env.SIMPLERADIO_SMOKE_PLAY_DIALOG_COUNT) {
            const count = Math.max(0, Math.min(20, Number(process.env.SIMPLERADIO_SMOKE_PLAY_DIALOG_COUNT) || 0));
            for (let index = 0; index < count; index += 1) {
              await mainWindow.webContents.executeJavaScript(`document.querySelectorAll('#dialogTracks [data-play-track]')[${index}]?.click()`);
              await new Promise((resolve) => setTimeout(resolve, 420));
            }
          }
          if (process.env.SIMPLERADIO_SMOKE_TRAY_CLOSE === '1') {
            await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-window="close"]')?.click()`);
            await new Promise((resolve) => setTimeout(resolve, 500));
            trayHiddenByClose = Boolean(tray && mainWindow && !mainWindow.isVisible());
            await showMainWindow();
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
          if (process.env.SIMPLERADIO_SMOKE_AUDIT === '1') {
            await mainWindow.webContents.executeJavaScript(`window.__auditCatalogMedia()`);
          }
          if (smokeReport) {
            const report = await mainWindow.webContents.executeJavaScript(`window.__simpleRadioSmokeReport?.()`);
            report.desktopShell = {
              trayExists: Boolean(tray),
              trayHiddenByClose,
              visibleAfterRestore: Boolean(mainWindow?.isVisible()),
              opacityAfterRestore: mainWindow?.getOpacity(),
              revealGuard: lastTrayReveal
            };
            fs.writeFileSync(path.resolve(smokeReport), JSON.stringify(report || {}, null, 2));
          }
          if (screenshotPath) {
            const image = await mainWindow.webContents.capturePage();
            fs.writeFileSync(path.resolve(screenshotPath), image.toPNG());
          }
        } catch (error) {
          console.error('[smoke]', error);
        } finally {
          app.quit();
        }
      }, 3800);
    });
  }
}

function trustedSender(event) {
  return Boolean(mainWindow && event.sender === mainWindow.webContents && !event.senderFrame.parent);
}

function registerIpc() {
  ipcMain.handle('state:get', (event) => trustedSender(event) ? publicState() : null);

  ipcMain.handle('library:reveal', (event, trackId) => {
    if (!trustedSender(event) || typeof trackId !== 'string') return false;
    const track = store.state.tracks.find((item) => item.id === trackId);
    if (track?.path) shell.showItemInFolder(track.path);
    return Boolean(track?.path);
  });

  ipcMain.handle('track:favorite', (event, payload) => {
    if (!trustedSender(event) || !payload || typeof payload.trackId !== 'string') return false;
    return store.setFavorite(payload.trackId, payload.favorite);
  });

  ipcMain.handle('player:save', (event, player) => trustedSender(event) ? store.savePlayer(player) : null);
  ipcMain.on('player:save-now', (event, player) => { if (trustedSender(event)) store.savePlayer(player); });
  ipcMain.handle('settings:save', (event, settings) => trustedSender(event) ? store.saveSettings(settings) : null);
  ipcMain.handle('stats:record', (event, payload) => trustedSender(event) ? store.recordListening(payload) : null);
  ipcMain.on('stats:record-now', (event, payload) => { if (trustedSender(event)) store.recordListening(payload); });

  ipcMain.handle('window:minimize', (event) => { if (trustedSender(event)) mainWindow?.minimize(); });
  ipcMain.handle('window:toggle-maximize', (event) => {
    if (!trustedSender(event) || !mainWindow) return false;
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle('window:close', (event) => { if (trustedSender(event)) mainWindow?.close(); });
}

const gotLock = app.requestSingleInstanceLock();
app.on('before-quit', () => { isQuitting = true; });
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });

  app.whenReady().then(async () => {
    store = new LibraryStore(app.getPath('userData'));
    registerMediaProtocol();
    registerWallpaperProtocol();
    registerIpc();
    try { initializeCatalog(); } catch (error) {
      console.error('[catalog]', error);
      dialog.showErrorBox('内置曲库无法加载', '请重新安装完整的 SimpleRadio。原来的收藏与听歌记录未被替换。\n\n' + error.message);
      app.quit();
      return;
    }
    createWindow();
    createTray();
    app.on('activate', showMainWindow);
  });
}

app.on('window-all-closed', () => {});
