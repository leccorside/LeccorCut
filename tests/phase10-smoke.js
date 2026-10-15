// tests/phase10-smoke.js — Testes unitários e end-to-end da Fase 10: Aceleração GPU e Mídia Proxy
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const unpacked = (p) => p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
const ffmpegPath = unpacked(require('ffmpeg-static'));
const { buildFfmpeg, buildCodecArgs } = require('../src/ffmpegBuilder');
const { detectGpuEncoders, resolveEncoderArgs, invalidateCache, GPU_ENCODERS } = require('../src/gpuDetector');
const proxyManager = require('../src/proxyManager');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lccut-phase10-'));
proxyManager.init(ffmpegPath, tmpDir);

let passed = 0;
let failed = 0;

function ok(condition, desc) {
  if (condition) {
    console.log(`  ✓ ${desc}`);
    passed++;
  } else {
    console.error(`  ✗ ${desc}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n=== Fase 10 — Aceleração por Hardware GPU e Mídia Proxy: Testes ===\n');

  // ── 1. Detecção e Resolução de Encoders GPU ────────────────────────────────
  console.log('1. Testando módulo gpuDetector...');

  ok(typeof detectGpuEncoders === 'function', 'detectGpuEncoders exportada corretamente');
  ok(typeof resolveEncoderArgs === 'function', 'resolveEncoderArgs exportada corretamente');
  ok(GPU_ENCODERS && GPU_ENCODERS.nvenc && GPU_ENCODERS.qsv && GPU_ENCODERS.amf, 'Definições NVENC, QSV e AMF presentes');

  // Teste de fallback CPU quando solicitado
  const cpuArgs = resolveEncoderArgs({}, 'cpu', 'mp4', 'bt709');
  ok(cpuArgs.isGpu === false && cpuArgs.codecArgs.includes('libx264'), 'Preferência "cpu" resolve fallback libx264');

  // Teste de mock com NVENC disponível
  const mockGpuInfo = {
    available: ['nvenc'],
    recommended: 'nvenc',
    encoders: {
      nvenc: { label: 'NVIDIA NVENC', h264: 'h264_nvenc', hevc: 'hevc_nvenc', hwaccel: 'd3d11va' }
    },
    hwaccelFlag: 'd3d11va'
  };

  const autoArgs = resolveEncoderArgs(mockGpuInfo, 'auto', 'mp4', 'bt709');
  ok(autoArgs.isGpu === true && autoArgs.codecArgs.includes('h264_nvenc'), 'Modo auto com NVENC disponível seleciona h264_nvenc');

  const hdrArgs = resolveEncoderArgs(mockGpuInfo, 'auto', 'mp4', 'bt2020');
  ok(hdrArgs.isGpu === true && hdrArgs.codecArgs.includes('hevc_nvenc'), 'Perfil BT.2020 HDR seleciona hevc_nvenc');

  // Execução real da detecção no ambiente atual (sondagem sem falhas)
  invalidateCache();
  const realGpuInfo = await detectGpuEncoders(ffmpegPath, true);
  ok(realGpuInfo && Array.isArray(realGpuInfo.available), 'Sondagem real de GPU executa sem exceções e retorna estrutura válida');
  console.log(`     Informação de GPU detectada: [${realGpuInfo.available.join(', ') || 'nenhuma (CPU fallback)'}]`);

  // ── 2. Integração com ffmpegBuilder ───────────────────────────────────────
  console.log('\n2. Testando integração de GPU no ffmpegBuilder...');

  const settingsWithGpu = {
    format: 'mp4',
    colorProfile: 'bt709',
    gpuEncoder: {
      codecArgs: ['-c:v', 'h264_nvenc', '-preset', 'p4'],
      hwaccelArgs: ['-hwaccel', 'd3d11va'],
      isGpu: true,
      label: 'NVIDIA NVENC'
    }
  };

  const { vArgs } = buildCodecArgs(settingsWithGpu, 'out.mp4');
  ok(vArgs.includes('h264_nvenc') && !vArgs.includes('libx264'), 'buildCodecArgs aplica encoder h264_nvenc');
  ok(!vArgs.includes('-crf'), 'buildCodecArgs omite -crf redundante quando encoder GPU está ativo');

  // ── 3. Gerenciador de Mídia Proxy (proxyManager) ───────────────────────────
  console.log('\n3. Testando proxyManager e geração de proxy em segundo plano...');

  // Gerar vídeo de teste sintético
  const rawVideo = path.join(tmpDir, 'raw_heavy_video.mp4');
  const genVid = spawnSync(ffmpegPath, [
    '-y', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=640x360:rate=24',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', rawVideo
  ], { encoding: 'utf8' });

  ok(fs.existsSync(rawVideo), 'Vídeo sintético original criado para teste de proxy');

  const expectedProxyPath = proxyManager.getProxyPath(rawVideo);
  ok(typeof expectedProxyPath === 'string' && expectedProxyPath.includes('proxy_'), 'getProxyPath calcula caminho com hash');

  ok(proxyManager.hasProxy(rawVideo) === false, 'hasProxy retorna false antes da geração');
  ok(proxyManager.resolvePlaybackPath(rawVideo) === rawVideo, 'resolvePlaybackPath retorna original quando não há proxy');

  // Gerar proxy real via FFmpeg
  let progressEventFired = false;
  proxyManager.on('proxy-progress', (d) => {
    if (d.srcPath === rawVideo) progressEventFired = true;
  });

  const generatedPath = await proxyManager.generateProxy(rawVideo, { targetHeight: 180, crf: 30 });
  ok(fs.existsSync(generatedPath), `generateProxy produziu arquivo em disco: ${path.basename(generatedPath)}`);
  ok(proxyManager.hasProxy(rawVideo) === true, 'hasProxy retorna true após geração');
  ok(proxyManager.resolvePlaybackPath(rawVideo) === generatedPath, 'resolvePlaybackPath retorna caminho do proxy');
  ok(progressEventFired, 'Evento proxy-progress foi emitido durante a geração');

  // Estatísticas de cache
  const stats = proxyManager.getCacheStats();
  ok(stats.count >= 1 && Number(stats.totalMB) > 0, `getCacheStats contabiliza ${stats.count} arquivos (${stats.totalMB} MB)`);

  const list = proxyManager.listProxies();
  ok(Array.isArray(list) && list.length >= 1, `listProxies retornou ${list.length} item(ns)`);

  // Limpeza de cache
  const clearRes = proxyManager.clearCache();
  ok(clearRes.removed >= 1, `clearCache removeu ${clearRes.removed} arquivo(s) de proxy`);
  ok(proxyManager.hasProxy(rawVideo) === false, 'hasProxy retorna false após clearCache');

  // ── 4. Verificação Estática de UI e IPC ────────────────────────────────────
  console.log('\n4. Verificando integração IPC, UI e Preload...');

  const mainSrc = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  ok(mainSrc.includes("'detect-gpu'") && mainSrc.includes("'generate-proxy'"), 'main.js registra IPC detect-gpu e generate-proxy');
  ok(mainSrc.includes("'proxy-cache-stats'") && mainSrc.includes("'clear-proxy-cache'"), 'main.js registra IPC de estatísticas de cache');
  ok(mainSrc.includes('proxyManager.init'), 'main.js inicializa proxyManager em createWindow');

  const preloadSrc = fs.readFileSync(path.join(__dirname, '../src/preload.js'), 'utf8');
  ok(preloadSrc.includes('detectGpu') && preloadSrc.includes('generateProxy'), 'preload.js expõe detectGpu e generateProxy');
  ok(preloadSrc.includes('onProxyProgress') && preloadSrc.includes('resolveEncoderArgs'), 'preload.js expõe onProxyProgress e resolveEncoderArgs');

  const htmlSrc = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
  ok(htmlSrc.includes('id="expAccel"') && htmlSrc.includes('id="gpuStatusBadge"'), 'index.html possui controles #expAccel e #gpuStatusBadge');
  ok(htmlSrc.includes('id="proxyModal"') && htmlSrc.includes('id="btnGenerateProxies"'), 'index.html possui modal #proxyModal e botão de geração');

  const cssSrc = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');
  ok(cssSrc.includes('.gpu-badge') && cssSrc.includes('.proxy-gpu-info'), 'styles.css possui regras de estilo da Fase 10');

  const rendererSrc = fs.readFileSync(path.join(__dirname, '../src/renderer.js'), 'utf8');
  ok(rendererSrc.includes('initGpuDetection') && rendererSrc.includes('initProxyManagerUI'), 'renderer.js contém funções de inicialização da Fase 10');

  // Limpar diretório temporário
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {}

  console.log(`\n=== Resultado da Fase 10: ${passed} passaram, ${failed} falharam ===\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Erro fatal nos testes da Fase 10:', err);
  process.exit(1);
});
