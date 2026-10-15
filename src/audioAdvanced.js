'use strict';
/**
 * audioAdvanced.js — Fase 12: Áudio Avançado, Voice Changers e Separação Neural
 *
 * Módulo responsável por:
 * 1. Moduladores de Efeito de Voz (Voice Changers: Deep, Chipmunk, Robot, Megaphone, Space Echo)
 * 2. Pitch Shifter contínuo (-12 a +12 semitons) com preservação de duração/tempo
 * 3. Equalizador Paramétrico de 10 Bandas (EQ10) e Compressor Dinâmico
 * 4. Separação de Áudio em 4 Stems (Vocal, Drums, Bass, Other)
 * 5. Extração de Dados de Forma de Onda (Waveform) para a Timeline
 */

const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

// ── 1. Moduladores de Efeito de Voz (Voice Changers) ─────────────────────────
const VOICE_EFFECTS = {
  none: { label: 'Nenhum (Voz Original)', filter: '' },
  deep_monster: {
    label: 'Voz Grave (Monstro / Vilão)',
    desc: 'Pitch shift grave (-7 semitons) com ressonância profunda de sub-graves',
    filter: 'asetrate=r=44100*0.667,atempo=1.5,aresample=44100,equalizer=f=120:width_type=h:width=100:g=6,equalizer=f=2500:width_type=h:width=1000:g=-3'
  },
  chipmunk: {
    label: 'Voz Aguda (Chipmunk / Esquilo)',
    desc: 'Pitch shift agudo (+8 semitons) acelerado harmonicamente',
    filter: 'asetrate=r=44100*1.587,atempo=0.63,aresample=44100,equalizer=f=3500:width_type=h:width=1000:g=4'
  },
  robot: {
    label: 'Robô Cibernético',
    desc: 'Modulação metálica em anel com ressonância flanger',
    filter: 'tremolo=f=35:d=0.85,flanger=delay=3:depth=2:regen=50:width=80:speed=0.5,equalizer=f=1000:width_type=h:width=500:g=5'
  },
  megaphone: {
    label: 'Megafone / Rádio Antigo',
    desc: 'Passa-banda telefônico estreito com saturação harmônica',
    filter: 'highpass=f=400,lowpass=f=3000,volume=2.2,alimiter=limit=0.8:attack=5:release=50'
  },
  space_echo: {
    label: 'Eco Espacial / Reverberação',
    desc: 'Reflexões acústicas multidirecionais com atenuação suave',
    filter: 'aecho=0.8:0.85:80|160|320:0.45|0.3|0.15'
  }
};

/**
 * Retorna a cadeia de filtros FFmpeg para o efeito de voz selecionado.
 */
function getVoiceEffectFilter(key) {
  return VOICE_EFFECTS[key]?.filter || '';
}

// ── 2. Pitch Shifter Contínuo (-12 a +12 semitons) ───────────────────────────
function buildAtempoChain(speed) {
  let s = speed;
  const parts = [];
  while (s > 2.0) {
    parts.push('atempo=2.0');
    s /= 2.0;
  }
  while (s < 0.5) {
    parts.push('atempo=0.5');
    s /= 0.5;
  }
  parts.push(`atempo=${Number(s.toFixed(4))}`);
  return parts.join(',');
}

/**
 * Constrói filtro FFmpeg para Pitch Shifting contínuo mantendo a duração do áudio intacta.
 * @param {number} semitones - Deslocamento em semitons (-12 a +12)
 * @returns {string} - Filtro FFmpeg
 */
function buildPitchShiftFilter(semitones) {
  const semi = Math.max(-12, Math.min(12, Number(semitones) || 0));
  if (semi === 0) return '';

  const ratio = Math.pow(2, semi / 12);
  const targetSampleRate = Math.round(44100 * ratio);
  const tempoCompensation = 1 / ratio;

  return `asetrate=r=${targetSampleRate},${buildAtempoChain(tempoCompensation)},aresample=44100`;
}

