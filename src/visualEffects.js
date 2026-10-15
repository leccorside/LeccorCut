'use strict';
/**
 * visualEffects.js — Fase 11: Efeitos Visuais, Shaders, Modos de Mesclagem e LUTs 3D
 *
 * Módulo responsável por:
 * 1. Modos de Mesclagem (Blend Modes: screen, multiply, overlay, etc.)
 * 2. Máscaras Geométricas (Retângulo, Círculo, Linear, Espelho) com Feather e Inversão
 * 3. Efeitos de Estilização (Glitch/RGB Split, Film Grain, Camera Shake, Bloom/Flare)
 * 4. Color Grading Fino (Temperatura, Tint, Highlights, Shadows)
 * 5. Gerenciamento e Aplicação de 3D LUTs (.cube / .3dl)
 */

const fs = require('fs');
const path = require('path');

// ── 1. Modos de Mesclagem (Blend Modes) ──────────────────────────────────────
const BLEND_MODES = {
  normal: { label: 'Normal', css: 'normal', ffmpegMode: null },
  screen: { label: 'Tela (Screen)', css: 'screen', ffmpegMode: 'screen' },
  multiply: { label: 'Multiplicar (Multiply)', css: 'multiply', ffmpegMode: 'multiply' },
  overlay: { label: 'Sobrepor (Overlay)', css: 'overlay', ffmpegMode: 'overlay' },
  lighten: { label: 'Clarear (Lighten)', css: 'lighten', ffmpegMode: 'lighten' },
  darken: { label: 'Escurecer (Darken)', css: 'darken', ffmpegMode: 'darken' },
  addition: { label: 'Adicionar (Add)', css: 'color-dodge', ffmpegMode: 'addition' },
  difference: { label: 'Diferença (Difference)', css: 'difference', ffmpegMode: 'difference' }
};

/**
 * Retorna a expressão CSS mix-blend-mode para pré-visualização.
 */
function getCssBlendMode(mode) {
  return BLEND_MODES[mode]?.css || 'normal';
}

// ── 2. Máscaras Geométricas (Shape Masks) ────────────────────────────────────
const SHAPE_MASKS = {
  none: { label: 'Nenhuma' },
  rectangle: { label: 'Retângulo' },
  circle: { label: 'Círculo / Elipse' },
  linear: { label: 'Linear (Split Screen)' },
  mirror: { label: 'Espelho (Mirror)' }
};

/**
 * Converte parâmetros de máscara em propriedades CSS para pré-visualização no renderer.
 * @param {Object} mask - { type, size, roundness, feather, invert, rotation }
 */
function getCssMaskStyle(mask = {}) {
  const type = mask.type || 'none';
  if (type === 'none') return {};

  const size = mask.size ?? 80; // porcentagem (0 - 100)
  const feather = mask.feather ?? 0; // px
  const invert = !!mask.invert;
  const rot = mask.rotation ?? 0;

  if (type === 'rectangle') {
    const half = size / 2;
    const inset = `${(50 - half).toFixed(1)}%`;
    const radius = `${mask.roundness || 0}px`;
    return {
      clipPath: `inset(${inset} ${inset} ${inset} ${inset} round ${radius})`,
      transform: rot ? `rotate(${rot}deg)` : 'none'
    };
  }

  if (type === 'circle') {
    const r = (size / 2).toFixed(1);
    return {
      clipPath: `circle(${r}% at 50% 50%)`,
      transform: rot ? `rotate(${rot}deg)` : 'none'
    };
  }

  if (type === 'linear') {
    const p = Math.max(0, Math.min(100, size));
    return {
      clipPath: `polygon(0 0, ${p}% 0, ${p}% 100%, 0 100%)`,
      transform: rot ? `rotate(${rot}deg)` : 'none'
    };
  }

  if (type === 'mirror') {
    const half = size / 2;
    return {
      clipPath: `polygon(${50 - half}% 0, ${50 + half}% 0, ${50 + half}% 100%, ${50 - half}% 100%)`,
      transform: rot ? `rotate(${rot}deg)` : 'none'
    };
  }

  return {};
}

/**
 * Constrói filtro FFmpeg para aplicar máscara de forma em uma camada de vídeo ou sobreposição.
 * Retorna instrução de filtro complexo ou string vazia se 'none'.
 */
