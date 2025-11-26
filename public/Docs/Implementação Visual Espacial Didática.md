# **Arquiteturas Algorítmicas para Exagero de Escala e Visualização Didática em Simulação Astronômica**

## **Resumo Executivo**

A visualização de dados astronômicos apresenta um conjunto singular de desafios computacionais e perceptivos, impulsionados principalmente pela imensa faixa dinâmica de escalas espaciais — abrangendo desde a arquitetura submilimétrica de espaçonaves até as estruturas de gigaparsecs da teia cósmica. Simuladores científicos e educacionais, como Celestia, Stellarium, OpenSpace, NASA's Eyes e Solar System Scope, devem conciliar as rigorosas demandas de precisão científica com as limitações cognitivas do observador humano e as restrições técnicas dos _pipelines_ de renderização padrão (como OpenGL e DirectX). Este relatório fornece uma análise técnica exaustiva dos algoritmos e técnicas de renderização empregados por essas plataformas para implementar exagero de escala, zoom semântico e visualização didática. Investigamos as formulações matemáticas de buffers de profundidade logarítmicos, coordenadas escalonadas por potência (Power Scaled Coordinates) e grafos de cena dinâmicos (Dynamic Scene Graphs) que permitem a renderização livre de artefatos através de dezenas de ordens de magnitude. Além disso, analisamos os "modos didáticos" de renderização — nos quais raios orbitais, diâmetros planetários e magnitudes fotométricas são redimensionados dinamicamente — demonstrando como essas modificações são arquitetadas para preservar a verdade topológica enquanto sacrificam o realismo métrico em prol da eficácia educacional. A análise revela que a integridade científica não é comprometida, mas sim traduzida através de abstrações visuais rigorosamente controladas.

---

## **1\. Introdução: O Dilema da Faixa Dinâmica na Astro-Visualização**

O desafio fundamental na simulação astronômica reside no que a literatura técnica denomina "Dilema da Faixa Dinâmica" ou "Problema da Esparsidade Cósmica". Uma representação fiel em escala 1:1 do Sistema Solar resulta em uma exibição onde planetas são pontos subpixel, separados por vastas extensões de espaço vazio e negro, tornando a simulação inútil para propósitos educacionais imediatos ou para a compreensão intuitiva da mecânica celeste.1 Em contrapartida, representações puramente artísticas sacrificam a dinâmica orbital e as relações espaciais críticas para a literacia científica.

Para transpor esse abismo, arquitetos de software utilizam uma abordagem em camadas para a renderização, que separa o _estado da simulação_ (física de alta precisão, frequentemente baseada em efemérides como SPICE da NASA ou DE430/431 do JPL) do _estado de renderização_ (representação visual). Essa separação permite a injeção de "multiplicadores didáticos" — ajustes algorítmicos que exageram escala, brilho e visibilidade com base no contexto da câmera e na intenção pedagógica.

Este relatório disseca as estratégias de implementação de quatro classes principais de simuladores, cada uma com um mandato técnico distinto:

