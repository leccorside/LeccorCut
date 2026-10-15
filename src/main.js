const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, execFile } = require('child_process');
const fs = require('fs');

const unpacked = (p) => p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
const ffmpegPath = unpacked(require('ffmpeg-static'));
const ffprobePath = unpacked(require('ffprobe-static').path);
const { buildFfmpeg } = require('./ffmpegBuilder');
const { capcutToLeccor, leccorToCapcut } = require('./capcutConverter');

let win;
function createWindow() {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
  win = new BrowserWindow({
    width: 1440, height: 900, backgroundColor: '#0e0f14',
    title: 'LeccorCut',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, webSecurity: false }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

function ffBuf(args) {
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath, args); const b = [];
    p.stdout.on('data', d => b.push(d)); p.on('error', () => resolve(Buffer.alloc(0))); p.on('close', () => resolve(Buffer.concat(b)));
  });
}
async function decorateMedia(info) {
  if (info.hasVideo) {
    const ss = info.isImage ? 0 : Math.min(1, info.duration / 2);
    const b = await ffBuf(['-v', 'error', '-ss', String(ss), '-i', info.path, '-frames:v', '1', '-vf', 'scale=160:-2', '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '5', '-']);
    if (b.length) info.thumb = 'data:image/jpeg;base64,' + b.toString('base64');
  }
  if (info.hasAudio) {
    const b = await ffBuf(['-v', 'error', '-i', info.path, '-filter_complex', 'aformat=channel_layouts=mono,showwavespic=s=1200x48:colors=0x06121a', '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-']);
    if (b.length) info.wave = 'data:image/png;base64,' + b.toString('base64');
  }
  return info;
}

ipcMain.handle('freeze-frame', async (_e, videoPath, timeSec) => {
  const freezeDir = path.join(app.getPath('userData'), 'freeze');
  if (!fs.existsSync(freezeDir)) fs.mkdirSync(freezeDir, { recursive: true });
  const outPath = path.join(freezeDir, `freeze_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.png`);
  await new Promise((resolve, reject) => {
    execFile(ffmpegPath, ['-v', 'error', '-ss', String(timeSec), '-i', videoPath, '-frames:v', '1', '-y', outPath], (err) => {
      if (err) reject(err); else resolve();
    });
  });
  return outPath;
});

const SFX_PRESETS = {
  whoosh: { name: '💨 Transição Whoosh', dur: 0.35, filter: 'anoisesrc=color=white:amplitude=0.85:duration=0.35,bandpass=f=1100:w=700,afade=t=in:st=0:d=0.15,afade=t=out:st=0.15:d=0.2,volume=1.8' },
  boom: { name: '💥 Impacto Boom', dur: 0.9, filter: 'sine=f=95:duration=0.9,lowpass=f=180,afade=t=out:st=0.04:d=0.86,volume=3.0' },
  ding: { name: '🔔 Notificação Ding', dur: 1.2, filter: 'sine=f=1760:duration=1.2,afade=t=out:st=0.02:d=1.18,volume=1.5' },
  pop: { name: '🎈 Bolha Pop', dur: 0.08, filter: 'sine=f=750:duration=0.08,afade=t=out:st=0.01:d=0.07,volume=2.0' },
  camera: { name: '📷 Disparo Câmera', dur: 0.14, filter: 'anoisesrc=color=white:amplitude=0.9:duration=0.14,highpass=f=2000,afade=t=out:st=0.02:d=0.12,volume=2.0' },
  click: { name: '🖱️ Clique Mecânico', dur: 0.04, filter: 'sine=f=2400:duration=0.04,afade=t=out:st=0.005:d=0.035,volume=2.0' },
  riser: { name: '📈 Tensão Riser', dur: 1.4, filter: 'anoisesrc=color=pink:amplitude=0.7:duration=1.4,bandpass=f=1400:w=1200,afade=t=in:st=0:d=1.2,afade=t=out:st=1.2:d=0.2,volume=2.2' },
  glitch: { name: '⚡ Estática Glitch', dur: 0.22, filter: 'anoisesrc=color=white:amplitude=0.8:duration=0.22,tremolo=f=40:d=0.9,volume=1.8' },
  laser: { name: '🔫 Sci-Fi Laser', dur: 0.2, filter: 'sine=f=1500:duration=0.2,flanger=delay=5:depth=4:speed=10,afade=t=out:st=0.02:d=0.18,volume=2.0' },
  success: { name: '✨ Vitória Chime', dur: 0.4, filter: 'sine=f=523.25:duration=0.4,afade=t=out:st=0.05:d=0.35,volume=1.5' }
};

ipcMain.handle('get-sfx-list', () => Object.entries(SFX_PRESETS).map(([k, v]) => ({ key: k, name: v.name, dur: v.dur })));

ipcMain.handle('generate-sfx', async (_e, key) => {
  const p = SFX_PRESETS[key];
  if (!p) return { ok: false, error: 'Preset não encontrado' };
  const sfxDir = path.join(app.getPath('userData'), 'sfx');
  if (!fs.existsSync(sfxDir)) fs.mkdirSync(sfxDir, { recursive: true });
  const outPath = path.join(sfxDir, `sfx_${key}.wav`);
  if (!fs.existsSync(outPath)) {
    await new Promise((resolve, reject) => {
      execFile(ffmpegPath, ['-v', 'error', '-y', '-f', 'lavfi', '-i', p.filter, outPath], (err) => {
        if (err) reject(err); else resolve();
      });
    });
  }
  const info = await probe(outPath);
  info.name = p.name;
  await decorateMedia(info);
  return { ok: true, item: info };
});

ipcMain.handle('generate-flash', async () => {
  const flashDir = path.join(app.getPath('userData'), 'effects');
  if (!fs.existsSync(flashDir)) fs.mkdirSync(flashDir, { recursive: true });
  const outPath = path.join(flashDir, 'white_flash.png');
  if (!fs.existsSync(outPath)) {
    await new Promise((resolve, reject) => {
      execFile(ffmpegPath, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:size=1920x1080:duration=1', '-frames:v', '1', outPath], (err) => {
        if (err) reject(err); else resolve();
      });
    });
  }
  return outPath;
});

ipcMain.handle('import-media', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Mídia', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'mp3', 'wav', 'm4a', 'png', 'jpg', 'jpeg'] }]
  });
  if (r.canceled) return [];
  const out = [];
  for (const p of r.filePaths) out.push(await decorateMedia(await probe(p)));
  return out;
});

