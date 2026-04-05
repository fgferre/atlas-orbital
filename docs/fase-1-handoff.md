# Fase 1 Handoff - saneamento tecnico

## Objetivo

Preparar a base para as fases seguintes sem mudar a direcao do produto. A Fase 1 deve priorizar estabilidade, limpeza segura, correcao de problemas de React/TypeScript e reducao de debt operacional. Nao e a fase de redesign de UX nem de otimizacao pesada de renderizacao.

## Status da execucao em 2026-04-04

### Concluido nesta execucao

- `npm run lint`: OK
- `npm run test:run`: OK, 23 testes passando em `src/utils/nasaStarParser.test.ts`
- `npm run build`: OK
- `Planet.tsx`, `PlanetModel.tsx`, `CameraController.tsx`, `Scene.tsx`, `SmartSunLight.tsx`, `TutorialHighlight.tsx`, `InitialCameraAnimation.tsx` e `Timeline.tsx` saneados para remover erros de hooks, refs, mutacao e efeitos
- `EclipticGrid.tsx`, `OverlayPositionTracker.tsx`, `NASAStarfield.tsx`, `ErrorBoundary.tsx` e `astrophysics.ts` limpos de `any`, `prefer-const` e `unused vars`
- loader/boot estabilizados com guardas one-shot em `Loader.tsx`, `SceneReadyChecker.tsx` e setters idempotentes no `store.ts`
- resquicios de scaffold removidos de `index.html`, `package.json`, `src/App.css`, `src/assets/react.svg` e `src/assets/solar_system_catalog_en.md`
- dependencias de topo sem uso removidas: `clsx`, `maath`, `tailwind-merge`
- alerta recorrente de `baseline-browser-mapping` atualizado
- smoke visual local executado:
  - mobile carregou a cena inicial apos loader + intro
  - desktop reproduziu o risco do loader preso em cold start e foi corrigido nesta fase; a nova captura local abriu a cena/tutoriais apos a intro

### Adiado para Fase 2

- code splitting / reducao do bundle principal
- revisao estrutural maior do fluxo de carregamento alem dos guardrails desta fase
- limpeza adicional de API do `store.ts` para acoes hoje nao consumidas (`setFocusId`, `toggleAutoPreset`, `openTutorial`) apos confirmar impacto em roadmap/tutorial
- remocao adicional de assets ou shaders mantidos como fallback/referencia

### Warnings aceitos conscientemente

- `vite build` ainda emite o warning de chunk grande (`dist/assets/index-*.js` acima de 500 kB minificado); isso permaneceu fora de escopo por depender de code splitting e estrategia de carga da Fase 2

## Baseline validado em 2026-04-04

- `npm run build`: OK
- `npm run test:run`: OK, 23 testes passando em `src/utils/nasaStarParser.test.ts`
- `npm run lint`: FALHA com 49 problemas (`43 errors`, `6 warnings`)
- build atual:
  - `dist/assets/index-B7eWeGhX.js`: `12,399.50 kB` minificado, `2,845.10 kB` gzip
  - `dist`: `310M`
- assets:
  - `public/textures`: `264M`
  - `public/textures`: `79` arquivos
  - `src/data/tycho2-processed.json`: `15M`
- alerta recorrente em build/test/lint:
  - `baseline-browser-mapping` desatualizado

## Guardrails obrigatorios

- Nao apagar texturas ou modelos em `public/textures` e `public/models` nesta fase sem um mapa explicito de fallback.
- Tratar assets `2k`, variantes antigas e texturas "fictional" como candidatos a tier de qualidade ou fallback manual ate prova em contrario.
- Nao mover a Fase 1 para um refactor grande de UX/UI. O foco aqui e sanear a base.
- Nao alterar a semantica de dados astronomicos/orbitais sem teste de regressao.
- Nao assumir que `_legacy/` pode ser removido. Se for tocar nisso, primeiro classificar como "referencia", "arquivo historico" ou "remocao segura".
- Toda limpeza deve terminar com `npm run lint`, `npm run test:run` e `npm run build`.

## Fora de escopo da Fase 1

- sistema automatico de quality tiers para mobile / memoria baixa
- code splitting do starfield Tycho-2
- compressao, troca ou substituicao de texturas pesadas
- redesign de sidebar, timeline e overlay
- refactor estrutural grande de `Planet.tsx` alem do necessario para corrigir hooks/lint
- remocao ampla de assets ainda nao classificados

## Estado atual do lint

Arquivos com erros ou warnings relevantes no baseline:

- `src/components/canvas/CameraController.tsx`
  - warning em `158`
  - errors de immutability em `185` e `195`
  - warning em `198`
- `src/components/canvas/EclipticGrid.tsx`
  - `any` em `150`, `154`, `197`, `211`, `213`, `237`, `238`, `256`, `267`, `277`
  - immutability em `260`
- `src/components/canvas/InitialCameraAnimation.tsx`
  - warnings em `137` e `153`
- `src/components/canvas/NASAStarfield.tsx`
  - unused var em `78`
- `src/components/canvas/OverlayPositionTracker.tsx`
  - `prefer-const` em `23`
  - `any` em `105`
