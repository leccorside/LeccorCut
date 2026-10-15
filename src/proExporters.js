'use strict';
/**
 * proExporters.js — Fase 14: Interoperabilidade Pro e Exportação para Outras NLEs
 *
 * Módulo responsável por:
 * 1. Conversão e cálculo de Timecode SMPTE (HH:MM:SS:FF)
 * 2. Exportação de Edit Decision List (EDL - CMX 3600) para DaVinci Resolve / Premiere
 * 3. Exportação de Final Cut Pro XML (FCPXML v1.9/v1.10) para Final Cut Pro e DaVinci Resolve
 * 4. Empacotador de Projeto (Project Bundler / Coleta de Arquivos) com caminhos relativos
 */

const fs = require('fs');
const path = require('path');

// ── 1. Utilitários de Timecode SMPTE ──────────────────────────────────────────

/**
 * Converte segundos para string Timecode SMPTE (HH:MM:SS:FF).
 * @param {number} seconds - Duração ou instante em segundos
 * @param {number} [fps=30] - Taxa de quadros (ex: 24, 25, 30, 60)
 * @returns {string} - "01:00:15:12"
 */
function secondsToTimecode(seconds, fps = 30) {
  const safeFps = Math.max(1, Math.round(Number(fps) || 30));
  const safeSec = Math.max(0, Number(seconds) || 0);

  const totalFrames = Math.round(safeSec * safeFps);
  const frames = totalFrames % safeFps;
  const totalSeconds = Math.floor(totalFrames / safeFps);

  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);

  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(frames)}`;
}

/**
 * Converte timecode SMPTE para segundos.
 * @param {string} tc - "HH:MM:SS:FF"
 * @param {number} [fps=30]
 * @returns {number}
 */
function timecodeToSeconds(tc, fps = 30) {
  if (!tc || typeof tc !== 'string') return 0;
  const parts = tc.split(':').map(Number);
  if (parts.length < 4) return 0;
  const [h, m, s, f] = parts;
  const safeFps = Math.max(1, Math.round(Number(fps) || 30));
  return h * 3600 + m * 60 + s + (f / safeFps);
}

// ── 2. Exportador de Edit Decision List (EDL - CMX 3600) ──────────────────────

/**
 * Gera conteúdo de Edit Decision List (EDL CMX 3600 padrão da indústria).
 * @param {Object} project - Estado do projeto LeccorCut
 * @param {Object} [options]
 * @param {string} [options.title='LECCORCUT_PROJECT']
 * @param {string} [options.startTc='01:00:00:00']
 * @returns {string} - Conteúdo em texto puro do arquivo .edl
 */
function exportEdl(project = {}, options = {}) {
  const fps = Number(project.settings?.fps) || 30;
  const title = (options.title || project.title || 'LECCORCUT_PROJECT')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '_')
    .slice(0, 32);

  const lines = [
    `TITLE: ${title}`,
    `FCM: NON-DROP FRAME`,
    ''
  ];

  let recordTime = timecodeToSeconds(options.startTc || '01:00:00:00', fps);
  let eventNumber = 1;

  const clips = Array.isArray(project.clips) ? project.clips : [];
  const audios = Array.isArray(project.audios) ? project.audios : [];

  // 1. Trilhas de Vídeo Principais
  clips.forEach((clip, index) => {
    const srcIn = clip.in || 0;
    const duration = clip.duration || 5;
    const srcOut = srcIn + duration;

    const recIn = recordTime;
    const recOut = recIn + duration;

    const numStr = String(eventNumber++).padStart(3, '0');
    const reel = `AX`.padEnd(8, ' ');
    const track = (clip.hasAudio ? 'V/A  ' : 'V    ');
    const trans = 'C        '; // Cut direto

    const tcSrcIn = secondsToTimecode(srcIn, fps);
    const tcSrcOut = secondsToTimecode(srcOut, fps);
    const tcRecIn = secondsToTimecode(recIn, fps);
    const tcRecOut = secondsToTimecode(recOut, fps);

    lines.push(`${numStr}  ${reel} ${track} ${trans} ${tcSrcIn} ${tcSrcOut} ${tcRecIn} ${tcRecOut}`);
    if (clip.name) {
      lines.push(`* FROM CLIP NAME: ${clip.name}`);
    }
    if (clip.path) {
      lines.push(`* SOURCE FILE: ${clip.path.replace(/\\/g, '/')}`);
    }
    lines.push('');

    recordTime = recOut;
  });

  // 2. Trilhas de Áudio Secundário Independentes
  audios.forEach((audio) => {
    const srcIn = audio.in || 0;
    const duration = audio.duration || 5;
    const srcOut = srcIn + duration;

    const recIn = timecodeToSeconds(options.startTc || '01:00:00:00', fps) + (audio.start || 0);
    const recOut = recIn + duration;

    const numStr = String(eventNumber++).padStart(3, '0');
    const reel = `AX`.padEnd(8, ' ');
    const track = 'A2   ';
    const trans = 'C        ';

    const tcSrcIn = secondsToTimecode(srcIn, fps);
    const tcSrcOut = secondsToTimecode(srcOut, fps);
    const tcRecIn = secondsToTimecode(recIn, fps);
    const tcRecOut = secondsToTimecode(recOut, fps);

    lines.push(`${numStr}  ${reel} ${track} ${trans} ${tcSrcIn} ${tcSrcOut} ${tcRecIn} ${tcRecOut}`);
    if (audio.name) {
      lines.push(`* FROM CLIP NAME: ${audio.name}`);
    }
    if (audio.path) {
      lines.push(`* SOURCE FILE: ${audio.path.replace(/\\/g, '/')}`);
    }
    lines.push('');
  });

  return lines.join('\r\n');
}

// ── 3. Exportador de Final Cut Pro XML (FCPXML v1.9 / v1.10) ──────────────────

/**
 * Converte segundos em fração temporal padrão FCPXML (ex: "100/30s").
 */
function toFcpxmlTime(seconds, fps = 30) {
  const safeFps = Math.max(1, Math.round(Number(fps) || 30));
  const frames = Math.round((Number(seconds) || 0) * safeFps);
  return `${frames}/${safeFps}s`;
}

/**
 * Escapa caracteres especiais para inserção em XML.
 */
function escapeXml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Exporta timeline do LeccorCut para a especificação FCPXML v1.9 da Apple.
 * Compatível com DaVinci Resolve, Final Cut Pro e Adobe Premiere Pro.
 * @param {Object} project
 * @returns {string} - Conteúdo XML
 */
function exportFcpxml(project = {}) {
  const S = project.settings || {};
  const fps = Number(S.fps) || 30;
  const [aspectW, aspectH] = (S.aspect || '16:9').split(':').map(Number);
  const ratio = (aspectW && aspectH) ? aspectW / aspectH : 16 / 9;
  const resH = Number(S.height || S.res) || 1080;
  const resW = Math.round(resH * ratio / 2) * 2;

  const clips = Array.isArray(project.clips) ? project.clips : [];
  const audios = Array.isArray(project.audios) ? project.audios : [];
  const overlays = Array.isArray(project.overlays) ? project.overlays : [];
  const texts = Array.isArray(project.texts) ? project.texts : [];

  // Mapeamento e deduplicação de mídias únicas para resources
  const assetMap = new Map();
  let assetIdCounter = 1;

  function registerAsset(filePath, name, hasVideo, hasAudio, duration = 10) {
    if (!filePath) return null;
    const cleanPath = filePath.replace(/\\/g, '/');
    if (assetMap.has(cleanPath)) return assetMap.get(cleanPath);

    const id = `r_asset_${assetIdCounter++}`;
    const fileUri = cleanPath.startsWith('/') ? `file://${cleanPath}` : `file:///${cleanPath}`;
    const assetObj = {
      id,
      name: name || path.basename(cleanPath),
      src: fileUri,
      hasVideo: !!hasVideo,
      hasAudio: !!hasAudio,
      duration
    };
    assetMap.set(cleanPath, assetObj);
    return assetObj;
  }

  clips.forEach(c => registerAsset(c.path, c.name, true, c.hasAudio !== false, c.duration || 10));
  overlays.forEach(o => registerAsset(o.path, o.name, true, false, o.duration || 5));
  audios.forEach(a => registerAsset(a.path, a.name, false, true, a.duration || 10));

  // Cálculo da duração total do projeto
  let totalDurSec = 0;
  clips.forEach(c => { totalDurSec += (c.duration || 0); });
  audios.forEach(a => { totalDurSec = Math.max(totalDurSec, (a.start || 0) + (a.duration || 0)); });
  overlays.forEach(o => { totalDurSec = Math.max(totalDurSec, (o.start || 0) + (o.duration || 0)); });
  texts.forEach(t => { totalDurSec = Math.max(totalDurSec, (t.start || 0) + (t.duration || 0)); });
  if (totalDurSec <= 0) totalDurSec = 10;

  const projName = escapeXml(project.title || 'LeccorCut_Timeline');
  const formatId = 'r_format_main';
  const frameDur = `1/${fps}s`;

  // Construção do XML
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<!DOCTYPE fcpxml>\n`;
  xml += `<fcpxml version="1.9">\n`;
  xml += `  <resources>\n`;
  xml += `    <format id="${formatId}" name="FFVideoFormat${resH}p${fps}" frameDuration="${frameDur}" width="${resW}" height="${resH}" />\n`;

  for (const asset of assetMap.values()) {
    const durStr = toFcpxmlTime(asset.duration, fps);
    xml += `    <asset id="${asset.id}" name="${escapeXml(asset.name)}" src="${escapeXml(asset.src)}" start="0s" duration="${durStr}" hasVideo="${asset.hasVideo ? 1 : 0}" hasAudio="${asset.hasAudio ? 1 : 0}" format="${formatId}" />\n`;
  }
  xml += `  </resources>\n`;

  xml += `  <library>\n`;
  xml += `    <event name="LeccorCut">\n`;
  xml += `      <project name="${projName}">\n`;
  xml += `        <sequence format="${formatId}" duration="${toFcpxmlTime(totalDurSec, fps)}" tcStart="0s">\n`;
  xml += `          <spine>\n`;

  // Clipes da Trilha de Vídeo no Spine Principal
  let currentOffsetSec = 0;
  clips.forEach((clip, i) => {
    const asset = assetMap.get(clip.path?.replace(/\\/g, '/'));
    const durSec = clip.duration || 5;
    const startSec = clip.in || 0;
    const offsetSec = currentOffsetSec;
    const refAttr = asset ? `ref="${asset.id}"` : '';

    xml += `            <asset-clip name="${escapeXml(clip.name || `Clip_${i + 1}`)}" ${refAttr} offset="${toFcpxmlTime(offsetSec, fps)}" start="${toFcpxmlTime(startSec, fps)}" duration="${toFcpxmlTime(durSec, fps)}" format="${formatId}">\n`;

    // Injeção de Sobreposições / PiP ancoradas no tempo relativo correspondente
    overlays.filter(o => o.start >= offsetSec && o.start < offsetSec + durSec).forEach(o => {
      const oAsset = assetMap.get(o.path?.replace(/\\/g, '/'));
      if (oAsset) {
        const oOffsetInClip = o.start - offsetSec;
        xml += `              <asset-clip lane="1" name="${escapeXml(o.name || 'PiP')}" ref="${oAsset.id}" offset="${toFcpxmlTime(oOffsetInClip, fps)}" start="0s" duration="${toFcpxmlTime(o.duration || 3, fps)}" role="video" />\n`;
      }
    });

    // Injeção de Textos e Legendas ancorados
    texts.filter(t => t.start >= offsetSec && t.start < offsetSec + durSec).forEach(t => {
      const tOffsetInClip = t.start - offsetSec;
      xml += `              <title lane="2" name="${escapeXml(t.text || 'Texto')}" offset="${toFcpxmlTime(tOffsetInClip, fps)}" duration="${toFcpxmlTime(t.duration || 3, fps)}" role="titles">\n`;
      xml += `                <text><text-style font="${escapeXml(t.font || 'Arial')}" fontSize="${t.size || 48}" fontColor="${t.color || '#ffffff'}">${escapeXml(t.text)}</text-style></text>\n`;
      xml += `              </title>\n`;
    });

    xml += `            </asset-clip>\n`;
    currentOffsetSec += durSec;
  });

  // Áudio Secundário no Lane -1
  audios.forEach((audio) => {
    const aAsset = assetMap.get(audio.path?.replace(/\\/g, '/'));
    if (aAsset) {
      const aStart = audio.in || 0;
      const aDur = audio.duration || 5;
      const aOffset = audio.start || 0;
      xml += `            <asset-clip lane="-1" name="${escapeXml(audio.name || 'Audio')}" ref="${aAsset.id}" offset="${toFcpxmlTime(aOffset, fps)}" start="${toFcpxmlTime(aStart, fps)}" duration="${toFcpxmlTime(aDur, fps)}" role="audio" />\n`;
    }
  });

  xml += `          </spine>\n`;
  xml += `        </sequence>\n`;
  xml += `      </project>\n`;
  xml += `    </event>\n`;
  xml += `  </library>\n`;
  xml += `</fcpxml>\n`;

  return xml;
}

// ── 4. Empacotador de Projeto (Project Bundler / Coleta de Arquivos) ───────────

/**
 * Cria um nome de arquivo seguro e único para evitar colisões no pacote.
 */
function getSafeFileName(originalPath, usedNames) {
  const base = path.basename(originalPath);
  const ext = path.extname(base);
  const nameWithoutExt = path.basename(base, ext).replace(/[^a-zA-Z0-9_\-\.]/g, '_');

  let candidate = `${nameWithoutExt}${ext}`;
  let counter = 1;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${nameWithoutExt}_${counter++}${ext}`;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Empacota um projeto LeccorCut coletando todas as mídias dependentes
 * e salvando o arquivo do projeto com caminhos relativos portáteis.
 * @param {Object} projectData - Dados completos do projeto (.lccut)
 * @param {string} targetDir - Diretório onde o pacote será criado
 * @returns {Promise<{ ok: boolean, bundleDir: string, projectFile: string, totalFiles: number, totalBytes: number }>}
 */