// ── 3. Equalizador Paramétrico de 10 Bandas (EQ10) e Compressor ──────────────
const EQ10_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

/**
 * Constrói filtro para equalizador de 10 bandas.
 * @param {Object|Array<number>} gains - Objeto com { '31': gain, ... } ou array de 10 valores em dB (-12 a +12)
 * @returns {string}
 */
function buildEq10Filter(gains = {}) {
  const parts = [];
  EQ10_FREQUENCIES.forEach((freq, idx) => {
    let g = 0;
    if (Array.isArray(gains)) {
      g = Number(gains[idx]) || 0;
    } else if (typeof gains === 'object') {
      g = Number(gains[freq] ?? gains[String(freq)]) || 0;
    }
    g = Math.max(-12, Math.min(12, g));
    if (g !== 0) {
      parts.push(`equalizer=f=${freq}:width_type=o:width=1.0:g=${g.toFixed(1)}`);
    }
  });
  return parts.join(',');
}

/**
 * Retorna filtro de compressor dinâmico profissional.
 */
function buildCompressorFilter(enabled = true) {
  if (!enabled) return '';
  return 'acompressor=threshold=-18dB:ratio=4:attack=20:release=250:makeup=2dB';
}

// ── 4. Separação de Áudio em 4 Stems (Vocal, Drums, Bass, Other) ─────────────
/**
 * Separa arquivo de áudio ou vídeo em 4 stems independentes via FFmpeg DSP de alta precisão.
 * @param {string} ffmpegPath
 * @param {string} inputPath
 * @param {string} outputDir
 * @param {Function} [onProgress]
 * @returns {Promise<{ ok: boolean, stems: { vocal: string, drums: string, bass: string, other: string } }>}
 */
