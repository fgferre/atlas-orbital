# Fase 2 Handoff - performance sem regressao

## Objetivo

Executar a fase de performance e reducao de peso do projeto sem perder recursos existentes. O foco principal e reduzir custo de bundle, carregamento e trabalho por frame, preservando o comportamento atual do produto.

## Regra numero 1

Nao remover o recurso de ter duas fontes de campo estelar.

Esse requisito e inegociavel. A Fase 2 deve manter:

- a opcao `Tycho-2`
- a opcao `NASA Eyes`
- o toggle global de `Starfield` ligado/desligado
- a capacidade de trocar a fonte no painel de settings
- a mencao desse recurso no tutorial

Otimizacao nao pode significar colapsar tudo em uma fonte unica, esconder a escolha ou transformar uma das opcoes em "legacy invisivel".

## Pre-condicao para iniciar

A Fase 2 deve partir de uma base limpa da Fase 1.

Checklist minimo antes de comecar:

- `docs/fase-1-handoff.md` revisado
- `npm run lint` verde
- `npm run test:run` verde
- `npm run build` verde
- sem regressao conhecida no loader inicial

Se a Fase 1 ainda nao tiver terminado, nao misturar as duas frentes no mesmo passo grande.

## Baseline validado em 2026-04-04

- `npm run build`: OK
- `npm run test:run`: OK, 23 testes em `src/utils/nasaStarParser.test.ts`
- `npm run lint`: falhando no baseline anterior da Fase 1
- bundle atual:
  - `dist/assets/index-B7eWeGhX.js`: `12,399.50 kB` minificado
  - `dist/assets/index-B7eWeGhX.js`: `2,845.10 kB` gzip
  - `dist`: `310M`
- dados relevantes:
  - `src/data/tycho2-processed.json`: `15M`
  - `public/data/nasa-stars`: `996K` total, `7` arquivos binarios
  - `public/textures`: `264M`
  - `public/models`: `16M`

## Implementacao atual do starfield

### Estado no store

O recurso de dual starfield existe no estado global e faz parte da semantica do app:

- `showStarfield` em `src/store.ts`
- `useNASAStarfield` em `src/store.ts`
- `toggleShowStarfield` em `src/store.ts`
- `toggleStarfieldImplementation` em `src/store.ts`

Estado default observado hoje:

- `showStarfield: true`
- `useNASAStarfield: false`

Ou seja: por padrao o app abre com `Tycho-2`.

### Renderizacao da cena

Em `src/components/canvas/Scene.tsx` a cena escolhe explicitamente entre os dois componentes:

- `useNASAStarfield ? <NASAStarfield /> : <Starfield />`

Isso significa que a escolha da fonte nao e detalhe interno; ela e parte da experiencia do usuario.

### Painel de settings

Em `src/components/ui/LayersPanel.tsx` existe:

- toggle global `Starfield`
- subtitulo `Starfield Source`
- botoes `Tycho-2` e `NASA Eyes`

Esse contrato de UI deve continuar existindo depois da Fase 2.

### Tutorial

Em `src/components/ui/TutorialOverlay.tsx` o tutorial menciona explicitamente:

- `Switch Starfield Source between Tycho-2 and NASA Eyes catalogs`

Se a implementacao mudar, a copy e o fluxo do tutorial precisam continuar verdadeiros.

## Diagnostico tecnico do starfield hoje

### Tycho-2

Implementado em `src/components/canvas/Starfield.tsx`.

Caracteristicas atuais:

- importa `src/data/tycho2-processed.json` direto no bundle
- processa o catalogo com `useMemo`
- gera `BufferGeometry` local
- usa shader proprio
- respeita `scaleMode`
- respeita `showStarfield`

Impacto principal:

- adiciona aproximadamente `15M` de dados ao lado do app em tempo de build
- ajuda a explicar o chunk unico de JS extremamente grande

### NASA Eyes

Implementado em `src/components/canvas/NASAStarfield.tsx`.

Caracteristicas atuais:

- carrega `7` arquivos binarios de `public/data/nasa-stars`
- parse assincromo com `parseNASAStarFile`
- tamanho total dos binarios hoje: `996K`
- usa shader especifico em `shaders/nasaStarShaders.ts`
- respeita `showStarfield`

Ponto importante:

- ja esta desacoplado do bundle principal de forma muito melhor que Tycho-2

### Conclusao pratica

