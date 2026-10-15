# 📚 Documentação Técnica — Engenharia Reversa CapCut v9.6.0.4097

> Gerado via análise estática com REA v6.4.0 + extração manual de strings e recursos.

---

## 1. Identificação do Binário

| Campo | Valor |
|---|---|
| Produto | CapCut PC (`capcutpc_0`) |
| Versão completa | 9.6.0.4097 |
| Build type | `release` |
| Arquitetura | PE x86_64 (Windows) |
| SHA-256 launcher | `db0a1848273f0137d58717f6b226b570d1867536ac54f88367496a7eab00a70a` |
| Launcher real | `JianyingLauncher.exe` (nome interno) |

---

## 2. Estrutura de Instalação

```
C:\Users\...\AppData\Local\CapCut\Apps\
├── CapCut.exe               # Launcher bootstrap (4.97 MB)
├── uninst.exe               # Desinstalador (4.1 MB)
├── Configure.ini            # Config básica
├── ProductInfo.xml          # Metadados da versão e CID
└── 9.6.0.4097\              # Versão atual
    ├── [Executáveis]
    ├── [DLLs core]
    ├── cef\                 # Chromium Embedded Framework assets
    ├── data\                # ICU data (icudtl.dat 10MB)
    ├── plugins\             # Qt plugins (imageformats, platforms, qml)
    ├── Qt\, Qt5Compat\, QtQml\, QtQuick\
    ├── Resources\           # Assets, modelos IA, UI web
    ├── Service\             # Serviços auxiliares
    ├── Tools\               # Ferramentas auxiliares
    ├── VEAngle\             # ANGLE (OpenGL→D3D translator)
    ├── vm_sdk\              # VM SDK
    ├── x64\, x86\           # Bibliotecas nativas
    └── _internal\           # Dependências internas
```

---

## 3. Executáveis Principais

| Executável | Tamanho | Função |
|---|---|---|
| `bun.exe` | 107 MB | Runtime JavaScript embarcado (Bun runtime) |
| `CapCut.exe` (launcher) | 4.97 MB | Bootstrap — inicia a app principal |
| `VEDetector.exe` | 4.4 MB | Detector de ambiente/hardware |
| `VEHelper.exe` | 3.6 MB | Helper para operações nativas |
| `draft-converter.exe` | 4.6 MB | Conversor de projetos (drafts) |
| `feedbacktool.exe` | 5.0 MB | Ferramenta de feedback/report |
| `VECreator (como DLL)` | 271 MB | Engine principal de criação de vídeo |
| `parfait_crash_handler.exe` | 1.3 MB | Handler de crashes (Parfait framework) |
| `VECrashHandler.exe` | 2.1 MB | Handler de crashes do VE |
| `CapCutService.exe` | 1.5 MB | Serviço em background |
| `ttdaemon.exe` | 411 KB | Daemon de serviços TikTok |
| `push_detect.exe` | 74 KB | Telemetria/push notifications |
| `taskcontainer.exe` | 44 KB | Container de processos filhos |
| `minidump_stackwalk.exe` | 650 KB | Análise de crash dumps (formato Breakpad) |

---

## 4. DLLs Críticas (Core Engine)

| DLL | Tamanho | Função Provável |
|---|---|---|
| `VECreator.dll` | 271 MB | **Engine principal** de vídeo/composição |
| `libcef.dll` | 218 MB | **Chromium Embedded Framework** — UI web |
| `cccreator.dll` | 159 MB | Creator core (composição e efeitos) |
| `lens.dll` | 89 MB | **Engine de filtros e efeitos** em tempo real |
| `videoeditor.dll` | 73 MB | **Editor core** — timeline e clipes |
| `deepagents_capi.dll` | 42 MB | **C API para modelos de IA** (inference bridge) |
| `lynx.dll` | 25 MB | **Lynx UI framework** (UI mobile-style da ByteDance) |
| `pc_push.dll` | 24 MB | Sistema de push notifications |
| `dxcompiler.dll` | 22 MB | Compilador HLSL DirectX |
| `opengl32sw.dll` | 21 MB | Software OpenGL (fallback) |
| `avcodec-61.dll` | 20 MB | **FFmpeg avcodec** — codecs de vídeo/áudio |
| `openvino.dll` | 14 MB | **Intel OpenVINO** — inferência de IA em CPU/GPU |
| `audioeffect.dll` | 14 MB | Processamento de efeitos de áudio |
| `metasecml.dll` | 13 MB | Framework ML (possivelmente MetaSec ML) |
| `lyra_cli_client.dll` | 11 MB | **Codec Lyra** (Google) — compressão de áudio por IA |
| `sscronet.dll` | 9 MB | **Cronet** (Chrome networking) — HTTP/QUIC |
| `res_pool.dll` | 9 MB | Pool de recursos |
| `ever_cloud_sdk.dll` | 9 MB | SDK de cloud da ByteDance |
| `speechsdk.dll` | 8 MB | **SDK de reconhecimento de voz** |
| `tt_c2pa_sdk.dll` | 8 MB | **C2PA** — Content Provenance and Authenticity |
| `SvtAv1Enc.dll` | 7 MB | Encoder **AV1** (SVT-AV1) |
| `avfilter-10.dll` | 6 MB | FFmpeg avfilter — pipeline de filtros |
| `python311.dll` | 6 MB | **Python 3.11** runtime embarcado |
| `Qt6Core.dll` | 5.5 MB | Qt6 Core framework |
| `Qt6Gui.dll` | 7.2 MB | Qt6 GUI framework |
| `Qt6Widgets.dll` | 6.0 MB | Qt6 Widgets |

### 4.1 Tabela Completa de Imports e Exports dos Binários Core (PE Analysis)

| Binário / DLL | Imports (DLLs / Funções) | Principais Dependências | Exports | Principais Símbolos Exportados |
|---|---|---|---|---|
| `CapCut.exe` | 17 DLLs / 408 funcs | `KERNEL32` (252), `ADVAPI32` (55), `USER32` (33), `SHLWAPI` (19) | 88 funcs | Chromium base (`base::MemoryAllocatorDumpGuid`, `base::ReadOnlySharedMemoryRegion`) |
| `cccreator.dll` | 62 DLLs / 1.701 funcs | `MSVCP140` (253), `KERNEL32` (181), `audioeffect.dll` (151), `avutil-59.dll` (120), `jazz.dll` (116), `sscronet.dll` (105) | 7.401 funcs | `AmazingEngine` (`Segment`, `StickerCommonSegment`, `SwingSurfaceTrackingController`) |
| `videoeditor.dll` | 28 DLLs / 854 funcs | `MSVCP140` (214), `cccreator.dll` (196), `KERNEL32` (83), `clipflow_sdk.dll` (77), `avutil-59` (28) | 8.192 funcs | `lyra::AlgorithmAsyncUtils`, `lvve::SegmentPreRenderCacheManager`, `lyra::wrapper::VESDKModule` |
| `lens.dll` | 19 DLLs / 370 funcs | `MSVCP140` (104), CRT Math (61), `KERNEL32` (53), `fastcv.dll` (21) | 379 funcs | `FRAMEWORK::LENS` (`ICvAcceleratedOperatorInterface`, `ILensAlgorithmInterface`) |
| `VECreator.dll` | 23 DLLs / 4.087 funcs | `Qt6Core` (1.901), `Qt6Gui` (789), `FusionUI` (342), `Qt6Quick` (266), `Qt6Widgets` (223), `lynx.dll` (43), `nuro.dll` (57) | 1.808 funcs | `effectplatform::davinci` (`ResourceFetchCallback`, `loki`, `heycan`, `EffectLinkage`) |
| `smart_cut.ofx` | 14 DLLs / 198 funcs | `libGLESv2.dll` (34), `cccreator.dll` (36), `MSVCP140` (39), `KERNEL32` (31) | 2 funcs | Open Effects Standard (`OfxGetNumberOfPlugins`, `OfxGetPlugin`) |

### 4.2 Arquitetura do DeepAgents (`deepagents_capi.dll`)

`deepagents_capi.dll` (42 MB) é a ponte de inferência e orquestração de agentes de IA, compilada via **Go + CGo** (`_cgo_dummy_export`). Expõe **77 funções C-API**:

- **Gerenciamento de Agentes**: `da_agent_create`, `da_agent_create_with_callbacks`, `da_agent_destroy`, `da_agent_start`, `da_agent_run_async`, `da_agent_execute_subagent`, `da_agent_get_conversation_execution_graph`.
- **Sessões e Contexto**: `da_session_create`, `da_session_get_model_context_view`, `da_session_get_transcript_view`, `da_session_set_thinking_override`, `da_session_rewrite_history`.
- **Streaming de Respostas**: `da_agent_stream_start`, `da_agent_stream_run`, `da_agent_stream_next`, `da_stream_read`, `da_stream_close`.
- **Tool Calling (Execução de Ferramentas)**: `da_tool_call_emit_event`, `da_tool_call_reply_impl`, `da_tool_call_get_thread_id`, `da_tool_spec_array_alloc`, `da_tool_spec_array_free`.
- **Telemetria e Observabilidade**: `da_fornax_trace_send_reply_impl`, `da_session_get_fornax_runtime_view` (integração direta com telemetria Fornax da ByteDance).

---

## 5. Formato do Projeto (Draft) — Estrutura Interna

Obtido via análise de strings do `videoeditor.dll` (17.457 strings relevantes extraídas).

### 5.1 Campos-chave de um Segmento/Clipe

```json
{
  "item": {
    "version": "",
    "fps": 30,
    "has_audio": true,
    "speed": 1.0,
    "render_index": 0,
    "render_type": "",
    "fade": {},
    "fade_in_duration": 0,
    "fade_out_duration": 0,
    "fade_type": "",
    "filter": {},
    "effect": {},
    "effect_abs_path": "",
    "effect_name": "",
    "effect_params": {},
    "effect_mask": {},
    "enable_mask": false,
    "adjust_mask": {},
    "enable_adjust_mask": false,
    "mask": {},
    "curve_speed": {},
    "audio_adjust_params": {},
    "audio_channel_mapping": {},
    "audio_meta": {},
    "audio_track_index": 0,
    "video_animations": [],
    "video_effects": [],
    "video_meta": {},
    "video_meta_path": "",
    "common_keyframes": [],
    "trackers": [],
    "tracker_type": "",
    "tracker_data_id": "",
    "tracking_time_range": {},
    "smart_crop_param": {},
    "fill_render_style": "",
    "background_effects": [],
    "is_ai_generate_content": false,
    "is_ai_clone_tone": false,
    "is_ai_translate_applied": false,
    "caption_template_info": {},
    "subtitle_keywords": [],
    "subtitle_template_original_fontsize": 0,
    "text_to_audio_ids": [],
    "tone_effect_id": "",
    "manual_deformation_paths": [],
    "figure_effect": {},
    "lyric_canvas_blend": {}
  }
}
```

### 5.2 Campos de Compatibilidade Identificados

O `videoeditor.dll` embarca um sistema de **migração de versão** baseado em Lua com verificações de:
- `color wheels keyframes`
- `video animations` 
- `transition` (via `enable_transition_ii`)
- `stickers keyframes`
- `texts keyframes`
- `audio track indexs in segments`
- `combination segment`
- `render_index_track_mode_on`
- `vocal beautifys in segments`
- `ai_portrait` (remoção de fundo por portrait)
- `ai_translate_applied` (tradução automática por IA)

### 5.3 Esquema Real do `draft_content.json` (Engenharia Reversa Empírica)

Inspecionado diretamente a partir de projetos reais salvos em `User Data/Projects/com.lveditor.draft/`:

* **Unidade de Tempo Base**: **Microsegundos ($\mu s$)** ($1\text{ s} = 1.000.000\text{ }\mu s$).
* **Estrutura Raiz**:
  ```json
  {
    "id": "uuid-do-projeto",
    "version": 2,
    "new_version": "96.0.0",
    "duration": 209600000,
    "fps": 30.0,
    "canvas_config": {
      "ratio": "original",
      "width": 1080,
      "height": 1920,
      "background": null
    },
    "tracks": [ ... ],
    "materials": { ... },
    "keyframes": { ... }
  }
  ```
* **Tracks & Segments (Arquitetura Relacional)**:
  As tracks contêm segmentos com intervalos de tempo (`source_timerange` e `target_timerange`) que apontam para um `material_id`:
  ```json
  {
    "id": "seg_001",
    "material_id": "mat_video_001",
    "render_index": 0,
    "source_timerange": { "start": 0, "duration": 7400000 },
    "target_timerange": { "start": 0, "duration": 7400000 },
    "speed": 1.0,
    "volume": 1.0,
    "clip": { "scale": { "x": 1.0, "y": 1.0 }, "transform": { "x": 0.0, "y": 0.0 } },
    "keyframe_refs": [ "kf_01", "kf_02" ]
  }
  ```
* **Repositório Global de Materiais (`materials`)**:
  Separado em **55 tabelas especializadas**:
  - Mídia: `videos`, `audios`, `images`, `tail_leaders`, `canvases`.
  - Edição: `speeds`, `transitions`, `material_animations`, `sound_channel_mappings`.
  - Efeitos & Cor: `hsl`, `color_curves`, `primary_color_wheels`, `green_screens`, `chromas`.
  - IA & Áudio Avançado: `vocal_separations`, `vocal_beautifys`, `smart_relights`, `smart_crops`, `ai_translates`.

---

## 6. Engine de Efeitos — Flags de A/B Testing do `cccreator.dll`

O engine de efeitos (`cccreator.dll`) usa um sistema de feature flags extensivo:

### Renderização e GPU
- `enable_agfx_rendering_lib` — Renderer AGFX (Amazing GFX)
- `enable_break_old_feature_in_renderCore` — Quebrar compatibilidade com renders antigos
- `enable_render_reduce_blit` — Otimização de blit
- `enable_segment_xshader_reuse` — Reuso de shaders entre segmentos
- `enable_shader_compiling_key_sorted` — Ordenação de chaves de shader
- `enable_share_context_for_parallel_thread` — Contexto OpenGL compartilhado
- `effectab_enable_ae_renderer_metal` — Renderer Metal (Apple)
- `effectab_hybird_render_pipeline` — Pipeline híbrido de renderização

### Modelos de IA no Engine de Efeitos
- `enable_face_async_model_load` — Carregamento assíncrono de modelos de face
- `enable_face_extra_model_lazy_load` — Lazy loading de modelos extras
- `enable_model_loading_optimization` — Otimização geral de carregamento
- `enable_tt_matting_model_mapping` — Mapeamento de modelos de matting
- `enable_tt_face_extra_model_mapping` — Mapeamento de modelos extras de face
- `enable_amgFaceMakeup_segmentation` — Segmentação facial para maquiagem
- `auto_detection_human_model_name` — Detecção automática de modelo humano
- `auto_detection_object_model_name` — Detecção automática de objeto
- `bach_modelzoo_model_whitelist` — Whitelist de modelos BACH ModelZoo

### JavaScript e Scripts
- `enable_effect_javascript_runtime_mode` — Modo de runtime JS nos efeitos
- `enable_js_multi_context` — Múltiplos contextos JS simultâneos
- `enable_file_access_tracker_lua` — Tracker de acesso a arquivos via Lua
- `effectab_script_async_load_image` — Carregamento assíncrono de imagens em scripts

---

## 7. Modelos de Inteligência Artificial

### 7.1 Modelos Locais (Empacotados, ~Resources/models/)