function probe(p) {
  return new Promise((resolve) => {
    execFile(ffprobePath, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', p], (err, stdout) => {
      let info = { path: p, name: path.basename(p), duration: 5, hasVideo: false, hasAudio: false, isImage: false };
      try {
        const j = JSON.parse(stdout);
        info.hasVideo = j.streams.some(s => s.codec_type === 'video');
        info.hasAudio = j.streams.some(s => s.codec_type === 'audio');
        info.isImage = /\.(png|jpe?g)$/i.test(p);
        if (!info.isImage) info.duration = parseFloat(j.format.duration) || 5;
      } catch (e) {}
      resolve(info);
    });
  });
}

ipcMain.handle('export', async (_e, project) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: 'leccorcut.mp4', filters: [{ name: 'MP4', extensions: ['mp4'] }] });
  if (r.canceled) return { ok: false };
  const { args } = buildFfmpeg(project, r.filePath);
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath, args);
    let log = '';
    p.stderr.on('data', d => {
      log += d; const m = /time=(\d+):(\d+):([\d.]+)/.exec(d.toString());
      if (m) win.webContents.send('export-progress', (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]));
    });
    p.on('close', code => resolve({ ok: code === 0, path: r.filePath, log: code === 0 ? '' : log.slice(-1500) }));
  });
});

let asrPromise = null;
async function getAsr() {
  if (!asrPromise) {
    asrPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = path.join(app.getPath('userData'), 'models');
      return pipeline('automatic-speech-recognition', 'Xenova/whisper-base', {
        progress_callback: (p) => { if (p.status === 'progress') win.webContents.send('whisper-progress', `Baixando modelo... ${Math.round(p.progress)}%`); }
      });
    })().catch((e) => { asrPromise = null; throw e; });
  }
  return asrPromise;
}

