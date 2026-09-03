(function bootstrapSimpleRadio() {
  'use strict';

  const bridge = window.simpleRadio;
  const app = document.querySelector('#app');
  const audio = document.querySelector('#audio');
  const refs = {
    homeView: document.querySelector('#homeView'),
    stageView: document.querySelector('#stageView'),
    favoritesView: document.querySelector('#favoritesView'),
    recentView: document.querySelector('#recentView'),
    nowCard: document.querySelector('#nowCard'),
    statCard: document.querySelector('#statCard'),
    favoriteSummary: document.querySelector('#favoriteSummary'),
    recentSummary: document.querySelector('#recentSummary'),
    playlistGrid: document.querySelector('#playlistGrid'),
    topTracks: document.querySelector('#topTracks'),
    favoritesPageList: document.querySelector('#favoritesPageList'),
    recentPageList: document.querySelector('#recentPageList'),
    favoritesPageCount: document.querySelector('#favoritesPageCount'),
    recentPageCount: document.querySelector('#recentPageCount'),
    favoritesPlayAll: document.querySelector('#favoritesPlayAll'),
    searchInput: document.querySelector('#searchInput'),
    searchResults: document.querySelector('#searchResults'),
    playerCover: document.querySelector('#playerCover'),
    playerTitle: document.querySelector('#playerTitle'),
    playerArtist: document.querySelector('#playerArtist'),
    favoriteButton: document.querySelector('#favoriteButton'),
    playButton: document.querySelector('#playButton'),
    repeatButton: document.querySelector('#repeatButton'),
    stageToggleButton: document.querySelector('#stageToggleButton'),
    muteButton: document.querySelector('#muteButton'),
    progress: document.querySelector('#progress'),
    volume: document.querySelector('#volume'),
    currentTime: document.querySelector('#currentTime'),
    duration: document.querySelector('#duration'),
    stageTitle: document.querySelector('#stageTitle'),
    stageArtist: document.querySelector('#stageArtist'),
    controlPanel: document.querySelector('#controlPanel'),
    wallpaperOptions: document.querySelector('#wallpaperOptions'),
    collectionDialog: document.querySelector('#collectionDialog'),
    dialogEyebrow: document.querySelector('#dialogEyebrow'),
    dialogTitle: document.querySelector('#dialogTitle'),
    dialogDescription: document.querySelector('#dialogDescription'),
    dialogCount: document.querySelector('#dialogCount'),
    dialogPlayAll: document.querySelector('#dialogPlayAll'),
    dialogTracks: document.querySelector('#dialogTracks'),
    toastRegion: document.querySelector('#toastRegion'),
    wallpaperStatic: document.querySelector('#wallpaperStatic'),
    wallpaperA: document.querySelector('#wallpaperA'),
    wallpaperB: document.querySelector('#wallpaperB')
  };

  let state = null;
  let tracksById = new Map();
  let currentVideo = refs.wallpaperA;
  let savePlayerTimer = null;
  let saveSettingsTimer = null;
  let dialogTrackIds = [];
  let dialogKind = '';
  let searchTrackIds = [];
  let favoriteTrackIds = [];
  let recentTrackIds = [];
  let topTrackIds = [];
  let progressDragging = false;
  let playToken = '';
  let playbackStarted = false;
  let playMarked = false;
  let pendingSeconds = 0;
  let lastListeningTick = performance.now();
  const controlPanelOpenSamples = [];
  const runtimeErrors = [];

  window.addEventListener('error', (event) => {
    runtimeErrors.push(String(event.error?.message || event.message || 'Unknown renderer error').slice(0, 300));
  });
  window.addEventListener('unhandledrejection', (event) => {
    runtimeErrors.push(String(event.reason?.message || event.reason || 'Unhandled rejection').slice(0, 300));
  });

  function icon(name) {
    return `<svg aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatClock(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(value / 60);
    const remainder = Math.floor(value % 60);
    return `${minutes}:${String(remainder).padStart(2, '0')}`;
  }

  function formatListening(seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    if (value < 60) return `${value} 秒`;
    if (value < 3600) return `${Math.floor(value / 60)} 分钟`;
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    return minutes ? `${hours} 小时 ${minutes} 分` : `${hours} 小时`;
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 6) return '夜深了，留一首歌陪你';
    if (hour < 11) return '早上好，唤醒今天的频率';
    if (hour < 14) return '中午好，听点轻松的';
    if (hour < 18) return '下午好，让旋律继续';
    return '晚上好，听点什么？';
  }

  function currentTrack() {
    return state ? tracksById.get(state.player.currentTrackId) || null : null;
  }

  function coverMarkup(track, className = 'track-thumb') {
    if (track?.coverUrl) {
      return `<span class="cover-art ${className}"><img src="${escapeHtml(track.coverUrl)}" alt="" /><span></span></span>`;
    }
    const initials = escapeHtml((track?.title || 'SR').slice(0, 2));
    return `<span class="cover-art ${className}"><span>${initials}</span></span>`;
  }

  function applyCover(element, track) {
    element.classList.toggle('empty', !track?.coverUrl);
    element.innerHTML = track?.coverUrl
      ? `<img src="${escapeHtml(track.coverUrl)}" alt="" /><span></span>`
      : `<span>${escapeHtml((track?.title || 'SR').slice(0, 2))}</span>`;
  }

  function rangeFill(input) {
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 1;
    const value = Number(input.value) || 0;
    input.style.setProperty('--value', `${((value - min) / Math.max(.0001, max - min)) * 100}%`);
  }

  function rebuildIndex() {
    tracksById = new Map(state.tracks.map((track) => [track.id, track]));
  }

  function toast(message, kind = '') {
    const item = document.createElement('div');
    item.className = `toast ${kind}`.trim();
    item.textContent = message;
    refs.toastRegion.append(item);
    setTimeout(() => item.remove(), 3200);
  }

  function safeColors(playlist) {
    const colors = Array.isArray(playlist.colors) ? playlist.colors : ['#8c6ac8', '#2d766f'];
    const valid = colors.map((color) => /^#[0-9a-f]{3,8}$/i.test(color) ? color : '#7766bb');
    return [valid[0], valid[1] || valid[0]];
  }

  function safePlaylistVariant(playlist) {
    return ['wind', 'soft-glow', 'horizon-glow'].includes(playlist?.variant) ? playlist.variant : 'classic';
  }

  function trackRows(ids, options = {}) {
    const rows = ids.map((id) => tracksById.get(id)).filter(Boolean);
    if (!rows.length) return `<div class="track-empty">${escapeHtml(options.empty || '这里还没有播放记录')}</div>`;
    return rows.map((track, index) => `
      <div class="track-row ${track.id === state.player.currentTrackId ? 'current' : ''} ${track.available ? '' : 'unavailable'}" data-play-track="${escapeHtml(track.id)}" role="button" tabindex="0">
        <span class="track-index">${String(index + 1).padStart(2, '0')}</span>
        ${coverMarkup(track)}
        <span class="track-main"><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)} · ${escapeHtml(track.album || '本地音乐')}</small></span>
        <span class="track-count">${options.showDuration ? formatClock(track.duration) : `${Number(track.playCount) || 0} 次`}</span>
        <button class="row-heart ${track.favorite ? 'active' : ''}" type="button" data-favorite-track="${escapeHtml(track.id)}" aria-label="${track.favorite ? '取消收藏' : '收藏'}">${icon('heart')}</button>
      </div>`).join('');
  }

  function renderHome() {
    if (!state) return;
    const track = currentTrack();
    const favorites = state.tracks.filter((item) => item.favorite);
    const recent = state.tracks
      .filter((item) => item.lastPlayedAt)
      .sort((a, b) => new Date(b.lastPlayedAt) - new Date(a.lastPlayedAt))
      .slice(0, 10);
    const ranked = state.tracks.filter((item) => Number(item.playCount) > 0).sort((a, b) =>
      (Number(b.playCount) || 0) - (Number(a.playCount) || 0)
      || (Number(b.listenedSeconds) || 0) - (Number(a.listenedSeconds) || 0)
      || a.title.localeCompare(b.title, 'zh-CN'));

    document.querySelector('.home-header h1').textContent = greeting();
    if (track) {
      const progress = Math.min(100, Math.max(0, (audio.currentTime || state.player.currentTime || 0) / Math.max(1, audio.duration || track.duration || 1) * 100));
      refs.nowCard.innerHTML = `
        ${coverMarkup(track, 'card-cover')}
        <div class="now-card-copy">
          <span class="eyebrow">CONTINUE LISTENING</span>
          <h2>${escapeHtml(track.title)}</h2>
          <p>${escapeHtml(track.artist)} · ${escapeHtml(track.album || '本地音乐')}</p>
          <div class="now-card-progress"><i style="width:${progress.toFixed(2)}%"></i></div>
          <div class="now-card-actions"><button class="round-play" type="button" data-player="toggle">${icon(audio.paused ? 'play' : 'pause')}</button><span>${formatClock(audio.currentTime || state.player.currentTime)} / ${formatClock(audio.duration || track.duration)}</span></div>
        </div>`;
    } else {
      refs.nowCard.innerHTML = `
        <span class="cover-art card-cover"><span>SR</span></span>
        <div class="now-card-copy"><span class="eyebrow">START LISTENING</span><h2>选择你的第一首歌</h2><p>打开歌单，让 SimpleRadio 开始发声。</p><div class="now-card-actions"><button class="round-play" type="button" data-play-playlist="${escapeHtml(state.playlists[0]?.id || '')}">${icon('play')}</button><span>本地音乐，随时可听</span></div></div>`;
    }

    refs.statCard.innerHTML = `
      <span class="eyebrow">LISTENING MEMORY</span><h3>声音留下的轨迹</h3>
      <div class="stat-values single"><div><strong>${escapeHtml(formatListening(state.statistics.totalListenedSeconds))}</strong><small>累计听歌时长</small></div></div>`;
    refs.favoriteSummary.innerHTML = `<span class="metric-icon">${icon('heart')}</span><strong>${favorites.length} 首</strong><small>我的收藏</small>`;
    refs.recentSummary.innerHTML = `<span class="metric-icon">${icon('clock')}</span><strong>${recent.length} 首</strong><small>最近播放</small>`;

    refs.playlistGrid.innerHTML = state.playlists.map((playlist) => {
      const colors = safeColors(playlist);
      const variant = safePlaylistVariant(playlist);
      return `<article class="playlist-card" data-variant="${variant}" data-open-playlist="${escapeHtml(playlist.id)}" tabindex="0" style="--card-a:${colors[0]};--card-b:${colors[1]}">
        <span class="playlist-card-bg"></span>
        <div class="playlist-card-content"><span class="eyebrow">${escapeHtml(playlist.eyebrow || 'CURATED COLLECTION')}</span><h3>${escapeHtml(playlist.name)}</h3><p>${escapeHtml(playlist.description || '为你珍藏的旋律')}</p><div class="playlist-card-meta"><span>${playlist.trackIds.length} 首</span></div></div>
        <button class="card-play" type="button" data-play-playlist="${escapeHtml(playlist.id)}" aria-label="播放 ${escapeHtml(playlist.name)}">${icon('play')}</button>
      </article>`;
    }).join('');

    topTrackIds = ranked.slice(0, 10).map((item) => item.id);
    favoriteTrackIds = favorites.map((item) => item.id);
    recentTrackIds = recent.map((item) => item.id);
    refs.topTracks.innerHTML = trackRows(topTrackIds, { empty: '播放几首歌后，这里会形成你的 Top 10。' });
    refs.favoritesPageCount.textContent = `${favoriteTrackIds.length} 首`;
    refs.recentPageCount.textContent = `${recentTrackIds.length} 首`;
    refs.favoritesPlayAll.disabled = favoriteTrackIds.every((id) => !tracksById.get(id)?.available);
    refs.favoritesPageList.innerHTML = trackRows(favoriteTrackIds, { empty: '还没有收藏歌曲。点亮任意歌曲旁的心形按钮，它就会出现在这里。', showDuration: true });
    refs.recentPageList.innerHTML = trackRows(recentTrackIds, { empty: '开始播放后，你的聆听足迹会按时间出现在这里。', showDuration: true });
  }

  function renderPlayer() {
    const track = currentTrack();
    applyCover(refs.playerCover, track);
    refs.playerTitle.textContent = track?.title || '选择一首歌';
    refs.playerArtist.textContent = track?.artist || '从你的本地歌单开始';
    refs.stageTitle.textContent = track?.title || '选择一首歌';
    refs.stageArtist.textContent = track ? `${track.artist} · ${track.album || '本地音乐'}` : '让旋律开始流动';
    refs.favoriteButton.classList.toggle('active', Boolean(track?.favorite));
    refs.playButton.innerHTML = icon(audio.paused ? 'play' : 'pause');
    refs.repeatButton.classList.toggle('repeat-one', state?.player.repeat === 'one');
    refs.repeatButton.classList.toggle('active', state?.player.repeat === 'one');
    const singleRepeat = state?.player.repeat === 'one';
    refs.repeatButton.title = singleRepeat ? '单曲循环' : '顺序播放';
    refs.repeatButton.setAttribute('aria-label', singleRepeat ? '单曲循环，点击切换为顺序播放' : '顺序播放，点击切换为单曲循环');
    const stageActive = state?.player.activeView === 'stage';
    refs.stageToggleButton.querySelector('span').textContent = stageActive ? '主页' : '沉浸';
    refs.stageToggleButton.setAttribute('aria-label', stageActive ? '返回主页' : '进入沉浸页面');
    refs.stageToggleButton.classList.toggle('active', stageActive);
    refs.muteButton.innerHTML = icon(audio.muted || audio.volume === 0 ? 'volume-off' : 'volume');
    refs.volume.value = String(state?.player.volume ?? .78);
    rangeFill(refs.volume);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = track ? new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album || 'SimpleRadio',
        artwork: track.coverUrl ? [{ src: track.coverUrl, sizes: '512x512' }] : []
      }) : null;
    }
  }

  function renderAll() {
    rebuildIndex();
    renderHome();
    renderPlayer();
    syncSettingsControls();
  }

  function renderWallpapers() {
    refs.wallpaperOptions.innerHTML = state.wallpapers.map((wallpaper) => {
      const previewUrl = wallpaper.previewUrl || (wallpaper.type === 'image' ? wallpaper.mediaUrl : null);
      return `
      <button class="wallpaper-option ${state.settings.wallpaperId === wallpaper.id ? 'active' : ''}" type="button" data-wallpaper="${escapeHtml(wallpaper.id)}" style="--preview-a:${escapeHtml(wallpaper.colors?.[0] || '#111')};--preview-b:${escapeHtml(wallpaper.colors?.[1] || '#333')}">
        <span class="wallpaper-preview${previewUrl ? ' ready' : ''}"${previewUrl && wallpaper.available ? ` style="background-image:url('${escapeHtml(previewUrl)}')"` : ''}${wallpaper.type === 'video' ? ' data-wallpaper-preview' : ''}></span><span><strong>${escapeHtml(wallpaper.name)}</strong><small>${escapeHtml(wallpaper.description)}${wallpaper.available ? '' : ' · 文件缺失'}</small></span><i class="wallpaper-check">✓</i>
      </button>`;
    }).join('');
  }

  function syncWallpaperOptionSelection() {
    refs.wallpaperOptions.querySelectorAll('[data-wallpaper]').forEach((option) => {
      option.classList.toggle('active', option.dataset.wallpaper === state.settings.wallpaperId);
    });
  }

  function applyWallpaper(force = false) {
    const settings = state.settings;
    document.documentElement.style.setProperty('--wallpaper-opacity', settings.wallpaperOpacity);
    document.documentElement.style.setProperty('--wallpaper-dim', settings.wallpaperDim);
    document.documentElement.style.setProperty('--wallpaper-blur', `${settings.wallpaperBlur}px`);
    const wallpaper = state.wallpapers.find((item) => item.id === settings.wallpaperId) || state.wallpapers[0];
    if (wallpaper) {
      const [first = '#171124', second = '#263b49'] = wallpaper.colors || [];
      const fallback = wallpaper.gradient || `radial-gradient(circle at 28% 24%, ${first}aa, transparent 36%), radial-gradient(circle at 76% 68%, ${second}88, transparent 38%), linear-gradient(145deg, #07080d, ${first} 52%, #090b12)`;
      refs.wallpaperStatic.style.background = wallpaper.type === 'image' && wallpaper.mediaUrl && wallpaper.available
        ? `url("${wallpaper.mediaUrl}") center center / cover no-repeat`
        : fallback;
    }
    if (!wallpaper || wallpaper.type !== 'video' || !wallpaper.mediaUrl || !wallpaper.available) {
      refs.wallpaperA.classList.remove('active');
      refs.wallpaperB.classList.remove('active');
      refs.wallpaperA.pause();
      refs.wallpaperB.pause();
      return;
    }
    if (!force && currentVideo.dataset.wallpaperId === wallpaper.id) {
      currentVideo.play().catch(() => {});
      return;
    }
    const nextVideo = currentVideo === refs.wallpaperA ? refs.wallpaperB : refs.wallpaperA;
    nextVideo.classList.remove('active');
    nextVideo.dataset.wallpaperId = wallpaper.id;
    nextVideo.src = wallpaper.mediaUrl;
    nextVideo.load();
    const reveal = () => {
      nextVideo.play().catch(() => {});
      nextVideo.classList.add('active');
      currentVideo.classList.remove('active');
      currentVideo.pause();
      currentVideo = nextVideo;
    };
    if (nextVideo.readyState >= 2) reveal();
    else nextVideo.addEventListener('loadeddata', reveal, { once: true });
    nextVideo.addEventListener('error', () => {
      if (state.settings.wallpaperId === wallpaper.id) {
        state.settings.wallpaperId = 'obsidian';
        applyWallpaper(true);
        toast('动态壁纸无法解码，已切换到曜石流光', 'error');
      }
    }, { once: true });
  }

  function syncSettingsControls(renderOptions = true) {
    document.querySelectorAll('[data-setting]').forEach((input) => {
      const key = input.dataset.setting;
      input.value = String(state.settings[key]);
      rangeFill(input);
      const output = document.querySelector(`[data-output="${key}"]`);
      if (output) {
        const value = Number(state.settings[key]);
        output.value = key === 'wallpaperBlur'
          ? `${Math.round(value)} px`
          : `${Math.round(value * 100)}%`;
      }
    });
    if (renderOptions) renderWallpapers();
  }

  function scheduleSettingsSave() {
    clearTimeout(saveSettingsTimer);
    saveSettingsTimer = setTimeout(async () => {
      const saved = await bridge.settings.save(state.settings);
      if (saved) state.settings = saved;
    }, 180);
  }

  function switchView(view) {
    const views = {
      home: refs.homeView,
      stage: refs.stageView,
      favorites: refs.favoritesView,
      recent: refs.recentView
    };
    const target = Object.hasOwn(views, view) ? view : 'home';
    state.player.activeView = target;
    Object.entries(views).forEach(([name, element]) => element.classList.toggle('active', name === target));
    document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === target));
    renderPlayer();
    closeSearchResults();
    schedulePlayerSave();
  }

  function playerSnapshot() {
    return {
      ...state.player,
      currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : state.player.currentTime,
      volume: audio.volume,
      muted: audio.muted
    };
  }

  function schedulePlayerSave() {
    clearTimeout(savePlayerTimer);
    savePlayerTimer = setTimeout(() => bridge.player.save(playerSnapshot()), 260);
  }

  function beginTrackSession() {
    playToken = `${state.player.currentTrackId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    playbackStarted = false;
    playMarked = false;
    pendingSeconds = 0;
    lastListeningTick = performance.now();
  }

  function applyStatsResult(result) {
    if (!result) return;
    const track = tracksById.get(result.trackId);
    if (track) {
      track.playCount = result.playCount;
      track.listenedSeconds = result.listenedSeconds;
      track.lastPlayedAt = result.lastPlayedAt;
    }
    state.statistics = result.statistics;
  }

  function flushListening(immediate = false) {
    if (!state?.player.currentTrackId || (pendingSeconds <= 0 && !playMarked)) return;
    const trackId = state.player.currentTrackId;
    const seconds = pendingSeconds;
    const markPlay = playMarked === 'pending';
    pendingSeconds = 0;
    if (markPlay) playMarked = true;
    const payload = { trackId, seconds, markPlay, playToken };
    if (immediate) {
      bridge.player.recordListeningNow(payload);
      const track = tracksById.get(trackId);
      if (track) {
        track.listenedSeconds = (Number(track.listenedSeconds) || 0) + seconds;
        if (markPlay) track.playCount = (Number(track.playCount) || 0) + 1;
      }
      state.statistics.totalListenedSeconds = (Number(state.statistics.totalListenedSeconds) || 0) + seconds;
      if (markPlay) state.statistics.totalPlayCount = (Number(state.statistics.totalPlayCount) || 0) + 1;
    } else {
      bridge.player.recordListening(payload).then((result) => {
        applyStatsResult(result);
        renderHome();
      });
    }
  }

  async function loadTrack(trackId, options = {}) {
    const track = tracksById.get(trackId);
    if (!track || !track.available) {
      toast('内置音频不可用，请重新安装完整版本', 'error');
      return;
    }
    flushListening(true);
    state.player.currentTrackId = track.id;
    const queueIndex = state.player.queueIds.indexOf(track.id);
    if (queueIndex >= 0) state.player.queueIndex = queueIndex;
    audio.src = track.mediaUrl;
    audio.load();
    beginTrackSession();
    renderPlayer();
    renderHome();
    if (refs.collectionDialog.open) refreshOpenDialog();
    const startAt = Number(options.startAt) || 0;
    audio.addEventListener('loadedmetadata', () => {
      if (startAt > 0 && startAt < audio.duration - 1) audio.currentTime = startAt;
      updateProgress();
    }, { once: true });
    schedulePlayerSave();
    if (options.autoplay !== false) {
      audio.play().catch(() => toast(`无法播放：${track.title}`, 'error'));
    }
  }

  async function togglePlayback() {
    if (!currentTrack()) {
      const firstPlaylist = state.playlists.find((playlist) => playlist.trackIds.length);
      if (firstPlaylist) playPlaylist(firstPlaylist.id);
      else toast('内置歌单暂不可用，请重新启动');
      return;
    }
    if (audio.paused) {
      audio.play().catch(() => toast('当前歌曲无法播放', 'error'));
    } else {
      audio.pause();
    }
  }

  function playPlaylist(playlistId) {
    const playlist = state.playlists.find((item) => item.id === playlistId);
    if (!playlist?.trackIds.length) return toast('这个歌单目前没有可播放歌曲');
    state.player.queueIds = playlist.trackIds.filter((id) => tracksById.get(id)?.available);
    state.player.queueIndex = 0;
    loadTrack(state.player.queueIds[0], { autoplay: true });
  }

  function playFavorites() {
    const queue = favoriteTrackIds.filter((id) => tracksById.get(id)?.available);
    if (!queue.length) return toast('收藏中还没有可播放的歌曲');
    state.player.shuffle = false;
    state.player.repeat = 'all';
    state.player.queueIds = queue;
    state.player.queueIndex = 0;
    loadTrack(queue[0], { autoplay: true });
  }

  function playTrackFromList(trackId, ids = null) {
    const queue = Array.isArray(ids) && ids.length ? ids : state.tracks.map((track) => track.id);
    state.player.queueIds = queue.filter((id) => tracksById.has(id));
    state.player.queueIndex = Math.max(0, state.player.queueIds.indexOf(trackId));
    loadTrack(trackId, { autoplay: true });
  }

  function nextTrack(manual = false) {
    const queue = state.player.queueIds;
    if (!queue.length) return;
    if (!manual && state.player.repeat === 'one') {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    let index = state.player.queueIndex + 1;
    if (index >= queue.length) {
      if (state.player.repeat === 'all' || manual) index = 0;
      else { audio.pause(); return; }
    }
    state.player.queueIndex = index;
    loadTrack(queue[index], { autoplay: true });
  }

  function previousTrack() {
    if (audio.currentTime > 4) {
      audio.currentTime = 0;
      return;
    }
    const queue = state.player.queueIds;
    if (!queue.length) return;
    let index = state.player.queueIndex - 1;
    if (index < 0) index = queue.length - 1;
    state.player.queueIndex = index;
    loadTrack(queue[index], { autoplay: true });
  }

  function cycleRepeat() {
    state.player.repeat = state.player.repeat === 'one' ? 'all' : 'one';
    state.player.shuffle = false;
    renderPlayer();
    schedulePlayerSave();
    toast(state.player.repeat === 'one' ? '已切换为单曲循环' : '已切换为顺序播放');
  }

  async function toggleFavorite(trackId) {
    const track = tracksById.get(trackId);
    if (!track) return;
    track.favorite = !track.favorite;
    await bridge.player.favorite(track.id, track.favorite);
    renderHome();
    renderPlayer();
    if (refs.searchInput.value.trim()) searchTracks(refs.searchInput.value);
    if (refs.collectionDialog.open) refreshOpenDialog();
  }

  function openTracksDialog(kind, title, description, ids) {
    dialogKind = kind;
    dialogTrackIds = ids.filter((id) => tracksById.has(id));
    refs.dialogEyebrow.textContent = kind === 'playlist' ? 'LOCAL PLAYLIST' : kind === 'search' ? 'SEARCH RESULTS' : 'YOUR LISTENING MEMORY';
    refs.dialogTitle.textContent = title;
    refs.dialogDescription.textContent = description || '';
    refs.dialogCount.textContent = `${dialogTrackIds.length} 首本地音乐`;
    refs.dialogTracks.innerHTML = trackRows(dialogTrackIds, { empty: '这里还没有歌曲。', showDuration: true });
    refs.dialogPlayAll.disabled = dialogTrackIds.length === 0;
    if (!refs.collectionDialog.open) refs.collectionDialog.showModal();
  }

  function openPlaylist(playlistId) {
    const playlist = state.playlists.find((item) => item.id === playlistId);
    if (!playlist) return;
    const colors = safeColors(playlist);
    refs.collectionDialog.style.setProperty('--card-a', colors[0]);
    refs.collectionDialog.style.setProperty('--card-b', colors[1]);
    openTracksDialog('playlist', playlist.name, playlist.description, playlist.trackIds);
    refs.dialogEyebrow.textContent = playlist.eyebrow || 'CURATED COLLECTION';
  }

  function refreshOpenDialog() {
    if (!refs.collectionDialog.open) return;
    refs.dialogTracks.innerHTML = trackRows(dialogTrackIds, { empty: '这里还没有歌曲。', showDuration: true });
  }

  function closeSearchResults() {
    refs.searchResults.hidden = true;
    refs.searchInput.setAttribute('aria-expanded', 'false');
  }

  function searchTracks(query) {
    const needle = String(query || '').trim().toLocaleLowerCase('zh-CN');
    if (!needle) {
      searchTrackIds = [];
      refs.searchResults.innerHTML = '';
      closeSearchResults();
      return;
    }
    searchTrackIds = state.tracks
      .filter((track) => [track.title, track.artist, track.album].some((value) => String(value || '').toLocaleLowerCase('zh-CN').includes(needle)))
      .map((track) => track.id);
    const visibleIds = searchTrackIds.slice(0, 8);
    refs.searchResults.innerHTML = `
      <div class="search-results-head"><span>${searchTrackIds.length ? `找到 ${searchTrackIds.length} 首` : '没有匹配的歌曲'}</span><kbd>ESC</kbd></div>
      <div class="track-list search-result-list">${trackRows(visibleIds, { empty: '换个歌名、歌手或专辑试试。', showDuration: true })}</div>
      ${searchTrackIds.length > visibleIds.length ? `<p class="search-more">另有 ${searchTrackIds.length - visibleIds.length} 首结果，请继续输入以缩小范围</p>` : ''}`;
    refs.searchResults.hidden = false;
    refs.searchInput.setAttribute('aria-expanded', 'true');
  }

  function queueForTrackElement(element) {
    if (element.closest('#dialogTracks')) return dialogTrackIds;
    if (element.closest('#searchResults')) return searchTrackIds;
    if (element.closest('#favoritesPageList')) return favoriteTrackIds;
    if (element.closest('#recentPageList')) return recentTrackIds;
    if (element.closest('#topTracks')) return topTrackIds;
    return null;
  }

  function openCurrentStage() {
    if (!currentTrack()) return toast('请先从歌单中选择一首歌');
    switchView('stage');
  }

  function updateProgress() {
    const duration = Number.isFinite(audio.duration) ? audio.duration : currentTrack()?.duration || 0;
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const preview = progressDragging && duration > 0 ? Number(refs.progress.value) / 1000 * duration : current;
    refs.currentTime.textContent = formatClock(preview);
    refs.duration.textContent = formatClock(duration);
    if (!progressDragging) refs.progress.value = duration > 0 ? String(Math.round(current / duration * 1000)) : '0';
    rangeFill(refs.progress);
    const bar = refs.nowCard.querySelector('.now-card-progress i');
    if (bar) bar.style.width = `${duration > 0 ? preview / duration * 100 : 0}%`;
    const cardTime = refs.nowCard.querySelector('.now-card-actions > span');
    if (cardTime && currentTrack()) cardTime.textContent = `${formatClock(preview)} / ${formatClock(duration)}`;
  }

  async function openControls() {
    if (refs.controlPanel.classList.contains('open')) return;
    const startedAt = performance.now();
    refs.controlPanel.classList.add('open');
    refs.controlPanel.setAttribute('aria-hidden', 'false');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    controlPanelOpenSamples.push({
      view: state?.player.activeView || 'home',
      milliseconds: Math.round((performance.now() - startedAt) * 10) / 10
    });
  }

  function closeControls() {
    refs.controlPanel.classList.remove('open');
    refs.controlPanel.setAttribute('aria-hidden', 'true');
  }

  document.addEventListener('click', async (event) => {
    if (!event.target.closest('.search-wrap') && !refs.searchResults.hidden) closeSearchResults();
    const target = event.target.closest('button, [data-open-playlist], [data-play-track], [data-open-current-stage]');
    if (!target) return;

    if (target.dataset.window) {
      const action = target.dataset.window === 'maximize' ? 'toggleMaximize' : target.dataset.window;
      return bridge.window[action]();
    }
    if (target.matches('[data-enter-app]')) {
      app.classList.remove('splash-visible');
      return;
    }
    if (target.matches('[data-open-current-stage]')) return openCurrentStage();
    if (target.matches('[data-toggle-stage]')) return switchView(state.player.activeView === 'stage' ? 'home' : 'stage');
    if (target.dataset.view) return switchView(target.dataset.view);
    if (target.matches('[data-open-controls]')) return openControls();
    if (target.matches('[data-close-controls]')) return closeControls();
    if (target.matches('[data-close-dialog]')) return refs.collectionDialog.close();
    if (target.dataset.wallpaper) {
      const selected = state.wallpapers.find((item) => item.id === target.dataset.wallpaper);
      if (!selected?.available) return toast('壁纸文件不存在', 'error');
      if (selected.id === state.settings.wallpaperId) return;
      state.settings.wallpaperId = selected.id;
      syncWallpaperOptionSelection();
      applyWallpaper(true);
      scheduleSettingsSave();
      return;
    }
    if (target.matches('[data-play-favorites]')) return playFavorites();
    if (target.dataset.playPlaylist) return playPlaylist(target.dataset.playPlaylist);
    if (target.dataset.openPlaylist) return openPlaylist(target.dataset.openPlaylist);
    if (target.dataset.favoriteTrack) return toggleFavorite(target.dataset.favoriteTrack);
    if (target.matches('[data-favorite-current]') || target === refs.favoriteButton) {
      if (currentTrack()) return toggleFavorite(currentTrack().id);
      return;
    }
    if (target.dataset.playTrack) {
      const queue = queueForTrackElement(target);
      if (target.closest('#searchResults')) closeSearchResults();
      return playTrackFromList(target.dataset.playTrack, queue);
    }
    if (target.dataset.player === 'toggle') return togglePlayback();
    if (target.dataset.player === 'next') return nextTrack(true);
    if (target.dataset.player === 'previous') return previousTrack();
    if (target.dataset.player === 'repeat') return cycleRepeat();
    if (target.dataset.player === 'mute') {
      audio.muted = !audio.muted;
      state.player.muted = audio.muted;
      renderPlayer();
      schedulePlayerSave();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!refs.searchResults.hidden) closeSearchResults();
      else if (refs.controlPanel.classList.contains('open')) closeControls();
      else if (refs.collectionDialog.open) refs.collectionDialog.close();
      else if (state?.player.activeView !== 'home') switchView('home');
      return;
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      refs.searchInput.focus();
      return;
    }
    if (event.target.matches('input, textarea')) return;
    if (event.code === 'Space') { event.preventDefault(); togglePlayback(); }
    if (event.key === 'ArrowLeft' && currentTrack()) audio.currentTime = Math.max(0, audio.currentTime - 5);
    if (event.key === 'ArrowRight' && currentTrack()) audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 5);
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-open-current-stage]')) { event.preventDefault(); openCurrentStage(); }
    if ((event.key === 'Enter' || event.key === ' ') && event.target.dataset.openPlaylist) openPlaylist(event.target.dataset.openPlaylist);
    if ((event.key === 'Enter' || event.key === ' ') && event.target.dataset.playTrack) playTrackFromList(event.target.dataset.playTrack, queueForTrackElement(event.target));
  });

  document.querySelectorAll('[data-setting]').forEach((input) => {
    input.addEventListener('input', () => {
      state.settings[input.dataset.setting] = Number(input.value);
      rangeFill(input);
      syncSettingsControls(false);
      applyWallpaper();
      scheduleSettingsSave();
    });
  });

  refs.dialogPlayAll.addEventListener('click', () => {
    if (!dialogTrackIds.length) return;
    state.player.queueIds = [...dialogTrackIds];
    state.player.queueIndex = 0;
    loadTrack(dialogTrackIds[0], { autoplay: true });
    refs.collectionDialog.close();
  });

  refs.searchInput.addEventListener('input', () => searchTracks(refs.searchInput.value));
  refs.searchInput.addEventListener('focus', () => {
    if (refs.searchInput.value.trim()) searchTracks(refs.searchInput.value);
  });
  function commitProgressSeek() {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (duration <= 0) return;
    const target = Number(refs.progress.value) / 1000 * duration;
    audio.currentTime = target;
    state.player.currentTime = target;
    refs.currentTime.textContent = formatClock(target);
    rangeFill(refs.progress);
    schedulePlayerSave();
  }
  function previewProgressAt(clientX) {
    const rect = refs.progress.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (Number(clientX) - rect.left) / rect.width));
    refs.progress.value = String(Math.round(ratio * 1000));
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (duration > 0) refs.currentTime.textContent = formatClock(ratio * duration);
    rangeFill(refs.progress);
  }
  refs.progress.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    progressDragging = true;
    try { refs.progress.setPointerCapture?.(event.pointerId); } catch {}
    previewProgressAt(event.clientX);
  });
  refs.progress.addEventListener('pointermove', (event) => {
    if (!progressDragging) return;
    previewProgressAt(event.clientX);
  });
  refs.progress.addEventListener('pointerup', (event) => {
    if (!progressDragging) return;
    previewProgressAt(event.clientX);
    commitProgressSeek();
    progressDragging = false;
    try { refs.progress.releasePointerCapture?.(event.pointerId); } catch {}
    updateProgress();
  });
  refs.progress.addEventListener('input', () => {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (duration > 0) refs.currentTime.textContent = formatClock(Number(refs.progress.value) / 1000 * duration);
    rangeFill(refs.progress);
    if (!progressDragging) commitProgressSeek();
  });
  refs.progress.addEventListener('change', () => { commitProgressSeek(); progressDragging = false; updateProgress(); });
  window.addEventListener('pointerup', () => {
    if (!progressDragging) return;
    commitProgressSeek();
    progressDragging = false;
    updateProgress();
  });
  window.addEventListener('pointercancel', () => { progressDragging = false; updateProgress(); });
  refs.volume.addEventListener('input', () => {
    audio.volume = Number(refs.volume.value);
    audio.muted = false;
    state.player.volume = audio.volume;
    state.player.muted = false;
    rangeFill(refs.volume);
    renderPlayer();
    schedulePlayerSave();
  });

  audio.addEventListener('play', () => renderPlayer());
  audio.addEventListener('playing', () => {
    renderPlayer();
    if (!playbackStarted && currentTrack()) {
      playbackStarted = true;
      currentTrack().lastPlayedAt = new Date().toISOString();
      state.statistics.lastListeningAt = currentTrack().lastPlayedAt;
      bridge.player.recordListening({ trackId: currentTrack().id, seconds: 0, started: true, playToken }).then(applyStatsResult);
      renderHome();
    }
    lastListeningTick = performance.now();
  });
  audio.addEventListener('pause', () => { renderPlayer(); flushListening(); schedulePlayerSave(); });
  audio.addEventListener('timeupdate', () => { updateProgress(); schedulePlayerSave(); });
  audio.addEventListener('durationchange', updateProgress);
  audio.addEventListener('ended', () => { flushListening(); nextTrack(false); });
  audio.addEventListener('error', () => {
    if (currentTrack()) toast(`播放失败：${currentTrack().title}`, 'error');
  });

  setInterval(() => {
    const now = performance.now();
    const delta = Math.min(2, Math.max(0, (now - lastListeningTick) / 1000));
    lastListeningTick = now;
    if (!state || audio.paused || audio.seeking || audio.readyState < 2 || !currentTrack()) return;
    pendingSeconds += delta;
    const threshold = Math.min(30, Math.max(5, (audio.duration || currentTrack().duration || 150) * .2));
    const sessionListening = (Number(currentTrack()._sessionListening) || 0) + delta;
    currentTrack()._sessionListening = sessionListening;
    if (!playMarked && sessionListening >= threshold) playMarked = 'pending';
    if (pendingSeconds >= 10 || playMarked === 'pending') flushListening();
  }, 1000);

  document.addEventListener('visibilitychange', () => {
    const activeVideos = [refs.wallpaperA, refs.wallpaperB].filter((video) => video.classList.contains('active'));
    if (document.hidden) activeVideos.forEach((video) => video.pause());
    else activeVideos.forEach((video) => video.play().catch(() => {}));
  });

  // Fixed catalog: prevent dropped files from navigating the window; never import them.
  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('drop', (event) => event.preventDefault());

  window.addEventListener('beforeunload', () => {
    flushListening(true);
    if (state) bridge.player.saveNow(playerSnapshot());
  });

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', togglePlayback);
    navigator.mediaSession.setActionHandler('pause', togglePlayback);
    navigator.mediaSession.setActionHandler('previoustrack', previousTrack);
    navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack(true));
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (Number.isFinite(details.seekTime)) audio.currentTime = details.seekTime;
    });
  }

  let mediaAudit = null;
  window.__auditCatalogMedia = async () => {
    const results = [];
    for (const track of state.tracks) {
      const probe = document.createElement('audio');
      probe.preload = 'auto';
      probe.muted = true;
      const result = await new Promise((resolve) => {
        const timer = setTimeout(() => finish('timeout'), 8000);
        const finish = (error = null) => {
          clearTimeout(timer);
          probe.onloadeddata = null;
          probe.onerror = null;
          resolve({ id: track.id, title: track.title, duration: probe.duration, readyState: probe.readyState, error });
        };
        probe.onloadeddata = () => finish();
        probe.onerror = () => finish(probe.error?.message || 'decode failed');
        probe.src = track.mediaUrl;
        probe.load();
      });
      probe.removeAttribute('src');
      probe.load();
      results.push(result);
    }
    mediaAudit = { checked: results.length, failed: results.filter((item) => item.error || !(item.duration > 0)), results };
    return mediaAudit;
  };

  window.__simpleRadioSmokeReport = () => {
    const progressRect = refs.progress.getBoundingClientRect();
    const hit = document.elementFromPoint(progressRect.left + progressRect.width / 2, progressRect.top + progressRect.height / 2);
    return ({
    trackCount: state?.tracks.length || 0,
    playlistCount: state?.playlists.length || 0,
    currentTitle: currentTrack()?.title || null,
    paused: audio.paused,
    currentTime: audio.currentTime,
    duration: audio.duration,
    view: state?.player.activeView,
    wallpaper: state?.settings.wallpaperId,
    catalogRevision: state?.catalogRevision,
    playlists: state?.playlists.map(({ id, name, trackIds, colors }) => ({ id, name, count: trackIds.length, colors })),
    availableTracks: state?.tracks.filter((track) => track.available).length,
    appearanceSections: [...document.querySelectorAll('[data-appearance-section]')].map((section) => section.dataset.appearanceSection),
    settingKeys: Object.keys(state?.settings || {}),
    stageContent: [...refs.stageView.children].map((element) => element.id || element.className),
    importActions: document.querySelectorAll('[data-import]').length,
    hasVisualCanvas: Boolean(document.querySelector('canvas')),
    mediaAudit,
    searchValue: refs.searchInput.value,
    searchResultCount: refs.searchResults.querySelectorAll('[data-play-track]').length,
    searchInputFocused: document.activeElement === refs.searchInput,
    progressValue: Number(refs.progress.value),
    progressRect: { left: progressRect.left, top: progressRect.top, width: progressRect.width, height: progressRect.height },
    progressHit: hit ? `${hit.tagName.toLowerCase()}#${hit.id || ''}.${hit.className || ''}` : null,
    seekableRanges: Array.from({ length: audio.seekable.length }, (_, index) => ({ start: audio.seekable.start(index), end: audio.seekable.end(index) })),
    playbackMode: state?.player.repeat,
    stageToggleText: refs.stageToggleButton.querySelector('span')?.textContent || null,
    favoriteCount: state?.tracks.filter((track) => track.favorite).length || 0,
    queueCount: state?.player.queueIds.length || 0,
    favoritesPlayAllDisabled: refs.favoritesPlayAll.disabled,
    wallpaperCount: state?.wallpapers.length || 0,
    wallpaperNames: state?.wallpapers.map((wallpaper) => wallpaper.name) || [],
    wallpaperAvailability: state?.wallpapers.map((wallpaper) => ({ id: wallpaper.id, available: wallpaper.available })) || [],
    wallpaperPreviewCount: refs.wallpaperOptions.querySelectorAll('[data-wallpaper-preview]').length,
    wallpaperPreviewReadyCount: refs.wallpaperOptions.querySelectorAll('[data-wallpaper-preview].ready').length,
    wallpaperPreviewVideoElementCount: refs.wallpaperOptions.querySelectorAll('video').length,
    controlPanelOpenSamples: [...controlPanelOpenSamples],
    wallpaperVideos: [refs.wallpaperA, refs.wallpaperB].map((video) => ({ active: video.classList.contains('active'), wallpaperId: video.dataset.wallpaperId || null, readyState: video.readyState, currentTime: video.currentTime, paused: video.paused, error: video.error?.message || null })),
    recentRenderedCount: refs.recentPageList.querySelectorAll('[data-play-track]').length,
    dialogCurrentTitle: refs.dialogTracks.querySelector('.track-row.current .track-main strong')?.textContent || null,
    stageCoverPresent: Boolean(document.querySelector('#stageCover')),
    stageOverlayContent: getComputedStyle(refs.stageView, '::before').content,
    appClipPath: getComputedStyle(app).clipPath,
    runtimeErrors: [...runtimeErrors]
    });
  };

  async function initialize() {
    try {
      state = await bridge.state.get();
      if (!state) throw new Error('无法读取本地状态');
      rebuildIndex();
      audio.volume = state.player.volume;
      audio.muted = state.player.muted;
      applyWallpaper(true);
      renderAll();
      switchView('home');
      const restored = currentTrack();
      if (restored?.available) await loadTrack(restored.id, { autoplay: false, startAt: state.player.currentTime });
      app.classList.remove('loading');
    } catch (error) {
      console.error(error);
      app.classList.remove('loading');
      toast('SimpleRadio 初始化失败，请重新启动', 'error');
    }
  }

  initialize();
})();