| Modelo | Arquivo | Função |
|---|---|---|
| Matting v1 (GRU) | `mattingmodel/tt_matting_video_gru_v1.*.model` | Remoção de fundo em vídeo |
| Matting (saliency) | `mattingmodel/saliency_matting_v1.0.model` | Remoção por saliência |
| Interactive Matting | `tt_interactive_matting/tt_interactiv*.model` | Matting interativo |
| Face Verify | `faceverifymodel/tt_faceverify_v7.0.model` | Verificação facial |
| Face Beautify | `facebeautifymodel/` | Embelezamento facial |
| Face Fitting | `facefitting/` | Ajuste facial 3D |
| Face 3D Fitting | `tt_facefitting_3d/` | Fitting 3D avançado |
| Face Gan (gender) | `tt_gendergan/tt_gendergan_v4.2.model` | Transformação de gênero |
| FaceGan (female) | `bingo_facegan_model/female_gan_v3.*.model` | GAN feminino |
| Eye Fitting | `tt_eyefitting/` | Ajuste de olhos |
| Avatar 3D | `avatar3d/tt_avatar3d_v4.0.model` | Avatar 3D |
| Avatar Drive | `avatar_drive/` | Driving de avatar |
| MobileVOS | `tt_mobilevos/mobilevos_packed_v1.1.model` | Video Object Segmentation mobile |
| Salient Human | `tt_salient_human/` | Detecção de pessoa saliente |
| Saliency Seg | `saliency_seg_model/bingo_saliency_seg*.model` | Segmentação por saliência |
| Human Parsing | `humanparsingmodel/` | Parsing de partes do corpo |
| Head Seg | `headsegmodel/` | Segmentação de cabeça |
| Hair Parser | `hairparser/` | Segmentação de cabelo |
| Skin Seg | `skin_seg/` | Segmentação de pele |
| Skeleton | `skeleton_model/` | Estimação de esqueleto |
| Hand Model | `handmodel/` | Detecção de mão |
| Object Tracking | `object_tracking/` | Rastreamento de objeto |
| Single Object Track | `single_object_tracking_v1.0.model` | Rastreamento de objeto único |
| VFI (interpolação) | `interpolation/lens_vfi_v1.0.model` | Frame interpolation |
| UMVFI | `umvfi/` | Frame interpolation avançado |
| Depth Model | `depthmodel/` | Estimação de profundidade |
| iDream | `idream/` | Geração por IA (local) |
| Scene Normal | `alg_scene_normal/`, `scene_normal_model/` | Mapa de normais de cena |
| Shot Detect | `jy_compressShotDetectBackbone/Predhead*.bytenn` | Detecção de cortes/cenas |
| Freid | `freidmodel/tt_freid_v2.0.model` | Detecção de frames redundantes |
| Manga | `mangamodel/` | Estilo mangá |
| Oil Paint | `oilpaintbrush/` | Estilo pintura a óleo |
| Deflicker | `deflicker/` | Remoção de flickering |
| Noise Reduction | `noise_reduction/` | Redução de ruído |
| Custom Region | `custom_region_v1.0.model` | Região personalizada |
| Pet Face | `petfacemodel/` | Detecção de face de pet |
| Face Cluster | `faceclustingmodel/` | Clustering de faces |
| NodeHub Image | `nh_nodehub_image/` | Hub de nós para imagem |
| Invisible Watermark | `invisible_watermark/` | Marca d'água invisível |
| Yunfuhua (upscale) | `jypc_yunfuhua_gpucpu_v1.0.model` | Super-resolução (upscale) |
| CC Auto Beauty | `cc_auto_beauty_simo_script_v1.0.model` | Embelezamento automático |
| Skinified | `skinunified_v1.0_size1.bytenn` | Unificação de tons de pele |
| FS New Base | `tt_fsnew_base_v2.0_size0.model` | Base de filtros FS |
| Squat Skeleton | `tt_skeletonsquat_v9.1.model` | Skeleton para exercícios |
| ASR (Whisper-like) | `media_search/asr/ptl.dat` | Reconhecimento automático de fala |
| Sentence Score | `audiomodel/sentence_score_v1.0/v1.1.model` | Pontuação de frases |
| Music2Vibes | `audiomodel/music2vibes/music2vibes_v*.model` | Análise de ritmo musical |
| AED Pets | `audiomodel/aed_pets_v3.0.model` | Detecção de eventos de áudio (pets) |

### 7.2 Modelos Cloud (Geradores, via API)

| Modelo | Identificador | Tipo | Qualidade |
|---|---|---|---|
| SeedDance 1.5 | `ai_hub_video_seedance15_720` | Geração vídeo T2V | 720p |
| SeedDance 2.0 I2V | `ai_hub_video_seedance20_i2v_*` | Geração vídeo I2V | 480p/720p/1080p/4K |
| SeedDance 2.0 R2V | `ai_hub_video_seedance20_r2v_*` | Geração vídeo R2V | 480p–4K |
| SeedDance 2.0 Fast | `ai_hub_video_seedance20fast_*` | Geração rápida | 480p/720p |
| SeedDance 2.0 Mini | `ai_hub_video_seedance20mini_*` | Geração leve | 480p/720p |
| SeedDance 2.5 | `ai_hub_video_seedance25_*` | Geração I2V/R2V | 480p–1080p |
| MiniMax H3 | `ai_hub_video_minimaxh3_*` | Geração vídeo | 768p/2K |
| Gemini Omni Flash | `ai_hub_video_geminiomniflash_720` | Google Gemini | 720p |
| DreamActor | `ai_hub_video_dreamactor_*` | Avatar animado | 480p/720p |
| SeedDream 4.3 | `ai_hub_pic_seedream43_*` | Geração imagem | 2K/4K |
| SeedDream 4.5 | `ai_hub_pic_seedream45_*` | Geração imagem | 2K/4K |
| SeedDream 5 | `ai_hub_pic_seedream5_*` | Geração imagem | 2K/4K |
| SeedDream 5 Pro | `ai_hub_pic_seedream5pro_*` | Geração imagem Pro | 1K/2K |
| NanoBanana | `ai_hub_pic_nanobanana_*` | Geração imagem | 1K–4K |
| NanoBanana 2 | `ai_hub_pic_banana2_*` | Geração imagem v2 | 2K/4K |
| GPT-Image2 | `ai_hub_pic_gptimage2_medium_*` | OpenAI GPT-Image | 1K/2K |

---

## 8. Arquitetura de UI (Multi-Framework)

```
Janela Principal (Qt6)
│
├── Qt Widgets/QML — Janela, menus nativos, drag-and-drop do OS
│
└── CEF (Chromium Embedded 5.x) — Conteúdo web
    │
    ├── /video-studio/ — Editor principal (React + Vite)
    │   ├── App-DpNZSMvJ.js (3.2 MB) — Lógica completa do editor
    │   ├── index-DJ4o9hAr.js (241 KB) — Entry point
    │   └── services-Bqx5Pz17.js (51 KB) — Serviços de API
    │
    ├── /commonagent/ — Agente de IA (React + Vite)
    │   ├── assets/index-*.js — Bundle principal
    │   ├── assets/render-worker-*.js — Workers de renderização
    │   └── assets/services-*.js — Serviços cloud
    │
    └── Lynx Pages (UI mobile-style ByteDance)
        ├── image_lynx_videocutpc_subscription — Planos
        ├── image_lynx_videocutpc_credits_center — Créditos
        ├── image_lynx_videocutpc_subscription_export — Exportar
        └── image_lynx_videocutpc_message_center — Mensagens
```

---

## 9. Endpoints de API Identificados

### 9.1 Agente de IA
| Endpoint | Função |
|---|---|
| `GET /api/agent-runtime/v1` | Status do runtime do agente |
| `POST /api/agent-runtime/v1/debug/ailab-test-login` | Debug/login do AI Lab |
| `POST /api/common-agent/opened-project:restore` | Restaurar projeto aberto |

### 9.2 Comércio e Assinaturas
| Endpoint | Função |
|---|---|
| `/commerce/v1/subscription/price_list` | Lista de preços |
| `/commerce/v1/subscription/cc_price_list` | Preços CapCut |
| `/commerce/v1/subscription/user_info` | Info do usuário assinante |
| `/commerce/v1/subscription/make_unauto_order` | Pedido sem auto-renovação |
| `/commerce/v2/subscription/sign_and_pay` | Assinar e pagar |
| `/commerce/v1/benefits/user_credit` | Créditos do usuário |
| `/commerce/v1/benefits/user_credit_history` | Histórico de créditos |
| `/commerce/v1/benefits/credit_receive` | Receber créditos |
| `/commerce/v1/benefits/team_credit_allocate` | Alocação de créditos em equipe |
| `/commerce/v1/purchase/price_list` | Lista de preços de compra |
| `/commerce/v1/invoice/*` | Gerenciamento de faturas |
| `/commerce/v1/appeal/submit` | Enviar apelação |
| `/commerce/v1/student/verify/status` | Verificação de estudante |
| `/lv/v1/commerce/get_entrances` | Pontos de entrada comerciais |

> Inventário completo obtido na Fase 3 por varredura estática (bundles JS + strings C das DLLs): **93 hosts**, **~200 paths em bundles JS** e **~370 paths em binários nativos**. As tabelas abaixo agrupam os relevantes por função. Origem: `VECreator.dll`/`VEHelper.exe` (nativo), `app-server.mjs` (backend Bun do `common_agent`), `lynx_config/*/template.js` e `image_h5_*` (páginas web/Lynx).

### 9.3 Hosts e Domínios de Produção (Base URLs)

O CapCut não tem um "host único": cada serviço tem um subdomínio próprio, regionalizado (`-sg` Singapura, `-va` Virgínia/EUA, `-va-us` TikTok US Data Security) e com variante de **bootstrap** (`*-v2-boot.capcutapi.com`), usada antes da configuração de rede (TNC) ser baixada.

