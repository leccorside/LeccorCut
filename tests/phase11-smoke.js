// tests/phase11-smoke.js — Testes unitários e end-to-end da Fase 11: Efeitos Visuais, Modos de Mesclagem e LUTs 3D
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const unpacked = (p) => p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
const ffmpegPath = unpacked(require('ffmpeg-static'));
const { buildFfmpeg } = require('../src/ffmpegBuilder');
const {
  BLEND_MODES,
  SHAPE_MASKS,
  STYLING_EFFECTS,
  BUILTIN_LUTS,
  getCssBlendMode,
  getCssMaskStyle,
  buildFfmpegMaskFilter,
  buildColorGradingFilter,
  generateCubeLutString,
  ensureBuiltinLut,
  buildLutFilter
} = require('../src/visualEffects');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lccut-phase11-'));

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
  console.log('\n=== Fase 11 — Efeitos Visuais, Shaders, Modos de Mesclagem e LUTs 3D: Testes ===\n');

  // ── 1. Módulo visualEffects: Modos de Mesclagem e Máscaras ───────────────────
  console.log('1. Testando Modos de Mesclagem e Máscaras Geométricas...');

  ok(BLEND_MODES.screen && BLEND_MODES.multiply && BLEND_MODES.overlay, 'Modos de mesclagem essenciais definidos');
  ok(getCssBlendMode('screen') === 'screen', 'getCssBlendMode mapeia screen para CSS');
  ok(getCssBlendMode('addition') === 'color-dodge', 'getCssBlendMode mapeia addition para color-dodge');

  ok(SHAPE_MASKS.rectangle && SHAPE_MASKS.circle && SHAPE_MASKS.linear && SHAPE_MASKS.mirror, 'Máscaras de forma definidas');

  const rectCss = getCssMaskStyle({ type: 'rectangle', size: 60, roundness: 8 });
  ok(rectCss.clipPath && rectCss.clipPath.includes('inset'), 'getCssMaskStyle gera inset para retângulo');

  const circleCss = getCssMaskStyle({ type: 'circle', size: 50 });
  ok(circleCss.clipPath && circleCss.clipPath.includes('circle'), 'getCssMaskStyle gera circle para círculo');

  const rectFfmpeg = buildFfmpegMaskFilter({ type: 'rectangle', size: 80, feather: 5 }, 1280, 720);
  ok(rectFfmpeg.includes('geq=') && rectFfmpeg.includes('boxblur='), 'buildFfmpegMaskFilter gera expressão geq com suavização (boxblur)');

  const circleFfmpeg = buildFfmpegMaskFilter({ type: 'circle', size: 70, invert: true }, 1280, 720);
  ok(circleFfmpeg.includes('lte(') && circleFfmpeg.includes('if('), 'buildFfmpegMaskFilter gera máscara elíptica com suporte a inversão');

  // ── 2. Color Grading e Geração de 3D LUT (.cube) ───────────────────────────
  console.log('\n2. Testando Color Grading e gerador de 3D LUT (.cube)...');

  const gradingFilter = buildColorGradingFilter({ temp: 30, tint: -20, highlights: 15, shadows: -10, saturation: 1.2 });
  ok(gradingFilter.includes('colorbalance=') && gradingFilter.includes('curves=') && gradingFilter.includes('saturation='), 'buildColorGradingFilter gera cadeia balance + curves + eq');

  ok(BUILTIN_LUTS.teal_orange && BUILTIN_LUTS.vintage_kodak && BUILTIN_LUTS.cyberpunk_neon, 'Presets de 3D LUT embutidos presentes');

  const cubeStr = generateCubeLutString('teal_orange', 17);
  ok(cubeStr.includes('LUT_3D_SIZE 17'), 'generateCubeLutString contém cabeçalho Adobe LUT_3D_SIZE 17');
  const cubeLines = cubeStr.trim().split('\n').filter(l => l && !l.startsWith('#') && !l.startsWith('LUT_'));
  ok(cubeLines.length === 17 * 17 * 17, `generateCubeLutString gerou exatamente 4913 pontos de cor (17^3)`);

  const lutPath = ensureBuiltinLut('teal_orange', path.join(tmpDir, 'luts'));
  ok(fs.existsSync(lutPath), `ensureBuiltinLut gravou arquivo .cube em: ${path.basename(lutPath)}`);

  const lutFilterStr = buildLutFilter(lutPath);
  ok(lutFilterStr.includes('lut3d=file='), 'buildLutFilter gera expressão correta para filtro lut3d do FFmpeg');

  // ── 3. Renderização Real de Efeitos e LUTs com FFmpeg ───────────────────────
  console.log('\n3. Testando renderização real de LUTs e Blend Modes com FFmpeg...');

  // Gerar vídeo de teste
  const baseVideo = path.join(tmpDir, 'base_test.mp4');
  const genBase = spawnSync(ffmpegPath, [
    '-y', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x240:rate=24',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', baseVideo
  ], { encoding: 'utf8' });
  ok(fs.existsSync(baseVideo), 'Vídeo base gerado com sucesso');

  // Testar clipe com 3D LUT e Color Grading aplicado no buildFfmpeg
  const outLutVideo = path.join(tmpDir, 'out_lut.mp4');
  const lutProject = {
    clips: [{
      path: baseVideo,
      in: 0,
      duration: 1,
      colorGrading: { temp: 25, tint: -10, highlights: 10 },
      lutPath: lutPath,
      effects: [{ type: 'film_grain', intensity: 1.0 }]
    }],
    settings: { height: 240, fps: 24, aspect: '4:3', format: 'mp4' }
  };

  const ffmpegRes = buildFfmpeg(lutProject, outLutVideo);
  ok(ffmpegRes.args.some(a => String(a).includes('lut3d=') && String(a).includes('colorbalance=')), 'buildFfmpeg injetou lut3d e colorbalance no filtro complexo');

  const execLut = spawnSync(ffmpegPath, ffmpegRes.args, { encoding: 'utf8' });
  ok(fs.existsSync(outLutVideo) && fs.statSync(outLutVideo).size > 500, `Vídeo com 3D LUT renderizado com sucesso (${fs.statSync(outLutVideo || '').size} bytes)`);

  // Testar sobreposição com Blend Mode 'screen' e Shape Mask 'circle'
  const outBlendVideo = path.join(tmpDir, 'out_blend.mp4');
  const overlayVideo = path.join(tmpDir, 'ov_light.png');
  spawnSync(ffmpegPath, [
    '-y', '-f', 'lavfi', '-i', 'color=c=white:size=160x120:duration=1',
    '-frames:v', '1', overlayVideo
  ], { encoding: 'utf8' });

  const blendProject = {
    clips: [{ path: baseVideo, in: 0, duration: 1 }],
    overlays: [{
      path: overlayVideo,
      isImage: true,
      start: 0,
      duration: 1,
      x: 0.5,
      y: 0.5,
      scale: 50,
      blendMode: 'screen',
      mask: { type: 'circle', size: 80, feather: 4 }
    }],
    settings: { height: 240, fps: 24, aspect: '4:3', format: 'mp4' }
  };

  const blendFfmpegRes = buildFfmpeg(blendProject, outBlendVideo);
  ok(blendFfmpegRes.args.some(a => String(a).includes('blend=all_mode=screen')), 'buildFfmpeg aplicou blend=all_mode=screen para o overlay');

  const execBlend = spawnSync(ffmpegPath, blendFfmpegRes.args, { encoding: 'utf8' });
  ok(fs.existsSync(outBlendVideo) && fs.statSync(outBlendVideo).size > 500, `Vídeo com Blend Mode e Shape Mask renderizado com sucesso (${fs.statSync(outBlendVideo || '').size} bytes)`);

  // ── 4. Verificação Estática de UI, Preload e IPC ─────────────────────────────
  console.log('\n4. Verificando integridade de código, IPC e UI...');

  const mainSrc = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  ok(mainSrc.includes("'get-builtin-luts'") && mainSrc.includes("'ensure-builtin-lut'"), 'main.js registra IPCs de 3D LUTs');
  ok(mainSrc.includes("'import-lut'") && mainSrc.includes("'get-blend-modes'"), 'main.js registra IPCs de importação e blend modes');

  const preloadSrc = fs.readFileSync(path.join(__dirname, '../src/preload.js'), 'utf8');
  ok(preloadSrc.includes('getBuiltinLuts') && preloadSrc.includes('ensureBuiltinLut'), 'preload.js expõe getBuiltinLuts e ensureBuiltinLut');
  ok(preloadSrc.includes('importLut') && preloadSrc.includes('getBlendModes'), 'preload.js expõe importLut e getBlendModes');

  const htmlSrc = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
  ok(htmlSrc.includes('id="tabFx"') && htmlSrc.includes('id="fxView"'), 'index.html possui aba #tabFx e view #fxView');
  ok(htmlSrc.includes('id="blendModeSelect"') && htmlSrc.includes('id="maskTypeSelect"'), 'index.html possui seletores de Blend Mode e Shape Mask');
  ok(htmlSrc.includes('id="lutPresetSelect"') && htmlSrc.includes('id="btnImportLut"'), 'index.html possui seletores de LUT e botão de importação');

  const cssSrc = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');
  ok(cssSrc.includes('.fx-section') && cssSrc.includes('.fx-grading-group'), 'styles.css possui regras de estilo para .fx-section e .fx-grading-group');

  const rendererSrc = fs.readFileSync(path.join(__dirname, '../src/renderer.js'), 'utf8');
  ok(rendererSrc.includes('initVisualEffects') && rendererSrc.includes('syncFxPanel'), 'renderer.js possui funções de controle de efeitos visuais');

  // Limpeza
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {}

  console.log(`\n=== Resultado da Fase 11: ${passed} passaram, ${failed} falharam ===\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Erro fatal nos testes da Fase 11:', err);
  process.exit(1);
});
