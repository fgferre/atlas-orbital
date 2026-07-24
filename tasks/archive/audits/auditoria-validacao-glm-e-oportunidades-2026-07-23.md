# Auditoria de validação GLM e busca independente de oportunidades

**Data:** 2026-07-23\
**Baseline:** `main` em `b541a6d`\
**Escopo:** validação do relatório OpenCode/GLM 5.2, auditoria independente de física, dados, render, estado, performance, asset pipeline, UI/UX, acessibilidade e QA.\
**Estado:** análise concluída; nenhuma correção de código foi aplicada.

Este documento é separado dos sweeps de 2026-06-16 porque valida uma revisão
externa posterior contra o código atual e substitui prioridades que já ficaram
obsoletas. Ele deve ser usado como handoff de correção, não o relatório GLM
original.

## Resumo executivo

O relatório GLM é útil como lista de hipóteses, mas não é seguro executá-lo como
backlog. Vários itens classificados como P0 estão numericamente errados,
desatualizados ou não têm impacto no catálogo atual:

- B-2 não reproduz o residual alegado e o catálogo atual para em `e=0,85`.
- B-5 propõe trocar eixos que hoje estão corretos para a convenção Three.js.
- B-7 não corrompe o snapshot HYG 4.2 atual: 119.626 linhas foram varridas sem
  vírgula quoted ou desalinhamento de 37 colunas.
- B-9 ignora o hatch real de oito segundos.
- B-11 usa um raio de white dwarf incorreto por três ordens de grandeza e o
  clamp sugerido nem alteraria o caso atual.
- P-1, P-3, P-5 e R-9 também foram substancialmente superestimados ou já
  corrigidos.

Os problemas de maior impacto encontrados nesta auditoria não estavam
priorizados corretamente no relatório externo:

1. **P0 — luas recebem uma segunda rotação na hierarquia R3F**, deslocando a
   posição renderizada em dezenas de graus.
2. **P0 — efemérides two-body de luas rápidas estão muito fora da posição
   atual**, embora a UI apresente nomes de modelo pouco transparentes.
3. **P0/P1 — o overview inicia quase todos os mapas e alguns assets chamados
   “2k/4k” têm até 15.960×7.980 px**, excedendo limites comuns de GPU e
   invalidando o orçamento adaptativo.
4. **P0 de QA — `main` é publicado após apenas `build`**, sem test, lint, docs
   ou E2E como gate.
5. **P1 — a CSP de produção bloqueia WebAssembly em todo boot observado**,
   produz erro de console e força fallback JS.

O melhor caminho não é uma coleção de quick fixes isolados. A correção deve
começar pela paridade engine→posição mundial, segurança adaptativa de texturas e
gates de publicação; depois tratar precisão/proveniência e finalmente UX e
microperformance.

## Prioridade corrigida

| Prioridade | Problema                                                | Impacto                                                                                      |
| ---------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| P0         | Rotação dupla das luas na cena                          | Posição visível cientificamente errada mesmo quando o engine está correto                    |
| P0         | Drift atual de Phobos, Io e outras luas two-body        | Erros de 33° a 158° no engine em 2026-07-23                                                  |
| P0/P1      | Bootstrap e dimensões reais das texturas                | Rede, decode e VRAM excessivos; risco de falha de upload/context loss em hardware alcançável |
| P0 QA      | Deploy sem quality gate                                 | Regressão que compila pode ir direto para GitHub Pages                                       |
| P1         | CSP bloqueia WebAssembly                                | Fallback obrigatório, erro em console e E2E vermelho                                         |
| P1         | ΔT fora de um intervalo estreito                        | Erro temporal crescente, especialmente visível em luas e datas remotas                       |
| P1         | Autoridades divergentes de rotação/orientação           | Modelo 3D e esfera podem apontar em fases diferentes                                         |
| P1         | Validade/proveniência orbital sobrevendida              | UI não comunica claramente os limites dos modelos                                            |
| P1         | Degraded boot e recuperação R3F incompletos             | Loader sai mesmo com cena morta ou catálogo ausente, sem aviso persistente                   |
| P1         | Cancelamento e offset de câmera frágeis                 | Snap/drift após interromper voo ou deltas extremos                                           |
| P1 UX      | i18n parcial, locale divergente e `html lang` incorreto | Experiência híbrida e semântica de acessibilidade errada                                     |
| P1         | Integridade do downloader NASA                          | Um `200` inválido pode virar source-of-truth local                                           |
| P2/P3      | Store, overlay e SmartSunLight                          | Correções válidas, mas só após profile ou antes de ativar caminhos dormentes                 |

