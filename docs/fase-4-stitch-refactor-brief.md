# Fase 4 Stitch Brief - Overlay Refactor Desktop First

## Objetivo

Criar uma refatoracao de interface para o Atlas Orbital que organize melhor os controles em desktop, laptop menor, tablet e mobile sem remover, esconder ou degradar nenhuma ferramenta existente.

Esta refatoracao deve respeitar o handoff principal em [docs/fase-4-handoff.md](/Users/fgferre/Github/atlas-orbital/docs/fase-4-handoff.md) e acrescentar um contrato mais rigido para o Stitch gerar uma interface pronta para acoplar no app real.

## Decisao Principal

Nao usar slider horizontal, carousel ou qualquer mecanismo de "deslizar controles" para revelar ferramentas escondidas.

Motivo:

- esse padrao piora discoverability
- adiciona friccao em um app com canvas 3D interativo
- esconde estado e prioridade
- nao resolve bem o problema real de laptop menor, que e altura util e densidade

Padrao aprovado para o Stitch:

- `Search` continua como botao proprio
- o antigo `Controls` deve virar multiplos botoes explicitos
- cada botao abre um painel mais curto, por dominio
- nenhum painel pode conter todos os controles do produto sozinho

## Referencias de Entrada

### Codigo atual

- [src/components/ui/Overlay.tsx](/Users/fgferre/Github/atlas-orbital/src/components/ui/Overlay.tsx)
- [src/components/ui/TopBar.tsx](/Users/fgferre/Github/atlas-orbital/src/components/ui/TopBar.tsx)
- [src/components/ui/SearchBar.tsx](/Users/fgferre/Github/atlas-orbital/src/components/ui/SearchBar.tsx)
- [src/components/ui/LayersPanel.tsx](/Users/fgferre/Github/atlas-orbital/src/components/ui/LayersPanel.tsx)
- [src/components/ui/Timeline.tsx](/Users/fgferre/Github/atlas-orbital/src/components/ui/Timeline.tsx)
- [src/components/ui/Sidebar.tsx](/Users/fgferre/Github/atlas-orbital/src/components/ui/Sidebar.tsx)
- [src/store.ts](/Users/fgferre/Github/atlas-orbital/src/store.ts)
- [src/index.css](/Users/fgferre/Github/atlas-orbital/src/index.css)

### Screenshots de referencia

- Desktop: `/tmp/atlas-orbital-desktop.png`
- Mobile: `/tmp/atlas-orbital-mobile-ready.png`

Observacao:

- a captura desktop atual saiu em branco no fluxo headless; usar o codigo como fonte principal para o layout desktop
- a captura mobile atual ainda mostra o loader; usar como referencia de atmosfera visual e HUD, nao como layout final do overlay

## Linguagem Visual Que Deve Ser Preservada

- fundo espacial escuro, sem virar dashboard generico
- destaque neon ciano `#00f0ff`
- alerta ambar `#ff9d00`
- tipografia principal com `Orbitron` para rotulos tecnicos e `Rajdhani` para leitura
- paineis glass/tech com recortes angulares
- atmosfera de HUD cientifico, nao de admin panel

## Estrategia de Layout Aprovada

### 1. Top Bar

Continuar no topo com:

- marca `ATLAS ORBITAL`
- status `System Online`
- botao `Back`
- botao `Home`

Regras:

- `Back` e `Home` continuam visiveis em todos os breakpoints
- a marca nao pode esmagar os botoes
- em laptop menor, manter uma linha unica se possivel

### 2. Right Control Stack

Substituir o modelo de um unico `Controls` por uma pilha de botoes explicitos.

Ordem aprovada para desktop e laptop:

1. `Search`
2. `Scene`
3. `Overlay`
4. `Project`

Regras:

- um painel aberto por vez
- cada botao abre um painel separado
- os botoes ficam empilhados verticalmente no canto superior direito
- largura dos paineis entre `20rem` e `22rem`
- altura maxima dos paineis: `70vh`
- scroll interno permitido
- scroll externo do painel proibido

### 3. Left Scientific Sidebar

Continuar como painel contextual do corpo selecionado.

Regras:

- nao reduzir a densidade cientifica
- preservar a secao `Visual Fidelity`
- o painel deve suportar conteudo longo com scroll interno
- em laptop menor, usar largura ligeiramente menor, sem esmagar tipografia
- em mobile, continuar como sheet/painel sobreposto de largura total util

### 4. Bottom Timeline

Continuar no rodape, centralizada, com capacidade total.

Regras:

