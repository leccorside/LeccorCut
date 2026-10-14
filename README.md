# LeccorCut 🎬

> Editor de vídeo desktop moderno, independente e de alta performance, construído com **Electron**, **FFmpeg** e **IA Local (Whisper)**.

---

## ✨ Recursos Implementados

### 🎞️ Linha do Tempo Multi-Trilha
- **Trilha Principal de Vídeo**: corte preciso (`S`), reorganização por drag-and-drop, redimensionamento/trim pelas alças laterais (`l` e `r`).
- **Trilha de Sobreposição (PiP - Picture-in-Picture)**: suporte para múltiplos vídeos e imagens sobrepostos, ajuste de escala (10% a 100%), posicionamento contínuo, opacidade e animação linear de posição (*keyframe de início ao fim*).
- **Chroma Key**: remoção de fundo por cor com seletor de tolerância para vídeos e fotos em PiP.
- **Trilha de Áudio Independente**: suporte para músicas e efeitos sonoros com visualização de **forma de onda sonora (*waveform*)** gerada via FFmpeg, início, duração e controle de volume dedicado.
- **Trilha de Texto / Legendas**: textos arrastáveis no preview com escala dinâmica e estilos avançados.

### 🤖 IA e Legendas Automáticas
- **Transcrição Local com Whisper (OpenAI / Transformers.js)**: reconhecimento de fala automático 100% offline (sem APIs pagas ou envio de dados para terceiros). Suporte a Português, Inglês e Espanhol.
- **Importação de Legendas `.srt`**: integração instantânea de arquivos de legendas prévios.
- **Estilização em Massa**: configure fonte, caixa de fundo com transparência, contorno, cor, negrito, fade in/out e posição de uma legenda e aplique a **todas as legendas com 1 clique**.

### 🎨 Efeitos, Ajustes e Transições
- **Transições Suaves entre Clipes**: `fade`, `dissolve`, `wipeleft`, `slideleft`, `circleopen`, `pixelize` processados via `xfade`/`acrossfade`.
- **Filtros e Presets de Cor**: `sepia`, `vintage`, `warm`, `cool`, `cinematic`, `vivid`.
- **Ajustes Finos de Imagem**: brilho, contraste, saturação, desfoque gaussiano, preto e branco (P&B) e velocidade de reprodução (0.5x até 2x com ajuste de pitch).
- **Transformações**: espelhamento horizontal, vertical, rotações (90°, 180°, 270°) e zoom digital.

### 📐 Formatos e Exportação
- **Proporções de Tela Flexíveis**: 16:9 (Horizontal/YouTube), 9:16 (Vertical/TikTok/Reels/Shorts), 1:1 (Quadrado/Feed) e 4:5.
- **Resoluções e Taxas de Quadro**: 720p, 1080p, 1440p (2K) e 2160p (4K), com 24, 30 ou 60 FPS.
- **Renderização Rápida via FFmpeg Nativo**: pipeline de filtros otimizado em C++ (`filter_complex`), com codificação H.264/AAC.
- **Histórico Completo de Ações**: `Ctrl+Z` (Desfazer) e `Ctrl+Y` / `Ctrl+Shift+Z` (Refazer) com retenção de até 100 estados.
- **Projetos Salváveis**: persistência de todo o estado em arquivos `.lccut`.

---

## ⌨️ Atalhos de Teclado

| Atalho | Ação |
| :--- | :--- |
| `Espaço` | Reproduzir / Pausar timeline |
| `S` | Dividir clipe selecionado na posição da agulha |
| `Delete` | Excluir clipe, texto, áudio ou overlay selecionado |
| `Ctrl + Z` | Desfazer última alteração |
| `Ctrl + Y` ou `Ctrl + Shift + Z` | Refazer alteração |

---

## 🚀 Como Executar

### Pré-requisitos
- [Node.js](https://nodejs.org/) (versão 18 ou superior recomendada)
- Git

### Instalação
```bash
# Clone o repositório
git clone https://github.com/leccorside/LeccorCut.git
cd LeccorCut

# Instale as dependências
npm install
```

### Rodando em modo de Desenvolvimento
```bash
npm start
```

### Teste de Exportação Automatizado (Smoke Test)
Gera mídias sintéticas via FFmpeg e valida o pipeline completo de exportação em poucos segundos:
```bash
npm test
```

### Gerar Instalador para Windows (.exe)
```bash
npm run dist
```
O instalador NSIS completo será gerado dentro da pasta `dist/`.

---

## 🏗️ Estrutura do Projeto

```text
LeccorCut/
├── src/
│   ├── main.js             # Processo principal do Electron, IPCs, janelas e modelos
│   ├── preload.js          # Context bridge segura entre Node e Renderer
│   ├── index.html          # Interface de usuário (Layout dark mode)
│   ├── styles.css          # Design system com tokens HSL e animações
│   ├── renderer.js         # Lógica da timeline, preview, estado reativo e interações
│   └── ffmpegBuilder.js    # Montador do filter_complex para exportação precisa
├── tests/
│   └── export-smoke.js     # Teste automatizado de renderização FFmpeg
├── package.json            # Metadados, scripts e dependências
└── .gitignore              # Ignora builds, node_modules e mídias temporárias
```

---

## 📄 Licença
Distribuído sob licença aberta para desenvolvimento e uso próprio.
