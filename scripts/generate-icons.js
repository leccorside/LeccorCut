const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('ffmpeg-static');

const buildDir = path.join(__dirname, '..', 'build');
if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

const pngPath = path.join(buildDir, 'icon.png');
const icoPath = path.join(buildDir, 'icon.ico');

// Gera imagem 512x512 com fundo escuro elegante (#0e0f14), bordas e marca 'LC'
const fontPath = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'impact.ttf').replace(/\\/g, '/').replace(/:/g, '\\:');
const filter = [
  'color=c=0x0e0f14:size=512x512:duration=1',
  'drawbox=x=16:y=16:w=480:h=480:color=0x2a2e3f:t=fill',
  'drawbox=x=32:y=32:w=448:h=448:color=0x171923:t=fill',
  'drawbox=x=48:y=48:w=416:h=416:color=0x00e5c3:t=4',
  `drawtext=text='LC':fontfile='${fontPath}':fontsize=210:fontcolor=0x00e5c3:x=(w-text_w)/2:y=(h-text_h)/2-18`,
  `drawtext=text='CUT':fontfile='${fontPath}':fontsize=76:fontcolor=0x7c5cff:x=(w-text_w)/2:y=(h-text_h)/2+110`
].join(',');

execFileSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', filter, '-frames:v', '1', pngPath]);
console.log('PNG gerado em:', pngPath, `(${fs.statSync(pngPath).size} bytes)`);

execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', pngPath, '-vf', 'scale=256:256', icoPath]);
console.log('ICO gerado em:', icoPath, `(${fs.statSync(icoPath).size} bytes)`);
