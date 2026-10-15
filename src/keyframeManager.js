'use strict';
/**
 * keyframeManager.js — Fase 13: Multi-Trilhas Ilimitadas e Keyframing Universal Livre
 *
 * Módulo responsável por:
 * 1. Estrutura e interpolação de Keyframes arbitrários (Posição X/Y, Escala, Rotação, Opacidade, Volume)
 * 2. Curvas de interpolação temporal (Linear, Ease-In, Ease-Out, Smooth Bezier)
 * 3. Conversão de keyframes para expressões de filtro dinâmicas do FFmpeg
 * 4. Sistema de Clipes Compostos (Compound Clips)
 * 5. Gerenciamento e bloqueio de trilhas dinâmicas (Track Lock)
 */

// ── 1. Interpolação Matemática de Curvas (Easing) ─────────────────────────────
const EASING_FUNCTIONS = {
  linear: (t) => t,
  ease_in: (t) => t * t,
  ease_out: (t) => t * (2 - t),
  smooth: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  bezier: (t) => {
    // Curva cúbica bezier aproximada suave (estilo CapCut / After Effects ease-in-out)
    return t * t * (3 - 2 * t);
  }
};

/**
 * Interpola um valor a partir de uma lista de keyframes ordenados temporalmente.
 * @param {Array<{ time: number, value: number, easing?: string }>} keyframes
 * @param {number} currentTime
 * @param {number} defaultValue
 * @returns {number}
 */
function interpolateKeyframes(keyframes, currentTime, defaultValue = 0) {
  if (!keyframes || !Array.isArray(keyframes) || keyframes.length === 0) {
    return defaultValue;
  }

  // Ordena por segurança
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);

  // Antes do primeiro keyframe
  if (currentTime <= sorted[0].time) {
    return sorted[0].value;
  }

  // Depois do último keyframe
  if (currentTime >= sorted[sorted.length - 1].time) {
    return sorted[sorted.length - 1].value;
  }

  // Entre dois keyframes
  for (let i = 0; i < sorted.length - 1; i++) {
    const k1 = sorted[i];
    const k2 = sorted[i + 1];

    if (currentTime >= k1.time && currentTime <= k2.time) {
      const span = k2.time - k1.time;
      if (span <= 0) return k2.value;

      const progress = (currentTime - k1.time) / span;
      const easeFn = EASING_FUNCTIONS[k1.easing] || EASING_FUNCTIONS.linear;
      const easedProgress = easeFn(progress);

      return k1.value + (k2.value - k1.value) * easedProgress;
    }
  }

  return defaultValue;
}

/**
 * Avalia todos os keyframes de um clipe no instante local dado.
 * @param {Object} item - Clipe de vídeo, overlay ou áudio
 * @param {number} localTime - Tempo local dentro do clipe (0 a duration)
 * @returns {Object} - Valores avaliados
 */
function evaluateItemKeyframes(item, localTime) {
  if (!item || !item.keyframes) {
    return {
      x: item?.x ?? 0.5,
      y: item?.y ?? 0.5,
      scale: item?.scale ?? 100,
      rotate: item?.rotate ?? 0,
      opacity: item?.opacity ?? 1,
      volume: item?.volume ?? 1
    };
  }

  const kf = item.keyframes;
  return {
    x: kf.x ? interpolateKeyframes(kf.x, localTime, item.x ?? 0.5) : (item.x ?? 0.5),
    y: kf.y ? interpolateKeyframes(kf.y, localTime, item.y ?? 0.5) : (item.y ?? 0.5),
    scale: kf.scale ? interpolateKeyframes(kf.scale, localTime, item.scale ?? 100) : (item.scale ?? 100),
    rotate: kf.rotate ? interpolateKeyframes(kf.rotate, localTime, item.rotate ?? 0) : (item.rotate ?? 0),
    opacity: kf.opacity ? interpolateKeyframes(kf.opacity, localTime, item.opacity ?? 1) : (item.opacity ?? 1),
    volume: kf.volume ? interpolateKeyframes(kf.volume, localTime, item.volume ?? 1) : (item.volume ?? 1)
  };
}

/**
 * Adiciona ou substitui um keyframe em uma propriedade do item.
 * @param {Object} item
 * @param {string} prop - 'x', 'y', 'scale', 'rotate', 'opacity', 'volume'
 * @param {number} time - Tempo relativo no clipe
 * @param {number} value - Valor do keyframe
 * @param {string} [easing='linear']
 */
function setKeyframe(item, prop, time, value, easing = 'linear') {
  if (!item) return;
  if (!item.keyframes) item.keyframes = {};
  if (!item.keyframes[prop]) item.keyframes[prop] = [];

  const list = item.keyframes[prop];
  const roundedTime = Number(time.toFixed(3));
  const existingIndex = list.findIndex(k => Math.abs(k.time - roundedTime) < 0.04);

  if (existingIndex >= 0) {
    list[existingIndex].value = value;
    list[existingIndex].easing = easing;
  } else {
    list.push({ time: roundedTime, value, easing });
    list.sort((a, b) => a.time - b.time);
  }
}

/**
 * Remove um keyframe próximo ao tempo dado.
 */
function removeKeyframe(item, prop, time) {
  if (!item || !item.keyframes || !item.keyframes[prop]) return false;
  const list = item.keyframes[prop];
  const initialLength = list.length;
  item.keyframes[prop] = list.filter(k => Math.abs(k.time - time) >= 0.05);
  return item.keyframes[prop].length < initialLength;
}

/**
 * Verifica se existe keyframe ativo próximo ao tempo atual.
 */