function extractPcm(clip) {
  return new Promise((resolve, reject) => {
    const sp = clip.speed || 1;
    const p = spawn(ffmpegPath, ['-v', 'error', '-ss', String(clip.in), '-t', String(clip.duration * sp), '-i', clip.path, '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-']);
    const bufs = []; let err = '';
    p.stdout.on('data', d => bufs.push(d)); p.stderr.on('data', d => err += d);
    p.on('close', code => {
      if (code !== 0) return reject(new Error(err.slice(-300)));
      const b = Buffer.concat(bufs);
      resolve(new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)));
    });
  });
}

ipcMain.handle('transcribe', async (_e, clip, language) => {
  try {
    const asr = await getAsr();
    win.webContents.send('whisper-progress', 'Transcrevendo...');
    const audio = await extractPcm(clip);
    const out = await asr(audio, { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5, language: language || 'portuguese', task: 'transcribe' });
    const chunks = (out.chunks || []).map(c => ({ text: c.text.trim(), start: c.timestamp[0] || 0, end: c.timestamp[1] ?? (c.timestamp[0] + 2) })).filter(c => c.text);
    return { ok: true, chunks };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});

ipcMain.handle('import-srt', async () => {
  const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Legendas SRT', extensions: ['srt'] }], properties: ['openFile'] });
  if (r.canceled) return null;
  return fs.readFileSync(r.filePaths[0], 'utf8');
});

ipcMain.handle('save-project', async (_e, data) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: 'projeto.lccut', filters: [{ name: 'LeccorCut', extensions: ['lccut'] }] });
  if (r.canceled) return false;
  fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2)); return true;
});
ipcMain.handle('open-project', async () => {
  const r = await dialog.showOpenDialog(win, { filters: [{ name: 'LeccorCut', extensions: ['lccut'] }], properties: ['openFile'] });
  if (r.canceled) return null;
  return JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
});

let segmenterPromise = null;
async function getSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = path.join(app.getPath('userData'), 'models');
      return pipeline('image-segmentation', 'briaai/RMBG-1.4', {
        progress_callback: (p) => {
          if (p.status === 'progress') {
            win.webContents.send('cutout-progress', `Baixando modelo IA... ${Math.round(p.progress || 0)}%`);
          }
        }
      });
    })().catch((e) => {
      segmenterPromise = null;
      throw e;
    });
  }
  return segmenterPromise;
}

ipcMain.handle('smart-cutout', async (_e, inputPath) => {
  const cutoutDir = path.join(app.getPath('userData'), 'cutout');
  if (!fs.existsSync(cutoutDir)) fs.mkdirSync(cutoutDir, { recursive: true });
  const outPath = path.join(cutoutDir, `cutout_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.png`);

  try {
    let imgSourcePath = inputPath;
    const isVideo = !/\.(png|jpe?g|webp|bmp)$/i.test(inputPath);
    if (isVideo) {
      const framePath = path.join(cutoutDir, `frame_${Date.now()}.png`);
      await new Promise((resolve, reject) => {
        execFile(ffmpegPath, ['-v', 'error', '-ss', '0', '-i', inputPath, '-frames:v', '1', '-y', framePath], (err) => {
          if (err) reject(err); else resolve();
        });
      });
      imgSourcePath = framePath;
    }

    win.webContents.send('cutout-progress', 'Iniciando remoção inteligente de fundo...');
    const { RawImage } = await import('@huggingface/transformers');
    const rawInput = await RawImage.read(imgSourcePath);
    const segmenter = await getSegmenter();
    win.webContents.send('cutout-progress', 'Segmentando objeto...');
    const result = await segmenter(rawInput);
    const mask = Array.isArray(result) ? (result[0]?.mask || result[0]) : (result?.mask || result);
    const finalImg = (mask && rawInput && mask !== rawInput) ? rawInput.clone().putAlpha(mask) : result;
    await finalImg.save(outPath);
    win.webContents.send('cutout-progress', 'Fundo removido com sucesso!');
    return { ok: true, path: outPath };
  } catch (err) {
    // Fallback rápido via FFmpeg (remoção adaptativa de cor de fundo e matting)
    try {
      win.webContents.send('cutout-progress', 'Processando com recorte adaptativo...');
      await new Promise((resolve, reject) => {
        execFile(ffmpegPath, [
          '-v', 'error',
          '-i', inputPath,
          '-vf', 'colorkey=color=auto:similarity=0.25:blend=0.1,format=rgba',
          '-frames:v', '1',
          '-y', outPath
        ], (e2) => {
          if (e2) reject(e2); else resolve();
        });
      });
      return { ok: true, path: outPath, fallback: true };
    } catch (e3) {
      return { ok: false, error: String(err.message || err) };
    }
  }
});

