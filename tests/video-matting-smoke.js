// Teste automatizado do pipeline de Matting de Vídeo Contínuo (Canal alfa temporal yuva420p / VP9)
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ffmpeg = require('ffmpeg-static');
const { buildFfmpeg } = require('../src/ffmpegBuilder');

console.log('--- Iniciando Teste de Matting de Vídeo Contínuo (Fase 5.2) ---');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lccut-matting-'));
const bgVideo = path.join(dir, 'bg.mp4');
const greenVideo = path.join(dir, 'green_subject.mp4');
const transparentWebm = path.join(dir, 'transparent_subject.webm');
const outFinal = path.join(dir, 'out-matting-composed.mp4');

// 1. Gera vídeo de fundo de 3 segundos
execFileSync(ffmpeg, [
  '-v', 'error', '-y',
  '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=3',
  '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
  '-shortest', '-pix_fmt', 'yuv420p',
  bgVideo
]);
console.log('1. Vídeo de fundo gerado com sucesso.');

// 2. Gera vídeo de teste com fundo verde de 2 segundos e áudio senoidal
execFileSync(ffmpeg, [
  '-v', 'error', '-y',
  '-f', 'lavfi', '-i', 'color=c=0x00ff00:size=320x240:duration=2',
  '-f', 'lavfi', '-i', 'sine=frequency=880:duration=2',
  '-shortest', '-pix_fmt', 'yuv420p',
  greenVideo
]);
console.log('2. Vídeo fonte com fundo verde gerado.');

// 3. Executa o pipeline de matting contínuo gerando WebM VP9 com canal alfa (yuva420p) e despill
execFileSync(ffmpeg, [
  '-v', 'error', '-y',
  '-i', greenVideo,
  '-vf', 'colorkey=0x00ff00:0.25:0.1,despill=type=green:mix=0.5,format=yuva420p',
  '-c:v', 'libvpx-vp9',
  '-pix_fmt', 'yuva420p',
  '-auto-alt-ref', '0',
  '-c:a', 'libopus',
  transparentWebm
]);

const webmStat = fs.statSync(transparentWebm);
if (webmStat.size < 100) {
  console.error('FALHA: Vídeo transparente contínuo WebM não gerado ou vazio');
  process.exit(1);
}
console.log(`3. OK: Vídeo WebM com transparência alfa contínua gerado (${webmStat.size} bytes).`);

// 4. Integra o vídeo transparente em um projeto do LeccorCut como overlay PiP animado
const project = {
  clips: [
    {
      id: 1,
      path: bgVideo,
      name: 'bg.mp4',
      duration: 3,
      in: 0,
      hasVideo: true,
      hasAudio: true,
      isImage: false,
      filters: {},
      speed: 1,
      volume: 1
    }
  ],
  overlays: [
    {
      id: 2,
      path: transparentWebm,
      name: 'transparent_subject.webm',
      isImage: false,
      start: 0.5,
      in: 0,
      duration: 2,
      scale: 50,
      x: 0.5,
      y: 0.5,
      opacity: 1,
      anim: 'fade'
    }
  ],
  texts: [],
  audios: [],
  settings: { height: 360, fps: 25, crf: 23, aspect: '16:9' }
};

const { args } = buildFfmpeg(project, outFinal);
execFileSync(ffmpeg, ['-v', 'error', '-y', ...args]);

const outStat = fs.statSync(outFinal);
if (outStat.size < 500) {
  console.error('FALHA: Composição final de matting contínuo não foi gerada corretamente');
  process.exit(1);
}

console.log(`4. OK: Composição final de vídeo com Matting Contínuo gerada com sucesso (${outStat.size} bytes) em ${outFinal}`);
console.log('--- Teste de Matting de Vídeo Contínuo Concluído com Sucesso! ---');
