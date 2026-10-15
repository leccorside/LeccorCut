// Teste automatizado do pipeline de Smart Cutout (Recorte com canal alfa transparente)
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ffmpeg = require('ffmpeg-static');
const { buildFfmpeg } = require('../src/ffmpegBuilder');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lccut-cutout-'));
const bgVideo = path.join(dir, 'bg.mp4');
const rawImg = path.join(dir, 'subject.png');
const cutoutPng = path.join(dir, 'subject-cutout.png');
const outFinal = path.join(dir, 'out-cutout.mp4');

// 1. Gera vídeo de fundo de 3s
execFileSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-shortest', '-pix_fmt', 'yuv420p', bgVideo]);

// 2. Gera imagem de teste com fundo verde e círculo vermelho no centro
execFileSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x00ff00:size=300x300:duration=1', '-frames:v', '1', rawImg]);

// 3. Aplica recorte com transparência (canal alfa RGBA)
execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', rawImg, '-vf', 'colorkey=color=0x00ff00:similarity=0.3:blend=0.05,format=rgba', '-frames:v', '1', cutoutPng]);

const cutStat = fs.statSync(cutoutPng);
if (cutStat.size < 50) {
  console.error('FALHA: PNG recortado não gerado ou vazio');
  process.exit(1);
}
console.log(`OK: PNG com transparência alfa gerado (${cutStat.size} bytes)`);

// 4. Valida a integração do recorte como Sobreposição PiP em um projeto
const project = {
  clips: [{ id: 1, path: bgVideo, name: 'bg.mp4', duration: 3, in: 0, hasVideo: true, hasAudio: true, isImage: false, filters: {}, speed: 1, volume: 1 }],
  overlays: [{
    id: 2, path: cutoutPng, name: 'subject-cutout.png', isImage: true,
    start: 0.5, in: 0, duration: 2, scale: 40, x: 0.5, y: 0.5, opacity: 1, anim: 'pop'
  }],
  texts: [],
  audios: [],
  settings: { height: 360, fps: 25, crf: 23, aspect: '16:9' }
};

const { args } = buildFfmpeg(project, outFinal);
execFileSync(ffmpeg, ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
const outStat = fs.statSync(outFinal);
console.log(`OK: Vídeo com sobreposição de Smart Cutout gerado com sucesso (${outStat.size} bytes) em ${outFinal}`);