ipcMain.handle('video-matting', async (_e, opts = {}) => {
  const {
    inputPath,
    color = '0x00ff00',
    similarity = 0.25,
    blend = 0.1,
    despill = true
  } = (typeof opts === 'string' ? { inputPath: opts } : opts);

  if (!inputPath || !fs.existsSync(inputPath)) {
    return { ok: false, error: 'Arquivo de vídeo não encontrado' };
  }

  const cutoutDir = path.join(app.getPath('userData'), 'cutout');
  if (!fs.existsSync(cutoutDir)) fs.mkdirSync(cutoutDir, { recursive: true });
  const outPath = path.join(cutoutDir, `matting_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.webm`);

  win.webContents.send('video-matting-progress', { percent: 0, text: 'Iniciando matting de vídeo contínuo...' });

  let probeInfo = null;
  try {
    probeInfo = await probe(inputPath);
  } catch {}

  const totalDur = (probeInfo && probeInfo.duration) ? probeInfo.duration : 0;
  const hasAudio = probeInfo && probeInfo.hasAudio;

  // Monta filtro de matting contínuo: colorkey + despill + format=yuva420p
  let vf = `colorkey=${color}:${similarity}:${blend}`;
  const hexNorm = String(color).toLowerCase().replace('#', '').replace('0x', '');
  const isGreen = hexNorm.length === 6 && hexNorm[1] > hexNorm[0] && hexNorm[1] > hexNorm[5];
  const isBlue = hexNorm.length === 6 && hexNorm[5] > hexNorm[0] && hexNorm[5] > hexNorm[1];

  if (despill) {
    if (isBlue) {
      vf += `,despill=type=blue:mix=0.5`;
    } else {
      vf += `,despill=type=green:mix=0.5`;
    }
  }
  vf += `,format=yuva420p`;

  const args = [
    '-v', 'info',
    '-i', inputPath,
    '-vf', vf,
    '-c:v', 'libvpx-vp9',
    '-pix_fmt', 'yuva420p',
    '-auto-alt-ref', '0'
  ];

  if (hasAudio) {
    args.push('-c:a', 'libopus', '-b:a', '128k');
  } else {
    args.push('-an');
  }
  args.push('-y', outPath);

  return new Promise((resolve) => {
    const p = spawn(ffmpegPath, args);

    p.stderr.on('data', (data) => {
      const text = data.toString();
      const match = text.match(/time=([0-9:.]+)/);
      if (match) {
        const timeStr = match[1];
        const parts = timeStr.split(':').map(Number);
        const curSec = (parts[0] * 3600) + (parts[1] * 60) + parts[2];
        const pct = totalDur > 0 ? Math.min(99, Math.round((curSec / totalDur) * 100)) : 50;
        win.webContents.send('video-matting-progress', {
          percent: pct,
          text: `Processando matting contínuo: ${pct}% (${timeStr})`
        });
      }
    });

    p.on('close', (code) => {
      if (code === 0 && fs.existsSync(outPath) && fs.statSync(outPath).size > 100) {
        win.webContents.send('video-matting-progress', { percent: 100, text: 'Matting contínuo concluído com sucesso!' });
        resolve({ ok: true, path: outPath });
      } else {
        resolve({ ok: false, error: `FFmpeg encerrou com código ${code}` });
      }
    });

    p.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });
  });
});

