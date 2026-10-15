const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, execFile } = require('child_process');
const fs = require('fs');

const unpacked = (p) => p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
const ffmpegPath = unpacked(require('ffmpeg-static'));
const ffprobePath = unpacked(require('ffprobe-static').path);
const { buildFfmpeg } = require('./ffmpegBuilder');

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, backgroundColor: '#0e0f14',
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

