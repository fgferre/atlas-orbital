# **Engenharia Computacional de Alta Fidelidade para Simulação Espacial: Uma Análise Técnica Profunda da Arquitetura do NASA Eyes on the Solar System**

## **1\. Introdução à Engenharia de Visualização Científica Espacial**

A aplicação _NASA Eyes on the Solar System_ representa um marco na convergência entre a astrodinâmica rigorosa e a computação gráfica em tempo real acessível via web. Para o engenheiro de software ou pesquisador que busca replicar tal sistema em um "app de estudo", é fundamental compreender que este software não opera sob as premissas de uma _game engine_ tradicional, mas sim como um terminal de visualização de dados científicos massivos. A fidelidade da simulação não reside na complexidade dos shaders de superfície, mas na integridade dos sistemas de coordenadas, na precisão da propagação orbital e na gestão eficiente de grandes volumes de dados astronômicos.1

Diferentemente de visualizações artísticas, onde a posição dos astros pode ser aproximada, o _NASA Eyes_ ingere dados de telemetria reais do _Deep Space Network_ (DSN) e efemérides calculadas pelo _Solar System Dynamics Group_ do JPL.1 A transição histórica da ferramenta—originalmente baseada na _game engine_ Unity e plugins web, e agora migrada para tecnologias nativas do navegador baseadas em WebGL—oferece um estudo de caso valioso sobre a otimização de renderização 3D em ambientes de "client-side" restritos.5

Este relatório técnico disseca a arquitetura necessária para construir um sistema análogo. A análise aborda desde a resolução de problemas de ponto flutuante em escalas astronômicas até a implementação de _kernels_ SPICE via WebAssembly, focando explicitamente nos pedidos do usuário: renderização do _starfield_, posicionamento celestial e algoritmos de navegação.

## ---

**2\. Arquitetura de Engine e Stack Tecnológico**

A escolha do stack tecnológico é determinante para a viabilidade de uma simulação desta magnitude. A análise forense da aplicação atual e a literatura técnica do JPL indicam uma arquitetura centrada em padrões abertos, abandonando dependências proprietárias antigas.

### **2.1. O Núcleo Gráfico: WebGL e Abstrações de Cena**

A versão moderna do _NASA Eyes_ opera sobre **WebGL** (Web Graphics Library), uma API JavaScript que permite a renderização de gráficos 3D acelerados por hardware diretamente no elemento HTML5 \<canvas\>.7 O uso direto da API WebGL pura, no entanto, é verboso e propenso a erros para o gerenciamento de grafos de cena complexos.

As evidências apontam fortemente para o uso, ou inspiração direta, na biblioteca **Three.js** para o gerenciamento do _scene graph_. O Three.js abstrai a complexidade dos _buffers_ de vértices, shaders e matrizes de transformação, fornecendo classes otimizadas para matemática vetorial (Vector3, Matrix4, Quaternion) essenciais para a mecânica orbital.7 Para um app de estudo, a adoção do Three.js é a estratégia de replicação mais eficiente, permitindo focar na lógica astronômica em vez de na gestão de memória de vídeo de baixo nível.

**Comparativo de Stacks para Replicação:**

| Componente         | Tecnologia NASA Eyes (Inferida/Documentada) | Recomendação para App de Estudo | Justificativa Técnica                                                                                |
| :----------------- | :------------------------------------------ | :------------------------------ | :--------------------------------------------------------------------------------------------------- |
| **API Gráfica**    | WebGL 2.0                                   | WebGL 2.0 via Three.js          | Suporte nativo a instancing e shaders GLSL complexos sem plugins.10                                  |
| **Linguagem**      | JavaScript / TypeScript                     | TypeScript                      | A tipagem estática é crucial para garantir a integridade de estruturas de dados vetoriais complexas. |
| **Matemática**     | Bibliotecas Proprietárias JPL / gl-matrix   | gl-matrix ou Math.gl            | Operações de matriz 4x4 de alta performance são o gargalo da CPU na simulação.11                     |
| **Dados Orbitais** | SPICE Toolkit (Fortran/C transpilado)       | cspice.js (Wasm)                | A precisão orbital exige algoritmos que bibliotecas de jogos padrão não possuem.12                   |

### **2.2. O Desafio da Escala: Precisão de Ponto Flutuante**