- `src/components/canvas/Planet.tsx`
  - `any` em `65`, `119`, `169`, `951`
  - hooks condicionais em `378`, `384`, `390`, `396`
  - warning de dependencia em `637`
  - hook condicional em `839`
- `src/components/canvas/PlanetModel.tsx`
  - `@ts-ignore` em `5`
  - hook condicional em `90`
- `src/components/canvas/Scene.tsx`
  - `any` em `34`, `35`, `36`, `40`, `144`, `153`, `177`, `459`, `460`, `461`, `465`
  - immutability em `144`
- `src/components/canvas/SmartSunLight.tsx`
  - acesso a ref durante render em `74`
- `src/components/ui/Timeline.tsx`
  - warning em `203`
- `src/components/ui/TutorialHighlight.tsx`
  - `setState` dentro de effect em `55`
- `src/components/utils/ErrorBoundary.tsx`
  - unused var em `17`
- `src/lib/astrophysics.ts`
  - `prefer-const` em `97`

## Escopo detalhado da Fase 1

### Bloco 1 - React correctness e bloqueios do lint

Objetivo: zerar os erros mais perigosos de hooks, refs, mutacoes e efeitos.

Arquivos principais:

- `src/components/canvas/Planet.tsx`
- `src/components/canvas/PlanetModel.tsx`
- `src/components/canvas/CameraController.tsx`
- `src/components/canvas/Scene.tsx`
- `src/components/canvas/SmartSunLight.tsx`
- `src/components/ui/TutorialHighlight.tsx`
- `src/components/canvas/InitialCameraAnimation.tsx`
- `src/components/ui/Timeline.tsx`

Tarefas:

- corrigir hooks condicionais em `Planet.tsx`
  - objetivo pratico: nenhuma chamada de `useTexture` ou `useMemo` pode depender de branch de render
  - abordagem preferida: subir chamadas de hook para ordem fixa, ou extrair partes opcionais para subcomponentes dedicados
- corrigir hook condicional e `@ts-ignore` em `PlanetModel.tsx`
  - trocar `@ts-ignore` por tipagem explicita ou `@ts-expect-error` justificado
- corrigir mutacoes apontadas em `CameraController.tsx` e `Scene.tsx`
  - encapsular updates imperativos em efeito ou estrutura que nao viole regras do plugin React Hooks
  - reduzir casts amplos para `any`
- corrigir acesso a `targetRef.current` durante render em `SmartSunLight.tsx`
  - criar objeto estavel fora do JSX renderizado e usar ref/estado de forma segura
- revisar `TutorialHighlight.tsx`
  - evitar `setState` sincrono dentro do effect
  - se necessario, trocar por calculo derivado, `requestAnimationFrame`, ou reset condicionado fora do corpo do effect
- fechar warnings de dependencias em `InitialCameraAnimation.tsx`, `Timeline.tsx` e `CameraController.tsx`
  - so suprimir warnings se houver motivo tecnico documentado no codigo

Definicao de pronto do bloco:

- sem `react-hooks/rules-of-hooks`
- sem `react-hooks/immutability`
- sem `react-hooks/refs`
- sem `react-hooks/set-state-in-effect`

### Bloco 2 - Type tightening e limpeza local

Objetivo: reduzir debt de TypeScript e pequenos problemas de manutencao sem iniciar refactor estrutural grande.

Arquivos principais:

- `src/components/canvas/EclipticGrid.tsx`
- `src/components/canvas/OverlayPositionTracker.tsx`
- `src/components/canvas/NASAStarfield.tsx`
- `src/components/utils/ErrorBoundary.tsx`
- `src/lib/astrophysics.ts`
- `src/components/canvas/Planet.tsx`
- `src/components/canvas/Scene.tsx`

Tarefas:

- substituir `any` por tipos reais ou interfaces locais minimas
- remover variaveis nao usadas
- corrigir `prefer-const`
- aproveitar a etapa para isolar utilitarios ou tipos compartilhados pequenos, mas sem iniciar fatiamento grande de componentes

Definicao de pronto do bloco:

- sem `@typescript-eslint/no-explicit-any` nos arquivos tocados
- sem `@typescript-eslint/no-unused-vars`
- sem `prefer-const`

### Bloco 3 - Loader e inicializacao

Objetivo: estabilizar a sequencia de boot da cena e reduzir risco de tela presa no loader.

Arquivos principais:

- `src/components/ui/Loader.tsx`
- `src/components/canvas/SceneReadyChecker.tsx`
- `src/components/canvas/InitialCameraAnimation.tsx`
- `src/App.tsx`
- `src/store.ts`

Contexto observado:

- o loader depende de `useProgress()` + `isSceneReady` + `progress === 100`
- o `SceneReadyChecker` sobe `isSceneReady` depois de alguns frames
- a intro comeca quando `isLoaderHidden` vira `true`
- em navegacao automatizada anterior, a tela ficou presa no loader, entao vale tratar essa cadeia como area de risco

Tarefas:

- mapear a ordem esperada do boot:
  - assets carregam
  - cena renderiza frames
  - loader some
  - intro comeca
  - overlay/tutorial entram no estado correto
