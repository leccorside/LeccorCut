'use strict';
/**
 * beatSyncManager.js — Fase 16: Sincronização Automática com a Batida (Auto Beat Sync)
 *
 * Módulo para:
 * 1. Filtragem e modulação de intervalos rítmicos (1x batida, 2x batida, 4x compasso)
 * 2. Alinhamento automático dos pontos de corte e transição dos clipes de vídeo às batidas musicais
 * 3. Snap magnético rítmico da agulha aos marcadores de batida
 */

/**
 * Filtra uma lista de tempos de batidas pelo intervalo musical desejado.
 * @param {Array<number>} beats
 * @param {number} [interval=1] - 1 (todas), 2 (a cada 2 batidas), 4 (a cada 4 batidas / compasso)
 * @returns {Array<number>}
 */
function filterBeatsByInterval(beats, interval = 1) {
  if (!Array.isArray(beats) || beats.length === 0) return [];
  const sorted = [...beats].filter(b => typeof b === 'number' && !isNaN(b) && b >= 0).sort((a, b) => a - b);
  const step = Math.max(1, parseInt(interval) || 1);
  return sorted.filter((_, idx) => idx % step === 0);
}

/**
 * Sincroniza a duração e os cortes de uma lista de clipes de vídeo para coincidirem com as batidas musicais.
 * @param {Array<object>} clips - Clipes de vídeo da timeline
 * @param {Array<number>} beats - Tempos das batidas musicais em segundos
 * @param {object} [options]
 * @param {number} [options.beatInterval=1]
 * @param {number} [options.minClipDuration=0.4]
 * @param {number} [options.timelineStartOffset=0]
 * @returns {{ ok: boolean, alignedClips: Array<object>, cutPoints: Array<number>, cutsCount: number, rhythmSummary: string }}
 */
function alignClipsToBeatTimeline(clips, beats, options = {}) {
  if (!Array.isArray(clips) || clips.length === 0) {
    return { ok: false, error: 'Nenhum clipe fornecido para alinhamento rítmico.', alignedClips: [], cutPoints: [], cutsCount: 0 };
  }
  if (!Array.isArray(beats) || beats.length === 0) {
    return { ok: false, error: 'Nenhuma batida musical detectada na timeline.', alignedClips: clips, cutPoints: [], cutsCount: 0 };
  }

  const beatInterval = options.beatInterval || 1;
  const minDur = options.minClipDuration || 0.4;
  const filteredBeats = filterBeatsByInterval(beats, beatInterval);

  if (filteredBeats.length === 0) {
    return { ok: false, error: 'Nenhuma batida após filtragem de intervalo.', alignedClips: clips, cutPoints: [], cutsCount: 0 };
  }

  const alignedClips = JSON.parse(JSON.stringify(clips));
  const cutPoints = [];
  let beatIndex = 0;
  let currentTimelinePos = options.timelineStartOffset !== undefined
    ? options.timelineStartOffset
    : (alignedClips[0]?.start ?? 0);

  // Encontra a primeira batida que ocorre após ou próxima do início
  while (beatIndex < filteredBeats.length && filteredBeats[beatIndex] <= currentTimelinePos + 0.05) {
    beatIndex++;
  }

  alignedClips.forEach((clip, idx) => {
    clip.start = Number(currentTimelinePos.toFixed(3));

    // Se houver batida disponível subsequente
    if (beatIndex < filteredBeats.length) {
      const targetBeat = filteredBeats[beatIndex];
      let targetDuration = targetBeat - currentTimelinePos;

      // Se a duração até a próxima batida for muito curta (< minDur), avança para a próxima
      if (targetDuration < minDur && beatIndex + 1 < filteredBeats.length) {
        beatIndex++;
        targetDuration = filteredBeats[beatIndex] - currentTimelinePos;
      }

      if (targetDuration >= minDur) {
        clip.duration = Number(targetDuration.toFixed(3));
        cutPoints.push(Number(targetBeat.toFixed(3)));
        currentTimelinePos = targetBeat;
        beatIndex++;
      } else {
        // Mantém duração padrão caso não alcance o mínimo
        currentTimelinePos += clip.duration;
      }
    } else {
      // Clipes excedentes mantêm sua duração original
      currentTimelinePos += clip.duration;
    }
  });

  const cutsCount = cutPoints.length;
  const rhythmSummary = `${cutsCount} cortes sincronizados ao ritmo (${beatInterval}x batidas, ${cutsCount} transições rítmicas)`;

  return {
    ok: true,
    alignedClips,
    cutPoints,
    cutsCount,
    rhythmSummary
  };
}

/**
 * Encontra a batida musical mais próxima para Snap magnético na agulha.
 * @param {number} currentTime
 * @param {Array<number>} beats
 * @param {number} [threshold=0.15] - Tolerância em segundos (padrão 150ms)
 * @returns {{ snapped: boolean, time: number }}
 */
function snapToNearestBeat(currentTime, beats, threshold = 0.15) {
  if (!Array.isArray(beats) || beats.length === 0) return { snapped: false, time: currentTime };
  let closest = beats[0];
  let minDiff = Math.abs(currentTime - closest);

  for (let i = 1; i < beats.length; i++) {
    const diff = Math.abs(currentTime - beats[i]);
    if (diff < minDiff) {
      minDiff = diff;
      closest = beats[i];
    }
  }

  if (minDiff <= threshold) {
    return { snapped: true, time: closest };
  }
  return { snapped: false, time: currentTime };
}

module.exports = {
  filterBeatsByInterval,
  alignClipsToBeatTimeline,
  snapToNearestBeat
};