function hasKeyframeAtTime(item, prop, time) {
  if (!item || !item.keyframes || !item.keyframes[prop]) return false;
  return item.keyframes[prop].some(k => Math.abs(k.time - time) < 0.05);
}

// ── 2. Expressões Matemáticas Dinâmicas para FFmpeg ───────────────────────────

/**
 * Converte uma lista de keyframes numéricos em expressão temporal encadeada para FFmpeg (if/between/lerp).
 * Exemplo para overlay x: 'if(between(t, 0, 2), 0.2 + (0.8-0.2)*(t-0)/2, 0.8)'
 * @param {Array<{ time: number, value: number, easing?: string }>} keyframes
 * @param {number} defaultValue
 * @returns {string}
 */
function buildFfmpegExpression(keyframes, defaultValue) {
  if (!keyframes || keyframes.length === 0) {
    return String(defaultValue);
  }

  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  if (sorted.length === 1) {
    return String(sorted[0].value);
  }

  // Constrói expressão aninhada reversa
  let expr = String(sorted[sorted.length - 1].value);

  for (let i = sorted.length - 2; i >= 0; i--) {
    const k1 = sorted[i];
    const k2 = sorted[i + 1];
    const t1 = Number(k1.time.toFixed(3));
    const t2 = Number(k2.time.toFixed(3));
    const v1 = Number(k1.value.toFixed(4));
    const v2 = Number(k2.value.toFixed(4));
    const dur = Number((k2.time - k1.time).toFixed(3));

    // Interpolação linear no FFmpeg: v1 + (v2 - v1) * (t - t1) / dur
    const segmentLerp = `(${v1}+(${v2}-${v1})*(t-${t1})/${dur})`;
    expr = `if(lt(t,${t1}),${v1},if(lte(t,${t2}),${segmentLerp},${expr}))`;
  }

  return expr;
}

// ── 3. Clipes Compostos (Compound Clips) ──────────────────────────────────────

/**
 * Cria um clipe composto agrupando múltiplos clipes da timeline.
 * @param {Array<Object>} clips - Lista de clipes selecionados
 * @param {string} [name='Clipe Composto']
 * @returns {Object} - Compound Clip
 */
function createCompoundClip(clips, name = 'Clipe Composto') {
  if (!clips || clips.length === 0) {
    throw new Error('Nenhum clipe fornecido para agrupamento');
  }

  const sorted = [...clips].sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  const startTime = sorted[0].start ?? 0;
  let maxEndTime = startTime;

  sorted.forEach(c => {
    const cEnd = (c.start ?? 0) + (c.duration ?? 0);
    if (cEnd > maxEndTime) maxEndTime = cEnd;
  });

  const totalDuration = maxEndTime - startTime;

  return {
    id: `compound_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    isCompound: true,
    name,
    start: startTime,
    duration: totalDuration,
    originalClips: JSON.parse(JSON.stringify(sorted)),
    color: '#7c5cff'
  };
}

/**
 * Desfaz um clipe composto, restaurando os clipes originais com suas posições relativas.
 * @param {Object} compoundClip
 * @returns {Array<Object>}
 */
function expandCompoundClip(compoundClip) {
  if (!compoundClip || !compoundClip.isCompound || !Array.isArray(compoundClip.originalClips)) {
    throw new Error('Objeto fornecido não é um clipe composto válido');
  }

  const offset = compoundClip.start - (compoundClip.originalClips[0]?.start ?? compoundClip.start);
  return compoundClip.originalClips.map(clip => {
    const restored = JSON.parse(JSON.stringify(clip));
    if (restored.start !== undefined) {
      restored.start += offset;
    }
    return restored;
  });
}

// ── 4. Gerenciamento e Bloqueio de Trilhas (Track Lock) ───────────────────────

/**
 * Cria estrutura inicial de trilhas dinâmicas com controle de bloqueio.
 */
function createTracksState() {
  return {
    video: { id: 'video-main', name: '🎬 Vídeo Principal', locked: false, visible: true, mute: false },
    overlay: { id: 'overlay-1', name: '🖼️ Sobreposição 1', locked: false, visible: true },
    text: { id: 'text-1', name: '🔤 Legendas / Texto', locked: false, visible: true },
    audio: { id: 'audio-main', name: '🎵 Áudio Principal', locked: false, mute: false, solo: false }
  };
}

/**
 * Verifica se uma trilha está bloqueada para edição.
 * @param {Object} tracksState
 * @param {string} trackType - 'video', 'overlay', 'text', 'audio'
 * @param {number|string} [trackIndex=0]
 * @returns {boolean}
 */
function isTrackLocked(tracksState, trackType, trackIndex = 0) {
  if (!tracksState || !tracksState[trackType]) return false;
  const track = Array.isArray(tracksState[trackType])
    ? tracksState[trackType][trackIndex] || tracksState[trackType][0]
    : tracksState[trackType];
  return Boolean(track?.locked);
}

/**
 * Alterna o estado de bloqueio (lock/unlock) de uma trilha.
 */
function toggleTrackLock(tracksState, trackType, trackIndex = 0) {
  if (!tracksState || !tracksState[trackType]) return false;
  const track = Array.isArray(tracksState[trackType])
    ? tracksState[trackType][trackIndex] || tracksState[trackType][0]
    : tracksState[trackType];
  if (track) {
    track.locked = !track.locked;
    return track.locked;
  }
  return false;
}

module.exports = {
  EASING_FUNCTIONS,
  interpolateKeyframes,
  evaluateItemKeyframes,
  setKeyframe,
  removeKeyframe,
  hasKeyframeAtTime,
  buildFfmpegExpression,
  createCompoundClip,
  expandCompoundClip,
  createTracksState,
  isTrackLocked,
  toggleTrackLock
};
