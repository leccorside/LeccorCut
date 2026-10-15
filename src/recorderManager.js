'use strict';
/**
 * recorderManager.js — Fase 15: Gravação Direta na Timeline (Voiceover & Webcam PiP)
 *
 * Módulo de suporte do backend para:
 * 1. Processamento e conversão de locuções de voz gravadas (WebM/Opus -> WAV PCM estéreo de alta fidelidade)
 * 2. Processamento de vídeos de Webcam gravados (WebM -> MP4 H.264/AAC otimizado)
 * 3. Geração de thumbnails e extração de metadados
 * 4. Cálculo matemático de VU meter e níveis de pico em dB
 */

const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

/**
 * Garante que a pasta de gravações exista.
 */
function getRecordingsDir(baseDir) {
  const dir = path.join(baseDir || process.cwd(), 'recordings');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Calcula o nível RMS (Root Mean Square) e valor de pico de um buffer de amostras PCM.
 * @param {Float32Array|Int16Array|Array<number>} samples
 * @returns {{ rms: number, peak: number, db: number, clip: boolean }}
 */
function calculateAudioMetrics(samples) {
  if (!samples || samples.length === 0) {
    return { rms: 0, peak: 0, db: -100, clip: false };
  }

  let sumSquares = 0;
  let peak = 0;
  const len = samples.length;

  for (let i = 0; i < len; i++) {
    const val = Math.abs(samples[i]);
    if (val > peak) peak = val;
    sumSquares += val * val;
  }

  const rms = Math.sqrt(sumSquares / len);
  const normalizedPeak = Math.min(1, peak);
  const db = rms > 0.00001 ? Math.max(-100, 20 * Math.log10(rms)) : -100;
  const clip = normalizedPeak >= 0.99;

  return {
    rms: Number(rms.toFixed(4)),
    peak: Number(normalizedPeak.toFixed(4)),
    db: Number(db.toFixed(1)),
    clip
  };
}

/**
 * Converte um buffer de áudio recebido do MediaRecorder (WebM/Opus) para WAV PCM 16-bit 44.1kHz.
 * @param {string} ffmpegPath
 * @param {string} baseDir
 * @param {Buffer} audioBuffer
 * @param {string} [namePrefix='locucao']
 * @returns {Promise<{ ok: boolean, path: string, name: string, duration: number }>}
 */
function processAudioRecording(ffmpegPath, baseDir, audioBuffer, namePrefix = 'locucao') {
  return new Promise((resolve, reject) => {
    if (!audioBuffer || audioBuffer.length === 0) {
      return reject(new Error('Buffer de áudio vazio ou inválido'));
    }

    const recDir = getRecordingsDir(baseDir);
    const timestamp = Date.now();
    const tempRawPath = path.join(recDir, `temp_raw_${timestamp}.webm`);
    const finalWavName = `${namePrefix}_${timestamp}.wav`;
    const finalWavPath = path.join(recDir, finalWavName);

    fs.writeFileSync(tempRawPath, audioBuffer);

    // Converte para WAV PCM 16-bit 44.1kHz estéreo sem perdas
    const args = [
      '-y',
      '-i', tempRawPath,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', '44100',
      '-ac', '2',
      finalWavPath
    ];

    const proc = spawn(ffmpegPath, args);
    let stderr = '';

    proc.stderr.on('data', d => { stderr += d.toString(); });

    proc.on('close', code => {
      // Remove temporário
      try { if (fs.existsSync(tempRawPath)) fs.unlinkSync(tempRawPath); } catch (_) {}

      if (code !== 0 || !fs.existsSync(finalWavPath)) {
        return reject(new Error(`Falha ao converter áudio com FFmpeg (código ${code}): ${stderr}`));
      }

      // Estima duração a partir do tamanho do arquivo WAV PCM (44100 * 2 canais * 2 bytes = 176400 bytes/s)
      const stats = fs.statSync(finalWavPath);
      const dataSize = Math.max(0, stats.size - 44);
      const duration = Number((dataSize / 176400).toFixed(2)) || 1.0;

      resolve({
        ok: true,
        path: finalWavPath,
        name: finalWavName,
        duration,
        size: stats.size
      });
    });

    proc.on('error', err => {
      try { if (fs.existsSync(tempRawPath)) fs.unlinkSync(tempRawPath); } catch (_) {}
      reject(err);
    });
  });
}

/**
 * Converte um buffer de vídeo recebido do MediaRecorder da Webcam (WebM) para MP4 H.264/AAC.
 * @param {string} ffmpegPath
 * @param {string} baseDir
 * @param {Buffer} videoBuffer
 * @param {string} [namePrefix='webcam_pip']
 * @returns {Promise<{ ok: boolean, path: string, name: string, duration: number, thumb: string }>}
 */
function processVideoRecording(ffmpegPath, baseDir, videoBuffer, namePrefix = 'webcam_pip') {
  return new Promise((resolve, reject) => {
    if (!videoBuffer || videoBuffer.length === 0) {
      return reject(new Error('Buffer de vídeo vazio ou inválido'));
    }

    const recDir = getRecordingsDir(baseDir);
    const timestamp = Date.now();
    const tempRawPath = path.join(recDir, `temp_raw_${timestamp}.webm`);
    const finalMp4Name = `${namePrefix}_${timestamp}.mp4`;
    const finalMp4Path = path.join(recDir, finalMp4Name);

    fs.writeFileSync(tempRawPath, videoBuffer);

    // Converte para MP4 H.264 + AAC com +faststart para compatibilidade direta no Electron
    const args = [
      '-y',
      '-i', tempRawPath,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '22',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      finalMp4Path
    ];

    const proc = spawn(ffmpegPath, args);
    let stderr = '';

    proc.stderr.on('data', d => { stderr += d.toString(); });

    proc.on('close', async code => {
      try { if (fs.existsSync(tempRawPath)) fs.unlinkSync(tempRawPath); } catch (_) {}

      if (code !== 0 || !fs.existsSync(finalMp4Path)) {
        return reject(new Error(`Falha ao converter vídeo com FFmpeg (código ${code}): ${stderr}`));
      }

      // Extrai duração do log do FFmpeg se possível ou atribui padrão
      let duration = 1.0;
      const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
      if (durMatch) {
        duration = Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + Number(durMatch[3]);
      }

      // Gera thumbnail de visualização rápida do vídeo
      const finalThumbPath = finalMp4Path.replace(/\.mp4$/i, '.png');
      const thumbArgs = ['-y', '-ss', '0', '-i', finalMp4Path, '-vframes', '1', '-vf', 'scale=160:-1', finalThumbPath];
      const thumbProc = spawn(ffmpegPath, thumbArgs);
      thumbProc.on('close', () => {
        resolve({
          ok: true,
          path: finalMp4Path,
          name: finalMp4Name,
          duration: Number(duration.toFixed(2)),
          thumb: fs.existsSync(finalThumbPath) ? finalThumbPath : ''
        });
      });
      thumbProc.on('error', () => {
        resolve({
          ok: true,
          path: finalMp4Path,
          name: finalMp4Name,
          duration: Number(duration.toFixed(2)),
          thumb: ''
        });
      });
    });

    proc.on('error', err => {
      try { if (fs.existsSync(tempRawPath)) fs.unlinkSync(tempRawPath); } catch (_) {}
      reject(err);
    });
  });
}

module.exports = {
  getRecordingsDir,
  calculateAudioMetrics,
  processAudioRecording,
  processVideoRecording
};
