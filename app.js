/**
 * 翡翠璀璨圣诞树 · 主交互控制模块
 * 连接 3D WebGL 引擎、倒计时、IndexedDB 回忆相册、圣诞布置面板、音频律动与开场动画
 */
(function () {
  const Cfg = window.TreeConfig;
  const AudioLib = window.TreeAudio;
  const EngineLib = window.TreeEngine;
  const IntroLib = window.TreeIntro;

  const canvas = document.getElementById('tree-canvas');
  const introOverlay = document.getElementById('intro-overlay');
  const introCanvas = document.getElementById('intro-canvas');
  const introSkip = document.getElementById('intro-skip');

  const mainSubtitle = document.getElementById('main-subtitle');
  const cdDays = document.getElementById('cd-days');
  const cdHours = document.getElementById('cd-hours');
  const cdMins = document.getElementById('cd-mins');
  const cdSecs = document.getElementById('cd-secs');

  const galleryToggleBtn = document.getElementById('gallery-toggle-btn');
  const galleryPopover = document.getElementById('gallery-popover');
  const galleryGrid = document.getElementById('gallery-grid');
  const galleryCount = document.getElementById('gallery-count');
  const galleryFileInput = document.getElementById('gallery-file-input');

  const statusDot = document.getElementById('status-dot');
  const statusModeText = document.getElementById('status-mode-text');
  const fpsBtn = document.getElementById('fps-btn');
  const fpsBadge = document.getElementById('fps-badge');
  const quickMusicBtn = document.getElementById('quick-music-btn');
  const settingsToggleBtn = document.getElementById('settings-toggle-btn');
  const settingsDrawer = document.getElementById('settings-drawer');
  const settingsCloseBtn = document.getElementById('settings-close-btn');

  const presetGrid = document.getElementById('preset-grid');
  const drawerMusicBtn = document.getElementById('drawer-music-btn');
  const drawerMusicText = document.getElementById('drawer-music-text');
  const trackNameEl = document.getElementById('track-name');
  const audioFileInput = document.getElementById('audio-file-input');
  const uploadAudioBtn = document.getElementById('upload-audio-btn');

  const modeButtons = Array.from(document.querySelectorAll('[data-mode]'));
  const sliderParticles = document.getElementById('slider-particles');
  const valParticleCount = document.getElementById('val-particle-count');
  const colorP1 = document.getElementById('color-p1');
  const colorP2 = document.getElementById('color-p2');

  const sliderBoxes = document.getElementById('slider-boxes');
  const valBoxCount = document.getElementById('val-box-count');
  const sliderBells = document.getElementById('slider-bells');
  const valBellCount = document.getElementById('val-bell-count');
  const colorBox1 = document.getElementById('color-box1');
  const colorBox2 = document.getElementById('color-box2');
  const colorBell = document.getElementById('color-bell');
  const subtitleInput = document.getElementById('subtitle-input');

  const state = Cfg.createDefaultState();
  const audio = AudioLib.create();

  /* ---------------- 1. 实时圣诞节倒计时 (还原原版 Uz) ---------------- */
  function updateCountdown() {
    const now = new Date();
    const y = now.getFullYear();
    let target = new Date(y, 11, 25, 0, 0, 0);
    if (now.getTime() > new Date(y, 11, 26, 0, 0, 0).getTime()) {
      target = new Date(y + 1, 11, 25, 0, 0, 0);
    }
    const diff = Math.max(0, target.getTime() - now.getTime());
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    cdDays.textContent = `${d} 天`;
    cdHours.textContent = `${String(h).padStart(2, '0')} 时`;
    cdMins.textContent = `${String(m).padStart(2, '0')} 分`;
    cdSecs.textContent = `${String(s).padStart(2, '0')} 秒`;
  }
  updateCountdown();
  setInterval(updateCountdown, 1000);

  /* ---------------- 2. 副标题应用 ---------------- */
  function applySubtitle() {
    const text = state.recipient
      ? `To ${state.recipient} · ${state.subtitle}`
      : state.subtitle;
    mainSubtitle.textContent = text;
    subtitleInput.value = state.subtitle;
  }
  applySubtitle();

  /* ---------------- 3. 初始化 3D WebGL 引擎 (开场播放期间先暂停，零双重消耗) ---------------- */
  let engine = null;
  try {
    engine = EngineLib.create(canvas, state, {
      getAudioLevel: () => audio.getAudioLevel(),
      onFps(fps, isEco, scale) {
        const tag = isEco ? '轻盈' : scale < 0.95 ? '稳帧' : '极致';
        fpsBadge.textContent = `${fps} FPS · ${tag}`;
      },
      onBloomChange(isBlooming) {
        statusDot.classList.toggle('blooming', isBlooming);
        if (isBlooming) {
          statusModeText.textContent = '星光绽放中';
        } else {
          statusModeText.textContent = state.mode === 'TREE' ? '圣诞树模式' : '星光漂浮模式';
        }
      }
    });
  } catch (err) {
    document.body.innerHTML = `<div style="display:grid;place-items:center;height:100vh;padding:24px;text-align:center;color:#d1fae5;background:#04110e;"><div><h2>无法启动 3D 圣诞树</h2><p style="margin-top:10px;opacity:0.8">${err.message}</p></div></div>`;
    return;
  }

  // 检查是否跳过开场动画 (?nointro 可直接秒进)
  const skipIntroParam = new URLSearchParams(window.location.search).has('nointro');
  if (skipIntroParam) {
    introOverlay.style.display = 'none';
    engine.start();
  } else {
    engine.setPaused(true);
    IntroLib.run(introOverlay, introCanvas, introSkip, () => {
      engine.start();
    });
  }

  /* ---------------- 4. 回忆相册 (IndexedDB 持久化 + 3D 金框实时同步) ---------------- */
  let galleryItems = [];

  function renderGalleryGrid() {
    galleryCount.textContent = `${galleryItems.length} 张`;
    galleryGrid.innerHTML = '';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'gallery-add-btn';
    addBtn.title = '上传合照';
    addBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    addBtn.addEventListener('click', () => galleryFileInput.click());
    galleryGrid.appendChild(addBtn);

    galleryItems.forEach((item, idx) => {
      const wrap = document.createElement('div');
      wrap.className = 'gallery-thumb';

      const img = document.createElement('img');
      img.src = item.url;
      img.alt = `回忆照片 ${idx + 1}`;

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'gallery-del-btn';
      delBtn.title = '移除照片';
      delBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>`;
      delBtn.addEventListener('click', async () => {
        await Cfg.deletePhoto(item);
        galleryItems = galleryItems.filter((g) => g.id !== item.id);
        renderGalleryGrid();
        engine.setGallery(galleryItems);
      });

      wrap.appendChild(img);
      wrap.appendChild(delBtn);
      galleryGrid.appendChild(wrap);
    });
  }

  Cfg.loadGallery().then((items) => {
    galleryItems = items;
    renderGalleryGrid();
    engine.setGallery(galleryItems);
  });

  galleryToggleBtn.addEventListener('click', () => {
    const open = galleryPopover.classList.toggle('open');
    galleryToggleBtn.classList.toggle('active', open);
  });

  galleryFileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    for (const file of files) {
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      if (dataUrl) {
        const saved = await Cfg.savePhoto(dataUrl);
        galleryItems.push(saved);
      }
    }
    galleryFileInput.value = '';
    renderGalleryGrid();
    engine.setGallery(galleryItems);
  });

  /* ---------------- 5. 绿系预设主题 ---------------- */
  const presetBtns = [];
  function applyPreset(presetId) {
    const p = Cfg.PRESETS[presetId];
    if (!p) return;
    state.presetId = presetId;
    state.particleColor1 = p.particleColor1;
    state.particleColor2 = p.particleColor2;
    state.boxColor1 = p.boxColor1;
    state.boxColor2 = p.boxColor2;
    state.bellColor = p.bellColor;

    colorP1.value = state.particleColor1;
    colorP2.value = state.particleColor2;
    colorBox1.value = state.boxColor1;
    colorBox2.value = state.boxColor2;
    colorBell.value = state.bellColor;

    document.documentElement.style.setProperty('--emerald', p.uiAccent);
    document.documentElement.style.setProperty('--gold', p.uiGold);

    presetBtns.forEach((b) => b.classList.toggle('active', b.dataset.preset === presetId));
    engine.updateState(state);
  }

  Cfg.PRESET_ORDER.forEach((id) => {
    const p = Cfg.PRESETS[id];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-btn' + (id === state.presetId ? ' active' : '');
    btn.dataset.preset = id;
    btn.innerHTML = `<span class="preset-dot" style="background:linear-gradient(135deg, ${p.particleDeep}, ${p.particleColor1} 55%, ${p.particleColor2})"></span><span>${p.name}</span>`;
    btn.addEventListener('click', () => applyPreset(id));
    presetBtns.push(btn);
    presetGrid.appendChild(btn);
  });

  /* ---------------- 6. 圣诞布置面板交互 ---------------- */
  function setSettingsOpen(open) {
    settingsDrawer.classList.toggle('open', open);
    settingsToggleBtn.classList.toggle('active', open);
  }
  settingsToggleBtn.addEventListener('click', () => {
    setSettingsOpen(!settingsDrawer.classList.contains('open'));
  });
  settingsCloseBtn.addEventListener('click', () => setSettingsOpen(false));

  // FPS / 轻盈模式切换
  fpsBtn.addEventListener('click', () => {
    const isEco = engine.toggleEcoMode();
    fpsBtn.classList.toggle('active', isEco);
  });

  // 音乐控制（内置圣诞八音盒 + 上传本地音乐）
  function syncMusicUI(playing) {
    quickMusicBtn.classList.toggle('active', playing);
    drawerMusicBtn.classList.toggle('playing', playing);
    drawerMusicText.textContent = playing ? '暂停音乐' : '播放音乐';
    trackNameEl.textContent = audio.getTrackName();
  }

  function handleMusicToggle() {
    const playing = audio.toggle();
    syncMusicUI(playing);
  }
  quickMusicBtn.addEventListener('click', handleMusicToggle);
  drawerMusicBtn.addEventListener('click', handleMusicToggle);

  uploadAudioBtn.addEventListener('click', () => audioFileInput.click());
  audioFileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    audio.loadLocalFile(file);
    syncMusicUI(true);
    audioFileInput.value = '';
  });

  // 展示模式切换：圣诞树 <-> 星光漂浮
  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.mode;
      state.mode = m;
      modeButtons.forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
      statusModeText.textContent = m === 'TREE' ? '圣诞树模式' : '星光漂浮模式';
      engine.updateState({ mode: m });
    });
  });

  // 星光粒子数量与颜色
  sliderParticles.addEventListener('input', () => {
    const v = parseInt(sliderParticles.value, 10);
    state.particleCount = v;
    valParticleCount.textContent = String(v);
    engine.updateState({ particleCount: v });
  });
  colorP1.addEventListener('input', () => {
    state.particleColor1 = colorP1.value;
    engine.updateState({ particleColor1: state.particleColor1 });
  });
  colorP2.addEventListener('input', () => {
    state.particleColor2 = colorP2.value;
    engine.updateState({ particleColor2: state.particleColor2 });
  });

  // 礼物盒与彩球数量与颜色
  sliderBoxes.addEventListener('input', () => {
    const v = parseInt(sliderBoxes.value, 10);
    state.boxCount = v;
    valBoxCount.textContent = String(v);
    engine.updateState({ boxCount: v });
  });
  sliderBells.addEventListener('input', () => {
    const v = parseInt(sliderBells.value, 10);
    state.bellCount = v;
    valBellCount.textContent = String(v);
    engine.updateState({ bellCount: v });
  });
  colorBox1.addEventListener('input', () => {
    state.boxColor1 = colorBox1.value;
    engine.updateState({ boxColor1: state.boxColor1 });
  });
  colorBox2.addEventListener('input', () => {
    state.boxColor2 = colorBox2.value;
    engine.updateState({ boxColor2: state.boxColor2 });
  });
  colorBell.addEventListener('input', () => {
    state.bellColor = colorBell.value;
    engine.updateState({ bellColor: state.bellColor });
  });

  // 专属副标题实时编辑
  subtitleInput.addEventListener('input', () => {
    state.subtitle = subtitleInput.value.trim() || '翡翠璀璨圣诞树 · 愿今夜星光为你而亮';
    applySubtitle();
  });

  // ESC 关闭特写照片与弹窗
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      engine.closeZoomedPhoto();
      setSettingsOpen(false);
      galleryPopover.classList.remove('open');
      galleryToggleBtn.classList.remove('active');
    }
  });
})();
