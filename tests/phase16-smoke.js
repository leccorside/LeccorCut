'use strict';
/**
 * tests/phase16-smoke.js — Testes Automatizados da Fase 16
 * Detector Inteligente de Silêncio e Cortes Rítmicos (Beat Sync)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ffmpegPath = require('ffmpeg-static');
const {
  detectSilence,
  sliceClipBySpeechSegments,
  removeSilenceFile
} = require('../src/silenceDetector');

const {
  filterBeatsByInterval,
  alignClipsToBeatTimeline,
  snapToNearestBeat
} = require('../src/beatSyncManager');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n--- Início dos Testes da Fase 16: Detector Inteligente de Silêncio e Beat Sync ---\n');

  const testTempDir = path.join(os.tmpdir(), `leccorcut_test_p16_${Date.now()}`);
  fs.mkdirSync(testTempDir, { recursive: true });

  // ── 1. Testes de Sincronização Rítmica (beatSyncManager) ──────────────────────
  test('filterBeatsByInterval filtra batidas por 1x, 2x e 4x compassos musicais', () => {
    const rawBeats = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0];
    const b1x = filterBeatsByInterval(rawBeats, 1);
    assert.strictEqual(b1x.length, 8);
    assert.deepStrictEqual(b1x, rawBeats);

    const b2x = filterBeatsByInterval(rawBeats, 2);
    assert.strictEqual(b2x.length, 4);
    assert.deepStrictEqual(b2x, [0.5, 1.5, 2.5, 3.5]);

    const b4x = filterBeatsByInterval(rawBeats, 4);
    assert.strictEqual(b4x.length, 2);
    assert.deepStrictEqual(b4x, [0.5, 2.5]);
  });

  test('snapToNearestBeat atrai o cursor para a batida mais próxima dentro da tolerância', () => {
    const beats = [1.0, 2.0, 3.0, 4.0];
    const snap1 = snapToNearestBeat(1.08, beats, 0.15);
    assert.strictEqual(snap1.snapped, true);
    assert.strictEqual(snap1.time, 1.0);

    const snap2 = snapToNearestBeat(2.4, beats, 0.15);
    assert.strictEqual(snap2.snapped, false);
    assert.strictEqual(snap2.time, 2.4);
  });

  test('alignClipsToBeatTimeline alinha duração e cortes de clipes para coincidir com as batidas', () => {
    const clips = [
      { id: 1, name: 'Clipe 1', start: 0, duration: 2.0 },
      { id: 2, name: 'Clipe 2', start: 2.0, duration: 2.0 },
      { id: 3, name: 'Clipe 3', start: 4.0, duration: 2.0 }
    ];
    const beats = [1.2, 2.4, 3.8, 5.0];

    const res = alignClipsToBeatTimeline(clips, beats, { beatInterval: 1, minClipDuration: 0.5 });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.alignedClips.length, 3);
    assert.strictEqual(res.cutsCount, 3);
    assert.strictEqual(res.cutPoints[0], 1.2);
    assert.strictEqual(res.alignedClips[0].duration, 1.2);
    assert.strictEqual(res.alignedClips[1].start, 1.2);
    assert.strictEqual(res.alignedClips[1].duration, 1.2); // 2.4 - 1.2
    assert.strictEqual(res.alignedClips[2].start, 2.4);
    assert.strictEqual(res.alignedClips[2].duration, 1.4); // 3.8 - 2.4
  });

  // ── 2. Testes de Fatiamento de Clipe (sliceClipBySpeechSegments) ──────────────
  test('sliceClipBySpeechSegments fatia o clipe base preservando ordem e aplicando micro-fades', () => {
    const baseClip = {
      id: 10,
      name: 'Vlog Entrevista',
      path: '/media/video.mp4',
      start: 5.0,
      in: 0,
      duration: 10.0
    };
    const speechSegments = [
      { start: 0.5, end: 3.0, duration: 2.5 },
      { start: 5.0, end: 8.0, duration: 3.0 }
    ];

    const sliced = sliceClipBySpeechSegments(baseClip, speechSegments, 5.0);
    assert.strictEqual(sliced.length, 2);
    assert.strictEqual(sliced[0].start, 5.0);
    assert.strictEqual(sliced[0].in, 0.5);
    assert.strictEqual(sliced[0].duration, 2.5);
    assert.strictEqual(sliced[0].fadeIn, 0.015);
    assert.strictEqual(sliced[0].fadeOut, 0.015);

    assert.strictEqual(sliced[1].start, 7.5); // 5.0 + 2.5
    assert.strictEqual(sliced[1].in, 5.0);
    assert.strictEqual(sliced[1].duration, 3.0);
  });

  // ── 3. Detecção Acústica Real de Silêncio com FFmpeg ──────────────────────────
  await asyncTest('detectSilence detecta pausas de silêncio e trechos ativos de fala via FFmpeg', async () => {
    // Gera áudio sintético: 1s tom (440Hz) + 1s silêncio + 1s tom (880Hz) = 3 segundos
    const synthAudio = path.join(testTempDir, 'synth_silence_test.wav');
    const genRes = spawnSync(ffmpegPath, [
      '-y',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.0',
      '-f', 'lavfi', '-i', 'anullsrc=duration=1.0:channel_layout=mono:sample_rate=44100',
      '-f', 'lavfi', '-i', 'sine=frequency=880:duration=1.0',
      '-filter_complex', '[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]',
      '-map', '[out]',
      synthAudio
    ]);
    assert.strictEqual(genRes.status, 0, 'FFmpeg deve gerar arquivo com silêncio embutido');

    const res = await detectSilence(ffmpegPath, synthAudio, {
      noiseThreshold: '-30dB',
      minDuration: 0.3,
      padding: 0.05
    });

    assert.strictEqual(res.ok, true);
    assert.ok(res.silences.length >= 1, 'Deve detectar pelo menos 1 pausa silenciosa');
    const mainSilence = res.silences.find(s => s.start >= 0.8 && s.end <= 2.2);
    assert.ok(mainSilence, 'Deve localizar silêncio próximo a 1s-2s');
    assert.ok(mainSilence.duration >= 0.7, `Duração da pausa esperada ~1s, obtida ${mainSilence.duration}s`);
    assert.ok(res.speechSegments.length >= 2, 'Deve identificar 2 trechos de fala separados pela pausa');
    assert.ok(res.totalDuration >= 2.8, `Duração total esperada ~3s, obtida ${res.totalDuration}s`);
  });

  // ── 4. Remoção Física e Exportação de Arquivo Sem Silêncio ────────────────────
  await asyncTest('removeSilenceFile exporta arquivo físico consolidado sem as pausas', async () => {
    const synthAudio = path.join(testTempDir, 'synth_silence_test.wav');
    const res = await removeSilenceFile(ffmpegPath, testTempDir, synthAudio, {
      noiseThreshold: '-30dB',
      minDuration: 0.3,
      padding: 0.05
    });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(fs.existsSync(res.path), true);
    assert.ok(res.duration < 2.5, `Arquivo consolidado deve ser menor que 3s, obtido ${res.duration}s`);
    assert.ok(res.removedDuration >= 0.7, `Deve remover ~1s de silêncio, removido ${res.removedDuration}s`);
  });

  // ── 5. Verificação Estática de Interface, Preload, Main e Renderer ────────────
  test('src/index.html contém botões da Fase 16 (#btnSilenceCut e #btnBeatSync) e modais', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
    assert.ok(html.includes('id="btnSilenceCut"'));
    assert.ok(html.includes('id="btnBeatSync"'));
    assert.ok(html.includes('id="silenceModal"'));
    assert.ok(html.includes('id="beatSyncModal"'));
    assert.ok(html.includes('id="btnAnalyzeSilence"'));
    assert.ok(html.includes('id="btnApplySilenceCut"'));
    assert.ok(html.includes('id="btnExportSilenceFreeFile"'));
    assert.ok(html.includes('id="btnExecuteBeatSync"'));
  });

  test('src/styles.css contém estilos para corte de silêncio e sincronizador de batida', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');
    assert.ok(css.includes('.smart-cut-btn'));
    assert.ok(css.includes('.beat-sync-btn'));
    assert.ok(css.includes('.modal-box--silence'));
    assert.ok(css.includes('.modal-box--beatsync'));
    assert.ok(css.includes('.silence-stats-box'));
    assert.ok(css.includes('.silence-preview-list'));
  });

  test('src/preload.js expõe APIs da Fase 16 no window.api', () => {
    const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
    assert.ok(preload.includes('detectSilence:'));
    assert.ok(preload.includes('sliceClipSilence:'));
    assert.ok(preload.includes('removeSilenceFile:'));
    assert.ok(preload.includes('alignClipsToBeats:'));
    assert.ok(preload.includes('snapToBeat:'));
  });

  test('src/main.js registra handlers IPC correspondentes da Fase 16', () => {
    const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
    assert.ok(main.includes("'detect-silence'"));
    assert.ok(main.includes("'slice-clip-silence'"));
    assert.ok(main.includes("'remove-silence-file'"));
    assert.ok(main.includes("'align-clips-to-beats'"));
    assert.ok(main.includes("'snap-to-beat'"));
  });

  test('src/renderer.js integra initSilenceDetector e initBeatSync', () => {
    const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer.js'), 'utf8');
    assert.ok(renderer.includes('initSilenceDetector();'));
    assert.ok(renderer.includes('initBeatSync();'));
  });

  // Limpeza
  try {
    fs.rmSync(testTempDir, { recursive: true, force: true });
  } catch (_) {}

  console.log(`\nFim dos testes da Fase 16: ${passed} passaram, ${failed} falharam.\n`);
  if (failed > 0) process.exit(1);
}

runTests();
