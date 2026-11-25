/**
 * 翡翠星光开场汇聚动画（传承原版 2D 粒子开场，全面减负与翡翠绿升级）
 * - 播放期间暂停底层 3D WebGL 渲染，避免原版双重吃 GPU 的卡顿问题
 * - 3.8 秒流畅汇聚成形，可随时点击「跳过 ›」瞬间进入 3D 圣诞树
 */
window.TreeIntro = (function () {
  function run(overlayEl, canvasEl, skipBtn, onComplete) {
    if (!overlayEl || !canvasEl) {
      onComplete && onComplete();
      return;
    }

    const ctx = canvasEl.getContext('2d', { alpha: false });
    let finished = false;
    let rafId = 0;
    const startTs = performance.now();
    const DURATION = 3.8; // 更紧凑优雅的开场节奏

    let w = 1, h = 1, dpr = 1;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      canvasEl.width = Math.round(w * dpr);
      canvasEl.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    // 生成 2,200 颗翡翠+香槟金星光粒子（比原版 20,000+ 轻 10 倍，满帧丝滑）
    const COUNT = 2200;
    const particles = new Array(COUNT);
    const treeH = Math.min(h * 0.62, 520);
    const treeW = treeH * 0.44;
    const cx = w * 0.5;
    const baseY = h * 0.5 + treeH * 0.46;

    for (let i = 0; i < COUNT; i++) {
      const t = i / COUNT;
      const isRibbon = i > COUNT * 0.84;
      let tx, ty, col, r;

      if (isRibbon) {
        const rt = (i - COUNT * 0.84) / (COUNT * 0.16);
        const yOff = rt * treeH * 0.94;
        const rad = (1 - rt) * treeW * 1.05;
        const ang = rt * Math.PI * 10;
        tx = cx + Math.cos(ang) * rad;
        ty = baseY - yOff;
        col = rt % 0.1 < 0.05 ? '#f6d88b' : '#a7f3d0';
        r = 1.6 + Math.random() * 1.4;
      } else {
        const hNorm = 1 - Math.pow(Math.random(), 0.62);
        const tierWave = 0.82 + 0.22 * (1 - ((hNorm * 7) % 1));
        const maxR = (1 - hNorm) * treeW * tierWave;
        const xOff = (Math.random() * 2 - 1) * maxR;
        tx = cx + xOff;
        ty = baseY - hNorm * treeH;
        const rnd = Math.random();
        col = rnd < 0.45 ? '#10b981' : rnd < 0.78 ? '#6ee7b7' : rnd < 0.92 ? '#f6d88b' : '#ecfdf5';
        r = 1.1 + Math.random() * 1.6;
      }

      const ang0 = Math.random() * Math.PI * 2;
      const dist0 = Math.max(w, h) * (0.28 + Math.random() * 0.48);
      particles[i] = {
        sx: cx + Math.cos(ang0) * dist0,
        sy: h * 0.5 + Math.sin(ang0) * dist0,
        tx, ty, col, r,
        delay: Math.random() * 0.35,
        phase: Math.random() * Math.PI * 2
      };
    }

    function finish() {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      overlayEl.classList.add('fade-out');
      onComplete && onComplete();
      setTimeout(() => {
        overlayEl.style.display = 'none';
      }, 650);
    }

    if (skipBtn) {
      skipBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        finish();
      });
    }
    overlayEl.addEventListener('click', finish);
    window.addEventListener('resize', resize);

    function frame(now) {
      if (finished) return;
      const elapsed = (now - startTs) * 0.001;
      if (elapsed >= DURATION) {
        finish();
        return;
      }
      rafId = requestAnimationFrame(frame);

      // 深邃绿夜背景 + 顶部翡翠光晕
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#04110e';
      ctx.fillRect(0, 0, w, h);

      const glow = ctx.createRadialGradient(cx, h * 0.46, 10, cx, h * 0.46, treeH * 0.72);
      glow.addColorStop(0, 'rgba(16, 185, 129, 0.20)');
      glow.addColorStop(0.5, 'rgba(16, 185, 129, 0.06)');
      glow.addColorStop(1, 'rgba(4, 17, 14, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < COUNT; i++) {
        const p = particles[i];
        const localT = Math.min(1, Math.max(0, (elapsed - p.delay) / 2.0));
        // 丝滑缓出三次曲线
        const ease = 1 - Math.pow(1 - localT, 3);
        const swirl = (1 - ease) * 1.4;
        const dx = p.sx - p.tx;
        const dy = p.sy - p.ty;
        const cosS = Math.cos(swirl), sinS = Math.sin(swirl);
        const x = p.tx + (dx * cosS - dy * sinS) * (1 - ease);
        const y = p.ty + (dx * sinS + dy * cosS) * (1 - ease);

        const tw = 0.55 + 0.45 * Math.sin(elapsed * 5.0 + p.phase);
        ctx.globalAlpha = ease * tw * 0.92;
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(x, y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // 树顶星芒渐显
      const starAlpha = Math.max(0, Math.min(1, (elapsed - 1.5) / 1.0));
      if (starAlpha > 0) {
        const sy = baseY - treeH - 12;
        const sg = ctx.createRadialGradient(cx, sy, 2, cx, sy, 44);
        sg.addColorStop(0, `rgba(255, 245, 200, ${starAlpha})`);
        sg.addColorStop(0.4, `rgba(110, 231, 183, ${starAlpha * 0.45})`);
        sg.addColorStop(1, 'rgba(16, 185, 129, 0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(cx, sy, 44, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    rafId = requestAnimationFrame(frame);
  }

  return { run };
})();
