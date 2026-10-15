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

