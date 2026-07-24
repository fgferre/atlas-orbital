# Revisão Codex do laudo Claude — arbitragem final e prioridades

**Data:** 2026-07-23\
**Baseline:** `main` em `b541a6d105eef720290f94c2e650ceed7b37a7ec`\
**Documentos comparados:**

- [`auditoria-validacao-glm-e-oportunidades-2026-07-23.md`](./auditoria-validacao-glm-e-oportunidades-2026-07-23.md)
- [`auditoria-claude-validacao-e-cacada-2026-07-23.md`](./auditoria-claude-validacao-e-cacada-2026-07-23.md)

**Escopo:** arbitragem independente das divergências, validação dos novos achados e
nova passada em código, dados, matemática, build e runtime.\
**Estado:** análise concluída. Nenhuma correção de produto foi aplicada.

Este arquivo é um adendo: não altera os dois laudos recebidos e deve prevalecer onde
houver conflito explícito.

> **Retificação após a réplica Claude:** a primeira versão deste adendo errou em D-5
> ao confundir presença do decoder no bundle com execução do factory. Também contou
> entradas do manifesto em vez de assets referenciados e incluiu testes no denominador
> de componentes i18n. D-2, D-5 e N-11 abaixo já incorporam a nova arbitragem.

## Veredito executivo

O laudo Claude trouxe achados de alto valor e mudou corretamente a prioridade em
quatro áreas:

1. o céu HYG está orientado no frame errado;
2. o `camera.near` não é restaurado ao desfocar;
3. o painel mobile fica fora do viewport;
4. há descontinuidades muito grandes ao trocar do provider analítico para o fallback.

Também acertou a causa dominante do drift de cinco luas rápidas: derivar `n` do
semi-eixo osculador produz uma taxa de fase ruim, e usar movimento médio explícito
reduz dramaticamente o erro nas fixtures locais.

O documento, porém, ainda precisa de arbitragem antes da execução:

- ele descreve incorretamente a correção anterior de A-1; o parecer Codex já pedia
  separar frame visual e frame orbital, não apagar cegamente o quatérnion;
- `useGLTF(path, false, false)` resolve a falha CSP ao impedir o factory Meshopt,
  embora não remova o payload do bundle; a primeira versão deste adendo estava errada;
- o pre-commit local não reduz a lacuna do workflow de deploy;
- N-11 tinha duas correções reais (`validityRange` e fixtures), mas `11/47` assets e
  `2/53` componentes estavam certos; a primeira versão deste adendo mediu conceitos
  diferentes.

Além disso, o inventário de “104 achados” não é reprodutível: o próprio laudo remete a
`hunt-all.json`, mas esse arquivo não existe no checkout. Os P0/P1 descritos no
Markdown puderam ser auditados; o restante só pode ser tratado como fila de hipóteses.

## Prioridade consolidada

| Ordem | Prioridade           | Problema                                                                    | Veredito                                            |
| ----: | -------------------- | --------------------------------------------------------------------------- | --------------------------------------------------- |
|     1 | P0 mobile            | Sidebar selecionada fora do viewport                                        | Confirmado em produção                              |
|     2 | P0/P1 alcance        | Boot requisita ~167,51 MiB em texturas e não degrada materialmente por tier | Confirmado                                          |
|     3 | P0 render/física     | Vetores eclípticos das luas analíticas recebem rotação do polo do pai       | Confirmado; correção deve respeitar frames          |
|     4 | P0 QA                | Pages publica após somente `build`                                          | Confirmado; pre-commit não é gate remoto            |
|     5 | P1 coordenadas       | Starfield HYG equatorial é tratado como se já estivesse nos eixos Three     | Confirmado                                          |
|     6 | P1 resiliência       | Sem WebGL, loader permanece em 8% sem diagnóstico                           | Confirmado em produção                              |
|     7 | P1 segurança/runtime | CSP bloqueia Meshopt WASM inútil                                            | Confirmado; fix Claude funciona                     |
|     8 | P1 orbital           | Saltos no limite de validade analítico → Kepler                             | Confirmado e mais grave que o laudo                 |
|     9 | P1 orbital           | Triton e outros Kepler-only usam elementos sem epoch/frame confiável        | Confirmado                                          |
|    10 | P1 acessibilidade    | Reduced Motion não governa intro e voos de câmera                           | Confirmado por contrato de código                   |
|    11 | P1 câmera            | `near` vaza depois do defocus                                               | Confirmado                                          |
|    12 | P1 dados             | Vanth, Weywot, Eris e proveniência visual têm inconsistências fortes        | Confirmado em amostras                              |
|    13 | P1 QA                | Cobertura e testes por allowlist escondem lacunas de domínio                | Direção confirmada; métricas N-11 corrigidas abaixo |

