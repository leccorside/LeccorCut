'use strict';
/**
 * tests/phase12-smoke.js — Testes Automatizados da Fase 12
 * Áudio Avançado, Voice Changers, Pitch Shifter, EQ 10 Bandas e Separação em 4 Stems
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  VOICE_EFFECTS,
  EQ10_FREQUENCIES,
  getVoiceEffectFilter,
  buildPitchShiftFilter,
  buildEq10Filter,
  buildCompressorFilter,
  appendAdvancedAudioFilters,
  extractWaveformData,
  separateFourStems
} = require('../src/audioAdvanced');

const { buildFfmpeg, buildAudioOnlyFfmpeg } = require('../src/ffmpegBuilder');

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
  console.log('\n--- Início dos Testes da Fase 12: Áudio Avançado, Voice Changers e Separação Neural ---\n');

  // ── 1. Testes de Moduladores de Efeito de Voz (Voice Changers) ─────────────
  test('VOICE_EFFECTS contém todos os presets essenciais', () => {
    assert(VOICE_EFFECTS.none !== undefined, 'Deve ter preset none');
    assert(VOICE_EFFECTS.deep_monster !== undefined, 'Deve ter preset deep_monster');
    assert(VOICE_EFFECTS.chipmunk !== undefined, 'Deve ter preset chipmunk');
    assert(VOICE_EFFECTS.robot !== undefined, 'Deve ter preset robot');
    assert(VOICE_EFFECTS.megaphone !== undefined, 'Deve ter preset megaphone');
    assert(VOICE_EFFECTS.space_echo !== undefined, 'Deve ter preset space_echo');
  });

  test('getVoiceEffectFilter retorna filtros válidos ou vazio para none', () => {
    assert.strictEqual(getVoiceEffectFilter('none'), '');
    assert.strictEqual(getVoiceEffectFilter('invalid_effect'), '');

    const deepFilt = getVoiceEffectFilter('deep_monster');
    assert(deepFilt.includes('asetrate='), 'Voz grave deve conter asetrate');
    assert(deepFilt.includes('atempo='), 'Voz grave deve compensar tempo com atempo');

    const chipFilt = getVoiceEffectFilter('chipmunk');
    assert(chipFilt.includes('asetrate='), 'Voz chipmunk deve conter asetrate');

    const robotFilt = getVoiceEffectFilter('robot');
    assert(robotFilt.includes('flanger') || robotFilt.includes('tremolo'), 'Voz robot deve ter modulação');

    const megaphoneFilt = getVoiceEffectFilter('megaphone');
    assert(megaphoneFilt.includes('highpass=') && megaphoneFilt.includes('lowpass='), 'Megafone deve ter passa-faixa');

    const echoFilt = getVoiceEffectFilter('space_echo');
    assert(echoFilt.includes('aecho='), 'Eco espacial deve ter filtro aecho');
  });

  // ── 2. Testes de Pitch Shifter Contínuo ────────────────────────────────────
  test('buildPitchShiftFilter lida corretamente com tom 0 (neutro)', () => {
    assert.strictEqual(buildPitchShiftFilter(0), '');
    assert.strictEqual(buildPitchShiftFilter('0'), '');
  });

  test('buildPitchShiftFilter calcula razões e compensações para semitons positivos e negativos', () => {
    const upShift = buildPitchShiftFilter(2);
    assert(upShift.includes('asetrate='), 'Deve conter asetrate para pitch positivo');
    assert(upShift.includes('atempo='), 'Deve compensar com atempo para manter duração exata');
    assert(upShift.includes('aresample=44100'), 'Deve reamostrar para taxa original');

    const downShift = buildPitchShiftFilter(-5);
    assert(downShift.includes('asetrate='), 'Deve conter asetrate para pitch negativo');
    assert(downShift.includes('atempo='), 'Deve conter atempo');
  });

  test('buildPitchShiftFilter limita semitons entre -12 e +12 (clamp)', () => {
    const extremeUp = buildPitchShiftFilter(24);
    const clampUp = buildPitchShiftFilter(12);
    assert.strictEqual(extremeUp, clampUp, 'Pitch > 12 deve ser clampado para +12');

    const extremeDown = buildPitchShiftFilter(-36);
    const clampDown = buildPitchShiftFilter(-12);
    assert.strictEqual(extremeDown, clampDown, 'Pitch < -12 deve ser clampado para -12');
  });

  // ── 3. Testes do Equalizador Paramétrico de 10 Bandas (EQ10) ───────────────
  test('EQ10_FREQUENCIES possui exatamente as 10 frequências ISO padrão', () => {
    assert.strictEqual(EQ10_FREQUENCIES.length, 10);
    assert.deepStrictEqual(EQ10_FREQUENCIES, [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]);
  });

  test('buildEq10Filter gera cadeia de filtros equalizer com array ou objeto', () => {
    const arrayGains = [3, 2, 0, 0, 0, 4, 0, 0, -2, -5];
    const filtArr = buildEq10Filter(arrayGains);
    assert(filtArr.includes('equalizer=f=31:width_type=o:width=1.0:g=3'));
    assert(filtArr.includes('equalizer=f=62:width_type=o:width=1.0:g=2'));
    assert(filtArr.includes('equalizer=f=1000:width_type=o:width=1.0:g=4'));
    assert(filtArr.includes('equalizer=f=8000:width_type=o:width=1.0:g=-2'));
    assert(filtArr.includes('equalizer=f=16000:width_type=o:width=1.0:g=-5'));

    const objGains = { '125': 4, '2000': -3 };
    const filtObj = buildEq10Filter(objGains);
    assert(filtObj.includes('equalizer=f=125:width_type=o:width=1.0:g=4'));
    assert(filtObj.includes('equalizer=f=2000:width_type=o:width=1.0:g=-3'));
  });

  test('buildEq10Filter ignora ganhos neutros (0 dB)', () => {
    const flatGains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const filtFlat = buildEq10Filter(flatGains);
    assert.strictEqual(filtFlat, '', 'Ganhos todos 0 devem produzir filtro vazio');
  });

  // ── 4. Testes de Compressor Dinâmico ───────────────────────────────────────
  test('buildCompressorFilter gera acompressor quando ativado', () => {
    assert.strictEqual(buildCompressorFilter(false), '');
    const compFilt = buildCompressorFilter(true);
    assert(compFilt.includes('acompressor='), 'Deve conter o filtro acompressor do FFmpeg');
    assert(compFilt.includes('threshold='), 'Deve configurar threshold');
    assert(compFilt.includes('ratio='), 'Deve configurar ratio');
  });

  // ── 5. Testes de appendAdvancedAudioFilters e Integração no ffmpegBuilder ───
  test('appendAdvancedAudioFilters adiciona voz, pitch, eq10 e compressor em baseAf', () => {
    const item = {
      voiceEffect: 'robot',
      pitchShift: 3,
      eq10: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      compressor: true
    };
    const combined = appendAdvancedAudioFilters('volume=1.0', item);
    assert(combined.includes('volume=1.0'));
    assert(combined.includes('flanger') || combined.includes('tremolo'));
    assert(combined.includes('asetrate='));
    assert(combined.includes('equalizer=f=31'));
    assert(combined.includes('acompressor='));
  });

  test('buildFfmpeg integra filtros avançados de áudio para clipes e faixas secundárias', () => {
    const project = {
      clips: [
        {
          id: 1,
          path: 'C:/dummy/video1.mp4',
          duration: 5,
          in: 0,
          hasAudio: true,
          voiceEffect: 'deep_monster',
          pitchShift: -2,
          compressor: true
        }
      ],
      audios: [
        {
          id: 2,
          path: 'C:/dummy/music.mp3',
          start: 0,
          in: 0,
          duration: 5,
          max: 10,
          volume: 0.8,
          voiceEffect: 'chipmunk',
          eq10: [0, 0, 0, 0, 0, 3, 0, 0, 0, 0]
        }
      ],
      texts: [],
      overlays: []
    };

    const res = buildFfmpeg(project, 'C:/dummy/out.mp4');
    const args = res.args;
    const filterComplex = args[args.indexOf('-filter_complex') + 1];

    assert(filterComplex.includes('asetrate='), 'filter_complex deve conter pitch shift dos clipes');
    assert(filterComplex.includes('acompressor='), 'filter_complex deve conter compressor do clipe');
    assert(filterComplex.includes('equalizer=f=1000'), 'filter_complex deve conter equalizador do áudio');
  });

  test('buildAudioOnlyFfmpeg integra filtros avançados em exportação de áudio', () => {
    const project = {
      clips: [],
      audios: [
        {
          id: 1,
          path: 'C:/dummy/track.mp3',
          start: 0,
          in: 0,
          duration: 8,
          max: 15,
          volume: 1,
          voiceEffect: 'megaphone',
          pitchShift: 1,
          compressor: true
        }
      ],
      texts: [],
      overlays: []
    };

    const res = buildAudioOnlyFfmpeg(project, 'C:/dummy/audio_out.wav');
    const args = res.args;
    const filterComplex = args[args.indexOf('-filter_complex') + 1];

    assert(filterComplex.includes('highpass=f=400') || filterComplex.includes('highpass=400'), 'Deve conter passa-alta do megafone');
    assert(filterComplex.includes('lowpass=f=3000') || filterComplex.includes('lowpass=3000'), 'Deve conter passa-baixa do megafone');
    assert(filterComplex.includes('asetrate='), 'Deve conter pitch shift');
    assert(filterComplex.includes('acompressor='), 'Deve conter compressor dinâmico');
  });

  // ── 6. Testes de Separação em 4 Stems ──────────────────────────────────────
  await asyncTest('separateFourStems rejeita quando arquivo de entrada não existe', async () => {
    try {
      await separateFourStems('ffmpeg', 'C:/caminho/inexistente.mp4', 'C:/dummy/out');
      assert.fail('Deveria ter lançado erro');
    } catch (err) {
      assert(err.message.includes('não encontrado'), 'Mensagem de erro deve indicar arquivo não encontrado');
    }
  });

  // ── 7. Testes de Interface e Integração com index.html, styles.css e preload ──
  test('src/index.html contém todos os seletores e containers da Fase 12', () => {
    const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
    assert(html.includes('id="tabAudioPro"'), 'Deve conter o botão de aba tabAudioPro');
    assert(html.includes('id="audioProView"'), 'Deve conter o painel audioProView');
    assert(html.includes('id="voiceEffectSelect"'), 'Deve conter seletor de efeitos de voz');
    assert(html.includes('id="pitchShiftRange"'), 'Deve conter slider de pitch shift');
    assert(html.includes('id="eq10Container"'), 'Deve conter container do EQ10');
    assert(html.includes('id="audioCompressorCheck"'), 'Deve conter checkbox do compressor');
    assert(html.includes('id="btnSeparate4Stems"'), 'Deve conter botão de separar em 4 stems');
  });

  test('src/styles.css possui as classes de estilo para equalizador e áudio pro', () => {
    const css = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');
    assert(css.includes('.audio-pro-section'), 'Deve estilizar .audio-pro-section');
    assert(css.includes('.eq10-wrap'), 'Deve estilizar .eq10-wrap');
    assert(css.includes('.eq10-slider'), 'Deve estilizar .eq10-slider');
    assert(css.includes('.stem4-progress-bar'), 'Deve estilizar barra de progresso dos stems');
  });

  test('src/preload.js expõe todos os métodos IPC da Fase 12', () => {
    const preload = fs.readFileSync(path.join(__dirname, '../src/preload.js'), 'utf8');
    assert(preload.includes('getVoiceEffects:'), 'Deve expor getVoiceEffects');
    assert(preload.includes('getEq10Frequencies:'), 'Deve expor getEq10Frequencies');
    assert(preload.includes('getWaveformData:'), 'Deve expor getWaveformData');
    assert(preload.includes('separateFourStems:'), 'Deve expor separateFourStems');
    assert(preload.includes('onStem4Progress:'), 'Deve expor onStem4Progress');
  });

  test('src/main.js possui os handlers IPC registrados para a Fase 12', () => {
    const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
    assert(main.includes("ipcMain.handle('get-voice-effects'"), 'Deve registrar get-voice-effects');
    assert(main.includes("ipcMain.handle('get-eq10-frequencies'"), 'Deve registrar get-eq10-frequencies');
    assert(main.includes("ipcMain.handle('get-waveform-data'"), 'Deve registrar get-waveform-data');
    assert(main.includes("ipcMain.handle('separate-four-stems'"), 'Deve registrar separate-four-stems');
  });

  console.log(`\n--- Fim dos Testes da Fase 12: ${passed} passaram, ${failed} falharam ---\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
