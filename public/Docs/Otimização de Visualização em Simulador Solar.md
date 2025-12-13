# **Framework de Visualização Adaptativa e Saliência Contextual em Simulações Heliocêntricas**

## **1\. Introdução: O Paradoxo da Escala e a Carga Cognitiva**

O desenvolvimento de simuladores do sistema solar impõe um desafio de visualização singular no campo da computação gráfica e do design de interfaces: o problema da faixa dinâmica extrema (_extreme dynamic range_). Diferentemente de aplicações de mapeamento terrestre ou jogos em escalas humanas, onde os objetos mantêm proporções relativas gerenciáveis, uma simulação astronômica deve mediar a renderização entre escalas que variam por dezenas de ordens de magnitude. O usuário transita, em questão de segundos, da visualização de um asteroide com meros quilômetros de diâmetro para uma visão panorâmica do sistema solar, abrangendo bilhões de quilômetros de espaço vazio.

A solicitação central deste relatório aborda a implementação de uma nova dinâmica para "Visual Cues" (pistas visuais) — especificamente linhas de órbita, rótulos de texto (_labels_) e ícones marcadores (_markers_). O problema identificado é a "bagunça" visual ou o excesso de _clutter_ (poluição visual), resultante de uma lógica de renderização que não se adapta inteligentemente ao contexto da tela ou à intenção do usuário. Atualmente, a abordagem de desenhar ou ocultar esses elementos carece de automação algorítmica sofisticada, resultando em sobreposição de informações e perda de legibilidade.

A análise a seguir propõe uma mudança de paradigma: transitar de uma visualização baseada em "Estado Absoluto" (onde a visibilidade é binária e baseada em distâncias fixas) para uma visualização baseada em **Saliência Contextual**. Neste modelo, o sistema atua como um curador ativo da informação, calculando em tempo real a relevância ("saliência") de cada corpo celeste com base não apenas na sua posição física, mas na sua importância semântica, na configuração da câmera e, crucialmente, na intenção implícita do usuário.

Este documento, estruturado como um relatório técnico exaustivo, sintetiza o estado da arte (_benchmark_) de aplicações líderes de mercado — como _NASA Eyes_, _Solar System Scope_, _SpaceEngine_ e _Kerbal Space Program_ — e disseca os algoritmos matemáticos necessários para automatizar a densidade de informação na tela. Serão exploradas técnicas de tesselagem adaptativa de órbitas, algoritmos de agrupamento (_clustering_) em espaço de tela para rótulos e heurísticas de detecção de intenção baseadas em movimento e olhar (_gaze_).

### **1.1 A Natureza do "Visual Clutter" em Ambientes 3D**

A "bagunça" visual relatada não é meramente um problema estético; é um problema de processamento de informação. A Teoria da Carga Cognitiva sugere que a memória de trabalho humana possui limites estritos quanto ao número de elementos visuais que podem ser processados simultaneamente. Em um simulador, quando todas as órbitas são desenhadas com a mesma espessura e opacidade, o cérebro do usuário luta para distinguir o sinal (o planeta que ele está tentando observar) do ruído (as centenas de asteroides de fundo).

A complexidade surge da projeção de um espaço 3D vasto e esparso em um plano 2D limitado (a tela).

- **Conflito de Profundidade:** Órbitas distantes (como a de Plutão) podem, em certas angulações de câmera, cruzar visualmente com órbitas próximas (como a de Marte), criando ambiguidade espacial.
- **Densidade de Texto:** Rótulos de luas, quando vistos de longe, colapsam sobre o rótulo do planeta pai, tornando ambos ilegíveis.
- **Aliasing Geométrico:** Linhas de órbita desenhadas sem filtragem adequada geram artefatos visuais ("serrilhados") e cintilação (_z-fighting_), especialmente quando a órbita é vista de perfil (ângulo rasante).

A solução não é simplesmente "desenhar menos", mas desenhar _melhor_. O sistema deve inferir o contexto: se o usuário está orbitando Júpiter, as órbitas dos planetas interiores (Terra, Vênus) tornam-se irrelevantes e devem ser suprimidas ou atenuadas. Se o usuário está em uma visão de trânsito rápido pelo sistema, rótulos detalhados devem ser ocultados para evitar o borrão de movimento (_motion blur_) cognitivo.

## ---

**2\. Análise de Benchmarks de Mercado e Estado da Arte**

Para formular uma solução robusta, é imperativo desconstruir as técnicas utilizadas pelas aplicações que definem o padrão de qualidade atual. A análise a seguir não se limita a descrever funcionalidades, mas investiga a arquitetura de renderização e as decisões algorítmicas subjacentes a cada software.