| Serviço | Hosts principais | Uso |
|---|---|---|
| Editor (API principal) | `editor-api-sg.capcut.com`, `editor-api.capcutapi.com`, `editor-api-va.capcutapi.com`, `edit-api-sg.capcut.com` | Paths `/lv/v1/*`: tarefas, legendas, TTS, uploads |
| Agente de IA (PC Agent) | `editor32-normal-sg.capcutapi.com`, `aivideo-normal-sg.capcutapi.com`, `ailab-agent-web.byteintl.net` | `/lv/v1/pc_agent/*`, `/storyboard_agent/v1/ai_lab/*` |
| Comércio | `commerce-api-sg.capcut.com`, `commerce-api.capcutapi.com`, `commerce-api-va.capcut(api).com` | `/commerce/v1..v3/*` |
| Login / conta | `passport-api-sg.capcut.com`, `passport-api.capcutapi.com`, `tt-passport16-normal-sg.capcutapi.com` | `/passport/*` |
| Feed / templates | `feed-api-sg.capcut.com`, `feed-api.capcutapi.com`, `feed-api-va-us.capcutapi.com` | Templates, notificações |
| Assets / efeitos | `heycan-api.capcutapi.com`, `api-heycan-pc-sg.capcut.com` | `/artist/v1/*`, `/effect/api/*` |
| Recursos dinâmicos (Gecko) | `gecko-sg.capcutapi.com`, `gecko-sg.byteoversea.com` | Pacotes de recursos hot-update |
| Cloud space | `cloudspace-normal.capcutapi.com` | Drafts e assets em nuvem |
| Upload de mídia (VOD/ImageX) | `mcs-normal-sg.capcutapi.com`, `mcs-nontt.byteintlapi.com`, `sgali-mcs.byteoversea.com` | Upload multipart com credenciais STS |
| Configuração de rede (TNC) | `tnc-v2-boot.capcutapi.com`, `ttnet-sg.byteoversea.com` | `/get_domains/v5/`: mapa dinâmico de domínios |
| Segurança / anti-fraude | `mssdk-sg.capcutapi.com`, `mssdk-sg.byteoversea.com` | SDK de segurança (gera `X-Argus`/`X-Ladon`) |
| A/B e config (Pitaya / VCS) | `pitaya-sg.capcutapi.com`, `vcs-sg.capcutapi.com` | Experimentos e feature flags |
| Telemetria / logs | `log-sg.capcutapi.com`, `pc-mon-normal-sg.capcutapi.com`, `mon-va.byteoversea.com`, `mon-i18n.tiktokv.com` | Eventos, APM, Slardar |
| Push / long-connection | `frontier-sg.capcut.com`, `frontier-va.byteoversea.com` | WebSocket de mensagens em tempo real |
| Tracing de LLM | `fornax.bytedance.net` | Observabilidade do agente (Fornax trace) |
| CDN | `sf16-*.ibytedtos.com`, `p16-capcut-sg.ibyteimg.com`, `sf16-*.tiktokcdn.com` | Assets estáticos |

A região de armazenamento do usuário é resolvida via `/aweme/v1/ttregion/get_store_idc/` (em `sscronet.dll`) e propagada nos cabeçalhos `x-tt-store-region*`.

### 9.4 Autenticação, Sessão e Assinatura de Requisições

**Login (Passport).** Fluxo web clássico da ByteDance, executado no processo nativo:
`/passport/web/auth/login/` → `/passport/web/auth/authorize/` (OAuth de terceiros: TikTok, Google, Facebook) → `/passport/web/check_qrconnect/` (login por QR Code) → `/passport/account/info/v2/`. A sessão é mantida por **cookies** (`sessionid`, `sid_tt`, `sid_guard`) e pelo cabeçalho **`x-tt-token`**, renovados periodicamente por `/passport/token/beat/v2/` (heartbeat). Também há `/lv/v2/oauth/access_token` e `/passport/web/transfer/get_token/` para repassar a sessão a sub-apps web.

**Separação de privilégio (decisão de arquitetura notável).** O backend JS (`bun.exe` + `app-server.mjs`) **não guarda credenciais**. Ele recebe do host nativo apenas um *auth-context* (`schema: "agent-runtime.host-auth-context.v1"`) com `principal.status` (`anonymous`/`authenticated`), `accountScope`, `userId`, `authEpoch` e `revision`. As requisições autenticadas passam por um **Native HTTP Bridge** (`NativeHttpTransport`): socket local + token de bridge + allowlist de origens HTTPS. Os cabeçalhos sensíveis (`cookie`, `x-tt-token`, `x-argus`, `x-gorgon`, `x-khronos`, `x-ladon`, `x-ss-stub`) são **removidos do lado JS** e injetados pelo código nativo (Cronet/TTNet). Uma troca de conta incrementa `authEpoch` e força o *drain* de todas as sessões do agente.

**Cabeçalhos de assinatura.** Há duas camadas:

| Camada | Cabeçalhos | Onde é gerada |
|---|---|---|
| Assinatura de app (`sign-ver: 1`) | `sign`, `device-time`, `tdid`, `pf`, `appvr`, `loc`, `lan`, `appid`, `ch`, `App-Sdk-Version` | JS (`app-server.mjs`): hash MD5 sobre um sufixo do path, plataforma, versão do app, timestamp e device-id, com *salt* fixo embutido |
| Assinatura de segurança (MSSDK) | `X-Argus`, `X-Gorgon`, `X-Khronos`, `X-Ladon`, `X-SS-Stub` | Nativo (`sscronet.dll` + SDK de segurança), não reproduzível no JS |
| Rastreamento | `x-tt-logid`, `x-tt-trace-id`, `x-tt-trace-log` | Cronet/TTNet |

> A assinatura de app é só integridade/anti-replay de baixo nível. Sem o token de sessão e sem as assinaturas MSSDK, a API privada não é utilizável. Não reproduzimos o salt aqui porque o LeccorCut não depende das APIs do CapCut.

### 9.5 Upload de Mídia

Upload em duas etapas, padrão ByteDance VOD/ImageX:

1. `POST /lv/v1/upload_sign` (ou `/lv/v2/upload_sign`) com `{biz, scene, key_version}` → retorna **credenciais STS temporárias**: `access_key_id`, `secret_access_key`, `session_token`, `current_time`, `expired_time`, `space_name`, `region`/`domain`.
2. O SDK `uploader-oversea-2.1.11.js` (web) ou o equivalente nativo envia o arquivo para o host MCS da região, assinando com as STS. As credenciais ficam em cache até `expired_time` (`uploadSignCache`, com dedup de requisições em voo).

Endpoints relacionados: `/artist/v2/tools/get_upload_token` (assets de criadores), `/lv/v1/asset/prepare_upload_cloud` + `/lv/v1/asset/create_cloud_asset` (cloud space), `/lv/v1/copilot/upload_material` (material para o agente), `/api/v1/spaces/` (espaços de equipe).

### 9.6 Efeitos, Templates, Stickers e Assets Cloud

| Grupo | Endpoints |
|---|---|
| Plataforma de efeitos | `/effect/api/panel/info`, `/effect/api/panel/check`, `/effect/api/category/effects`, `/effect/api/v3/effects`, `/effect/api/v3/effect/listByResourceId`, `/effect/api/checkUpdate`, `/effect/api/search/effects` |
| Itens de artista / criador | `/artist/v1/effect/mget_item`, `/artist/v1/effect/get_resources_by_category_id`, `/artist/v1/effect/search`, `/artist/v1/effect/user_favorite_list`, `/artist/v1/panel/get_panel_info` |
| GIFs e banco de imagens | `/artist/v1/library/giphy/search`, `/artist/v1/library/giphy/trending`, `/artist/v1/library/tuchong/order` |
| Templates | `/lv/v1/homepage/templates`, `/lv/v1/homepage/vip_templates`, `/lv/v1/pc/search/templates`, `/lv/v1/pc/replicate/*`, `/lv/v1/cc_web/plane/multi_get_templates` |
| Música | `/lv/v1/search_songs`, `/lv/v1/get_collections`, `/lv/v1/music/check_v2` (copyright), `/lv/v1/music/similar_music_rec` |
| Fontes | `/lv/v1/font/check` |
| Publicação de efeitos | `/artist/v1/post/effect`, `/artist/v1/tools/check_antidirt` (moderação), `/artist/v1/tools/get_cv_tags` |

Os pacotes de efeito baixados vêm como zip + `effect_required_files.tag` e são consumidos pelo `cccreator.dll`/AmazingEngine. A atualização de recursos sem novo release usa o **Gecko** (`gecko-sg.capcutapi.com`).

### 9.7 Exportação e Watermark

