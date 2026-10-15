// Teste automatizado — Fase 6.2: Curvas de Velocidade Bezier Livre, Retoque Facial (Beauty) e Borda/Glow PiP
const { execFileSync, spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { buildFfmpeg } = require('../src/ffmpegBuilder');

console.log('--- Iniciando Testes da Fase 6.2: Speed Ramping Bezier, Beauty e Borda/Glow ---');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lccut-phase62-'));
const clipVideo = path.join(tmpDir, 'source.mp4');
const pipImage = path.join(tmpDir, 'pip.png');
const outVideo = path.join(tmpDir, 'out-phase62.mp4');

try {
  // 1. Gera vídeo fonte sintético (3 segundos, 640x360, 30fps)
  execFileSync(ffmpeg, [
    '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=3:size=640x360:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    clipVideo
  ]);
  console.log('1. Vídeo base gerado com sucesso.');

  // 2. Gera imagem PNG com transparência para testar PiP / Borda / Glow
  execFileSync(ffmpeg, [
    '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=color=red@0.8:size=120x120:duration=1',
    '-vframes', '1',
    pipImage
  ]);
  console.log('2. Overlay PiP sintético gerado com sucesso.');

  // 3. Monta projeto testando os 3 recursos da Fase 6.2 juntos:
  // - Speed Ramping Custom com Curva Bezier Livre
  // - Efeito Beauty (Retoque Facial com pele suave e realce de iluminação)
  // - Overlay com Borda e Glow Neon
  const project = {
    settings: { width: 640, height: 360, fps: 30, crf: 22 },
    clips: [
      {
        id: 1,
        path: clipVideo,
        name: 'Vídeo Beauty e Bezier',
        in: 0,
        duration: 3,
        speed: 1,
        speedCurve: 'custom',
        customCurvePoints: [
          { t: 0, s: 1.0 },
          { t: 0.3, s: 2.5 },
          { t: 0.7, s: 0.5 },
          { t: 1.0, s: 1.2 }
        ],
        filters: {
          beauty: true,
          beautySmooth: 65,
          beautyGlow: 35
        },
        hasAudio: true,
        volume: 1
      }
    ],
    audios: [],
    texts: [],
    overlays: [
      {
        id: 10,
        path: pipImage,
        name: 'PiP Glow Neon',
        isImage: true,
        start: 0.5,
        duration: 2.0,
        scale: 40,
        x: 0.5,
        y: 0.5,
        opacity: 0.95,
        borderWidth: 4,
        borderColor: '#00e5c3',
        borderRadius: 12,
        glow: true,
        glowColor: '#00e5c3',
        glowBlur: 18
      }
    ],
    tracks: {
      video: { visible: true, mute: false },
      overlay: { visible: true },
      text: { visible: true },
      audio: { mute: false, solo: false }
    }
  };

  // 4. Constrói argumentos FFmpeg
  const { args } = buildFfmpeg(project, outVideo);
  const outPath = outVideo;

  // 5. Executa exportação real via FFmpeg
  console.log('3. Renderizando exportação com Curva Bezier, Beauty e Borda/Glow PiP...');
  const res = spawnSync(ffmpeg, args, { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error('Falha no FFmpeg:', res.stderr);
    process.exit(1);
  }

  if (!fs.existsSync(outPath)) {
    console.error('Arquivo de saída não foi gerado:', outPath);
    process.exit(1);
  }

  const stat = fs.statSync(outPath);
  if (stat.size < 1000) {
    console.error(`Arquivo gerado muito pequeno (${stat.size} bytes)`);
    process.exit(1);
  }

  console.log(`4. OK: Vídeo exportado com sucesso (${stat.size} bytes) em ${outPath}`);
  console.log('--- Testes da Fase 6.2 Concluídos com 100% de Sucesso! ---');
} finally {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
}
