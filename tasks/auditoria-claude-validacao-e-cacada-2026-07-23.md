# Auditoria Claude — validação do parecer Codex + caçada independente

**Data:** 2026-07-23
**Baseline:** `main` em `b541a6d`
**Escopo:** (a) validação executável item-a-item de `tasks/auditoria-validacao-glm-e-oportunidades-2026-07-23.md`; (b) caçada independente em 10 frentes com refutação adversarial por achado.
**Estado:** análise concluída. **Nenhum arquivo do repositório foi modificado.**

Este documento é companheiro do parecer Codex, não substituto. Onde ele diverge do
Codex, a divergência está marcada e acompanhada da medição que a sustenta.

## Método

Toda alegação numérica aqui foi **medida**, não inferida:

- módulos reais do repo empacotados com `esbuild` e executados em node (engine
  orbital, cache de textura, física estelar, resolvedor de foco);
- verdade de campo = as **85 fixtures de corpo** NASA JPL Horizons **já presentes** em
  `src/test/fixtures/horizons/` (86 JSON, um deles é `index.json`;
  `referenceFrame: J2000_ECLIPTIC`);
- dimensões de imagem lidas por magic-byte (PNG IHDR / JPEG SOF / WebP), não pela extensão;
- runtime medido com Playwright headless contra `vite preview` do build de produção
  (rede, VRAM via hook em `texStorage2D`, console, layout em viewport móvel);
- gates locais executados: `lint` (31 s), `test:run` (32 s, 1774/1774), `docs:check` (1 s),
  `build` (41 s) — todos verdes; `playwright test` → **7 passaram, 2 falharam**.

Cada achado da caçada com severidade P0/P1 passou por um agente cético instruído a
**refutá-lo**, com viés explícito de refutar em caso de dúvida. 108 achados brutos →
4 derrubados, 34 rebaixados de severidade, 104 sobreviveram.

## Parte 1 — Veredito sobre o parecer Codex

O parecer está **direcionalmente correto e materialmente furado em quatro pontos**.
Os fatos que ele levanta existem; em quatro casos a ação que ele recomenda levaria o
projeto para o lado errado.

| Alegação                     | Codex      | Verificado             | Correção material                                                             |
| ---------------------------- | ---------- | ---------------------- | ----------------------------------------------------------------------------- |
| A-1 dupla rotação das luas   | P0         | **CONFIRMADO** P0      | Números batem exato; mas o fix é deleção de 5 linhas, e regride Caronte       |
| A-2 drift de efemérides      | P0/P1      | **PARCIAL** P1         | Causa-raiz é outra; ação recomendada estava errada                            |
| A-3 pipeline de texturas     | P0/P1      | **CONFIRMADO** P0      | Direção do erro de estimativa é invertida; budget inerte em _todos_ os perfis |
| A-4 deploy sem gate          | P0         | **PARCIAL** P1         | `.husky/pre-commit` já roda lint; descoberto é `test:run` + `docs:check`      |
| A-5 CSP bloqueia WASM        | P1         | **CONFIRMADO** P1      | Pacote identificado; o fix proposto é o errado                                |
| A-6 consistência física      | P1         | **CONFIRMADO** P1      | Codex viu 3 defeitos; existem ~20                                             |
| A-7 i18n / a11y              | P1         | **CONFIRMADO** P2      | Codex deu como ausente uma infra de teclado que existe                        |
| B-11 near plane              | Rejeitado  | **REJEIÇÃO ERRADA**    | Erro de ~1160× no número que fundamentou a rejeição                           |
| B-2, B-5, B-7, P-1, P-5, R-9 | Rejeitados | **Rejeições corretas** | Reproduzidas uma a uma; ver ajustes de registro                               |

### C-1 — A-2: o Codex mandaria documentar um bug de uma linha

O Codex tratou o drift das luas como limite inerente de propagação two-body e propôs
gerenciar o sintoma (renomear modelos, envelope de erro por corpo, exibir incerteza).