function buildFfmpegMaskFilter(mask = {}, width = 1280, height = 720) {
  const type = mask.type || 'none';
  if (type === 'none') return '';

  const size = (mask.size ?? 80) / 100;
  const feather = Math.max(0, mask.feather ?? 0);
  const invert = !!mask.invert;

  const w = Math.round(width * size);
  const h = Math.round(height * size);
  const x0 = Math.round((width - w) / 2);
  const y0 = Math.round((height - h) / 2);

  let maskExpr = '';
  if (type === 'rectangle') {
    maskExpr = `between(X,${x0},${x0 + w})*between(Y,${y0},${y0 + h})`;
  } else if (type === 'circle') {
    const rx = w / 2;
    const ry = h / 2;
    const cx = width / 2;
    const cy = height / 2;
    maskExpr = `lte(((X-${cx})/${rx})^2+((Y-${cy})/${ry})^2,1)`;
  } else if (type === 'linear') {
    const cutX = Math.round(width * size);
    maskExpr = `lte(X,${cutX})`;
  } else if (type === 'mirror') {
    const half = w / 2;
    const cx = width / 2;
    maskExpr = `between(X,${cx - half},${cx + half})`;
  }

  if (!maskExpr) return '';

  let alphaVal = invert ? `if(${maskExpr},0,1)` : `if(${maskExpr},1,0)`;
  let filter = `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${alphaVal}*255'`;

  if (feather > 0) {
    const blurR = Math.min(25, Math.max(1, Math.round(feather)));
    filter += `,boxblur=${blurR}:1:enable='gt(t,0)'`;
  }

  return filter;
}

// ── 3. Efeitos de Estilização (Styling Effects) ──────────────────────────────
const STYLING_EFFECTS = {
  glitch: {
    label: 'Glitch / RGB Split',
    ffmpegFilter: (intensity = 1) => {
      const shift = Math.round(6 * intensity);
      return `split[g0][g1];[g0]lutrgb=r=val:g=0:b=0,crop=w=in_w:h=in_h:x=${shift}:y=0[g_r];[g1]lutrgb=r=0:g=val:b=val[g_gb];[g_gb][g_r]blend=all_mode=addition`;
    }
  },
  film_grain: {
    label: 'Ruído de Película (Film Grain)',
    ffmpegFilter: (intensity = 1) => {
      const s = Math.round(15 * intensity);
      return `noise=alls=${s}:allf=t+u`;
    }
  },
  camera_shake: {
    label: 'Shake de Câmera',
    ffmpegFilter: (intensity = 1) => {
      const amp = (0.015 * intensity).toFixed(4);
      return `crop=w='in_w*(1-${amp})':h='in_h*(1-${amp})':x='in_w*${amp}*abs(sin(2*PI*3*t))':y='in_h*${amp}*abs(cos(2*PI*4*t))',scale=in_w:in_h`;
    }
  },
  bloom: {
    label: 'Bloom / Difusão Suave',
    ffmpegFilter: (intensity = 1) => {
      return `split[b0][b1];[b1]boxblur=10:1,eq=brightness=0.08:contrast=1.2[b_glow];[b0][b_glow]blend=all_mode=screen:all_opacity=${(0.5 * intensity).toFixed(2)}`;
    }
  }
};

// ── 4. Color Grading Fino ───────────────────────────────────────────────────
/**
 * Constrói filtros FFmpeg para Color Grading customizado.
 * @param {Object} grading - { temp, tint, highlights, shadows, saturation, contrast }
 */
function buildColorGradingFilter(grading = {}) {
  const parts = [];

  const temp = Number(grading.temp) || 0; // -100 a +100 (azul/frio <-> laranja/quente)
  const tint = Number(grading.tint) || 0; // -100 a +100 (verde <-> magenta)
  if (temp !== 0 || tint !== 0) {
    const rs = (temp * 0.003).toFixed(3);
    const bs = (-temp * 0.003).toFixed(3);
    const gs = (-tint * 0.003).toFixed(3);
    const ms = (tint * 0.003).toFixed(3);
    parts.push(`colorbalance=rs=${rs}:gs=${gs}:bs=${bs}:rm=${rs}:gm=${gs}:bm=${bs}`);
  }

  const highlights = Number(grading.highlights) || 0; // -100 a +100
  const shadows = Number(grading.shadows) || 0;       // -100 a +100
  if (highlights !== 0 || shadows !== 0) {
    const hNorm = (1 + highlights * 0.002).toFixed(3);
    const sNorm = (1 + shadows * 0.002).toFixed(3);
    parts.push(`curves=all='0/0 0.25/${(0.25 * sNorm).toFixed(3)} 0.75/${(0.75 * hNorm).toFixed(3)} 1/1'`);
  }

  const sat = Number(grading.saturation);
  const cont = Number(grading.contrast);
  const bright = Number(grading.brightness);
  if (!isNaN(sat) || !isNaN(cont) || !isNaN(bright)) {
    const eqParts = [];
    if (!isNaN(sat) && sat !== 1) eqParts.push(`saturation=${sat.toFixed(2)}`);
    if (!isNaN(cont) && cont !== 1) eqParts.push(`contrast=${cont.toFixed(2)}`);
    if (!isNaN(bright) && bright !== 0) eqParts.push(`brightness=${bright.toFixed(2)}`);
    if (eqParts.length) parts.push(`eq=${eqParts.join(':')}`);
  }

  return parts.join(',');
}