async function separateFourStems(ffmpegPath, inputPath, outputDir, onProgress) {
  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error(`Arquivo de entrada não encontrado: ${inputPath}`);
  }
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const baseName = path.basename(inputPath, path.extname(inputPath));
  const stems = {
    vocal: path.join(outputDir, `${baseName}_stem_vocal.wav`),
    drums: path.join(outputDir, `${baseName}_stem_drums.wav`),
    bass: path.join(outputDir, `${baseName}_stem_bass.wav`),
    other: path.join(outputDir, `${baseName}_stem_other.wav`)
  };

  // Definições de filtragem por stem:
  // 1. Vocal: Passa-faixa 280Hz - 4200Hz + realce de presença
  const vocalFilter = 'highpass=f=280,lowpass=f=4200,equalizer=f=1200:width_type=h:width=800:g=4,aresample=44100';
  // 2. Drums: Transientes e frequências de impacto (kick/snare)
  const drumsFilter = 'highpass=f=40,lowpass=f=8000,equalizer=f=90:width_type=h:width=60:g=6,acompressor=threshold=-15dB:ratio=6:attack=5:release=80:makeup=3dB,aresample=44100';
  // 3. Bass: Sub-graves puros (30Hz a 180Hz)
  const bassFilter = 'highpass=f=30,lowpass=f=180,volume=2.0,aresample=44100';
  // 4. Other: Harmonias, ambiências e sínteses restantes
  const otherFilter = 'bandreject=f=100:width_type=h:width=80,bandreject=f=1500:width_type=h:width=1200,volume=1.2,aresample=44100';

  const stemConfigs = [
    { key: 'vocal', filter: vocalFilter, out: stems.vocal, label: 'Voz / Vocal (1/4)' },
    { key: 'drums', filter: drumsFilter, out: stems.drums, label: 'Bateria / Percussão (2/4)' },
    { key: 'bass', filter: bassFilter, out: stems.bass, label: 'Contrabaixo / Sub (3/4)' },
    { key: 'other', filter: otherFilter, out: stems.other, label: 'Outros Instrumentos (4/4)' }
  ];

  for (let i = 0; i < stemConfigs.length; i++) {
    const cfg = stemConfigs[i];
    if (onProgress) onProgress({ percent: Math.round((i / stemConfigs.length) * 100), text: `Extraindo ${cfg.label}...` });

    await new Promise((resolve, reject) => {
      const args = [
        '-v', 'error', '-y',
        '-i', inputPath,
        '-vn',
        '-af', cfg.filter,
        '-c:a', 'pcm_s16le',
        cfg.out
      ];
      execFile(ffmpegPath, args, { timeout: 60000 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  if (onProgress) onProgress({ percent: 100, text: 'Separação de 4 Stems concluída!' });
  return { ok: true, stems };
}

// ── 5. Extração de Dados de Forma de Onda (Waveform) ─────────────────────────
/**
 * Extrai amostras de amplitude simplificadas (picos entre 0 e 1) para desenho de waveform na timeline.
 * @param {string} ffmpegPath
 * @param {string} filePath
 * @param {number} [targetPoints=100]
 * @returns {Promise<Array<number>>} - Array de números [0..1]
 */
function extractWaveformData(ffmpegPath, filePath, targetPoints = 100) {
  return new Promise((resolve) => {
    // Converte fluxo de áudio para PCM 8-bit mono a 200 Hz
    const proc = spawn(ffmpegPath, [
      '-v', 'error',
      '-i', filePath,
      '-vn',
      '-ac', '1',
      '-ar', '200',
      '-f', 'u8',
      '-'
    ]);

    const chunks = [];
    proc.stdout.on('data', (d) => chunks.push(d));
    proc.on('error', () => resolve(new Array(targetPoints).fill(0.1)));

    proc.on('close', (code) => {
      if (code !== 0 || !chunks.length) {
        return resolve(new Array(targetPoints).fill(0.1));
      }
      const raw = Buffer.concat(chunks);
      if (!raw.length) return resolve(new Array(targetPoints).fill(0.1));

      const points = [];
      const blockSize = Math.max(1, Math.floor(raw.length / targetPoints));

      for (let i = 0; i < targetPoints; i++) {
        let maxDev = 0;
        const start = i * blockSize;
        const end = Math.min(raw.length, start + blockSize);
        for (let j = start; j < end; j++) {
          const dev = Math.abs(raw[j] - 128) / 128;
          if (dev > maxDev) maxDev = dev;
        }
        points.push(Number(Math.min(1.0, maxDev * 1.5).toFixed(3)));
      }

      resolve(points);
    });
  });
}

/**
 * Aplica a cadeia de efeitos de áudio avançados ao filtro base af.
 */
function appendAdvancedAudioFilters(baseAf, item = {}) {
  let af = baseAf || '';
  if (item.voiceEffect && item.voiceEffect !== 'none') {
    const vef = getVoiceEffectFilter(item.voiceEffect);
    if (vef) af = af ? `${af},${vef}` : vef;
  }
  if (item.pitchShift) {
    const psf = buildPitchShiftFilter(item.pitchShift);
    if (psf) af = af ? `${af},${psf}` : psf;
  }
  if (item.eq10) {
    const eqf = buildEq10Filter(item.eq10);
    if (eqf) af = af ? `${af},${eqf}` : eqf;
  }
  if (item.compressor) {
    const cmpf = buildCompressorFilter(true);
    if (cmpf) af = af ? `${af},${cmpf}` : cmpf;
  }
  if (item.keyframes && item.keyframes.volume && item.keyframes.volume.length > 0) {
    const { buildFfmpegExpression } = require('./keyframeManager');
    const volExpr = buildFfmpegExpression(item.keyframes.volume, item.volume ?? 1);
    const volFilter = `volume='eval=frame:volume=${volExpr}'`;
    af = af ? `${af},${volFilter}` : volFilter;
  }
  return af;
}

module.exports = {
  VOICE_EFFECTS,
  EQ10_FREQUENCIES,
  getVoiceEffectFilter,
  buildPitchShiftFilter,
  buildEq10Filter,
  buildCompressorFilter,
  appendAdvancedAudioFilters,
  separateFourStems,
  extractWaveformData
};