## Achados independentes de maior impacto

### A-1 — P0: posição de luas é rotacionada duas vezes

O provider declara explicitamente que os elementos e vetores de satélites estão
no referencial **eclíptico médio J2000, parent-centered** e que nenhuma rotação
body-equatorial é necessária em
[`satellites.ts:1-17`](../src/lib/orbital/analytical/satellites.ts#L1).
`calculateSatellitePosition` já converte o vetor para os eixos Three.js em
[`satellites.ts:374-387`](../src/lib/orbital/analytical/satellites.ts#L374).

Apesar disso, `Planet` coloca todos os filhos de planetas não terrestres dentro
do quaternion do polo do pai em
[`Planet.tsx:968-979`](../src/components/canvas/Planet.tsx#L968). Essa
transformação gira novamente uma posição que já está no frame inercial correto.

Medições no epoch dos fixtures:

| Corpo         | Deslocamento introduzido pela cena |
| ------------- | ---------------------------------: |
| Deimos        |                             24,41° |
| Titan         |                             14,38° |
| Iapetus       |                             27,91° |
| Luas de Urano |                            52°–81° |

Em 2026-07-23, Titan passa de 1,79° de erro no engine para 26,21° renderizado;
Titania passa de 0,89° para 44,10°.

**Correção:** separar o grupo de orientação visual do planeta do grupo orbital
dos filhos. Posições já eclípticas devem entrar diretamente no frame do pai;
eventuais fontes body-equatorial devem ser convertidas dentro do provider, com
proveniência explícita.

**Gate obrigatório:** teste de coordenada mundial em que
`moonWorld - parentWorld` seja igual ao vetor retornado pelo engine, cobrindo
Marte, Júpiter, Saturno e Urano. Testar a cena/hierarquia, não apenas o provider.

### A-2 — P0/P1: modelos de satélites já estão fora de validade prática

O código é honesto nos comentários: trata-se de uma solução osculante de
2025-01-01 propagada em two-body, sem J2, ressonâncias ou precessão
([`satellites.ts:22-33`](../src/lib/orbital/analytical/satellites.ts#L22)).
O registry, porém, a expõe com nomes como `GalileanMeanElements` e sem intervalo
de validade por corpo
([`registry.ts:140-160`](../src/lib/orbital/registry.ts#L140)).

Comparações executadas em 2026-07-23 contra o serviço oficial
[JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) encontraram:

| Corpo     | Erro angular do engine |
| --------- | ---------------------: |
| Phobos    |                157,58° |
| Io        |                107,19° |
| Enceladus |                 33,27° |
| Titan     |                  1,79° |
| Titania   |                  0,89° |

Isso é anterior à rotação dupla descrita em A-1. A afirmação GLM de que não há
proveniência no repositório é falsa; o problema real é que a UI mostra nomes
opacos e não converte a limitação documentada em incerteza compreensível
([`Sidebar.tsx:438-475`](../src/components/ui/Sidebar.tsx#L438)).

Também há uma janela de asteroides não sustentada. O registry anuncia
1900–2050 em [`registry.ts:27-31`](../src/lib/orbital/registry.ts#L27), mas em
1900 Ceres, Pallas e Vesta divergiram respectivamente 5,06°, 5,98° e 3,86° do
Horizons; em 1950 ainda divergiram 4,22°, 5,34° e 3,35°.

**Correção:**

1. Resolver primeiro A-1 para remover o erro puramente de render.
2. Adotar teorias perturbadas, múltiplos epochs ou refresh de elementos para
   luas rápidas.
3. Definir validade e envelope de erro por corpo, medidos contra fixtures
   Horizons.
4. Renomear os modelos para algo semanticamente honesto, por exemplo
   `SatelliteOsculating2Body2025`.
5. Exibir na UI modelo, epoch, validade e incerteza em linguagem humana.

### A-3 — P0/P1: pipeline adaptativo de texturas não controla o custo real

O boot começa com `focusId=null`; nesse estado, planetas/dwarfs recebem
prioridade 1 e os demais prioridade 2. `usePlanetAssets` carrega mapas para
prioridade `<=2` e carrega/pina secundários quando o corpo ganha foco
([`usePlanetAssets.ts:39-47`](../src/components/canvas/planet/usePlanetAssets.ts#L39),
[`usePlanetAssets.ts:123-170`](../src/components/canvas/planet/usePlanetAssets.ts#L123)).
Como todos os corpos são montados, o overview inicia praticamente todo o
catálogo visual.

Foram medidos **37 mapas canônicos, 202,81 MiB de arquivos**, antes de decode.
O diretório `public/` soma 322,66 MiB e `textures/` 294,10 MiB. O manifesto de
variantes cobre apenas Sun, Earth, Saturn e Uranus
([`textureVariantManifest.ts:6-41`](../src/lib/textureVariantManifest.ts#L6)).

As dimensões reais contradizem os nomes:

| Asset              | Dimensão real | RGBA base estimado | Com mipmaps estimado |
| ------------------ | ------------: | -----------------: | -------------------: |
| `2k_tethys.jpg`    |  13.467×6.734 |          345,9 MiB |            461,3 MiB |
| `4k_enceladus.jpg` |  15.960×7.980 |          485,8 MiB |            647,8 MiB |
| `4k_iapetus.jpg`   |  11.741×5.871 |          263,0 MiB |            350,6 MiB |
| `4k_oberon.png`    |   8.192×4.096 |          128,0 MiB |            170,7 MiB |

Esses números são estimativas RGBA descomprimidas, não tamanho de download nem
medição exata do driver. Mesmo assim, Tethys e Enceladus excedem
`MAX_TEXTURE_SIZE=8192` e 4096 comuns em hardware de entrada.

O cache estima memória pelo prefixo do filename
([`deferredTextureCache.ts:77-98`](../src/lib/deferredTextureCache.ts#L77)), logo
subestima severamente esses arquivos. Perfis high/ultra têm budget `null` e não
executam idle eviction
([`deferredTextureCache.ts:100-112`](../src/lib/deferredTextureCache.ts#L100),
[`deferredTextureCache.ts:196-205`](../src/lib/deferredTextureCache.ts#L196)).
A detecção de device memory, CPU, rede, viewport e DPR existe e está correta
([`qualityProfile.ts:139-217`](../src/lib/qualityProfile.ts#L139)); o defeito é a
seleção/produção de assets não honrar esse perfil.

**Correção:**

- gerar manifest autoritativo com largura, altura, canais, bytes estimados e
  proveniência;
- produzir variantes reais por tier e por canal, com limite de dimensão;
- validar contra `gl.MAX_TEXTURE_SIZE` antes do upload;
- overview com LOD baixo, promoção por saliência angular/foco e fila com
  concorrência limitada;
- deixar de pinar automaticamente todos os mapas secundários;
- orçamento finito também em high/ultra;
- gate de asset que rejeite nome/dimensão incoerente e ausência de variante
  constrained.

**Gate runtime:** waterfall por tier com contagem de requests/bytes, pico de
texturas e ausência de `OUT_OF_MEMORY`/context loss em GPU 4096 e 8192.

### A-4 — P0 de QA: publicação sem quality gate

O único workflow faz `npm ci` e `npm run build` antes de publicar Pages
([`deploy.yml:17-48`](../.github/workflows/deploy.yml#L17)). Não há workflow de
PR nem execução de test, lint, docs ou E2E.

**Correção:** criar job obrigatório e anterior ao deploy:

1. `npm ci`
2. `npm run test:run`
3. `npm run lint`
4. `npm run docs:check`
5. `npm run build`
6. instalar Chromium Playwright e executar smoke E2E com `workers: 1` para o
   lane WebGL;
7. publicar report/trace quando falhar.

O lane visual pesado pode ser separado ou agendado, mas os gates determinísticos
não podem continuar fora do deploy.

### A-5 — P1: CSP bloqueia WebAssembly em produção

Todo boot de produção observado gerou:

> `WebAssembly.instantiate(): ... violates Content Security Policy ... script-src 'self' blob:`

O header em [`vite.config.ts:49-51`](../vite.config.ts#L49) não permite a
compilação WebAssembly exigida pelo caminho acelerado. A aplicação continua por
fallback JS, mas paga o custo, polui o console e quebra a asserção E2E de console
limpo.

**Correção:** identificar o pacote/WASM exato, confirmar se ele é necessário e
adotar a diretiva CSP mínima compatível (`'wasm-unsafe-eval'` quando suportada),
sem abrir `unsafe-eval` genericamente. Se o WASM não for requisito, retirar a
tentativa do bundle.

**Gate:** boot de produção com zero `console.error`, confirmação explícita do
backend selecionado e comparação de resultado/performance WASM versus fallback.

### A-6 — P1: inconsistências físicas e honestidade visual

- Vanth mistura `n=90°/dia` (período de 4 dias), texto/rotação de 9,5 dias,
  massa maior que Orcus apesar de texto 1:12 e gravidade incompatível com
  `GM/R²` em
  [`celestialBodies.ts:1718-1741`](../src/data/celestialBodies.ts#L1718).
- Weywot declara sincronização no texto, mas usa rotação zero; massa/raio também
  não reproduzem a gravidade cadastrada.
- Haumea e Makemake usam arquivos explicitamente `*_fictional.jpg` sem
  `visualProvenance`, embora a Sidebar já suporte esse contrato.

**Correção:** testes de consistência dimensional (`n·P≈360`, `GM/R²`, razão
pai/filho, sincronização) e `visualProvenance` obrigatório para assets
procedurais, compositados ou ficcionais.

### A-7 — P1 UX/a11y: produto parcialmente internacionalizado

O runtime com `?lng=pt-BR` mostrou o selo de escala em português, enquanto
tutorial, Sidebar, Timeline, Gear, TopBar e atalhos continuaram em inglês. Só
`HygStarPanel` e `ScalePill` usam `useTranslation`; o bundle possui apenas esses
dois grupos. O documento permanece `<html lang="en">`.

O teste inverso também falhou: app em inglês e navegador em pt-BR mostrou a data
da Timeline como `23 DE JUL. DE 2026`, porque
[`Timeline.tsx:205-225`](../src/components/ui/Timeline.tsx#L205) usa
`Intl.DateTimeFormat(undefined)`.

Outros gaps confirmados:

- não há seletor de idioma;
- High Contrast existe no estado, mas o toggle é desativado
  ([`A11yPanel.tsx:108-116`](../src/components/ui/A11yPanel.tsx#L108));
- Gear desktop não fecha com `Esc`;
- controles da Timeline usam 36 px, abaixo do alvo touch de 44 px;
- não há projeto mobile Playwright nem gesto touch equivalente ao hover de
  estrelas;
- não há seletor de data, apesar de o store já ter uma action de seek;
- falha completa do catálogo ou hatch da cena não deixa aviso degradado
  persistente.

**Correção:** onda única de contrato de UX: namespace comum completo, seletor de
idioma, sincronização de `document.documentElement.lang`, todos os `Intl`
recebendo `i18n.resolvedLanguage`, High Contrast funcional, teclado consistente,
targets de 44 px, QA mobile e date picker com “Agora” e aviso de validade
científica.

## Validação item a item do relatório GLM

### Bugs B-1 a B-11

| ID                     | Veredito                                         | Prioridade corrigida | Evidência e decisão                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-1 ΔT                 | Confirmado, números GLM imprecisos               | P1                   | [`time.ts:75-90`](../src/lib/orbital/time.ts#L75) reaproveita um polinômio estreito e clampa 30–100 s. Em 1900 a referência é cerca de −2,79 s, não −8 s. A [NASA publica expressões por era](https://eclipse.gsfc.nasa.gov/SEhelp/deltatpoly2004.html), inclusive 1900–1920, 2005–2050, 2050–2150 e pós-2150. Implementar segmentos documentados, incerteza e testes de fronteira. |
| B-2 Kepler             | Rejeitado como bug atual                         | P3 hardening         | `M=6,e=.999` deu residual zero; sweep completo em `e=.85`, máximo atual (Sedna), teve residual `8,9e-16`. Consumidores já normalizam `M`. O solver pode falhar perto de `e=.999,M≈0`; validar `0≤e<1`, normalizar internamente e usar fallback robusto. Não adicionar branch hiperbólico à API elíptica sem requisito.                                                              |
| B-3 rotação de modelos | Parcialmente confirmado                          | P1                   | [`PlanetModel.tsx:203-209`](../src/components/canvas/PlanetModel.tsx#L203) usa Unix time e ignora epoch/offset, enquanto a esfera usa `AstroPhysics`. Os quatro corpos modelados hoje não fornecem epoch explícito, por isso o impacto descrito foi exagerado. Centralizar orientação, `W0`, `Wdot`, epoch e registro do asset.                                                     |
| B-4 datetime           | Mecanismo confirmado, impacto exagerado/dormente | P2                   | `seek()` emite pela ponte e a linha seguinte grava outra `Date` em [`store.ts:313-323`](../src/store.ts#L313). Há duas notificações Zustand, não prova de dois commits React ou dez assinantes. Não há caller de seek manual em produção. Guardar por timestamp e testar notificações antes de criar date picker.                                                                   |
| B-5 eixos              | Rejeitado                                        | Apenas teste         | O NCP correto no frame da cena é `(0, cos ε, -sin ε)`, exatamente o atual. A troca proposta produziria ~23° de erro. Adicionar vetores canônicos e round-trip para impedir regressão.                                                                                                                                                                                               |
| B-6 `error=ready`      | Intenção fail-open válida; UX incompleta         | P1 UX                | [`sceneReadiness.ts:5-14`](../src/lib/sceneReadiness.ts#L5) aceita loading/ready/error, e o teste cristaliza isso. Bloquear a cena por erro seria pior; o defeito é não persistir um estado degradado após o loader.                                                                                                                                                                |
| B-7 CSV HYG            | Rejeitado no snapshot atual                      | P3 hardening         | As 119.626 linhas do `hygdata_v42.csv.gz` têm 37 células; zero quoted commas e zero deslocamento. Manter teste de integridade e trocar parser apenas se a fonte mudar ou o contrato passar a permitir aspas.                                                                                                                                                                        |
| B-8 downloaders        | Confirmado para NASA; exagerado para HYG         | P1 NASA / P3 HYG     | NASA aceita qualquer arquivo existente e grava qualquer `200` diretamente. HYG rejeita download `<10 MiB` antes de gravar e preserva o cache antigo. Ambos devem usar `.tmp`, validação de formato/tamanho/hash e rename atômico.                                                                                                                                                   |
| B-9 loader infinito    | Rejeitado como escrito                           | P1 recovery UX       | [`SceneReadyChecker.tsx:25-77`](../src/components/canvas/SceneReadyChecker.tsx#L25) possui hatch de oito segundos. O risco residual é sair do loader sobre canvas morto sem banner/reload, não ficar em 96% para sempre nesse caminho.                                                                                                                                              |
| B-10 Sets/frame        | Fato verdadeiro, severidade inflada              | P3/profile           | Dois Sets são alocados em [`OverlayPositionTracker.tsx:284-291`](../src/components/canvas/OverlayPositionTracker.tsx#L284), mas não foram demonstrados como gargalo. Usar double-buffer apenas após allocation profile; preservar a histerese.                                                                                                                                      |
| B-11 near plane        | Não demonstrado; cálculo GLM errado              | P3 hipótese          | White dwarf atual resulta em `near≈5,12e-4`, não `5e-7`; `near≥1e-4` não mudaria o caso. Log-depth está ativo. Não houve flicker observado. Criar cena de stress e medir antes de alterar o frustum.                                                                                                                                                                                |

### Performance P-1 a P-5

| ID                | Veredito                     | Prioridade corrigida | Evidência e decisão                                                                                                                                                                                 |
| ----------------- | ---------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-1 hooks/clock   | Rejeitado                    | Nenhuma              | Os hooks são UI e devem receber o tick de ~4 Hz. Só dois hooks têm consumidores, ambos no Sidebar; nenhum é `useFrame`. `getNow()` não é reativo e quebraria o contrato React.                      |
| P-2 osculating    | Parcial, muito superestimado | P3                   | A derivação faz três evals, mas orbit polylines usam buckets de 1 h a 30 dias e cache de 256 entradas. Memo por `(bodyId,bucket)` é válido; não há 360 evals/s demonstrados.                        |
| P-3 cache orbital | Majoritariamente obsoleto    | P3                   | Bucket é 0,864 s, não 0,86 ms; cache já tem teto de 2.000 e teste de warp. `parentId` não é lido por providers. Risco real: `registerProvider`/`registerBodyElements` não invalidam cache anterior. |
| P-4 SmartSunLight | Confirmado como oportunidade | P2                   | Há lookup/traversal e allocations por frame estável, mas a shadow projection já tem dedupe. Cachear target/layers por foco, memoizar extent e usar scratch vectors; medir 120 frames.               |
| P-5 uniforms      | Rejeitado sem profile        | Nenhuma              | Opacidade depende da câmera; eclipse roda só em Earth/Moon e muda continuamente. Three.js já mantém cache de uniforms. Não adicionar complexidade por contagem de assignments JS.                   |

### Riscos R-1 a R-13

| ID                              | Veredito                                 | Prioridade corrigida        | Evidência e decisão                                                                                                                                                                                             |
| ------------------------------- | ---------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1 `selectId(null)`            | Mecanismo confirmado, dormente           | P3                          | A action limparia foco/histórico, mas não há caller atual com `null`; fechamentos usam `setSelectedId(null)`. Restringir o tipo/contrato e testar antes de novos callers.                                       |
| R-2 rehydrate                   | Confirmado para hidratação assíncrona    | P2                          | Mutação direta em [`store.ts:646-656`](../src/store.ts#L646) não notifica assinante já montado. Derivar no `merge` ou action segura; testar storage sync e async.                                               |
| R-3 migração import-time        | Confirmado, baixo risco SPA              | P3                          | Há I/O no import; adicionar browser guard e proteção contra `SecurityError`. Não é bug atual de SSR porque o projeto é SPA.                                                                                     |
| R-4 cancelar voo                | Mecanismo confirmado                     | P1                          | Cancel handler encerra physics/aim, mas não reseta focus tracking. O target de voo pode ser reinterpretado como pan no frame seguinte. Adicionar teste de interrupt e reset atômico.                            |
| R-5 offset de câmera            | Confirmado, manifestação rara            | P1                          | `targetOffset.add(userPanDelta)` não tem clamp/sanity check em [`controls.ts:111-119`](../src/lib/camera/controls.ts#L111). Cobrir delta extremo/pole flip e limitar em função do raio/foco.                    |
| R-6 overlay 60 Hz               | Oportunidade real durante movimento      | P2/profile                  | Fingerprint evita idle writes, mas pan pode publicar a 60 Hz. O limite sugerido de 16 ms não muda nada. Comparar store externo/DOM imperativo/teto tierado de 30 Hz e erro visual.                              |
| R-7 i18n parcial                | Confirmado em runtime                    | P1 UX                       | Só dois componentes usam tradução; produto fica bilíngue e não há selector. Ver A-7.                                                                                                                            |
| R-8 locale Timeline             | Confirmado em runtime                    | P1 UX                       | `Intl(undefined)` segue navegador, não idioma do app. Passar `i18n.resolvedLanguage` e testar locale cruzado.                                                                                                   |
| R-9 Vitest node                 | Rejeitado                                | Nenhuma                     | Node é default apropriado para testes puros. Todos os TSX atuais declaram jsdom; DOM ausente falha, não vira no-op. Setup global é DRY opcional, não correção.                                                  |
| R-10 Playwright                 | Parcial                                  | P1 QA                       | `trace: on-first-retry` está dormente sem retries. `reuseExistingServer` já fica false em CI; Chrome do sistema reduziria determinismo. Adicionar retries/trace coerentes, projeto mobile e executar E2E no CI. |
| R-11 `noUncheckedIndexedAccess` | Oportunidade válida, esforço subestimado | P2 por ondas                | Auditoria ad hoc encontrou 214 diagnósticos de produção em 27 arquivos, não ~50. Ativar por onda sem `!` mecânico; a flag não corrige o parser JS de B-7.                                                       |
| R-12 texture cache              | Parcial; acoplado a A-3                  | P1 dentro da onda de assets | Retenção é finita pelo catálogo, não leak infinito, mas high/ultra não têm budget. “Primeiro colorSpace vence” existe, porém nenhuma URL conflitante atual foi encontrada. Teto alto e assertion de conflito.   |
| R-13 satélites                  | Parcial; problema real mais grave        | P0/P1                       | Proveniência existe no código; epoch do Kepler propagado está correto. O problema é drift atual massivo, UI opaca e getters de satélite/asteroide avançarem `M` mas devolverem epoch-base. Ver A-1/A-2.         |

## Outros itens do relatório externo

### Confirmados, mas pequenos

- Sidebar calcula Sun a ~4 Hz mesmo sem corpo curado selecionado.
- `setAccessibility` não faz dedupe.
- `Overlay` omite `requestPanel` da dependency list, embora a closure atual só
  capture setter estável.
- Portabilidade do `base: "/atlas-orbital/"` é limitada, mas está correta para
  o GitHub Pages atual.
- Primitives duplicadas são dívida de manutenção, não prioridade de produto.

### Rejeitados ou já corrigidos

- O cleanup de `dismissBootSplash` existe: o helper devolve o cancelador usado
  pelo effect.
- `inferTextureEdge("16k")` não “infla 16×”; para um arquivo realmente 16k, a
  estimativa quadrática seria coerente. O bug atual é o inverso: filenames
  mentem sobre a dimensão real.
- App-shell e UI-subtree já têm ErrorBoundary. Continua faltando boundary
  scene-wide dentro do reconciler R3F, como o próprio
  [`main.tsx:41-47`](../src/main.tsx#L41) documenta.

## Plano de remediação em ondas

### Onda 0 — verdade orbital renderizada

1. Remover a rotação dupla sem quebrar orientação visual do pai.
2. Adicionar regressão engine→world position para quatro sistemas de luas.
3. Medir envelopes Horizons atuais e marcar/limitar modelos two-body.
4. Corrigir primeiro Phobos, Io e Enceladus; depois o restante.

**Gate:** posição mundial dentro do envelope declarado, sem alterar a esfera ou
orientação visual do planeta.

### Onda 1 — alcance, assets e publicação

1. Manifest dimensional autoritativo e variantes reais por tier.
2. LOD baixo no overview, fila de assets e budgets finitos.
3. Rejeição de textura acima de `MAX_TEXTURE_SIZE`.
4. CI obrigatório antes de deploy.
5. Corrigir CSP/WASM e manter console limpo.
6. Degraded banner, reload/retry e boundary R3F scene-wide.

**Gate:** hardware 4096/8192, budgets de rede/VRAM, zero context loss, E2E
Chromium de um worker e deploy condicionado aos gates.

### Onda 2 — precisão e honestidade científica

1. ΔT por eras com incerteza/limites.
2. Autoridade única de rotação/orientação e registro de asset.
3. Validade real de asteroides.
4. Consistência física de Vanth/Weywot.
5. `visualProvenance` para todos os assets não observacionais.

**Gate:** fixtures oficiais, invariantes dimensionais e UI de proveniência.

### Onda 3 — UX, i18n e acessibilidade

1. Extrair todo texto, adicionar seletor e sincronizar `html lang`.
2. Locale explícito em Timeline e demais `Intl`.
3. High Contrast real.
4. Gear/Esc, focus restoration e landmarks.
5. Targets touch de 44 px, projeto mobile e interação estelar touch.
6. Date picker/“Agora” com validade científica visível.

**Gate:** matriz en/pt-BR × desktop/mobile × teclado/touch, sem texto híbrido.

### Onda 4 — performance medida e hardening

1. Snapshot temporal numérico único por frame e epochs memoizados.
2. SmartSunLight cacheado por foco.
3. Profile do overlay durante pan antes de limitar frequência.
4. Invalidação do cache ao registrar providers.
5. Rehydrate reativo e contratos de actions dormentes.
6. `noUncheckedIndexedAccess` por subsistemas.

**Gate:** profiles antes/depois; nenhuma otimização aceita apenas por contagem
estática de assignments.

## Verificação executada

### Código, dados e matemática

- Sweep Kepler em todo o intervalo e catálogo atual.
- Comparações contra JPL Horizons para luas e asteroides.
- Varredura das 119.626 linhas do HYG 4.2.
- Metadata real de textura lida com Sharp e estimativa RGBA/mipmaps.
- Auditoria temporária com `noUncheckedIndexedAccess`: 214 diagnósticos em 27
  arquivos; nenhuma config foi alterada.

### Gates locais

| Gate                                                 | Resultado                                                                                      |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run test:run`                                   | **Passou:** 100 arquivos, 1.774 testes                                                         |
| `npm run lint`                                       | **Passou**                                                                                     |
| `npm run build`                                      | **Passou**; warnings de chunks `three-vendor`/`astronomy` >500 kB e Browserslist desatualizado |
| `npm run docs:check`                                 | **Passou**                                                                                     |
| Playwright runtime direcionado                       | Desktop, locale cruzado, teclado, console e falha parcial de catálogo executados               |
| `npm run test:e2e` após instalar Chromium versionado | **8/9 passaram**; `hyg-focus` ficou no loader por 55 s na execução paralela                    |
| `hyg-focus` isolado, 1 worker                        | Chegou ao fim do fluxo, mas **falhou pelo erro CSP/WASM**, confirmando A-5                     |

A suíte unitária verde emite warnings de `act(...)`, fetch relativo no ambiente
Node e storage persist indisponível. Eles não falharam o gate, mas devem ser
limpos para que warnings novos voltem a ter sinal.

### Limitações explícitas

- Mobile runtime não foi concluído; **mobile não está aprovado**.
- Não foi medido pico real de VRAM do driver; os valores de textura são
  estimativas conservadoras a partir das dimensões.
- A manifestação visual de B-11 não foi reproduzida.
- O hard-fail simultâneo dos dois arquivos HYG não foi concluído em runtime; o
  comportamento fail-open e a ausência de banner estão confirmados por
  código/teste.
- Nenhuma correção, commit, branch ou publicação foi feita.

## Critério de encerramento

Esta auditoria deve ser considerada resolvida somente quando:

1. A-1 tiver teste de posição mundial e correção verificada.
2. Luas rápidas exibirem erro/validade honestos ou uma solução orbital melhor.
3. Cada tier tiver orçamento de asset verificável e limite de dimensão real.
4. Deploy depender dos gates e o E2E tiver console limpo.
5. i18n/a11y/mobile tiverem matriz de QA executável.