// ── 5. Presets de 3D LUTs e Gerador de .cube ────────────────────────────────
const BUILTIN_LUTS = {
  teal_orange: {
    name: 'Teal & Orange (Blockbuster)',
    desc: 'Sombras verde-azuladas (teal) e tons de pele âmbar quente.',
    transform: (r, g, b) => {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const newR = Math.min(1, Math.max(0, r * 1.15 + (1 - lum) * 0.05));
      const newG = Math.min(1, Math.max(0, g * 0.95 + (1 - lum) * 0.08));
      const newB = Math.min(1, Math.max(0, b * 0.85 + (1 - lum) * 0.25));
      return [newR, newG, newB];
    }
  },
  vintage_kodak: {
    name: 'Vintage Kodak 1970',
    desc: 'Cores quentes vintage, contraste suave e pretos levemente lavados.',
    transform: (r, g, b) => {
      const newR = Math.min(1, Math.max(0, 0.05 + r * 0.95));
      const newG = Math.min(1, Math.max(0, 0.04 + g * 0.88));
      const newB = Math.min(1, Math.max(0, 0.08 + b * 0.78));
      return [newR, newG, newB];
    }
  },
  cyberpunk_neon: {
    name: 'Cyberpunk Neon',
    desc: 'Destaques magentas vívidos com sombras violetas e alto contraste.',
    transform: (r, g, b) => {
      const newR = Math.min(1, Math.max(0, Math.pow(r, 0.85) * 1.1));
      const newG = Math.min(1, Math.max(0, Math.pow(g, 1.1) * 0.85));
      const newB = Math.min(1, Math.max(0, Math.pow(b, 0.8) * 1.25));
      return [newR, newG, newB];
    }
  },
  noir_cinema: {
    name: 'Noir Cinema B&W',
    desc: 'Monocromático de alto contraste com textura de película clássica.',
    transform: (r, g, b) => {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const c = Math.min(1, Math.max(0, Math.pow(lum, 1.25) * 1.05));
      return [c, c, c];
    }
  },
  warm_sunset: {
    name: 'Warm Sunset Glow',
    desc: 'Tons dourados e vermelhos suaves para golden hour.',
    transform: (r, g, b) => {
      const newR = Math.min(1, Math.max(0, r * 1.2));
      const newG = Math.min(1, Math.max(0, g * 1.05));
      const newB = Math.min(1, Math.max(0, b * 0.82));
      return [newR, newG, newB];
    }
  }
};

/**
 * Gera o conteúdo em formato .cube (Adobe 3D LUT Cube format) para um preset.
 * Usa malha 17x17x17 (4913 pontos de cor).
 */
function generateCubeLutString(presetKey, size = 17) {
  const preset = BUILTIN_LUTS[presetKey];
  if (!preset) throw new Error(`Preset LUT '${presetKey}' não encontrado`);

  const lines = [];
  lines.push(`# LeccorCut 3D LUT — ${preset.name}`);
  lines.push(`# Gerado automaticamente pelo modulo visualEffects (Fase 11)`);
  lines.push(`LUT_3D_SIZE ${size}`);
  lines.push('');

  const step = 1 / (size - 1);
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const inR = r * step;
        const inG = g * step;
        const inB = b * step;
        const [outR, outG, outB] = preset.transform(inR, inG, inB);
        lines.push(`${outR.toFixed(6)} ${outG.toFixed(6)} ${outB.toFixed(6)}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Garante que a 3D LUT embutida existe em disco e retorna seu caminho absoluto.
 */
function ensureBuiltinLut(presetKey, targetDir) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const filePath = path.join(targetDir, `lut_${presetKey}.cube`);
  if (!fs.existsSync(filePath)) {
    const cubeContent = generateCubeLutString(presetKey);
    fs.writeFileSync(filePath, cubeContent, 'utf8');
  }
  return filePath;
}

/**
 * Constrói o filtro FFmpeg para aplicar arquivo de 3D LUT (.cube ou .3dl).
 */
function buildLutFilter(lutFilePath) {
  if (!lutFilePath || !fs.existsSync(lutFilePath)) return '';
  const escaped = lutFilePath.replace(/\\/g, '/').replace(/:/g, '\\:');
  return `lut3d=file='${escaped}':interp=tetrahedral`;
}

module.exports = {
  BLEND_MODES,
  SHAPE_MASKS,
  STYLING_EFFECTS,
  BUILTIN_LUTS,
  getCssBlendMode,
  getCssMaskStyle,
  buildFfmpegMaskFilter,
  buildColorGradingFilter,
  generateCubeLutString,
  ensureBuiltinLut,
  buildLutFilter
};