- nao remover o slider de tempo
- nao remover `LIVE MODE`
- nao remover `NORMAL RATE`
- nao remover `Rewind`, `Play/Pause`, `Forward`
- em desktop e laptop, a timeline nasce expandida
- em mobile, pode existir modo compacto, mas o acesso ao conjunto completo deve continuar a no maximo um toque

## Breakpoints Obrigatorios

### Desktop amplo

- alvo: `1440x900` e acima
- Sidebar cientifica aberta quando houver selecao
- stack direita com quatro botoes explicitos
- Timeline completa no rodape

### Laptop menor

- alvo: `1280x800` e `13-inch MacBook`
- prioridade absoluta desta refatoracao
- nenhum controle critico pode cair abaixo da dobra inicial por causa de um unico painel excessivamente alto
- right stack precisa caber sem competir com timeline
- sidebar e paineis direitos precisam ter scroll interno independente

### Tablet

- botoes continuam explicitos
- paines podem aumentar largura
- manter timeline compacta mas completa

### Mobile

- botoes continuam explicitos
- podem virar barra de acoes superior com sheets
- manter no maximo dois niveis de toque para qualquer ferramenta

## Inventario Fechado de Controles

Tudo abaixo e obrigatorio. Nenhum item pode sumir, ser omitido ou ser tratado como descartavel sem aprovacao explicita.

### TopBar

Origem: [src/components/ui/TopBar.tsx](/Users/fgferre/Github/atlas-orbital/src/components/ui/TopBar.tsx)

- status textual `System Online`
- botao `Back`
- botao `Home`

### Search

Origem: [src/components/ui/SearchBar.tsx](/Users/fgferre/Github/atlas-orbital/src/components/ui/SearchBar.tsx)

- botao gatilho `Search`
- botao `Close`
- campo de busca
- quick jumps:
  - `Sun`
  - `Earth`
  - `Mars`
  - `Jupiter`
  - `Titan`
  - `Pluto`
- lista de resultados com nome em ingles
- subtitulo/linha secundaria com nome em portugues
- indicacao de tipo ou classificacao

### Scene Panel

Origem principal: [src/components/ui/LayersPanel.tsx](/Users/fgferre/Github/atlas-orbital/src/components/ui/LayersPanel.tsx)

- toggle `Starfield`
- seletor `Tycho-2`
- seletor `NASA Eyes`
- seletor `Didactic`
- seletor `Realistic`
- seletor de qualidade:
  - `Auto`
  - `Ultra`
  - `High`
  - `Balanced`
  - `Saver`

### Overlay Panel

Origem principal: [src/components/ui/LayersPanel.tsx](/Users/fgferre/Github/atlas-orbital/src/components/ui/LayersPanel.tsx)

Filtros por categoria:

- `Planets`
- `Moons`
- `Dwarfs`
- `Asteroids`
- `TNOs`
- `Comets`

Observacao obrigatoria:

- `Comets` existe no estado global em [src/store.ts](/Users/fgferre/Github/atlas-orbital/src/store.ts) e na cena, mas hoje nao aparece no painel atual
- o Stitch deve considerar `Comets` como controle obrigatorio a restaurar

Guides e overlays:

- toggle `Icons`
- toggle `Labels`
- toggle `Orbits`
- toggle `Context Orbits`
- toggle `Ecliptic Grid`
- toggle `Prograde Vector`

### Project Panel

Origem principal: [src/components/ui/LayersPanel.tsx](/Users/fgferre/Github/atlas-orbital/src/components/ui/LayersPanel.tsx)

- botao `Replay Tutorial`
- botao `Mission Report`
- toggle `Debug Menu`
- texto de versao `v0.1.0 | Atlas Orbital`

### Timeline

Origem: [src/components/ui/Timeline.tsx](/Users/fgferre/Github/atlas-orbital/src/components/ui/Timeline.tsx)

- botao rotulo `Timeline`
- botao `Collapse/Expand timeline`
- botao `Rewind simulation rate`
- botao `Play/Pause timeline`
- botao `Advance simulation rate`
- botao `LIVE MODE`
- botao `NORMAL RATE`
- slider `Simulation rate`
- leitura textual do tempo atual
- leitura textual da data atual
- leitura textual do rate atual

### Sidebar Cientifica

Origem: [src/components/ui/Sidebar.tsx](/Users/fgferre/Github/atlas-orbital/src/components/ui/Sidebar.tsx)

- botao `Close selected body panel`
- secao `Selected Body`
- secao `Quick Context`
- secao `Visual Fidelity`
- secao `Real-time Telemetry`
- secao `Physical Data`
- secao `Records`
- secao `Exploration`
- secao `Orbital Data`
- secao `Atmosphere`
- secao `Intel`

