// Teste automatizado — Fase 6.1: Auto Reframe e Motion Track
// Valida o pipeline de reenquadramento inteligente (crop + scale) e a
// análise de vetores de movimento (mestimate + showinfo).
const { execFileSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ffmpeg = require('ffmpeg-static');

console.log('--- Iniciando Testes de Auto Reframe e Motion Track (Fase 6.1) ---');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lccut-reframe-'));

// ── 1. Gera vídeo horizontal 16:9 de teste ───────────────────────────────────
const inVid = path.join(dir, 'src_16x9.mp4');
execFileSync(ffmpeg, [
  '-v', 'error', '-y',
  '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=2',
  '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
  '-shortest', '-pix_fmt', 'yuv420p', inVid
]);
console.log('1. Vídeo fonte 16:9 (640x360) gerado.');

// ── 2. Auto Reframe: 16:9 → 9:16 com foco central ───────────────────────────
const out916 = path.join(dir, 'reframe_9x16.mp4');
// crop=iw*h_target/w_target:h:x:0 onde h_target/w_target = 9/16
// Para 640x360 → 9:16: cropW = 360 * 9/16 = 202.5 → 202, centrado
const cropW = 202, cropH = 360, cropX = Math.round((640 - 202) / 2);
execFileSync(ffmpeg, [
  '-v', 'error', '-y',
  '-i', inVid,
  `-vf`, `crop=${cropW}:${cropH}:${cropX}:0,scale=360:640:flags=lanczos,setsar=1`,
  '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
  '-pix_fmt', 'yuv420p', '-c:a', 'copy', out916
]);
const s916 = fs.statSync(out916).size;
if (s916 < 500) { console.error('FALHA: Auto Reframe 9:16 não gerado'); process.exit(1); }
console.log(`2. OK: Auto Reframe 9:16 gerado (${s916} bytes).`);

// ── 3. Auto Reframe: 16:9 → 1:1 com foco à esquerda ─────────────────────────
const out11 = path.join(dir, 'reframe_1x1.mp4');
const cropW11 = 360, cropH11 = 360, cropX11 = 0;
execFileSync(ffmpeg, [
  '-v', 'error', '-y',
  '-i', inVid,
  `-vf`, `crop=${cropW11}:${cropH11}:${cropX11}:0,scale=720:720:flags=lanczos,setsar=1`,
  '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
  '-pix_fmt', 'yuv420p', '-c:a', 'copy', out11
]);
const s11 = fs.statSync(out11).size;
if (s11 < 500) { console.error('FALHA: Auto Reframe 1:1 não gerado'); process.exit(1); }
console.log(`3. OK: Auto Reframe 1:1 (foco: esquerda) gerado (${s11} bytes).`);

// ── 4. Motion Track: valida execução de mestimate + showinfo ─────────────────
const trackOut = spawnSync(ffmpeg, [
  '-v', 'info',
  '-i', inVid,
  '-vf', `mestimate=method=epzs:mb_size=16,select='not(mod(n\\,8))',showinfo`,
  '-f', 'null', '-'
], { encoding: 'utf8' });

const pts = (trackOut.stderr.match(/pts_time:[0-9.]+/g) || []);
if (pts.length === 0) {
  console.error('FALHA: Nenhum frame detectado pelo Motion Track');
  process.exit(1);
}
console.log(`4. OK: Motion Track executado — ${pts.length} keyframe(s) de tempo detectados via showinfo.`);

// Limpeza
try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}

console.log('--- Testes de Auto Reframe e Motion Track concluídos com sucesso! ---');