- `/lv/v1/watermark/get_watermark`: o servidor decide qual watermark visível (brand/AI) aplicar ao export.
- `/lv/v1/c2pa/cert` + `/lv/v1/c2pa/sign`: certificado e **assinatura remota** do manifesto C2PA (ver 10.4).
- `/lv/v1/pc/update_edit_result` e `/lv/v1/calc_video_score`: reporte do resultado da edição/exportação.
- `/lv/v1/check_material`, `/lv/v1/music/check_v2`, `/lv/v1/image/anime_copyright_checker`, `/lv/v1/intelligent_edit/security_audit`: checagens de copyright e moderação antes de publicar/exportar.
- Benefícios de exportação: `/commerce/v1/vip/query_benefit`, `/commerce/v1/vip/get_benefits` e `/commerce/v1/vip/exchange_benefit` (página Lynx `image_lynx_videocutpc_subscription_export`).

### 9.8 Geração por IA (Cloud)

O padrão é sempre **assíncrono**: *submit → poll (query) → fetch result / cancel*.

| Família | Endpoints | Uso |
|---|---|---|
| Zenith (geração de vídeo/imagem) | `/lv/v1/zenith/submit_task`, `submit_image_task`, `query_task`, `fetch_result`, `cancel_task` | SeedDance, MiniMax, Seedream etc. |
| Text-to-video | `/lv/v1/text_to_video/submit_generate_video_task`, `query_generate_video_task`, `prompt_to_text`, `parse_article_url` | Roteiro → vídeo, artigo → vídeo |
| CapFlow | `/lv/v1/capflow/submit`, `query`, `cancel`, `history_task` | Fluxos de edição automática |
| Tarefa genérica | `/lv/v1/common_task/new`, `submit_atomic_task`, `query`, `sync`, `cancel` | Usada também por `cccreator`/`videoeditor` (efeitos que processam no servidor) |
| AIGC de efeitos/texto | `/artist/v1/aigc/generate`, `/artist/v1/aigc/image_sr`, `/artist/v1/aigc/submit_text_task`, `/lv/v2/aigc_image/super_resolution` | Efeitos gerados, super-resolução |
| Voz | `/lv/v1/text_to_speech/new`, `query`; `/lv/v1/text_to_audio`; `/lv/v1/voice/*` (clonagem); `/lv/v1/get_sami_token` (token do motor de voz SAMI) | TTS, clone de voz |
| Legendas cloud | `/lv/v1/audio_subtitle/submit`, `query`, `process_subtitle`, `highlight` | Transcrição em nuvem (alternativa ao Panther local) |
| Agente (chat) | `/lv/v1/pc_agent/send_msg`, `poll_msg`, `update_message_option`; `/lv/v1/copilot/*` | Agente de edição conversacional |
| Avatares | `/lv/v1/digital_human/create_item`, `omni_profile_recognize` | Humanos digitais |
| Utilitários | `/lv/v1/translate/translate_texts`, `/lv/v1/ai_writing/*`, `/editor-tools/long-video-to-shorts` | Tradução, copy, corte longo → curto |

O backend do agente também chama uma plataforma interna de prompts (`/api/devops/prompt_platform/v1/prompt/execute` e `streaming_execute`) e de RAG (`/api/devops/knowledge_platform/v1/retrieve`).

### 9.9 Verificação de Assinatura (Licença) e Benefícios

O CapCut **não usa licença local**: não há arquivo nem chave de licença. O direito de uso é decidido no servidor a cada ação paga:

- **Estado da assinatura:** `/commerce/v1/subscription/user_info`, `/commerce/v3/subscription/get_user_lite_info` e `/commerce/v1/subscription/get_subscribe_info`.
- **Benefícios por recurso:** `/commerce/v3/benefits/batch_get_user_benefit` e `/commerce/v3/benefits/check_qualification` (posso usar o recurso X?).
- **Consumo:** `/commerce/v1/benefits/report_usage` e `/commerce/v3/benefits/batch_report_usage` (débito de créditos), mais `/commerce/v3/benefits/batch_check_withhold_deduct` (reserva antes de tarefa de IA).
- **Metadados de recurso pago:** `/commerce/v3/resource/benefit_metadata`, `/commerce/v1/benefits/batch_get_style_conf` e `/commerce/v1/benefits/batch_get_template_combine_ids` (quais efeitos/templates são Pro).
- **Fluxo de compra:** `/commerce/v3/trade/init_trade` → `/commerce/v3/trade/query_trade`; `/commerce/v1/purchase/make_order` → `query_order_status`.
- **Moderação de conta:** `/lv/v1/user/get_ban_status`, `/lv/v1/punish/get_punish_status`, `/lv/v1/rick_control/check_risk`.

Como recursos de IA e o watermark rodam ou são decididos no servidor, o modelo é *server-authoritative*. Para o LeccorCut isso confirma a decisão de ser **100% offline e sem paywall**: não há nada desse modelo a replicar.

---

## 10. Proteções e Segurança

### 10.1 Anti-Debug

Busca por imports (nomes de API terminados em NUL na tabela de imports) nos binários principais:

| Binário | APIs relevantes | Leitura |
|---|---|---|
| `CapCut.exe` (launcher 4.97MB) | `IsDebuggerPresent` | Checagem trivial |
| `metasecml.dll` (12MB) | `IsDebuggerPresent`, `CheckRemoteDebuggerPresent`, `WinVerifyTrust`, `CryptQueryObject` | **Núcleo anti-tamper** (SDK de segurança ByteDance, o mesmo que gera os cabeçalhos `X-Argus`/`X-Ladon`) |
| `VECreator.dll` | `IsDebuggerPresent`, `NtQueryInformationProcess`, `WinVerifyTrust` | Checagem de debugger e de assinatura de módulos |
| `cccreator.dll`, `deepagents_capi.dll` | só `OutputDebugStringA` / timers | Sem anti-debug próprio |
| `sscronet.dll` | `CertGetCertificateChain` | Validação da cadeia TLS (sem *pinning* rígido confirmado estaticamente) |

- Não há packer/VMProtect: as seções PE são legíveis e as strings ficam em claro.
- Os hits de "frida" em `VECreator.dll`, `VEHelper.exe` e `VEDetector.exe` são **falsos positivos** (substring de "Black **Fri**day"). Não há detecção explícita de Frida, x64dbg ou IDA.
- `AES_KEY_SETUP_FAILED`, `BAD_KEY_LENGTH`, `INVALID_TOKEN` vêm do BoringSSL (fork do OpenSSL pelo Google).

### 10.2 Mecanismo Interno de Watermarks (Lua + Atlas Engine)

A engine de watermark é orientada a entidades e sprites no motor `AmazingEngine`, controlada por scripts Lua e metadados JSON:
- **Estrutura dos Pacotes** (`Resources/watermark/`):
  - `brand_left`, `brand_right`, `ai_left`, `ai_right`: Watermarks dinâmicos animados.
  - `brand_static`, `ai_left_static`, `big_brand`, `normal_brand`: Watermarks estáticos.
- **Orquestração via Lua** (`infoSticker.lua`):
  ```lua
  InfoSticker = { 
      materials = { 
          { id = 0, type = materialType.autoAtlas, data = "ani_info.json", source = "SequenceMap.png" }
      },
      entity
  }
  function InfoSticker:new()
      local viewer = director:getViewer()
      local scale = viewer:getWidth() / 720.0 * 1.0
      o.entity = scene:createEntity("infoSticker" .. math.random())
      o.entity:getTransform():setScale(scale)
      o.entity:addSpriteComponent():getSprite()
      ...
  end
  ```
- **Atlas de Animação** (`ani_info.json` & `heycanInfo.json`):
  - Spritesheet `SequenceMap.png` (1024x1024 px) contendo 90 frames (`ccbl_00000.png` a `ccbl_00089.png`).
  - Cada frame armazena coordenadas de corte (`frame: x, y, w, h`), tamanho original (`200x60`) e flags (`trimmed: true`).
  - O runtime interpola a 30/60 fps dinamicamente na camada superior de composição.
- **C2PA Metadata**: Vinculado via `tt_c2pa_sdk.dll` para injetar credenciais criptográficas de autenticidade no container MP4/MOV exportado.

### 10.3 Criptografia
- **BoringSSL** embarcado (fork do OpenSSL pelo Google)
- Suporte a RSA, EC, DSA, PKCS12, TLS 1.3
- Comunicação de rede via **Cronet** (sscronet.dll) com QUIC/HTTP3

### 10.4 C2PA — Proveniência de Conteúdo (`tt_c2pa_sdk.dll`, 7MB)