## Contrato de Navegacao

### Desktop e laptop

- qualquer ferramenta principal deve estar acessivel em um clique
- nenhum grupo de ferramentas pode exigir scroll horizontal
- painel aberto nao pode empurrar outro painel para fora da tela

### Mobile

- qualquer ferramenta principal deve estar acessivel em no maximo dois toques
- o painel do corpo selecionado nao pode bloquear permanentemente `Search`, `Scene`, `Overlay`, `Project` e `Timeline`

## Contrato de Acessibilidade

- usar controles semanticos reais para `switch`, `button`, `group`, `dialog`, `combobox`, `listbox`
- `focus-visible` forte em todos os controles
- labels nunca dependerem so de cor
- respeitar `prefers-reduced-motion`
- manter `aria-label` nos botoes iconicos
- fechar sheets/dialogs com `Escape`
- devolver foco ao gatilho ao fechar painel

## Contrato de Motion

- motion contida e funcional
- nada de animacoes longas ou decorativas que atrasem operacao
- transicoes de painel devem sugerir mudanca de camada, nao showreel

## Regras Anti-Regressao Para o Stitch

- nao remover nenhum botao listado neste documento
- nao renomear controles criticos sem manter o label original visivel
- nao fundir `Search` com `Scene`, `Overlay` ou `Project`
- nao esconder `Tycho-2` e `NASA Eyes`
- nao esconder `Starfield`
- nao reduzir `Timeline` a uma versao simplificada
- nao eliminar `Visual Fidelity` do Sidebar
- nao usar tabs que escondem controles principais sem indicacao clara
- nao usar carousel, slider horizontal ou overflow horizontal para revelar ferramentas
- nao mover recursos criticos para areas dependentes de scroll longo antes do primeiro uso

## Prompt Base Para o Stitch

Use o texto abaixo para gerar a primeira tela desktop-first no Stitch.

```text
Design a desktop-first control overlay for a cinematic scientific 3D solar system app called Atlas Orbital. Keep the current dark space HUD identity: black and deep navy background, neon cyan accent #00f0ff, amber alert accent #ff9d00, Orbitron for technical labels, Rajdhani for readable body text, angular glass panels with clipped corners, no generic SaaS dashboard look.

This is not a landing page. It is an operational interface layered over a 3D scene. The goal is to improve discoverability and responsiveness without hiding or removing any existing controls.

Desktop information architecture:
- top bar with ATLAS ORBITAL brand on the left, System Online sublabel, Back button, Home button
- left contextual scientific sidebar for the selected body, dense and scrollable, with sections for Selected Body, Quick Context, Visual Fidelity, Real-time Telemetry, Physical Data, Records, Exploration, Orbital Data, Atmosphere, Intel
- top-right vertical action stack with four explicit buttons: Search, Scene, Overlay, Project
- only one right-side panel open at a time
- bottom centered timeline panel with full controls

Never use a horizontal tool slider or carousel. Never force the user to horizontally scroll to reveal controls.

Required Search panel content:
- Search trigger button
- close button
- search input
- quick jump chips for Sun, Earth, Mars, Jupiter, Titan, Pluto
- result rows with English name, Portuguese name, and type or classification

Required Scene panel content:
- Starfield switch
- two starfield source choices: Tycho-2 and NASA Eyes
- scale mode choices: Didactic and Realistic
- quality choices: Auto, Ultra, High, Balanced, Saver

Required Overlay panel content:
- category filters: Planets, Moons, Dwarfs, Asteroids, TNOs, Comets
- overlay switches: Icons, Labels, Orbits, Context Orbits, Ecliptic Grid, Prograde Vector

Required Project panel content:
- Replay Tutorial button
- Mission Report button
- Debug Menu switch
- version line reading v0.1.0 | Atlas Orbital

Required Timeline content:
- Timeline label
- collapse affordance but keep full controls available
- Rewind button
- Play/Pause button
- Forward button
- LIVE MODE button
- NORMAL RATE button
- simulation rate slider
- current time, current date, and current rate readouts

Interaction rules:
- every major tool accessible in one click on desktop
- panels can scroll internally but must not become giant monoliths
- target smaller laptops like a 13-inch MacBook, not only wide desktop monitors
- preserve keyboard accessibility and clear focus states
- preserve scientific seriousness and density

Visual rules:
- crisp, intentional hierarchy
- restrained motion
- glowing cyan accents for active states
- avoid generic cards
- avoid flat admin dashboard composition
- keep the 3D scene visible and dominant
```
