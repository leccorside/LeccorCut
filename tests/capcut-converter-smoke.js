const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { capcutToLeccor, leccorToCapcut, parseTimeUs, toTimeUs } = require('../src/capcutConverter');

console.log('🧪 Iniciando teste unitário do conversor de projetos CapCut...');

// 1. Testes de conversão temporal (microsegundos)
assert.strictEqual(parseTimeUs(1000000), 1);
assert.strictEqual(parseTimeUs(7400000), 7.4);
assert.strictEqual(toTimeUs(7.4), 7400000);
assert.strictEqual(toTimeUs(0), 0);
console.log('  ✓ Conversões de tempo em microsegundos validadas');

// 2. Teste sintético de conversão CapCut -> LeccorCut
const mockCapcut = {
  id: 'test_project_1',
  fps: 30,
  canvas_config: { width: 1080, height: 1920, ratio: '9:16' },
  materials: {
    videos: [
      { id: 'v1', material_name: 'video1.mp4', path: 'C:/videos/video1.mp4', duration: 10000000 }
    ],
    audios: [
      { id: 'a1', name: 'audio1.mp3', path: 'C:/audios/audio1.mp3', duration: 30000000 }
    ],
    texts: [
      { id: 't1', content: JSON.stringify({ text: 'Olá Mundo' }) }
    ],
    speeds: []
  },
  tracks: [
    {
      type: 'video',
      segments: [
        {
          material_id: 'v1',
          speed: 1,
          volume: 0.8,
          target_timerange: { start: 0, duration: 5000000 },
          source_timerange: { start: 1000000, duration: 5000000 }
        }
      ]
    },
    {
      type: 'audio',
      segments: [
        {
          material_id: 'a1',
          speed: 1,
          volume: 0.5,
          target_timerange: { start: 0, duration: 15000000 },
          source_timerange: { start: 0, duration: 15000000 }
        }
      ]
    },
    {
      type: 'text',
      segments: [
        {
          material_id: 't1',
          target_timerange: { start: 1000000, duration: 3000000 }
        }
      ]
    }
  ]
};

const leccorState = capcutToLeccor(mockCapcut);
assert.strictEqual(leccorState.clips.length, 1, 'Deve ter 1 clipe de vídeo');
assert.strictEqual(leccorState.clips[0].name, 'video1.mp4');
assert.strictEqual(leccorState.clips[0].in, 1, 'In deve ser 1s');
assert.strictEqual(leccorState.clips[0].duration, 5, 'Duração deve ser 5s');
assert.strictEqual(leccorState.audios.length, 1, 'Deve ter 1 trilha de áudio');
assert.strictEqual(leccorState.audios[0].duration, 15);
assert.strictEqual(leccorState.texts.length, 1, 'Deve ter 1 texto');
assert.strictEqual(leccorState.texts[0].text, 'Olá Mundo');
assert.strictEqual(leccorState.settings.aspect, '9:16');
console.log('  ✓ Conversão CapCut -> LeccorCut validada');

// 3. Teste de ida e volta LeccorCut -> CapCut
const exportedCapcut = leccorToCapcut(leccorState);
assert.strictEqual(exportedCapcut.canvas_config.width, 1080);
assert.strictEqual(exportedCapcut.canvas_config.height, 1920);
assert.strictEqual(exportedCapcut.tracks.length, 3);
assert.strictEqual(exportedCapcut.tracks[0].type, 'video');
assert.strictEqual(exportedCapcut.tracks[1].type, 'audio');
assert.strictEqual(exportedCapcut.tracks[2].type, 'text');
assert.strictEqual(exportedCapcut.tracks[0].segments[0].target_timerange.duration, 5000000);
console.log('  ✓ Conversão reversa LeccorCut -> CapCut validada');

// 4. Teste em projeto real se disponível
const realDraft = 'C:\\Users\\Johnathan Amorim\\AppData\\Local\\CapCut\\User Data\\Projects\\com.lveditor.draft\\0923\\draft_content.json';
if (fs.existsSync(realDraft)) {
  const realData = JSON.parse(fs.readFileSync(realDraft, 'utf8'));
  const converted = capcutToLeccor(realData);
  assert.strictEqual(converted.clips.length, 30);
  assert.strictEqual(converted.audios.length, 7);
  console.log('  ✓ Projeto real CapCut (0923) importado com sucesso (30 clipes, 7 áudios)');
}

console.log('🎉 Todos os testes de conversão CapCut passaram com 100% de sucesso!');
