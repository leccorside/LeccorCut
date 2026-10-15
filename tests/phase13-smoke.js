'use strict';
/**
 * tests/phase13-smoke.js — Testes Automatizados da Fase 13
 * Multi-Trilhas Ilimitadas e Keyframing Universal Livre
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  EASING_FUNCTIONS,
  interpolateKeyframes,
  evaluateItemKeyframes,
  setKeyframe,
  removeKeyframe,
  hasKeyframeAtTime,
  buildFfmpegExpression,
  createCompoundClip,
  expandCompoundClip,
  createTracksState,
  isTrackLocked,
  toggleTrackLock
} = require('../src/keyframeManager');

const { buildFfmpeg } = require('../src/ffmpegBuilder');
const { appendAdvancedAudioFilters } = require('../src/audioAdvanced');

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
  console.log('\n--- Início dos Testes da Fase 13: Multi-Trilhas Ilimitadas e Keyframing Universal ---\n');

  // ── 1. Interpolação Matemática e Curvas de Easing ───────────────────────────
  test('EASING_FUNCTIONS possui todas as curvas suportadas', () => {
    assert(typeof EASING_FUNCTIONS.linear === 'function', 'Deve possuir linear');
    assert(typeof EASING_FUNCTIONS.ease_in === 'function', 'Deve possuir ease_in');
    assert(typeof EASING_FUNCTIONS.ease_out === 'function', 'Deve possuir ease_out');
    assert(typeof EASING_FUNCTIONS.smooth === 'function', 'Deve possuir smooth');
    assert(typeof EASING_FUNCTIONS.bezier === 'function', 'Deve possuir bezier');

    assert.strictEqual(EASING_FUNCTIONS.linear(0), 0);
    assert.strictEqual(EASING_FUNCTIONS.linear(1), 1);
    assert.strictEqual(EASING_FUNCTIONS.linear(0.5), 0.5);

    assert.strictEqual(EASING_FUNCTIONS.ease_in(0), 0);
    assert.strictEqual(EASING_FUNCTIONS.ease_in(1), 1);
    assert(EASING_FUNCTIONS.ease_in(0.5) < 0.5, 'Ease-in deve acelerar (valor menor que 0.5 na metade)');

    assert.strictEqual(EASING_FUNCTIONS.ease_out(0), 0);
    assert.strictEqual(EASING_FUNCTIONS.ease_out(1), 1);
    assert(EASING_FUNCTIONS.ease_out(0.5) > 0.5, 'Ease-out deve desacelerar (valor maior que 0.5 na metade)');
  });

  test('interpolateKeyframes calcula valores intermediários com precisão', () => {
    // Casos de borda
    assert.strictEqual(interpolateKeyframes([], 2.5, 42), 42);
    assert.strictEqual(interpolateKeyframes(null, 2.5, 10), 10);

    const kfs = [
      { time: 1.0, value: 10, easing: 'linear' },
      { time: 3.0, value: 50, easing: 'linear' }
    ];

    // Antes do primeiro e depois do último
    assert.strictEqual(interpolateKeyframes(kfs, 0.5, 0), 10);
    assert.strictEqual(interpolateKeyframes(kfs, 5.0, 0), 50);

    // Exatamente nos keyframes
    assert.strictEqual(interpolateKeyframes(kfs, 1.0, 0), 10);
    assert.strictEqual(interpolateKeyframes(kfs, 3.0, 0), 50);

    // No meio exato (t = 2.0 -> progresso 0.5 -> 10 + 40 * 0.5 = 30)
    const midVal = interpolateKeyframes(kfs, 2.0, 0);
    assert(Math.abs(midVal - 30) < 0.001, `Esperava 30, recebeu ${midVal}`);
  });

  test('interpolateKeyframes respeita curvas ease_in e ease_out', () => {
    const kfEaseIn = [
      { time: 0, value: 0, easing: 'ease_in' },
      { time: 2, value: 100, easing: 'ease_in' }
    ];
    const valIn = interpolateKeyframes(kfEaseIn, 1.0, 0); // t=1 -> progress=0.5 -> 0.5^2 = 0.25 -> 25
    assert.strictEqual(valIn, 25, 'Ease-in na metade deve resultar em 25');

    const kfEaseOut = [
      { time: 0, value: 0, easing: 'ease_out' },
      { time: 2, value: 100, easing: 'ease_out' }
    ];
    const valOut = interpolateKeyframes(kfEaseOut, 1.0, 0); // t=1 -> progress=0.5 -> 0.5*(2-0.5) = 0.75 -> 75
    assert.strictEqual(valOut, 75, 'Ease-out na metade deve resultar em 75');
  });

  // ── 2. Gerenciamento e Manipulação de Keyframes ─────────────────────────────
  test('setKeyframe insere, atualiza e ordena keyframes cronologicamente', () => {
    const item = { id: 1, name: 'Overlay' };
    setKeyframe(item, 'scale', 2.0, 50);
    setKeyframe(item, 'scale', 0.5, 20);
    setKeyframe(item, 'scale', 4.0, 80);

    assert(Array.isArray(item.keyframes.scale), 'Deve inicializar array de escala');
    assert.strictEqual(item.keyframes.scale.length, 3);
    assert.strictEqual(item.keyframes.scale[0].time, 0.5);
    assert.strictEqual(item.keyframes.scale[1].time, 2.0);
    assert.strictEqual(item.keyframes.scale[2].time, 4.0);

    // Atualização de keyframe existente na mesma janela temporal
    setKeyframe(item, 'scale', 2.02, 65, 'ease_out');
    assert.strictEqual(item.keyframes.scale.length, 3, 'Não deve duplicar keyframe com tempo similar');
    assert.strictEqual(item.keyframes.scale[1].value, 65);
    assert.strictEqual(item.keyframes.scale[1].easing, 'ease_out');
  });

  test('removeKeyframe e hasKeyframeAtTime funcionam com tolerância correta', () => {
    const item = { id: 2, keyframes: { opacity: [{ time: 1.5, value: 0.8 }] } };

    assert.strictEqual(hasKeyframeAtTime(item, 'opacity', 1.51), true);
    assert.strictEqual(hasKeyframeAtTime(item, 'opacity', 2.0), false);
    assert.strictEqual(hasKeyframeAtTime(item, 'rotate', 1.5), false);

    const removed = removeKeyframe(item, 'opacity', 1.52);
    assert.strictEqual(removed, true, 'Deve remover com sucesso');
    assert.strictEqual(item.keyframes.opacity.length, 0);

    assert.strictEqual(hasKeyframeAtTime(item, 'opacity', 1.5), false);
  });

  test('evaluateItemKeyframes avalia todas as propriedades no tempo dado', () => {
    const item = {
      x: 0.2,
      y: 0.3,
      scale: 30,
      opacity: 1,
      keyframes: {
        x: [{ time: 0, value: 0 }, { time: 2, value: 1 }],
        opacity: [{ time: 0, value: 0 }, { time: 1, value: 1 }]
      }
    };

    const res = evaluateItemKeyframes(item, 1.0);
    assert.strictEqual(res.x, 0.5, 'x deve ter interpolado para 0.5');
    assert.strictEqual(res.opacity, 1.0, 'opacity deve ter interpolado para 1.0');
    assert.strictEqual(res.y, 0.3, 'y sem keyframe deve manter valor base');
    assert.strictEqual(res.scale, 30, 'scale sem keyframe deve manter valor base');
  });

  // ── 3. Conversão para Expressões Matemáticas do FFmpeg ───────────────────────
  test('buildFfmpegExpression gera comandos e expressões válidas de interpolação', () => {
    assert.strictEqual(buildFfmpegExpression(null, 10), '10');
    assert.strictEqual(buildFfmpegExpression([], 20), '20');

    // 1 único keyframe
    const singleKf = [{ time: 1.0, value: 45 }];
    assert.strictEqual(buildFfmpegExpression(singleKf, 0), '45');

    // Múltiplos keyframes com interpolação linear
    const kfs = [
      { time: 1.0, value: 0 },
      { time: 3.0, value: 100 }
    ];
    const expr = buildFfmpegExpression(kfs, 0);
    assert(expr.startsWith('if(lt(t,1)'), 'Deve conter condição de início lt(t, 1)');
    assert(expr.includes('(0+(100-0)*(t-1)/2)'), 'Deve conter fórmula de interpolação contínua');
    assert(expr.endsWith('100))'), 'Deve fechar com valor do último keyframe');
  });

  // ── 4. Clipes Compostos (Compound Clips) ───────────────────────────────────
  test('createCompoundClip agrupa múltiplos clipes preservando ordem e duração', () => {
    const clips = [
      { id: 10, name: 'Clipe B', start: 5, duration: 4 },
      { id: 9, name: 'Clipe A', start: 0, duration: 3 }
    ];

    const compound = createCompoundClip(clips, 'Meu Composto');
    assert(compound !== null);
    assert.strictEqual(compound.isCompound, true);
    assert.strictEqual(compound.name, 'Meu Composto');
    assert.strictEqual(compound.start, 0);
    assert.strictEqual(compound.duration, 9, 'Duração deve cobrir de 0 a 9s');
    assert.strictEqual(compound.originalClips.length, 2);
    assert.strictEqual(compound.originalClips[0].id, 9, 'Deve ordenar pelo início');
  });

  test('expandCompoundClip desagrupa restaurando offsets temporais com precisão', () => {
    const compound = {
      isCompound: true,
      start: 10, // movido 10s para frente na timeline
      originalClips: [
        { id: 1, name: 'Clipe 1', start: 0, duration: 3 },
        { id: 2, name: 'Clipe 2', start: 3, duration: 4 }
      ]
    };

    const restored = expandCompoundClip(compound);
    assert.strictEqual(restored.length, 2);
    assert.strictEqual(restored[0].start, 10, 'Clipe 1 deve iniciar em 10s');
    assert.strictEqual(restored[1].start, 13, 'Clipe 2 deve iniciar em 13s');
    assert.strictEqual(restored[0].duration, 3);
    assert.strictEqual(restored[1].duration, 4);
  });

  // ── 5. Bloqueio Individual de Trilhas (Track Lock) ──────────────────────────
  test('createTracksState e toggleTrackLock controlam cadeados corretamente', () => {
    const tracks = createTracksState();
    assert.strictEqual(tracks.video.locked, false);
    assert.strictEqual(tracks.overlay.locked, false);
    assert.strictEqual(tracks.text.locked, false);
    assert.strictEqual(tracks.audio.locked, false);

    assert.strictEqual(isTrackLocked(tracks, 'video'), false);
    const lockedNow = toggleTrackLock(tracks, 'video');
    assert.strictEqual(lockedNow, true);
    assert.strictEqual(isTrackLocked(tracks, 'video'), true);

    const unlocked = toggleTrackLock(tracks, 'video');
    assert.strictEqual(unlocked, false);
    assert.strictEqual(isTrackLocked(tracks, 'video'), false);
  });

  // ── 6. Integração com FFmpeg e Áudio Avançado ────────────────────────────────
  test('ffmpegBuilder injeta expressões dinâmicas para overlay com keyframes', () => {
    const proj = {
      clips: [{ path: 'test.mp4', in: 0, duration: 10 }],
      overlays: [{
        path: 'logo.png',
        start: 0,
        duration: 5,
        scale: 30,
        x: 0.1,
        y: 0.1,
        keyframes: {
          x: [{ time: 0, value: 0.1 }, { time: 2, value: 0.8 }],
          opacity: [{ time: 0, value: 0 }, { time: 1, value: 1 }]
        }
      }],
      texts: [],
      audios: [],
      tracks: { video: { visible: true }, overlay: { visible: true }, text: { visible: true }, audio: { mute: false } },
      settings: { aspect: '16:9', res: '1080', fps: '30', crf: '18' }
    };

    const cmd = buildFfmpeg(proj, 'out.mp4');
    const cmdStr = (cmd.args || []).join(' ');
    assert(cmdStr.includes('overlay='), 'Deve conter filtro de overlay');
    assert(cmdStr.includes('colorchannelmixer=aa='), 'Deve conter transparência dinâmica de keyframe de opacidade');
  });

  test('audioAdvanced aplica keyframes de volume dinâmico com eval=frame', () => {
    const audioItem = {
      volume: 1,
      keyframes: {
        volume: [
          { time: 0, value: 0 },
          { time: 2, value: 1 }
        ]
      }
    };

    const af = appendAdvancedAudioFilters('', audioItem);
    assert(af.includes('volume='), 'Deve conter filtro de volume');
    assert(af.includes("volume='eval=frame:volume=if(lt(t,"), 'Deve conter expressão eval=frame com if(lt(t,...))');
  });

  // ── 7. Validação de Arquivos de UI, HTML e CSS ──────────────────────────────
  test('src/index.html possui os botões de Keyframe, Composto e Track Locks', () => {
    const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf-8');
    assert(html.includes('id="btnKeyframe"'), 'Deve conter botão btnKeyframe');
    assert(html.includes('id="btnCompound"'), 'Deve conter botão btnCompound');
    assert(html.includes('id="thLockVideo"'), 'Deve conter cadeado de vídeo');
    assert(html.includes('id="thLockOverlay"'), 'Deve conter cadeado de overlay');
    assert(html.includes('id="thLockText"'), 'Deve conter cadeado de texto');
    assert(html.includes('id="thLockAudio"'), 'Deve conter cadeado de áudio');
  });

  test('src/styles.css possui as classes visuais da Fase 13', () => {
    const css = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf-8');
    assert(css.includes('.kf-btn'), 'Deve conter estilo .kf-btn');
    assert(css.includes('.compound-btn'), 'Deve conter estilo .compound-btn');
    assert(css.includes('.th-lock-btn'), 'Deve conter estilo .th-lock-btn');
    assert(css.includes('.track.locked'), 'Deve conter estilo .track.locked');
    assert(css.includes('.keyframe-diamond'), 'Deve conter estilo .keyframe-diamond');
    assert(css.includes('.btn-keyframe-prop'), 'Deve conter estilo .btn-keyframe-prop');
    assert(css.includes('.clip.compound'), 'Deve conter estilo .clip.compound');
  });

  test('src/renderer.js integra proteção de Track Lock e Keyframing', () => {
    const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer.js'), 'utf-8');
    assert(renderer.includes('isTrackLocked'), 'Deve conter isTrackLocked');
    assert(renderer.includes('toggleKeyframeAtPlayhead'), 'Deve conter toggleKeyframeAtPlayhead');
    assert(renderer.includes('toggleCompoundClipAction'), 'Deve conter toggleCompoundClipAction');
    assert(renderer.includes('renderClipKeyframes'), 'Deve conter renderClipKeyframes');
  });

  // ── Resumo Final ────────────────────────────────────────────────────────────
  console.log(`\n========================================`);
  console.log(`Total de testes: ${passed + failed}`);
  console.log(`Sucessos: ${passed}`);
  console.log(`Falhas: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