### **2.1 NASA Eyes on the Solar System (Saliência Narrativa)**

A aplicação _NASA Eyes on the Solar System_ 1 é frequentemente citada como referência de clareza. Sua filosofia de design prioriza a "Visualização Narrativa" sobre a simulação sandbox pura.

#### **2.1.1 Camadas Semânticas e Modos de Foco**

Diferentemente de simuladores que tentam mostrar tudo simultaneamente, o _NASA Eyes_ opera sob um sistema rígido de hierarquia semântica. O sistema categoriza objetos em camadas discretas: "Planetas", "Missões/Espaçonaves", "Asteroides" e "Observatórios da Terra".3

- **Lógica de Ocultação:** A visibilidade não é apenas uma função da distância, mas do "Modo" ativo. Quando o usuário clica em uma missão específica (ex: _Voyager 1_), o sistema entra em um estado de foco onde a trajetória da sonda recebe prioridade máxima de renderização (cor brilhante, espessura maior), enquanto as órbitas planetárias secundárias são atenuadas para uma opacidade reduzida ou removidas completamente.
- **Insight para o Projeto:** A implementação de "Estados de Visualização" (Ex: Modo Exploração Livre vs. Modo Foco em Objeto) permite regras de _culling_ (descarte) mais agressivas. Não é necessário calcular a relevância de cada asteroide se o usuário ativou explicitamente o "Modo Planetas Principais".

#### **2.1.2 Visualização Temporal de Trajetórias**

Uma distinção crítica no _NASA Eyes_ é o tratamento do tempo. As linhas de órbita não são anéis estáticos, mas trilhas dinâmicas que representam passado e futuro.1

- **Fading Temporal:** A linha de órbita de uma espaçonave muitas vezes desaparece à medida que se afasta do tempo presente ("t0"). Isso reduz o _clutter_ visual ao não desenhar a história completa de uma missão de 30 anos, mas apenas uma janela relevante (ex: \+/- 5 anos ao redor do foco atual).
- **Técnica:** Isso sugere o uso de um _shader_ de fragmento que modula o canal alfa da linha com base em um atributo de "tempo" armazenado nos vértices da linha, permitindo um _fade_ suave nas extremidades da trajetória.

### **2.2 Solar System Scope (Saliência Estética e Zoom Semântico)**

O _Solar System Scope_ 5 adota uma abordagem mais "cinematográfica" e gamificada, voltada para o público geral e educacional. Seu maior triunfo técnico é a transição fluida entre escalas.

#### **2.2.1 Zoom Semântico e Ícones Impostores**

O problema de "pequenos objetos na tela" é resolvido através de uma técnica conhecida como _Semantic Zooming_.7

- **Transição de Representação:** Em vez de simplesmente desenhar um ícone 2D sobre o objeto 3D, o _Solar System Scope_ realiza uma metamorfose visual. Quando a câmera se afasta de um planeta, o modelo 3D texturizado não encolhe até desaparecer; ele é substituído gradualmente por um _sprite_ (imagem 2D) que simula um brilho estelar ou "flare".9
- **Benefício:** Isso mantém a "presença" do objeto na tela. O usuário nunca perde de vista onde Júpiter está, pois ele se torna uma "estrela brilhante" em vez de um pixel sub-dimensional. A lógica de ocultação do rótulo é atrelada a essa transição: o rótulo só aparece quando o objeto atinge um tamanho de tela mínimo ou quando o mouse paira sobre o brilho ("flare").

#### **2.2.2 Renderização Esquemática de Órbitas**

As linhas de órbita são renderizadas como círculos perfeitos simplificados. No entanto, a aplicação limita severamente o número de objetos menores visíveis simultaneamente.

- **Filtragem por Popularidade:** Ao contrário de softwares científicos que mostram milhares de asteroides, o _Solar System Scope_ exibe apenas os mais notáveis (Ceres, Vesta, etc.) a menos que configurado o contrário. Isso é uma forma de "Curadoria de Dados" manual que resolve o problema de performance e desordem visual na raiz.

### **2.3 SpaceEngine (Saliência Física e Procedural)**

O _SpaceEngine_ 10 representa o extremo da simulação realista, lidando com escalas galácticas. Sua solução para o _clutter_ é baseada na física óptica.

#### **2.3.1 Culling Baseado em Magnitude Aparente**

