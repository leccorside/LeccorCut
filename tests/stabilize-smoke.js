// Teste automatizado do pipeline de Estabilização de Vídeo (Fase 6.1 - vidstabdetect + vidstabtransform)
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ffmpeg = require('ffmpeg-static');

console.log('--- Iniciando Teste de Estabilização de Vídeo (Fase 6.1) ---');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lccut-stab-'));
const inVid = path.join(dir, 'shaky_input.mp4');
const trfFile = 'transforms_test.trf';
const outVid = path.join(dir, 'stabilized_out.mp4');

// 1. Gera vídeo sintético com movimento/trepidação simulada
execFileSync(ffmpeg, [
  '-v', 'error', '-y',
  '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=2',
  '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
  '-shortest', '-pix_fmt', 'yuv420p',
  inVid
]);
console.log('1. Vídeo de entrada gerado com sucesso.');

// 2. Passo 1: Detecção de vetores de trepidação (vidstabdetect)
execFileSync(ffmpeg, [
  '-v', 'error', '-y',
  '-i', inVid,
  '-vf', `vidstabdetect=stepsize=6:shakiness=8:accuracy=15:result=${trfFile}`,
  '-f', 'null',
  '-'
], { cwd: dir });

const trfPath = path.join(dir, trfFile);
if (!fs.existsSync(trfPath) || fs.statSync(trfPath).size < 10) {
  console.error('FALHA: Arquivo de transformações .trf não foi gerado');
  process.exit(1);
}
console.log(`2. OK: Passo 1 concluído. Arquivo de vetores ${trfFile} gerado (${fs.statSync(trfPath).size} bytes).`);

// 3. Passo 2: Aplicação da estabilização e suavização (vidstabtransform)
execFileSync(ffmpeg, [
  '-v', 'error', '-y',
  '-i', inVid,
  '-vf', `vidstabtransform=input=${trfFile}:smoothing=30:optalgo=gauss:interpol=bicubic:zoom=2`,
  '-c:v', 'libx264',
  '-preset', 'fast',
  '-crf', '18',
  '-pix_fmt', 'yuv420p',
  '-c:a', 'copy',
  outVid
], { cwd: dir });

if (!fs.existsSync(outVid) || fs.statSync(outVid).size < 1000) {
  console.error('FALHA: Vídeo estabilizado não foi gerado corretamente');
  process.exit(1);
}

const outSize = fs.statSync(outVid).size;
console.log(`3. OK: Passo 2 concluído. Vídeo estabilizado gerado com sucesso (${outSize} bytes) em ${outVid}`);
console.log('--- Teste de Estabilização de Vídeo Concluído com Sucesso! ---');

// Limpeza
try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
