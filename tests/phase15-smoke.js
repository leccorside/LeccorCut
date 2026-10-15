'use strict';
/**
 * tests/phase15-smoke.js — Testes Automatizados da Fase 15
 * Gravação Direta na Timeline: Voiceover & Webcam PiP
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ffmpegPath = require('ffmpeg-static');
const {
  getRecordingsDir,
  calculateAudioMetrics,
  processAudioRecording,
  processVideoRecording
} = require('../src/recorderManager');

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
  console.log('\n--- Início dos Testes da Fase 15: Gravação Direta na Timeline (Voiceover & Webcam PiP) ---\n');

  const testTempDir = path.join(os.tmpdir(), `leccorcut_test_p15_${Date.now()}`);
  fs.mkdirSync(testTempDir, { recursive: true });

  // ── 1. Métricas de Áudio e VU Meter (calculateAudioMetrics) ─────────────────
  test('calculateAudioMetrics lida com buffer vazio ou nulo com segurança', () => {
    const res1 = calculateAudioMetrics(null);
    assert.strictEqual(res1.rms, 0);
    assert.strictEqual(res1.peak, 0);
    assert.strictEqual(res1.db, -100);
    assert.strictEqual(res1.clip, false);

    const res2 = calculateAudioMetrics([]);
    assert.strictEqual(res2.rms, 0);
    assert.strictEqual(res2.clip, false);
  });

  test('calculateAudioMetrics calcula silêncio absoluto com clamp -100 dB', () => {
    const silence = new Float32Array(512);
    const res = calculateAudioMetrics(silence);
    assert.strictEqual(res.rms, 0);
    assert.strictEqual(res.peak, 0);
    assert.strictEqual(res.db, -100);
    assert.strictEqual(res.clip, false);
  });

  test('calculateAudioMetrics calcula RMS e valor decibélico exato para sinal senoidal', () => {
    const n = 1000;
    const samples = new Float32Array(n);
    const amplitude = 0.5; // ~ -6 dB
    for (let i = 0; i < n; i++) {
      samples[i] = amplitude * Math.sin((2 * Math.PI * i) / 50);
    }
    const res = calculateAudioMetrics(samples);
    assert.ok(res.rms > 0.3 && res.rms < 0.4, `RMS esperado em torno de 0.35, obtido ${res.rms}`);
    assert.ok(res.db > -11 && res.db < -7, `dB esperado próximo a -9 dB, obtido ${res.db}`);
    assert.strictEqual(res.clip, false);
  });

  test('calculateAudioMetrics detecta clipping e saturação quando peak >= 0.99', () => {
    const saturated = new Float32Array([0.1, 0.5, 0.995, 0.4, -0.2]);
    const res = calculateAudioMetrics(saturated);
    assert.strictEqual(res.clip, true);
    assert.ok(res.peak >= 0.99);
  });

  // ── 2. Diretório de Gravações (getRecordingsDir) ──────────────────────────────
  test('getRecordingsDir cria diretório recordings se não existir e retorna o caminho absoluto', () => {
    const recDir = getRecordingsDir(testTempDir);
    assert.strictEqual(fs.existsSync(recDir), true);
    assert.strictEqual(path.basename(recDir), 'recordings');
  });

  // ── 3. Conversão de Áudio Gravado (processAudioRecording) ─────────────────────
  await asyncTest('processAudioRecording converte stream de áudio para WAV PCM 44.1kHz estéreo', async () => {
    // Gera um buffer de áudio sintético usando ffmpeg (1 segundo de onda senoidal de 440Hz em WAV)
    const genTempFile = path.join(testTempDir, 'synth_input.wav');
    const genRes = spawnSync(ffmpegPath, [
      '-y',
      '-f', 'lavfi',
      '-i', 'sine=frequency=440:duration=1.2',
      genTempFile
    ]);
    assert.strictEqual(genRes.status, 0, 'FFmpeg deve gerar arquivo sintético');
    const audioBuf = fs.readFileSync(genTempFile);

    const result = await processAudioRecording(ffmpegPath, testTempDir, audioBuf, 'teste_locucao');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(fs.existsSync(result.path), true);
    assert.ok(result.name.startsWith('teste_locucao_'));
    assert.ok(result.name.endsWith('.wav'));
    assert.ok(result.duration >= 1.0, `Duração deve ser >= 1.0s, obtido ${result.duration}`);

    // Valida cabeçalho WAV (RIFF .... WAVE)
    const fd = fs.openSync(result.path, 'r');
    const header = Buffer.alloc(12);
    fs.readSync(fd, header, 0, 12, 0);
    fs.closeSync(fd);
    assert.strictEqual(header.toString('ascii', 0, 4), 'RIFF');
    assert.strictEqual(header.toString('ascii', 8, 12), 'WAVE');
  });

  // ── 4. Conversão de Webcam Gravada (processVideoRecording) ───────────────────
  await asyncTest('processVideoRecording converte vídeo para MP4 H.264 com thumbnail gerada', async () => {
    // Gera vídeo sintético de 1.0s (320x240, 30fps)
    const genVidFile = path.join(testTempDir, 'synth_cam.mp4');
    const genRes = spawnSync(ffmpegPath, [
      '-y',
      '-f', 'lavfi',
      '-i', 'testsrc=duration=1:size=320x240:rate=30',
      '-f', 'lavfi',
      '-i', 'sine=frequency=1000:duration=1',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      genVidFile
    ]);
    assert.strictEqual(genRes.status, 0, 'FFmpeg deve gerar vídeo sintético');
    const vidBuf = fs.readFileSync(genVidFile);

    const result = await processVideoRecording(ffmpegPath, testTempDir, vidBuf, 'teste_webcam');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(fs.existsSync(result.path), true);
    assert.ok(result.name.startsWith('teste_webcam_'));
    assert.ok(result.name.endsWith('.mp4'));
    assert.ok(result.duration >= 0.8);
    assert.strictEqual(fs.existsSync(result.thumb), true);
    assert.ok(result.thumb.endsWith('.png'));
  });

  // ── 5. Verificação Estática de Interface e Preload ────────────────────────────
  test('src/index.html contém botões de timeline da Fase 15 (#btnVoiceover e #btnWebcamPiP)', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
    assert.ok(html.includes('id="btnVoiceover"'));
    assert.ok(html.includes('id="btnWebcamPiP"'));
    assert.ok(html.includes('id="voiceoverModal"'));
    assert.ok(html.includes('id="webcamModal"'));
    assert.ok(html.includes('id="voiceMicSelect"'));
    assert.ok(html.includes('id="vuMeterBar"'));
    assert.ok(html.includes('id="vuMeterDb"'));
    assert.ok(html.includes('id="vuClipLed"'));
    assert.ok(html.includes('id="camLivePreview"'));
    assert.ok(html.includes('id="camMaskSelect"'));
    assert.ok(html.includes('id="camPipPosition"'));
    assert.ok(html.includes('id="camPipScale"'));
  });

  test('src/styles.css contém estilos para VU Meter, timers, botões de gravação e PiP', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');
    assert.ok(css.includes('.rec-btn'));
    assert.ok(css.includes('.vu-meter-bar-outer'));
    assert.ok(css.includes('.vu-meter-bar-inner'));
    assert.ok(css.includes('.vu-clip-led'));
    assert.ok(css.includes('.rec-countdown-overlay'));
    assert.ok(css.includes('.webcam-preview-container'));
    assert.ok(css.includes('.cam-preview-video'));
  });

  test('src/preload.js expõe saveAudioRecording e saveVideoRecording na API de janela', () => {
    const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
    assert.ok(preload.includes('saveAudioRecording:'));
    assert.ok(preload.includes('saveVideoRecording:'));
  });

  test('src/renderer.js integra atalhos de gravação (r para locução e w para webcam)', () => {
    const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer.js'), 'utf8');
    assert.ok(renderer.includes('initTimelineRecording();'));
    assert.ok(renderer.includes('openVoiceoverModal'));
    assert.ok(renderer.includes('openWebcamModal'));
    assert.ok(renderer.includes("voiceover: { key: 'r'"));
    assert.ok(renderer.includes("webcam: { key: 'w'"));
  });

  // Limpeza
  try {
    fs.rmSync(testTempDir, { recursive: true, force: true });
  } catch (_) {}

  console.log(`\nFim dos testes da Fase 15: ${passed} passaram, ${failed} falharam.\n`);
  if (failed > 0) process.exit(1);
}

runTests();
