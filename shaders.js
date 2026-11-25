/**
 * 翡翠圣诞树 · 高性能 WebGL 着色器库 (GLSL ES 1.00)
 * 彻底消除原版 CPU 矩阵循环与多通道 Bloom 瓶颈：
 * - 6,000~10,000 星光粒子 + 螺旋灯带 + 飘雪全 GPU 顶点着色器驱动
 * - 3D 礼盒（带立体金丝带）与高光金属彩球采用硬件实例化 (Instancing) + GPU 变形绽放
 * - 内置 ACES Filmic 色调映射与解析式星芒辉光，画质更通透、帧率翻倍
 */
window.TreeShaders = (function () {
  /* =====================================================================
   * 1. 夜空极光与远景星空背景 (1 Full-Screen Triangle)
   * ===================================================================== */
  const SKY_VERT = `
    precision highp float;
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.9999, 1.0);
    }
  `;

  const SKY_FRAG = `
    precision highp float;
    varying vec2 vUv;
    uniform float uTime;
    uniform float uAspect;
    uniform float uAudio;
    uniform vec3 uBgColor;
    uniform vec3 uAccentA;
    uniform vec3 uAccentB;

    float hash21(vec2 p) {
      p = fract(p * vec2(127.1, 311.7));
      p += dot(p, p + 34.5);
      return fract(p.x * p.y);
    }

    void main() {
      vec2 uv = vUv;
      // 深邃绿调冬夜渐变
      vec3 topCol = uBgColor * 0.65;
      vec3 midCol = uBgColor * 1.35 + uAccentA * 0.03;
      vec3 botCol = uBgColor * 1.15 + uAccentA * 0.055;
      vec3 col = mix(botCol, midCol, smoothstep(0.0, 0.45, uv.y));
      col = mix(col, topCol, smoothstep(0.45, 1.0, uv.y));

      // 树身背后柔和翡翠光晕
      vec2 dCenter = (uv - vec2(0.5, 0.48)) * vec2(uAspect * 0.72, 1.0);
      float glow = exp(-dot(dCenter, dCenter) * 4.2) * (0.14 + uAudio * 0.08);
      col += mix(uAccentA, uAccentB, 0.25) * glow;

      // 极光轻纱（柔和不喧宾夺主）
      float x = (uv.x - 0.5) * uAspect;
      float t = uTime * 0.16;
      float w1 = sin(x * 1.8 + t * 1.2) * 0.07 + sin(x * 3.5 - t * 0.8) * 0.03;
      float band1 = exp(-pow((uv.y - 0.78 - w1) * 7.5, 2.0));
      float cur1 = 0.55 + 0.45 * sin(x * 6.5 + t * 1.9 + uv.y * 3.5);
      float mask = smoothstep(0.35, 0.72, uv.y) * smoothstep(1.02, 0.82, uv.y);
      col += mix(uAccentA, uAccentB, 0.35) * band1 * cur1 * mask * (0.18 + uAudio * 0.08);

      // 远景柔和星辰
      vec2 grid = uv * vec2(uAspect * 68.0, 68.0);
      vec2 cell = floor(grid);
      vec2 f = fract(grid) - 0.5;
      float rnd = hash21(cell);
      if (rnd > 0.962 && uv.y > 0.22) {
        float tw = 0.45 + 0.55 * sin(uTime * (1.2 + rnd * 2.8) + rnd * 62.83);
        float s = smoothstep(0.17, 0.0, length(f)) * tw * smoothstep(0.22, 0.58, uv.y);
        col += mix(vec3(0.88, 0.99, 0.94), uAccentB, 0.3) * s * 0.78;
      }

      // 轻柔暗角 (替代原版后处理 Vignette)
      float vig = smoothstep(1.42, 0.35, length((uv - 0.5) * vec2(uAspect * 0.78, 1.05)));
      col *= (0.68 + 0.32 * vig);

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  /* =====================================================================
   * 2. 柔和雪地底座与脉冲光环 (修复原版生硬圆盘边缘，柔和融入夜雾)
   * ===================================================================== */
  const FLOOR_VERT = `
    precision highp float;
    attribute vec3 aPos;
    uniform mat4 uViewProj;
    uniform vec3 uCamPos;
    varying vec3 vWorldPos;
    varying float vCamDist;
    void main() {
      vWorldPos = aPos;
      vCamDist = length(uCamPos - aPos);
      gl_Position = uViewProj * vec4(aPos, 1.0);
    }
  `;

  const FLOOR_FRAG = `
    precision highp float;
    varying vec3 vWorldPos;
    varying float vCamDist;

    uniform float uTime;
    uniform float uAudio;
    uniform vec3 uFogColor;
    uniform vec3 uFloorColor;
    uniform vec3 uRingColor;
    uniform vec3 uGoldColor;

    void main() {
      float r = length(vWorldPos.xz);
      // 距离中心平滑渐隐融入深翠夜雾，无硬边
      float edgeFade = smoothstep(32.0, 7.0, r);
      if (edgeFade < 0.005) discard;

      // 中心树底柔光照明
      float centerLight = exp(-r * r * 0.022);
      vec3 baseSnow = mix(uFloorColor * 0.55, uFloorColor * 1.45 + uRingColor * 0.16, centerLight);

      // 双层脉动光环（传承原版底部金环，升级为翡翠+香槟金双波纹）
      float pulse = 0.78 + 0.22 * sin(uTime * 1.4) + uAudio * 0.35;
      float ring1 = exp(-pow((r - 5.6) * 0.95, 2.0)) * 0.52 * pulse;
      float ring2 = exp(-pow((r - 8.4) * 1.15, 2.0)) * 0.28 * (0.8 + 0.2 * cos(uTime * 1.1));
      float innerHalo = exp(-r * r * 0.09) * 0.34 * pulse;

      // 细微雪面冰晶闪点
      vec2 sp = floor(vWorldPos.xz * 3.8);
      float glint = fract(sin(dot(sp, vec2(12.9898, 78.233))) * 43758.5453);
      float sparkle = smoothstep(0.965, 1.0, glint) * (0.5 + 0.5 * sin(uTime * 3.2 + glint * 50.0)) * centerLight * 0.55;

      vec3 col = baseSnow
        + uRingColor * (ring1 + innerHalo)
        + uGoldColor * (ring2 + sparkle);

      // 指数雾效融合
      float fogFactor = clamp((vCamDist - 16.0) / 38.0, 0.0, 1.0);
      col = mix(col, uFogColor, fogFactor * 0.85);

      gl_FragColor = vec4(col, edgeFade * 0.92);
    }
  `;

  /* =====================================================================
   * 3. 通用 3D 实体网格着色器（3D 倒角五角星树顶 + 树干 + 相框金属边框）
   * ===================================================================== */
  const MESH_VERT = `
    precision highp float;
    attribute vec3 aPos;
    attribute vec3 aNormal;

    uniform mat4 uModel;
    uniform mat4 uViewProj;
    uniform mat3 uNormalMat;
    uniform vec3 uCamPos;

    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
      vec4 wp = uModel * vec4(aPos, 1.0);
      vWorldPos = wp.xyz;
      vNormal = normalize(uNormalMat * aNormal);
      vViewDir = normalize(uCamPos - wp.xyz);
      gl_Position = uViewProj * wp;
    }
  `;

  const MESH_FRAG = `
    precision highp float;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying vec3 vViewDir;

    uniform vec3 uColor;
    uniform vec3 uEmissive;
    uniform float uMetalness;
    uniform float uRoughness;
    uniform vec3 uKeyColor;
    uniform vec3 uRimColor;
    uniform vec3 uFogColor;
    uniform vec3 uCamPos;

    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(vViewDir);

      // 三点工作室布光（暖香槟主光 + 翡翠冷调轮廓光 + 顶部星光）
      vec3 L1 = normalize(vec3(10.0, 8.0, 12.0));
      vec3 L2 = normalize(vec3(-10.0, 6.0, -8.0));
      vec3 L3 = normalize(vec3(0.0, 14.0, 3.0));

      float d1 = max(0.0, dot(N, L1));
      float d2 = max(0.0, dot(N, L2));
      float d3 = max(0.0, dot(N, L3));

      vec3 H1 = normalize(L1 + V);
      vec3 H2 = normalize(L2 + V);
      float shininess = mix(12.0, 72.0, 1.0 - uRoughness);
      float spec1 = pow(max(0.0, dot(N, H1)), shininess);
      float spec2 = pow(max(0.0, dot(N, H2)), shininess * 0.65);

      float fresnel = pow(1.0 - max(0.0, dot(N, V)), 3.0);

      vec3 diffuse = uColor * (0.28 + d1 * 0.72 * uKeyColor + d2 * 0.42 * uRimColor + d3 * 0.25);
      vec3 specCol = mix(vec3(1.0), uColor, uMetalness);
      vec3 specular = specCol * (spec1 * 1.15 * uKeyColor + spec2 * 0.55 * uRimColor) * (0.35 + uMetalness * 0.95);
      vec3 envRim = mix(uRimColor, uKeyColor, 0.5) * fresnel * (0.22 + uMetalness * 0.65);

      vec3 col = diffuse + specular + envRim + uEmissive;

      // ACES Filmic 柔和色调映射
      col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);

      float dist = length(uCamPos - vWorldPos);
      float fog = clamp((dist - 18.0) / 42.0, 0.0, 1.0);
      col = mix(col, uFogColor, fog * 0.65);

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  /* =====================================================================
   * 4. 硬件实例化 3D 装饰物着色器（3D 带金丝带礼盒 + 高光金属彩球）
   *    全 GPU 变形：圣诞树 <-> 星光漂浮 + 按住鼠标全向爆发 + 音乐律动
   * ===================================================================== */
  const INST_VERT = `
    precision highp float;

    // 每顶点网格属性
    attribute vec3 aPos;
    attribute vec3 aNormal;
    attribute vec2 aUv;

    // 每实例属性 (divisor = 1)
    attribute vec3 iTreePos;
    attribute vec3 iFloatPos;
    attribute vec3 iExplodeDir;
    attribute vec4 iMeta; // x: baseScale, y: rotX, z: rotY, w: colorFlag (0 or 1)

    uniform mat4 uViewProj;
    uniform mat4 uTreeRot;
    uniform vec3 uCamPos;
    uniform float uTime;
    uniform float uFloatMix;   // 0 = TREE, 1 = FLOAT
    uniform float uExplode;    // 0..1 按住鼠标/手势绽放进度
    uniform float uAudio;      // 0..1 音乐节拍能量
    uniform float uRotSpeed;

    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec2 vUv;
    varying float vColorFlag;

    mat3 rotX(float a) {
      float c = cos(a), s = sin(a);
      return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c);
    }
    mat3 rotY(float a) {
      float c = cos(a), s = sin(a);
      return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
    }

    void main() {
      // 树形 <-> 漂浮 插值 + 按住鼠标爆发
      vec3 center = mix(iTreePos, iFloatPos, uFloatMix);
      float burstDist = 9.5 * (1.0 + uAudio * 0.45) * uExplode;
      center += iExplodeDir * burstDist;

      // 漂浮状态下轻微上下浮动
      if (uFloatMix > 0.01) {
        center.y += sin(uTime * 1.1 + iMeta.y * 4.0) * 0.25 * uFloatMix;
      }

      // 自转与音乐节拍缩放
      mat3 localRot = rotY(iMeta.z + uTime * uRotSpeed) * rotX(iMeta.y + uTime * (uRotSpeed * 0.45));
      float sc = iMeta.x * (1.0 + uAudio * 0.36);

      vec3 localPos = localRot * (aPos * sc) + center;
      vec4 worldPos = uTreeRot * vec4(localPos, 1.0);

      vec3 localNorm = localRot * aNormal;
      vec3 worldNorm = normalize((uTreeRot * vec4(localNorm, 0.0)).xyz);

      vWorldPos = worldPos.xyz;
      vNormal = worldNorm;
      vViewDir = normalize(uCamPos - worldPos.xyz);
      vUv = aUv;
      vColorFlag = iMeta.w;

      gl_Position = uViewProj * worldPos;
    }
  `;

  const INST_FRAG = `
    precision highp float;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec2 vUv;
    varying float vColorFlag;

    uniform float uIsBox;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform vec3 uRibbonColor;
    uniform vec3 uKeyColor;
    uniform vec3 uRimColor;
    uniform vec3 uFogColor;
    uniform vec3 uCamPos;
    uniform float uAudio;

    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(vViewDir);

      vec3 baseCol = mix(uColorA, uColorB, step(0.5, vColorFlag));
      float metal = 0.92;
      float rough = 0.14;
      vec3 emissive = vec3(0.0);

      if (uIsBox > 0.5) {
        // 3D 礼盒表面程序化金属金丝带十字绑带
        float rx = smoothstep(0.115, 0.085, abs(vUv.x - 0.5));
        float ry = smoothstep(0.115, 0.085, abs(vUv.y - 0.5));
        float ribbon = max(rx, ry);
        // 细微盒边描边提升立体感
        float edge = max(
          smoothstep(0.45, 0.495, abs(vUv.x - 0.5)),
          smoothstep(0.45, 0.495, abs(vUv.y - 0.5))
        );
        baseCol = mix(baseCol * (1.0 - edge * 0.22), uRibbonColor, ribbon);
        metal = mix(0.52, 0.96, ribbon);
        rough = mix(0.28, 0.12, ribbon);
        emissive = uRibbonColor * ribbon * (0.18 + uAudio * 0.18);
      } else {
        // 金属光泽圣诞彩球
        emissive = baseCol * (0.12 + uAudio * 0.22);
      }

      vec3 L1 = normalize(vec3(9.0, 10.0, 12.0));
      vec3 L2 = normalize(vec3(-10.0, 5.0, -7.0));
      vec3 L3 = normalize(vec3(0.0, 12.0, 0.0));

      float d1 = max(0.0, dot(N, L1));
      float d2 = max(0.0, dot(N, L2));
      float d3 = max(0.0, dot(N, L3));

      vec3 H1 = normalize(L1 + V);
      vec3 H2 = normalize(L2 + V);
      float shin = mix(14.0, 86.0, 1.0 - rough);
      float spec1 = pow(max(0.0, dot(N, H1)), shin);
      float spec2 = pow(max(0.0, dot(N, H2)), shin * 0.6);

      // 近似环境球反射高光，高对比镜面质感（类金属玻璃彩球）
      vec3 R = reflect(-V, N);
      float envBand = smoothstep(-0.15, 0.78, R.y);
      float envHotspot = pow(max(0.0, dot(R, normalize(vec3(0.45, 0.75, 0.50)))), 14.0);
      vec3 envCol = mix(uFogColor * 0.9, mix(uRimColor, uKeyColor, 0.65), envBand) + uKeyColor * envHotspot * 1.4;
      float fresnel = pow(1.0 - max(0.0, dot(N, V)), 2.5);

      vec3 diff = baseCol * (0.14 + d1 * 0.56 * uKeyColor + d2 * 0.28 * uRimColor + d3 * 0.16) * (1.0 - metal * 0.45);
      vec3 spec = mix(vec3(1.0), baseCol, metal * 0.75) * (spec1 * 1.65 * uKeyColor + spec2 * 0.65 * uRimColor) * (0.45 + metal * 1.0);
      vec3 refl = envCol * baseCol * (0.35 + fresnel * 0.95) * metal;

      vec3 col = diff + spec + refl + emissive * 0.55;
      col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);

      float dist = length(uCamPos - vWorldPos);
      float fog = clamp((dist - 16.0) / 42.0, 0.0, 1.0);
      col = mix(col, uFogColor, fog * 0.72);

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  /* =====================================================================
   * 5. 主体星光圣诞树粒子 + 五圈螺旋灯带 (GPU 顶点着色器驱动)
   *    替代原版 6000 个 SphereGeometry (768,000 三角面) -> 0 三角面、丝滑满帧
   * ===================================================================== */
  const PARTICLE_VERT = `
    precision highp float;

    attribute vec3 aTreePos;
    attribute vec3 aFloatPos;
    attribute vec3 aExplodeDir;
    attribute vec4 aMeta; // x: phase, y: speed, z: baseSize, w: colorRole (0=deep, 1=primary, 2=accent, 3=mint/white, 4=garland)

    uniform mat4 uViewProj;
    uniform mat4 uTreeRot;
    uniform float uTime;
    uniform float uPointScale;
    uniform float uMaxPointSize;
    uniform float uFloatMix;
    uniform float uExplode;
    uniform float uAudio;

    uniform vec3 uDeepColor;
    uniform vec3 uPrimaryColor;
    uniform vec3 uAccentColor;
    uniform vec3 uMintColor;

    varying vec3 vColor;
    varying float vAlpha;
    varying float vKind;

    void main() {
      float phase = aMeta.x;
      float speed = aMeta.y;
      float baseSize = aMeta.z;
      float role = aMeta.w;

      // 树形 <-> 星光漂浮平滑插值
      vec3 pos = mix(aTreePos, aFloatPos, uFloatMix);

      // 按住鼠标 / 手势绽放向外璀璨爆发
      float burst = 10.0 * (1.0 + uAudio * 0.5) * uExplode;
      pos += aExplodeDir * burst;

      // 漂浮状态下如星海轻轻呼吸游动
      if (uFloatMix > 0.01) {
        pos.y += sin(uTime * 1.1 + phase) * 0.28 * uFloatMix;
        pos.x += cos(uTime * 0.7 + phase) * 0.22 * uFloatMix;
      }

      // 圣诞树形态下极细微的枝叶微风感
      if (uFloatMix < 0.99 && uExplode < 0.5) {
        float hNorm = clamp((aTreePos.y + 7.5) / 15.0, 0.0, 1.0);
        float wind = (0.04 + hNorm * 0.06) * (1.0 - uFloatMix);
        pos.x += sin(uTime * 1.1 + aTreePos.y * 0.5 + phase * 0.2) * wind;
      }

      vec4 worldPos = uTreeRot * vec4(pos, 1.0);
      vec4 clipPos = uViewProj * worldPos;
      gl_Position = clipPos;

      // 配色层次：深森绿内层 + 璀璨翡翠主光 + 香槟金点缀 + 薄荷霜雪高光 + 流光灯带
      vec3 col = uPrimaryColor;
      float twinkle = 0.72 + 0.28 * sin(uTime * speed + phase);
      float audioBoost = 1.0 + uAudio * 0.65;
      float alpha = 0.76;
      float kind = 0.0; // 0: 柔焦星点, 1: 璀璨四芒星, 2: 螺旋灯珠

      if (role < 0.5) {
        // 深森绿底色松针（塑造浓郁绿意与立体景深，防止中间发白）
        col = mix(uDeepColor, uPrimaryColor, 0.32);
        alpha = 0.68;
      } else if (role < 1.5) {
        // 翡翠主光星尘
        col = uPrimaryColor;
        alpha = 0.78;
      } else if (role < 2.5) {
        // 香槟金点缀星芒 (四芒星闪烁)
        float flash = pow(0.5 + 0.5 * sin(uTime * (speed * 1.15) + phase), 2.5);
        col = uAccentColor;
        twinkle = 0.65 + 0.85 * flash;
        audioBoost = 1.0 + uAudio * 1.4;
        alpha = 0.94;
        kind = 1.0;
      } else if (role < 3.5) {
        // 薄荷白霜雪高光
        col = uMintColor;
        twinkle = 0.70 + 0.45 * sin(uTime * speed * 1.3 + phase);
        alpha = 0.86;
        kind = 1.0;
      } else {
        // 5 圈流光螺旋灯带：沿高度流动的能量波
        float hNorm = clamp((aTreePos.y + 7.5) / 15.0, 0.0, 1.0);
        float wave = 0.5 + 0.5 * sin(hNorm * 22.0 - uTime * 3.4 + phase * 0.25);
        col = mix(uPrimaryColor, uAccentColor, step(0.5, fract(phase * 1.73)));
        col = mix(col, vec3(1.0, 0.99, 0.94), wave * 0.42);
        twinkle = 0.65 + 0.68 * wave;
        audioBoost = 1.0 + uAudio * 1.35 * wave;
        alpha = 0.96;
        kind = 2.0;
      }

      float depth = max(1.2, clipPos.w);
      float ptSize = (baseSize * twinkle * audioBoost * uPointScale) / depth;
      gl_PointSize = clamp(ptSize, 1.4, uMaxPointSize);

      vColor = col * (0.95 + twinkle * 0.35);
      vAlpha = alpha;
      vKind = kind;
    }
  `;

  const PARTICLE_FRAG = `
    precision highp float;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vKind;

    void main() {
      vec2 p = gl_PointCoord - 0.5;
      float r2 = dot(p, p);
      if (r2 > 0.25) discard;

      if (vKind > 1.5) {
        // 螺旋灯珠：饱满发光灯芯 + 梦幻光晕
        float core = exp(-r2 * 30.0);
        float halo = exp(-r2 * 9.5) * 0.65;
        vec3 col = mix(vColor, vec3(1.0, 0.99, 0.95), core * 0.65);
        float shape = clamp(core * 1.1 + halo, 0.0, 1.2);
        gl_FragColor = vec4(col * shape * vAlpha, shape * 0.14 * vAlpha);
      } else if (vKind > 0.5) {
        // 璀璨四芒星芒
        float core = exp(-r2 * 42.0);
        float crossF = (exp(-abs(p.x) * 24.0) * exp(-abs(p.y) * 6.0)
                      + exp(-abs(p.y) * 24.0) * exp(-abs(p.x) * 6.0)) * 0.62;
        float halo = exp(-r2 * 11.0) * 0.40;
        float shape = clamp(core * 1.15 + crossF + halo, 0.0, 1.2);
        vec3 col = mix(vColor, vec3(1.0, 0.99, 0.95), core * 0.72);
        gl_FragColor = vec4(col * shape * vAlpha, shape * 0.12 * vAlpha);
      } else {
        // 柔焦翡翠星光：保色立体不发白
        float soft = exp(-r2 * 16.0);
        float core = exp(-r2 * 40.0) * 0.45;
        float shape = clamp(soft + core, 0.0, 1.0);
        gl_FragColor = vec4(vColor * shape * vAlpha, shape * 0.36 * vAlpha);
      }
    }
  `;

  /* =====================================================================
   * 6. 树顶体积星芒光晕 (衬托 3D 倒角五角星)
   * ===================================================================== */
  const FLARE_VERT = `
    precision highp float;
    attribute vec2 aCorner;
    uniform mat4 uView;
    uniform mat4 uProj;
    uniform vec3 uWorldPos;
    uniform float uScale;
    varying vec2 vUv;
    void main() {
      vUv = aCorner;
      vec4 vc = uView * vec4(uWorldPos, 1.0);
      vc.xy += aCorner * uScale;
      gl_Position = uProj * vc;
    }
  `;

  const FLARE_FRAG = `
    precision highp float;
    varying vec2 vUv;
    uniform float uTime;
    uniform float uAudio;
    uniform vec3 uCoreColor;
    uniform vec3 uHaloColor;

    vec2 rot(vec2 p, float a) {
      float c = cos(a), s = sin(a);
      return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    }

    void main() {
      vec2 p = vUv;
      float r = length(p);
      if (r > 1.0) discard;

      vec2 p1 = rot(p, sin(uTime * 0.5) * 0.14);
      vec2 p2 = rot(p, 0.7854 + uTime * 0.18);

      float ray1 = exp(-abs(p1.y) * 18.0) * exp(-abs(p1.x) * 2.5)
                 + exp(-abs(p1.x) * 18.0) * exp(-abs(p1.y) * 2.5);
      float ray2 = (exp(-abs(p2.y) * 22.0) * exp(-abs(p2.x) * 4.2)
                 + exp(-abs(p2.x) * 22.0) * exp(-abs(p2.y) * 4.2)) * 0.55;
      float halo = exp(-r * r * 5.0) * (0.62 + uAudio * 0.35);
      float core = exp(-r * r * 26.0) * 0.95;

      float breath = 0.88 + 0.14 * sin(uTime * 2.4) + uAudio * 0.35;
      vec3 col = uHaloColor * (halo + ray2 * 0.45) + uCoreColor * (core + ray1 * 0.75) * breath;
      col *= smoothstep(1.0, 0.65, r);
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  /* =====================================================================
   * 7. 3D 环绕照片卡片着色器 (带光泽感与微暗角)
   * ===================================================================== */
  const PHOTO_VERT = `
    precision highp float;
    attribute vec3 aPos;
    attribute vec2 aUv;
    uniform mat4 uModel;
    uniform mat4 uViewProj;
    varying vec2 vUv;
    void main() {
      vUv = aUv;
      gl_Position = uViewProj * uModel * vec4(aPos, 1.0);
    }
  `;

  const PHOTO_FRAG = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uTex;
    uniform float uHighlight;
    void main() {
      vec4 tex = texture2D(uTex, vUv);
      vec3 col = tex.rgb * (0.94 + uHighlight * 0.14);
      gl_FragColor = vec4(col, 0.96);
    }
  `;

  /* =====================================================================
   * 8. GPU 柔焦圆雪花着色器 (修复原版白色小方块雪花，全 GPU 零 CPU 循环)
   * ===================================================================== */
  const SNOW_VERT = `
    precision highp float;
    attribute vec3 aInitPos;
    attribute vec4 aParam; // x: speed, y: driftPhase, z: driftAmp, w: size

    uniform mat4 uViewProj;
    uniform float uTime;
    uniform float uPointScale;
    uniform float uMaxPointSize;

    varying float vAlpha;

    void main() {
      float heightSpan = 26.0;
      float minY = -8.5;
      vec3 pos = aInitPos;
      pos.y = mod(aInitPos.y - uTime * aParam.x - minY, heightSpan) + minY;
      pos.x += sin(uTime * 0.75 + aParam.y + pos.y * 0.18) * aParam.z;
      pos.z += cos(uTime * 0.58 + aParam.y * 1.3 + pos.y * 0.15) * aParam.z;

      vec4 clip = uViewProj * vec4(pos, 1.0);
      gl_Position = clip;

      float depth = max(1.5, clip.w);
      gl_PointSize = clamp((aParam.w * uPointScale) / depth, 1.4, uMaxPointSize);

      float fadeY = smoothstep(minY, minY + 2.5, pos.y) * smoothstep(minY + heightSpan, minY + heightSpan - 3.0, pos.y);
      vAlpha = fadeY * 0.82;
    }
  `;

  const SNOW_FRAG = `
    precision highp float;
    varying float vAlpha;
    void main() {
      vec2 p = gl_PointCoord - 0.5;
      float r2 = dot(p, p);
      if (r2 > 0.25) discard;
      // 柔和圆润雪花（告别原版锯齿白方块）
      float soft = exp(-r2 * 14.5);
      vec3 col = vec3(0.92, 0.99, 0.97);
      gl_FragColor = vec4(col * soft * vAlpha, soft * vAlpha);
    }
  `;

  return {
    SKY_VERT, SKY_FRAG,
    FLOOR_VERT, FLOOR_FRAG,
    MESH_VERT, MESH_FRAG,
    INST_VERT, INST_FRAG,
    PARTICLE_VERT, PARTICLE_FRAG,
    FLARE_VERT, FLARE_FRAG,
    PHOTO_VERT, PHOTO_FRAG,
    SNOW_VERT, SNOW_FRAG
  };
})();