A causa é outra e é evitável. [`satellites.ts:352`](../src/lib/orbital/analytical/satellites.ts#L352)
deriva o movimento médio `n` do semi-eixo **osculador** extraído de um único vetor de
estado, e as linhas 19-20 vendem isso como feature. Sob J2 do primário o `a` osculador
oscila em torno do `a` médio; impor Kepler-III sobre ele produz `n` errado.

Erro de `n` medido contra o movimento médio publicado (deg/dia):

| Corpo     | n do engine | n publicado | erro relativo |
| --------- | ----------: | ----------: | ------------: |
| Mimas     |    380,1488 |    381,9945 |       4,83e-3 |
| Enceladus |    262,0367 |    262,7319 |       2,65e-3 |
| Tethys    |    190,4008 |    190,6979 |       1,56e-3 |
| Io        |    203,3006 |    203,4890 |       9,26e-4 |
| Phobos    |   1127,9378 |   1128,8446 |       8,03e-4 |

Trocando **somente `n`** e mantendo todos os outros elementos, contra as mesmas
fixtures Horizons:

| Corpo     | atual @+365 d | corrigido @+365 d |
| --------- | ------------: | ----------------: |
| Phobos    |        27,96° |         **1,65°** |
| Enceladus |       107,36° |         **1,37°** |
| Tethys    |       108,42° |         **0,93°** |
| Io        |        68,81° |         **0,52°** |
| Mimas     |        46,13° |         **0,52°** |

Os 18 satélites caem para ≤ 2,61°. Custo: 18 constantes + um campo opcional.
Nenhuma teoria perturbada, nenhuma mudança de arquitetura.

Correção adicional: o Codex identificou Phobos como o pior corpo. Por erro relativo
de movimento médio o pior é **Mimas** (6× pior); ele só _parece_ melhor em
2026-07-23 por aliasing de fase (deriva bruta −1047,8°). Um envelope calibrado na data
de hoje, como o Codex propõe, calibraria Mimas errado.

### C-2 — A-3: a estimativa erra para cima, e o budget nunca dispara

O Codex afirma que a heurística de filename **subestima**. Medido no agregado do boot
em `high`: estimativa 3680 MiB vs RGBA real 2703 MiB — ela **superestima 1,36×**,
porque `estimateTextureByteSize` assume textura quadrada (`edge²×4`) enquanto todo
mapa planetário é 2:1 equirretangular. Um fix premissado em "multiplicar a estimativa"
iria na direção errada. Por arquivo ela erra nos dois sentidos: 33× para menos em
`uranus_texture_map_8k_…` (sem prefixo `Nk`, cai no default 1024), 16× para mais em
`8k_saturn_ring_alpha.png` (que é 8192×500).

O defeito mais fundo, que o Codex não viu:
[`deferredTextureCache.ts:131`](../src/lib/deferredTextureCache.ts#L131)
`selectEvictionVictims` exige `refCount === 0 && pinCount === 0`, e
[`useDeferredTexture.ts:42`](../src/hooks/useDeferredTexture.ts#L42)
segura `refCount` por toda a vida do componente montado, enquanto
`SolarSystem.tsx:50-81` nunca desmonta um `<Planet>`. **O conjunto evictável é vazio
em todos os perfis**, não apenas em high/ultra. Enquadrar como "high/ultra não têm
budget" sugere que balanced/constrained estão seguros. Não estão.

Terceira correção: `MAX_TEXTURE_SIZE` não é um muro. `three@0.181.2`
(`WebGLTextures.js:46-106`) faz downscale automático via canvas 2D. Não há rejeição de
GPU; há um resample **síncrono na main thread** e o `HTMLImageElement` em tamanho
integral retido em RAM. E em `MAX_TEXTURE_SIZE=16384` (desktop comum) não há downscale
nenhum: os 15960 px sobem verbatim.

Escala real do problema: `TEXTURE_VARIANT_MANIFEST` cobre **4 de 37** corpos com mapa.
A escada adaptativa inteira move o boot de 217,15 → 206,12 MiB — **5%**.

### C-3 — A-5: o fix proposto é o errado

O Codex enquadrou como "a CSP não permite WASM", cuja conclusão natural é afrouxar a
CSP com `'wasm-unsafe-eval'`.

Pacote identificado: `three-stdlib/libs/MeshoptDecoder.js:132`, puxado por
`@react-three/drei/core/Gltf.js:21` porque `useGLTF` tem `useMeshopt = true` por
default. Call sites: [`PlanetModel.tsx:50`](../src/components/canvas/PlanetModel.tsx#L50)
e [`AssetStudyApp.tsx:93`](../src/components/ui/AssetStudyApp.tsx#L93).

Parse binário dos dois únicos GLB: `extensionsUsed = null` nos dois. Não há
`.ktx2`/`.drc`/`.basis`/`.wasm` em `public/`. **O decoder é instanciado 100% em vão.**
O fix é `useGLTF(path, false, false)` em dois arquivos — não afrouxar a CSP para
habilitar código que nunca deveria rodar.

Duas imprecisões adicionais: "app cai em fallback JS" é falso (o único guard é
`typeof WebAssembly !== "object"`, e o objeto existe — só a compilação é bloqueada;
a promise rejeita sem `.catch()`). E a asserção E2E que quebra é
`e2e/hyg-focus.spec.ts:258`, não a de `boot.spec.ts:23` — esta passa por corrida de
tempo (termina em 1,1 s; o erro dispara em 2,2 s).

### C-4 — B-11: a única rejeição materialmente errada

O Codex rejeitou com "white dwarf resulta em `near ≈ 5,12e-4`, não `5e-7`". Ele avaliou
só o ramo HYG e usou o raio nominal de um comentário em vez de medir.

Medido nos dois ramos de [`CameraController.tsx:641`](../src/components/canvas/CameraController.tsx#L641):

- ramo HYG, mínimo real do tier `full`: raio 5,1054e-3 wu → **near 5,62e-5** (9× menor que o afirmado);
- ramo de corpos curados, mínimo global: **Deimos → near 4,4118e-7**.

Ou seja, o número do GLM (`5e-7`) estava a 12% do real, e a rejeição se apoiou num
valor **1160× maior**. E 192 estrelas HYG + 4 corpos curados ficam abaixo de `1e-4`,
contra o "não mudaria o caso" do parecer.

Ao investigar isso apareceu um bug que **nenhuma das duas auditorias viu** — ver N-2.

### Ajustes de registro nas rejeições corretas

- **B-2** — a rejeição se sustenta, mas a evidência citada é um ponto único. Sweep de
  4,0e6 avaliações: o solver quebra em **e ≈ 0,9936**; para todo `e ≤ 0,99` com `M`
  normalizado o residual máximo é 8,882e-16. A excentricidade máxima do catálogo é
  0,85 (Sedna) e todos os callers normalizam `M`. Substituir "M=6, e=.999 deu residual
  zero" pelo limiar medido.
- **B-5** — direção certa, magnitude errada. A troca proposta pelo GLM produz
  **136,879°** de erro, não "~23°".
- **B-7** — o Codex recomenda "manter teste de integridade". **Não existe nenhum**:
  `vitest.config.ts:6` limita o include a `src/**/*.test.{ts,tsx}` e `scripts/` nunca
  é executado pelo vitest. A recomendação correta é _criar_.
- **P-1** — conclusão certa, não quantificada. O desperdício custa **6 µs/s**. E 3 dos
  5 hooks exportados não têm consumidor algum.
- **P-5** — complacente: o mesmo bloco `Planet.tsx:389` roda
  `scene.getObjectByName()` a cada frame sem cache, exatamente a classe de problema
  que o parecer _confirmou_ como P-4 no SmartSunLight.

**Regra de processo sugerida:** rejeições apoiadas em um único ponto de avaliação
devem ser tratadas como não-verificadas. Duas das sete rejeições desta rodada foram
feitas assim, e uma estava errada por três ordens de grandeza.

## Parte 2 — Achados novos (nenhuma auditoria anterior viu)

### N-1 — P0/P1: o starfield inteiro está 136,8° fora do referencial da cena

**O maior erro de coordenada do aplicativo, e está no caminho padrão**
(`store.ts:283` → `starfieldSource = "hyg"`).

As posições `x,y,z` do HYG são cartesianas **equatoriais** J2000. Elas chegam cruas ao
buffer ([`Starfield.tsx:495`](../src/components/canvas/Starfield.tsx#L495) só multiplica
por `DISTANCE_SCALE`) e recebem apenas
[`rotation={[23.4°, 0, 0]}`](../src/components/canvas/Starfield.tsx#L630).

Falta a permutação de eixos `ecliptic2ThreeJs (x, z, −y)` que **todo o resto da cena**
usa (`coordUtils.ts:67`, consumido por vsop87Planets, keplerProvider, moonElp,
plutoMeeus, satellites, asteroids).

Verificado de forma independente (cálculo próprio, reproduzido em dois agentes):

| vetor              | correto (three)         | no código               |
| ------------------ | ----------------------- | ----------------------- |
| polo celeste norte | `(0, +0,9178, −0,3971)` | `(0, −0,3971, +0,9178)` |
| polo eclíptico     | `(0, 1, 0)`             | `(0, −0,7290, +0,6845)` |

Rotação relativa: **136,800°** (det = 1, rotação rígida pura).
Latitudes eclípticas verdadeiras vs renderizadas, medidas no CSV real: Polaris
66,14° → −22,95°; Sirius −39,57° → +77,48°; Vega 61,69° → −72,73°.

A mesma matemática está replicada em
[`hygFocusResolver.ts:163`](../src/lib/focus/hygFocusResolver.ts#L163) e
`StarHoverPicker.tsx:79-96`, então render, picking, labels e fly-to permanecem
**mutuamente coerentes** — formas de constelação preservadas, tooltip no lugar certo.
O defeito é a orientação da esfera celeste inteira em relação às órbitas e ao plano da
eclíptica, não um embaralhamento. Por isso é P1 e não P0.

Agravante: [`hygFocusResolver.test.ts:154`](../src/lib/focus/hygFocusResolver.test.ts#L154)
**crava a transformação errada como contrato** — assere que a estrela no polo celeste
norte vá para `(0, −sin ε, +cos ε)`. Qualquer correção quebra esse teste.

**Fix:** um helper único `eq → ecl → three` compartilhado por Starfield,
StarHoverPicker, HygStellarMesh e hygFocusResolver, reusando
`AstroPhysics.equatorialToEcliptic` + `ecliptic2ThreeJs`. Teste-âncora: Regulus
(latitude eclíptica +0,48°) deve cair com `|Y| / |r| < 0,01`.

### N-2 — P1: `camera.near` vaza para a cena inteira ao desfocar

[`CameraController.tsx:607`](../src/components/canvas/CameraController.tsx#L607) faz
early-return quando `focusId` fica null **sem restaurar `camera.near`**. O near só é
apertado dentro do effect de foco (`near = max(1e-7, raio × 0.011)`) e nunca volta ao
default `0.1` de `Scene.tsx:398`.

Consequência: depois de focar Deimos e desfocar, **a cena inteira renderiza com
`near = 4,41e-7` e `far = 1e15`** — razão 2,27e21. `logarithmicDepthBuffer` está ativo
e provavelmente evita flicker observável, mas o estado é indefensável.

### N-3 — P0: mobile — o painel do corpo selecionado renderiza fora da tela

Medido no app rodando (viewport 375×812, TITAN selecionado):
`sidebar.getBoundingClientRect()` = `{x: 12, y: −76, w: 375, h: 471}`; o `<h1>` com o
nome do corpo fica em `y = −36`, **100% acima do viewport**.

Causa: [`Sidebar.tsx:83-88`](../src/components/ui/Sidebar.tsx#L83) aplica
`command-shell panel-scan tech-corners` **no mesmo elemento** que recebe
`fixed left-3 right-3 bottom-[…]`. Três dessas classes declaram `position: relative`
em [`index.css:60`](../src/index.css#L60), `:154` e `:181` **fora de qualquer
`@layer`** — e regra não-layered vence `.fixed` do Tailwind v4, que vive em
`@layer utilities`.

O aprendiz clica num corpo e não consegue ler qual corpo é. O fluxo principal do
produto está quebrado no formato de tela mais comum. Desktop não é afetado.

**Fix (XS):** mover as classes decorativas para um filho, como já é feito em
`SearchBar.tsx:557` e `GearPopover.tsx:86`. Estrutural: envolver os utilitários
decorativos de `index.css` em `@layer components`, o que mata a classe inteira de bugs
futuros.

### N-4 — P1: Reduced Motion não desliga o voo de câmera de 12 s

Medido com contexto Playwright `reducedMotion: "reduce"`:
`matchMedia(...).matches === true`, store `accessibility.reducedMotion === true`,
`html[data-reduced-motion="true"]` — e mesmo assim os overlays dos planetas (projeção
direta da câmera) varreram 150-350 px em ~3 s.

Nenhum módulo de câmera lê a preferência: `grep -rln "reducedMotion" src/lib/` retorna
vazio (nem `CameraTransition.ts`, nem `aimLerp.ts`, nem `orientationLerp.ts`, nem
`StellarFlightTransition.ts`), e `InitialCameraAnimation.tsx:11` tem
`INTRO_DURATION_MS = 12000` com `useFrame` incondicional.

Usuários com sensibilidade vestibular recebem náusea induzida **apesar de terem
declarado a preferência**. É dano de saúde, não incômodo — e quebra a confiança no
painel de acessibilidade inteiro.

### N-5 — P1: Triton erra 80,6° **na própria época da fixture**, e o gate aprova

Medido contra as 85 fixtures de corpo: `triton 2025-01-01 → 80,57°`; `2025-07-01 → 80,00°`;
`2026-01-01 → 100,15°`. A fixture de 2025-01-01 é a época de referência — todos os
outros satélites dão 0,00° nela. Não é drift; é erro estrutural.

[`regression.test.ts:144`](../src/lib/orbital/regression.test.ts#L144) define
`triton: { maxAngularErrorDeg: 150 }` e a linha 409 assere `< tol`. 80,57 < 150 → passa.

Causa: Triton não tem entrada derivada de fixture em `satellites.ts`; cai no Kepler
genérico com `O = w = M0 = 0`.

### N-6 — P1: 9 corpos Kepler-only têm orientação orbital fabricada

`O = w = M0 = 0` simultaneamente em triton (`:1017`), gonggong (`:1441`), quaoar
(`:1489`), orcus (`:1537`), sedna (`:1585`), salacia (`:1634`), charon (`:1683`),
vanth (`:1718`), weywot (`:1765`). Hygiea/Vesta/Pallas usam `M0` = 100/20/50
(números redondos = placeholder).

Ressalva de formulação (revisão Codex, aceita): para órbitas quase circulares `ω` é
degenerado e `Ω = ω = 0` **é** convenção legítima — chamar isso de "fisicamente
impossível", como este laudo fazia, é excessivo. O defeito auditável é outro e
permanece: não há `epoch`, `frame` nem fonte que permitam distinguir convenção
legítima de placeholder, e `M0 = 0` simultâneo nos nove **não** é convenção — é fase
não informada. A UI apresenta o resultado como cálculo físico de qualquer modo.

O painel lateral calcula distância e velocidade em cima dessas posições e exibe badge
`Kepler`, que sugere método, não invenção.

### N-7 — P1: a tabela Kepler de fallback não está referenciada a J2000

[`keplerProvider.ts:194`](../src/lib/orbital/keplerProvider.ts#L194) assume
`daysSinceJ2000 = jdTDB − 2451545.0` para todos. Separação analítico-vs-Kepler **na
própria época J2000**: mercury 0,12°, earth 0,06° (OK) mas **ceres 150,06°, moon
136,44°, pallas 88,95°, vesta 49,88°**.

Descontinuidades alcançáveis arrastando a Timeline: Plutão salta **23,66°** ao cruzar
2099→2100; Ceres/Pallas/Vesta saltam 137,8°/62,4°/12,8° ao cruzar 2050. Para o usuário
parece bug de render; é troca silenciosa de modelo (`logFallbacks: false`).

Correção de registro (revisão Codex): os "2,59 AU" que este laudo trazia para Plutão
eram a diferença dos **módulos radiais**. O deslocamento real da posição 3D é
**19,70 AU**. Ceres salta 5,20 AU, Pallas 2,46 AU, Vesta 0,48 AU. O número correto é
uma ordem de grandeza pior que o publicado aqui originalmente.

### N-8 — P1: WebGL indisponível = loader travado em 8% para sempre

Medido com `getContext` retornando null para qualquer tipo contendo `webgl`, contra o
build de produção. Amostragem a cada 5 s por 40 s: `{"loader": "8% op=1", "alert": null}`
em todas. Único sinal é um `TypeError` no bundle minificado. Nenhum `[role=alert]`,
nenhum crash card. Perda total do produto para toda uma classe de usuários,
apresentada como app quebrado em vez de requisito não atendido.

### N-9 — P0/P1: o custo real de boot

Medido com Playwright contra o build de produção, **zero cliques**:

| cenário                       | requests |         total |        texturas |
| ----------------------------- | -------: | ------------: | --------------: |
| Desktop 1280×720 (tier ultra) |       86 | **192,29 MB** | 167,51 MB em 42 |
| Mobile 390×844@3× (tier low)  |       83 | **181,68 MB** | 159,90 MB em 39 |

O tier de qualidade **funciona para o HYG** (baixou `hyg-v1-low.bin.gz`, 0,02 MB) e
**não funciona para texturas**. `usePlanetAssets.ts:42` usa
`assetPriority <= 2 || mapSalience >= 0.35` — o `||` curto-circuita a saliência,
então todo corpo carrega no overview onde cada um ocupa ~2 px.

VRAM medida via hook em `texStorage2D` (RTX 3070): **~3,9 GB**, e ~4,0 GB mesmo em
`constrained`. Em hardware capaz a alocação sucede (`isContextLost() === false` por
77 s em 2/2 runs); em GPUs de 2-4 GB ou iGPU a mesma demanda derruba o contexto.

Custo por textura, medido no browser real (`createImageBitmap` + `texImage2D` + `finish`):
`4k_enceladus.jpg` (15960×7980) = decode 559 ms + **upload bloqueante 334 ms**, 648 MB
de VRAM com mipmaps. Contra `4k_titania.png` (4096×2048): 103 ms + 21,6 ms, 43 MB.

**Ganho de maior valor por linha em toda a auditoria:** quatro downscales 2k já estão
no disco e não são referenciados — `2k_mercury.jpg`, `2k_moon.jpg`,
`2k_venus_surface.jpg`, `2k_sun.jpg` — enquanto os 8k correspondentes carregam em
**todo** perfil. Quatro linhas em `textureVariantManifest.ts` = −33 MiB de rede e
−360 MiB de RGBA.

Item relacionado: `Haumea_1_1000.glb` = 10,81 MB baixados no boot, sendo **9,23 + 1,56 MB
de PNGs embutidos** para 23 KB de geometria (960 triângulos). 99,8% do payload é
textura que o sistema de qualidade não enxerga.

### N-10 — P1: catálogo físico (além dos 3 casos do Codex)

- **Vanth: densidade de 16,59 g/cm³** — fisicamente impossível (máximo do Sistema Solar
  é 5,51, da Terra). A massa está ~8× alta. Também `n = 90` (P = 4 d) contra
  P_kepler = 9,52 d → **orbita 2,4× rápido demais na tela** (é Kepler-routed, então
  `orbit.n` é consumido de verdade). E `rotationPeriodHours: 9.5` contra texto
  "Synchronized (~9.5 **days**)" — troca de unidade, gira 24× rápido demais.
- **Weywot congelado:** `rotationPeriodHours: 0` é falsy e
  [`Planet.tsx:251`](../src/components/canvas/Planet.tsx#L251) usa
  `if (body.rotationPeriodHours)` — o bloco de rotação nunca executa, contra texto
  "Synchronized (~12 days)". Massa `"~3.3 × 10¹8 kg"` tem expoente malformado
  (`¹` U+00B9 + `8` ASCII), e
  [`astrophysics.test.ts:23`](../src/lib/astrophysics.test.ts#L23) **consagra o typo
  como caso de teste** ("mixed exponent glyphs") em vez de corrigir o dado.
- **Eris orbita 1,77× lento demais** (`n: 0.001` vs 0,0017665) — erro de taxa maior que
  o do Weywot, mesmo mecanismo, não visto por ninguém.
- **7 TNOs com `g ≠ GM/R²`** de −37% a +23% (quaoar, orcus, sedna, salacia, makemake,
  gonggong, umbriel). Verificado que **não** é efeito centrífugo. Saturno (−7,0%),
  Júpiter (−4,7%), Haumea (+9,5%), Deimos (+9,3%) e Pallas (+7,0%) **não** são bugs
  (achatamento + rotação explicam integralmente) — uma correção cega pioraria o dado.
- **Textura do Urano** é asset de DeviantArt cuja licença o próprio
  `assetManifest.ts:234` registra como "not documented in repo", sem `visualProvenance`
  — mesma violação que o Codex apontou em Haumea/Makemake, só que sobre um planeta.

### N-11 — P0 (causa-raiz sistêmica)

> **O projeto entrega o mecanismo de qualidade em uma fatia-piloto e trava a lacuna com
> testes de allowlist. A suíte verde prova o piloto, não o produto.**

Medido, o mesmo padrão em cinco subsistemas independentes:

| mecanismo                  | cobertura                                 | como a lacuna é travada                                                         |
| -------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------- |
| `visualProvenance`         | 10 / 45 corpos (22%)                      | `celestialBodies.test.ts:12-23` itera lista literal com exatamente esses 10 ids |
| `validityRange`            | 13 / 45 entradas (29%)                    | `isWithinValidityRange` retorna `true` incondicional para os demais             |
| `VISUAL_ASSET_MANIFEST`    | 11 / 47 assets (23%)                      | nenhum teste exige entrada por asset referenciado                               |
| `TEXTURE_VARIANT_MANIFEST` | 4 / 37 corpos (11%)                       | fallback silencioso para `canonical`                                            |
| i18n                       | 2 / 53 componentes (3,8%)                 | teste de paridade só cobre as 33 chaves que existem                             |
| fixtures Horizons          | 28 / 45 corpos em `REPRESENTATIVE_BODIES` | nenhum TNO do bloco de defeitos de catálogo (N-10) está coberto                 |

Vesta tem disclosure de proveniência, Makemake não. Ceres avisa que sai da validade em
2050, Triton nunca avisa. O CI verde não detecta nenhuma dessas assimetrias.

**Fix estrutural:** inverter a forma de todo teste de cobertura de domínio — trocar
listas literais por `it.each(SOLAR_SYSTEM_BODIES)` com uma allowlist **explícita e
datada** de exceções conhecidas (`KNOWN_GAPS`), de modo que adicionar um 46º corpo
quebre o build até que sua proveniência, validade e licença existam. Converte cinco
dívidas invisíveis em falha mecânica na próxima adição.

## Parte 3 — Inventário restante (P2/P3)

104 achados sobreviveram; 41 passaram por refutação adversarial. Os P0/P1 estão acima.

**Auditabilidade (ressalva aceita da revisão Codex):** a evidência item-a-item dos
P2/P3 vive no transcript do run (`.claude/.../workflows/wf_0f577a57-e29/journal.jsonl`),
que **não está no checkout**. Os P0/P1 acima são auditáveis pelo que está escrito aqui;
os P2/P3 abaixo devem ser tratados como **fila de hipóteses a confirmar**, não como
achados verificados. Cada um precisa de re-verificação antes de virar tarefa.

**QA (11)** — cobertura reportada é 80,5% mas a real é **49,8%** (`coverage.include`
ausente esconde 58 arquivos / 3391 statements); a tolerância de Phobos (200°) é
matematicamente inviolável — a asserção nunca pode falhar; a ponte
store ↔ simulationClock (o mecanismo de controle de tempo do app) tem **zero** testes;
testes unitários fazem **I/O de rede real** (fetch do catálogo HYG), sem `setupFiles`
nem stub de fetch; o gate de regressão visual roda em um único frame, travado a win32,
e tolera um bloco cego de 96×96 px; `tsc -b` não cobre nenhum arquivo de `e2e/`.

**Acessibilidade (11)** — canvas 3D 100% invisível para leitor de tela, sem alternativa
textual; **cinco tokens de cor reprovam AA 4.5:1** (pior caso medido 2,16:1); os únicos
alvos de clique dos corpos celestes têm **12×12 px** (metade do mínimo WCAG); a ordem
de tabulação dos corpos é por saliência e **muda a cada frame**; o boot (20-60 s) é
totalmente silencioso para tecnologia assistiva; `<html lang>` nunca sincroniza; o
slider "UI Scale" não escala 2/3 do texto (132 declarações usam px fixo);
`e2e/a11y.spec.ts` **não roda axe-core** e assere que o High Contrast continue
`disabled` — o único teste de a11y do repo trava a feature morta como contrato.

**Resiliência (11)** — falha de chunk lazy é cacheada para sempre e o botão "Try again"
nunca funciona; nenhum fetch de asset tem timeout ou retry; falha de textura é
registrada e nunca lida; `console.error` sem throttle dentro de `useFrame` (60
erros/s); `wikipediaCache` memoiza a promise rejeitada de `openDB` — IndexedDB
indisponível envenena o cache pela sessão inteira; o boot splash do `index.html` não
tem estado de falha nem timeout.

**Segurança / build (11)** — `cdn.jsdelivr.net` é dependência de runtime **obrigatória**
no boot padrão (fonte SDF via troika), sem SRI e sem fallback; a CSP é injetada por
replace de string exata **sem nenhum teste** — 4 de 5 variações plausíveis do
`index.html` produziriam página sem CSP; `download-textures.js` abre o write stream
antes de checar o status (um 404 deixa arquivo de 0 byte no destino final);
`download-hyg.js` segue `Location` para host arbitrário sem allowlist; Actions fixadas
por tag mutável num job com `pages:write` + `id-token:write`; `public/Docs/` publica
276 KB de documentos internos no site.

**Performance (8)** — 1,86 MB (681 kB gzip) de tabelas VSOP87/ELP no caminho crítico
**pré-primeiro-paint** por causa de um barrel re-exportador; `three-vendor` (396 kB
gzip, 91 ms de eval) carregado avidamente, anulando o lazy-loading do Scene; 9 PNGs
servidos como PNG porque a allowlist de WebP tem 3 nomes (53 MB desperdiçados);
artefato de deploy de **327 MB por push**.

**Estado / React (7)** — `useDialogFocus` remonta o focus-trap a cada render e rouba o
foco (onClose instável na dep array); `CameraController` agenda `setupCamera` em
double-rAF sem cleanup; `surfaceModeActive` nunca é limpo quando o foco vira uma
estrela HYG (pointer lock e OrbitControls ficam desabilitados).

**Three.js (8)** — 41 geometrias de esfera 64×64 duplicadas, sem geometria compartilhada
e sem LOD; o controle "Shadow Map Size" do painel Display **não tem efeito** depois do
boot; LightGlow e LensFlare montam 2 EffectPasses fullscreen extras em todo tier
não-constrained sem gate.

**UX de produto (10)** — **não existe estado em URL**: é impossível compartilhar ou
favoritar uma vista ("Titan em 2030"); viagem no tempo só tem taxa, não destino; o
tutorial ensina uma aba "Project" que **foi removida do produto** e acende um holofote
sobre um painel invisível; a busca falha em nomes alternativos e em qualquer consulta
de mais de uma palavra; em mobile, fechar o painel deixa a câmera presa num corpo sem
migalha para voltar.

**Deleção (9)** — `src/lib/math/` é subsistema inteiro morto (515 LOC de produção com
zero call sites + 504 LOC de teste que só afirmam a si mesmos); `src/utils/astronomy.ts`
126 linhas 100% mortas duplicando o pipeline vivo; 123 exports sem referência externa
em 49 arquivos; `clamp/lerp/smoothstep` reimplementados 15 vezes com `three.MathUtils`
já importado 52×; `AssetStudyApp` (586 linhas de ferramenta de dev) empacotado e
publicado em produção; 14 MB de texturas órfãs commitadas e publicadas em `dist/`.

## Parte 4 — O que **não** é problema (refutado por medição)

Registrado para não ser re-investigado:

1. **`webglcontextrestored` cosmético** — refutado. `three@0.181.2` registra os próprios
   listeners: `onContextLost` já chama `preventDefault()`, `render()` faz early-return
   enquanto o contexto está perdido (o loop vira no-op, não trabalha num contexto morto)
   e `onContextRestore` chama `initGLContext()`. O handler do app é redundante, não ausente.
2. **830 ms de main thread bloqueada antes do primeiro paint** — refutado por medição.
   FCP = 136-140 ms em duas cargas frias independentes, ~220 ms **antes** de o eval do
   módulo começar, porque `index.html:301-332` tem boot-splash completo com CSS inline.
3. **CVE do vite dev server (GHSA-p9ff-h696-f583)** — refutado: as precondições do
   advisory (`server.host` ou `--host` expondo à rede) não são atendidas. Não há bloco
   `server` no `vite.config.ts` e `dev` é `vite` puro (loopback).
4. **`_legacy/` custa 7,49 MB a todo clone** — o fato é verdadeiro, o payoff é falso.
   `git rm --cached` não remove blobs do histórico; economia real de clone = 0 bytes.
   (O diretório continua sendo 195 mil linhas de ruído no working tree para busca.)

## Parte 5 — Correções aplicadas aos próprios agentes desta auditoria

Registrado por honestidade de método — nem todo output de subagente sobreviveu à revisão:

- **Triton/Charon (contra o agente A-1):** ele afirmou que `triton i: 156.8` é o valor
  eclíptico e que a remoção do quatérnion melhora. Calculei: 156,8 é o valor relativo
  ao **equador** de Netuno (verdade eclíptica = 129,81°). Sem quatérnion → 156,80°
  (erro 27,0°); com → 158,69° (erro 28,9°). Está quebrado nos dois estados porque
  `O = 0` é fabricado; a remoção é empate, não melhoria. **Charon** é o caso que
  importa: sem quatérnion 0,00°, com 122,53°, verdade ~112,8° — o quatérnion é
  _load-bearing_ e a remoção troca ~10° de erro por 112,8°.
- **`8k_pluto.jpg` (contra o agente de perf):** ele reportou 14601×31589 = 2,35 GB de
  VRAM, o "pior ofensor". Medido por magic-byte: o arquivo é um **PNG de 2912×1440**
  (6,2 MB) com extensão `.jpg`. O agente fez parse de JPEG num PNG. O número correto
  está no laudo A-3. (O fato de um PNG estar mascarado de `.jpg` continua sendo real e
  derrota qualquer pipeline futuro baseado em extensão.)
- **Starfield vs obliquidade:** os laudos parecem conflitar (136,8° vs 0,039°). Não
  conflitam: o agente META comparou as _constantes_ de obliquidade entre subsistemas
  (23,4 vs 23,43928); o caçador achou que a _transformação inteira_ está errada. Ambos
  procedem, e o segundo domina.

## Parte 6 — Ordem de execução

A ordem importa mais que a lista.

**Onda 0 — desbloqueio (XS, faça primeiro)**

1. `useGLTF(path, false, false)` em dois arquivos. **Antes** do gate de CI, senão o gate
   entra vermelho.
2. Quatro linhas em `textureVariantManifest.ts` (2k mercury/moon/venus/sun): −33 MiB de
   rede, −360 MiB de RGBA. **Não é "risco zero"** (ressalva Codex aceita): exige
   comparação visual antes/depois e teste do resolvedor por profile, e reduz apenas
   high/balanced/constrained — `ultra` continua preferindo o canônico 8k.
3. Mover as classes decorativas do `Sidebar` para um filho — conserta o produto em mobile.
4. Restaurar `camera.near` no early-return de `CameraController.tsx:607`.

**Onda 1 — verdade renderizada (S/M)**

5. Corrigir `n` dos 18 satélites (erro máximo 165° → 2,61°).
6. Deletar as 5 linhas do quatérnion em `Planet.tsx:973`, **junto com** o tratamento de
   Charon (derivar elementos eclípticos reais de uma fixture Horizons nova, centro `500@999`).
7. Helper único `eq → ecl → three` para o starfield; reescrever
   `hygFocusResolver.test.ts:142-160`, que hoje crava o erro.
8. Teste de posição **mundial** (não de engine) para as quatro famílias de luas — o
   invariante que faltava e que deixou 395 testes verdes com o bug presente.

**Onda 2 — gates (XS/S)**

9. `lint` + `test:run` + `docs:check` no `deploy.yml` (os três verdes hoje; ~64 s no job
   existente, sem duplicar `npm ci`). **Não** incluir E2E ainda — `boot.spec.ts:83` falha
   por motivo independente e pré-existente.
10. Inverter os testes de allowlist para `it.each` + `KNOWN_GAPS` (N-11). É o item que
    impede a recorrência de todo o resto.
11. `coverage.include` no vitest — a cobertura real é 49,8%, não 80,5%.

**Onda 3 — honestidade científica e dados**

12. Lote de correção do catálogo (Vanth, Weywot, Eris, os 7 TNOs, rotação vs texto) +
    gate de invariante dimensional.
13. `visualProvenance` para haumea, makemake, urano, eris.
14. `epochJD` por corpo no `keplerProvider`; elementos reais para os 9 Kepler-only.
15. Renomear `*MeanElements` → `*TwoBodyOsculating`; remover "with secular drift" de
    `registry.ts:31`; corrigir `README.md:62-64` (a equivalência com Lieske L1 / TASS17 /
    GUST86 / MARSSAT é a afirmação mais falsa do repositório sobre precisão).

**Onda 4 — alcance e UX**

16. Gate de assets por saliência real; teto de VRAM finito em todos os tiers;
    reamostrar os 4 arquivos gigantes offline.
17. Reduced Motion nos módulos de câmera. É o item de a11y com maior dano real.
18. Probe de WebGL + card de fallback; watchdog fora do `<Canvas>`.
19. `@axe-core/playwright` + projeto mobile no Playwright — sem eles nenhuma correção de
    a11y tem gate de regressão.

## Parte 7 — Adendo: resposta à revisão Codex do dia 2026-07-23

A revisão Codex (`auditoria-codex-validacao-claude-2026-07-23.md`) fez ~10 correções
legítimas, já incorporadas acima. Restam dois pontos que exigem arbitragem.

### R-1 — D-5 do Codex está errado: `useGLTF(path, false, false)` resolve sim

**Resolvido: o Codex retificou D-5 na segunda revisão e a objeção caiu.** O registro
abaixo fica porque a conclusão é acionável e porque ele fechou o desempate com uma
evidência mais forte que a minha — um build temporário com
`useGLTF(path, false, false)`: GLB carregado, cena montada, **zero erros**, contra um
`CompileError` no build atual.

Alegação original do Codex: _"o decoder é um IIFE que chama `WebAssembly.instantiate`
quando o módulo é avaliado"_, com prova de que um bundle mínimo _contém_
`WebAssembly.instantiate` e `meshopt_decodeVertexBuffer`.

**Refutado por três medições independentes.**

1. **Leitura.** `node_modules/three-stdlib/libs/MeshoptDecoder.js:2` é
   `const MeshoptDecoder = () => {` — uma **arrow function atribuída a const**, não um
   IIFE. A linha 132 (`WebAssembly.instantiate`) está dentro do corpo dela, indentada
   em dois espaços, depois de um `return { supported: false }` na linha 123.
2. **Execução em node.** Hook em `WebAssembly.instantiate` + `WebAssembly.validate`:

   | passo                                             | `instantiate` | `validate` |
   | ------------------------------------------------- | ------------: | ---------: |
   | após `import` do `MeshoptDecoder.js`              |         **0** |      **0** |
   | após `import` do `@react-three/drei/core/Gltf.js` |         **0** |      **0** |
   | após chamar `MeshoptDecoder()`                    |         **1** |      **1** |

   Importar o módulo — inclusive via o import de topo do `Gltf.js` — dispara **zero**
   instanciações. Só a chamada dispara. E `Gltf.js:21` só chama `MeshoptDecoder()`
   dentro de `if (useMeshopt)`.

3. **Bundle de produção.** Em `dist/assets/three-vendor-*.js`, o trecho minificado é
   `...if(typeof WebAssembly!="object")return{supported:!1};let i=r;WebAssembly.validate(t)&&...`.
   Um `return` só existe dentro de corpo de função: o rollup preservou a função, não a
   converteu em IIFE de topo.

Corroboração independente já registrada em A-5: no boot instrumentado, o `pageerror`
dispara em `+2225 ms`, **1 ms depois** do request de `Haumea_1_1000.glb` em `+2224 ms`.
Se fosse avaliação de módulo, dispararia no parse do script, centenas de ms antes.

O Codex confundiu **"o bundle contém a string"** com **"o módulo avalia"**. Que o
payload de 17,2 KiB permanece no bundle já estava registrado em A-5 como observação
lateral — é custo de bytes, não execução.

**Veredito:** `useGLTF(path, false, false)` em `PlanetModel.tsx:50` e
`AssetStudyApp.tsx:93` elimina o erro de CSP. Trocar `useGLTF` por `useLoader`, como o
Codex propõe, é opcional e só se justifica para remover os 17,2 KiB. O gate que ele
sugere continua correto e vale de qualquer forma: build + página sob a CSP final com
zero `pageerror`.

### R-2 — As 18 constantes de movimento médio (objeção aceita e fechada)

A objeção do Codex procede: este laudo publicou "todos ≤ 2,61°" sem as constantes nem o
script.

**Erro meu, corrigido na segunda revisão Codex.** A primeira tentativa de fechar essa
lacuna (`fit2.cjs`) converteu as datas das fixtures para JD em **UT cru**, enquanto o
provider avalia em **TDB**. O viés é de ~77 s — desprezível para luas lentas, mas vale
~1,0° de fase para Phobos. Isso inflou toda a coluna de erro e me levou a publicar
"pior caso 2,91° (Phobos)" e a declarar que o "≤ 2,61°" não se reproduzia. **Ele se
reproduz.** Refeito com `dateToTDB` do próprio repo (`nfit/fit3.cjs`) — confirmado que
`dateToTDB("2025-01-01")` devolve exatamente a constante `EPOCH_2025_JD` do provider:

| corpo     | `n` atual (Kepler-III) |   `n` corrigido | fonte |   err @+181 d |   err @+365 d |
| --------- | ---------------------: | --------------: | :---: | ------------: | ------------: |
| mimas     |             380,148830 |  **381,994500** |  pub  |  27,12 → 2,61 |  46,13 → 0,52 |
| phobos    |            1127,937845 | **1128,844600** |  pub  | 165,22 → 1,95 |  27,96 → 1,65 |
| miranda   |             254,640926 |  **254,692738** |  fix  |   9,39 → 0,63 |  18,96 → 1,29 |
| tethys    |             190,400845 |  **190,697900** |  pub  |  53,85 → 0,44 | 108,42 → 0,93 |
| enceladus |             262,036693 |  **262,730539** |  fix  | 125,28 → 0,03 | 107,36 → 0,87 |
| io        |             203,300556 |  **203,489000** |  pub  |  33,64 → 0,19 |  68,81 → 0,52 |
| europa    |             101,358651 |  **101,373519** |  fix  |   2,71 → 0,03 |   5,89 → 0,39 |
| titania   |              41,353071 |   **41,351430** |  fix  |   0,27 → 0,03 |   0,81 → 0,21 |
| deimos    |             285,114878 |  **285,161867** |  fix  |   8,53 → 0,10 |  17,15 → 0,15 |
| oberon    |              26,742762 |   **26,739978** |  fix  |   0,48 → 0,02 |   1,17 → 0,15 |
| ganymede  |              50,313521 |   **50,318096** |  fix  |   0,86 → 0,03 |   1,56 → 0,12 |
| iapetus   |               4,542047 |    **4,537920** |  fix  |   0,76 → 0,03 |   1,57 → 0,08 |
| dione     |             131,438084 |  **131,535095** |  fix  |  17,52 → 0,03 |  35,32 → 0,08 |
| rhea      |              79,684490 |   **79,690026** |  fix  |   1,01 → 0,01 |   2,02 → 0,06 |
| umbriel   |              86,879411 |   **86,868919** |  fix  |   1,92 → 0,03 |   3,81 → 0,05 |
| titan     |              22,573804 |   **22,576926** |  fix  |   0,55 → 0,02 |   1,19 → 0,02 |
| callisto  |              21,579839 |   **21,570967** |  fix  |   1,62 → 0,01 |   3,23 → 0,01 |
| ariel     |             142,832616 |  **142,835392** |  fix  |   0,49 → 0,01 |   1,02 → 0,01 |

`pub` = JPL SSD _Planetary Satellite Mean Orbital Parameters_; `fix` = derivado das
fixtures locais. Onde os dois existem convergem: tethys fix 190,698193 vs pub 190,6979;
io fix 203,488114 vs pub 203,4890; titan fix 22,576926 vs pub 22,5770.

**Pior caso 2,611° (Mimas); erro máximo antes 165,22°.** Bate com o laudo A-2 original
digito a digito, inclusive nas colunas "antes" (phobos 165,22/27,96, enceladus
125,28/107,36, tethys 53,85/108,42, io 33,64/68,81). A alegação original estava certa.

**Ressalva metodológica do Codex, aceita:** ajustar **14** taxas contra as mesmas duas
fixtures depois usadas para avaliá-las é validação **in-sample**. Os números acima
demonstram a magnitude do ganho, não a precisão fora da amostra. As constantes que
entrarem no patch precisam de fonte independente (JPL publicado) ou de fixtures
reservadas/curtas. Vale para as **14** marcadas `fix`; as 4 marcadas `pub`
(mimas, phobos, tethys, io) já vêm de fonte independente.

**Descoberta metodológica que sobrevive e fica mais forte.** Mimas é **indeterminado a
partir das fixtures sozinhas**. A menor baseline disponível é 181 dias e o erro de fase
acumulado de Mimas nesse intervalo é ~334°, acima dos 180° que separam ramos
adjacentes. A minimização cai num ramo aliasado (`n = 380,005973`) cujo pior caso é
**5,325°**, contra 2,611° do valor publicado — e o ramo errado parece bom em +181 d.
Phobos tem o mesmo sintoma em menor grau (`n_fix = 1128,855099` → 3,84°, contra
`n_pub = 1128,8446` → 1,95°). Consequência
prática: `scripts/derive-elements-from-fixtures.js`, se estendido ingenuamente para
derivar `n`, produziria Mimas e Phobos silenciosamente errados. Corpos rápidos exigem
o valor publicado **ou** uma fixture de baseline curta (≤ 30 dias) gerada para esse fim.

Isso também reforça a ressalva correta do Codex: os _mean elements_ do JPL não são
efeméride. Usar só a taxa média junto dos elementos osculadores de 2025 é um híbrido
empírico de alto retorno — não substitui envelope por corpo, nomenclatura honesta
(`Osculating2Body`), validade declarada, nem o roadmap de teoria perturbada.

### R-3 — Pontos do Codex aceitos sem ressalva

`useDeferredTexture` está em `src/hooks/`, não em `src/components/canvas/planet/`;
são 85 fixtures de corpo + `index.json`, não 87; `validityRange` são 13, não 14;
o salto 3D de Plutão é 19,70 AU, não 2,59; `Ω = ω = 0` em órbita quase circular não é
"fisicamente impossível"; as variantes 2k não são risco zero; o inventário P2/P3 não é
auditável pelo checkout. **Sobre D-4:** a observação está certa e a ação nunca mudou —
`.husky/pre-commit` é conveniência local, não proteção de branch (é pulável com
`--no-verify`, não roda no runner e não cobre `test:run` nem `docs:check`). O rótulo
P0/P1 é indiferente; o gate remoto continua sendo item de Onda 2. **Sobre D-1:** a
recomendação original do Codex de fato antecipava a classe "fontes body-equatorial
convertidas no provider"; o que este laudo acrescenta é _quais_ são (Charon é
load-bearing, Triton está errado nos dois estados) e que a separação visual/orbital já
existe no código, tornando o passo de render uma deleção.

## Limitações declaradas

- O drift em 2026-07-23 foi **extrapolado** por taxa ajustada a duas fixtures reais e
  corroborado contra movimentos médios publicados; não há fixture nessa data e não houve
  acesso à rede para gerar uma.
- As unidades de rede em N-9 vieram do harness como "MB" mas correspondem a **MiB**
  (divisão por 1024). Padronizar no harness antes de citar em outro lugar.
- Dos 18 movimentos médios da Parte 7, **14** foram derivados das fixtures locais
  (**validação in-sample** — ver ressalva na Parte 7) e **4** (mimas, phobos, tethys,
  io) usam o valor publicado do JPL, que **não foi verificado contra a fonte** por
  falta de rede: foi tomado do laudo A-2 e validado apenas pelo erro angular que produz
  contra as fixtures.
- A JPL declara que os _Planetary Satellite Mean Orbital Parameters_ **não se destinam
  a cálculo de efeméride** e recomenda o Horizons para posição precisa; as tabelas
  também misturam frames de Laplace, equatorial e eclíptico. A taxa explícita é um
  híbrido empírico de alto retorno, não uma teoria perturbada.
- Os números de 1900 do parecer Codex para Pallas e Vesta são **inverificáveis
  localmente** — existe uma única fixture pré-1900 no repositório inteiro
  (`ceres-1890-01-01.json`), medida em 7,398°.
- VRAM foi medida por hook em `texStorage2D` numa RTX 3070, não por leitura do driver.
  O comportamento em GPUs de 2-4 GB é inferido, não observado.
- A manifestação visual do near plane (flicker) **não foi reproduzida**;
  `logarithmicDepthBuffer` está ativo e provavelmente a evita.
- Nenhuma correção, commit, branch ou publicação foi feita.