1. **Planetários Observacionais (Stellarium):** Focados na precisão astrométrica vista da superfície terrestre, lidando com a simulação atmosférica e a renderização de corpos menores com limitações de magnitude visual.3
2. **Simuladores de Travessia Espacial (Celestia):** Focados na movimentação com 6 Graus de Liberdade (6-DOF) através de um universo 3D, exigindo soluções robustas para o problema da precisão de ponto flutuante em distâncias interestelares.5
3. **Frameworks de Visualização de Dados (OpenSpace/NASA's Eyes):** Focados na contextualização de dados de missões discretas e conjuntos de dados volumétricos, utilizando grafos de cena avançados para gerenciar escalas que variam do microscópico ao macroscópico.7
4. **Modelos Educacionais Interativos (Solar System Scope/Solar Walk):** Focados em interações intuitivas simplificadas ("Modo Orrery"), onde a precisão espacial absoluta é deliberadamente distorcida para favorecer a compreensão relacional.9

A análise a seguir detalha como esses sistemas lidam com erros de precisão de ponto flutuante, contenção de buffer de profundidade (_Z-fighting_), e a transição perfeita entre geometria 3D e impostores 2D (_billboards_) para criar uma experiência de usuário coesa e cientificamente válida.

---

## **2\. Fundamentos Matemáticos da Renderização em Grande Escala**

Antes de abordar os algoritmos didáticos específicos, é imperativo estabelecer como esses motores gráficos lidam com os sistemas de coordenadas subjacentes. A aritmética de ponto flutuante de 32 bits (padrão IEEE 754), comum em pipelines gráficos legados e em muitos motores de jogos (como versões antigas do Unity), fornece apenas cerca de 7 dígitos decimais de precisão significativa. Na escala do Sistema Solar (aproximadamente $10^{13}$ metros até a heliopausa), essa precisão degrada-se para erros na ordem de quilômetros nas periferias, causando o fenômeno visual conhecido como "jitter" (tremulação) ou _z-fighting_, onde objetos piscam ou desaparecem devido à incapacidade do hardware de resolver a ordem de profundidade.11

Para resolver isso, diferentes arquiteturas de software adotaram soluções matemáticas distintas que formam a espinha dorsal de suas capacidades de visualização.

### **2.1. A Origem Flutuante (Floating Origin) e Renderização Centrada na Câmera**

Para mitigar a perda de precisão, simuladores como o **Celestia** e aplicações baseadas no motor Unity (como o **NASA's Eyes**) empregam uma estratégia de **Origem Flutuante** (_Floating Origin_). Em um pipeline de renderização padrão, a origem do mundo $(0,0,0)$ é fixa. Em um sistema de origem flutuante, a câmera é mantida conceptualmente em $(0,0,0)$, e todo o universo é transladado em relação à câmera a cada quadro renderizado.

O algoritmo opera da seguinte maneira:

1. **Simulação em Precisão Dupla:** Toda a mecânica orbital e posições absolutas são calculadas na CPU utilizando ponto flutuante de 64 bits (double-precision) ou, em casos extremos, matemática de ponto fixo de 128 bits. Isso garante que a posição de Plutão em relação ao Sol seja conhecida com precisão milimétrica.
2. **Translação Relativa:** Antes de passar a geometria para a GPU (que historicamente prefere floats de 32 bits para desempenho), o motor calcula o vetor de posição relativa $\\vec{P}\_{rel} \= \\vec{P}\_{obj} \- \\vec{P}\_{cam}$.
3. **Thresholding de Precisão:** Se a magnitude de $\\vec{P}\_{cam}$ exceder um certo limite em relação à origem interna do motor (por exemplo, 5.000 unidades em Unity), o sistema de coordenadas é "recentralizado". Isso efetivamente reinicia a acumulação de coordenadas globais para zero, prevenindo o cancelamento catastrófico durante as operações de matriz.13

Essa técnica é crítica em implementações do Unity para simuladores espaciais, onde o componente Transform nativo é limitado à precisão simples. Scripts dedicados, como FloatingOrigin.cs, deslocam explicitamente a hierarquia do mundo quando a câmera se move além de um limite de segurança, garantindo que a geometria atualmente visualizada retenha a máxima precisão de vértice disponível.15

### **2.2. Coordenadas Escalonadas por Potência (PSC) no OpenSpace**

O software **OpenSpace**, desenvolvido para visualizações de dados astrofísicos de altíssima fidelidade em planetários, aborda o problema de escala utilizando **Coordenadas Escalonadas por Potência** (_Power Scaled Coordinates_ \- PSC). Esta é uma estrutura de dados especializada desenvolvida para lidar nativamente com distâncias astronômicas sem a necessidade de deslocamentos constantes de origem, permitindo uma representação contínua do universo.

Uma PSC é definida como uma 4-tupla $(x, y, z, k)$, representando a posição vetorial:

$$\\vec{P} \= (x, y, z) \\times 10^k$$  
Onde $(x, y, z)$ é um vetor direcional normalizado ou de magnitude controlada, e $k$ é um expoente que carrega a escala logarítmica.

Este escalonamento logarítmico permite que o motor represente coordenadas desde a escala submilimétrica de um rover em Marte até a escala de gigaparsecs da Radiação Cósmica de Fundo, tudo dentro de um sistema unificado.17 A implementação no OpenSpace envolve um **Grafo de Cena Dinâmico** (_Dynamic Scene Graph_), onde as arestas representam transformações espaciais dependentes do tempo (usando kernels SPICE). Diferente de grafos de cena padrão que usam matrizes $4 \\times 4$, os nós do grafo do OpenSpace propagam essas coordenadas PSC.

Quando o sistema renderiza a cena, ele realoca dinamicamente a câmera para o "Nó de Foco" (o objeto de interesse), criando um sistema de coordenadas local onde o expoente $k$ é minimizado. Isso preserva a precisão para a geometria visível, resolvendo o problema do cancelamento catastrófico.7 Este método permite um zoom suave e livre de artefatos através de 40 ordens de magnitude, uma capacidade essencial para o seu "modo didático" de transição contínua da órbita terrestre para a borda do universo observável.21

### **2.3. Buffers de Profundidade Logarítmicos (Logarithmic Z-Buffers)**

Os buffers de profundidade padrão (_Z-buffers_) são não-lineares por natureza, dedicando a vasta maioria de sua precisão a objetos extremamente próximos à câmera (frequentemente nos primeiros metros). Em simulações espaciais, onde estrelas distantes, planetas e espaçonaves devem ser ordenados corretamente em profundidade através de distâncias de anos-luz, essa distribuição é altamente ineficiente e resulta em _Z-fighting_ massivo.

Para combater isso, simuladores modernos implementam o **Logarithmic Z-buffering** diretamente no _vertex shader_. Em vez de usar a transformação perspectiva padrão que resulta em $1/z$, o valor de profundidade $z$ é transformado logaritmicamente:

$$z\_{log} \= \\frac{\\log(C \\cdot z\_{view} \+ 1)}{\\log(C \\cdot z\_{far} \+ 1)} \\cdot w$$  
Onde:

- $C$ é uma constante de escalonamento (frequentemente 1.0).
- $z\_{view}$ é a profundidade do fragmento no espaço da visão.
- $z\_{far}$ é a distância do plano de corte distante (_far clipping plane_).
- Multiplicar por $w$ é necessário porque o pipeline gráfico realiza uma divisão perspectiva ($z/w$) subsequente.

Essa redistribuição matemática da precisão do buffer de profundidade permite que uma lua seja renderizada corretamente atrás de um planeta, mesmo quando ambos estão separados por milhões de quilômetros e o observador está a anos-luz de distância.11

Mais recentemente, implementações utilizando APIs modernas como Vulkan ou DirectX 12 (e.g., em atualizações recentes de motores gráficos) utilizam **Reversed Z-buffering** com buffers de profundidade de ponto flutuante. Ao mapear o plano próximo (_near plane_) para 1.0 e o plano distante (_far plane_) para 0.0, a distribuição natural dos valores de ponto flutuante (que têm mais precisão perto de 0\) alinha-se melhor com os requisitos de precisão da projeção perspectiva, reduzindo significativamente os artefatos em visualizações orbitais.22

---

## **3\. Implementação Algorítmica do Exagero de Escala**

Para tornar o espaço "legível" para fins educacionais, os simuladores devem, paradoxalmente, "mentir" sobre a escala visual enquanto mantêm a precisão posicional. A experiência do usuário exige que os planetas sejam visíveis e identificáveis mesmo quando a câmera está afastada o suficiente para ver todo o Sistema Solar, uma impossibilidade física se a escala linear fosse mantida. Isso requer intervenção algorítmica direta no pipeline de renderização.

### **3.1. Tamanho Mínimo de Pixel e _Billboarding_ (Impostores)**

Uma técnica primária utilizada pelo **Celestia** e **Stellarium** é o "Clamp de Tamanho Mínimo de Pixel" (_Minimum Pixel Size Clamp_). No loop de renderização, o tamanho projetado do objeto no espaço da tela (_screen space_) é calculado antes da rasterização. Se a projeção física cair abaixo de um limite predefinido (por exemplo, 2 a 5 pixels), o objeto transita de uma malha 3D esférica para um _billboard_ 2D (sprite) ou ponto de luz.5

#### **Lógica do render.cpp no Celestia**

No código-fonte do Celestia (especificamente no arquivo src/celengine/render.cpp), o loop de renderização itera através dos objetos visíveis (selecionados via Octree culling). O algoritmo calcula a magnitude aparente e o tamanho angular.

1. **Transição Geométrica:** À medida que a câmera se afasta, a esfera 3D texturizada do planeta é substituída por um _sprite_ pontual localizado. O brilho deste sprite não é constante; ele é determinado por uma "Função de Espalhamento de Ponto" (_Point Spread Function_ \- PSF) escalonada pela magnitude aparente do objeto. Isso confere ao planeta uma aparência suave e estelar, em vez de uma borda de pixel dura.5
2. **Alpha Blending:** Para prevenir artefatos de "popping" (mudança súbita de modelo), a transição é suavizada usando _alpha blending_. O modelo 3D torna-se gradualmente transparente enquanto o sprite torna-se opaco, governado por uma função sigmoide baseada na distância da câmera ou no tamanho angular em pixels.

#### **Stellarium: Planet.cpp e setMinorBodyScale**

O Stellarium emprega uma abordagem semelhante, mas com foco na simulação atmosférica terrestre. No entanto, para propósitos educacionais, ele inclui _flags_ específicas para exagerar a escala. A classe SolarSystem (e Planet.cpp) contém métodos como setMinorBodyScale(double f) e setMoonScale(double f).28

- **Injeção de Fator de Escala:** Quando esses modos de escala estão ativos, a chamada de desenho (_draw call_) para o planeta ou lua multiplica a componente de escala da matriz de modelo (_Model Matrix_) por um fator definido pelo usuário (e.g., $10\\times$, $100\\times$ ou customizado via script).
- **Renderização de Halo:** Para simular o espalhamento atmosférico ou simplesmente para destacar corpos pequenos que seriam invisíveis, o Stellarium renderiza um _billboard_ texturizado de "halo" atrás do corpo do planeta. O tamanho deste halo é computado com base na magnitude visual do objeto em vez de seu tamanho físico, garantindo que objetos brilhantes mas pequenos (como Vênus ou a ISS) permaneçam conspícuos no céu virtual.31

### **3.2. Zoom Semântico e Nível de Detalhe (LOD)**

O **Zoom Semântico** difere do zoom geométrico simples pois altera a _representação_ dos dados com base na escala, e não apenas o tamanho. Esta técnica é pesadamente utilizada no **OpenSpace** e no **NASA's Eyes**.

#### **O Algoritmo de Zoom Semântico**

O fluxo lógico para implementação deste algoritmo é:

1. **Entrada:** Altitude/distância atual da câmera ($D$) e Campo de Visão ($FOV$).
2. **Avaliação de Contexto:** Determinação do "nível semântico" (e.g., Superfície, Órbita, Sistema, Interestelar).
3. **Troca de Representação (Switch Representation):**
   - _Curto Alcance ($D \< 1000$ km):_ Renderiza tiles de terreno de alta resolução (dados HiPS/GDAL), atmosfera volumétrica e modelos 3D de espaçonaves.33
   - _Médio Alcance ($D \< 1$ UA):_ Renderiza globos planetários, linhas orbitais e rótulos (_labels_). Desvanece (_fade out_) detalhes de superfície; suaviza a entrada de órbitas lunares.
   - _Longo Alcance ($D \> 10$ UA):_ Substitui sistemas planetários por representações icônicas ("Modo Orrery"), agrega cinturões de asteroides em nuvens de densidade probabilística ou pontos, e habilita linhas de constelação.35

#### **Implementação no OpenSpace**

No OpenSpace, o componente RenderableGlobe utiliza um parâmetro TargetLodScaleFactor para determinar a resolução dos _tiles_ de terreno carregados do disco ou da rede. À medida que o usuário se afasta, o sistema poda a _quadtree_ de tiles de terreno, reduzindo a carga de memória e o ruído visual (aliasing).34 Simultaneamente, os componentes Renderable para rótulos e órbitas verificam sua visibilidade contra a distância da câmera, utilizando funções de opacidade sigmoides para suavizar a transição visual.38

### **3.3. A Implementação do "Modo Orrery" (Orrery Mode)**

Aplicativos como **Solar System Scope** e **Solar Walk** possuem um "Modo Orrery" (ou Visão Esquemática) dedicado, que quebra explicitamente as leis físicas de escala para clareza educacional. Na realidade, os tamanhos planetários são desprezíveis comparados aos raios orbitais. O Modo Orrery comprime essa proporção drasticamente.

- Espaçamento Logarítmico/Não-Linear: A distância $r$ de um planeta ao Sol é remapeada usando uma função $f(r)$. Uma abordagem comum é o uso de uma função raiz ou escalonamento logarítmico:

  $$r'\_{visual} \= A \\cdot r\_{physical}^B$$

  Onde $0 \< B \< 1$. Isso "puxa" os planetas exteriores (Netuno, Urano) para mais perto do Sistema Solar interior, permitindo que o usuário veja a estrutura completa do sistema em uma única tela sem que os planetas interiores (Mercúrio, Vênus, Terra, Marte) se aglomerem em um único pixel.39

- **Normalização de Escala:** Os tamanhos dos planetas são frequentemente normalizados ou "clampados". Júpiter pode ser renderizado apenas $2\\times$ ou $3\\times$ maior que a Terra (em vez de $11\\times$) para evitar que domine a visão, ou a Terra pode ser escalada $1000\\times$ em relação à sua órbita para ser visível como uma esfera e não um ponto.8
- **Tratamento de Colisão na Renderização:** Ao exagerar escalas, luas frequentemente colidiriam visualmente ("clip") com seus planetas pais. Para resolver isso, desenvolvedores usam **Buffers de Estêncil** (_Stencil Buffers_) ou **Particionamento de Profundidade**.
  - _Máscara de Estêncil:_ Uma máscara de estêncil é escrita quando o planeta é renderizado. Ao renderizar a órbita da lua ou a própria lua (se exagerada), o teste de estêncil previne o desenho de pixels que se sobrepõem ao planeta, ou, inversamente, garante que a lua seja sempre desenhada "no topo" (_always on top_) se desejado para visibilidade, ignorando o teste de profundidade tradicional para esse par específico de objetos.42

---

## **4\. Pipelines de Renderização para Visualização Didática**

O "modo didático" requer passagens de renderização (_render passes_) especializadas que diferem da renderização fotorrealista padrão de jogos ou filmes.

### **4.1. Empilhamento de Câmeras (Camera Stacking) e Renderização em Camadas**

O **NASA's Eyes** (amplamente construído sobre o motor Unity) utiliza **Empilhamento de Câmeras** (_Camera Stacking_) para gerenciar escalas conflitantes e elementos de interface. Como o buffer de profundidade do Unity tem limites de precisão, renderizar uma UI (Interface de Usuário), um planeta massivo e uma espaçonave minúscula em uma única passagem é problemático.

A arquitetura de empilhamento funciona da seguinte forma 45:

1. **Câmera Base (Skybox/Estrelas):** Renderiza o fundo infinito (estrelas, Via Láctea). Esta câmera limpa os buffers de cor e profundidade.
2. **Câmera Distante (Sistema Solar):** Renderiza planetas e órbitas principais. Utiliza um intervalo de planos de corte (_clipping planes_) muito grande (e.g., Near: 1000 km, Far: 100 UA).
3. **Câmera Próxima (Espaçonave/Contexto Local):** Renderiza o objeto de foco e arredores imediatos. Esta câmera limpa o buffer de profundidade, mas _preserva_ o buffer de cor das camadas anteriores. Isso permite que a espaçonave seja desenhada "sobre" o fundo espacial sem lutar pela precisão de profundidade com Netuno ao fundo.
4. **Câmera de Sobreposição (UI/Rótulos):** Renderiza texto, linhas de órbita esquemáticas e indicadores no topo de tudo.

Esse "Empilhamento" separa os contextos de Z-buffer. A espaçonave não luta com o planeta pela precisão de profundidade porque eles existem em contextos de buffer matematicamente segregados, mas visualmente compostos.

### **4.2. Algoritmos de Renderização de Linhas de Órbita**

Renderizar linhas de órbita que sejam visíveis de qualquer distância é um problema não-trivial. Uma linha física de 1 metro de largura seria invisível de 1 UA de distância, resultando em _aliasing_ severo ou desaparecimento total (problema de Nyquist).

- **Largura Constante no Espaço da Tela:** Simuladores utilizam _geometry shaders_ ou técnicas de _line rendering_ especializadas que calculam a largura da linha no **espaço da tela** (pixels) em vez do espaço do mundo. O _vertex shader_ projeta os pontos do caminho orbital, e o _geometry shader_ expande esses pontos em tiras de triângulos (_triangle strips_) que são sempre, por exemplo, 2 pixels de largura na tela, independentemente do nível de zoom.49
- **Lógica de Desvanecimento (Fade) e Descarte (Cull):** Para prevenir desordem visual (o efeito "tigela de espaguete" de órbitas), algoritmos modulam o canal alpha (transparência) das linhas de órbita baseados em:
  1. **Distância:** Linhas desvanecem quando a câmera está muito próxima (para evitar _clipping_) ou muito distante (para reduzir ruído visual).
  2. **Inclinação/Oclusão:** Em algumas visualizações, partes da órbita que estão "atrás" do planeta são escurecidas ou tracejadas para fornecer pistas de profundidade. Isso é frequentemente calculado usando o produto escalar entre o vetor de visão e o vetor centro-planeta.51
- **Ajuste Hiperbólico e Elíptico:** Para desempenho, em vez de renderizar milhões de segmentos de linha para uma órbita, sistemas como **Celestia** e **OpenSpace** podem usar renderização analítica de elipses ou hipérboles diretamente na GPU. O shader calcula a cobertura de pixel matematicamente com base nos elementos Keplerianos (excentricidade, semi-eixo maior) passados como uniformes, gerando uma curva perfeita infinita.53

### **4.3. O Algoritmo "Automag" (Celestia/Stellarium)**

Uma característica didática chave é o gerenciamento da visibilidade estelar. Na realidade, o número de estrelas visíveis depende da dilatação da pupila e da sensibilidade do olho (ou sensor). Em um simulador, mostrar todas as estrelas do catálogo (como o Gaia DR2 com bilhões de objetos) criaria um "whiteout" (tela branca); mostrar apenas estrelas visíveis a olho nu pareceria vazio ao dar zoom.

- **Lógica do AutoMag:** O Celestia implementa uma funcionalidade automag (frequentemente alternada via Ctrl+Y ou script Lua).
  - **Dependência do Campo de Visão (FOV):** A magnitude limite (_limiting magnitude_ \- a estrela mais fraca visível) é atrelada dinamicamente ao FOV da câmera. À medida que o usuário aplica zoom (reduz o FOV), a magnitude limite aumenta, revelando estrelas mais fracas. Isso simula o poder de captação de luz de um telescópio.55
  - Equação Aproximada:

    $$Mag\_{limit} \= BaseMag \+ k \\cdot \\log\_{10}(FOV\_{factor})$$

    Onde $BaseMag$ é a magnitude a olho nu (\~6.0) e $k$ é um coeficiente de ganho do telescópio virtual.

  - **Otimização de Consulta:** Isso é frequentemente tratado no índice espacial (_Octree_ ou _Hierarchical Triangular Mesh_). Apenas blocos de estrelas contendo objetos mais brilhantes que a $Mag\_{limit}$ calculada são percorridos e enviados para a GPU, otimizando drasticamente o desempenho e a densidade visual.57

---

## **5\. Estudos de Caso: Arquiteturas Específicas**

A análise detalhada de implementações específicas revela como essas teorias são traduzidas em código de produção.

### **5.1. Celestia: O Motor render.cpp**

A lógica central de renderização do Celestia reside no arquivo src/celengine/render.cpp. O motor trata o universo como uma hierarquia de objetos que precisam ser ordenados e processados.

- **Passagens Opacas vs. Translúcidas:** O Celestia ordena cuidadosamente os objetos. Planetas opacos são renderizados primeiro (do mais próximo para o mais distante ou usando Z-buffer). Atmosferas translúcidas, caudas de cometas e marcadores são renderizados em uma segunda passagem (de trás para frente, _back-to-front_) para garantir que o _alpha blending_ funcione corretamente e que as atmosferas não ocluam objetos que deveriam estar visíveis através delas.59
- **Tratamento de Eclipses:** As sombras no Celestia não são mapas de sombra genéricos (_shadow maps_), que falhariam na escala do sistema solar devido à resolução insuficiente. Elas são analíticas. O código em render.cpp calcula o cone de sombra projetado por planetas (umbra e penumbra) e verifica matematicamente se a posição da espaçonave ou lua cai dentro desse cone, aplicando um fator de escurecimento ao termo de luz ambiente no shader.61

### **5.2. OpenSpace: O ScaleGraph e Scripts Lua**

A arquitetura do OpenSpace é indiscutivelmente a mais avançada para escalonamento científico rigoroso.

- **Grafo de Cena Dinâmico:** Os nós no grafo podem ter transformações dependentes do tempo baseadas em kernels SPICE da NASA. O componente RenderableGlobe utiliza _tiling_ geodético (formato HiPS) que transmite dados sob demanda.
- **Navegação por Scripts Lua:** O OpenSpace expõe componentes de escala via scripts Lua (LuaScale). Isso permite que educadores criem "Tours" roteirizados onde o exagero de escala é ativado e desativado suavemente para demonstrar a vastidão do espaço. Por exemplo, um script pode aumentar o tamanho dos planetas para torná-los visíveis e, em seguida, "encolhê-los" de volta à realidade para mostrar o quão vazio o espaço realmente é, usando a transição como uma ferramenta pedagógica.63
- **Métrica de Erro de Tela:** O algoritmo de seleção de pedaços (_chunks_) de terreno planetário usa uma métrica de "erro no espaço da tela". Se o erro projetado de um pedaço de terreno exceder um limite de pixels (e.g., 2px), ele é dividido em quatro pedaços filhos de maior resolução. Isso garante que o usuário sempre veja o máximo detalhe disponível para sua resolução de tela sem renderização excessiva.65

### **5.3. Solar System Scope: O Orrery Acessível**

O Solar System Scope prioriza a acessibilidade via WebGL e dispositivos móveis. Seu "Modo Orrery" é uma característica central de design, não uma ferramenta de depuração.

- **Escalonamento Esquemático:** A aplicação permite que usuários alternem entre tamanhos "Realistas", "Panorâmicos" e "Esquemáticos". No modo esquemático, as escalas planetárias são exageradas por fatores calculados para garantir silhuetas distintas contra o disco solar, mesmo em telas pequenas de smartphones.
- **Mapeamento de Textura Otimizado:** Diferente da geração procedural pesada do SpaceEngine, o Solar System Scope depende de mapas de textura estáticos de alta qualidade (difuso, normal, especular) otimizados para _streaming_ WebGL, garantindo ampla compatibilidade enquanto sacrifica a resolução extrema de superfície encontrada em simuladores desktop dedicados.67

---

## **6\. Cheats Visuais e Integridade Científica**

A tensão central nestes simuladores é manter a "Integridade Científica" enquanto se empregam "Cheats Visuais". Como os desenvolvedores conciliam isso?

1. **Alternância de Modo Explícita:** Softwares como Solar System Scope e Solar Walk tornam a distorção explícita. A interface indica claramente "Escala Real" vs. "Escala Orrery". Isso previne a miseducação, transformando a distorção em um recurso de ensino comparativo.69
2. **Diferenciação Visual:** Em modos didáticos, objetos exagerados frequentemente possuem propriedades visuais distintas — eles podem ser mais brilhantes, ter "halos de seleção" adicionados, ou usar ícones esquemáticos em vez de esferas texturizadas, sinalizando ao usuário que aquilo é uma representação abstrata.
3. **Iluminação e Sombreamento Adaptativos:** A iluminação é outra área de exagero necessário. Um Sol realista cegaria o usuário, e Plutão seria invisível.
   - **Injeção de Luz Ambiente:** Simuladores forçam um nível mínimo de luz ambiente (e.g., celestia:setambient(0.1)) para que o lado escuro dos planetas nunca seja 100% preto, permitindo que características da superfície sejam discerníveis mesmo na sombra.56
   - **Tone Mapping (Mapeamento de Tons):** O uso de renderização HDR (_High Dynamic Range_) com adaptação de exposição simula o olho humano. Quando a câmera aponta para o Sol, a exposição cai; quando aponta para Saturno, ela sobe. Isso é implementado via shaders de pós-processamento que amostram a luminância média da cena e ajustam a curva de gama dinamicamente.25

---

## **7\. Tabela Comparativa de Técnicas de Renderização**

A tabela abaixo sintetiza as abordagens técnicas adotadas pelos principais simuladores analisados:

| Característica Técnica      | Celestia                           | Stellarium                 | OpenSpace                           | NASA's Eyes (Unity)                   | Solar System Scope                  |
| :-------------------------- | :--------------------------------- | :------------------------- | :---------------------------------- | :------------------------------------ | :---------------------------------- |
| **Sistema de Coordenadas**  | Origem Flutuante (Floating Origin) | Origem Flutuante           | Power Scaled Coords (PSC)           | Origem Flutuante \+ Camadas           | Escalonamento Local/Relativo        |
| **Buffer de Profundidade**  | Padrão / Split Buffer              | Padrão OpenGL              | Logarithmic / Reversed Z            | Empilhamento de Câmeras               | Buffer Padrão WebGL                 |
| **Exagero de Escala**       | Pixel Clamping (Billboards)        | setMinorBodyScale, Halos   | Grafo de Cena Dinâmico              | Escalonamento de Objeto / UI Overlay  | Modo Orrery (Logarítmico)           |
| **Renderização de Órbitas** | Analítica (Elipses)                | Analítica (Kepleriana)     | Efemérides (SPICE) Linhas           | Trail / Line Renderers                | Linhas Geométricas Simplificadas    |
| **Foco Didático**           | Viagem Espacial / Navegação        | Observação Terrestre       | Visualização de Dados / Volumetria  | Consciência de Missão / Público Geral | Modelo Mental / Brinquedo Educativo |
| **Renderização Estelar**    | Point Sprites (AutoMag)            | Point Sprites (Limite Mag) | Billboards / Sistemas de Partículas | Sistemas de Partículas                | Skybox / Partículas Estáticas       |

---

## **8\. Conclusão**

A implementação técnica do exagero de escala em simuladores astronômicos é um triunfo da engenharia de software sobre as limitações do hardware gráfico padrão. Ao utilizar **Origens Flutuantes** para ancorar a precisão, **Buffers de Profundidade Logarítmicos** para expandir o volume visível, **Zoom Semântico** para gerenciar a densidade de informação e **Coordenadas Escalonadas por Potência** para abranger o cosmos, os desenvolvedores criam ferramentas que são matematicamente rigorosas, mas intuitivamente acessíveis.

Algoritmos para **Modos Orrery** e **Renderização de Linhas de Órbita** desviam-se explicitamente do realismo Euclidiano para servir objetivos pedagógicos, empregando clampeamento no espaço da tela e escalonamento de distância não-linear. O sucesso desses simuladores reside em sua capacidade de misturar perfeitamente esses "truques" com motores físicos subjacentes rigorosos (propagadores SPICE e Keplerianos), garantindo que, embora os _visuais_ possam ser exagerados para clareza, os _dados_ permanecem fundamentados em fatos científicos. À medida que o hardware gráfico evolui, observa-se uma tendência para unificar essas técnicas — usando _compute shaders_ para gravidade de N-corpos simultaneamente com _ray-marching_ para dados volumétricos — fechando a lacuna entre a análise científica profissional e a divulgação pública.

#### **Referências citadas**

1. Planetarium Educator's Workshop Guide, acessado em novembro 26, 2025, [https://cdn.ymaws.com/www.ips-planetarium.org/resource/resmgr/education_materials/pass/v1pewg.pdf](https://cdn.ymaws.com/www.ips-planetarium.org/resource/resmgr/education_materials/pass/v1pewg.pdf)
2. Planetarium Educator's Workshop Guide, acessado em novembro 26, 2025, [https://cdn.ymaws.com/www.ips-planetarium.org/resource/resmgr/pdf-pubs/1980educatorswkspguide_sr10.pdf](https://cdn.ymaws.com/www.ips-planetarium.org/resource/resmgr/pdf-pubs/1980educatorswkspguide_sr10.pdf)
3. Stellarium Developers Documentation, acessado em novembro 26, 2025, [https://stellarium.org/doc/1.x/](https://stellarium.org/doc/1.x/)
4. Stellarium Developers Documentation, acessado em novembro 26, 2025, [https://stellarium.org/doc/0.14/](https://stellarium.org/doc/0.14/)
5. Night Sky Rendering \- ČVUT, acessado em novembro 26, 2025, [https://dspace.cvut.cz/bitstream/handle/10467/101339/F3-DP-2022-Poznik-Michal-night_sky_rendering.pdf](https://dspace.cvut.cz/bitstream/handle/10467/101339/F3-DP-2022-Poznik-Michal-night_sky_rendering.pdf)
6. Visualizing Gravitational Lensing Phenomena in Real-time using GPU shaders in celestia.Sci \- PUBDB, acessado em novembro 26, 2025, [https://bib-pubdb1.desy.de/record/206216/files/djung_ipr.pdf](https://bib-pubdb1.desy.de/record/206216/files/djung_ipr.pdf)
7. Dynamic Scene Graph: Enabling Scaling, Positioning, and Navigation in the Universe \- DiVA portal, acessado em novembro 26, 2025, [https://www.diva-portal.org/smash/get/diva2:1133716/FULLTEXT02.pdf](https://www.diva-portal.org/smash/get/diva2:1133716/FULLTEXT02.pdf)
8. Navigating Exoplanetary Systems in Augmented Reality: Preliminary Insights on ExoAR \- DROPS, acessado em novembro 26, 2025, [https://drops.dagstuhl.de/storage/01oasics/oasics-vol130-spacechi2025/OASIcs.SpaceCHI.2025.20/OASIcs.SpaceCHI.2025.20.pdf](https://drops.dagstuhl.de/storage/01oasics/oasics-vol130-spacechi2025/OASIcs.SpaceCHI.2025.20/OASIcs.SpaceCHI.2025.20.pdf)
9. Daily iPad App: Solar Walk \- Engadget, acessado em novembro 26, 2025, [https://www.engadget.com/2011-09-02-daily-ipad-app-solar-walk.html](https://www.engadget.com/2011-09-02-daily-ipad-app-solar-walk.html)
10. The Universe is One Click Away: The Best Free Space Simulations of 2026, acessado em novembro 26, 2025, [https://invernessdesignstudio.com/the-best-free-space-simulations](https://invernessdesignstudio.com/the-best-free-space-simulations)
11. Simulation of the on-orbit construction of structural variable modular spacecraft by robots \- American Modelica Conference 2022, acessado em novembro 26, 2025, [https://2022.american.conference.modelica.org/documents/01_papers/02_full/4_Reiner.pdf](https://2022.american.conference.modelica.org/documents/01_papers/02_full/4_Reiner.pdf)
12. floating point precision in procedurally generated planets ( x-post from /r/gamedev ) \- Reddit, acessado em novembro 26, 2025, [https://www.reddit.com/r/proceduralgeneration/comments/54r7k8/floating_point_precision_in_procedurally/](https://www.reddit.com/r/proceduralgeneration/comments/54r7k8/floating_point_precision_in_procedurally/)
13. Working with large distances (Floating Origin) \- \- Netherlands 3D, acessado em novembro 26, 2025, [https://netherlands3d.eu/docs/developers/features/floating-origin/](https://netherlands3d.eu/docs/developers/features/floating-origin/)
14. Floating Origin in Unity \- Manu's Techblog, acessado em novembro 26, 2025, [https://manuel-rauber.com/2022/04/06/floating-origin-in-unity/](https://manuel-rauber.com/2022/04/06/floating-origin-in-unity/)
15. Floating origin to handle large worlds in Unity. \- GitHub Gist, acessado em novembro 26, 2025, [https://gist.github.com/brihernandez/9ebbaf35070181fa1ee56f9e702cc7a5](https://gist.github.com/brihernandez/9ebbaf35070181fa1ee56f9e702cc7a5)
16. How do people have such good and detailed terrain? : r/spaceengine \- Reddit, acessado em novembro 26, 2025, [https://www.reddit.com/r/spaceengine/comments/adkqi6/how_do_people_have_such_good_and_detailed_terrain/](https://www.reddit.com/r/spaceengine/comments/adkqi6/how_do_people_have_such_good_and_detailed_terrain/)
17. Globe Browsing: Contextualized Spatio-Temporal Planetary Surface Visualization \- DiVA portal, acessado em novembro 26, 2025, [https://www.diva-portal.org/smash/get/diva2:1172454/FULLTEXT02.pdf](https://www.diva-portal.org/smash/get/diva2:1172454/FULLTEXT02.pdf)
18. (PDF) Very Large Scale Visualization Methods for Astrophysical Data \- ResearchGate, acessado em novembro 26, 2025, [https://www.researchgate.net/publication/2581915_Very_Large_Scale_Visualization_Methods_for_Astrophysical_Data](https://www.researchgate.net/publication/2581915_Very_Large_Scale_Visualization_Methods_for_Astrophysical_Data)
19. (PDF) A Transparently Scalable Visualization Architecture for Exploring the Universe, acessado em novembro 26, 2025, [https://www.researchgate.net/publication/6704640_A_Transparently_Scalable_Visualization_Architecture_for_Exploring_the_Universe](https://www.researchgate.net/publication/6704640_A_Transparently_Scalable_Visualization_Architecture_for_Exploring_the_Universe)
20. Visualization in Astrophysics \- Scientific Computing and Imaging Institute \- The University of Utah, acessado em novembro 26, 2025, [https://www.sci.utah.edu/\~beiwang/publications/STAR_Astro_BeiWang_2021.pdf](https://www.sci.utah.edu/~beiwang/publications/STAR_Astro_BeiWang_2021.pdf)
21. Images corresponding to three viewpoints on the logarithmically scaled “wedge” path from the Earth to the Moon. \- ResearchGate, acessado em novembro 26, 2025, [https://www.researchgate.net/figure/mages-corresponding-to-three-viewpoints-on-the-logarithmically-scaled-wedge-path-from_fig3_2581915](https://www.researchgate.net/figure/mages-corresponding-to-three-viewpoints-on-the-logarithmically-scaled-wedge-path-from_fig3_2581915)
22. Add support for reverse-z depth buffer · Issue \#3539 · godotengine/godot-proposals \- GitHub, acessado em novembro 26, 2025, [https://github.com/godotengine/godot-proposals/issues/3539](https://github.com/godotengine/godot-proposals/issues/3539)
23. Rendering large and distant object : r/opengl \- Reddit, acessado em novembro 26, 2025, [https://www.reddit.com/r/opengl/comments/8z5egn/rendering_large_and_distant_object/](https://www.reddit.com/r/opengl/comments/8z5egn/rendering_large_and_distant_object/)
24. OpenGL rendering different objects \- c++ \- Stack Overflow, acessado em novembro 26, 2025, [https://stackoverflow.com/questions/35700648/opengl-rendering-different-objects](https://stackoverflow.com/questions/35700648/opengl-rendering-different-objects)
25. GTA V \- Graphics Study \- Adrian Courrèges \- CGVR, acessado em novembro 26, 2025, [https://cgvr.cs.uni-bremen.de/teaching/vr_literatur/GTA%20V%20-%20Graphics%20Study%20-%20Adrian%20Courreges.pdf](https://cgvr.cs.uni-bremen.de/teaching/vr_literatur/GTA%20V%20-%20Graphics%20Study%20-%20Adrian%20Courreges.pdf)
26. Space Graphics Toolkit \- Documentation \- 4.2.14 \- Carlos Wilkes, acessado em novembro 26, 2025, [https://carloswilkes.com/Documentation/SpaceGraphicsToolkit](https://carloswilkes.com/Documentation/SpaceGraphicsToolkit)
27. GPVC: Graphics Pipeline-Based Visibility Classification for Texture Reconstruction \- MDPI, acessado em novembro 26, 2025, [https://www.mdpi.com/2072-4292/10/11/1725](https://www.mdpi.com/2072-4292/10/11/1725)
28. SolarSystem Class Reference \- Stellarium, acessado em novembro 26, 2025, [https://stellarium.org/doc/0.17/classSolarSystem.html](https://stellarium.org/doc/0.17/classSolarSystem.html)
29. SolarSystem Class Reference \- Stellarium, acessado em novembro 26, 2025, [https://stellarium.org/doc/0.20/classSolarSystem.html](https://stellarium.org/doc/0.20/classSolarSystem.html)
30. Data Fields \- Stellarium, acessado em novembro 26, 2025, [https://stellarium.org/doc/0.17/functions_s.html](https://stellarium.org/doc/0.17/functions_s.html)
31. Stellarium User Guide, acessado em novembro 26, 2025, [http://attic-distfiles.pld-linux.org/by-md5/2/2/223365806774f7f494c857bfff14df70/stellarium_user_guide-0.12.3-1.pdf](http://attic-distfiles.pld-linux.org/by-md5/2/2/223365806774f7f494c857bfff14df70/stellarium_user_guide-0.12.3-1.pdf)
32. MinorPlanet Class Reference \- Stellarium, acessado em novembro 26, 2025, [https://stellarium.org/doc/0.14/classMinorPlanet.html](https://stellarium.org/doc/0.14/classMinorPlanet.html)
33. High resolution planet rendering using HiPS | Stellarium Labs, acessado em novembro 26, 2025, [https://stellarium-labs.com/blog/high-resolution-planet-rendering-using-hips/](https://stellarium-labs.com/blog/high-resolution-planet-rendering-using-hips/)
34. Using the Menus \- Globebrowsing — OpenSpace documentation (latest), acessado em novembro 26, 2025, [https://docs.openspaceproject.com/latest/using-openspace/users/7-menus-globebrowsing.html](https://docs.openspaceproject.com/latest/using-openspace/users/7-menus-globebrowsing.html)
35. Semantic Zoom and Mini-Maps for Software Cities \- arXiv, acessado em novembro 26, 2025, [https://arxiv.org/html/2510.00003v1](https://arxiv.org/html/2510.00003v1)
36. SEAL: Spatially-resolved Embedding Analysis with Linked Imaging Data | bioRxiv, acessado em novembro 26, 2025, [https://www.biorxiv.org/content/10.1101/2025.07.19.665696v1.full-text](https://www.biorxiv.org/content/10.1101/2025.07.19.665696v1.full-text)
37. RenderableGlobe — OpenSpace documentation (latest), acessado em novembro 26, 2025, [https://docs.openspaceproject.com/latest/reference/asset-components/Renderable/RenderableGlobe.html](https://docs.openspaceproject.com/latest/reference/asset-components/Renderable/RenderableGlobe.html)
38. Orbits and Labels colors \- Development \- Page 6 of 13 \- Celestia Forums, acessado em novembro 26, 2025, [https://celestiaproject.space/forum/viewtopic.php?f=4\&t=11184\&start=100](https://celestiaproject.space/forum/viewtopic.php?f=4&t=11184&start=100)
39. Non linear scaling to show a sol system \- Game Development Stack Exchange, acessado em novembro 26, 2025, [https://gamedev.stackexchange.com/questions/104374/non-linear-scaling-to-show-a-sol-system](https://gamedev.stackexchange.com/questions/104374/non-linear-scaling-to-show-a-sol-system)
40. Evidence-Based Methods of Communicating Science to the Public through Data Visualization \- ResearchGate, acessado em novembro 26, 2025, [https://www.researchgate.net/publication/370132001_Evidence-Based_Methods_of_Communicating_Science_to_the_Public_through_Data_Visualization](https://www.researchgate.net/publication/370132001_Evidence-Based_Methods_of_Communicating_Science_to_the_Public_through_Data_Visualization)
41. Evidence-Based Methods of Communicating Science to the Public through Data Visualization \- MDPI, acessado em novembro 26, 2025, [https://www.mdpi.com/2071-1050/15/8/6845](https://www.mdpi.com/2071-1050/15/8/6845)
42. learnopengl_book_bw.pdf, acessado em novembro 26, 2025, [https://learnopengl.com/book/learnopengl_book_bw.pdf](https://learnopengl.com/book/learnopengl_book_bw.pdf)
43. How to use a stencil buffer mask in ogre? \- Stack Overflow, acessado em novembro 26, 2025, [https://stackoverflow.com/questions/8331254/how-to-use-a-stencil-buffer-mask-in-ogre](https://stackoverflow.com/questions/8331254/how-to-use-a-stencil-buffer-mask-in-ogre)
44. A Case Study of a 3D Space-Shooter Game \- GUPEA, acessado em novembro 26, 2025, [https://gupea.ub.gu.se/bitstream/handle/2077/39605/gupea_2077_39605_1.pdf?sequence=1\&isAllowed=y](https://gupea.ub.gu.se/bitstream/handle/2077/39605/gupea_2077_39605_1.pdf?sequence=1&isAllowed=y)
45. Set up a camera stack in URP \- Unity \- Manual, acessado em novembro 26, 2025, [https://docs.unity3d.com/6000.2/Documentation/Manual/urp/camera-stacking.html](https://docs.unity3d.com/6000.2/Documentation/Manual/urp/camera-stacking.html)
46. Camera stacking in URP \- Unity \- Manual, acessado em novembro 26, 2025, [https://docs.unity3d.com/6000.2/Documentation/Manual/urp/cameras/camera-stacking-concepts.html](https://docs.unity3d.com/6000.2/Documentation/Manual/urp/cameras/camera-stacking-concepts.html)
47. Clearing, rendering order and overdraw | Universal RP | 13.1.9, acessado em novembro 26, 2025, [https://docs.unity.cn/Packages/com.unity.render-pipelines.universal@13.1/manual/cameras-advanced.html](https://docs.unity.cn/Packages/com.unity.render-pipelines.universal@13.1/manual/cameras-advanced.html)
48. Camera Stacking in Unity with URP\! (Tutorial) \- YouTube, acessado em novembro 26, 2025, [https://www.youtube.com/watch?v=OmCjPctKkjw](https://www.youtube.com/watch?v=OmCjPctKkjw)
49. How to draw a line with constant width everywhere with respect to the screen In Unity, acessado em novembro 26, 2025, [https://stackoverflow.com/questions/75208510/how-to-draw-a-line-with-constant-width-everywhere-with-respect-to-the-screen-in](https://stackoverflow.com/questions/75208510/how-to-draw-a-line-with-constant-width-everywhere-with-respect-to-the-screen-in)
50. Lesson 5 \- Grid | An infinite canvas tutorial, acessado em novembro 26, 2025, [https://infinitecanvas.cc/guide/lesson-005](https://infinitecanvas.cc/guide/lesson-005)
51. Orbit lines to have 'depth' perception. | Frontier Forums, acessado em novembro 26, 2025, [https://forums.frontier.co.uk/threads/orbit-lines-to-have-depth-perception.352778/](https://forums.frontier.co.uk/threads/orbit-lines-to-have-depth-perception.352778/)
52. Impacts of 3D visualizations and virtual reality in display designs for remote monitoring of satellite operations \- Frontiers, acessado em novembro 26, 2025, [https://www.frontiersin.org/journals/virtual-reality/articles/10.3389/frvir.2025.1487281/full](https://www.frontiersin.org/journals/virtual-reality/articles/10.3389/frvir.2025.1487281/full)
53. Orbit automatic smoothing? \- Development \- Celestia Forums, acessado em novembro 26, 2025, [https://celestiaproject.space/forum/viewtopic.php?f=4\&t=11212](https://celestiaproject.space/forum/viewtopic.php?f=4&t=11212)
54. Propagating Orbital Bodies in Unity Gaming Engine \- Superhedral, acessado em novembro 26, 2025, [https://superhedral.com/2020/12/21/propagating-orbital-bodies-in-unity-gaming-engine/](https://superhedral.com/2020/12/21/propagating-orbital-bodies-in-unity-gaming-engine/)
55. Celestia Guide, acessado em novembro 26, 2025, [https://celestiaproject.space/docs/CelestiaGuide.html](https://celestiaproject.space/docs/CelestiaGuide.html)
56. Celestia/Celx Scripting/CELX Lua Methods/Celx celestia \- Wikibooks, open books for an open world, acessado em novembro 26, 2025, [https://en.wikibooks.org/wiki/Celestia/Celx_Scripting/CELX_Lua_Methods/Celx_celestia](https://en.wikibooks.org/wiki/Celestia/Celx_Scripting/CELX_Lua_Methods/Celx_celestia)
57. Stellarium 25.2 User Guide \- Georg Zotti, Alexander Wolf (editors) 2025, acessado em novembro 26, 2025, [https://stellarium.org/files/guide.pdf](https://stellarium.org/files/guide.pdf)
58. Celestia notes \- CLASSE (Cornell), acessado em novembro 26, 2025, [https://www.classe.cornell.edu/\~seb/celestia/celestia_notes.html](https://www.classe.cornell.edu/~seb/celestia/celestia_notes.html)
59. Modelling for Celestia \- CLASSE (Cornell), acessado em novembro 26, 2025, [https://www.classe.cornell.edu/\~seb/celestia/modelling.html](https://www.classe.cornell.edu/~seb/celestia/modelling.html)
60. Celestia 1.5.0 prerelease 1 \- Celestia Users \- Celestia Forums, acessado em novembro 26, 2025, [https://celestiaproject.space/forum/viewtopic.php?f=2\&t=10473](https://celestiaproject.space/forum/viewtopic.php?f=2&t=10473)
61. Releases · Stellarium/stellarium \- GitHub, acessado em novembro 26, 2025, [https://github.com/Stellarium/stellarium/releases?after=v0.13.1](https://github.com/Stellarium/stellarium/releases?after=v0.13.1)
62. Lab 2: An OpenGL Solar System, acessado em novembro 26, 2025, [https://www.csc.kth.se/utbildning/kth/kurser/DH2323/dgi11/kurspm/OpenGL-Lab2.pdf](https://www.csc.kth.se/utbildning/kth/kurser/DH2323/dgi11/kurspm/OpenGL-Lab2.pdf)
63. StaticScale — OpenSpace documentation (releases-v0.20), acessado em novembro 26, 2025, [https://docs.openspaceproject.com/releases-v0.20/generated/asset-components/StaticScale.html](https://docs.openspaceproject.com/releases-v0.20/generated/asset-components/StaticScale.html)
64. LuaScale — OpenSpace documentation (releases-v0.20), acessado em novembro 26, 2025, [https://docs.openspaceproject.com/releases-v0.20/generated/asset-components/LuaScale.html](https://docs.openspaceproject.com/releases-v0.20/generated/asset-components/LuaScale.html)
65. Under the Hood of Virtual Globes, acessado em novembro 26, 2025, [https://virtualglobebook.com/Under_the_Hood_of_Virtual_Globes.pdf](https://virtualglobebook.com/Under_the_Hood_of_Virtual_Globes.pdf)
66. CosmoScout VR: A Modular 3D Solar System Based on SPICE, acessado em novembro 26, 2025, [https://elib.dlr.de/189930/1/cosmoscout_vr.pdf](https://elib.dlr.de/189930/1/cosmoscout_vr.pdf)
67. Solar System Scope \- App Store, acessado em novembro 26, 2025, [https://apps.apple.com/bh/app/solar-system-scope/id863969175](https://apps.apple.com/bh/app/solar-system-scope/id863969175)
68. Solar System Scope \- Apps on Google Play, acessado em novembro 26, 2025, [https://play.google.com/store/apps/details?id=air.com.eu.inove.sss2\&hl=en_US](https://play.google.com/store/apps/details?id=air.com.eu.inove.sss2&hl=en_US)
69. Co-Present Learning With Tablets in Primary School \- Publikationen der UdS \- Universität des Saarlandes, acessado em novembro 26, 2025, [https://publikationen.sulb.uni-saarland.de/bitstream/20.500.11880/30901/6/Dissertation_Kataja_UdS_Scidok.pdf](https://publikationen.sulb.uni-saarland.de/bitstream/20.500.11880/30901/6/Dissertation_Kataja_UdS_Scidok.pdf)
70. Conceptualizing astronomical scale: Virtual simulations on handheld tablet computers reverse misconceptions \- ResearchGate, acessado em novembro 26, 2025, [https://www.researchgate.net/publication/262157415_Conceptualizing_astronomical_scale_Virtual_simulations_on_handheld_tablet_computers_reverse_misconceptions](https://www.researchgate.net/publication/262157415_Conceptualizing_astronomical_scale_Virtual_simulations_on_handheld_tablet_computers_reverse_misconceptions)
71. Smaller than Pixels: Rendering Millions of Stars in Real-Time \- Bauhaus-Universität Weimar, acessado em novembro 26, 2025, [https://www.uni-weimar.de/fileadmin/user/fak/medien/professuren/Virtual_Reality/documents/publications/2025_Smaller_than_Pixels_Rendering_Millions_of_Stars_in_Real-Time.pdf](https://www.uni-weimar.de/fileadmin/user/fak/medien/professuren/Virtual_Reality/documents/publications/2025_Smaller_than_Pixels_Rendering_Millions_of_Stars_in_Real-Time.pdf)