- **Implementação:** Rust. É um fork interno do `c2pa-rs` da Adobe/CAI (`tt-c2pa-rs`), com `rust-openssl`. Módulos visíveis nos caminhos de build: `tt_c2pa_native_sdk.rs`, `tt_c2pa_cert_manager.rs` e `tt_remote_signer.rs`.
- **API C exportada:** `tt_c2pa_init`, `tt_c2pa_create`, `tt_c2pa_async_write_and_sign`, `tt_c2pa_http_response_create` e `tt_c2pa_enable_debug_log`. Quem chama é o `VECreator.dll` (`init_c2pa_sdk`, `c2pa_status`, `c2pa_cost`, `c2pa_cert_status`).
- **Assinatura remota:** a chave privada **não fica no cliente**. O SDK monta o claim, calcula os hashes e manda o *payload* para `/lv/v1/c2pa/sign`; o certificado vem de `/lv/v1/c2pa/cert`. A requisição HTTP é delegada ao host (`tt_c2pa_http_response_create`).
- **Formato:** manifest store em **JUMBF**, assinatura **COSE_Sign1** (ES256/384/512, PS256/384/512, Ed25519) e carimbo de tempo RFC 3161.
- **Hash do conteúdo:** `c2pa.hash.bmff` para MP4/MOV (com **Merkle tree** em MP4 fragmentado), `c2pa.hash.data` para JPEG/PNG e `c2pa.hash.boxes`.
- **Assertions:** `c2pa.actions.v2` (com `digitalSourceType`, que marca conteúdo gerado por IA), `c2pa.ingredient`, `c2pa.thumbnail.claim` e metadados schema.org.
- **Ativação:** controlada por A/B (`tt_c2pa_ab_test.enable`), ou seja, não é aplicada a todos os exports.

### 10.5 Watermark Invisível

- **Modelo:** `Resources/models/invisible_watermark/win_lens_wm_embed_model_c4_v2.bytenn` (≈780KB; há uma variante `mac_`). É um modelo ByteNN de **embedding** (só insere a marca; o detector fica no servidor).
- **Execução:** unidade de grafo `TEInvisibleWatermarkUnit` do motor de render (`cccreator.dll`, `ttvenative/src/engine/graph/processor/`), acelerada pelo Lens (`ve_lens_invisible_watermark_opt`).
- **Parâmetros:** `enable_invisible_watermark`, `invisible_watermark_id` e `invisible_watermark_id_source` (identificador embutido, provavelmente ligado a usuário/dispositivo/tarefa), além de `invisible_watermark_frame_interval` (a marca vai em um subconjunto de frames, não em todos).
- **Quando:** é injetado na configuração de export por `export_ns::TaskUtil::exportConfigAppendInvisibleWatermark`. A configuração vem do servidor (`lv.platform.labs.invisibleWatermarkInfo`), com flag de rollout específico para conteúdo de IA (`feature_gray_config.add_invisible_watermark_for_ai_gameplay`).
- **Leitura:** é rastreabilidade de conteúdo gerado/exportado (principalmente de IA), em paralelo ao C2PA. O C2PA é metadado removível; o watermark invisível sobrevive a re-encode.

### 10.6 Assinatura Digital dos Binários (Authenticode)

| Campo | Valor |
|---|---|
| Binários verificados | 365 `.exe`/`.dll`, **todos com status `Valid`** |
| Assinante | `CN=Bytedance Pte. Ltd., O=Bytedance Pte. Ltd., L=Singapore, C=SG` (EV, *Private Organization*) em 361 binários |
| Emissor | `DigiCert Trusted G4 Code Signing RSA4096 SHA384 2021 CA1` |
| Validade | 08/07/2025 → 08/07/2028 |
| Thumbprint | `27304C8528F313F03A48581515054B6DF65C7D85` |
| Algoritmo | sha256RSA |
| Timestamp | `Sectigo Public Time Stamping Signer R37` |
| Assinados pela Microsoft | `dxil.dll`, `msvcp140.dll` (redistribuíveis) |

### 10.7 Verificação de Integridade

- **Binários:** `WinVerifyTrust` é importado por `VECreator.dll` e `metasecml.dll`, o que é compatível com verificar a assinatura Authenticode de módulos e dos pacotes de update. A confirmação de *quando* isso é chamado (startup? carga de DLL?) fica para a Fase 4, com instrumentação.
- **Recursos web:** `web-manifest.json` traz SHA-256 de cada asset do `common_agent` (ver 12.3).
- **Pacotes de efeito/Gecko:** marcador `effect_required_files.tag` + verificação de hash no download.
- **C2PA:** hash do próprio conteúdo exportado (`BMFF inithash mismatch`, `claimSignature.mismatch`).

### 10.8 Ofuscação do Código JS

- 59 bundles JS/MJS próprios com mais de 200KB foram analisados (sem `node_modules`). **Nenhum usa ofuscação** estilo `javascript-obfuscator` (`_0x…`): é só minificação Vite/Rollup/esbuild, com nomes curtos e template strings preservadas.
- 29 bundles referenciam `sourceMappingURL`, mas **nenhum `.map` é distribuído**.
- As strings de endpoint, os nomes de schema (`agent-runtime.host-auth-context.v1`) e os nomes de classe (`NativeHttpTransportError`) ficam legíveis, então os bundles são a melhor fonte para mapear contratos de API.

---

## 11. Dependências Nativas de Terceiros Identificadas

| Biblioteca | Evidência | Função |
|---|---|---|
| FFmpeg (avcodec-61) | DLL | Codec de vídeo/áudio |
| FFmpeg (avfilter-10) | DLL | Pipeline de filtros |
| BoringSSL | Strings de erro | Criptografia TLS |
| Chromium/CEF | libcef.dll | UI web |
| Qt 6.x | Qt6Core/Gui/Widgets | Janela nativa |
| Lynx (ByteDance) | lynx.dll | UI mobile |
| Intel OpenVINO | openvino.dll | Inferência IA em CPU/GPU |
| Python 3.11 | python311.dll | Scripts Python |
| Bun runtime | bun.exe (107MB) | JavaScript runtime |
| ANGLE (OpenGL→D3D) | VEAngle/ | Compatibilidade OpenGL |
| SVT-AV1 | SvtAv1Enc.dll | Encoder AV1 |
| Lyra codec | lyra_cli_client.dll | Codec áudio IA Google |
| C2PA SDK | tt_c2pa_sdk.dll | Autenticidade de conteúdo |
| DirectX Shader Compiler | dxcompiler.dll | Compilação HLSL |
| Breakpad | minidump_stackwalk | Crash reporting |
| Parfait | parfait_crash_handler | Crash framework |
| ICU | icudtl.dat (10MB) | Unicode/internacionalização |

---

## 12. Plugins, Interoperabilidade e Web Manifests

### 12.1 Plugin Open Effects (`smart_cut.ofx.bundle`)
- **Padrão OFX Nativo**: Implementa `OfxGetNumberOfPlugins` e `OfxGetPlugin`.
- **Aceleração**: Vinculado a `libGLESv2.dll` e `cccreator.dll`.
- **Objetivo**: Plugin de segmentação/corte inteligente que opera como filtro de GPU acelerado via OpenGL ES 2.0 / ANGLE.

### 12.2 Conversão e Importação de Drafts (OpenTimelineIO)
No diretório `Tools/draft-converter/_internal/opentimelineio/`, foram identificados adaptadores padrão:
- `otio_aaf_adapter`: Suporte a Avid AAF.
- `otio_fcpx_xml_adapter`: Suporte a Final Cut Pro X XML.
- `otio_fcp_adapter`: Suporte a Apple Final Cut Pro 7 XML.
- **Relevância para o LeccorCut**: Essa mesma biblioteca (OpenTimelineIO) pode ser adotada diretamente para importar e exportar timelines entre CapCut, DaVinci Resolve, Premiere e LeccorCut.

### 12.3 Especificação do `web-manifest.json`
Localizado em `Resources/common_agent/app/web-manifest.json`:
- **Schema**: `common-agent.web-manifest.v1`
- **Contrato de Host**: `requires: { productHostApi: { minVersion: "1", maxVersion: "1" } }`
- **Entradas (Entries)**: `commonagent` (`commonagent/index.html`) e `videoStudio` (`video-studio/index.html`).
- **Integridade**: Dicionário `hashes` mapeia o SHA-256 de cada script, imagem e worker para verificação estrita antes da execução pelo CEF.

---

## 13. Pipeline de Renderização e Orquestração (`VECreator.dll`)

- **VESDK Core**: Inicializado via `SceneCoreUtils::initVESDK`. Controla transações de draft (`draftTransaction`, `draftCommit`) e despacho de eventos do player (`vesdk_player_events`).
- **Orquestrador de Materiais IA**: `agent::AgentMaterialPipelineOrchestrator` — coordena transcodificação de mídia (`preemptTranscodeAndUpload`, `processTranscodeTask`), upload assíncrono e agendamento de artefatos gerados por IA.
- **IPC Mojo para Efeitos**: `mojom::EffectPlatformService` — interface IPC entre o processo da UI e o serviço de efeitos Davinci/Loki (`EffectPlatformServiceImpl`).
- **UI QML Integrada**: Janelas de autor de efeitos como `LokiAuthorPopupWindow.qml` integradas diretamente sobre a viewport de edição.

