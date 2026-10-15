# 🕵️ Fase 4.0 — Captura de Tráfego do CapCut (MITM) — Runbook

> **Objetivo:** inventariar quais hosts o CapCut realmente chama (startup, exportação, IA cloud) e o que a telemetria envia, para confirmar o mapa estático da Fase 3 (seção 9.3) e documentar privacidade.
>
> **Escopo / limite ético:** isto é **observação do tráfego da sua própria máquina**. Não é — e o guia não cobre — derrotar o *certificate pinning*, forjar as assinaturas MSSDK (`X-Argus`/`X-Ladon`) ou contornar login/licença. Tráfego pinado vai permanecer opaco, e **isso é um resultado válido** (mostra quais hosts são protegidos).
>
> **Ambiente detectado:** Windows 11, Python 3.14.3 + pip 26.2.1, sem mitmproxy/Fiddler, proxy do Windows desligado.

---

## ⚠️ Avisos antes de começar

1. **Instalar um CA raiz é uma mudança sensível de segurança.** O CA do mitmproxy permite interceptar **todo** TLS da conta/máquina enquanto estiver confiável. Instale só pela duração do teste e **remova no fim** (passo 6).
2. **Não faça login com senha real durante a captura** se puder evitar — use uma conta de teste. O fluxo de login do Passport trafega credenciais.
3. Rode tudo numa janela de tempo curta e **desligue o proxy ao terminar** para não quebrar sua navegação normal.
4. Expectativa realista: com Cronet + pinning, talvez só 20–50% dos hosts descriptografem. Os pinados aparecem como erro de handshake nos logs do mitmproxy — anote-os assim mesmo.

---

## Passo 1 — Instalar o mitmproxy

**Opção A (recomendada): binário standalone** — evita problema de wheel para Python 3.14 (muito novo).

1. Baixe o instalador Windows em <https://mitmproxy.org/downloads/> (versão estável mais recente).
2. Instale e confirme:
   ```powershell
   mitmdump --version
   ```

**Opção B: via pip** (só se a Opção A falhar) — pode não ter wheel para 3.14:
```powershell
pip install --user mitmproxy
# se falhar por falta de wheel, instale o Python 3.12 e use:  py -3.12 -m pip install mitmproxy
```

> Alternativa sem instalar CA manualmente: **Fiddler Classic** (gratuito) faz o mesmo e tem botão de "Decrypt HTTPS" que instala/gerencia o CA sozinho. O resto do guia assume mitmproxy; com Fiddler os conceitos são idênticos.

---

## Passo 2 — Primeira execução e geração do CA

1. Rode uma vez para o mitmproxy **gerar o certificado**:
   ```powershell
   mitmdump --listen-port 8080
   ```
   Deixe rodar 2 segundos e feche com `Ctrl+C`. Isso cria o CA em:
   ```
   %USERPROFILE%\.mitmproxy\mitmproxy-ca-cert.cer
   ```
2. Confirme que o arquivo existe:
   ```powershell
   Test-Path "$env:USERPROFILE\.mitmproxy\mitmproxy-ca-cert.cer"
   ```

---

## Passo 3 — Confiar no CA (temporário)

**Interativo (recomendado, mais fácil de reverter):**
1. Dê duplo-clique em `%USERPROFILE%\.mitmproxy\mitmproxy-ca-cert.cer`.
2. "Instalar Certificado…" → **Usuário Atual** → "Colocar todos os certificados no repositório a seguir" → **Autoridades de Certificação Raiz Confiáveis** → Concluir.

**Ou via PowerShell (anote o Thumbprint para remover depois):**
```powershell
$cert = Import-Certificate -FilePath "$env:USERPROFILE\.mitmproxy\mitmproxy-ca-cert.cer" -CertStoreLocation Cert:\CurrentUser\Root
$cert.Thumbprint   # <- GUARDE este valor para o Passo 6
```

> O CA vai no repositório **do usuário atual** (`CurrentUser\Root`), não no da máquina — menos invasivo e não exige admin.

---

## Passo 4 — Apontar o Windows para o proxy e subir o mitmproxy com log

1. **Ligue o proxy do sistema** (afeta apps que respeitam o proxy do Windows, incluindo boa parte do Chromium/CEF do CapCut):
   ```powershell
   Set-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -Name ProxyServer -Value "127.0.0.1:8080"
   Set-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -Name ProxyEnable -Value 1
   ```
