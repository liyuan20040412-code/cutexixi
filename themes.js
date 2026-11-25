/**
 * 翡翠圣诞树 · 绿系配色预设、默认艺术卡片与本地配置持久化
 * 基于原版「璀璨圣诞树 · Merry Christmas」全面绿系升级
 */
window.TreeConfig = (function () {
  const PRESETS = {
    emerald: {
      id: 'emerald',
      name: '翡翠流光',
      desc: '经典翡翠绿 · 香槟金',
      bg: '#04110e',
      fog: '#04110e',
      particleColor1: '#1ed68e',   // 璀璨翡翠绿主光
      particleColor2: '#f6d88b',   // 香槟金点缀
      particleDeep: '#095c3f',     // 深森绿内层层次
      particleMint: '#b8fce0',     // 薄荷霜雪高光
      boxColor1: '#0e6b4d',        // 祖母绿礼盒
      boxColor2: '#1d9a6c',        // 翡翠绸礼盒
      bellColor: '#f3cf7a',        // 香槟金金属彩球
      ribbonColor: '#ffd98a',      // 礼盒金丝带
      starColor: '#ffe39b',        // 树顶星金
      ringColor: '#34d399',        // 地面翡翠光环
      floorColor: '#122923',       // 柔和月光雪地
      uiAccent: '#5eead4',
      uiGold: '#f6d88b'
    },
    mint: {
      id: 'mint',
      name: '薄荷初雪',
      desc: '清新薄荷绿 · 冰晶银',
      bg: '#051517',
      fog: '#051517',
      particleColor1: '#42e3c6',
      particleColor2: '#e2f4ff',
      particleDeep: '#0c5c58',
      particleMint: '#d9fff8',
      boxColor1: '#147a74',
      boxColor2: '#2eb5a8',
      bellColor: '#dbeafe',
      ribbonColor: '#f8fafc',
      starColor: '#e8fbff',
      ringColor: '#5eead4',
      floorColor: '#132b2f',
      uiAccent: '#5eead4',
      uiGold: '#bae6fd'
    },
    aurora: {
      id: 'aurora',
      name: '极光森绿',
      desc: '北极光翠绿 · 梦幻星蓝',
      bg: '#040e14',
      fog: '#040e14',
      particleColor1: '#2ae87c',
      particleColor2: '#64c8ff',
      particleDeep: '#064e3b',
      particleMint: '#bbf7d0',
      boxColor1: '#0b5e43',
      boxColor2: '#15768a',
      bellColor: '#7dd3fc',
      ribbonColor: '#a7f3d0',
      starColor: '#d9ffe8',
      ringColor: '#4ade80',
      floorColor: '#0e2229',
      uiAccent: '#4ade80',
      uiGold: '#7dd3fc'
    },
    matcha: {
      id: 'matcha',
      name: '抹茶暖冬',
      desc: '温柔抹茶绿 · 奶油暖金',
      bg: '#0b140e',
      fog: '#0b140e',
      particleColor1: '#79c27e',
      particleColor2: '#fde193',
      particleDeep: '#274d31',
      particleMint: '#ecfccb',
      boxColor1: '#3b6b45',
      boxColor2: '#6b9468',
      bellColor: '#f6cf78',
      ribbonColor: '#fff3c4',
      starColor: '#ffebb3',
      ringColor: '#a3d9a5',
      floorColor: '#1a281e',
      uiAccent: '#86efac',
      uiGold: '#fde68a'
    }
  };

  function makeSvgCard(label, subtitle, bg, stroke) {
    const svg = `<svg width="420" height="420" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g" cx="50%" cy="42%" r="65%">
          <stop offset="0%" stop-color="${stroke}" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="${bg}" stop-opacity="0.96"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="${bg}"/>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <rect x="14" y="14" width="392" height="392" rx="14" fill="none" stroke="${stroke}" stroke-width="4" stroke-opacity="0.65"/>
      <rect x="24" y="24" width="372" height="372" rx="8" fill="none" stroke="${stroke}" stroke-width="1.2" stroke-opacity="0.35"/>
      <circle cx="210" cy="195" r="76" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-dasharray="6,6" stroke-opacity="0.7"/>
      <path d="M210 132 L222 178 L268 190 L222 202 L210 248 L198 202 L152 190 L198 178 Z" fill="${stroke}" fill-opacity="0.22" stroke="${stroke}" stroke-width="1.5"/>
      <text x="50%" y="198" font-family="Georgia, serif" font-size="24" fill="${stroke}" font-weight="bold" dominant-baseline="middle" text-anchor="middle" letter-spacing="2">${label}</text>
      <text x="50%" y="316" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="16" fill="${stroke}" fill-opacity="0.78" dominant-baseline="middle" text-anchor="middle" letter-spacing="3">${subtitle}</text>
    </svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  const DEFAULT_GALLERY = [
    { id: 'def-1', url: makeSvgCard('CHRISTMAS 01', '翡翠冬夜 · 初遇星光', '#08221b', '#6ee7b7') },
    { id: 'def-2', url: makeSvgCard('CHRISTMAS 02', '愿你岁岁常欢愉', '#0a2920', '#f6d88b') },
    { id: 'def-3', url: makeSvgCard('CHRISTMAS 03', '森林与极光的约定', '#092426', '#5eead4') },
    { id: 'def-4', url: makeSvgCard('CHRISTMAS 04', '满眼绿意皆是你', '#0c2b1e', '#86efac') },
    { id: 'def-5', url: makeSvgCard('CHRISTMAS 05', '香槟星辰落肩头', '#10261e', '#fde68a') },
    { id: 'def-6', url: makeSvgCard('CHRISTMAS 06', '冬日浪漫不打烊', '#07241c', '#a7f3d0') },
    { id: 'def-7', url: makeSvgCard('CHRISTMAS 07', '岁末温暖如期至', '#092524', '#99f6e4') },
    { id: 'def-8', url: makeSvgCard('CHRISTMAS 08', 'MERRY CHRISTMAS', '#0b291d', '#f6d88b') }
  ];

  function hexToRgb01(hex) {
    const clean = (hex || '#34d399').replace('#', '');
    const num = parseInt(clean.length === 3
      ? clean.split('').map(c => c + c).join('')
      : clean, 16);
    return [
      ((num >> 16) & 255) / 255,
      ((num >> 8) & 255) / 255,
      (num & 255) / 255
    ];
  }

  function createDefaultState() {
    const p = PRESETS.emerald;
    const params = new URLSearchParams(window.location.search);
    return {
      presetId: 'emerald',
      mode: 'TREE',            // 'TREE' | 'FLOAT'
      particleCount: 7500,     // 1000..10000
      particleColor1: p.particleColor1,
      particleColor2: p.particleColor2,
      boxCount: 140,           // 0..600
      bellCount: 160,          // 0..600
      boxColor1: p.boxColor1,
      boxColor2: p.boxColor2,
      bellColor: p.bellColor,
      subtitle: params.get('sub') || '翡翠璀璨圣诞树 · 愿今夜星光为你而亮',
      recipient: params.get('to') || ''
    };
  }

  /* ---------------- IndexedDB 本地回忆相册持久化 (沿用原版体验) ---------------- */
  const DB_NAME = 'emerald-christmas-tree-db';
  const STORE_NAME = 'gallery';
  const REMOVED_KEY = 'ect_removed_defaults';

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }

  async function loadGallery() {
    let removed = [];
    try {
      removed = JSON.parse(localStorage.getItem(REMOVED_KEY) || '[]');
    } catch (e) {
      removed = [];
    }
    const defaults = DEFAULT_GALLERY.filter((d) => !removed.includes(d.id));
    const db = await openDb();
    if (!db) return defaults;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const custom = (req.result || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        resolve([...defaults, ...custom]);
      };
      req.onerror = () => resolve(defaults);
    });
  }

  async function savePhoto(dataUrl) {
    const item = {
      id: 'usr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      url: dataUrl,
      createdAt: Date.now()
    };
    const db = await openDb();
    if (db) {
      await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(item);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      });
    }
    return item;
  }

  async function deletePhoto(item) {
    if (item.id.startsWith('def-')) {
      let removed = [];
      try {
        removed = JSON.parse(localStorage.getItem(REMOVED_KEY) || '[]');
      } catch (e) {
        removed = [];
      }
      if (!removed.includes(item.id)) {
        removed.push(item.id);
        try {
          localStorage.setItem(REMOVED_KEY, JSON.stringify(removed));
        } catch (e) {}
      }
      return;
    }
    const db = await openDb();
    if (db) {
      await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(item.id);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      });
    }
  }

  return {
    PRESETS,
    PRESET_ORDER: ['emerald', 'mint', 'aurora', 'matcha'],
    hexToRgb01,
    createDefaultState,
    loadGallery,
    savePhoto,
    deletePhoto
  };
})();