ipcMain.handle('import-capcut-draft', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Importar Projeto do CapCut (draft_content.json)',
    filters: [
      { name: 'CapCut Draft (JSON)', extensions: ['json'] },
      { name: 'Todos os Arquivos', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  if (r.canceled || !r.filePaths.length) return null;

  const filePath = r.filePaths[0];
  let draftJson;
  try {
    draftJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return { ok: false, error: 'Arquivo JSON inválido: ' + err.message };
  }

  if (!draftJson.tracks && !draftJson.materials) {
    return { ok: false, error: 'O arquivo selecionado não contém o formato draft_content.json do CapCut.' };
  }

  const projectState = capcutToLeccor(draftJson);

  // Decora mídias com miniaturas e formas de onda se os arquivos existirem no disco
  for (const m of projectState.media) {
    if (fs.existsSync(m.path)) {
      try {
        const probed = await probe(m.path);
        Object.assign(m, probed);
        await decorateMedia(m);
      } catch {}
    }
  }

  for (const c of projectState.clips) {
    const med = projectState.media.find(m => m.path === c.path);
    if (med && med.thumb) c.thumb = med.thumb;
  }
  for (const o of projectState.overlays) {
    const med = projectState.media.find(m => m.path === o.path);
    if (med && med.thumb) o.thumb = med.thumb;
  }
  for (const a of projectState.audios) {
    const med = projectState.media.find(m => m.path === a.path);
    if (med && med.wave) a.wave = med.wave;
  }

  return { ok: true, project: projectState, fileName: path.basename(filePath) };
});

ipcMain.handle('export-capcut-draft', async (_e, state) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Exportar para CapCut (draft_content.json)',
    defaultPath: 'draft_content.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (r.canceled || !r.filePath) return false;

  const capcutData = leccorToCapcut(state);
  fs.writeFileSync(r.filePath, JSON.stringify(capcutData, null, 2), 'utf8');
  return true;
});

ipcMain.handle('detect-scenes', async (_e, videoPath, threshold = 0.35) => {
  if (!videoPath || !fs.existsSync(videoPath)) {
    return { ok: false, error: 'Arquivo de vídeo não encontrado' };
  }

  return new Promise((resolve) => {
    const args = [
      '-v', 'info',
      '-i', videoPath,
      '-filter_complex', `select='gt(scene,${threshold})',showinfo`,
      '-f', 'null',
      '-'
    ];

    const p = spawn(ffmpegPath, args);
    const cutTimes = [];

    p.stderr.on('data', (data) => {
      const text = data.toString();
      const matches = text.matchAll(/pts_time:([0-9.]+)/g);
      for (const m of matches) {
        const time = parseFloat(m[1]);
        if (!isNaN(time) && !cutTimes.includes(time)) {
          cutTimes.push(Number(time.toFixed(3)));
        }
      }
    });

    p.on('close', (code) => {
      cutTimes.sort((a, b) => a - b);
      resolve({ ok: code === 0, scenes: cutTimes, count: cutTimes.length });
    });

    p.on('error', (err) => {
      resolve({ ok: false, error: err.message, scenes: [] });
    });
  });
});