O obstáculo técnico mais significativo na replicação do _NASA Eyes_ é a limitação da precisão numérica das GPUs. O padrão IEEE 754 de precisão simples (32-bit float), utilizado nativamente em shaders WebGL, oferece apenas cerca de 7 dígitos decimais de precisão.

Ao renderizar o Sistema Solar, as coordenadas variam de metros (tamanho de uma sonda) a $10^{13}$ metros (limites da heliosfera). Se a origem do mundo $(0,0,0)$ for o Sol, a renderização de uma nave em Plutão sofrerá de **"jitter"** (tremulação de vértices) catastrófico e **"Z-fighting"** (artefatos de sobreposição de profundidade), pois a GPU não consegue distinguir a diferença entre $5.900.000.000$ km e $5.900.000.001$ km.13

#### **2.2.1. Solução A: Buffer de Profundidade Logarítmico**

Para resolver o _Z-fighting_, o _NASA Eyes_ implementa um **Logarithmic Depth Buffer**. Em vez de armazenar a profundidade linearmente (onde a precisão é desperdiçada em objetos próximos), a profundidade do fragmento (gl_FragDepth) é reescrita no _fragment shader_ usando uma escala logarítmica.9

A implementação técnica no shader GLSL para o app de estudo deve seguir a seguinte lógica matemática:

$$\\text{gl\\\_FragDepthEXT} \= \\frac{\\log(C \\cdot w \+ 1.0)}{\\log(C \\cdot \\text{FarPlane} \+ 1.0)}$$  
Onde:

- $C$ é uma constante de escala (geralmente 1.0).
- $w$ é a coordenada W do clipe (profundidade linear).
- $\\text{FarPlane}$ é a distância máxima de renderização.

No framework Three.js, isso é ativado via flag renderer \= new WebGLRenderer({ logarithmicDepthBuffer: true }). Esta técnica permite renderizar a ISS a 10 metros da câmera e Saturno ao fundo simultaneamente sem que Saturno "recorte" visualmente através da estação.10

#### **2.2.2. Solução B: Origem Flutuante (Floating Origin)**

Para resolver o "jitter" das malhas geométricas, utiliza-se a técnica de **Origem Flutuante**. O sistema de coordenadas visual é desacoplado do sistema de coordenadas lógico da simulação.11

**Algoritmo de Implementação:**

1. **Espaço Lógico (CPU):** Todas as posições de planetas e naves são armazenadas em variáveis de precisão dupla (float64 ou BigInt em JavaScript moderno), mantendo a precisão absoluta relativa ao Sol (J2000).
2. **Reset de Origem:** A cada quadro de renderização, a câmera é considerada a origem $(0,0,0)$ do universo _visual_.
3. Translação Relativa: Antes de enviar os objetos para a GPU, subtrai-se a posição da câmera da posição do objeto:

   $$\\vec{P}\_{\\text{GPU}} \= \\vec{P}\_{\\text{Objeto}} \- \\vec{P}\_{\\text{Câmera}}$$

4. **Resultado:** A GPU sempre processa coordenadas pequenas para os objetos próximos à câmera (onde a precisão visual importa), eliminando a tremulação mesmo nas bordas do sistema solar. O app de estudo _deve_ implementar uma classe de câmera customizada que gerencie essa subtração de vetores antes da renderização.11

## ---

**3\. Engenharia do Starfield (Campo Estelar)**

O _starfield_ no _NASA Eyes_ não é uma textura estática (_skybox_) colada no fundo da cena. É uma renderização volumétrica baseada em dados reais de astrometria, permitindo que as constelações se distorçam realisticamente se o usuário viajar para uma estrela distante (exoplanetas).18

### **3.1. Ingestão de Dados: Catálogos Astronômicos**

A base de dados primária utilizada é o **Catálogo Hipparcos** (High Precision Parallax Collecting Satellite), que fornece posição, paralaxe e magnitude de alta precisão para cerca de 118.218 estrelas.20 Para maior densidade visual, o catálogo **Tycho-2** é utilizado complementarmente, elevando a contagem para mais de 2,5 milhões de estrelas, embora versões web geralmente limitem esse número para performance.23

Para o app de estudo, recomenda-se o uso do conjunto de dados processado conhecido como **HYG Database** (Hipparcos, Yale Bright Star, Gliese), que combina as melhores medições. O formato de dados ideal para ingestão web não é CSV (muito lento para _parse_), mas sim arquivos binários ou JSON minimizado contendo apenas os atributos essenciais:

- ID (Hipparcos ID)
- Ascensão Reta ($\\alpha$)
- Declinação ($\\delta$)
- Distância/Paralaxe ($r$)
- Magnitude Visual ($V\_{mag}$)
- Índice de Cor ($B-V$)

### **3.2. Algoritmos de Posicionamento e Conversão de Coordenadas**

As estrelas nos catálogos são definidas em **Coordenadas Equatoriais Celestiais**. O motor gráfico (WebGL) opera em **Coordenadas Cartesianas**. A conversão deve ser realizada no momento do carregamento dos dados ou, para máxima performance, pré-processada offline.25

A matriz de transformação matemática para converter RA ($\\alpha$) e Dec ($\\delta$) em $(x,y,z)$ é derivada da trigonometria esférica:

$$\\begin{bmatrix} x \\\\ y \\\\ z \\end{bmatrix} \= R \\cdot \\begin{bmatrix} \\cos(\\delta) \\cdot \\cos(\\alpha) \\\\ \\cos(\\delta) \\cdot \\sin(\\alpha) \\\\ \\sin(\\delta) \\end{bmatrix}$$  
**Considerações Técnicas de Implementação:**

- **Unidades:** $\\alpha$ e $\\delta$ devem ser convertidos de Graus/Horas para Radianos.
- **Sistema de Eixos:** O _NASA Eyes_ utiliza o sistema J2000, onde o eixo $X$ aponta para o Equinócio Vernal (Ponto de Áries). No WebGL/Three.js, o eixo $Y$ é comumente "para cima". Pode ser necessário permutar $Y$ e $Z$ na fórmula acima dependendo da orientação da câmera do app.27
- **Distância de Projeção ($R$):** Para a visualização do sistema solar, a distância real das estrelas causaria problemas de _Z-buffer_. O _NASA Eyes_ projeta as estrelas em uma "Esfera Celeste" virtual de raio fixo e muito grande (ex: $10^{15}$ metros), mas antes do limite de _clipping_ da câmera, tratando-as como estando no infinito visual, a menos que o modo de exploração interestelar seja ativado.19

### **3.3. Pipeline de Renderização: Point Sprites e Shaders**

Renderizar 100.000 malhas esféricas (polígonos) inviabilizaria a performance. A técnica empregada é o **Instanced Rendering** de **Point Sprites** (Billboards).29

#### **3.3.1. Vertex Shader (Posição e Tamanho)**

No WebGL, desenha-se uma única geometria (um quadrado ou ponto) repetida 100.000 vezes (gl.drawArraysInstanced). O _Vertex Shader_ recebe os atributos de cada estrela e calcula sua posição na tela.

O tamanho do ponto (gl_PointSize) não é fixo; ele é uma função da Magnitude Aparente ($V\_{mag}$). A escala de magnitude é logarítmica inversa (estrelas menores em magnitude são mais brilhantes). O algoritmo de escala no shader deve seguir a função de brilho perceptivo:

$$\\text{PixelSize} \= \\text{BaseSize} \\times 2.512^{(\\text{MagLimit} \- V\_{mag})}$$

Isso assegura que Sirius (Mag \-1.46) apareça significativamente maior que uma estrela de Mag 5.32

#### **3.3.2. Fragment Shader (Cor e Estética)**

A cor das estrelas no _NASA Eyes_ é cientificamente precisa, derivada do **Índice de Cor B-V**. O _Fragment Shader_ deve implementar uma conversão de temperatura de corpo negro.

**Algoritmo de Conversão B-V para RGB (GLSL):**

1. Estimar a temperatura $T$ (Kelvin) a partir de $B-V$ (Fórmula de Ballesteros):

   $$T \= 4600 \\left( \\frac{1}{0.92(B-V) \+ 1.7} \+ \\frac{1}{0.92(B-V) \+ 0.62} \\right)$$

2. Mapear $T$ para canais RGB. Isso geralmente é feito através de uma textura 1D de gradiente de temperatura ou uma aproximação polinomial no shader para evitar leituras de textura.34

Além da cor, o shader aplica uma função de suavização radial (Gaussian Blur) no ponto quadrado para que ele pareça uma esfera de luz difusa, evitando o aspecto de "pixels quadrados".33