- validar se a condicao `progress === 100` nao esta sensivel demais
- garantir que `setLoaderHidden`, `setSceneReady` e `setIsIntroAnimating` nao fiquem em estados inconsistentes se alguma etapa for reexecutada
- se necessario, adicionar um "one-shot guard" simples para evitar loop de montagem / desmontagem

Definicao de pronto do bloco:

- loader some de forma consistente em execucao local
- intro nao depende de race fragile
- sem regressao no tutorial de abertura

### Bloco 4 - Dead code e legacy com limpeza segura

Objetivo: remover sobras evidentes sem apagar nada que possa servir de fallback, referencia tecnica ou feature futura proxima.

Arquivos e itens candidatos a revisao:

- `index.html`
  - remover branding residual de scaffold (`vite.svg`) se ainda estiver presente
- `package.json`
  - renomear `name` de `temp-project` para algo coerente com o repositorio
- `src/assets/react.svg`
- `src/App.css`
- `src/assets/solar_system_catalog_en.md`
- `src/store.ts`
  - revisar uso real de `setFocusId`, `toggleAutoPreset`, `openTutorial`, `tutorialCompletionStatus`
- dependencias possivelmente nao usadas:
  - `clsx`
  - `maath`
  - `tailwind-merge`

Itens para NAO remover automaticamente nesta fase:

- `public/textures/**`
- `public/models/**`
- `_legacy/**`
- `src/components/canvas/shaders/earthDayNightShader.ts`
- `src/components/canvas/shaders/ringShadowShader.ts`

Motivos para segurar a remocao:

- texturas nao usadas hoje podem virar fallback de qualidade para mobile ou hardware fraco
- `_legacy` pode conter referencia historica ou material de comparacao
- shaders nao integrados ainda aparecem mencionados na documentacao tecnica em `public/Docs/Accurate Planetary Positioning.txt`

Definicao de pronto do bloco:

- remover apenas o que tiver confirmacao objetiva de nao uso e nao valor de fallback
- documentar explicitamente o que ficou pendente e por que ficou

### Bloco 5 - Fechamento operacional

Objetivo: entregar a fase com baseline limpo e facil de continuar.

Tarefas:

- rodar `npm run lint`
- rodar `npm run test:run`
- rodar `npm run build`
- atualizar este arquivo com:
  - o que foi concluido
  - o que foi adiado para Fase 2
  - se restou algum warning aceito conscientemente

Definicao de pronto do bloco:

- `lint`, `test:run` e `build` verdes
- sem exclusao arriscada de assets de fallback
- handoff atualizado para continuidade

## Ordem recomendada de execucao

1. Corrigir `Planet.tsx` e `PlanetModel.tsx`
2. Corrigir `CameraController.tsx`, `Scene.tsx` e `SmartSunLight.tsx`
3. Fechar `TutorialHighlight.tsx`, `InitialCameraAnimation.tsx` e `Timeline.tsx`
4. Limpar `EclipticGrid.tsx`, `OverlayPositionTracker.tsx`, `NASAStarfield.tsx`, `ErrorBoundary.tsx`, `astrophysics.ts`
5. Revisar loader / store / estados de inicializacao
6. Fazer limpeza segura de scaffold, dead code e dependencias
7. Rodar validacao final e atualizar este handoff

## Riscos conhecidos

- `Planet.tsx` e o ponto mais provavel de regressao visual ou de carregamento
- `Loader.tsx` + `SceneReadyChecker.tsx` + `InitialCameraAnimation.tsx` formam uma cadeia sensivel a race conditions
- o plugin novo de lint para React esta pegando padroes que antes passavam despercebidos; "corrigir so para calar o lint" pode introduzir regressao se feito sem teste manual
- varias texturas nao usadas parecem candidatas a tier `low` / `medium`; apagar cedo aqui pode travar a Fase 2

## Checklist rapido

- [x] `Planet.tsx` sem hooks condicionais
- [x] `PlanetModel.tsx` sem hooks condicionais e sem `@ts-ignore`
- [x] `CameraController.tsx` sem mutacao invalida
- [x] `Scene.tsx` sem mutacao invalida e com menos `any`
- [x] `SmartSunLight.tsx` sem acessar ref durante render
- [x] `TutorialHighlight.tsx` sem `setState` direto em effect
- [x] `EclipticGrid.tsx` tipado
- [x] `OverlayPositionTracker.tsx` limpo
- [x] loader consistente
- [x] `package.json` e `index.html` sem resquicio de scaffold
- [x] dependencias possivelmente ociosas revisadas
- [x] `npm run lint`
- [x] `npm run test:run`
- [x] `npm run build`

## Prompt sugerido para a proxima conversa

Use este prompt como ponto de partida:

```text
Leia `docs/fase-1-handoff.md` e execute a Fase 1 do saneamento tecnico. Respeite os guardrails do arquivo, principalmente nao apagar texturas ou modelos que possam servir de fallback. Comece pelos erros P0 de hooks/immutability/refs, valide com lint/test/build ao final de cada bloco de risco e atualize o proprio handoff com o status do que foi concluido.
```