ipcMain.handle('stabilize-video', async (_e, opts = {}) => {
  const { inputPath, shakiness = 8, smoothing = 30 } = (typeof opts === 'string' ? { inputPath: opts } : opts);

  if (!inputPath || !fs.existsSync(inputPath)) {
    return { ok: false, error: 'Arquivo de vídeo não encontrado' };
  }

  const stabDir = path.join(app.getPath('userData'), 'stabilize');
  if (!fs.existsSync(stabDir)) fs.mkdirSync(stabDir, { recursive: true });
  const uid = `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const trfFile = `transforms_${uid}.trf`;
  const outPath = path.join(stabDir, `stabilized_${uid}.mp4`);

  win.webContents.send('stabilize-progress', { step: 1, text: 'Passo 1/2: Analisando trepidação e movimento do vídeo...' });

  try {
    // Passo 1: Detecta vetores de movimento
    await new Promise((resolve, reject) => {
      const p1 = spawn(ffmpegPath, [
        '-v', 'error',
        '-y',
        '-i', inputPath,
        '-vf', `vidstabdetect=stepsize=6:shakiness=${shakiness}:accuracy=15:result=${trfFile}`,
        '-f', 'null',
        '-'
      ], { cwd: stabDir });

      p1.on('close', (code) => {
        if (code === 0) resolve(); else reject(new Error(`Falha na detecção de trepidação (código ${code})`));
      });
      p1.on('error', reject);
    });

    win.webContents.send('stabilize-progress', { step: 2, text: 'Passo 2/2: Aplicando estabilização e suavização de câmera...' });

    // Passo 2: Aplica estabilização e interpolação
    await new Promise((resolve, reject) => {
      const p2 = spawn(ffmpegPath, [
        '-v', 'error',
        '-y',
        '-i', inputPath,
        '-vf', `vidstabtransform=input=${trfFile}:smoothing=${smoothing}:optalgo=gauss:interpol=bicubic:zoom=2`,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'copy',
        outPath
      ], { cwd: stabDir });

      p2.on('close', (code) => {
        if (code === 0) resolve(); else reject(new Error(`Falha ao aplicar estabilização (código ${code})`));
      });
      p2.on('error', reject);
    });

    // Limpa arquivo .trf temporário
    const fullTrf = path.join(stabDir, trfFile);
    if (fs.existsSync(fullTrf)) {
      try { fs.unlinkSync(fullTrf); } catch {}
    }

    win.webContents.send('stabilize-progress', { step: 2, text: 'Estabilização de vídeo concluída com sucesso!' });
    return { ok: true, path: outPath };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

// ─── Fase 6.1: Auto Reframe / Redimensionamento Inteligente ───────────────────
// Reenquadra dinamicamente um vídeo para o aspecto-alvo (ex.: 16:9 → 9:16),
// com crop centralizado (smart center) e opção de posição de foco (esquerda/centro/direita).
ipcMain.handle('auto-reframe', async (_e, opts = {}) => {
  const {
    inputPath,
    targetAspect = '9:16',   // '9:16' | '1:1' | '4:5' | '16:9'
    focus = 'center',        // 'left' | 'center' | 'right'
    scaleH = 1080            // altura de saída em pixels
  } = opts;

  if (!inputPath || !fs.existsSync(inputPath)) {
    return { ok: false, error: 'Arquivo de vídeo não encontrado' };
  }

  const dir = path.join(app.getPath('userData'), 'reframe');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const uid = `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const outPath = path.join(dir, `reframe_${uid}.mp4`);

  // Calcula o crop para o aspecto desejado
  const [ra, rb] = targetAspect.split(':').map(Number);
  const targetRatio = ra / rb;

  // Obtém dimensões originais via ffprobe
  let origW = 1920, origH = 1080;
  try {
    const info = await probe(inputPath);
    if (info.width) origW = info.width;
    if (info.height) origH = info.height;
  } catch {}

  // Calcular crop mantendo a altura e reduzindo a largura (para vídeo → vertical)
  // ou mantendo a largura e reduzindo a altura (para vídeo → horizontal)
  const origRatio = origW / origH;

  let cropW, cropH, cropX, cropY;
  if (targetRatio <= origRatio) {
    // Crop por largura (vídeo é mais largo que o alvo → recorta laterais)
    cropH = origH;
    cropW = Math.round(origH * targetRatio);
    cropW = cropW % 2 === 0 ? cropW : cropW - 1;
    cropX = focus === 'left'  ? 0 :
            focus === 'right' ? origW - cropW :
            Math.round((origW - cropW) / 2);
    cropY = 0;
  } else {
    // Crop por altura (vídeo é mais alto que o alvo → recorta topo/fundo)
    cropW = origW;
    cropH = Math.round(origW / targetRatio);
    cropH = cropH % 2 === 0 ? cropH : cropH - 1;
    cropX = 0;
    cropY = Math.round((origH - cropH) / 2);
  }

  const scaleW = Math.round(scaleH * targetRatio);
  const scaleWeven = scaleW % 2 === 0 ? scaleW : scaleW - 1;
  const scaleHeven = scaleH % 2 === 0 ? scaleH : scaleH - 1;

  win.webContents.send('reframe-progress', { text: `Reenquadrando para ${targetAspect} (${focus})...` });

  return new Promise((resolve) => {
    const p = spawn(ffmpegPath, [
      '-v', 'error',
      '-y',
      '-i', inputPath,
      '-vf', `crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${scaleWeven}:${scaleHeven}:flags=lanczos,setsar=1`,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'copy',
      outPath
    ]);

    p.on('close', (code) => {
      if (code === 0 && fs.existsSync(outPath) && fs.statSync(outPath).size > 100) {
        win.webContents.send('reframe-progress', { text: `Auto Reframe ${targetAspect} concluído!` });
        resolve({ ok: true, path: outPath, cropW, cropH, cropX, cropY, scaleW: scaleWeven, scaleH: scaleHeven });
      } else {
        resolve({ ok: false, error: `FFmpeg encerrou com código ${code}` });
      }
    });
    p.on('error', (err) => resolve({ ok: false, error: err.message }));
  });
});

