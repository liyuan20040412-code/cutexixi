/**
 * 翡翠璀璨圣诞树 · 高性能纯 WebGL 3D 渲染引擎
 * 基于原版「璀璨圣诞树 · Merry Christmas」全面重塑与提速：
 * - 完整保留：3D 倒角五角星、5 圈螺旋灯带、3D 旋转礼盒与金属彩球、树干、雪地光环、3D 金框环绕相册（点击/按住特写放大）、按住鼠标绽放爆发、星光漂浮模式
 * - 性能飞跃：全 GPU 粒子着色器 + 硬件实例化 3D 礼盒/彩球 + GPU 柔焦圆雪花 + 零 React 60fps 重渲染 + 智能动态分辨率缩放 (DRS)
 */
window.TreeEngine = (function () {
  const TAU = Math.PI * 2;
  const TREE_H = 15.0;
  const TREE_R = 6.0;
  const MAX_PARTICLES = 10000;
  const MAX_BOXES = 600;
  const MAX_BALLS = 600;
  const GARLAND_COUNT = 300;
  const SNOW_COUNT = 1400;

  /* ---------------- 零 GC 矩阵与向量工具 ---------------- */
  function mat4Create() { return new Float32Array(16); }
  function mat3Create() { return new Float32Array(9); }

  function mat4Identity(out) {
    out.fill(0);
    out[0] = out[5] = out[10] = out[15] = 1;
    return out;
  }

  function mat4Perspective(out, fovy, aspect, near, far) {
    const f = 1.0 / Math.tan(fovy * 0.5);
    const nf = 1.0 / (near - far);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[14] = 2 * far * near * nf;
    return out;
  }

  function mat4LookAt(out, ex, ey, ez, cx, cy, cz) {
    let zx = ex - cx, zy = ey - cy, zz = ez - cz;
    let len = Math.hypot(zx, zy, zz) || 1;
    zx /= len; zy /= len; zz /= len;

    let xx = zz, xy = 0, xz = -zx;
    len = Math.hypot(xx, xy, xz) || 1;
    xx /= len; xy /= len; xz /= len;

    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * ex + xy * ey + xz * ez);
    out[13] = -(yx * ex + yy * ey + yz * ez);
    out[14] = -(zx * ex + zy * ey + zz * ez);
    out[15] = 1;
    return out;
  }

  function mat4Mul(out, a, b) {
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      out[c * 4]     = a[0] * b0 + a[4] * b1 + a[8]  * b2 + a[12] * b3;
      out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9]  * b2 + a[13] * b3;
      out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    return out;
  }

  function mat4RotY(out, a) {
    mat4Identity(out);
    const c = Math.cos(a), s = Math.sin(a);
    out[0] = c; out[2] = -s;
    out[8] = s; out[10] = c;
    return out;
  }

  function mat4ComposeTRS(out, px, py, pz, rx, ry, rz, sx, sy, sz) {
    // Y * X * Z 欧拉旋转
    const cy = Math.cos(ry), sy0 = Math.sin(ry);
    const cx = Math.cos(rx), sx0 = Math.sin(rx);
    const cz = Math.cos(rz), sz0 = Math.sin(rz);

    const m00 = cy * cz + sy0 * sx0 * sz0;
    const m01 = cz * sy0 * sx0 - cy * sz0;
    const m02 = cx * sy0;
    const m10 = cx * sz0;
    const m11 = cx * cz;
    const m12 = -sx0;
    const m20 = cy * sx0 * sz0 - cz * sy0;
    const m21 = sy0 * sz0 + cy * cz * sx0;
    const m22 = cy * cx;

    out[0] = m00 * sx; out[1] = m10 * sx; out[2]  = m20 * sx; out[3]  = 0;
    out[4] = m01 * sy; out[5] = m11 * sy; out[6]  = m21 * sy; out[7]  = 0;
    out[8] = m02 * sz; out[9] = m12 * sz; out[10] = m22 * sz; out[11] = 0;
    out[12] = px;      out[13] = py;      out[14] = pz;       out[15] = 1;
    return out;
  }

  function mat3NormalFromMat4(out, m) {
    // 对均匀缩放/旋转矩阵提取归一化 3x3
    out[0] = m[0]; out[1] = m[1]; out[2] = m[2];
    out[3] = m[4]; out[4] = m[5]; out[5] = m[6];
    out[6] = m[8]; out[7] = m[9]; out[8] = m[10];
    return out;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- 3D 几何体构建器 ---------------- */
  function createCubeGeometry() {
    const pos = [], norm = [], uv = [], idx = [];
    const faces = [
      { n: [0, 0, 1],  v: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
      { n: [0, 0, -1], v: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
      { n: [0, 1, 0],  v: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
      { n: [0, -1, 0], v: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] },
      { n: [1, 0, 0],  v: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]] },
      { n: [-1, 0, 0], v: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]] }
    ];
    faces.forEach((f, fi) => {
      const base = fi * 4;
      const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
      f.v.forEach((p, vi) => {
        pos.push(p[0], p[1], p[2]);
        norm.push(f.n[0], f.n[1], f.n[2]);
        uv.push(uvs[vi][0], uvs[vi][1]);
      });
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    return {
      pos: new Float32Array(pos),
      norm: new Float32Array(norm),
      uv: new Float32Array(uv),
      idx: new Uint16Array(idx)
    };
  }

  function createSphereGeometry(radius, wSeg, hSeg) {
    const pos = [], norm = [], uv = [], idx = [];
    for (let y = 0; y <= hSeg; y++) {
      const v = y / hSeg;
      const phi = v * Math.PI;
      const sp = Math.sin(phi), cp = Math.cos(phi);
      for (let x = 0; x <= wSeg; x++) {
        const u = x / wSeg;
        const theta = u * TAU;
        const nx = Math.cos(theta) * sp;
        const ny = cp;
        const nz = Math.sin(theta) * sp;
        pos.push(nx * radius, ny * radius, nz * radius);
        norm.push(nx, ny, nz);
        uv.push(u, v);
      }
    }
    const stride = wSeg + 1;
    for (let y = 0; y < hSeg; y++) {
      for (let x = 0; x < wSeg; x++) {
        const a = y * stride + x;
        const b = a + stride;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    return {
      pos: new Float32Array(pos),
      norm: new Float32Array(norm),
      uv: new Float32Array(uv),
      idx: new Uint16Array(idx)
    };
  }

  function createCylinderGeometry(rTop, rBot, height, segs) {
    const pos = [], norm = [], idx = [];
    const halfH = height * 0.5;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      pos.push(ca * rTop, halfH, sa * rTop);
      norm.push(ca, 0.15, sa);
      pos.push(ca * rBot, -halfH, sa * rBot);
      norm.push(ca, 0.15, sa);
    }
    for (let i = 0; i < segs; i++) {
      const b = i * 2;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
    return { pos: new Float32Array(pos), norm: new Float32Array(norm), idx: new Uint16Array(idx) };
  }

  // 3D 立体倒角晶体五角星（前后面立体棱锥切面，高光熠熠生辉）
  function createStar3DGeometry(outerR, innerR, depth) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = (i / 10) * TAU + Math.PI * 0.5;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const pos = [], norm = [], idx = [];
    function pushTri(a, b, c) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const base = pos.length / 3;
      pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      norm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
      idx.push(base, base + 1, base + 2);
    }
    const front = [0, 0, depth];
    const back = [0, 0, -depth];
    for (let i = 0; i < 10; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % 10];
      pushTri(front, [p0[0], p0[1], 0], [p1[0], p1[1], 0]);
      pushTri(back, [p1[0], p1[1], 0], [p0[0], p0[1], 0]);
    }
    return { pos: new Float32Array(pos), norm: new Float32Array(norm), idx: new Uint16Array(idx) };
  }

  // 3D 相框四条边框合并为一个网格（单次 Draw Call，比原版 4 个 mesh 更高效）
  function createPhotoFrameGeometry(w, h, border, depth) {
    const cube = createCubeGeometry();
    const bars = [
      { tx: 0, ty: (h + border) * 0.5, tz: 0, sx: w + border * 2, sy: border, sz: depth },
      { tx: 0, ty: -(h + border) * 0.5, tz: 0, sx: w + border * 2, sy: border, sz: depth },
      { tx: -(w + border) * 0.5, ty: 0, tz: 0, sx: border, sy: h, sz: depth },
      { tx: (w + border) * 0.5, ty: 0, tz: 0, sx: border, sy: h, sz: depth }
    ];
    const pos = [], norm = [], idx = [];
    bars.forEach((bar) => {
      const vBase = pos.length / 3;
      for (let i = 0; i < cube.pos.length; i += 3) {
        pos.push(
          cube.pos[i] * bar.sx + bar.tx,
          cube.pos[i + 1] * bar.sy + bar.ty,
          cube.pos[i + 2] * bar.sz + bar.tz
        );
        norm.push(cube.norm[i], cube.norm[i + 1], cube.norm[i + 2]);
      }
      for (let i = 0; i < cube.idx.length; i++) {
        idx.push(cube.idx[i] + vBase);
      }
    });
    return { pos: new Float32Array(pos), norm: new Float32Array(norm), idx: new Uint16Array(idx) };
  }

  function createFloorDiscGeometry(radius, segs) {
    const pos = [0, -TREE_H * 0.5 - 0.3, 0];
    const idx = [];
    const y = -TREE_H * 0.5 - 0.3;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * TAU;
      pos.push(Math.cos(a) * radius, y, Math.sin(a) * radius);
    }
    for (let i = 1; i <= segs; i++) {
      idx.push(0, i + 1, i);
    }
    return { pos: new Float32Array(pos), idx: new Uint16Array(idx) };
  }

  // 雕塑级分层云杉圣诞树半径函数（保留 15×6 宏伟比例，增添自然分层松枝曲线）
  function tieredTreeRadius(hNorm, angle) {
    const cone = Math.pow(1.0 - hNorm, 0.90) * TREE_R;
    const tiers = 8.0;
    const tp = hNorm * tiers;
    const ti = Math.floor(tp);
    const tf = tp - ti;
    const flare = 0.78 + 0.30 * Math.pow(1.0 - tf, 0.72);
    const branches = 7 + (ti % 3) * 2;
    const lobe = 0.90 + 0.12 * Math.cos(angle * branches + ti * 1.17);
    const tipSmooth = hNorm > 0.93 ? 1.0 - ((hNorm - 0.93) / 0.07) * 0.52 : 1.0;
    return Math.max(0.08, cone * flare * lobe * tipSmooth);
  }

  /* ---------------- WebGL 工具 ---------------- */
  function compileShader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('Shader error: ' + err);
    }
    return s;
  }

  function createProgram(gl, vs, fs) {
    const p = gl.createProgram();
    const s1 = compileShader(gl, gl.VERTEX_SHADER, vs);
    const s2 = compileShader(gl, gl.FRAGMENT_SHADER, fs);
    gl.attachShader(p, s1);
    gl.attachShader(p, s2);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const err = gl.getProgramInfoLog(p);
      gl.deleteProgram(p);
      throw new Error('Link error: ' + err);
    }
    gl.deleteShader(s1);
    gl.deleteShader(s2);
    return p;
  }

  function makeBuf(gl, data, target) {
    const b = gl.createBuffer();
    const t = target || gl.ARRAY_BUFFER;
    gl.bindBuffer(t, b);
    gl.bufferData(t, data, gl.STATIC_DRAW);
    return b;
  }

  /* ---------------- 主引擎构建 ---------------- */
  function create(canvas, initialState, callbacks) {
    const cb = callbacks || {};
    let isWebGL2 = true;
    let gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      depth: true,
      powerPreference: 'high-performance'
    });
    let instExt = null;

    if (!gl) {
      isWebGL2 = false;
      gl = canvas.getContext('webgl', {
        alpha: false,
        antialias: true,
        depth: true,
        powerPreference: 'high-performance'
      });
      if (!gl) throw new Error('当前浏览器不支持 WebGL，请使用 Chrome / Edge / Safari 打开。');
      instExt = gl.getExtension('ANGLE_instanced_arrays');
    }

    const vertexAttribDivisor = isWebGL2
      ? (loc, d) => gl.vertexAttribDivisor(loc, d)
      : instExt
        ? (loc, d) => instExt.vertexAttribDivisorANGLE(loc, d)
        : () => {};

    const drawElementsInstanced = isWebGL2
      ? (mode, count, type, off, inst) => gl.drawElementsInstanced(mode, count, type, off, inst)
      : instExt
        ? (mode, count, type, off, inst) => instExt.drawElementsInstancedANGLE(mode, count, type, off, inst)
        : () => {};

    const S = window.TreeShaders;
    const Cfg = window.TreeConfig;
    const maxPtRange = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    const maxPointSize = Math.min(128.0, maxPtRange ? maxPtRange[1] : 64.0);

    // 编译全部着色器程序
    const progSky      = createProgram(gl, S.SKY_VERT, S.SKY_FRAG);
    const progFloor    = createProgram(gl, S.FLOOR_VERT, S.FLOOR_FRAG);
    const progMesh     = createProgram(gl, S.MESH_VERT, S.MESH_FRAG);
    const progInst     = createProgram(gl, S.INST_VERT, S.INST_FRAG);
    const progParticle = createProgram(gl, S.PARTICLE_VERT, S.PARTICLE_FRAG);
    const progFlare    = createProgram(gl, S.FLARE_VERT, S.FLARE_FRAG);
    const progPhoto    = createProgram(gl, S.PHOTO_VERT, S.PHOTO_FRAG);
    const progSnow     = createProgram(gl, S.SNOW_VERT, S.SNOW_FRAG);

    const getLoc = (p, attrs, unifs) => {
      const o = {};
      attrs.forEach((a) => { o[a] = gl.getAttribLocation(p, a); });
      unifs.forEach((u) => { o[u] = gl.getUniformLocation(p, u); });
      return o;
    };

    const locSky = getLoc(progSky, ['aPos'], ['uTime', 'uAspect', 'uAudio', 'uBgColor', 'uAccentA', 'uAccentB']);
    const locFloor = getLoc(progFloor, ['aPos'], ['uViewProj', 'uCamPos', 'uTime', 'uAudio', 'uFogColor', 'uFloorColor', 'uRingColor', 'uGoldColor']);
    const locMesh = getLoc(progMesh, ['aPos', 'aNormal'], ['uModel', 'uViewProj', 'uNormalMat', 'uCamPos', 'uColor', 'uEmissive', 'uMetalness', 'uRoughness', 'uKeyColor', 'uRimColor', 'uFogColor']);
    const locInst = getLoc(progInst,
      ['aPos', 'aNormal', 'aUv', 'iTreePos', 'iFloatPos', 'iExplodeDir', 'iMeta'],
      ['uViewProj', 'uTreeRot', 'uCamPos', 'uTime', 'uFloatMix', 'uExplode', 'uAudio', 'uRotSpeed', 'uIsBox', 'uColorA', 'uColorB', 'uRibbonColor', 'uKeyColor', 'uRimColor', 'uFogColor']
    );
    const locPart = getLoc(progParticle,
      ['aTreePos', 'aFloatPos', 'aExplodeDir', 'aMeta'],
      ['uViewProj', 'uTreeRot', 'uTime', 'uPointScale', 'uMaxPointSize', 'uFloatMix', 'uExplode', 'uAudio', 'uDeepColor', 'uPrimaryColor', 'uAccentColor', 'uMintColor']
    );
    const locFlare = getLoc(progFlare, ['aCorner'], ['uView', 'uProj', 'uWorldPos', 'uScale', 'uTime', 'uAudio', 'uCoreColor', 'uHaloColor']);
    const locPhoto = getLoc(progPhoto, ['aPos', 'aUv'], ['uModel', 'uViewProj', 'uTex', 'uHighlight']);
    const locSnow = getLoc(progSnow, ['aInitPos', 'aParam'], ['uViewProj', 'uTime', 'uPointScale', 'uMaxPointSize']);

    /* ---------------- 静态网格缓冲区 ---------------- */
    const skyBuf = makeBuf(gl, new Float32Array([-1, -1, 3, -1, -1, 3]));
    const flareBuf = makeBuf(gl, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));

    const floorGeo = createFloorDiscGeometry(34, 64);
    const floorPosBuf = makeBuf(gl, floorGeo.pos);
    const floorIdxBuf = makeBuf(gl, floorGeo.idx, gl.ELEMENT_ARRAY_BUFFER);

    const trunkGeo = createCylinderGeometry(0.55, 0.88, 2.5, 16);
    const trunkPosBuf = makeBuf(gl, trunkGeo.pos);
    const trunkNormBuf = makeBuf(gl, trunkGeo.norm);
    const trunkIdxBuf = makeBuf(gl, trunkGeo.idx, gl.ELEMENT_ARRAY_BUFFER);

    const starGeo = createStar3DGeometry(0.92, 0.40, 0.28);
    const starPosBuf = makeBuf(gl, starGeo.pos);
    const starNormBuf = makeBuf(gl, starGeo.norm);
    const starIdxBuf = makeBuf(gl, starGeo.idx, gl.ELEMENT_ARRAY_BUFFER);

    const cubeGeo = createCubeGeometry();
    const cubePosBuf = makeBuf(gl, cubeGeo.pos);
    const cubeNormBuf = makeBuf(gl, cubeGeo.norm);
    const cubeUvBuf = makeBuf(gl, cubeGeo.uv);
    const cubeIdxBuf = makeBuf(gl, cubeGeo.idx, gl.ELEMENT_ARRAY_BUFFER);

    const ballGeo = createSphereGeometry(0.62, 12, 10);
    const ballPosBuf = makeBuf(gl, ballGeo.pos);
    const ballNormBuf = makeBuf(gl, ballGeo.norm);
    const ballUvBuf = makeBuf(gl, ballGeo.uv);
    const ballIdxBuf = makeBuf(gl, ballGeo.idx, gl.ELEMENT_ARRAY_BUFFER);

    // 3D 照片卡片（1.45 x 1.45）+ 3D 金属边框
    const PHOTO_SIZE = 1.45;
    const frameGeo = createPhotoFrameGeometry(PHOTO_SIZE, PHOTO_SIZE, 0.09, 0.08);
    const framePosBuf = makeBuf(gl, frameGeo.pos);
    const frameNormBuf = makeBuf(gl, frameGeo.norm);
    const frameIdxBuf = makeBuf(gl, frameGeo.idx, gl.ELEMENT_ARRAY_BUFFER);

    const hs = PHOTO_SIZE * 0.5;
    const photoQuadPos = makeBuf(gl, new Float32Array([-hs, -hs, 0, hs, -hs, 0, -hs, hs, 0, hs, hs, 0]));
    const photoQuadUv = makeBuf(gl, new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]));

    /* ---------------- 构建树体粒子 + 螺旋灯带 GPU 缓冲 ---------------- */
    const rand = mulberry32(20251225);

    function buildTreeParticles() {
      const treePos = new Float32Array(MAX_PARTICLES * 3);
      const floatPos = new Float32Array(MAX_PARTICLES * 3);
      const explodeDir = new Float32Array(MAX_PARTICLES * 3);
      const meta = new Float32Array(MAX_PARTICLES * 4);

      for (let i = 0; i < MAX_PARTICLES; i++) {
        // 面积加权高度采样：底部丰盈、顶部不扎堆
        const hNorm = 1.0 - Math.pow(rand(), 0.62);
        const y = hNorm * TREE_H - TREE_H * 0.5;
        const angle = rand() * TAU;
        const maxR = tieredTreeRadius(hNorm, angle);
        const radial = 0.18 + 0.82 * Math.pow(rand(), 0.48);
        const r = maxR * radial;
        const droop = radial * radial * (0.55 * (1.0 - hNorm * 0.65));

        treePos[i * 3]     = Math.cos(angle) * r;
        treePos[i * 3 + 1] = y - droop;
        treePos[i * 3 + 2] = Math.sin(angle) * r;

        // 星光漂浮模式（26 x 20 x 22 梦幻星云）
        floatPos[i * 3]     = (rand() - 0.5) * 26.0;
        floatPos[i * 3 + 1] = (rand() - 0.5) * 20.0;
        floatPos[i * 3 + 2] = (rand() - 0.5) * 22.0;

        // 球面均匀爆发方向
        let ex = rand() * 2 - 1, ey = rand() * 2 - 1, ez = rand() * 2 - 1;
        const el = Math.hypot(ex, ey, ez) || 1;
        explodeDir[i * 3] = ex / el;
        explodeDir[i * 3 + 1] = ey / el;
        explodeDir[i * 3 + 2] = ez / el;

        // 色彩层次分配：34% 深森绿、38% 翡翠主光、16% 香槟金四芒星、12% 薄荷霜尖
        const cRnd = rand();
        let role = 1.0;
        if (radial < 0.65 && cRnd < 0.62) role = 0.0;
        else if (cRnd < 0.30) role = 0.0;
        else if (cRnd < 0.72) role = 1.0;
        else if (cRnd < 0.88) role = 2.0;
        else role = 3.0;

        const baseSize = role >= 2.0 ? (0.24 + rand() * 0.18) : (0.16 + rand() * 0.14);
        meta[i * 4]     = rand() * TAU;
        meta[i * 4 + 1] = 0.8 + rand() * 2.4;
        meta[i * 4 + 2] = baseSize;
        meta[i * 4 + 3] = role;
      }

      return {
        treePosBuf: makeBuf(gl, treePos),
        floatPosBuf: makeBuf(gl, floatPos),
        explodeBuf: makeBuf(gl, explodeDir),
        metaBuf: makeBuf(gl, meta)
      };
    }

    function buildGarlandParticles() {
      const treePos = new Float32Array(GARLAND_COUNT * 3);
      const floatPos = new Float32Array(GARLAND_COUNT * 3);
      const explodeDir = new Float32Array(GARLAND_COUNT * 3);
      const meta = new Float32Array(GARLAND_COUNT * 4);
      const turns = 5.2;

      for (let i = 0; i < GARLAND_COUNT; i++) {
        const t = i / GARLAND_COUNT;
        const hNorm = 0.03 + t * 0.93;
        const y = hNorm * TREE_H - TREE_H * 0.5;
        const angle = t * turns * TAU;
        const r = tieredTreeRadius(hNorm, angle) * 1.05 + 0.16;

        treePos[i * 3]     = Math.cos(angle) * r;
        treePos[i * 3 + 1] = y - 0.35 * (1.0 - hNorm * 0.65);
        treePos[i * 3 + 2] = Math.sin(angle) * r;

        floatPos[i * 3]     = (rand() - 0.5) * 24.0;
        floatPos[i * 3 + 1] = (rand() - 0.5) * 18.0;
        floatPos[i * 3 + 2] = (rand() - 0.5) * 20.0;

        let ex = Math.cos(angle), ey = (rand() - 0.5) * 0.8, ez = Math.sin(angle);
        const el = Math.hypot(ex, ey, ez) || 1;
        explodeDir[i * 3] = ex / el;
        explodeDir[i * 3 + 1] = ey / el;
        explodeDir[i * 3 + 2] = ez / el;

        meta[i * 4]     = rand() * TAU;
        meta[i * 4 + 1] = 2.2;
        meta[i * 4 + 2] = 0.34;
        meta[i * 4 + 3] = 4.0; // garland role
      }

      return {
        treePosBuf: makeBuf(gl, treePos),
        floatPosBuf: makeBuf(gl, floatPos),
        explodeBuf: makeBuf(gl, explodeDir),
        metaBuf: makeBuf(gl, meta)
      };
    }

    function buildOrnamentInstances(maxCount, isBox) {
      const treePos = new Float32Array(maxCount * 3);
      const floatPos = new Float32Array(maxCount * 3);
      const explodeDir = new Float32Array(maxCount * 3);
      const meta = new Float32Array(maxCount * 4);
      const goldenAngle = 2.39996323;

      for (let i = 0; i < maxCount; i++) {
        // 使用低差异黄金分割高度采样：无论滑块调到多少数量，始终从树底到树顶均匀错落分布！
        const u = (i * 0.61803398875 + (isBox ? 0.13 : 0.67)) % 1.0;
        const hNorm = 0.04 + (1.0 - Math.sqrt(u)) * 0.87;
        const y = hNorm * TREE_H - TREE_H * 0.5;
        const angle = i * goldenAngle + (isBox ? 0.0 : 1.57) + (rand() - 0.5) * 0.35;
        const maxR = tieredTreeRadius(hNorm, angle);
        const r = maxR * (0.76 + rand() * 0.28);

        treePos[i * 3]     = Math.cos(angle) * r;
        treePos[i * 3 + 1] = y - 0.28 * (1.0 - hNorm * 0.65);
        treePos[i * 3 + 2] = Math.sin(angle) * r;

        floatPos[i * 3]     = (rand() - 0.5) * 25.0;
        floatPos[i * 3 + 1] = (rand() - 0.5) * 20.0;
        floatPos[i * 3 + 2] = (rand() - 0.5) * 20.0;

        let ex = rand() * 2 - 1, ey = rand() * 2 - 1, ez = rand() * 2 - 1;
        const el = Math.hypot(ex, ey, ez) || 1;
        explodeDir[i * 3] = ex / el;
        explodeDir[i * 3 + 1] = ey / el;
        explodeDir[i * 3 + 2] = ez / el;

        // 精致珠宝比例：顶部略小、底部略大，不遮挡翡翠星光树身
        const heightShrink = 1.06 - hNorm * 0.28;
        const baseScale = (isBox ? (0.24 + rand() * 0.17) : (0.20 + rand() * 0.16)) * heightShrink;
        meta[i * 4]     = baseScale;
        meta[i * 4 + 1] = rand() * TAU;
        meta[i * 4 + 2] = rand() * TAU;
        meta[i * 4 + 3] = i % 2 === 0 ? 0.0 : 1.0;
      }

      return {
        treePosBuf: makeBuf(gl, treePos),
        floatPosBuf: makeBuf(gl, floatPos),
        explodeBuf: makeBuf(gl, explodeDir),
        metaBuf: makeBuf(gl, meta)
      };
    }

    function buildSnowBuffers() {
      const initPos = new Float32Array(SNOW_COUNT * 3);
      const param = new Float32Array(SNOW_COUNT * 4);
      for (let i = 0; i < SNOW_COUNT; i++) {
        const rad = Math.sqrt(rand()) * 28.0;
        const a = rand() * TAU;
        initPos[i * 3]     = Math.cos(a) * rad;
        initPos[i * 3 + 1] = -8.5 + rand() * 26.0;
        initPos[i * 3 + 2] = Math.sin(a) * rad;

        param[i * 4]     = 0.7 + rand() * 1.25;  // fall speed
        param[i * 4 + 1] = rand() * TAU;         // driftPhase
        param[i * 4 + 2] = 0.25 + rand() * 0.65; // driftAmp
        param[i * 4 + 3] = 0.20 + rand() * 0.24; // bokeh size
      }
      return { initPosBuf: makeBuf(gl, initPos), paramBuf: makeBuf(gl, param) };
    }

    const treePartBufs = buildTreeParticles();
    const garlandBufs = buildGarlandParticles();
    const boxInstBufs = buildOrnamentInstances(MAX_BOXES, true);
    const ballInstBufs = buildOrnamentInstances(MAX_BALLS, false);
    const snowBufs = buildSnowBuffers();

    /* ---------------- 3D 环绕照片墙管理 (WebGL 纹理 + 平滑飞至镜头特写) ---------------- */
    let photoItems = []; // { id, url, tex, basePos, baseRotY, curPos, curRotX, curRotY, curScale }
    let zoomedPhotoId = null;

    function createPhotoTexture(url) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      // 1x1 占位翡翠暗色，防止加载闪烁
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([10, 40, 30, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      };
      img.src = url;
      return tex;
    }

    function setGallery(items) {
      const existingMap = new Map(photoItems.map((p) => [p.id, p]));
      const nextIds = new Set(items.map((it) => it.id));
      // 清理被删除的照片纹理，防止显存泄漏
      photoItems.forEach((p) => {
        if (!nextIds.has(p.id) && p.tex) gl.deleteTexture(p.tex);
      });

      const count = items.length;
      const radius = 9.2;
      photoItems = items.map((it, idx) => {
        const angle = (idx / Math.max(1, count)) * TAU + 0.4;
        const by = ((idx % 3) - 1) * 2.2 + Math.sin(idx * 2.1) * 0.8;
        const bx = Math.sin(angle) * radius;
        const bz = Math.cos(angle) * radius;
        const old = existingMap.get(it.id);
        if (old) {
          old.basePos[0] = bx; old.basePos[1] = by; old.basePos[2] = bz;
          old.baseRotY = angle;
          return old;
        }
        return {
          id: it.id,
          url: it.url,
          tex: createPhotoTexture(it.url),
          basePos: [bx, by, bz],
          baseRotY: angle,
          curPos: [bx, by, bz],
          curRotX: 0,
          curRotY: angle,
          curScale: 1.0
        };
      });

      if (zoomedPhotoId && !nextIds.has(zoomedPhotoId)) {
        zoomedPhotoId = null;
      }
    }

    /* ---------------- 渲染状态与色彩平滑插值 ---------------- */
    const state = Object.assign({}, initialState);
    let preset = Cfg.PRESETS[state.presetId] || Cfg.PRESETS.emerald;

    const colors = {
      bg: new Float32Array(Cfg.hexToRgb01(preset.bg)),
      floor: new Float32Array(Cfg.hexToRgb01(preset.floorColor)),
      ring: new Float32Array(Cfg.hexToRgb01(preset.ringColor)),
      deep: new Float32Array(Cfg.hexToRgb01(preset.particleDeep)),
      primary: new Float32Array(Cfg.hexToRgb01(state.particleColor1)),
      accent: new Float32Array(Cfg.hexToRgb01(state.particleColor2)),
      mint: new Float32Array(Cfg.hexToRgb01(preset.particleMint)),
      boxA: new Float32Array(Cfg.hexToRgb01(state.boxColor1)),
      boxB: new Float32Array(Cfg.hexToRgb01(state.boxColor2)),
      bell: new Float32Array(Cfg.hexToRgb01(state.bellColor)),
      ribbon: new Float32Array(Cfg.hexToRgb01(preset.ribbonColor)),
      star: new Float32Array(Cfg.hexToRgb01(preset.starColor))
    };

    const targetColors = {};
    Object.keys(colors).forEach((k) => { targetColors[k] = new Float32Array(colors[k]); });

    function syncTargetColors() {
      preset = Cfg.PRESETS[state.presetId] || Cfg.PRESETS.emerald;
      targetColors.bg.set(Cfg.hexToRgb01(preset.bg));
      targetColors.floor.set(Cfg.hexToRgb01(preset.floorColor));
      targetColors.ring.set(Cfg.hexToRgb01(preset.ringColor));
      targetColors.deep.set(Cfg.hexToRgb01(preset.particleDeep));
      targetColors.primary.set(Cfg.hexToRgb01(state.particleColor1));
      targetColors.accent.set(Cfg.hexToRgb01(state.particleColor2));
      targetColors.mint.set(Cfg.hexToRgb01(preset.particleMint));
      targetColors.boxA.set(Cfg.hexToRgb01(state.boxColor1));
      targetColors.boxB.set(Cfg.hexToRgb01(state.boxColor2));
      targetColors.bell.set(Cfg.hexToRgb01(state.bellColor));
      targetColors.ribbon.set(Cfg.hexToRgb01(preset.ribbonColor));
      targetColors.star.set(Cfg.hexToRgb01(preset.starColor));
    }

    /* ---------------- 相机与交互状态 ---------------- */
    const cam = {
      yaw: 0.0,
      targetYaw: 0.0,
      pitch: 0.07,
      targetPitch: 0.07,
      dist: 22.0,
      targetDist: 22.0,
      x: 0, y: 1.5, z: 22.0
    };

    let treeRotY = -Math.PI * 0.25;
    let floatMix = state.mode === 'FLOAT' ? 1.0 : 0.0;
    let explodeLevel = 0.0;
    let pointerHolding = false;
    let gestureExplode = false;
    let audioLevel = 0.0;

    // 预分配所有渲染矩阵 (Zero-GC)
    const matProj = mat4Create();
    const matView = mat4Create();
    const matViewProj = mat4Create();
    const matTreeRot = mat4Create();
    const matModel = mat4Create();
    const matNormal = mat3Create();

    /* ---------------- 智能分辨率与 FPS 监控 ---------------- */
    let width = 1, height = 1, aspect = 1, dpr = 1;
    let renderScale = 1.0;
    let ecoMode = false;
    let paused = false;
    let simTime = 0;
    let lastTs = 0;
    let fpsAccum = 0;
    let fpsFrames = 0;
    let lowFpsHits = 0;
    let rafId = 0;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const cw = Math.max(1, rect.width || window.innerWidth);
      const ch = Math.max(1, rect.height || window.innerHeight);
      const maxDpr = ecoMode ? 1.25 : Math.min(window.devicePixelRatio || 1, 1.85);
      dpr = maxDpr * renderScale;
      width = Math.max(1, Math.round(cw * dpr));
      height = Math.max(1, Math.round(ch * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      aspect = cw / ch;
      gl.viewport(0, 0, width, height);
    }

    /* ---------------- 仅在点击时执行的轻量级 3D 照片命中检测 ---------------- */
    function hitTestPhoto(clientX, clientY) {
      if (photoItems.length === 0) return null;
      const rect = canvas.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      const cw = rect.width || window.innerWidth;
      const ch = rect.height || window.innerHeight;

      let bestId = null;
      let bestDepth = Infinity;

      for (let i = 0; i < photoItems.length; i++) {
        const p = photoItems[i];
        // p.curPos 已在世界坐标系中，直接投影检测命中
        const wx = p.curPos[0], wy = p.curPos[1], wz = p.curPos[2];
        const m = matViewProj;
        const cx = m[0] * wx + m[4] * wy + m[8] * wz + m[12];
        const cy = m[1] * wx + m[5] * wy + m[9] * wz + m[13];
        const w = m[3] * wx + m[7] * wy + m[11] * wz + m[15];
        if (w <= 0.5) continue;

        const px = (cx / w * 0.5 + 0.5) * cw;
        const py = (0.5 - cy / w * 0.5) * ch;
        const hitRadius = (PHOTO_SIZE * p.curScale * ch * 0.62) / w;
        if (Math.abs(sx - px) <= hitRadius && Math.abs(sy - py) <= hitRadius && w < bestDepth) {
          bestDepth = w;
          bestId = p.id;
        }
      }
      return bestId;
    }

    /* ---------------- 指针与双指缩放交互（还原原版拖动旋转 + 按住绽放 + 点击放大照片） ---------------- */
    const pointers = new Map();
    let dragging = false;
    let dragMoved = false;
    let downX = 0, downY = 0, lastX = 0, lastY = 0;
    let holdTimer = null;
    let pinchDist0 = 0, pinchCam0 = 22.0;

    function clearHold() {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      pointerHolding = false;
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (e.target !== canvas) return;
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 1) {
        dragging = true;
        dragMoved = false;
        downX = lastX = e.clientX;
        downY = lastY = e.clientY;

        // 按住 160ms 不大幅拖动即可触发星光绽放（与原版「按住鼠标让星光绽放」一致）
        clearHold();
        holdTimer = setTimeout(() => {
          if (dragging && !zoomedPhotoId) {
            pointerHolding = true;
            if (cb.onBloomChange) cb.onBloomChange(true);
          }
        }, 160);
      } else if (pointers.size === 2) {
        clearHold();
        dragging = false;
        const pts = Array.from(pointers.values());
        pinchDist0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        pinchCam0 = cam.targetDist;
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 2) {
        const pts = Array.from(pointers.values());
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        cam.targetDist = Math.min(44, Math.max(8, pinchCam0 * (pinchDist0 / d)));
        return;
      }

      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) {
        dragMoved = true;
      }

      cam.targetYaw -= dx * 0.0062;
      cam.targetPitch = Math.max(-0.22, Math.min(0.68, cam.targetPitch + dy * 0.0048));
    });

    function onPointerEnd(e) {
      if (!pointers.has(e.pointerId)) return;
      const wasBloom = pointerHolding;
      clearHold();
      if (wasBloom && cb.onBloomChange) cb.onBloomChange(false);

      if (pointers.size === 1 && !dragMoved && !wasBloom) {
        // 单击检测：若点中 3D 照片卡片则放大特写，否则关闭当前特写
        const hitId = hitTestPhoto(e.clientX, e.clientY);
        if (hitId) {
          zoomedPhotoId = zoomedPhotoId === hitId ? null : hitId;
        } else if (zoomedPhotoId) {
          zoomedPhotoId = null;
        }
      }

      pointers.delete(e.pointerId);
      if (pointers.size === 0) dragging = false;
    }

    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = Math.sign(e.deltaY) * Math.min(2.4, Math.abs(e.deltaY) * 0.012);
      cam.targetDist = Math.min(44, Math.max(8, cam.targetDist + step));
    }, { passive: false });
    window.addEventListener('resize', resize);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
      } else if (!paused && !rafId) {
        lastTs = performance.now();
        rafId = requestAnimationFrame(render);
      }
    });

    /* ---------------- 辅助绘制函数 ---------------- */
    function drawInstancedOrnament(geo, posBuf, normBuf, uvBuf, idxBuf, instBufs, count, isBox, colA, colB, rotSpeed) {
      if (count <= 0) return;
      gl.useProgram(progInst);

      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.enableVertexAttribArray(locInst.aPos);
      gl.vertexAttribPointer(locInst.aPos, 3, gl.FLOAT, false, 0, 0);
      vertexAttribDivisor(locInst.aPos, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
      gl.enableVertexAttribArray(locInst.aNormal);
      gl.vertexAttribPointer(locInst.aNormal, 3, gl.FLOAT, false, 0, 0);
      vertexAttribDivisor(locInst.aNormal, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
      gl.enableVertexAttribArray(locInst.aUv);
      gl.vertexAttribPointer(locInst.aUv, 2, gl.FLOAT, false, 0, 0);
      vertexAttribDivisor(locInst.aUv, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, instBufs.treePosBuf);
      gl.enableVertexAttribArray(locInst.iTreePos);
      gl.vertexAttribPointer(locInst.iTreePos, 3, gl.FLOAT, false, 0, 0);
      vertexAttribDivisor(locInst.iTreePos, 1);

      gl.bindBuffer(gl.ARRAY_BUFFER, instBufs.floatPosBuf);
      gl.enableVertexAttribArray(locInst.iFloatPos);
      gl.vertexAttribPointer(locInst.iFloatPos, 3, gl.FLOAT, false, 0, 0);
      vertexAttribDivisor(locInst.iFloatPos, 1);

      gl.bindBuffer(gl.ARRAY_BUFFER, instBufs.explodeBuf);
      gl.enableVertexAttribArray(locInst.iExplodeDir);
      gl.vertexAttribPointer(locInst.iExplodeDir, 3, gl.FLOAT, false, 0, 0);
      vertexAttribDivisor(locInst.iExplodeDir, 1);

      gl.bindBuffer(gl.ARRAY_BUFFER, instBufs.metaBuf);
      gl.enableVertexAttribArray(locInst.iMeta);
      gl.vertexAttribPointer(locInst.iMeta, 4, gl.FLOAT, false, 0, 0);
      vertexAttribDivisor(locInst.iMeta, 1);

      gl.uniformMatrix4fv(locInst.uViewProj, false, matViewProj);
      gl.uniformMatrix4fv(locInst.uTreeRot, false, matTreeRot);
      gl.uniform3f(locInst.uCamPos, cam.x, cam.y, cam.z);
      gl.uniform1f(locInst.uTime, simTime);
      gl.uniform1f(locInst.uFloatMix, floatMix);
      gl.uniform1f(locInst.uExplode, explodeLevel);
      gl.uniform1f(locInst.uAudio, audioLevel);
      gl.uniform1f(locInst.uRotSpeed, rotSpeed);
      gl.uniform1f(locInst.uIsBox, isBox ? 1.0 : 0.0);
      gl.uniform3fv(locInst.uColorA, colA);
      gl.uniform3fv(locInst.uColorB, colB);
      gl.uniform3fv(locInst.uRibbonColor, colors.ribbon);
      gl.uniform3fv(locInst.uKeyColor, colors.star);
      gl.uniform3fv(locInst.uRimColor, colors.primary);
      gl.uniform3fv(locInst.uFogColor, colors.bg);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
      drawElementsInstanced(gl.TRIANGLES, geo.idx.length, gl.UNSIGNED_SHORT, 0, count);

      // 重置 divisor，避免影响后续普通 Draw Call
      vertexAttribDivisor(locInst.iTreePos, 0);
      vertexAttribDivisor(locInst.iFloatPos, 0);
      vertexAttribDivisor(locInst.iExplodeDir, 0);
      vertexAttribDivisor(locInst.iMeta, 0);
      gl.disableVertexAttribArray(locInst.aPos);
      gl.disableVertexAttribArray(locInst.aNormal);
      gl.disableVertexAttribArray(locInst.aUv);
      gl.disableVertexAttribArray(locInst.iTreePos);
      gl.disableVertexAttribArray(locInst.iFloatPos);
      gl.disableVertexAttribArray(locInst.iExplodeDir);
      gl.disableVertexAttribArray(locInst.iMeta);
    }

    function drawParticleSet(bufs, count, pointScale) {
      if (count <= 0) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.treePosBuf);
      gl.enableVertexAttribArray(locPart.aTreePos);
      gl.vertexAttribPointer(locPart.aTreePos, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.floatPosBuf);
      gl.enableVertexAttribArray(locPart.aFloatPos);
      gl.vertexAttribPointer(locPart.aFloatPos, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.explodeBuf);
      gl.enableVertexAttribArray(locPart.aExplodeDir);
      gl.vertexAttribPointer(locPart.aExplodeDir, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, bufs.metaBuf);
      gl.enableVertexAttribArray(locPart.aMeta);
      gl.vertexAttribPointer(locPart.aMeta, 4, gl.FLOAT, false, 0, 0);

      gl.uniform1f(locPart.uPointScale, pointScale);
      gl.drawArrays(gl.POINTS, 0, count);

      gl.disableVertexAttribArray(locPart.aTreePos);
      gl.disableVertexAttribArray(locPart.aFloatPos);
      gl.disableVertexAttribArray(locPart.aExplodeDir);
      gl.disableVertexAttribArray(locPart.aMeta);
    }

    /* ---------------- 核心渲染循环 (60~120 FPS) ---------------- */
    function render(ts) {
      if (paused || document.hidden) {
        rafId = 0;
        return;
      }
      rafId = requestAnimationFrame(render);

      if (!lastTs) lastTs = ts;
      const rawDt = (ts - lastTs) * 0.001;
      lastTs = ts;
      const dt = Math.min(0.05, Math.max(0.001, rawDt));
      simTime += dt;

      // 从音频分析器拉取实时频谱能量（纯可变数值，零 DOM/框架重渲染）
      const targetAudio = cb.getAudioLevel ? cb.getAudioLevel() : 0.0;
      audioLevel += (targetAudio - audioLevel) * (1.0 - Math.exp(-dt * 12.0));

      // FPS 统计与动态分辨率护航
      fpsAccum += rawDt;
      fpsFrames++;
      if (fpsAccum >= 0.5) {
        const fps = Math.round(fpsFrames / fpsAccum);
        if (cb.onFps) cb.onFps(fps, ecoMode, renderScale);
        if (!ecoMode) {
          if (fps < 48) {
            lowFpsHits++;
            if (lowFpsHits >= 2 && renderScale > 0.72) {
              renderScale = Math.max(0.72, +(renderScale - 0.12).toFixed(2));
              resize();
              lowFpsHits = 0;
            }
          } else {
            lowFpsHits = 0;
          }
        }
        fpsAccum = 0;
        fpsFrames = 0;
      }

      // 主题色平滑插值
      const cLerp = 1.0 - Math.exp(-dt * 5.0);
      for (const k in colors) {
        const c = colors[k], t = targetColors[k];
        c[0] += (t[0] - c[0]) * cLerp;
        c[1] += (t[1] - c[1]) * cLerp;
        c[2] += (t[2] - c[2]) * cLerp;
      }

      // 状态插值：圣诞树 <-> 星光漂浮 + 按住鼠标爆发
      const tgtFloat = state.mode === 'FLOAT' ? 1.0 : 0.0;
      floatMix += (tgtFloat - floatMix) * (1.0 - Math.exp(-dt * 2.4));

      const isExploding = pointerHolding || gestureExplode;
      const tgtExplode = isExploding ? 1.0 : 0.0;
      explodeLevel += (tgtExplode - explodeLevel) * (1.0 - Math.exp(-dt * (isExploding ? 4.2 : 2.6)));

      // 圣诞树缓慢优雅自转（还原原版 +0.12 rad/s）
      if (state.mode === 'TREE' && !zoomedPhotoId) {
        treeRotY += dt * 0.12;
      }
      mat4RotY(matTreeRot, treeRotY);

      // 相机阻尼更新
      const camLerp = 1.0 - Math.exp(-dt * 7.5);
      cam.yaw += (cam.targetYaw - cam.yaw) * camLerp;
      cam.pitch += (cam.targetPitch - cam.pitch) * camLerp;
      cam.dist += (cam.targetDist - cam.dist) * camLerp;

      const portraitExtra = aspect < 0.78 ? (0.78 - aspect) * 10.5 : 0.0;
      const effDist = cam.dist + portraitExtra;
      const cp = Math.cos(cam.pitch);
      const lookY = 0.6;
      cam.x = Math.sin(cam.yaw) * cp * effDist;
      cam.y = lookY + Math.sin(cam.pitch) * effDist;
      cam.z = Math.cos(cam.yaw) * cp * effDist;

      mat4Perspective(matProj, 0.785, aspect, 0.4, 120.0);
      mat4LookAt(matView, cam.x, cam.y, cam.z, 0.0, lookY, 0.0);
      mat4Mul(matViewProj, matProj, matView);

      gl.clear(gl.DEPTH_BUFFER_BIT);

      /* ---------- Pass 1: 翡翠极光冬夜背景 ---------- */
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.BLEND);
      gl.useProgram(progSky);
      gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
      gl.enableVertexAttribArray(locSky.aPos);
      gl.vertexAttribPointer(locSky.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1f(locSky.uTime, simTime);
      gl.uniform1f(locSky.uAspect, aspect);
      gl.uniform1f(locSky.uAudio, audioLevel);
      gl.uniform3fv(locSky.uBgColor, colors.bg);
      gl.uniform3fv(locSky.uAccentA, colors.primary);
      gl.uniform3fv(locSky.uAccentB, colors.accent);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(locSky.aPos);

      /* ---------- Pass 2: 柔和渐隐雪地底座与双层光环 ---------- */
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(progFloor);
      gl.bindBuffer(gl.ARRAY_BUFFER, floorPosBuf);
      gl.enableVertexAttribArray(locFloor.aPos);
      gl.vertexAttribPointer(locFloor.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(locFloor.uViewProj, false, matViewProj);
      gl.uniform3f(locFloor.uCamPos, cam.x, cam.y, cam.z);
      gl.uniform1f(locFloor.uTime, simTime);
      gl.uniform1f(locFloor.uAudio, audioLevel);
      gl.uniform3fv(locFloor.uFogColor, colors.bg);
      gl.uniform3fv(locFloor.uFloorColor, colors.floor);
      gl.uniform3fv(locFloor.uRingColor, colors.ring);
      gl.uniform3fv(locFloor.uGoldColor, colors.star);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, floorIdxBuf);
      gl.drawElements(gl.TRIANGLES, floorGeo.idx.length, gl.UNSIGNED_SHORT, 0);
      gl.disableVertexAttribArray(locFloor.aPos);

      /* ---------- Pass 3: 3D 实体网格 (树干 + 3D 倒角五角星 + 3D 礼盒 + 3D 彩球) ---------- */
      gl.depthMask(true);
      gl.disable(gl.BLEND);

      // 3.1 树干
      gl.useProgram(progMesh);
      mat4ComposeTRS(matModel, 0, -TREE_H * 0.5 + 0.9, 0, 0, 0, 0, 1, 1, 1);
      mat3NormalFromMat4(matNormal, matModel);
      gl.bindBuffer(gl.ARRAY_BUFFER, trunkPosBuf);
      gl.enableVertexAttribArray(locMesh.aPos);
      gl.vertexAttribPointer(locMesh.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, trunkNormBuf);
      gl.enableVertexAttribArray(locMesh.aNormal);
      gl.vertexAttribPointer(locMesh.aNormal, 3, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(locMesh.uModel, false, matModel);
      gl.uniformMatrix4fv(locMesh.uViewProj, false, matViewProj);
      gl.uniformMatrix3fv(locMesh.uNormalMat, false, matNormal);
      gl.uniform3f(locMesh.uCamPos, cam.x, cam.y, cam.z);
      gl.uniform3f(locMesh.uColor, 0.28, 0.19, 0.13);
      gl.uniform3f(locMesh.uEmissive, 0.02, 0.02, 0.01);
      gl.uniform1f(locMesh.uMetalness, 0.08);
      gl.uniform1f(locMesh.uRoughness, 0.82);
      gl.uniform3fv(locMesh.uKeyColor, colors.star);
      gl.uniform3fv(locMesh.uRimColor, colors.primary);
      gl.uniform3fv(locMesh.uFogColor, colors.bg);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, trunkIdxBuf);
      gl.drawElements(gl.TRIANGLES, trunkGeo.idx.length, gl.UNSIGNED_SHORT, 0);

      // 3.2 树顶 3D 倒角五角星
      const starScale = 1.0 + Math.sin(simTime * 2.4) * 0.07 + audioLevel * 0.24;
      mat4ComposeTRS(matModel, 0, TREE_H * 0.5 + 0.78, 0, 0, simTime * 0.85, 0, starScale, starScale, starScale);
      mat3NormalFromMat4(matNormal, matModel);
      gl.bindBuffer(gl.ARRAY_BUFFER, starPosBuf);
      gl.vertexAttribPointer(locMesh.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, starNormBuf);
      gl.vertexAttribPointer(locMesh.aNormal, 3, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(locMesh.uModel, false, matModel);
      gl.uniformMatrix3fv(locMesh.uNormalMat, false, matNormal);
      gl.uniform3fv(locMesh.uColor, colors.star);
      gl.uniform3f(
        locMesh.uEmissive,
        colors.star[0] * (0.68 + audioLevel * 0.5),
        colors.star[1] * (0.68 + audioLevel * 0.5),
        colors.star[2] * (0.68 + audioLevel * 0.5)
      );
      gl.uniform1f(locMesh.uMetalness, 0.92);
      gl.uniform1f(locMesh.uRoughness, 0.14);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, starIdxBuf);
      gl.drawElements(gl.TRIANGLES, starGeo.idx.length, gl.UNSIGNED_SHORT, 0);
      gl.disableVertexAttribArray(locMesh.aPos);
      gl.disableVertexAttribArray(locMesh.aNormal);

      // 3.3 硬件实例化 3D 带金丝带礼盒 (0..600)
      drawInstancedOrnament(
        cubeGeo, cubePosBuf, cubeNormBuf, cubeUvBuf, cubeIdxBuf,
        boxInstBufs, Math.min(MAX_BOXES, state.boxCount | 0),
        true, colors.boxA, colors.boxB, 0.24
      );

      // 3.4 硬件实例化 3D 高光金属彩球 (0..600)
      drawInstancedOrnament(
        ballGeo, ballPosBuf, ballNormBuf, ballUvBuf, ballIdxBuf,
        ballInstBufs, Math.min(MAX_BALLS, state.bellCount | 0),
        false, colors.bell, colors.bell, 0.45
      );

      /* ---------- Pass 4: 3D 环绕金框回忆照片墙 ---------- */
      if (photoItems.length > 0) {
        const lerpRate = 1.0 - Math.exp(-dt * 6.5);
        // 相机前方向量 (供照片特写放大至镜头正前方)
        let fx = -cam.x, fy = lookY - cam.y, fz = -cam.z;
        const fl = Math.hypot(fx, fy, fz) || 1;
        fx /= fl; fy /= fl; fz /= fl;

        for (let i = 0; i < photoItems.length; i++) {
          const p = photoItems[i];
          const isZoomed = p.id === zoomedPhotoId;
          let tx, ty, tz, tRx, tRy, tScale;

          if (isZoomed) {
            tx = cam.x + fx * 5.8;
            ty = cam.y + fy * 5.8;
            tz = cam.z + fz * 5.8;
            tRy = cam.yaw;
            tRx = -cam.pitch;
            tScale = 2.15;
          } else {
            const bob = Math.sin(simTime * 1.15 + i * 1.3) * 0.22;
            const c = Math.cos(treeRotY), s = Math.sin(treeRotY);
            tx = p.basePos[0] * c + p.basePos[2] * s;
            ty = p.basePos[1] + bob;
            tz = -p.basePos[0] * s + p.basePos[2] * c;
            tRy = p.baseRotY + treeRotY;
            tRx = 0;
            tScale = 1.0;
          }

          p.curPos[0] += (tx - p.curPos[0]) * lerpRate;
          p.curPos[1] += (ty - p.curPos[1]) * lerpRate;
          p.curPos[2] += (tz - p.curPos[2]) * lerpRate;
          let dRy = tRy - p.curRotY;
          while (dRy > Math.PI) dRy -= TAU;
          while (dRy < -Math.PI) dRy += TAU;
          p.curRotY += dRy * lerpRate;
          p.curRotX += (tRx - p.curRotX) * lerpRate;
          p.curScale += (tScale - p.curScale) * lerpRate;

          mat4ComposeTRS(matModel, p.curPos[0], p.curPos[1], p.curPos[2], p.curRotX, p.curRotY, 0, p.curScale, p.curScale, p.curScale);
          mat3NormalFromMat4(matNormal, matModel);

          // 4.1 3D 金属边框
          gl.useProgram(progMesh);
          gl.bindBuffer(gl.ARRAY_BUFFER, framePosBuf);
          gl.enableVertexAttribArray(locMesh.aPos);
          gl.vertexAttribPointer(locMesh.aPos, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, frameNormBuf);
          gl.enableVertexAttribArray(locMesh.aNormal);
          gl.vertexAttribPointer(locMesh.aNormal, 3, gl.FLOAT, false, 0, 0);
          gl.uniformMatrix4fv(locMesh.uModel, false, matModel);
          gl.uniformMatrix4fv(locMesh.uViewProj, false, matViewProj);
          gl.uniformMatrix3fv(locMesh.uNormalMat, false, matNormal);
          gl.uniform3f(locMesh.uCamPos, cam.x, cam.y, cam.z);
          gl.uniform3fv(locMesh.uColor, colors.star);
          gl.uniform3f(locMesh.uEmissive, colors.star[0] * 0.22, colors.star[1] * 0.22, colors.star[2] * 0.22);
          gl.uniform1f(locMesh.uMetalness, 0.96);
          gl.uniform1f(locMesh.uRoughness, 0.18);
          gl.uniform3fv(locMesh.uKeyColor, colors.star);
          gl.uniform3fv(locMesh.uRimColor, colors.primary);
          gl.uniform3fv(locMesh.uFogColor, colors.bg);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, frameIdxBuf);
          gl.drawElements(gl.TRIANGLES, frameGeo.idx.length, gl.UNSIGNED_SHORT, 0);
          gl.disableVertexAttribArray(locMesh.aPos);
          gl.disableVertexAttribArray(locMesh.aNormal);

          // 4.2 照片画心
          gl.useProgram(progPhoto);
          gl.bindBuffer(gl.ARRAY_BUFFER, photoQuadPos);
          gl.enableVertexAttribArray(locPhoto.aPos);
          gl.vertexAttribPointer(locPhoto.aPos, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, photoQuadUv);
          gl.enableVertexAttribArray(locPhoto.aUv);
          gl.vertexAttribPointer(locPhoto.aUv, 2, gl.FLOAT, false, 0, 0);
          gl.uniformMatrix4fv(locPhoto.uModel, false, matModel);
          gl.uniformMatrix4fv(locPhoto.uViewProj, false, matViewProj);
          gl.uniform1f(locPhoto.uHighlight, isZoomed ? 1.0 : 0.0);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, p.tex);
          gl.uniform1i(locPhoto.uTex, 0);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          gl.disableVertexAttribArray(locPhoto.aPos);
          gl.disableVertexAttribArray(locPhoto.aUv);
        }
      }

      /* ---------- Pass 5: 主体翡翠星光粒子 + 五圈螺旋灯带 (GPU 深度测试 + 双模式辉光) ---------- */
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      const pointScale = height * 0.96;
      gl.useProgram(progParticle);
      gl.uniformMatrix4fv(locPart.uViewProj, false, matViewProj);
      gl.uniformMatrix4fv(locPart.uTreeRot, false, matTreeRot);
      gl.uniform1f(locPart.uTime, simTime);
      gl.uniform1f(locPart.uMaxPointSize, maxPointSize);
      gl.uniform1f(locPart.uFloatMix, floatMix);
      gl.uniform1f(locPart.uExplode, explodeLevel);
      gl.uniform1f(locPart.uAudio, audioLevel);
      gl.uniform3fv(locPart.uDeepColor, colors.deep);
      gl.uniform3fv(locPart.uPrimaryColor, colors.primary);
      gl.uniform3fv(locPart.uAccentColor, colors.accent);
      gl.uniform3fv(locPart.uMintColor, colors.mint);

      const drawParticleCount = Math.min(MAX_PARTICLES, Math.max(500, state.particleCount | 0));
      drawParticleSet(treePartBufs, drawParticleCount, pointScale);
      drawParticleSet(garlandBufs, GARLAND_COUNT, pointScale);

      /* ---------- Pass 6: 树顶体积八芒星芒光晕 (纯加色) ---------- */
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(progFlare);
      gl.bindBuffer(gl.ARRAY_BUFFER, flareBuf);
      gl.enableVertexAttribArray(locFlare.aCorner);
      gl.vertexAttribPointer(locFlare.aCorner, 2, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(locFlare.uView, false, matView);
      gl.uniformMatrix4fv(locFlare.uProj, false, matProj);
      gl.uniform3f(locFlare.uWorldPos, 0, TREE_H * 0.5 + 0.78, 0);
      gl.uniform1f(locFlare.uScale, 2.8 + audioLevel * 0.85);
      gl.uniform1f(locFlare.uTime, simTime);
      gl.uniform1f(locFlare.uAudio, audioLevel);
      gl.uniform3fv(locFlare.uCoreColor, colors.star);
      gl.uniform3fv(locFlare.uHaloColor, colors.primary);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disableVertexAttribArray(locFlare.aCorner);

      /* ---------- Pass 7: GPU 柔焦圆雪花 ---------- */
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(progSnow);
      gl.bindBuffer(gl.ARRAY_BUFFER, snowBufs.initPosBuf);
      gl.enableVertexAttribArray(locSnow.aInitPos);
      gl.vertexAttribPointer(locSnow.aInitPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, snowBufs.paramBuf);
      gl.enableVertexAttribArray(locSnow.aParam);
      gl.vertexAttribPointer(locSnow.aParam, 4, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(locSnow.uViewProj, false, matViewProj);
      gl.uniform1f(locSnow.uTime, simTime);
      gl.uniform1f(locSnow.uPointScale, pointScale);
      gl.uniform1f(locSnow.uMaxPointSize, maxPointSize);
      gl.drawArrays(gl.POINTS, 0, ecoMode ? 650 : SNOW_COUNT);
      gl.disableVertexAttribArray(locSnow.aInitPos);
      gl.disableVertexAttribArray(locSnow.aParam);

      gl.depthMask(true);
    }

    resize();

    return {
      start() {
        paused = false;
        if (!rafId) {
          lastTs = performance.now();
          rafId = requestAnimationFrame(render);
        }
      },
      setPaused(p) {
        paused = !!p;
        if (!paused && !rafId) {
          lastTs = performance.now();
          rafId = requestAnimationFrame(render);
        }
      },
      updateState(patch) {
        Object.assign(state, patch);
        syncTargetColors();
      },
      setGallery,
      setGestureExplode(active) {
        gestureExplode = !!active;
      },
      toggleEcoMode() {
        ecoMode = !ecoMode;
        renderScale = ecoMode ? 0.85 : 1.0;
        resize();
        return ecoMode;
      },
      closeZoomedPhoto() {
        zoomedPhotoId = null;
      }
    };
  }

  return { create };
})();