Esta é talvez a técnica mais sofisticada e "inteligente" para automatizar a visibilidade de rótulos e ícones. O _SpaceEngine_ calcula a **Magnitude Aparente ($m$)** de cada objeto em tempo real, baseada na luminosidade intrínseca do objeto, seu albedo (refletividade) e a distância até a câmera.12

- **A Fórmula:** $m \= M \- 5 \+ 5 \\log\_{10}(d)$, onde $M$ é a magnitude absoluta e $d$ é a distância em parsecs (adaptável para UA).
- **Automação:** O sistema define um limiar (_threshold_) de magnitude visível (por exemplo, 6.0, o limite do olho humano, ou ajustável pelo usuário). Se $m \> limiar$, o rótulo e o ícone são ocultados.
- **Resultado:** Conforme o usuário se aproxima de um sistema de luas, elas naturalmente se tornam "mais brilhantes" (magnitude diminui) e seus rótulos aparecem organicamente, sem a necessidade de scripts complexos de "se a distância for X, mostre Y".

#### **2.3.2 Fading de Órbitas por Espaço de Tela**

O _SpaceEngine_ também implementa uma lógica onde a visibilidade da linha de órbita depende do tamanho projetado da órbita na tela (_Screen Space Size_).

- Se a elipse completa da órbita ocupar menos de $N$ pixels (ex: 10px) na tela, ela é desativada. Isso evita que sistemas planetários distantes pareçam "bolas de arame" densas.

### **2.4 Kerbal Space Program (Precisão de Engenharia e Tesselagem)**

O _Kerbal Space Program_ (KSP) e seu sucessor KSP2 13 focam na precisão da mecânica orbital. Eles enfrentam o problema técnico de desenhar elipses perfeitas sem desperdiçar geometria.

#### **2.4.1 Tesselagem de Órbita em Espaço de Tela**

Um problema comum em simuladores é que órbitas elípticas, quando desenhadas com um número fixo de pontos (ex: 360 vértices), parecem "quebradas" ou angulares nos pontos de apoastro ou quando vistas de ângulos rasantes. Aumentar para 10.000 pontos mata a performance.

- **Solução KSP:** Eles utilizam um algoritmo de **Tesselagem Adaptativa**. O sistema calcula a posição dos pontos da órbita e, antes de desenhar, verifica a "curvatura" da linha projetada na tela 2D.
- **Lógica:** Se o ângulo entre três pontos consecutivos na tela for muito agudo, o algoritmo insere mais vértices naquele segmento específico. Se a linha for reta na tela (mesmo que curva no espaço 3D, mas vista de lado), ele remove vértices.
- **Impacto:** Isso garante linhas perfeitamente suaves onde o usuário está olhando, mantendo a contagem de polígonos baixa.15

### **2.5 Gaia Sky (Big Data e Escalonamento de Velocidade)**

O _Gaia Sky_ 16 lida com bilhões de estrelas, exigindo técnicas extremas de LOD (Nível de Detalhe).

#### **2.5.1 Escalonamento de Velocidade da Câmera**

O _Gaia Sky_ introduz uma lógica onde a densidade de informação visual é inversamente proporcional à velocidade da câmera.

- **Visualização Dinâmica:** Quando o usuário está se movendo rapidamente ("viagem interestelar"), o sistema oculta rótulos menores e simplifica órbitas para reduzir o borrão visual e manter a taxa de quadros (_FPS_). Quando a câmera desacelera ou para, o detalhe é restaurado suavemente.16
- **Suavização de Transição:** As transições de foco não são cortes secos, mas interpolações sigmoides, permitindo que o usuário mantenha o contexto espacial durante o movimento rápido.

## ---

**3\. Fundamentação Teórica: Algoritmos de Intenção e Saliência**

Para superar a lógica "bagunçada" atual, precisamos formalizar matematicamente o conceito de "Interesse do Usuário". Não basta perguntar "onde está o objeto?", devemos perguntar "o quão importante é este objeto agora?".

### **3.1 Teoria da Saliência Visual Computacional**

A Saliência Visual é a probabilidade de um determinado elemento atrair a atenção visual. Em um simulador, podemos _impor_ saliência artificialmente através de um sistema de pontuação (_Scoring System_) executado a cada quadro para cada objeto.

Definimos o **Score de Importância ($I\_i$)** para um objeto $i$ como uma soma ponderada de fatores:

$$I\_i \= (w\_s \\cdot S\_{semantico}) \+ (w\_d \\cdot S\_{distancia}) \+ (w\_t \\cdot S\_{tela}) \+ (w\_g \\cdot S\_{gaze})$$  
Onde:

