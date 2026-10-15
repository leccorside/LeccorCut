// src/assetsLibrary.js — Biblioteca integrada de assets, stickers e molduras vetoriais offline
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');

const ASSETS = [
  // ── 1. Setas & Indicadores ──────────────────────────────────────────────────
  {
    id: 'arrow_neon_cyan',
    name: 'Seta Neon Ciano',
    category: 'arrows',
    tags: ['seta', 'apontador', 'neon', 'ciano'],
    width: 256,
    height: 128,
    drawType: 'arrow_right',
    color1: [0, 229, 195, 255],
    color2: [124, 92, 255, 255],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 128" width="256" height="128">
      <defs>
        <linearGradient id="gArrow" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#00e5c3" />
          <stop offset="100%" stop-color="#7c5cff" />
        </linearGradient>
      </defs>
      <path d="M 20 48 L 150 48 L 150 20 L 236 64 L 150 108 L 150 80 L 20 80 Z"
        fill="url(#gArrow)" stroke="#ffffff" stroke-width="4" />
    </svg>`
  },
  {
    id: 'arrow_curved_red',
    name: 'Seta Curva Vermelha',
    category: 'arrows',
    tags: ['seta', 'curva', 'vermelho', 'destaque'],
    width: 192,
    height: 192,
    drawType: 'arrow_curved',
    color1: [255, 51, 102, 255],
    color2: [255, 107, 53, 255],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="192" height="192">
      <defs>
        <linearGradient id="gRed" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ff3366" />
          <stop offset="100%" stop-color="#ff6b35" />
        </linearGradient>
      </defs>
      <path d="M 30 160 Q 60 40 140 50" fill="none" stroke="url(#gRed)" stroke-width="16" stroke-linecap="round" />
      <polygon points="120,20 175,50 135,85" fill="url(#gRed)" stroke="#ffffff" stroke-width="2" />
    </svg>`
  },
  {
    id: 'cursor_click',
    name: 'Cursor com Clique',
    category: 'arrows',
    tags: ['cursor', 'mouse', 'clique', 'ponteiro'],
    width: 160,
    height: 160,
    drawType: 'cursor',
    color1: [0, 229, 195, 255],
    color2: [255, 255, 255, 255],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
      <circle cx="100" cy="50" r="26" fill="none" stroke="#00e5c3" stroke-width="4" opacity="0.8" stroke-dasharray="6,4" />
      <circle cx="100" cy="50" r="14" fill="rgba(0,229,195,0.3)" />
      <path d="M 40 30 L 40 120 L 66 98 L 92 135 L 108 123 L 82 86 L 115 86 Z"
        fill="#ffffff" stroke="#171923" stroke-width="5" stroke-linejoin="round" />
    </svg>`
  },
  {
    id: 'target_focus',
    name: 'Mira / Foco Holográfico',
    category: 'arrows',
    tags: ['mira', 'alvo', 'foco', 'holograma'],
    width: 180,
    height: 180,
    drawType: 'target',
    color1: [0, 229, 195, 255],
    color2: [124, 92, 255, 255],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="180" height="180">
      <circle cx="90" cy="90" r="70" fill="none" stroke="#00e5c3" stroke-width="4" stroke-dasharray="35,15" />
      <circle cx="90" cy="90" r="45" fill="none" stroke="#7c5cff" stroke-width="3" />
      <circle cx="90" cy="90" r="8" fill="#00e5c3" />
      <line x1="90" y1="10" x2="90" y2="40" stroke="#00e5c3" stroke-width="4" />
      <line x1="90" y1="140" x2="90" y2="170" stroke="#00e5c3" stroke-width="4" />
      <line x1="10" y1="90" x2="40" y2="90" stroke="#00e5c3" stroke-width="4" />
      <line x1="140" y1="90" x2="170" y2="90" stroke="#00e5c3" stroke-width="4" />
    </svg>`
  },

  // ── 2. Badges & Interação Social ────────────────────────────────────────────
  {
    id: 'badge_subscribe',
    name: 'Botão Inscreva-se',
    category: 'badges',
    tags: ['youtube', 'inscricao', 'social', 'subscribe'],
    width: 280,
    height: 80,
    drawType: 'badge_rect',
    color1: [255, 0, 51, 255],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 80" width="280" height="80">
      <defs>
        <linearGradient id="gSub" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#ff0033" />
          <stop offset="100%" stop-color="#cc0029" />
        </linearGradient>
      </defs>
      <rect x="5" y="5" width="270" height="70" rx="35" fill="url(#gSub)" stroke="#ffffff" stroke-width="3" />
      <path d="M 42 26 L 42 54 L 66 40 Z" fill="#ffffff" />
      <text x="82" y="49" fill="#ffffff" font-family="'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="22" letter-spacing="1">INSCREVA-SE</text>
    </svg>`
  },
  {
    id: 'badge_like_neon',
    name: 'Curtir / Like Neon',
    category: 'badges',
    tags: ['like', 'curtir', 'positivo', 'social'],
    width: 140,
    height: 140,
    drawType: 'circle_icon',
    color1: [0, 229, 195, 255],
    color2: [43, 108, 255, 255],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140" width="140" height="140">
      <defs>
        <linearGradient id="gLike" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#00e5c3" />
          <stop offset="100%" stop-color="#2b6cff" />
        </linearGradient>
      </defs>
      <circle cx="70" cy="70" r="60" fill="url(#gLike)" stroke="#ffffff" stroke-width="4" />
      <path d="M 44 70 L 44 100 L 56 100 L 56 70 Z M 62 70 L 62 100 L 86 100 C 92 100 96 95 95 89 L 98 75 C 99 71 96 67 91 67 L 78 67 L 82 52 C 83 48 80 43 75 43 L 70 45 L 62 70 Z"
        fill="#ffffff" />
    </svg>`
  },
  {
    id: 'badge_fire',
    name: 'Fogo / Em Alta',
    category: 'badges',
    tags: ['fogo', 'hype', 'quente', 'tendencia'],
    width: 140,
    height: 160,
    drawType: 'fire',
    color1: [255, 61, 0, 255],
    color2: [255, 234, 0, 255],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 160" width="140" height="160">
      <defs>
        <linearGradient id="gFire" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stop-color="#ff3d00" />
          <stop offset="60%" stop-color="#ff9100" />
          <stop offset="100%" stop-color="#ffea00" />
        </linearGradient>
      </defs>
      <path d="M 70 10 C 75 40 105 55 105 85 C 105 125 75 150 70 150 C 65 150 35 125 35 85 C 35 60 55 40 70 10 Z" fill="url(#gFire)" />
      <path d="M 70 70 C 73 85 85 95 85 110 C 85 130 72 142 70 142 C 68 142 55 130 55 110 C 55 98 65 88 70 70 Z" fill="#ffffff" opacity="0.9" />
    </svg>`
  },
  {
    id: 'badge_verified',
    name: 'Selo Verificado',
    category: 'badges',
    tags: ['verificado', 'oficial', 'badge', 'seguranca'],
    width: 140,
    height: 140,
    drawType: 'circle_icon',
    color1: [43, 108, 255, 255],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140" width="140" height="140">
      <circle cx="70" cy="70" r="58" fill="#2b6cff" stroke="#ffffff" stroke-width="5" />
      <path d="M 42 72 L 60 90 L 98 52" fill="none" stroke="#ffffff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
    </svg>`
  },

  // ── 3. Molduras & Overlays ──────────────────────────────────────────────────
  {
    id: 'frame_rec_camera',
    name: 'Moldura Câmera REC',
    category: 'frames',
    tags: ['rec', 'camera', 'visor', 'gravacao'],
    width: 640,
    height: 360,
    drawType: 'frame_rec',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
      <path d="M 30 70 L 30 30 L 70 30" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" />
      <path d="M 570 30 L 610 30 L 610 70" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" />
      <path d="M 30 290 L 30 330 L 70 330" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" />
      <path d="M 570 330 L 610 330 L 610 290" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" />
      <circle cx="55" cy="55" r="10" fill="#ff0033" />
      <text x="75" y="63" fill="#ffffff" font-family="monospace" font-weight="700" font-size="20" letter-spacing="2">REC</text>
      <line x1="310" y1="180" x2="330" y2="180" stroke="rgba(255,255,255,0.7)" stroke-width="2" />
      <line x1="320" y1="170" x2="320" y2="190" stroke="rgba(255,255,255,0.7)" stroke-width="2" />
      <text x="500" y="325" fill="#ffffff" font-family="monospace" font-size="14">4K 60FPS</text>
    </svg>`
  },
  {
    id: 'frame_gradient_border',
    name: 'Moldura Cyberpunk',
    category: 'frames',
    tags: ['moldura', 'borda', 'gradiente', 'cyberpunk'],
    width: 640,
    height: 360,
    drawType: 'frame_border',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
      <defs>
        <linearGradient id="gBorder" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#00e5c3" />
          <stop offset="50%" stop-color="#7c5cff" />
          <stop offset="100%" stop-color="#ff3366" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="624" height="344" rx="20" fill="none" stroke="url(#gBorder)" stroke-width="12" />
    </svg>`
  },
  {
    id: 'overlay_breaking_news',
    name: 'Faixa Urgente / Plantão',
    category: 'frames',
    tags: ['urgente', 'plantao', 'noticia', 'faixa'],
    width: 640,
    height: 90,
    drawType: 'news_banner',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 90" width="640" height="90">
      <rect x="0" y="20" width="640" height="60" fill="rgba(14,15,20,0.85)" stroke="#ff0033" stroke-width="3" />
      <rect x="0" y="20" width="180" height="60" fill="#ff0033" />
      <text x="25" y="58" fill="#ffffff" font-family="'Segoe UI', Impact, sans-serif" font-weight="900" font-size="24" letter-spacing="2">URGENTE</text>
      <text x="200" y="56" fill="#00e5c3" font-family="'Segoe UI', sans-serif" font-weight="700" font-size="18">ATENÇÃO PARA ESTE DETALHE</text>
    </svg>`
  },

  // ── 4. Stickers & Reações ───────────────────────────────────────────────────
  {
    id: 'sticker_wow',
    name: 'Balão WOW!',
    category: 'stickers',
    tags: ['wow', 'explosao', 'comics', 'quadrinhos'],
    width: 200,
    height: 150,
    drawType: 'star_wow',
    color1: [255, 230, 0, 255],
    color2: [255, 94, 0, 255],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150" width="200" height="150">
      <defs>
        <linearGradient id="gWow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ffe600" />
          <stop offset="100%" stop-color="#ff5e00" />
        </linearGradient>
      </defs>
      <polygon points="100,10 120,40 160,30 145,65 185,85 145,105 160,140 120,125 100,145 80,125 40,140 55,105 15,85 55,65 40,30 80,40"
        fill="url(#gWow)" stroke="#171923" stroke-width="6" stroke-linejoin="round" />
      <text x="100" y="96" fill="#171923" font-family="Impact, Arial Black, sans-serif" font-size="44" text-anchor="middle" font-weight="900">WOW!</text>
    </svg>`
  },
  {
    id: 'sticker_lightning',
    name: 'Raio Elétrico',
    category: 'stickers',
    tags: ['raio', 'energia', 'eletrico', 'rapido'],
    width: 130,
    height: 200,
    drawType: 'lightning',
    color1: [255, 234, 0, 255],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 200" width="130" height="200">
      <polygon points="75,10 20,110 65,110 45,190 115,85 70,85"
        fill="#ffea00" stroke="#ff6b00" stroke-width="6" stroke-linejoin="round" />
    </svg>`
  },
  {
    id: 'sticker_star',
    name: 'Estrela Dourada',
    category: 'stickers',
    tags: ['estrela', 'brilho', 'dourado', 'sucesso'],
    width: 160,
    height: 160,
    drawType: 'star_burst',
    color1: [255, 204, 0, 255],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
      <polygon points="80,15 100,60 148,65 112,98 122,145 80,120 38,145 48,98 12,65 60,60"
        fill="#ffcc00" stroke="#ff9900" stroke-width="5" stroke-linejoin="round" />
    </svg>`
  },
  {
    id: 'sticker_heart',
    name: 'Coração Pulsante',
    category: 'stickers',
    tags: ['coracao', 'amor', 'like', 'vermelho'],
    width: 160,
    height: 150,
    drawType: 'heart',
    color1: [255, 51, 102, 255],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 150" width="160" height="150">
      <defs>
        <linearGradient id="gHeart" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ff3366" />
          <stop offset="100%" stop-color="#cc0044" />
        </linearGradient>
      </defs>
      <path d="M 80 140 C 40 100 10 70 10 45 C 10 20 30 5 55 5 C 68 5 76 12 80 20 C 84 12 92 5 105 5 C 130 5 150 20 150 45 C 150 70 120 100 80 140 Z"
        fill="url(#gHeart)" stroke="#ffffff" stroke-width="4" />
    </svg>`
  }
];

let cacheDir = null;

function getAssetsDir() {
  if (!cacheDir) {
    cacheDir = path.join(os.tmpdir(), 'leccorcut_assets');
    if (!fs.existsSync(cacheDir)) {
      try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (_) {}
    }
  }
  return cacheDir;
}

function getAssetsList(category = null) {
  if (!category || category === 'all') return ASSETS;
  return ASSETS.filter(a => a.category === category);
}

function getAssetById(id) {
  return ASSETS.find(a => a.id === id) || null;
}

// Gerador puro de PNG com transparência RGBA
function encodePng(w, h, rgbaBuf) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    const c = zlib.crc32(Buffer.concat([t, data]));
    crc.writeUInt32BE(c >>> 0);
    return Buffer.concat([len, t, data, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 6; // RGBA com canal alfa

  const scanlines = [];
  for (let y = 0; y < h; y++) {
    scanlines.push(Buffer.from([0])); // Filtro None
    scanlines.push(rgbaBuf.subarray(y * w * 4, (y + 1) * w * 4));
  }

  const idat = makeChunk('IDAT', zlib.deflateSync(Buffer.concat(scanlines)));
  const iend = makeChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, makeChunk('IHDR', ihdr), idat, iend]);
}

function generateRasterPng(asset) {
  const W = Math.min(256, asset.width || 128);
  const H = Math.min(256, asset.height || 128);
  const rgba = Buffer.alloc(W * H * 4);

  const c1 = asset.color1 || [0, 229, 195, 255];
  const c2 = asset.color2 || [124, 92, 255, 255];

  const setPixel = (x, y, r, g, b, a = 255) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const idx = (y * W + x) * 4;
    rgba[idx] = r;
    rgba[idx + 1] = g;
    rgba[idx + 2] = b;
    rgba[idx + 3] = a;
  };

  const drawType = asset.drawType || 'circle';

  if (drawType === 'arrow_right') {
    // Seta apontando para a direita
    const midY = Math.floor(H / 2);
    const stemH = Math.floor(H * 0.28);
    const headW = Math.floor(W * 0.4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const inStem = (x < W - headW) && (y >= midY - stemH / 2 && y <= midY + stemH / 2);
        const inHead = (x >= W - headW) && (Math.abs(y - midY) <= (W - x) * (H / 2) / headW);
        if (inStem || inHead) {
          const t = x / W;
          const r = Math.round(c1[0] * (1 - t) + c2[0] * t);
          const g = Math.round(c1[1] * (1 - t) + c2[1] * t);
          const b = Math.round(c1[2] * (1 - t) + c2[2] * t);
          setPixel(x, y, r, g, b, 255);
        }
      }
    }
  } else if (drawType === 'heart') {
    // Coração
    const cx = W / 2, cy = H * 0.4;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const nx = (x - cx) / (W * 0.4);
        const ny = (cy - y) / (H * 0.4);
        const val = Math.pow(nx * nx + ny * ny - 1, 3) - nx * nx * Math.pow(ny, 3);
        if (val <= 0) {
          setPixel(x, y, c1[0], c1[1], c1[2], 255);
        }
      }
    }
  } else if (drawType === 'frame_border' || drawType === 'frame_rec') {
    // Borda de moldura
    const bw = 8;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (x < bw || x >= W - bw || y < bw || y >= H - bw) {
          setPixel(x, y, c1[0], c1[1], c1[2], 255);
        }
      }
    }
  } else {
    // Desenho circular com ícone preenchido
    const cx = W / 2, cy = H / 2, r = Math.min(W, H) * 0.42;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r) {
          const t = x / W;
          const red = Math.round(c1[0] * (1 - t) + c2[0] * t);
          const green = Math.round(c1[1] * (1 - t) + c2[1] * t);
          const blue = Math.round(c1[2] * (1 - t) + c2[2] * t);
          setPixel(x, y, red, green, blue, 255);
        }
      }
    }
  }

  return encodePng(W, H, rgba);
}

function ensureAssetFile(id) {
  const asset = getAssetById(id);
  if (!asset) return null;
  const dir = getAssetsDir();
  const svgPath = path.join(dir, `${asset.id}.svg`);
  const pngPath = path.join(dir, `${asset.id}.png`);

  if (!fs.existsSync(svgPath)) {
    fs.writeFileSync(svgPath, asset.svg, 'utf8');
  }

  if (!fs.existsSync(pngPath)) {
    const pngBuf = generateRasterPng(asset);
    fs.writeFileSync(pngPath, pngBuf);
  }

  return {
    path: pngPath, // Retorna caminho do PNG com transparência para máxima compatibilidade com FFmpeg e player
    svgPath: svgPath,
    id: asset.id,
    name: asset.name,
    category: asset.category,
    width: asset.width,
    height: asset.height
  };
}

module.exports = {
  ASSETS,
  getAssetsList,
  getAssetById,
  ensureAssetFile,
  getAssetsDir,
  encodePng
};