## ---

**4\. Dinâmica do Sistema Solar: Efemérides e Tempo**

A "alma" do _NASA Eyes_ é a precisão com que os objetos se movem. Diferente de jogos que usam órbitas circulares simples, a NASA utiliza propagação numérica baseada em perturbações gravitacionais.

### **4.1. O Toolkit SPICE e Kernels**

Toda a navegação da NASA baseia-se no toolkit **SPICE** (Spacecraft, Planet, Instrument, C-matrix, Events), gerenciado pelo NAIF (Navigation and Ancillary Information Facility).25 Para replicar isso, o app de estudo deve consumir os arquivos de dados chamados **Kernels**:

- **SPK (.bsp):** Contém os dados de trajetória (posição e velocidade) de planetas, satélites, cometas e naves espaciais.
- **PCK (.tpc):** Contém orientações, tamanhos e modelos de forma elipsoidais.
- **LSK (.tls):** Contém a tabela de _Leap Seconds_ para conversão precisa entre UTC e TDB (Barycentric Dynamical Time).

#### **4.1.1. Integração Web: cspice.js e WebAssembly**

Ler arquivos binários legados (criados em Fortran) no navegador era impossível até o advento do **WebAssembly**. O app de estudo deve utilizar bibliotecas como **cspice.js** ou **timecraftjs**, que são compilações diretas do código C do SPICE para Wasm.12

- **Fluxo de Dados:** O app carrega um kernel genérico (ex: de440.bsp para planetas principais) e consulta a posição de Júpiter em tempo real. A biblioteca Wasm retorna o vetor $(x, y, z)$ em km, que é então processado pelo sistema de "Origem Flutuante" descrito na seção 2.2.2.

### **4.2. Algoritmo de Interpolação de Chebyshev**

Internamente, os arquivos SPK utilizam **Polinômios de Chebyshev** para compactar a trajetória. A NASA não armazena a posição para cada segundo. Ela armazena coeficientes que descrevem a curva da órbita em intervalos de tempo (ex: 32 dias para planetas externos).40

Se o uso do Wasm for inviável para o estudo, o desenvolvedor pode implementar um leitor de Chebyshev simplificado em TypeScript:

$$P(t) \= \\sum\_{n=0}^{N} a\_n T\_n(\\tau)$$

Onde $T\_n$ são os polinômios de Chebyshev e $\\tau$ é o tempo normalizado dentro do intervalo do coeficiente. Isso permite calcular a posição exata de um corpo em qualquer fração de segundo sem a necessidade de integração física (como Runge-Kutta) em tempo real, garantindo estabilidade total da simulação.42

### **4.3. Alternativa via API: JPL Horizons**

Para um app de estudo mais leve, pode-se evitar o processamento de binários SPICE utilizando a **API REST do JPL Horizons**.43

- O app solicita vetores de estado (VECTORS) para um intervalo de tempo.
- A API retorna um JSON/Texto com X, Y, Z, VX, VY, VZ.
- O app interpola (Spline Cúbica) entre esses pontos para animar os objetos. Embora gere tráfego de rede, elimina a complexidade de processamento de kernels no cliente.

## ---

**5\. Algoritmos de Navegação e Câmera**

A experiência de usuário no _NASA Eyes_ é definida por um controle de câmera fluido que transita entre escalas (do solo de Marte para a visão galáctica) sem desorientar o usuário.

### **5.1. Rotação via Quaternions**

No espaço, não existe "cima" absoluto. Câmeras baseadas em Ângulos de Euler (Yaw, Pitch, Roll) sofrem de _Gimbal Lock_ (travamento dos eixos). O _NASA Eyes_ utiliza exclusivamente **Quaternions** para orientação da câmera.46

O controlador de câmera do app deve implementar a operação **Slerp** (Spherical Linear Interpolation) para transições de foco. Quando o usuário clica em "Ir para Saturno":

1. O app calcula o Quaternion de rotação necessário para olhar para Saturno.
2. Interpola o Quaternion atual da câmera para o alvo ao longo do tempo.
3. Simultaneamente, interpola a posição da câmera, mantendo o vetor "Up" relativo ao plano da eclíptica ou ao polo norte do corpo alvo.

### **5.2. Sistema "LookAt" Dinâmico**