O problema de performance nao e "existem duas opcoes". O problema e que as duas opcoes nao tem o mesmo custo operacional. A Fase 2 deve atacar o custo de Tycho-2 sem eliminar a opcao Tycho-2.

## Nao-negociaveis da Fase 2

- nao remover o seletor `Tycho-2` vs `NASA Eyes`
- nao remover o toggle global `Starfield`
- nao mudar o default sem decisao explicita do produto
- nao quebrar o tutorial que menciona a troca de fonte
- nao forcar fallback silencioso para a outra fonte sem deixar isso claro ao usuario
- nao esconder uma das opcoes em mobile ou em hardware fraco
- nao apagar dados `public/data/nasa-stars/**` ou `src/data/tycho2-processed.json` sem substituicao funcional equivalente
- nao recolocar o starfield dentro do `Environment` se isso reintroduzir o problema de iluminacao mencionado em `Scene.tsx`

## Escopo recomendado da Fase 2

### Bloco A - Arquitetura de starfield preservando dualidade

Objetivo: desacoplar custo de carregamento sem perder a escolha de fonte.

Resultado esperado:

- o conceito de "fonte do starfield" continua explicito na UI e no estado
- cada provider pode carregar sob demanda
- a troca entre providers continua funcionando

Implementacao recomendada:

- manter a semantica de duas fontes no store
- opcionalmente substituir `useNASAStarfield: boolean` por algo mais expressivo como `starfieldSource: "tycho2" | "nasa"`, desde que a UI e o comportamento final permaneçam identicos
- criar uma camada de orquestracao para o starfield
  - exemplo: `StarfieldManager`, `StarfieldProvider`, `useStarfieldSource`
- separar responsabilidades:
  - selecao da fonte
  - carregamento dos dados
  - construcao de geometria
  - renderizacao do provider ativo

Definicao de pronto:

- trocar entre `Tycho-2` e `NASA Eyes` continua possivel durante a sessao
- desligar e religar `Starfield` continua funcionando
- tutorial e painel continuam coerentes

### Bloco B - Tirar Tycho-2 do bundle principal

Objetivo: reduzir o peso do JS inicial sem remover a opcao Tycho-2.

Motivacao:

- `src/data/tycho2-processed.json` esta sendo importado diretamente por `Starfield.tsx`
- isso puxa `15M` para o lado do bundle principal

Implementacao recomendada:

- mover o catalogo Tycho-2 para asset externo carregado em runtime
  - opcao 1: `public/data/tycho2-processed.json`
  - opcao 2: formato binario proprio
  - opcao 3: chunks menores carregados sob demanda
- manter cache local em memoria apos primeiro carregamento
- garantir cancelamento/ignore seguro ao desmontar
- preferir parsing fora do caminho critico de primeira pintura

Definicao de pronto:

- Tycho-2 continua disponivel como opcao
- JS inicial cai de tamanho de forma relevante
- trocar para Tycho-2 continua funcional apos o app ja ter iniciado

### Bloco C - Loading state e UX de troca de provider

Objetivo: evitar estados confusos quando o usuario muda a fonte do starfield.

Problema atual:

- `NASAStarfield` tem `isLoading` e `error`
- `Tycho-2` hoje e essencialmente instantaneo por estar embedado no bundle
- apos externalizar Tycho-2, as duas fontes passarao a ter latencia real

Implementacao recomendada:

- dar a cada provider um estado claro:
  - `idle`
  - `loading`
  - `ready`
  - `error`
- opcionalmente mostrar feedback sutil no painel ao trocar a fonte
- nao trocar silenciosamente o provider escolhido por outro sem indicacao
- manter a UI responsiva enquanto o novo provider carrega

Definicao de pronto:

- o usuario sabe qual fonte escolheu
- o app nao parece "quebrado" durante a troca
- erro de um provider nao apaga o conceito de dual source

### Bloco D - Outras otimizacoes de performance com baixo risco de regressao

Objetivo: atacar gargalos grandes sem invadir UX.

Frentes recomendadas:

- overlay
  - revisar `src/components/canvas/OverlayPositionTracker.tsx`
  - reduzir trabalho por frame
  - evitar ordenar / recalcular tudo a cada frame se nao necessario
- orbitas
  - revisar geracao em `src/components/canvas/Planet.tsx`
  - diminuir segmentacao extrema
  - considerar cache por corpo / modo / foco