1. **Saliência Semântica ($S\_{semantico}$):** Valor intrínseco do objeto.
   - Sol \= 1.0; Planeta Maior \= 0.8; Lua Principal \= 0.5; Asteroide \= 0.1.
   - _Objetivo:_ Garantir que Júpiter sempre tenha prioridade sobre uma lua menor, mesmo que a lua esteja um pouco mais perto.
2. **Fator de Distância ($S\_{distancia}$):** Baseado na magnitude aparente ou distância inversa normalizada.
   - $1 / (1 \+ dist^2)$. Objetos próximos ganham prioridade massiva.
3. **Tamanho em Tela ($S\_{tela}$):** Área ocupada pelo objeto (bounding box) em pixels.
   - Se um objeto ocupa 50% da tela, ele é o foco atual. Se ocupa 0.01%, é ruído de fundo.
4. **Fator de Olhar/Gaze ($S\_{gaze}$):** A proximidade do objeto em relação ao centro da tela (ou cursor do mouse).
   - Isso modela a "Intenção". Usuários tendem a centralizar o que querem ver.

**Lógica de Decisão:**

- Se $I\_i \> T\_{alto}$: Exibir Modelo 3D \+ Rótulo Completo \+ Órbita Tessalada.
- Se $T\_{medio} \< I\_i \< T\_{alto}$: Exibir Ícone \+ Rótulo Simplificado \+ Órbita Simples.
- Se $I\_i \< T\_{medio}$: Ocultar Rótulo, Exibir apenas Ícone fraco.

### **3.2 A Heurística "Hook" para Detecção de Intenção**

A seleção de objetos pequenos em 3D é difícil (o problema do "pixel hunting"). A pesquisa 18 propõe a técnica "Hook" (Gancho), que utiliza uma heurística baseada no movimento do cursor para prever a intenção antes mesmo do clique.

Algoritmo de Pontuação de Intenção:  
Em vez de um raycast (raio) simples, o sistema projeta um "cone" ou volume de influência a partir da câmera.

- Objetos dentro desse cone ganham pontos cumulativos ao longo do tempo se o usuário mantiver o cursor (ou centro da tela) apontado na direção geral deles.
- Isso permite que o sistema "adivinhe" que o usuário quer ver Marte, mesmo que o mouse esteja ligeiramente fora do alvo, e comece a fazer o _fade-in_ do rótulo de Marte proativamente.

### **3.3 Agrupamento Dinâmico (Clustering)**

Para rótulos, a sobreposição é o maior inimigo. Algoritmos de agrupamento são essenciais.

- **Abordagem Ingênua:** Verificar colisão par-a-par ($O(N^2)$). Inviável para milhares de objetos.
- **Abordagem Otimizada:** _Grid-Based Clustering_ ou _Spatial Hashing_.19 A tela é dividida em uma grade. Se dois rótulos caem na mesma célula (ou células vizinhas), apenas o de maior **Score de Importância** é desenhado. O outro é ocultado ou agrupado em um ícone genérico ("+3 Asteroides").

## ---

**4\. Soluções Algorítmicas: Implementação Técnica**

Esta seção detalha os algoritmos específicos para os três elementos visuais mencionados na solicitação original.

### **4.1 Dinâmica de Linhas de Órbita (Solucionando o "Emaranhado")**

O problema das órbitas é duplo: densidade visual e artefatos de renderização.

#### **4.1.1 Tesselagem Adaptativa em Espaço de Tela (Screen-Space Adaptive Tessellation)**

Não desenhe órbitas com um número fixo de vértices. Utilize um algoritmo recursivo que adiciona detalhes apenas onde a curvatura visual exige.15

**Algoritmo Proposto:**

1. Defina a órbita matematicamente (Kepleriana).
2. Comece com uma aproximação grosseira (ex: 16 segmentos).
3. Para cada segmento $AB$:
   - Calcule o ponto médio real $M$ na curva matemática.
   - Projete $A$, $B$ e $M$ para coordenadas de tela ($A\_{ss}, B\_{ss}, M\_{ss}$).
   - Calcule a distância perpendicular de $M\_{ss}$ até a linha reta $A\_{ss}-B\_{ss}$.
   - **Condição de Refinamento:** Se a distância (erro) for maior que um limiar $\\epsilon$ (ex: 2 pixels), divida o segmento em dois e repita recursivamente.
   - **Condição de Parada:** Erro $\< \\epsilon$ ou limite de profundidade atingido.
4. **Resultado:** Órbitas distantes usam poucos vértices. Órbitas próximas ou curvas acentuadas usam muitos. Isso otimiza GPU e visual.