Como os planetas se movem a dezenas de km/s, uma câmera estática perderia o objeto de vista instantaneamente. O controlador de câmera deve ser **hierárquico**.46

- A câmera não é posicionada no espaço global. Ela é "filha" (no grafo de cena) de um "nó de foco" invisível que compartilha a posição do planeta alvo.
- Assim, a translação orbital do planeta é herdada automaticamente pela câmera, e o controle do mouse apenas orbita o planeta localmente, sem precisar compensar a velocidade orbital da Terra ou Marte manualmente.

## ---

**6\. Síntese de Replicação e Estratégia de Dados**

Para consolidar a replicação do _NASA Eyes on the Solar System_, apresenta-se abaixo a estrutura de dados e fluxo de execução recomendados para o app de estudo.

### **6.1. Tabela de Estrutura de Dados de Ativos**

| Ativo           | Fonte de Dados Recomendada    | Formato de Ingestão                    | Técnica de Renderização                      |
| :-------------- | :---------------------------- | :------------------------------------- | :------------------------------------------- |
| **Estrelas**    | HYG Database (Hipparcos Sub.) | JSON/Binário (ArrayBuffer)             | Instanced Point Sprites (Shader Customizado) |
| **Planetas**    | JPL Horizons / SPICE Kernels  | .BSP (via Wasm) ou JSON (API)          | Mesh Standard (Esferas Texturizadas)         |
| **Trajetórias** | SPICE (SPK)                   | Line Vertices (Calculados em Runtime)  | GL_LINES com Logarithmic Depth               |
| **Tempo**       | Relógio do Sistema            | Date Object (Convertido para J2000 ET) | Variável Global Uniforme                     |

### **6.2. Diagrama Lógico de Execução (Loop de Renderização)**

O _loop_ principal do app de estudo deve seguir estritamente esta ordem para garantir a sincronia física e visual:

1. **Time Update:** Avançar o tempo da simulação (GameTime \+= DeltaTime \* TimeScale).
2. **Ephemeris Step:** Calcular a nova posição $(x,y,z)$ absoluta de todos os corpos ativos usando cspice.js ou interpolação de dados Horizons para o novo GameTime.
3. **Floating Origin Reset:**
   - Identificar a posição absoluta da câmera ou objeto de foco ($P\_{foco}$).
   - Reposicionar a câmera visual para $(0,0,0)$ (ou próximo).
   - Calcular posições relativas de todos os objetos: $P\_{rel} \= P\_{abs} \- P\_{foco}$.
4. **Scene Graph Update:** Atualizar as matrizes de transformação do Three.js com os novos $P\_{rel}$.
5. **Render:** Executar renderer.render(scene, camera) com _Logarithmic Depth Buffer_ ativado.

Ao seguir esta arquitetura, o desenvolvedor não apenas replicará o visual, mas também a integridade estrutural e científica que define a ferramenta oficial da NASA. A combinação de **WebGL** para performance gráfica, **SPICE/Chebyshev** para precisão física e **Origem Flutuante** para estabilidade numérica constitui a tríade fundamental da engenharia de software de simulação espacial moderna.

#### **Referências citadas**