## Arbitragem das divergências

### D-1 — A-1: a falha existe, mas o laudo atribui ao Codex uma correção que ele não propôs

O laudo original já dizia:

> separar o grupo de orientação visual do planeta do grupo orbital dos filhos;
> eventuais fontes body-equatorial devem ser convertidas dentro do provider

Isso está em
[`auditoria-validacao-glm-e-oportunidades-2026-07-23.md:95`](./auditoria-validacao-glm-e-oportunidades-2026-07-23.md#L95).
Portanto, “o fix é deleção de 5 linhas e regride Caronte” não refuta a recomendação:
confirma exatamente por que uma deleção sem migração de dados seria insuficiente.

Estado real:

- `satellites.ts` entrega os 18 vetores analíticos em J2000 eclíptico/Three;
- [`Planet.tsx:968-979`](../src/components/canvas/Planet.tsx#L968) coloca todos os
  filhos no frame orientado do pai;
- Triton, Charon e outros Kepler-only têm elementos legados cujo frame não está
  normalizado e, em alguns casos, é body-equatorial ou simplesmente não documentado.

`PlanetVisualWrapper` já mantém o visual orientado separado dos filhos. Portanto, o
passo final do renderer pode de fato ser a remoção do grupo/quaternion das linhas
973–979. Ele só não deve ser aplicado isoladamente: primeiro é necessário converter os
elementos legados body-equatorial/indeterminados dentro do provider. Special-case apenas
para Charon deixa Triton, Vanth e Weywot sem contrato.

**Ação correta:** tornar o frame parte do contrato do dado/provider, converter todos os
elementos para J2000 eclíptico e então remover a segunda rotação dos filhos.

**Gate:** `child.matrixWorld - parent.matrixWorld` deve reproduzir o vetor do provider
para Marte, Júpiter, Saturno, Urano e pelo menos um Kepler-only já migrado.

### D-2 — A-2: as 18 taxas fecham no provider real, mas a nova tabela usa o relógio errado

Após a réplica, o laudo passou a publicar as 18 taxas. Reexecutei todas elas pelo
caminho real do provider, incluindo `dateToTDB`. Os cinco corpos mais críticos ficam:

| Corpo     | Atual em 2025-07-01 | `n` explícito | Atual em 2026-01-01 | `n` explícito |
| --------- | ------------------: | ------------: | ------------------: | ------------: |
| Phobos    |            165,218° |        1,954° |             27,962° |        1,652° |
| Enceladus |            125,277° |        0,210° |            107,360° |        1,356° |
| Tethys    |             53,855° |        0,454° |            108,423° |        1,076° |
| Io        |             33,645° |        0,204° |             68,807° |        0,486° |
| Mimas     |             27,124° |        2,611° |             46,135° |        0,522° |

Logo, a descoberta causal e o ganho são reais. A recomendação consolidada deve
incorporar um `meanMotionDegPerDay` explícito, com fonte e epoch.

O máximo reproduzido entre as 18 luas é **2,611° em Mimas**, não 2,91° em Phobos. A
tabela nova do Claude usa o delta UTC bruto e omite o offset TDB já documentado no
provider; por isso desloca Phobos em aproximadamente 1° e não representa o patch
proposto. Ironicamente, o limite antigo “≤2,61°” fecha no código real depois que as
constantes são fornecidas.

O novo achado de aliasing de Mimas é válido. Com o fit TDB corrigido
`n=380,005973`, o erro real é 2,611° em +181 dias e 5,325° em +365; com o valor
publicado `381,9945`, fica em 2,611° e 0,522°. Três fixtures espaçadas não identificam
sozinhas a volta correta de uma lua tão rápida.

Restam duas ressalvas metodológicas:

1. As taxas `fix` foram ajustadas e avaliadas nas mesmas fixtures. Isso demonstra
   capacidade de ajuste, não validação independente. O texto atualizado pretende
   classificá-las como 12 `fix`/6 `pub`, mas a tabela ainda marca 14 `fix`/4 `pub` e
   preserva a frase antiga “ajustar 16 taxas”. A contagem e as fontes precisam fechar
   antes do patch; cada constante sem fonte externa precisa de uma fixture
   reservada/curta que não participe do fit. O novo “Phobos fix = 3,84°” também não é
   reproduzível pelo documento porque a taxa desse ramo não foi publicada.
2. O próprio JPL avisa que os
   [Planetary Satellite Mean Elements](https://ssd.jpl.nasa.gov/sats/elem/) não se
   destinam a cálculo de efemérides e recomenda Horizons para posição precisa. As
   tabelas também misturam frames de Laplace, equatorial e eclíptico. Usar somente a
   taxa média junto dos elementos osculadores eclípticos de 2025 é um híbrido empírico
   útil, não uma teoria perturbada.

**Veredito:** implementar a taxa explícita como correção S de alto retorno, mas manter
o envelope por corpo, a nomenclatura honesta `Osculating2Body`, a validade e o roadmap
de teoria/múltiplos epochs. O laudo Claude melhora a solução imediata; não invalida os
itens 3–5 da correção Codex.

### D-3 — A-3: a estimativa erra nos dois sentidos; o diagnóstico estrutural permanece

No conjunto frio observado de 41 texturas:

- estimativa por filename: **3.848 MiB**;
- RGBA base pelas dimensões reais: **2.873,84 MiB**;
- RGBA com cadeia completa de mipmaps: **3.831,68 MiB**.

Portanto, no agregado, a heurística quadrada superestima RGBA base em 1,34×. Ao mesmo
tempo, ela subestima exatamente os arquivos destacados pelo primeiro laudo:

- `2k_tethys.jpg`: estima 16 MiB, real 345,9 MiB;
- `4k_enceladus.jpg`: estima 64 MiB, real 485,8 MiB;
- assets sem prefixo caem arbitrariamente no default de 1024.

O parecer Codex dizia “subestima severamente **esses arquivos**”, não que o total fosse
sempre subestimado. O ponto material continua sendo que filename não é medição de
memória. O manifesto autoritativo de largura, altura, formato e variantes permanece a
correção certa.

O achado adicional do Claude é válido: enquanto os 41 hooks permanecem ativos,
`refCount > 0` elimina todos os candidatos de
[`selectEvictionVictims`](../src/lib/deferredTextureCache.ts#L114). Assim, os budgets
de 32/64 MiB não limitam o conjunto ativo. O caminho citado no laudo está errado:
o hook real é [`src/hooks/useDeferredTexture.ts`](../src/hooks/useDeferredTexture.ts),
não `src/components/canvas/planet/useDeferredTexture.ts`.

O downscale automático do Three também não é uma proteção adaptativa: ele ocorre tarde,
depois do download/decode, pode bloquear a main thread e não elimina a imagem integral
retida no heap. A recomendação de validar dimensão antes do upload continua correta.

### D-4 — A-4: pre-commit não é gate de deploy

[`deploy.yml:33-48`](../.github/workflows/deploy.yml#L33) executa `npm ci`, `build` e
publica. O hook local roda `lint-staged` e `npm run lint`, mas:

- não roda no runner;
- pode ser pulado por `--no-verify`, API, interface web ou outro checkout;
- não inclui testes nem `docs:check`;
- não impede que qualquer push compilável em `main` vá para Pages.

Rebaixar o problema porque existe Husky confunde conveniência local com proteção da
branch. O rótulo pode ser “P0 QA” ou “P1 governança”, mas a ação não muda: gates
determinísticos precisam preceder o upload do artefato no workflow remoto.

### D-5 — A-5: Claude correto; `useGLTF(..., false, false)` resolve a CSP

O parse binário foi reproduzido:

| Modelo              | `extensionsUsed` | `extensionsRequired` |
| ------------------- | ---------------- | -------------------- |
| `Haumea_1_1000.glb` | `[]`             | `[]`                 |
| `Vesta_1_100.glb`   | `[]`             | `[]`                 |

Logo, Draco/Meshopt realmente são desnecessários. A primeira versão deste adendo errou
ao classificar `three-stdlib/libs/MeshoptDecoder.js` como IIFE. Ele exporta um factory:

| Etapa instrumentada                       | `WebAssembly.instantiate` | `WebAssembly.validate` |
| ----------------------------------------- | ------------------------: | ---------------------: |
| importar `MeshoptDecoder.js`              |                         0 |                      0 |
| importar `@react-three/drei/core/Gltf.js` |                         0 |                      0 |
| chamar `MeshoptDecoder()`                 |                         1 |                      1 |

O branch `if (useMeshopt)` em `Gltf.js` realmente governa a chamada. A presença de
`WebAssembly.instantiate` no bundle prova apenas que o payload permaneceu, não que foi
executado.

O A/B no build de produção sob a CSP final confirmou o comportamento:

- build atual: GLB da Haumea retorna 200 e ocorre um `CompileError` CSP;
- build temporário com os dois call sites usando `false, false`: o mesmo GLB retorna
  200, a cena monta e o console fica com **zero erros**;
- o chunk `three-vendor-BfEAvFgX.js` e seu tamanho permanecem idênticos, confirmando que
  os argumentos corrigem runtime, mas não bytes.

**Ação correta:** aplicar `useGLTF(path, false, false)` nos dois call sites e manter um
gate de página sob a CSP final com zero `pageerror`. Migrar para `useLoader`/loader
direto é uma otimização posterior para retirar o payload morto, não requisito para
resolver a falha. Não afrouxar a CSP.

### D-6 — B-11 e N-2: corrigir o registro sem afirmar flicker não observado

A rejeição numérica anterior de B-11 estava errada. O ramo de corpos curados realmente
chega a `near ≈ 4,41e-7` em Deimos. O laudo Claude também foi correto ao registrar que
[`CameraController.tsx:607`](../src/components/canvas/CameraController.tsx#L607)
retorna no defocus antes de restaurar `near`.

O que não foi demonstrado é a consequência visual original de flicker/z-fighting; com
`logarithmicDepthBuffer`, nenhum dos três laudos a reproduziu.

**Veredito corrigido:** o intervalo extremo é real e o vazamento de estado é P1; o
artefato visual específico continua não verificado. Restaurar `camera.near`,
`controls.minDistance` e projeção no cleanup/defocus, com teste de ciclo
focus → defocus.

## Validação dos novos achados

### N-1 — confirmado P1: orientação global do HYG

O CSV armazena `(x,y,z)` equatorial J2000. O build copia esses campos sem conversão e
[`Starfield.tsx:488-497`](../src/components/canvas/Starfield.tsx#L488) apenas escala o
buffer; o mesh aplica `R_x(+23,4°)` em
[`Starfield.tsx:619-633`](../src/components/canvas/Starfield.tsx#L619). Falta a
conversão equatorial → eclíptica e o remapeamento Three `(x, z, -y)`.

Medição no CSV real:

| Estrela | Erro angular entre vetor renderizado e vetor correto |
| ------- | ---------------------------------------------------: |
| Polaris |                                             136,864° |
| Sirius  |                                             131,999° |
| Regulus |                                              55,739° |

Render, picking e fly-to repetem a mesma transformação errada, o que explica a
coerência interna. Corrigir um único consumidor criaria um bug novo.

**Gate:** helper cartesiano único para posição **e velocidade**, usado por starfield,
picker, resolver e mesh focado. Polaris deve apontar próximo ao polo celeste correto e
Regulus deve ter latitude eclíptica próxima de zero.

### N-3 — confirmado P0 mobile

Playwright contra o build de produção, viewport 375×812, Titan selecionado:

```json
{
  "sidebar": { "x": 12, "y": -76, "w": 375, "h": 470.953 },
  "heading": { "y": -36, "bottom": -4, "text": "TITAN" },
  "position": "relative",
  "bottom": "76px"
}
```

As classes decorativas não-layered sobrescrevem `fixed`. O título e os controles
superiores ficam integralmente fora do viewport.

**Correção:** mover decoração para um filho e colocar os utilitários de componente em
`@layer components`. Adicionar E2E em 375×812 e 390×844, incluindo safe-area,
abertura, scroll, fechamento e orientação landscape.

### N-4 — confirmado P1 a11y

Em sessão limpa, `prefers-reduced-motion: reduce`, store e
`html[data-reduced-motion="true"]` ficam sincronizados. Mesmo assim:

- [`InitialCameraAnimation.tsx:11`](../src/components/canvas/InitialCameraAnimation.tsx#L11)
  mantém intro de 12 s sem ler a preferência;
- `CameraController`, `CameraTransition`, `HygPhysicsFlight`, `AimLerp` e
  `OrientationLerp` não recebem Reduced Motion;
- a preferência só governa fades de grid e alguns efeitos visuais.

**Gate:** em Reduced Motion, intro deve saltar para o estado final e todo focus deve
usar snap ou transição curta sem movimento espacial prolongado.

### N-5, N-6 e N-7 — confirmados P1 orbital

Triton contra a fixture de 2025-01-01:

- erro angular: **80,5671°**;
- erro de distância: 0,482%;
- teste passa porque aceita até 150°.

Os nove Kepler-only listados no laudo têm `O = w = M0 = 0`. Para órbitas quase
circulares, `w` pode ser indefinido e zero pode ser convenção; portanto “fisicamente
impossível” é uma formulação excessiva. O defeito auditável é outro: não há epoch,
frame e fonte capazes de distinguir convenção legítima de placeholder, enquanto a UI
apresenta o resultado como cálculo físico.

As transições de provider foram medidas a dois minutos do limite, eliminando movimento
orbital normal como explicação:

| Corpo  | Limite    | Salto angular | Distância Euclidiana entre posições |
| ------ | --------- | ------------: | ----------------------------------: |
| Pluto  | 2099→2100 |       23,662° |                       **19,698 AU** |
| Ceres  | 2050→2051 |      137,816° |                        **5,203 AU** |
| Pallas | 2050→2051 |       62,371° |                            2,462 AU |
| Vesta  | 2050→2051 |       12,799° |                            0,480 AU |

O laudo Claude chamou os 2,59 AU de Pluto de “salto”; esse número é apenas a diferença
dos módulos radiais. A posição 3D salta 19,70 AU.

**Correção:** não trocar silenciosamente para uma tabela sem epoch compatível.
Preferir continuidade calibrada no boundary, provider alternativo realmente
referenciado ou bloquear a data com disclosure explícito. Criar gate de continuidade
em todos os `validityRange`.

### N-8 — confirmado P1 de resiliência

Com `HTMLCanvasElement.getContext()` retornando `null` para WebGL, o build de produção
permaneceu após 15 s em:

```json
{ "progress": "8%", "alert": null }
```

O console contém apenas um `TypeError` minificado. O ErrorBoundary atual não converte a
falha de inicialização do renderer em UX.

**Correção:** probe antes de montar `<Canvas>`, card fora da árvore R3F e watchdog com
ação de retry/diagnóstico. O E2E deve continuar válido com WebGL2 e WebGL1 indisponíveis.

### N-9 — confirmado, com ressalva de unidade/metodologia

Em carga fria sem clique:

- 41 requests em `/textures/`;
- **167,5066 MiB** transferidos em texturas;
- **10,8102 MiB** no GLB da Haumea;
- 2.873,84 MiB de RGBA base pelas dimensões;
- 3.831,68 MiB com mipmaps, antes das imagens embutidas do GLB.

Isso corrobora a medição de ~3,9 GB por hook. Continua não sendo leitura do driver, mas
o valor deixa de ser apenas especulação: coincide com a soma física das alocações
esperadas. O relatório usa “MB” em N-9, mas os valores de textura coincidem com MiB;
padronizar a unidade no harness.

As quatro variantes 2k já existentes são um bom quick win, mas não “risco zero”:
precisam de comparação visual e teste do resolvedor por profile. Elas reduzem
high/balanced/constrained; ultra continuará preferindo o canonical 8k.

### N-10 — amostras confirmadas; evitar correção cega de gravidade

Vanth é internamente contraditório:

- massa e raio implicam densidade 16,588 g/cm³;
- massa e raio implicam `g ≈ 1,025 m/s²`, mas o catálogo diz `~0,13`;
- `n=90` dá período de 4 dias, enquanto o texto diz ~9,5 dias;
- `rotationPeriodHours=9.5`, enquanto o texto diz ~9,5 **dias**.

Weywot usa `rotationPeriodHours=0`, que o renderer trata como falso e, portanto, não
rotaciona, apesar do texto dizer sincronizado em ~12 dias. O expoente misto em
`10¹8` também é real.

Para Eris, `a=67,781 AU` implica `n≈0,0017662°/dia`; o catálogo usa `0,001`, 1,766×
mais lento.

Esses são defeitos dimensionais objetivos. Já divergências moderadas de `g` em corpos
achatados/rotantes não devem ser normalizadas automaticamente por `GM/R²`.

## N-11 corrigido: a causa sistêmica existe; duas métricas precisavam de escopo

Contagem reproduzida no baseline:

| Mecanismo                  |     Laudo Claude |                                                      Contagem reproduzida |
| -------------------------- | ---------------: | ------------------------------------------------------------------------: |
| `visualProvenance`         |            10/45 |                                                                 **10/45** |
| `validityRange`            |            14/45 |                                                                 **13/45** |
| `VISUAL_ASSET_MANIFEST`    |            11/47 | **11/47 assets referenciados**; o manifesto tem 17 entradas para 8 corpos |
| `TEXTURE_VARIANT_MANIFEST` |             4/37 |                                                  **4/37** corpos com mapa |
| i18n                       | 2/53 componentes |                      **2/53** componentes; 65 inclui 12 arquivos de teste |
| fixtures Horizons          |            28/45 |                          **28/45**, 85 fixtures de corpo + 1 `index.json` |

O total foi corrigido no cabeçalho e no adendo Claude, mas N-5 ainda preserva a frase
antiga “medido contra as 87 fixtures”. O valor autoritativo é 85 fixtures de corpo,
mais `index.json`.

Apesar disso, a conclusão qualitativa é forte: testes baseados em listas positivas
permitem que novos corpos nasçam sem provenance, validade ou variantes.

**Correção estrutural recomendada:** invariantes derivados de
`SOLAR_SYSTEM_BODIES`, com `KNOWN_GAPS` explícito, motivo, owner e data de expiração.
Não tornar toda lacuna hard-fail de uma vez; começar em modo report, congelar o número
de exceções e impedir crescimento.

## Cobertura: o achado 49,8% foi reproduzido

Dois runs completos, ambos com 100 arquivos e 1.774 testes verdes:

| Comando                                                           | Statements | Branches | Functions |  Lines |
| ----------------------------------------------------------------- | ---------: | -------: | --------: | -----: |
| `npm run test:coverage`                                           |     80,47% |   67,51% |    74,34% | 81,33% |
| `npm run test:coverage -- "--coverage.include=src/**/*.{ts,tsx}"` | **49,82%** |   45,66% |    46,65% | 50,86% |

O primeiro número exclui implicitamente módulos nunca importados por teste. O segundo
expõe, por exemplo, `CameraController`, `Planet`, `Scene`, `Starfield` e
`InitialCameraAnimation` com 0%.

Os runs verdes continuam emitindo `act(...)`, fetch HYG relativo, persist storage e
canvas não implementado. Esse ruído deve ser eliminado para que warning novo volte a
ter sinal.

## Ordem de execução revisada

### Onda 0 — restaurar alcance e diagnóstico

1. Sidebar mobile + E2E de viewport/safe-area.
2. Passar `false, false` aos dois `useGLTF`; retirada do payload pode vir depois.
3. Probe/erro de WebGL fora do Canvas.
4. Restaurar `camera.near` e `controls.minDistance` no defocus.
5. Registrar as quatro variantes 2k, com snapshot visual e teste de profile.

### Onda 1 — verdade de coordenada e tempo

6. Helper único equatorial → eclíptico → Three para HYG, incluindo velocidades.
7. Migrar frames de satélite e remover a rotação do pai somente após os Kepler-only
   afetados terem elementos eclípticos.
8. Adicionar `meanMotionDegPerDay` preciso e citado aos 18 satélites; validar todos os
   três epochs locais e um sweep mais longo.
9. Corrigir Triton e os nove Kepler-only com epoch/frame/proveniência.
10. Remover as descontinuidades de todos os limites de provider.

### Onda 2 — gates que impedem recorrência

11. `lint`, `test:run`, `docs:check`, build e smokes determinísticos antes do deploy.
12. `coverage.include` autoritativo e thresholds graduais por subsistema.
13. Invariantes de domínio + `KNOWN_GAPS` datado.
14. Playwright com projetos desktop, mobile, Reduced Motion, CSP e WebGL indisponível.

### Onda 3 — pipeline adaptativo real e catálogo

15. Manifesto gerado de dimensões/formato/bytes/proveniência.
16. LOD por saliência, fila limitada e budget sobre o conjunto ativo.
17. Reamostrar offline Tethys, Enceladus, Iapetus e demais outliers.
18. Corrigir Vanth/Weywot/Eris e revisar a unidade/origem dos campos físicos.

## Verificação executada nesta revisão

- parse dos dois GLBs, instrumentação do factory Meshopt e A/B dos builds sob CSP;
- cálculo orbital in-memory contra fixtures, incluindo `n`, Triton e boundaries;
- transformação cartesiana do HYG contra o CSV real;
- dimensões reais com Sharp e soma RGBA/mipmaps;
- Playwright CLI contra `vite preview` para mobile, CSP, carga e WebGL ausente;
- dois runs completos de coverage: 1.774/1.774 testes verdes em ambos;
- contagem programática de corpos, manifests, validade, componentes e fixtures.

## Limitações

- Não foi medida VRAM pelo driver; 3,832 GiB é a soma de alocações RGBA+mip esperadas.
- Não foi executada a suíte E2E completa; os fluxos runtime foram direcionados.
- Os 99 itens não detalhados do inventário P2/P3 não são auditáveis sem
  `hunt-all.json`.
- As 18 taxas foram reproduzidas no provider real; as marcadas `fix` ainda precisam de
  fonte ou validação independente. O laudo precisa reconciliar 12/6 no texto com 14/4
  na tabela, e corpos rápidos precisam de baselines curtas para eliminar aliasing.
- Nenhuma correção, branch, commit ou publicação foi feita.