#### **4.1.2 Shader de Atenuação Contextual (Smart Fading)**

O material da linha de órbita deve usar um _Shader_ personalizado para gerenciar a opacidade dinamicamente, sem intervenção da CPU.22

**Propriedades do Shader:**

- **Fade de Proximidade:** Alpha \*= smoothstep(NearClip, NearClip \+ FadeRange, DistanceToCamera);. Isso impede que a linha corte a câmera abruptamente.
- **Fade de Ângulo Rasante (Fresnel):** Calcule o produto escalar entre a direção da visão e a normal do plano da órbita.
  - Factor \= abs(dot(ViewDir, OrbitNormal));
  - Se Factor for próximo de 0 (olhando a órbita de lado), reduza o Alpha. Isso esconde o "emaranhado" de linhas horizontais quando se olha para o plano da eclíptica.
- **Fade de Distância:** Utilize a profundidade (Z-buffer) para atenuar linhas muito distantes, simulando neblina atmosférica ou limites de magnitude.

### **4.2 Dinâmica de Rótulos (Labels) Inteligentes**

O gerenciamento de texto deve priorizar a legibilidade e evitar sobreposição a todo custo.

#### **4.2.1 Algoritmo de Colocação Gulosa com Grade (Grid-Based Greedy Placement)**

Para evitar a complexidade $O(N^2)$ de verificar todos os rótulos contra todos, recomenda-se o uso de uma grade de ocupação espacial.24

**Passo a Passo:**

1. Divida a tela (Viewport) em uma grade de células (ex: 50x50 pixels).
2. Calcule a posição de tela de todos os objetos visíveis.
3. **Ordene** a lista de objetos pelo **Score de Importância** ($I\_i$) decrescente.
4. Itere sobre a lista ordenada:
   - Verifique se as células da grade correspondentes à posição do rótulo estão livres.
   - **Se Livres:** Desenhe o rótulo e marque as células como "Ocupadas".
   - **Se Ocupadas:**
     - Tentativa 1: Desloque o rótulo (ex: tente posicionar acima, abaixo, à direita).
     - Tentativa 2: Se ainda houver colisão, oculte o rótulo (Culling) ou desenhe apenas o ícone.
5. **Histerese (Estabilidade Temporal):** Para evitar que rótulos pisquem (flicker) quando disputam espaço, adicione um "bônus de estabilidade" ao Score de objetos que já estavam visíveis no quadro anterior. Um novo rótulo só substitui um antigo se seu Score for significativamente maior (ex: \+20%).

#### **4.2.2 Filtragem Semântica por Zoom**

Implemente faixas de visibilidade baseadas na hierarquia do sistema solar, similar ao _Google Maps_.8

- **Nível 0 (Zoom Distante):** Mostrar apenas rótulos de Planetas. Ocultar Luas e Asteroides.
- **Nível 1 (Zoom Médio \- Sistema Planetário):** Mostrar Planeta e Luas Principais (ex: 4 Luas Galileanas). Ocultar luas menores.
- **Nível 2 (Zoom Próximo):** Mostrar todas as luas e detalhes de superfície.

### **4.3 Dinâmica de Ícones e Marcadores (Visual Cues)**

Os ícones servem como âncoras visuais quando o objeto é pequeno demais para ser visto.

#### **4.3.1 Transição de LOD: Malha \-\> Impostor \-\> Ícone**

Para suavizar a visualização, utilize uma técnica de _LOD_ tripla 9:

1. **Fase 3D (Perto):** Renderize a malha esférica texturizada e iluminada.
2. **Fase Impostor (Média Distância):** Quando o objeto ocupar menos de X pixels (ex: 50px), substitua a malha por um _Billboard_ (placa 2D) com a textura do planeta. Isso economiza vértices e custos de iluminação.
3. **Fase Ícone (Longe):** Quando o tamanho projetado for sub-pixel (\< 2px), substitua por um Ícone abstrato (círculo/ponto) com tamanho fixo mínimo (ex: 5px) e cor média do planeta.
   - **Implementação:** Use Mathf.SmoothStep para interpolar a opacidade do ícone e da malha durante a transição, garantindo que não haja um "pop" visual.

#### **4.3.2 Indicadores Fora de Tela (Off-Screen Indicators)**

Se o usuário selecionou um objeto (foco de intenção), mas ele saiu do campo de visão (frustum), desenhe um indicador na borda da tela apontando para ele.28

