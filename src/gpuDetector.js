'use strict';
/**
 * gpuDetector.js — Fase 10: Detecção de Encoders por Hardware (GPU)
 *
 * Sonda o FFmpeg instalado para identificar quais encoders acelerados por
 * hardware estão disponíveis no sistema: NVIDIA NVENC, Intel QuickSync (QSV)
 * e AMD AMF/VCE.
 *
 * Equivalente ao que o CapCut faz via VEDetector.exe + gpuSupport.ini.
 */

const { execFile } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Cache em memória para a sessão atual (evita sondagens repetidas)
let _cachedResult = null;

const GPU_ENCODERS = {
  nvenc: {
    label: 'NVIDIA NVENC',
    encoders: { h264: 'h264_nvenc', hevc: 'hevc_nvenc', av1: 'av1_nvenc' },
    hwaccel: 'd3d11va',
    priority: 1
  },
  qsv: {
    label: 'Intel QuickSync (QSV)',
    encoders: { h264: 'h264_qsv', hevc: 'hevc_qsv', av1: 'av1_qsv' },
    hwaccel: 'qsv',
    priority: 2
  },
  amf: {
    label: 'AMD AMF/VCE',
    encoders: { h264: 'h264_amf', hevc: 'hevc_amf' },
    hwaccel: 'd3d11va',
    priority: 3
  }
};

function runFfmpegEncoders(ffmpegPath) {
  return new Promise((resolve) => {
    execFile(ffmpegPath, ['-encoders', '-v', 'error'], { timeout: 8000 }, (err, stdout) => {
      resolve(err ? '' : (stdout || ''));
    });
  });
}

function probeEncoder(ffmpegPath, encoder) {
  return new Promise((resolve) => {
    const args = [
      '-f', 'lavfi', '-i', 'nullsrc=s=128x128:d=0.04',
      '-frames:v', '2',
      '-c:v', encoder,
      '-f', 'null', '-'
    ];
    execFile(ffmpegPath, args, { timeout: 12000 }, (err) => {
      resolve(!err);
    });
  });
}

async function detectGpuEncoders(ffmpegPath, forceRefresh = false) {
  if (_cachedResult && !forceRefresh) return _cachedResult;

  const result = {
    available: [],
    recommended: 'cpu',
    encoders: {},
    hwaccelFlag: null,
    probeLog: []
  };

  try {
    const encodersOutput = await runFfmpegEncoders(ffmpegPath);
    const hasCompiled = (enc) => encodersOutput.includes(enc);

    const groups = Object.entries(GPU_ENCODERS)
      .sort((a, b) => a[1].priority - b[1].priority);

    for (const [groupKey, groupInfo] of groups) {
      const h264enc = groupInfo.encoders.h264;
      const hevcenc = groupInfo.encoders.hevc;

      if (!hasCompiled(h264enc)) {
        result.probeLog.push(`${groupKey}: ${h264enc} não compilado no FFmpeg`);
        continue;
      }

      const h264works = await probeEncoder(ffmpegPath, h264enc);
      if (!h264works) {
        result.probeLog.push(`${groupKey}: ${h264enc} compilado, mas hardware não disponível`);
        continue;
      }

      const hevcCompiled = hasCompiled(hevcenc);
      const hevcWorks = hevcCompiled ? await probeEncoder(ffmpegPath, hevcenc) : false;

      result.available.push(groupKey);
      result.encoders[groupKey] = {
        label: groupInfo.label,
        h264: h264enc,
        hevc: hevcWorks ? hevcenc : h264enc,
        hwaccel: groupInfo.hwaccel
      };
      result.probeLog.push(`${groupKey}: OK (h264=${h264enc}, hevc=${hevcWorks ? hevcenc : 'não'})`);
    }

    if (result.available.length > 0) {
      result.recommended = result.available[0];
      result.hwaccelFlag = result.encoders[result.available[0]].hwaccel;
    }
  } catch (e) {
    result.probeLog.push(`Erro na sondagem de GPU: ${e.message}`);
  }

  _cachedResult = result;
  return result;
}

function resolveEncoderArgs(gpuInfo, userPref, format, colorProfile) {
  const fallback = {
    codecArgs: ['-c:v', 'libx264', '-preset', 'medium'],
    hwaccelArgs: [],
    label: 'CPU (libx264)',
    isGpu: false
  };

  if (format && format !== 'mp4') return fallback;
  if (userPref === 'cpu') return fallback;

  let targetGroup = null;
  if (userPref === 'auto') {
    targetGroup = (gpuInfo && gpuInfo.recommended !== 'cpu') ? gpuInfo.recommended : null;
  } else if (gpuInfo && gpuInfo.available && gpuInfo.available.includes(userPref)) {
    targetGroup = userPref;
  }

  if (!targetGroup || !gpuInfo || !gpuInfo.encoders || !gpuInfo.encoders[targetGroup]) return fallback;

  const enc = gpuInfo.encoders[targetGroup];
  const encoder = colorProfile === 'bt2020' ? (enc.hevc || enc.h264) : enc.h264;
  const hwaccelArgs = enc.hwaccel ? ['-hwaccel', enc.hwaccel] : [];

  const codecArgs = ['-c:v', encoder];
  if (encoder.includes('nvenc')) {
    codecArgs.push('-rc', 'vbr', '-cq', '18', '-preset', 'p4');
  } else if (encoder.includes('qsv')) {
    codecArgs.push('-global_quality', '18', '-preset', 'medium');
  } else if (encoder.includes('amf')) {
    codecArgs.push('-quality', 'balanced', '-rc', 'vbr_peak', '-qp_i', '18', '-qp_p', '20');
  }

  return { codecArgs, hwaccelArgs, label: enc.label, isGpu: true };
}

function invalidateCache() { _cachedResult = null; }

module.exports = { detectGpuEncoders, resolveEncoderArgs, invalidateCache, GPU_ENCODERS };
