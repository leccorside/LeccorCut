'use strict';
/**
 * silenceDetector.js — Fase 16: Removedor Inteligente de Silêncio e Pausas
 *
 * Módulo para:
 * 1. Análise acústica com FFmpeg silencedetect (-20dB a -50dB)
 * 2. Cálculo de intervalos de silêncio e trechos ativos de fala com padding de proteção
 * 3. Geração de arquivo consolidado sem pausas com micro-fades de áudio
 * 4. Fatiamento e ripple delete automático de clipes na timeline
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Detecta intervalos de silêncio acústico em um arquivo de áudio ou vídeo via FFmpeg.
 * @param {string} ffmpegPath
 * @param {string} inputPath
 * @param {object} [options]
 * @param {number|string} [options.noiseThreshold='-35dB']
 * @param {number} [options.minDuration=0.4]
 * @param {number} [options.padding=0.06]
 * @returns {Promise<{ ok: boolean, silences: Array<{start: number, end: number, duration: number}>, speechSegments: Array<{start: number, end: number, duration: number}>, totalSilenceDuration: number, totalDuration: number }>}
 */
function detectSilence(ffmpegPath, inputPath, options = {}) {
  return new Promise((resolve, reject) => {
    if (!inputPath || !fs.existsSync(inputPath)) {
      return reject(new Error(`Arquivo de entrada não encontrado: ${inputPath}`));
    }

    const noise = typeof options.noiseThreshold === 'number'
      ? `${options.noiseThreshold}dB`
      : (options.noiseThreshold || '-35dB');
    const minDur = Number(options.minDuration || 0.4);
    const padding = Number(options.padding ?? 0.06);

    const args = [
      '-i', inputPath,
      '-af', `silencedetect=noise=${noise}:d=${minDur}`,
      '-f', 'null',
      '-'
    ];

    const proc = spawn(ffmpegPath, args);
    let stderr = '';

    proc.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    proc.on('close', code => {
      if (code !== 0 && !stderr.includes('silence_start')) {
        return reject(new Error(`Falha na análise de silêncio do FFmpeg (código ${code}): ${stderr}`));
      }

      // Extrai duração total do arquivo
      let totalDuration = 0;
      const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
      if (durMatch) {
        totalDuration = Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + Number(durMatch[3]);
      }

      const silences = [];
      const startRegex = /silence_start:\s*(-?[\d.]+)/g;
      const endRegex = /silence_end:\s*(-?[\d.]+)\s*\|\s*silence_duration:\s*(-?[\d.]+)/g;

      let sMatch;
      const startTimes = [];
      while ((sMatch = startRegex.exec(stderr)) !== null) {
        startTimes.push(Math.max(0, parseFloat(sMatch[1])));
      }

      let eMatch;
      let idx = 0;
      while ((eMatch = endRegex.exec(stderr)) !== null) {
        const end = parseFloat(eMatch[1]);
        const dur = parseFloat(eMatch[2]);
        const start = startTimes[idx] !== undefined ? startTimes[idx] : Math.max(0, end - dur);
        silences.push({
          start: Number(start.toFixed(3)),
          end: Number(end.toFixed(3)),
          duration: Number(dur.toFixed(3))
        });
        idx++;
      }

      // Se houver silêncio no final sem end explícito
      if (startTimes.length > silences.length && totalDuration > 0) {
        const lastStart = startTimes[startTimes.length - 1];
        if (totalDuration > lastStart) {
          silences.push({
            start: Number(lastStart.toFixed(3)),
            end: Number(totalDuration.toFixed(3)),
            duration: Number((totalDuration - lastStart).toFixed(3))
          });
        }
      }

      // Calcula os segmentos de fala/conteúdo ativo com padding
      const speechSegments = [];
      let currentPos = 0;

      for (const sil of silences) {
        const speechEnd = Math.max(0, sil.start + padding);
        const speechStart = Math.max(0, currentPos > 0 ? currentPos - padding : 0);

        if (speechEnd - speechStart >= 0.1) {
          speechSegments.push({
            start: Number(speechStart.toFixed(3)),
            end: Number(speechEnd.toFixed(3)),
            duration: Number((speechEnd - speechStart).toFixed(3))
          });
        }
        currentPos = sil.end;
      }

      // Trecho final de fala após o último silêncio
      if (totalDuration > 0 && currentPos < totalDuration) {
        const speechStart = Math.max(0, currentPos - padding);
        if (totalDuration - speechStart >= 0.1) {
          speechSegments.push({
            start: Number(speechStart.toFixed(3)),
            end: Number(totalDuration.toFixed(3)),
            duration: Number((totalDuration - speechStart).toFixed(3))
          });
        }
      }

      // Se não detectou silêncio nenhum, todo o arquivo é fala
      if (silences.length === 0 && totalDuration > 0) {
        speechSegments.push({
          start: 0,
          end: Number(totalDuration.toFixed(3)),
          duration: Number(totalDuration.toFixed(3))
        });
      }

      const totalSilenceDuration = Number(silences.reduce((acc, s) => acc + s.duration, 0).toFixed(3));

      resolve({
        ok: true,
        silences,
        speechSegments,
        totalSilenceDuration,
        totalDuration: Number(totalDuration.toFixed(3))
      });
    });

    proc.on('error', reject);
  });
}