- **Cálculo:** Projete a posição do alvo para o _Viewport Space_. Clampe as coordenadas entre (margens da tela). Desenhe o ícone nessa posição clampada com uma rotação orientada para o centro.

## ---

**5\. Arquitetura do Sistema: O "Gerenciador de Contexto"**

Para integrar todas essas lógicas sem criar um código "espaguete", recomenda-se uma arquitetura centralizada.

### **5.1 Singleton: ContextManager**

Este componente é o cérebro da visualização. Ele não desenha nada, apenas processa dados.

**Responsabilidades:**

1. **Análise de Estado da Câmera:**
   - Monitora Velocidade ($v$) e Altitude ($h$).
   - Define o estado global: MODO_TRANSITO (alta velocidade), MODO_ORBITA (baixa velocidade, perto de objeto), MODO_SISTEMA (zoom distante).
2. **Cálculo de Saliência (Job System):**
   - A cada frame (ou intervalo de frames), recalcula o Score $I\_i$ para todos os corpos celestes.
   - Sugestão: Usar _C\# Job System_ (Unity) ou _Compute Shaders_ para paralelizar esse cálculo para milhares de asteroides.
3. **Gerenciamento de Layers:**
   - Baseado no Score, define _flags_ de visibilidade (ShowOrbit, ShowLabel, ShowIcon) em uma estrutura de dados centralizada.

### **5.2 Tabela de Decisão de Visibilidade (Exemplo Prático)**

| Elemento            | Condição de Exibição (Lógica Combinada) | Algoritmo de Renderização            |
| :------------------ | :-------------------------------------- | :----------------------------------- |
| **Linha de Órbita** | Score \> T_medio E Contexto\!= TRANSITO | Tesselagem Adaptativa \+ Shader Fade |
| **Rótulo (Label)**  | Score \> T_alto E GridSlot \== LIVRE    | Billboard com Clustering Guloso      |
| **Ícone (Marker)**  | TamanhoTela \< 10px E Score \> T_baixo  | Sprite com Tamanho Mínimo Fixo       |
| **Malha 3D**        | TamanhoTela \> 2px                      | LOD Geométrico Padrão                |

## ---

**6\. Conclusão e Recomendações Finais**

A transição de um simulador visualmente "bagunçado" para uma ferramenta profissional exige que o sistema deixe de ser um renderizador passivo e se torne um intérprete ativo da cena. A chave não está apenas em desenhar linhas mais bonitas, mas em saber **quando não desenhá-las**.

**Recomendações Prioritárias:**

1. **Implemente a Tesselagem Adaptativa de Órbitas:** Isso resolverá imediatamente o aspecto "angular" das trajetórias e melhorará a performance ao reduzir vértices em órbitas distantes.
2. **Adote o Clustering de Rótulos por Grade:** É a técnica de maior impacto para redução de _clutter_ textual. A legibilidade deve ter prioridade sobre a completude dos dados.
3. **Integre a Magnitude Aparente:** Use a física a seu favor. Ocultar objetos que seriam invisíveis a olho nu é uma regra intuitiva e natural para o usuário.
4. **Detecte a Intenção via Movimento:** Use a velocidade da câmera para limpar a interface durante movimentos rápidos. O usuário em movimento rápido está "viajando", não "lendo".

Ao aplicar este **Framework de Saliência Contextual**, o aplicativo alinhará sua apresentação com os padrões de excelência estabelecidos pelo _NASA Eyes_ e _SpaceEngine_, oferecendo uma experiência de exploração espacial que é, ao mesmo tempo, rica em dados e cognitivamente acessível.

### ---

**Apêndice: Exemplo de Implementação de Cluster (Pseudocódigo)**

C\#

// Estrutura para o Algoritmo de Clustering Guloso  
public void UpdateLabels(List\<CelestialBody\> bodies, Camera cam) {  
 // 1\. Calcular Scores e Posições de Tela  
 foreach(var body in bodies) {  
 body.UpdateScreenPosition(cam);  
 body.CalculateSaliencyScore(cam); // Baseado em dist, magnitude, gaze  
 }

    // 2\. Ordenar por Importância (Do mais importante para o menos)
    bodies.Sort((a, b) \=\> b.SaliencyScore.CompareTo(a.SaliencyScore));

    // 3\. Grade de Ocupação (Spatial Hashing)
    // Dividir a tela em células de 50x50px
    var grid \= new SpatialGrid(Screen.width, Screen.height, 50);

    foreach(var body in bodies) {
        Rect labelRect \= GetLabelBoundingBox(body);

        // Verifica se a área do rótulo já está ocupada na grade
        if (\!grid.IsOverlapping(labelRect)) {
            body.Label.SetVisible(true);
            grid.MarkOccupied(labelRect); // Reserva o espaço
        } else {
            // Tenta uma posição alternativa (ex: acima do ícone em vez de à direita)
            Rect altRect \= GetAlternativeRect(body);
            if (\!grid.IsOverlapping(altRect)) {
                body.Label.SetPosition(altRect);
                body.Label.SetVisible(true);
                grid.MarkOccupied(altRect);
            } else {
                // Se não houver espaço, oculta (Culling)
                body.Label.SetVisible(false);
            }
        }
    }

}