---

## 14. Processo de Inicialização e Bootstrap Multiprocesso

O ciclo de vida da aplicação divide responsabilidades em vários processos especializados:

1. **Launcher Principal (`Apps\CapCut.exe` — 4.97 MB)**:
   - Lê `ProductInfo.xml` e `Configure.ini`.
   - Verifica atualizações diferenciais pendentes via `CapCut-DiffUpgrade.exe`, `hpatchz.exe` e `courgette64.exe`.
   - Spawna o executável da versão atual: `Apps\9.6.0.4097\CapCut.exe` (90 KB).

2. **Core Bootstrap (`Apps\9.6.0.4097\CapCut.exe`)**:
   - Inicializa `VESafeGuard.dll` (`safe_guard_first_load`) para proteção contra falhas prematuras.
   - Carrega `VEConfig.dll` e inicializa o runtime Qt6.
   - Spawna os processos auxiliares nativos:
     - `VEDetector.exe`: Força seleção de GPU dedicada (NVIDIA Optimus / AMD PowerXpress) e gerencia download de drivers incompatíveis.
     - `VEHelper.exe`: Coleta telemetria e diagnósticos de execução para `https://pc-mon-va.byteoversea.com`.
     - `ttdaemon.exe`: Processo isolado que inicializa CUDA (`cuInit`, `cuLaunchKernel`) e expõe a engine de efeitos `FRAMEWORK::LENS` sem sobrecarregar a UI principal.
     - `bun.exe` (107 MB): Runtime JS de alta performance em background que hospeda o `common_agent`.

3. **Bridge Node.js / Bun (`agent_runtime_addon.node` — 521 KB)**:
   - Módulo N-API nativo (`napi_register_module_v1`).
   - Monitora o processo pai via `startParentProcessWatchdog(parentPid)`.
   - Roteia exceções e handoff de crash para `Bun__handoffCrashHandlerToExternalReporter`.

---

## 15. Arquitetura da UI e JavaScript Bridge (Multi-Framework)

### 15.1 Coexistência na Janela
* **Janela Base:** Qt6 (`QMainWindow` / `QQuickView`).
* **Viewport e Timeline:** Renderizados via Qt Quick / Direct3D / ANGLE com aceleração de hardware direta.
* **Painéis Web (Sidebar, Video Studio, Agent Hub):** Instâncias de Chromium Embedded Framework (`libcef.dll`) acopladas como HWNDs filhos dentro dos layouts do Qt.
* **Componentes Móveis:** Lynx UI (`lynx.dll`) para cards dinâmicos e telas de assinatura.

### 15.2 Comunicação e Bridge JS nativo
Três canais de comunicação coexistem:
1. `window.cefQuery({ request: JSON.stringify({ callType, data }) })`: Roteador assíncrono nativo do CEF.
2. `window.Capcut?.JSBridge`: Objetos de invocação direta com métodos `.call()`, `.invoke()`, `.postMessage()`.
3. `window.videoStudioNativeBridge?.postMessage({ version: 1, type, payload })`: Mensageria orientada a eventos para o Video Studio.

**Chamadas de Bridge Mapeadas:**
- `ackAgentHubHostModeLayout`, `getAgentHubCreationConfig`
- `getUserSubscriptionInfo`, `getVipInfo`, `showVipPaywallModal`
- `openAgentHubDeepLink`, `requestAgentHubWorkspaceActionFromAssets`
- `setAgentHubSidebarWidth`, `finishAgentHubMediaDrag`, `showToast`
- Eventos transacionais de timeline: `beforeCreate`, `beforeTransaction`, `transaction`, `selectionUpdate`, `update`, `create`, `destroy`.

---

## 16. Subsistema de Áudio e Voz

* **Engine de Áudio `mammon` (`audioeffect.dll` — 2.102 exports)**:
  - `WaveformVisualizer@mammon`: Geração e amostragem de dados de onda senoidal para a timeline (`getPoints`, `getPointsInterleaved`).
  - Buffers de Baixa Latência: `CycleFifoBufferX`, `DynamicDelayAdjustX`.
  - Tratamento Acústico: Cancelamento de eco `AEC` / `AecMicSelection`, redução de ruído `realtime_denoises`.
* **Reconhecimento de Voz Panther (`speechsdk.dll` — 778 exports)**:
  - Motor `lab::speech::client::Engine` e inferência de fala `PthInfer@panther` com decodificador `PthLMDecoderOptions`.
  - Permite geração de transcrições e legendas automáticas offline diretamente no binário nativo.
* **Codec Lyra (`lyra_cli_client.dll` — 53 exports)**:
  - Codec neural do Google de ultra-baixa taxa de bits para transmissão em tempo real de áudio de voz.

---

## 17. Formatos Binários dos Modelos de IA (`ByteNN` e `SAMI`)

A análise de assinatura binária (magic headers) revelou dois padrões primários:
1. **Modelos `.bytenn` (ByteDance Neural Network)**:
   - Header: `42 4d 00 04` (`BM\x00\x04`).
   - Usado para redes neurais de segmentação rápida, matting e detecção de corte de cenas (`nn_denoise.bytenn`, `jy_compressShotDetectBackbone.bytenn`, `win_lens_wm_embed_model.bytenn`).
2. **Modelos `.model` de Áudio (SAMI Framework)**:
   - Header: `53 41 4d 49` (`SAMI` = *Speech, Audio, and Music Intelligence*).
   - Usado para modelos como `aec44k_resnet_echo_cancellation_v1.2.model`.
3. **Modelos de Visão Computacional**:
   - Compilados para OpenVINO (`openvino.dll`) e AmazingEngine com cabeçalhos de matrizes pré-compiladas para NPU/GPU.

---

## 18. Análise Dinâmica / Comportamental (Fase 4)

> Observação de comportamento **sem instrumentação intrusiva**: monitoramento de sistema de arquivos durante edição/exportação, inspeção dos artefatos em disco e da ferramenta de conversão embarcada. **Fora de escopo e não realizado:** hooks em validação de licença/assinatura e qualquer tentativa de derrotar o anti-debug/anti-fraude (`metasecml.dll`) ou forjar requisições assinadas — isso só serviria para contornar o controle de acesso do CapCut, não para construir um editor independente.

### 18.1 Estrutura Real do Projeto em Disco (multi-timeline)

Um projeto é uma **pasta** em `User Data/Projects/com.lveditor.draft/<nome>/`. A versão 9.6 usa um modelo **multi-timeline** (além do `draft_content.json` plano documentado na seção 5):

```
<projeto>/
├── draft_content.json          # timeline principal (compat/espelho plano)
├── draft_content.json.bak      # backup da escrita anterior
├── draft_meta_info.json        # metadados: id, capa, tempos (µs), device_id, mac_address
├── draft_settings              # preferências do projeto
├── draft_virtual_store.json    # store auxiliar
├── timeline_layout.json        # layout da UI (zoom/scroll da timeline)
├── draft_agency_config.json / draft_biz_config.json
├── template-2.tmp              # arquivo temporário da escrita atômica
├── .locked                     # lock de projeto aberto
├── common_attachment/attachment_id_mapping.json
└── Timelines/
    ├── project.json            # indice: main_timeline_id + lista de timelines
    ├── project.json.bak
    └── <timeline-UUID>/
        ├── draft_content.json  # conteudo real daquela timeline
        ├── draft_content.json.bak
        ├── template.tmp / template-2.tmp
        └── common_attachment/attachment_id_mapping.json
```

- **`Timelines/project.json`** lista as timelines: `{ "main_timeline_id": "<uuid>", "timelines": [ { "id", "name", "create_time", "update_time", "is_marked_delete" } ] }`. Tempos em microssegundos. Permite múltiplas linhas do tempo por projeto.
- **Escrita atômica:** o CapCut escreve em `template-2.tmp`, faz backup do atual em `draft_content.json.bak` e então substitui `draft_content.json` (padrão write-temp → rename). Um importador robusto do LeccorCut deve ler o `draft_content.json` da timeline em `Timelines/<main_timeline_id>/` e cair para o plano da raiz como fallback.
- **Privacidade:** `draft_meta_info.json` e os campos `platform`/`last_modified_platform` do `draft_content.json` embutem `device_id`, `mac_address` (hasheado), `hard_disk_id` e `app_id` em **todo** projeto salvo.

### 18.2 Comportamento de I/O durante Edição e Exportação