/**
 * Cria novos sub-clipes fatiados para a timeline baseados nos segmentos ativos de fala.
 * @param {object} baseClip
 * @param {Array<{start: number, end: number, duration: number}>} speechSegments
 * @param {number} [startPlayheadTime=0]
 * @returns {Array<object>}
 */
function sliceClipBySpeechSegments(baseClip, speechSegments, startPlayheadTime = 0) {
  if (!baseClip || !Array.isArray(speechSegments) || speechSegments.length === 0) {
    return baseClip ? [JSON.parse(JSON.stringify(baseClip))] : [];
  }

  const resultClips = [];
  let timelineCursor = startPlayheadTime;
  const clipInOffset = baseClip.in || 0;

  speechSegments.forEach((seg, index) => {
    // Clona o clipe base preservando propriedades visuais e de áudio
    const newClip = JSON.parse(JSON.stringify(baseClip));
    newClip.id = (baseClip.id ? baseClip.id * 1000 : 9000) + index + 1;
    newClip.name = `${baseClip.name || 'Clipe'} (Parte ${index + 1})`;
    newClip.start = Number(timelineCursor.toFixed(3));
    newClip.in = Number((clipInOffset + seg.start).toFixed(3));
    newClip.duration = Number(seg.duration.toFixed(3));
    newClip.max = baseClip.max || seg.end;

    // Micro-fades para suprimir estalos nas bordas
    newClip.fadeIn = 0.015;
    newClip.fadeOut = 0.015;

    resultClips.push(newClip);
    timelineCursor += seg.duration;
  });

  return resultClips;
}

/**
 * Exporta um arquivo físico concatenado contendo apenas as partes com fala e micro-fades.
 * @param {string} ffmpegPath
 * @param {string} baseDir
 * @param {string} inputPath
 * @param {object} [options]
 * @returns {Promise<{ ok: boolean, path: string, duration: number, removedDuration: number }>}
 */
async function removeSilenceFile(ffmpegPath, baseDir, inputPath, options = {}) {
  const analysis = await detectSilence(ffmpegPath, inputPath, options);
  if (!analysis.speechSegments || analysis.speechSegments.length === 0) {
    throw new Error('Nenhum trecho de áudio detectado no arquivo.');
  }

  const ext = path.extname(inputPath).toLowerCase();
  const isAudioOnly = ['.mp3', '.wav', '.aac', '.m4a', '.ogg', '.flac'].includes(ext);
  const outDir = path.join(baseDir || process.cwd(), 'recordings');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outName = `sem_silencio_${Date.now()}${isAudioOnly ? '.wav' : '.mp4'}`;
  const outPath = path.join(outDir, outName);

  // Constrói filtro complexo com select / aselect para os intervalos de fala
  const segs = analysis.speechSegments;
  const betweenExpr = segs.map(s => `between(t,${s.start},${s.end})`).join('+');

  const args = ['-y', '-i', inputPath];

  if (isAudioOnly) {
    args.push(
      '-af', `aselect='${betweenExpr}',asetpts=N/SR/TB,afade=t=in:ss=0:d=0.015,afade=t=out:st=${analysis.totalDuration - 0.015}:d=0.015`,
      outPath
    );
  } else {
    args.push(
      '-vf', `select='${betweenExpr}',setpts=N/FRAME_RATE/TB`,
      '-af', `aselect='${betweenExpr}',asetpts=N/SR/TB,afade=t=in:ss=0:d=0.015`,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-c:a', 'aac',
      '-b:a', '192k',
      outPath
    );
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code !== 0 || !fs.existsSync(outPath)) {
        return reject(new Error(`Falha ao remover silêncios com FFmpeg (código ${code}): ${stderr}`));
      }
      const newDuration = Number(segs.reduce((a, s) => a + s.duration, 0).toFixed(2));
      resolve({
        ok: true,
        path: outPath,
        name: outName,
        duration: newDuration,
        removedDuration: analysis.totalSilenceDuration
      });
    });
    proc.on('error', reject);
  });
}

module.exports = {
  detectSilence,
  sliceClipBySpeechSegments,
  removeSilenceFile
};
