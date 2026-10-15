// Teste automatizado do pipeline de Efeitos Sonoros Nativos (SFX) e Flash Batida
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ffmpeg = require('ffmpeg-static');
const { buildFfmpeg } = require('../src/ffmpegBuilder');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lccut-sfx-'));
const bgVideo = path.join(dir, 'bg.mp4');
const sfxWhoosh = path.join(dir, 'whoosh.wav');
const sfxBoom = path.join(dir, 'boom.wav');
const flashImg = path.join(dir, 'white_flash.png');
const outFinal = path.join(dir, 'out-sfx-flash.mp4');

// 1. Gera vídeo base de 3s
execFileSync(ffmpeg, [
  '-v', 'error', '-y',
  '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=3',
  '-f', 'lavfi', '-i', 'sine=frequency=330:duration=3',
  '-shortest', '-pix_fmt', 'yuv420p',
  bgVideo
]);

// 2. Sintetiza efeito sonoro Whoosh nativo via FFmpeg
execFileSync(ffmpeg, [
  '-v', 'error', '-y',
  '-f', 'lavfi',
  '-i', 'anoisesrc=d=0.35:c=white:r=44100,bandpass=f=900:width_type=h:w=700,afade=t=in:ss=0:d=0.15,afade=t=out:st=0.15:d=0.20,volume=3.0',
  '-t', '0.35',
  '-c:a', 'pcm_s16le',
  sfxWhoosh
]);

// 3. Sintetiza efeito sonoro Boom Sub nativo via FFmpeg
execFileSync(ffmpeg, [
  '-v', 'error', '-y',
  '-f', 'lavfi',
  '-i', 'sine=f=80:d=1.2:r=44100,afade=t=in:ss=0:d=0.01,afade=t=out:st=0.05:d=1.15,volume=3.5',
  '-t', '1.2',
  '-c:a', 'pcm_s16le',
  sfxBoom
]);

// 4. Gera imagem de Flash branco puro
execFileSync(ffmpeg, [
  '-v', 'error', '-y',
  '-f', 'lavfi',
  '-i', 'color=c=white:s=640x360',
  '-frames:v', '1',
  flashImg
]);

const statWhoosh = fs.statSync(sfxWhoosh);
const statBoom = fs.statSync(sfxBoom);
const statFlash = fs.statSync(flashImg);

if (statWhoosh.size < 100 || statBoom.size < 100 || statFlash.size < 50) {
  console.error('FALHA: Efeitos sintetizados vazios ou corrompidos');
  process.exit(1);
}
console.log(`OK: SFX Whoosh (${statWhoosh.size}b) e Boom (${statBoom.size}b) gerados`);
console.log(`OK: Flash visual gerado (${statFlash.size}b)`);

// 5. Constrói e renderiza projeto completo com SFX e Flash
const project = {
  clips: [{ id: 1, path: bgVideo, name: 'bg.mp4', duration: 3, in: 0, hasVideo: true, hasAudio: true, isImage: false, filters: {}, speed: 1, volume: 0.6 }],
  audios: [
    { id: 2, path: sfxWhoosh, name: 'Whoosh', start: 0.5, in: 0, duration: 0.35, max: 0.35, volume: 1.0 },
    { id: 3, path: sfxBoom, name: 'Boom Sub', start: 1.5, in: 0, duration: 1.2, max: 1.2, volume: 1.0 }
  ],
  overlays: [
    { id: 4, path: flashImg, name: 'Flash Batida', isImage: true, start: 1.5, in: 0, duration: 0.25, max: 999, scale: 100, x: 0.5, y: 0.5, opacity: 1, anim: 'fade' }
  ],
  texts: [],
  settings: { height: 360, fps: 25, crf: 23, aspect: '16:9' }
};

const { args } = buildFfmpeg(project, outFinal);
execFileSync(ffmpeg, ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
const statOut = fs.statSync(outFinal);

if (statOut.size < 1000) {
  console.error('FALHA: Arquivo final menor que o esperado');
  process.exit(1);
}
console.log(`OK: Projeto com SFX e Flash Batida exportado com sucesso (${statOut.size} bytes) em ${outFinal}`);