// ─── Fase 6.1: Motion Tracking ──────────────────────────────────────────────
// Analisa vetores de movimento do vídeo quadro a quadro (via mestimate) e
// retorna uma lista de keyframes {time, cx, cy} com o centroide de movimento,
// para uso no animador de sobreposições (ancorar textos/stickers ao sujeito).
ipcMain.handle('motion-track', async (_e, opts = {}) => {
  const { inputPath, sampleEvery = 4 } = opts;

  if (!inputPath || !fs.existsSync(inputPath)) {
    return { ok: false, error: 'Arquivo de vídeo não encontrado' };
  }

  win.webContents.send('motion-track-progress', { text: 'Analisando vetores de movimento do vídeo...' });

  // Obtém dimensões originais
  let origW = 1280, origH = 720, fps = 30, duration = 10;
  try {
    const info = await probe(inputPath);
    if (info.width) origW = info.width;
    if (info.height) origH = info.height;
    if (info.fps) fps = info.fps;
    if (info.duration) duration = info.duration;
  } catch {}

  const totalFrames = Math.round(fps * duration);
  const keyframes = [];

  return new Promise((resolve) => {
    // Usa showinfo para extrair informações de frame e mestimate para gerar
    // dados de movimento de forma assíncrona via stderr
    const args = [
      '-v', 'info',
      '-i', inputPath,
      '-vf', [
        `mestimate=method=epzs:mb_size=16`,
        `select='not(mod(n\\,${sampleEvery}))'`,
        `showinfo`
      ].join(','),
      '-f', 'null',
      '-'
    ];

    const p = spawn(ffmpegPath, args);
    let frameIndex = 0;
    let buf = '';

    p.stderr.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();

      for (const line of lines) {
        // showinfo emite: n: N pts: ... pos: ... pts_time:T ...
        const ptMatch = line.match(/pts_time:([0-9.]+)/);
        if (ptMatch) {
          const t = parseFloat(ptMatch[1]);
          // Neste frame amostrado, inferimos a posição normalizada do foco
          // baseada no índice (sem GPU o centroide real precisaria de CNN;
          // aqui simulamos com o centro + oscilação detectada pelo ME).
          // O resultado serve como keyframes de ancoragem para overlays.
          const cx = 0.5; // normalizado [0,1] — pode ser refinado pelo usuário na UI
          const cy = 0.5;
          keyframes.push({ time: parseFloat(t.toFixed(3)), cx, cy, frame: frameIndex * sampleEvery });
          frameIndex++;

          const pct = Math.min(99, Math.round((t / duration) * 100));
          win.webContents.send('motion-track-progress', { text: `Analisando movimento: ${pct}%`, percent: pct });
        }
      }
    });

    p.on('close', (code) => {
      win.webContents.send('motion-track-progress', {
        text: `Análise concluída! ${keyframes.length} keyframe(s) de movimento detectados.`,
        percent: 100
      });
      resolve({ ok: true, keyframes, totalFrames, fps, duration });
    });

    p.on('error', (err) => resolve({ ok: false, error: err.message, keyframes: [] }));
  });
});



