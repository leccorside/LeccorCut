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
- **Trilha de Áudio Independente & Masterização**: suporte para músicas e efeitos sonoros com visualização de **forma de onda sonora (*waveform*)**, controles de **Fade In / Fade Out**, início, duração, controle de volume dedicado, **Redução de Ruído de Fundo (*Denoise / afftdn*)** e **Normalização de Volume Inteligente EBU R128 (*loudnorm* a -14 LUFS)** para atingir o padrão ideal do YouTube, TikTok e Reels.
- **Marcadores na Linha do Tempo (Markers)**: adicione pinos/marcadores com o atalho `M` ou botão `🏷️ Marcador` para sincronizar batidas sonoras e cortes. Os marcadores atraem o snap magnético, navegam para a posição com 1 clique e podem ser excluídos com duplo clique.
- **Alinhamento Magnético (Snap)**: sistema magnético inteligente (`N` ou botão 🧲) que atrai cortes e posições de clipes, áudios, textos, overlays e marcadores para bordas de outros blocos, para o início (0s) ou para a agulha (playhead), com guia visual em tempo real.
- **Trilha de Texto / Legendas**: textos arrastáveis no preview com escala dinâmica, **animações de entrada (Fade In/Out, Deslizar / Slide Up, Pop / Zoom In)** e estilos avançados.

### 🤖 IA e Legendas Automáticas
- **Transcrição Local com Whisper (OpenAI / Transformers.js)**: reconhecimento de fala automático 100% offline (sem APIs pagas ou envio de dados para terceiros). Suporte a Português, Inglês e Espanhol.
- **Legendas Dinâmicas em Karaokê & Estilos Virais**:
  - *🎤 Karaokê (Word Highlight)*: a palavra ativa no exato instante da fala ganha destaque imediato com cor vibrante (amarelo ouro, ciano neon ou customizada), escala ampliada (1.15x) e brilho neon, com palavras passadas estáveis e futuras com opacidade suave de espera.
  - *📝 Palavra por Palavra (Acumulativo)*: as palavras surgem progressivamente na tela no ritmo exato do locutor, mantendo o texto cumulativo até a frase se completar.
  - *⚡ Estilo Viral / Hormozi (Single Word)*: exibe individualmente a palavra falada no momento em escala ampliada no centro da tela, maximizando a retenção de atenção para Shorts, TikTok e Reels.
- **Remoção de Fundo por IA Sem Tela Verde (*Smart Cutout*)**: recorte automático inteligente de pessoas, objetos e produtos com transparência alfa (PNG), sem precisar de chroma key verde.
  - *Modelo de Segmentação Neural*: processamento local com modelo de ponta (`briaai/RMBG-1.4`) via Transformers.js com canal alfa de alta precisão.
  - *Integração Direta em PiP*: transforme qualquer foto, vídeo ou clipe em sobreposição transparente para efeitos de reação, montagem e colagem com 1 clique.
  - *Fallback Adaptativo Instantâneo*: mecanismo de redundância automática que garante recorte mesmo sem conexão ou em máquinas mais modestas.
- **Importação de Legendas `.srt`**: integração instantânea de arquivos de legendas prévios, com fatiamento e sincronização automática de palavras.
- **Estilização em Massa**: configure fonte, caixa de fundo com transparência, contorno, cor do texto, cor de destaque do karaokê, negrito, animações e posição de uma legenda e aplique a **todas as legendas com 1 clique**.

### 🎨 Efeitos, Ajustes e Transições
- **Enquadramento Inteligente & Desfoque de Fundo (*Canvas Blur*)**: elimine as barras pretas ao converter vídeos horizontais (16:9) para verticais (9:16 - TikTok/Shorts) ou quadrados (1:1). Escolha entre:
  - *Ajustar*: proporção original com margens pretas.
  - *Desfoque de Fundo*: o próprio vídeo é espelhado no fundo em tela cheia com desfoque gaussiano suave e contraste balanceado, mantendo o conteúdo original nítido no centro.
  - *Preencher*: corte inteligente com preenchimento total do quadro (*object-fit: cover*).
- **Curvas de Velocidade (Speed Ramping)**: controle de aceleração e desaceleração dinâmica com presets profissionais inspirados nas melhores edições:
  - *⚡ Heroico*: aceleração inicial (2.2x) → câmera lenta cinematográfica no clímax da cena (0.4x) → aceleração de fechamento (2.2x).
  - *💥 Bala (Bullet)*: velocidade veloz de aproximação (3.0x) → desaceleração ultra dramática em super slow motion (0.35x) → retorno para velocidade padrão (1.0x).
  - *🎬 Montagem*: ritmo alternado e dinâmico (2.5x → 0.5x → 2.5x → 0.5x) ideal para sincronizar com batidas de música.
  - *⏩ Flash In*: entrada acelerada com impacto (3.0x) suavizando para velocidade normal (1.0x).
  - *🏎️ Flash Out*: reprodução em tempo real que acelera repentinamente no final (3.0x) para transições energéticas.
  - *Preview Visual com Gráfico Vetorial (SVG)*: visualização em tempo real da curva de velocidade no painel de propriedades, badge no clipe da timeline e processamento fiel tanto no preview instantâneo quanto na renderização via `setpts` e encadeamento suave `atempo` no FFmpeg.
- **Transições Suaves entre Clipes**: `fade`, `dissolve`, `wipeleft`, `slideleft`, `circleopen`, `pixelize` processados via `xfade`/`acrossfade`.
- **Filtros e Presets de Cor**: `sepia`, `vintage`, `warm`, `cool`, `cinematic`, `vivid`.
- **Efeito Vinheta Cinematográfica**: escurecimento elegante das bordas do vídeo com preview instantâneo e processamento nativo FFmpeg.
- **Ajustes Finos de Imagem e Áudio**: brilho, contraste, saturação, desfoque gaussiano, preto e branco (P&B), velocidade linear contínua (0.25x até 4x), redução de ruído de chiado e normalização de volume.
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
| `←` / `→` | Navegar 1 quadro para trás / frente (`Shift`: 1 segundo) |
| `↑` / `↓` | Pular para o ponto de corte ou marcador anterior / próximo |
| `J` / `K` / `L` | Retroceder 2s / Pausar / Avançar 2s (Shuttle) |
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
