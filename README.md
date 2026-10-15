# LeccorCut 🎬

> Editor de vídeo desktop moderno, independente e de alta performance, construído com **Electron**, **FFmpeg** e **IA Local (Whisper)**.

---

## ✨ Recursos Implementados

### 🎞️ Linha do Tempo Multi-Trilha
- **Controles de Trilha (Track Headers)**: cabeçalhos laterais dedicados com botões de visibilidade (👁) e mute (🔊) para a trilha de Vídeo Principal; visibilidade (👁) para Sobreposições (PiP); visibilidade (👁) para Legendas/Texto; e controles de Mute (🔊) e Modo Solo (🎧) para a trilha de Áudio Independente.
- **Congelar Quadro (Freeze Frame)**: pause a agulha em qualquer instante e congele o quadro atual (`F` ou botão ❄), criando um clipe de 3 segundos com thumbnail e filtros preservados.
- **Separar Áudio do Vídeo**: desvincule a faixa de áudio de qualquer vídeo da trilha principal com 1 clique, movendo-a diretamente para a trilha de áudio independente com visualização de waveform.
- **Trilha Principal de Vídeo**: corte preciso (`S`), reorganização por drag-and-drop, redimensionamento/trim pelas alças laterais (`l` e `r`).
- **Trilha de Sobreposição (PiP - Picture-in-Picture)**: suporte para múltiplos vídeos e imagens sobrepostos, ajuste de escala (10% a 100%), posicionamento contínuo, opacidade, **rotação angular (-180° a +180°)**, **espelhamento horizontal (Flip)**, **animações de entrada e movimento** (*Fade In/Out, Deslizar da Esquerda, Deslizar da Direita, Zoom In, Flutuar / Sticker Float*) e **suavização cinemática (*Smoothstep*)** na interpolação de posição.
- **Chroma Key**: remoção de fundo por cor com seletor de tolerância para vídeos e fotos em PiP.
- **Trilha de Áudio Independente**: suporte para músicas e efeitos sonoros com visualização de **forma de onda sonora (*waveform*)**, controles de **Fade In / Fade Out**, início, duração e controle de volume dedicado.
- **Marcadores na Linha do Tempo (Markers)**: adicione pinos/marcadores com o atalho `M` ou botão `🏷️ Marcador` para sincronizar batidas sonoras e cortes. Os marcadores atraem o snap magnético, navegam para a posição com 1 clique e podem ser excluídos com duplo clique.
- **Alinhamento Magnético (Snap)**: sistema magnético inteligente (`N` ou botão 🧲) que atrai cortes e posições de clipes, áudios, textos, overlays e marcadores para bordas de outros blocos, para o início (0s) ou para a agulha (playhead), com guia visual em tempo real.
- **Trilha de Texto / Legendas**: textos arrastáveis no preview com escala dinâmica, **animações de entrada (Fade In/Out, Deslizar / Slide Up, Pop / Zoom In)** e estilos avançados.

### 🤖 IA e Legendas Automáticas
- **Transcrição Local com Whisper (OpenAI / Transformers.js)**: reconhecimento de fala automático 100% offline (sem APIs pagas ou envio de dados para terceiros). Suporte a Português, Inglês e Espanhol.
- **Importação de Legendas `.srt`**: integração instantânea de arquivos de legendas prévios.
- **Estilização em Massa**: configure fonte, caixa de fundo com transparência, contorno, cor, negrito, animações e posição de uma legenda e aplique a **todas as legendas com 1 clique**.

### 🎨 Efeitos, Ajustes e Transições
- **Enquadramento Inteligente & Desfoque de Fundo (*Canvas Blur*)**: elimine as barras pretas ao converter vídeos horizontais (16:9) para verticais (9:16 - TikTok/Shorts) ou quadrados (1:1). Escolha entre:
  - *Ajustar*: proporção original com margens pretas.
  - *Desfoque de Fundo*: o próprio vídeo é espelhado no fundo em tela cheia com desfoque gaussiano suave e contraste balanceado, mantendo o conteúdo original nítido no centro.
  - *Preencher*: corte inteligente com preenchimento total do quadro (*object-fit: cover*).
- **Transições Suaves entre Clipes**: `fade`, `dissolve`, `wipeleft`, `slideleft`, `circleopen`, `pixelize` processados via `xfade`/`acrossfade`.
- **Filtros e Presets de Cor**: `sepia`, `vintage`, `warm`, `cool`, `cinematic`, `vivid`.
- **Efeito Vinheta Cinematográfica**: escurecimento elegante das bordas do vídeo com preview instantâneo e processamento nativo FFmpeg.
- **Ajustes Finos de Imagem**: brilho, contraste, saturação, desfoque gaussiano, preto e branco (P&B) e velocidade de reprodução (0.5x até 2x com ajuste de pitch).
- **Transformações**: espelhamento horizontal, vertical, rotações (90°, 180°, 270°) e zoom digital.

### 📐 Formatos e Exportação
- **Predefinições Rápidas de Plataforma (Quick Presets)**: configuração instantânea em 1 clique para TikTok / Reels / Shorts (9:16), YouTube Full HD / 4K (16:9), Instagram Feed (1:1) e Retrato (4:5).
- **Proporções de Tela Flexíveis**: 16:9 (Horizontal/YouTube), 9:16 (Vertical/TikTok/Reels/Shorts), 1:1 (Quadrado/Feed) e 4:5.
- **Resoluções e Taxas de Quadro**: 720p, 1080p, 1440p (2K) e 2160p (4K), com 24, 30 ou 60 FPS.
- **Renderização Rápida via FFmpeg Nativo**: pipeline de filtros otimizado em C++ (`filter_complex`), com codificação H.264/AAC e suporte aos filtros e estados de mute/visibilidade de cada trilha.
- **Histórico Completo de Ações**: `Ctrl+Z` (Desfazer) e `Ctrl+Y` / `Ctrl+Shift+Z` (Refazer) com retenção de até 100 estados.
- **Projetos Salváveis**: persistência de todo o estado (inclusive trilhas e marcadores) em arquivos `.lccut`.

---

## ⌨️ Atalhos de Teclado

| Atalho | Ação |
| :--- | :--- |
| `Espaço` | Reproduzir / Pausar timeline |
| `S` | Dividir clipe selecionado na posição da agulha |
| `F` | Congelar quadro atual em clipe estático (3s) |
| `M` | Adicionar ou alternar marcador na agulha |
| `N` | Alternar Alinhamento Magnético (Snap On/Off) |
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