async function bundleProject(projectData = {}, targetDir) {
  if (!targetDir) {
    throw new Error('Diretório de destino não especificado para o pacote do projeto.');
  }

  // 1. Cria diretórios do pacote
  const mediaDir = path.join(targetDir, 'media');
  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
  }

  // Clona o projeto para não afetar o estado em memória
  const cloned = JSON.parse(JSON.stringify(projectData));

  // Mapa de caminho original para novo caminho relativo no bundle
  const pathMapping = new Map();
  const usedNames = new Set();

  let totalBytes = 0;
  let copiedCount = 0;

  // 2. Coletar todas as referências de arquivos
  const filePathsToCollect = new Set();

  const scanItems = (list = []) => {
    list.forEach(item => {
      if (item && item.path && typeof item.path === 'string') {
        filePathsToCollect.add(item.path);
      }
    });
  };

  scanItems(cloned.media);
  scanItems(cloned.clips);
  scanItems(cloned.overlays);
  scanItems(cloned.audios);

  // 3. Copiar mídias para a pasta media/
  for (const srcPath of filePathsToCollect) {
    if (fs.existsSync(srcPath)) {
      const safeName = getSafeFileName(srcPath, usedNames);
      const destPath = path.join(mediaDir, safeName);

      fs.copyFileSync(srcPath, destPath);
      const stats = fs.statSync(destPath);
      totalBytes += stats.size;
      copiedCount++;

      // Caminho relativo padrão portátil
      pathMapping.set(srcPath, `./media/${safeName}`);
    }
  }

  // 4. Reescrever referências no projeto clonado
  const updateItemPaths = (list = []) => {
    list.forEach(item => {
      if (item && item.path && pathMapping.has(item.path)) {
        item.originalPath = item.path; // preserva original para auditoria
        item.path = pathMapping.get(item.path);
      }
    });
  };

  updateItemPaths(cloned.media);
  updateItemPaths(cloned.clips);
  updateItemPaths(cloned.overlays);
  updateItemPaths(cloned.audios);

  cloned.isBundled = true;
  cloned.bundleDate = new Date().toISOString();

  // 5. Gravar arquivo do projeto no pacote
  const projectFile = path.join(targetDir, 'project.lccut');
  fs.writeFileSync(projectFile, JSON.stringify(cloned, null, 2), 'utf-8');

  return {
    ok: true,
    bundleDir: targetDir,
    projectFile,
    totalFiles: copiedCount,
    totalBytes
  };
}

module.exports = {
  secondsToTimecode,
  timecodeToSeconds,
  exportEdl,
  exportFcpxml,
  bundleProject
};