- texturas
  - manter assets, mas mapear carregamento lazy ou tiers futuros
  - nao apagar candidatos a fallback nesta fase
- canvas / luz
  - revisar custo de `antialias`
  - revisar custo do shadow map em `SmartSunLight`

Definicao de pronto:

- ganhos mensuraveis sem perda visual obvia
- nenhuma dessas otimizacoes remove funcionalidade ja exposta ao usuario

## Fora de escopo da Fase 2

- unificar as duas fontes de starfield em uma so
- apagar Tycho-2
- apagar NASA Eyes
- esconder a escolha de provider do usuario
- redesign grande do painel lateral ou do tutorial
- limpeza ampla de assets sem mapa de fallback

## Ordem recomendada de execucao

1. Congelar o contrato do recurso de starfield duplo
2. Criar camada de provider/orquestracao
3. Externalizar o catalogo Tycho-2
4. Adicionar cache e estados de loading por provider
5. Validar troca `Tycho-2 <-> NASA Eyes`
6. So depois atacar overlay, orbitas e outros gargalos de frame
7. Rodar validacao completa e atualizar este handoff

## Matriz de nao-regressao obrigatoria

### Funcional

- [ ] app abre com `showStarfield = true`
- [ ] fonte default permanece a mesma do baseline, salvo decisao explicita
- [ ] painel mostra botoes `Tycho-2` e `NASA Eyes`
- [ ] trocar de `Tycho-2` para `NASA Eyes` funciona
- [ ] trocar de `NASA Eyes` para `Tycho-2` funciona
- [ ] desligar `Starfield` oculta qualquer provider ativo
- [ ] religar `Starfield` restaura o provider selecionado
- [ ] tutorial continua mencionando a troca de fonte

### Tecnico

- [ ] `npm run lint`
- [ ] `npm run test:run`
- [ ] `npm run build`
- [ ] bundle inicial reduzido em relacao ao baseline
- [ ] Tycho-2 nao esta mais embedado no bundle principal
- [ ] NASA Eyes continua lendo de `public/data/nasa-stars/**`
- [ ] sem loop de loader ou tela presa na inicializacao

### UX/percepcao

- [ ] trocar provider nao congela a UI por varios segundos
- [ ] falha de carregamento mostra estado compreensivel
- [ ] uma falha nao remove a opcao do usuario permanentemente
- [ ] o painel continua deixando claro qual fonte esta ativa

## Teste manual minimo

Executar estes cenarios antes de encerrar a Fase 2:

1. Abrir o app e confirmar que o campo estelar padrao aparece.
2. Abrir settings e trocar para `NASA Eyes`.
3. Esperar carregamento e confirmar que o campo estelar voltou a aparecer.
4. Trocar de volta para `Tycho-2`.
5. Desligar `Starfield` e religar.
6. Reabrir o tutorial e confirmar que a dica sobre as duas fontes ainda faz sentido.
7. Fazer um build de producao e validar a inicializacao.

## Riscos conhecidos

- mover Tycho-2 para runtime pode introduzir loader parcial ou transicao visual vazia se nao houver estado de loading claro
- cache ruim pode duplicar geometria e aumentar consumo de memoria
- fallback silencioso entre providers pode parecer "funciona", mas quebra a promessa da UI
- se a refatoracao mexer cedo no store sem preservar o contrato, a regressao pode escapar para painel, cena e tutorial ao mesmo tempo

## Criterio de sucesso

A Fase 2 so pode ser considerada concluida se entregar as duas coisas ao mesmo tempo:

1. ganho real de performance / peso de bundle
2. preservacao completa do recurso de duas fontes de campo estelar

Se melhorar performance mas remover ou degradar a escolha `Tycho-2` vs `NASA Eyes`, a fase falhou.

## Prompt sugerido para a proxima conversa

Use este prompt como ponto de partida:

```text
Leia `docs/fase-1-handoff.md` e `docs/fase-2-handoff.md`. Execute a Fase 2 de performance sem regressao, preservando obrigatoriamente o recurso de duas fontes de campo estelar. Nao remova Tycho-2 nem NASA Eyes, nao esconda o seletor no painel, nao quebre o tutorial e nao force fallback silencioso entre providers. Priorize tirar o catalogo Tycho-2 do bundle principal, manter troca dinamica entre providers e validar com lint, test e build, alem da matriz manual de nao-regressao do handoff.
```