Monitoramento com `FileSystemWatcher` (596 eventos capturados em ~3 min, incluindo uma exportação). O CapCut **não cria arquivo intermediário de encode em `User Data`**: codifica direto no caminho de destino escolhido pelo usuário (observado: o arquivo de saída foi para `D:\...`, fora de `CapCut\Videos`). O que é escrito em `User Data` é cache e autosave:

| Artefato | Caminho | Função |
|---|---|---|
| Thumbnails da timeline | `Cache/frameThumbnail/<hash>/82x46/<µs>.jpg` | Tira de miniaturas 82×46 nomeadas pelo timestamp em µs (gerada sob demanda ao navegar) |
| Waveform de áudio | `Cache/audioWave/<hash>.waveDataV2` | Cache de forma de onda |
| Sondagem de mídia | `Cache/importcache3/mediainfo/<hash>.json` | Info de stream do arquivo importado (ver 18.3) |
| Índice de mídia | `Cache/ILASDKDB/scan.db`, `mediasearch.db` | SQLite de indexação/busca de mídia |
| Recursos | `Cache/ressdk_db/<id>/rp.db` | DB de recursos baixados (efeitos/templates) |
| Cache do agente | `Cache/agentCache/agent_media_asr.db` | ASR/transcrição do agente de IA |
| Config de GPU | `Config/gpuSupport.ini`, `commonSetting.ini` | Capacidades de GPU detectadas, preferências |
| Autosave do draft | `.../draft_content.json` + `.bak` + `template-2.tmp` | Salvo periodicamente durante a edição |

Implicação para o LeccorCut: a estratégia de cache (miniaturas por timestamp, waveform pré-computada, mediainfo em cache) é um bom modelo para performance da timeline, e já é parcialmente replicável com o FFmpeg/ffprobe que o projeto embarca.

### 18.3 Sondagem de Mídia (`mediainfo` cache)

Ao importar um arquivo, o CapCut grava um JSON `steAVInfo` — equivalente a um `ffprobe`, com campos extras para HDR/Dolby Vision. Principais campos por stream de vídeo (`sVideoStreamInfo`):
- `colorInfo` / `pkgColorInfo`: `color_primaries`, `color_range`, `color_trc`, `colorspace`, `color_depth`, `is_hdr_vivid`.
- `doviInfo`: perfil/level Dolby Vision (`blPresentFlag`, `rpuPresentFlag`, `profile`, `level`).
- `bitDepth`, `cleanApertureInfo` (clap), `eDisplayRotation`, `flipX/flipY`, `bByteVC110BitHWdecoder` (decodificação HW do codec ByteVC1/H.266).

O LeccorCut consegue produzir o essencial desse struct com o `ffprobe-static` já presente em `node_modules` (`ffprobe -show_streams -print_format json`), bastando mapear os campos de cor.

### 18.4 Interoperabilidade — `draft-converter.exe`

Ferramenta CLI embarcada (`Tools/draft-converter/`, bundle PyInstaller) construída sobre **OpenTimelineIO 0.18.1** com adapters **AAF** (`pyaaf2` 1.7.1), **FCPX XML** e **FCP7 XML**. O módulo-ponte é `draftconv` (`draftconv.otio_io`, `draftconv.steps.fcpx_adapter_patch`).

CLI pública (`convert.py`):

| Subcomando | Função |
|---|---|
| `convert` | Autodetecta AAF/xmeml → FCPXML importável |
| `aaf2fcpxml` | AAF (Avid) → FCPXML |
| `xml2fcpxml` | FCP7 XML (xmeml, exportado do Premiere) → FCPXML |
| `zero-tc` | Zera `tcStart` do FCPXML (reparo de timeline em branco no DaVinci) |

Direção do fluxo: **AAF/Premiere XML → FCPXML → import no CapCut**. Confirma que o caminho de interop profissional do CapCut é via **OpenTimelineIO/FCPXML**, não um parser proprietário. Orienta a Fase 5.3: o importador do LeccorCut deve adotar OTIO/FCPXML como formato de troca para receber timelines de Premiere/DaVinci/Avid (e eventualmente do próprio CapCut).

### 18.5 Crash Reporting (Parfait)

Pilha de monitoramento de crash própria da ByteDance, o **Parfait** (análogo a Breakpad/Crashpad):
- Binários: `VECrashHandler.exe` (2MB), `parfait_crash_handler.exe` (1.3MB), `parfait.dll`, `parfait_wer.dll` (integração com Windows Error Reporting) e `minidump_stackwalk.exe`/`.dll` (ferramenta de minidump do Breakpad).
- API interna (strings do `VECreator.dll`): `ParfaitWrapperClient::InitGlobalEnv`, `initNetwork`, `initCrashPostHandler`, `initGWPAsanMonitor` (amostragem de segurança de memória GWP-ASan), `crash_upload`, `openParfaitLog`, `setVEParfaitCallback`. Caminho de build: `C:\90741\CapCutPC\AppMonitor\VECrashMonitor\VEParfaitWrapper\`.
- O minidump é gerado fora do processo (handler dedicado) e enviado via rede (`crash_upload`), no mesmo padrão dos demais serviços ByteDance.

### 18.6 Captura de Tráfego (MITM) — Resultados Empíricos

Captura com mitmproxy + CA de usuário temporário (runbook em `FASE4_MITM.md`), exercitando startup, abertura de projeto, exportação e ociosidade. **30 MB de flows / 1181 linhas de resumo.**

**Confirmação-chave: o Cronet ignora o proxy do sistema por completo.** Não houve POST de login, nem chamada a `/lv/v1/*`, `/commerce/*` ou `/passport/*`, **nem sequer erro de handshake/pinning** — porque o Cronet (`sscronet.dll`) não tenta o proxy: conecta direto pelo adaptador de rede, invisível a um MITM baseado em proxy. Isso confirma empiricamente a arquitetura de rede da seção 9.4 (as APIs privadas trafegam fora do stack HTTP padrão do SO).

**O que foi capturado** (respeita proxy — CEF/web, CDN e parte da telemetria):

| Host | Hits | Categoria |
|---|---|---|
| `pc-mon-v2-boot.capcutapi.com` | 19 | Telemetria / configuração do coletor |
| `p16-capcut-sg.ibyteimg.com` | 13 | CDN de imagens (assets da UI) |
| `p16-capcut-sign-sg.ibyteimg.com` | 12 | CDN assinado (conteúdo do usuário) |
| `www.pippit.ai` | 6 | Pippit (produto de IA do CapCut) |
| `lf16-beecdn.ibytedtos.com` | 4 | CDN de GIFs (ByteDance) |
| `p16-dreamina-sign-sg.ibyteimg.com` | 3 | CDN Dreamina (gerador de imagem, assinado) |
| `www.capcut.com` | 2 | Web |
| `dreamina.capcut.com` | 1 | Home Dreamina |
| `commercepro.capcut.com` | 1 | Commerce (só redirect 301) |
| `p16-dreamina-sign.tiktokcdn.com` | 1 | CDN TikTok (Dreamina) |

**Telemetria — endpoint `monitor_pc/settings_v2`** (em `pc-mon-*`): chamado a cada **600 s** (`settings_interval: 600`), devolve a configuração do coletor de performance. Ativa monitoramento de **CPU, disco (info + I/O) e memória de processo**, com agregação a cada 5 s e upload a cada 30 s (`network_monitor_settings.enable_open` alternou 0/1 na sessão). Parâmetros enviados, relevantes para privacidade:

- `aid=359289` (App ID do CapCut PC), `app_version=9.6.0.4097`, `channel=capcutpc_google`
- `device_id=7688503925200619015` — **mesmo tipo de identificador embutido nos drafts** (seção 18.1)
- Cookie `store-country-code=br; store-country-code-src=did` — geolocalização por país derivada do device-id

**Limite do método e nota de escopo:** para ver as chamadas Cronet (login, licença, APIs privadas) seria preciso capturar no nível do adaptador (Wireshark — mostraria só os hosts via SNI/DNS, sem descriptografar) ou hookar o `libcronet` antes do TLS. O hook de transporte **não foi feito** — derrotar o TLS do cliente para ler tráfego autenticado está fora do escopo definido (mesma razão da seção 18 e 10.1: não serve a um editor offline). O inventário de hosts reais + telemetria já é o objetivo da Fase 4.0, e foi atingido.

---

*Gerado em: 2026-10-15 | Fonte: engenharia reversa estática, arquitetural e dinâmica/comportamental, incluindo captura MITM (Fases 1 a 4; itens de circunvenção de licença/anti-fraude e de TLS deliberadamente fora de escopo) do CapCut v9.6.0.4097*