1. NASA's Eyes, acessado em dezembro 9, 2025, [https://science.nasa.gov/eyes/](https://science.nasa.gov/eyes/)
2. Explore the Solar System With NASA's New-and-Improved 3D 'Eyes', acessado em dezembro 9, 2025, [https://www.jpl.nasa.gov/news/explore-the-solar-system-with-nasas-new-and-improved-3d-eyes/](https://www.jpl.nasa.gov/news/explore-the-solar-system-with-nasas-new-and-improved-3d-eyes/)
3. NASA Open Source Software, acessado em dezembro 9, 2025, [https://code.nasa.gov/](https://code.nasa.gov/)
4. NASA SVS | Home, acessado em dezembro 9, 2025, [https://svs.gsfc.nasa.gov/](https://svs.gsfc.nasa.gov/)
5. NASA Gives Public New Internet Tool to Explore the Solar System, acessado em dezembro 9, 2025, [https://www.jpl.nasa.gov/news/nasa-gives-public-new-internet-tool-to-explore-the-solar-system/](https://www.jpl.nasa.gov/news/nasa-gives-public-new-internet-tool-to-explore-the-solar-system/)
6. NASA's Eyes \- Wikipedia, acessado em dezembro 9, 2025, [https://en.wikipedia.org/wiki/NASA%27s_Eyes](https://en.wikipedia.org/wiki/NASA%27s_Eyes)
7. need help which technology did NASA is using to create this : r/augmentedreality \- Reddit, acessado em dezembro 9, 2025, [https://www.reddit.com/r/augmentedreality/comments/160uloc/need_help_which_technology_did_nasa_is_using_to/](https://www.reddit.com/r/augmentedreality/comments/160uloc/need_help_which_technology_did_nasa_is_using_to/)
8. I built a fully interactive 3D Solar System using ThreeJS \- With Copilot \- Reddit, acessado em dezembro 9, 2025, [https://www.reddit.com/r/threejs/comments/1msjm2j/i_built_a_fully_interactive_3d_solar_system_using/](https://www.reddit.com/r/threejs/comments/1msjm2j/i_built_a_fully_interactive_3d_solar_system_using/)
9. THREE.JS: Render large, distant objects at correct z-indicies and still zoom into small objects \- Stack Overflow, acessado em dezembro 9, 2025, [https://stackoverflow.com/questions/31122775/three-js-render-large-distant-objects-at-correct-z-indicies-and-still-zoom-int](https://stackoverflow.com/questions/31122775/three-js-render-large-distant-objects-at-correct-z-indicies-and-still-zoom-int)
10. WebGLRenderer.logarithmicDepthBuffer – three.js docs, acessado em dezembro 9, 2025, [https://threejs.org/docs/\#api/en/renderers/WebGLRenderer.logarithmicDepthBuffer](https://threejs.org/docs/#api/en/renderers/WebGLRenderer.logarithmicDepthBuffer)
11. Floating Origin (Huge Scenes Support) \- Babylon.js Documentation, acessado em dezembro 9, 2025, [https://doc.babylonjs.com/features/featuresDeepDive/scene/floating_origin/](https://doc.babylonjs.com/features/featuresDeepDive/scene/floating_origin/)
12. @gamergenic/js-spice \- npm, acessado em dezembro 9, 2025, [https://www.npmjs.com/package/%40gamergenic%2Fjs-spice](https://www.npmjs.com/package/%40gamergenic%2Fjs-spice)
13. Can the solar system be accurately represented in 3d space using doubles (or longs)?, acessado em dezembro 9, 2025, [https://gamedev.stackexchange.com/questions/29466/can-the-solar-system-be-accurately-represented-in-3d-space-using-doubles-or-lon](https://gamedev.stackexchange.com/questions/29466/can-the-solar-system-be-accurately-represented-in-3d-space-using-doubles-or-lon)
14. floating point precision in procedurally generated planets ( x-post from /r/gamedev ) \- Reddit, acessado em dezembro 9, 2025, [https://www.reddit.com/r/proceduralgeneration/comments/54r7k8/floating_point_precision_in_procedurally/](https://www.reddit.com/r/proceduralgeneration/comments/54r7k8/floating_point_precision_in_procedurally/)
15. How to render very small and very large objects together? \- Questions \- three.js forum, acessado em dezembro 9, 2025, [https://discourse.threejs.org/t/how-to-render-very-small-and-very-large-objects-together/76585](https://discourse.threejs.org/t/how-to-render-very-small-and-very-large-objects-together/76585)
16. 3D World Generation \#8: Floating Origins for Bigger Worlds (JavaScript/Three.js) \- YouTube, acessado em dezembro 9, 2025, [https://www.youtube.com/watch?v=qYdcynW94vM](https://www.youtube.com/watch?v=qYdcynW94vM)
17. Camera and floating point origin \- Questions \- three.js forum, acessado em dezembro 9, 2025, [https://discourse.threejs.org/t/camera-and-floating-point-origin/51486](https://discourse.threejs.org/t/camera-and-floating-point-origin/51486)
18. NASA's Web-Based 'Eyes' Apps are Great Educational Tools \- Vatican Observatory, acessado em dezembro 9, 2025, [https://www.vaticanobservatory.org/sacred-space-astronomy/nasas-web-based-eyes-apps-are-great-educational-tools/](https://www.vaticanobservatory.org/sacred-space-astronomy/nasas-web-based-eyes-apps-are-great-educational-tools/)
19. An Elsewhere Starfield \- NASA SVS, acessado em dezembro 9, 2025, [https://svs.gsfc.nasa.gov/4856](https://svs.gsfc.nasa.gov/4856)
20. Celestia/Print Version \- Wikibooks, open books for an open world, acessado em dezembro 9, 2025, [https://en.wikibooks.org/wiki/Celestia/Print_Version](https://en.wikibooks.org/wiki/Celestia/Print_Version)
21. A Nebula by Any Other Name \- NASA Jet Propulsion Laboratory (JPL), acessado em dezembro 9, 2025, [https://www.jpl.nasa.gov/images/pia13127-a-nebula-by-any-other-name/](https://www.jpl.nasa.gov/images/pia13127-a-nebula-by-any-other-name/)
22. Exoplaneter: En Interaktiv Visualisering av Data och Upptäcktsmetoder \- DiVA portal, acessado em dezembro 9, 2025, [https://www.diva-portal.org/smash/get/diva2:1315169/FULLTEXT01.pdf](https://www.diva-portal.org/smash/get/diva2:1315169/FULLTEXT01.pdf)
23. Online Resources for Astronomy Education and Outreach \- Cambridge University Press & Assessment, acessado em dezembro 9, 2025, [https://www.cambridge.org/core/services/aop-cambridge-core/content/view/203C03AE0DD3D880ED4AEA84F07A1969/S1743921321000399a.pdf/online-resources-for-astronomy-education-and-outreach.pdf](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/203C03AE0DD3D880ED4AEA84F07A1969/S1743921321000399a.pdf/online-resources-for-astronomy-education-and-outreach.pdf)
24. Stunning 3D interactive map of known space\! \- Reddit, acessado em dezembro 9, 2025, [https://www.reddit.com/r/space/comments/1r6cd1/stunning_3d_interactive_map_of_known_space/](https://www.reddit.com/r/space/comments/1r6cd1/stunning_3d_interactive_map_of_known_space/)
25. cspice_radrec, acessado em dezembro 9, 2025, [https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/MATLAB/mice/cspice_radrec.html](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/MATLAB/mice/cspice_radrec.html)
26. Can anyone check my code that converts RA/DEC to galactic coordinates?, acessado em dezembro 9, 2025, [https://astronomy.stackexchange.com/questions/55977/can-anyone-check-my-code-that-converts-ra-dec-to-galactic-coordinates](https://astronomy.stackexchange.com/questions/55977/can-anyone-check-my-code-that-converts-ra-dec-to-galactic-coordinates)
27. Celestia/Star Database Format \- Wikibooks, open books for an open world, acessado em dezembro 9, 2025, [https://en.wikibooks.org/wiki/Celestia/Star_Database_Format](https://en.wikibooks.org/wiki/Celestia/Star_Database_Format)
28. Recreating a classic starfield in GLSL & three.js \- DEV Community, acessado em dezembro 9, 2025, [https://dev.to/jessesolomon/recreating-a-classic-starfield-in-glsl-three-js-ii](https://dev.to/jessesolomon/recreating-a-classic-starfield-in-glsl-three-js-ii)
29. A Particle System for Interactive Visualization of 3D Flows | Request PDF \- ResearchGate, acessado em dezembro 9, 2025, [https://www.researchgate.net/publication/7496996_A_Particle_System_for_Interactive_Visualization_of_3D_Flows](https://www.researchgate.net/publication/7496996_A_Particle_System_for_Interactive_Visualization_of_3D_Flows)
30. Mastering openFrameworks: Creative Coding Demystified \- Parsons The New School for Design, acessado em dezembro 9, 2025, [http://b.parsons.edu/\~traviss/booKs/oF/Mastering%20openFrameworks%20-%20Yanc,%20Chris_compressed.pdf](http://b.parsons.edu/~traviss/booKs/oF/Mastering%20openFrameworks%20-%20Yanc,%20Chris_compressed.pdf)
31. Three.js part 1 – make a star-field \- CreativeJS, acessado em dezembro 9, 2025, [http://creativejs.com/tutorials/three-js-part-1-make-a-star-field/index.html](http://creativejs.com/tutorials/three-js-part-1-make-a-star-field/index.html)
32. How to Find the Viewing Size of a Star \- Astronomy Stack Exchange, acessado em dezembro 9, 2025, [https://astronomy.stackexchange.com/questions/22474/how-to-find-the-viewing-size-of-a-star](https://astronomy.stackexchange.com/questions/22474/how-to-find-the-viewing-size-of-a-star)
33. Display sprites correctly with customized Points material? \- Questions \- three.js forum, acessado em dezembro 9, 2025, [https://discourse.threejs.org/t/display-sprites-correctly-with-customized-points-material/12555](https://discourse.threejs.org/t/display-sprites-correctly-with-customized-points-material/12555)
34. Star B-V color index to apparent RGB color \- Stack Overflow, acessado em dezembro 9, 2025, [https://stackoverflow.com/questions/21977786/star-b-v-color-index-to-apparent-rgb-color](https://stackoverflow.com/questions/21977786/star-b-v-color-index-to-apparent-rgb-color)
35. Color index \- Wikipedia, acessado em dezembro 9, 2025, [https://en.wikipedia.org/wiki/Color_index](https://en.wikipedia.org/wiki/Color_index)
36. Rendering Astronomic Stars | Joren's, acessado em dezembro 9, 2025, [https://jorenjoestar.github.io/post/realistic_stars/realistic_stars/](https://jorenjoestar.github.io/post/realistic_stars/realistic_stars/)
37. SPICE Time Subsystem \- NASA, acessado em dezembro 9, 2025, [https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/time.html](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/time.html)
38. NASA-AMMOS/timecraftjs: Time conversion using NAIF CSPICE Toolkit in JavaScript via Emscripten. \- GitHub, acessado em dezembro 9, 2025, [https://github.com/NASA-AMMOS/timecraftjs](https://github.com/NASA-AMMOS/timecraftjs)
39. arturania/cspice: NASA/JPL SPICE Toolkit for C – patched for cross-platform compatibility, acessado em dezembro 9, 2025, [https://github.com/arturania/cspice](https://github.com/arturania/cspice)
40. Chebyshev Interpolation Using Almost Equally Spaced Points and Applications in Emission Tomography \- MDPI, acessado em dezembro 9, 2025, [https://www.mdpi.com/2227-7390/11/23/4757](https://www.mdpi.com/2227-7390/11/23/4757)
41. Improved Chebyshev Series Ephemeris Generation Capability of GTDS, acessado em dezembro 9, 2025, [https://ntrs.nasa.gov/api/citations/19810002564/downloads/19810002564.pdf](https://ntrs.nasa.gov/api/citations/19810002564/downloads/19810002564.pdf)
42. How is the Chebyshev method used by JPL? \- Space Exploration Stack Exchange, acessado em dezembro 9, 2025, [https://space.stackexchange.com/questions/30579/how-is-the-chebyshev-method-used-by-jpl](https://space.stackexchange.com/questions/30579/how-is-the-chebyshev-method-used-by-jpl)
43. NASA Open APIs, acessado em dezembro 9, 2025, [https://api.nasa.gov/](https://api.nasa.gov/)
44. Horizons Lookup API, acessado em dezembro 9, 2025, [https://ssd-api.jpl.nasa.gov/doc/horizons_lookup.html](https://ssd-api.jpl.nasa.gov/doc/horizons_lookup.html)
45. Horizon API \- jpl ssd/cneos api, acessado em dezembro 9, 2025, [https://ssd-api.jpl.nasa.gov/doc/horizons.html](https://ssd-api.jpl.nasa.gov/doc/horizons.html)
46. Three.js camera controls for space game \- javascript \- Stack Overflow, acessado em dezembro 9, 2025, [https://stackoverflow.com/questions/20287656/three-js-camera-controls-for-space-game](https://stackoverflow.com/questions/20287656/three-js-camera-controls-for-space-game)
47. Object3D.quaternion – three.js docs, acessado em dezembro 9, 2025, [https://threejs.org/docs/\#api/en/core/Object3D.quaternion](https://threejs.org/docs/#api/en/core/Object3D.quaternion)
48. Apply new camera world direction \- Questions \- three.js forum, acessado em dezembro 9, 2025, [https://discourse.threejs.org/t/apply-new-camera-world-direction/47286](https://discourse.threejs.org/t/apply-new-camera-world-direction/47286)
49. Mars 2020 Entry Descent Landing \- NASA's Eyes, acessado em dezembro 9, 2025, [https://eyes.nasa.gov/apps/mars2020/](https://eyes.nasa.gov/apps/mars2020/)