#### **Referências citadas**

1. NASA's Eyes, acessado em dezembro 12, 2025, [https://science.nasa.gov/eyes/](https://science.nasa.gov/eyes/)
2. Presenting With NASA's Eyes – Technology Lesson | NASA JPL Education, acessado em dezembro 12, 2025, [https://www.jpl.nasa.gov/edu/resources/lesson-plan/presenting-with-nasas-eyes/](https://www.jpl.nasa.gov/edu/resources/lesson-plan/presenting-with-nasas-eyes/)
3. Eyes on the Solar System \- Home \- NASA/JPL, acessado em dezembro 12, 2025, [https://eyes.nasa.gov/apps/solar-system/](https://eyes.nasa.gov/apps/solar-system/)
4. Learning How To Navigate Eyes on the Solar System \- YouTube, acessado em dezembro 12, 2025, [https://www.youtube.com/watch?v=kAvFhVBY5Po](https://www.youtube.com/watch?v=kAvFhVBY5Po)
5. Sustainability in the Built Environment Reflected in Serious Games: A Systematic Narrative Literature Review \- MDPI, acessado em dezembro 12, 2025, [https://www.mdpi.com/2071-1050/17/24/11148](https://www.mdpi.com/2071-1050/17/24/11148)
6. Solar System Scope \- Online Model of Solar System and Night Sky, acessado em dezembro 12, 2025, [https://www.solarsystemscope.com/](https://www.solarsystemscope.com/)
7. Semantic Zoom | Gosling, acessado em dezembro 12, 2025, [https://gosling-lang.org/docs/semantic-zoom](https://gosling-lang.org/docs/semantic-zoom)
8. Empirical Evaluation of a Visualization Technique with Semantic Zoom \- reposiTUm, acessado em dezembro 12, 2025, [https://repositum.tuwien.at/bitstream/20.500.12708/10087/2/Hoffmann%20Stephan%20-%202011%20-%20Empirical%20evaluation%20of%20a%20visualization%20technique%20with...pdf](https://repositum.tuwien.at/bitstream/20.500.12708/10087/2/Hoffmann%20Stephan%20-%202011%20-%20Empirical%20evaluation%20of%20a%20visualization%20technique%20with...pdf)
9. Diving into the Heavens: The Solar System Scope Project \- Europlanet Society, acessado em dezembro 12, 2025, [https://www.europlanet.org/europlanet-magazine/issue-6/diving-into-the-heavens-the-solar-system-scope-project/](https://www.europlanet.org/europlanet-magazine/issue-6/diving-into-the-heavens-the-solar-system-scope-project/)
10. Orbit | SpaceEngine Wiki \- Fandom, acessado em dezembro 12, 2025, [https://spaceengine.fandom.com/wiki/Orbit](https://spaceengine.fandom.com/wiki/Orbit)
11. User manual \- SpaceEngine, acessado em dezembro 12, 2025, [https://spaceengine.org/manual/user-manual/](https://spaceengine.org/manual/user-manual/)
12. Physically based star rendering · Issue \#1948 · CelestiaProject/Celestia \- GitHub, acessado em dezembro 12, 2025, [https://github.com/CelestiaProject/Celestia/issues/1948](https://github.com/CelestiaProject/Celestia/issues/1948)
13. How to draw orbits \- Kernel Space Program Dev Blog \- Reddit, acessado em dezembro 12, 2025, [https://www.reddit.com/r/programming/comments/mroyhe/how_to_draw_orbits_kernel_space_program_dev_blog/](https://www.reddit.com/r/programming/comments/mroyhe/how_to_draw_orbits_kernel_space_program_dev_blog/)
14. Developer Insights \#9 – Orbit Tessellation \- Page 4 \- Kerbal Space Program Forums, acessado em dezembro 12, 2025, [https://forum.kerbalspaceprogram.com/topic/201736-developer-insights-9-%E2%80%93-orbit-tessellation/page/4/](https://forum.kerbalspaceprogram.com/topic/201736-developer-insights-9-%E2%80%93-orbit-tessellation/page/4/)
15. Developer Insights \#9 – Orbit Tessellation \- Dev Diaries \- Kerbal Space Program Forums, acessado em dezembro 12, 2025, [https://forum.kerbalspaceprogram.com/topic/201736-developer-insights-9-%E2%80%93-orbit-tessellation/](https://forum.kerbalspaceprogram.com/topic/201736-developer-insights-9-%E2%80%93-orbit-tessellation/)
16. Towards smoother interstellar trips \- Gaia Sky, acessado em dezembro 12, 2025, [https://gaiasky.space/news/2025/smooth-interstellar-trips/](https://gaiasky.space/news/2025/smooth-interstellar-trips/)
17. Visualising the Gaia data with Gaia Sky \- ESA Cosmos, acessado em dezembro 12, 2025, [https://www.cosmos.esa.int/web/gaia/gaiadr2_gaiasky](https://www.cosmos.esa.int/web/gaia/gaiadr2_gaiasky)
18. Hook: Heuristics for Selecting 3D Moving Objects in Dense ... \- IIHM, acessado em dezembro 12, 2025, [http://iihm.imag.fr/publs/2013/FINAL.pdf](http://iihm.imag.fr/publs/2013/FINAL.pdf)
19. Marker Clustering | Maps JavaScript API \- Google for Developers, acessado em dezembro 12, 2025, [https://developers.google.com/maps/documentation/javascript/marker-clustering](https://developers.google.com/maps/documentation/javascript/marker-clustering)
20. Leaflet.MarkerCluster 0.1 Released \- Leaflet \- a JavaScript library for interactive maps, acessado em dezembro 12, 2025, [https://leafletjs.com/2012/08/20/guest-post-markerclusterer-0-1-released.html](https://leafletjs.com/2012/08/20/guest-post-markerclusterer-0-1-released.html)
21. Improved adaptive tessellation rendering algorithm \- PubMed, acessado em dezembro 12, 2025, [https://pubmed.ncbi.nlm.nih.gov/37038784/](https://pubmed.ncbi.nlm.nih.gov/37038784/)
22. Rendered Feathered Line Falloff Slope (math) \- Stack Overflow, acessado em dezembro 12, 2025, [https://stackoverflow.com/questions/74416180/rendered-feathered-line-falloff-slope-math](https://stackoverflow.com/questions/74416180/rendered-feathered-line-falloff-slope-math)
23. How to make a Line2 fading out shader \- Questions \- three.js forum, acessado em dezembro 12, 2025, [https://discourse.threejs.org/t/how-to-make-a-line2-fading-out-shader/40382](https://discourse.threejs.org/t/how-to-make-a-line2-fading-out-shader/40382)
24. Collision Detection · mapbox/mapbox-gl-native Wiki \- GitHub, acessado em dezembro 12, 2025, [https://github.com/mapbox/mapbox-gl-native/wiki/Collision-Detection](https://github.com/mapbox/mapbox-gl-native/wiki/Collision-Detection)
25. Label collision avoidance using D3.js (and Mapbox) \- Stack Overflow, acessado em dezembro 12, 2025, [https://stackoverflow.com/questions/64470716/label-collision-avoidance-using-d3-js-and-mapbox](https://stackoverflow.com/questions/64470716/label-collision-avoidance-using-d3-js-and-mapbox)
26. Optimize map label placement | Help | Mapbox, acessado em dezembro 12, 2025, [https://docs.mapbox.com/help/dive-deeper/optimize-map-label-placement/](https://docs.mapbox.com/help/dive-deeper/optimize-map-label-placement/)
27. Level of Detail System for my Procedural Planet Generator : r/Unity3D \- Reddit, acessado em dezembro 12, 2025, [https://www.reddit.com/r/Unity3D/comments/c8awsw/level_of_detail_system_for_my_procedural_planet/](https://www.reddit.com/r/Unity3D/comments/c8awsw/level_of_detail_system_for_my_procedural_planet/)
28. Is there a way to show the orbits of planets in Space Engine (the lines outlining its orbital path)? What do I need to press? : r/spaceengine \- Reddit, acessado em dezembro 12, 2025, [https://www.reddit.com/r/spaceengine/comments/2q5k6c/is_there_a_way_to_show_the_orbits_of_planets_in/](https://www.reddit.com/r/spaceengine/comments/2q5k6c/is_there_a_way_to_show_the_orbits_of_planets_in/)