2. **Suba o mitmproxy** salvando tudo num arquivo de flows + um log de hosts:
   ```powershell
   $out = "C:\Users\Johnathan Amorim\AppData\Local\Temp\capcut_mitm"
   New-Item -ItemType Directory -Force $out | Out-Null
   mitmdump --listen-port 8080 --set block_global=false `
     -w "$out\capcut.flows" `
     --set "hardump=$out\hosts.txt"
   ```
   Deixe essa janela aberta — ela é o gravador. (Para uma UI com busca, troque `mitmdump` por `mitmweb`, que abre em <http://127.0.0.1:8081>.)

> **Se o CapCut ignorar o proxy do sistema** (o Cronet costuma ignorar): force a variável de ambiente antes de abrir o CapCut, numa janela nova:
> ```powershell
> $env:HTTPS_PROXY="http://127.0.0.1:8080"; $env:HTTP_PROXY="http://127.0.0.1:8080"
> & "$env:LOCALAPPDATA\CapCut\Apps\CapCut.exe"
> ```
> Mesmo assim, chamadas via Cronet com pinning não vão descriptografar — anote-as como pinadas.

---

## Passo 5 — Exercitar o CapCut e coletar

Com o gravador rodando, faça cada ação e espere alguns segundos entre elas (ajuda a separar no log):

1. **Startup:** feche e reabra o CapCut (captura boot/TNC/config/telemetria inicial).
2. **Abrir projeto:** abra o `0923`.
3. **Exportação:** exporte um trecho curto (720p basta).
4. **IA cloud (se tiver crédito/conta de teste):** rode uma ação de IA (ex.: legenda automática, um efeito AIGC) — é o que exercita `/lv/v1/zenith/*`, `/commerce/v3/benefits/*`, upload.
5. **Telemetria ociosa:** deixe o app aberto e parado ~1 min.

Pare o gravador com `Ctrl+C` na janela do mitmdump.

---

## Passo 6 — 🔒 LIMPEZA (não pule)

```powershell
# 1. Desligar o proxy do sistema
Set-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -Name ProxyEnable -Value 0
# 2. Limpar variáveis de ambiente (feche as janelas onde setou $env:HTTPS_PROXY)
# 3. Remover o CA do mitmproxy (use o Thumbprint do Passo 3)
Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Subject -match 'mitmproxy' } | Remove-Item
# Confirmar que sumiu:
Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Subject -match 'mitmproxy' }
```

Verifique no navegador que o HTTPS normal voltou ao certificado real (cadeado → certificado não deve mais ser "mitmproxy").

---

## Passo 7 — Análise (me passe os arquivos)

Depois da limpeza, me avise e eu processo os resultados. Os arquivos ficam em `C:\Users\Johnathan Amorim\AppData\Local\Temp\capcut_mitm\`:

- **`hosts.txt`** — lista de hosts contactados (inclui os que **não** descriptografaram). Já dá pra cruzar com a tabela de 93 hosts da seção 9.3 e marcar quais são reais vs. só referenciados no binário.
- **`capcut.flows`** — todos os flows. Eu extraio (via `mitmdump -nr capcut.flows` com um script de leitura) :
  - quais paths de `/lv/v1/*`, `/commerce/*`, `/passport/*` foram chamados de fato;
  - quais cabeçalhos de assinatura/telemetria vão em cada um;
  - o conteúdo da telemetria (`/monitor_browser/*`, `log-*`, `mon-*`) — o que é enviado sobre uso/dispositivo;
  - quais hosts recusaram o handshake (= pinados).

> Para exportar um resumo legível sem UI:
> ```powershell
> mitmdump -nr "$out\capcut.flows" --set flow_detail=1 > "$out\resumo.txt"
> ```
> Me mande `hosts.txt` e `resumo.txt` (ou o `capcut.flows` inteiro) que eu consolido na seção 9/18 da documentação e fecho o último item da Fase 4.

---

## O que esperar como resultado

| Categoria | Provável visibilidade |
|---|---|
| CEF/UI web (React/Vite, Lynx), assets CDN | ✅ Costuma descriptografar (respeita proxy) |
| Telemetria Slardar/APM (`mon-*`, `log-*`, `/monitor_browser/*`) | ⚠️ Parcial — alguns respeitam proxy |
| APIs privadas via Cronet (`/lv/v1/*`, `/commerce/*`, `/passport/*`) | 🔴 Em geral **pinadas** — handshake falha, host fica registrado mas conteúdo opaco |
| Upload de mídia (MCS) | 🔴 Pinado |

Mesmo o "pior caso" (tudo pinado) entrega o inventário de hosts reais e a lista do que é protegido — que é o objetivo declarado da Fase 4.0.

---

*Runbook criado em 2026-10-15 para a Fase 4 da engenharia reversa do CapCut v9.6.0.4097. Executado manualmente pelo usuário; a análise dos arquivos capturados é feita depois, em sessão.*
