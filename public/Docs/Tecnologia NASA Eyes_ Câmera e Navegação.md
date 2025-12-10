# **Análise Arquitetônica de Navegação Espacial e Renderização no "NASA Eyes on the Solar System"**

## **1\. Sumário Executivo e Contextualização Tecnológica**

A visualização digital da mecânica celeste exige uma convergência singular entre a astrodinâmica de alta precisão e a computação gráfica em tempo real. A aplicação "Eyes on the Solar System" (doravante referida como "Eyes") da NASA representa um marco definitivo neste domínio, transicionando de arquiteturas baseadas em plugins proprietários para um ecossistema WebGL totalmente acessível via navegador. Este relatório fornece uma análise técnica exaustiva da pilha de navegação, do pipeline de renderização e das estratégias de gerenciamento de dados da aplicação.

A análise indica que o desafio central da aplicação é o "Problema da Escala Cósmica"—a necessidade de renderizar objetos que variam de centímetros (instrumentos de espaçonaves) a bilhões de quilômetros (órbitas do sistema solar) dentro de uma única cena, sem sofrer com erros de precisão de ponto flutuante. A solução adotada pelo Jet Propulsion Laboratory (JPL) envolve uma interação complexa de **Buffers de Profundidade Logarítmica**, sistemas de coordenadas de **Origem Flutuante** (Floating Origin) e **Grafos de Cena** (Scene Graphs) hierárquicos. Além disso, o sistema de navegação não depende da física padrão de motores de jogos, mas sim da integração do kit de ferramentas **NAIF SPICE**, utilizando kernels para controlar posição e orientação com base em dados empíricos de efemérides em vez de animações heurísticas.

Este documento disseca esses componentes, focando especificamente nas tecnologias, algoritmos e implementações de câmera e navegação, detalhando como a aplicação gerencia referências espaciais, transições fluidas e inputs de usuário em um ambiente de escala astronômica. A análise aprofunda-se na transição do Unity para o Three.js, na matemática por trás da interpolação esférica (SLERP) de quatérnions para controle de câmera e na ponte tecnológica timecraftjs que permite o processamento de dados de missão em tempo real no cliente.

## **2\. O Motor de Renderização: Evolução, Arquitetura e Three.js**

A arquitetura de renderização do NASA Eyes evoluiu para enfrentar o desafio de distribuir visualizações científicas complexas para o público em geral sem barreiras de entrada. Historicamente, simulações espaciais de alta fidelidade exigiam clientes de desktop dedicados ou plugins pesados como o Unity Web Player. A iteração moderna do NASA Eyes, no entanto, fundamenta-se no **WebGL**, uma API JavaScript para renderização de gráficos 3D interativos dentro de qualquer navegador compatível, sem o uso de plugins.1

O framework subjacente que facilita essa abstração é o **Three.js**, uma biblioteca de alto nível que encapsula as complexidades do WebGL bruto (como a gestão manual de buffers e shaders), fornecendo ao mesmo tempo um sistema robusto de grafo de cena e materiais.2 A escolha do Three.js não é meramente uma conveniência de desenvolvimento; ela reflete uma decisão estratégica de suportar a renderização baseada em shaders (ShaderMaterial) necessária para os efeitos visuais complexos das atmosferas planetárias e campos estelares, mantendo a compatibilidade entre plataformas, desde desktops de alto desempenho até dispositivos móveis.4

### **2.1 O Ciclo de Renderização e Gerenciamento de Estado**

A arquitetura de renderização segue um padrão de loop de simulação contínuo, essencial para manter a fluidez da navegação e a precisão temporal. Diferente de páginas web estáticas, a aplicação emprega um loop requestAnimationFrame que atualiza o estado da cena na taxa de atualização do monitor (tipicamente 60Hz). Este ciclo é dividido em etapas críticas que garantem a sincronia entre a física orbital e a representação visual.

| Componente                       | Funcionalidade Técnica                                                                                                    | Frequência de Atualização          |
| :------------------------------- | :------------------------------------------------------------------------------------------------------------------------ | :--------------------------------- |
| **Relógio de Física/Efemérides** | Atualiza o tempo de simulação (conversão UTC para ET) e consulta os kernels SPICE para obter vetores de estado $(x,y,z)$. | Por Frame (ou sub-steps de física) |
| **Travessia do Grafo de Cena**   | Propaga matrizes de transformação (posição, rotação, escala) através da hierarquia pai-filho (updateMatrixWorld).         | Por Frame                          |
| **Controlador de Câmera**        | Atualiza a matriz de visualização da câmera com base nos inputs do usuário (mouse/toque) e interpolação de alvos.         | Por Frame                          |
| **Renderizador WebGL**           | Desenha a cena no contexto WebGL, gerenciando buffers de geometria e programas de shader.                                 | Por Frame                          |

O desacoplamento entre o "tempo de simulação" e o "tempo real" (wall-clock time) é uma característica arquitetural fundamental. Isso permite que o usuário avance ou retroceda no tempo—uma funcionalidade crítica para o planejamento de missões e análise histórica—sem afetar a taxa de quadros do loop de renderização visual.1 O sistema deve recalcular as posições de todos os corpos celestes a cada quadro com base no novo tempo de simulação, exigindo algoritmos de interpolação extremamente eficientes.

### **2.2 Estrutura do Grafo de Cena (Scene Graph)**

A organização espacial no Three.js e no NASA Eyes é gerenciada através de um **Grafo de Cena**. Esta estrutura de dados hierárquica é vital para a mecânica celeste. Em vez de posicionar cada objeto em coordenadas globais absolutas (o que levaria a problemas de precisão e complexidade de cálculo), os objetos são aninhados.

A hierarquia típica segue a estrutura gravitacional:

- **Raiz da Cena (Scene Root):** O contêiner base.
- **Baricentro do Sistema Solar:** O ponto de referência inercial primário.
- **Sol:** Filho do baricentro.
- **Planetas (ex: Terra):** Filhos do Sol (ou do baricentro, dependendo da implementação do kernel).
- **Luas/Satélites (ex: Lua, ISS):** Filhos do Planeta.
- **Instrumentos/Câmeras:** Filhos da Espaçonave.

Esta estrutura permite que a translação e rotação sejam herdadas. Se a Terra gira, a Lua e a ISS (sendo filhas na hierarquia) orbitam ou se movem junto com ela automaticamente devido à multiplicação das matrizes de transformação locais pela matriz do pai. Isso simplifica drasticamente o cálculo de posições relativas, essencial para a funcionalidade de "Lock" (travar a câmera) em um objeto específico.5

## **3\. Gerenciando a Escala Cósmica: Algoritmos de Precisão e Profundidade**

O obstáculo técnico definidor para a visualização do sistema solar é a limitação da aritmética de ponto flutuante de 32 bits (Precisão Simples), inerente aos pipelines padrão de GPU e à maioria das implementações WebGL. Um número de ponto flutuante padrão de 32 bits possui aproximadamente 7 dígitos decimais de precisão. Ao representar a distância do Sol a Plutão (\~5,9 bilhões de km) em metros, a perda de precisão nas bordas externas resulta em "jitter" (tremulação)—onde os vértices dos modelos 3D "saltam" para o ponto de grade representável mais próximo, causando a degradação da geometria e a vibração inaceitável das espaçonaves na tela.7

### **3.1 A Solução de Origem Flutuante Contínua (Continuous Floating Origin)**

Para mitigar a perda de precisão, o NASA Eyes e simuladores espaciais de alta fidelidade semelhantes (como o CosmoScout VR) implementam um sistema de coordenadas de **Origem Flutuante** (ou "Renderização Relativa à Câmera").9

Em um pipeline de renderização tradicional, a câmera se move através de um mundo estático. Em um sistema de Origem Flutuante, a lógica é invertida para a etapa de renderização:

1. **Coordenadas Globais (CPU):** Objetos e a câmera mantêm coordenadas de alta precisão (64 bits/Dupla Precisão) nos dados de simulação no lado da CPU.8 Isso é crucial porque o JavaScript moderno suporta Numbers como flutuantes de 64 bits (doubles), permitindo precisão suficiente para cálculos orbitais.
2. **Reset da Origem:** Quando a câmera se move para uma posição efetivamente "distante" da origem matemática $(0,0,0)$, ou simplesmente a cada quadro, o sistema de coordenadas do mundo é deslocado de modo que a câmera resida em $(0,0,0)$.
3. **Renderização Relativa:** A GPU recebe posições calculadas como a diferença entre a posição do objeto e a posição da câmera: PosiçãoObjeto \- PosiçãoCâmera.

Esta operação garante que a geometria mais próxima da câmera (o foco principal do usuário) retenha a maior precisão de ponto flutuante possível, eliminando efetivamente o _jitter_ local. A implementação dentro de um ambiente Three.js geralmente envolve a modificação da matriz do objeto ou do shader de vértice antes da chamada de desenho (draw call).7

Matematicamente, se $P\_{mundo}$ é a posição do objeto em coordenadas absolutas e $C\_{mundo}$ é a posição da câmera, a posição enviada para o vertex shader $V\_{local}$ é:

$$V\_{local} \= P\_{mundo} \- C\_{mundo}$$  
Ao realizar esta subtração na CPU usando variáveis de dupla precisão antes de passar o resultado para a GPU como floats de precisão simples, a aplicação mantém a estabilidade visual mesmo a bilhões de quilômetros do centro do sistema solar.11

### **3.2 Buffers de Profundidade Logarítmica (Logarithmic Depth Buffer)**

O segundo artefato visual decorrente da escala cósmica é o **Z-fighting** (luta de profundidade), onde objetos distantes (como uma lua transitando atrás de um planeta) piscam ou se sobrepõem incorretamente porque o buffer de profundidade (Z-buffer) carece de precisão para determinar qual pixel está na frente. Buffers de profundidade lineares padrão concentram a precisão muito perto da câmera, deixando vastos espaços distantes com resolução de profundidade mínima.13

O NASA Eyes emprega um **Buffer de Profundidade Logarítmico** para resolver isso. Em vez de mapear linearmente a distância da câmera (Near Plane) ao horizonte (Far Plane), o valor de profundidade $z$ é calculado logaritmicamente no shader.13 Isso redistribui a precisão do buffer, alocando mais bits para distinguir objetos distantes.

A implementação típica em GLSL no fragment shader segue esta estrutura:

$$gl\\\_FragDepth \= \\frac{\\log\_2(C \\cdot z \+ 1)}{\\log\_2(C \\cdot z\_{far} \+ 1)}$$  
Onde $C$ é uma constante que determina a distribuição da resolução e $z$ é a profundidade do fragmento. Esta técnica permite que a aplicação renderize o cockpit de uma espaçonave a centímetros da câmera e uma estrela a anos-luz de distância na mesma cena sem artefatos visuais de sobreposição.15 No Three.js, isso é ativado através da propriedade logarithmicDepthBuffer: true na configuração do WebGLRenderer, embora venha com um custo de desempenho devido à desativação de testes precoces de fragmentos (Early-Z rejection) em alguns hardwares.13

## **4\. O Sistema de Navegação: Implementação de Câmera e Inputs**

A experiência do usuário no "Eyes" depende de um sistema de câmera fluido e intuitivo que pareça "cinematográfico" em vez de puramente mecânico. A aplicação gerencia referências espaciais usando uma pilha de controladores sofisticada que lida com inputs, inércia (amortecimento) e mecânica orbital.

### **4.1 OrbitControls e Dinâmica de Amortecimento**

O modo primário de interação é orbitar um corpo celeste alvo. A implementação espelha os OrbitControls padrão encontrados no Three.js, mas é fortemente ajustada para simular "peso" e fluidez. Câmeras de jogos padrão param instantaneamente quando o input cessa. O NASA Eyes utiliza **amortecimento** (damping) ou inércia para simular a sensação de mover uma câmera física no vácuo.17

O algoritmo de amortecimento aplica um fator de decaimento à velocidade da rotação esférica da câmera. Após o input do usuário (arrastar o mouse ou deslizar o dedo):

1. Um vetor de velocidade rotacional é adicionado à câmera.
2. Em cada quadro do loop de renderização, a posição da câmera é atualizada por essa velocidade.
3. A velocidade é multiplicada por um fator de amortecimento (por exemplo, $0.95$) a cada ciclo.18
4. Quando a velocidade cai abaixo de um limiar mínimo (EPSILON), o cálculo cessa para economizar recursos.

Isso cria o efeito de "deslize" suave observado ao girar um planeta. A classe OrbitControls mantém o vetor "Up" da câmera (geralmente $+Y$ ou ortogonal à órbita), garantindo que o polo norte do planeta permaneça orientado corretamente, a menos que o usuário explicitamente rotacione a câmera (roll).17

#### **4.1.1 Mapeamento de Inputs**

O gerenciamento de inputs é mapeado para ações específicas de navegação orbital:

- **Botão Esquerdo / Um Dedo:** Rotaciona a câmera em torno do alvo (Orbit). O movimento do mouse no eixo X altera o azimute ($\\theta$), e no eixo Y altera a elevação ($\\phi$).
- **Botão do Meio / Scroll / Pinça (Pinch):** Aproximação ou afastamento (Dolly/Zoom). O algoritmo de zoom não apenas move a câmera, mas ajusta a velocidade de movimento proporcionalmente à distância do alvo, permitindo controle fino próximo à superfície e movimento rápido no espaço profundo.19
- **Botão Direito / Dois Dedos:** Translação (Pan). Move o ponto focal da câmera no plano da tela.

### **4.2 Interpolação Esférica Linear (SLERP) para Transições**

As transições entre alvos—como clicar em "Saturno" enquanto se observa a "Terra"—exigem um trajeto complexo. Uma simples Interpolação Linear (LERP) das coordenadas $(x, y, z)$ resultaria em uma linha reta, que poderia passar _através_ do Sol ou de outros planetas, além de causar distorções visuais de escala e velocidade não natural. Além disso, interpolar linearmente matrizes de rotação frequentemente resulta em "gimbal lock".20

O NASA Eyes utiliza **Quatérnions** para orientação rotacional e **SLERP** (Spherical Linear Interpolation) para transições. Um Quatérnion é um sistema numérico complexo quadridimensional ($w, x, y, z$) que evita as singularidades dos ângulos de Euler.22

O algoritmo de transição funciona da seguinte maneira:

1. **Estado Inicial:** Posição da câmera $P\_A$ e Quatérnion de Orientação $Q\_A$.
2. **Estado Alvo:** Posição alvo $P\_B$ (calculada com base em um offset desejado do novo planeta, geralmente na linha Sol-Planeta para garantir iluminação) e Quatérnion de Orientação $Q\_B$.
3. **Interpolação:** Durante a duração $t$ (de 0 a 1), a nova orientação $Q\_t$ é calculada via SLERP:

$$Q\_t \= \\frac{\\sin((1-t)\\Omega)}{\\sin(\\Omega)}Q\_A \+ \\frac{\\sin(t\\Omega)}{\\sin(\\Omega)}Q\_B$$  
Onde $\\Omega$ é o ângulo subtendido pelo arco entre as duas orientações. Isso garante que a câmera rotacione suavemente ao longo do arco mais curto na hiperesfera 4D, resultando em uma transição com velocidade angular constante que parece polida e profissional.23 Para a posição, curvas de Bezier cúbicas são frequentemente usadas para criar um arco espacial "seguro" que evita colisões visuais.25

### **4.3 Paternidade Dinâmica (Dynamic Parenting)**

Uma característica crítica da navegação é a capacidade de "travar" (lock) em um objeto em movimento. No sistema solar, tudo está em movimento constante. Se a câmera permanecesse em uma coordenada de espaço mundial estática, uma espaçonave viajando a 20.000 km/h desapareceria da vista instantaneamente.

O Eyes implementa a **Paternidade Dinâmica** (Dynamic Parenting ou Scene Graph Reparenting). Quando um usuário seleciona um alvo (ex: "Curiosity Rover"):

1. O objeto da câmera é desanexado (detach) de seu pai atual (ex: "Baricentro do Sistema Solar" ou "Terra").
2. A câmera é reanexada (attach ou add) como um nó filho do objeto alvo no grafo de cena.1
3. A posição local da câmera é redefinida para um offset fixo em relação ao novo pai.

Isso permite que a câmera herde a velocidade e a trajetória do alvo implicitamente através da hierarquia do grafo de cena, eliminando a necessidade de atualizar manualmente a posição da câmera para coincidir com o alvo a cada quadro.26 As matrizes de transformação do grafo de cena lidam com a acumulação de velocidades orbitais. Matematicamente, a nova matriz de mundo da câmera $M\_{cam\\\_world}$ é preservada calculando a nova matriz local $M\_{local}$ relativa ao novo pai $M\_{novo\\\_pai}$:

$$M\_{local} \= (M\_{novo\\\_pai})^{-1} \\times M\_{cam\\\_world}$$  
Essa operação garante que não haja "pulo" visual no momento da troca de pai.28

## **5\. A Espinha Dorsal de Dados: Integração SPICE e Efemérides**

A fidelidade visual do NASA Eyes é sustentada pela precisão de seus dados. Ao contrário de jogos que usam órbitas procedurais ou aproximações keplerianas simples (elipses fixas), o Eyes usa o sistema de informações de geometria de observação **SPICE**, desenvolvido pelo Navigation and Ancillary Information Facility (NAIF) da NASA. Este sistema é o padrão ouro para dados de navegação em missões reais.

### **5.1 Kernels SPICE e Estrutura de Dados**

A aplicação ingere "Kernels", que são arquivos binários ou de texto contendo dados de navegação.29

- **SPK (Spacecraft Planet Kernel):** Contém efemérides (dados de posição e velocidade) para planetas, satélites, cometas e espaçonaves. Estes arquivos utilizam polinômios de Chebyshev duplos para aproximar a função de posição ao longo do tempo, permitindo o armazenamento compacto de mecânicas orbitais complexas que incluem perturbações gravitacionais de múltiplos corpos.32
- **PCK (Planetary Constants Kernel):** Define modelos de orientação e forma (ex: raios dos planetas, achatamento).
- **FK (Frames Kernel):** Define quadros de referência (ex: J2000, quadros fixos ao corpo da espaçonave).
- **CK (C-matrix Kernel):** Define a orientação (apontamento) da espaçonave ao longo do tempo. Essencial para mostrar para onde os instrumentos estão olhando.
- **LSK (Leapseconds Kernel):** Gerencia as conversões de tempo entre UTC e Tempo de Efeméride (ET), lidando com segundos bissextos.

### **5.2 Implementação JavaScript: timecraftjs e a Ponte WASM**

Tradicionalmente, o SPICE é acessado via toolkits em C ou Fortran. Para trazer essa capacidade para o navegador, o JPL e o AMMOS (Advanced Multi-Mission Operations System) desenvolveram o **timecraftjs**, uma biblioteca que encapsula uma versão compilada do toolkit C-SPICE, muito provavelmente usando Emscripten para compilar o código C para **WebAssembly (WASM)** ou asm.js.34

O fluxo de trabalho para determinar a posição de um planeta no navegador é o seguinte:

1. **Conversão de Tempo:** A aplicação converte o tempo atual do relógio (UTC) para **Tempo de Efeméride (ET)**, que é o número de segundos contínuos passados desde a época J2000 (Tempo Dinâmico Baricêntrico \- TDB).34
2. **Consulta ao Kernel:** Funções como spkezr ou spkpos são chamadas dentro do ambiente JS (via WASM). Essas funções consultam os kernels SPK carregados para obter a posição de um corpo alvo (ex: Marte) em relação a um observador (ex: Sol) no tempo ET.35
3. **Interpolação Polinomial:** O toolkit realiza a interpolação dos polinômios de Chebyshev contidos nos kernels para fornecer precisão de posição sub-métrica para a localização da espaçonave naquele exato instante de tempo.32
4. **Atualização da Cena:** As coordenadas $(x, y, z)$ resultantes são aplicadas ao atributo de posição do objeto Three.js correspondente.

Este sistema garante que, quando o usuário visualiza o pouso do "Mars 2020", a relação geométrica entre a Terra, Marte e a espaçonave corresponda exatamente aos dados de telemetria usados pelo controle da missão.37

## **6\. Renderizando o Cosmos: Estrelas e Ambiente**

A renderização do fundo espacial apresenta desafios únicos. Não se trata apenas de uma imagem estática (skybox), mas de uma representação cientificamente precisa da esfera celeste, permitindo que as constelações sejam reconhecíveis de qualquer ponto do sistema solar.

### **6.1 Catálogos Estelares e Estruturas de Dados**

O Eyes utiliza extensos catálogos estelares como o **Hipparcos** e o **Tycho-2**.38 Esses catálogos contêm dados de milhões de estrelas, tornando impossível renderizar cada uma como uma malha geométrica (esfera) individual. Em vez disso, os dados são processados (frequentemente usando scripts de conversão em Python ou C++) em formatos JSON ou binários otimizados contendo Ascensão Reta (RA), Declinação (Dec), magnitude aparente e índice de cor B-V.40

As coordenadas celestes brutas (RA/Dec) são convertidas para coordenadas Cartesianas $(x, y, z)$ em uma esfera unitária usando trigonometria esférica:

$$x \= d \\cdot \\cos(\\delta) \\cdot \\cos(\\alpha) \\\\ y \= d \\cdot \\cos(\\delta) \\cdot \\sin(\\alpha) \\\\ z \= d \\cdot \\sin(\\delta)$$  
Onde $\\alpha$ é a Ascensão Reta e $\\delta$ é a Declinação.42

### **6.2 Renderização de Pontos Baseada em Shader**

Para renderizar milhões de estrelas eficientemente, a aplicação emprega **Nuvens de Pontos** (via THREE.Points e THREE.BufferGeometry) combinadas com **ShaderMaterials** personalizados.43

Vertex Shader e Atenuação de Tamanho:  
O vertex shader gerencia a atenuação do tamanho das estrelas com base na sua magnitude e distância. Ele calcula o gl_PointSize de modo que estrelas mais brilhantes (menor magnitude) apareçam maiores e todas as estrelas diminuam visualmente conforme o campo de visão (FOV) da câmera aumenta, proporcionando uma sensação de profundidade e escala realista.45 O cálculo típico de atenuação é:

OpenGL Shading Language

// Snippet de Vertex Shader GLSL  
uniform float size;  
uniform float scale; // Fator de escala baseado na altura do viewport  
void main() {  
 vec4 mvPosition \= modelViewMatrix \* vec4( position, 1.0 );  
 // Atenuação de tamanho padrão do OpenGL  
 gl_PointSize \= size \* ( scale / \-mvPosition.z );  
 gl_Position \= projectionMatrix \* mvPosition;  
}

Fragment Shader e Temperatura de Cor (B-V):  
A cor de cada estrela não é arbitrária; ela é derivada de seu Índice B-V (uma medida astronômica de temperatura de cor baseada na diferença de magnitude através de filtros azuis e visíveis). Uma função GLSL personalizada mapeia esse índice para um valor RGB, simulando a curva de radiação de Corpo Negro (Black Body). Isso resulta em cores fisicamente precisas—azul para estrelas quentes, vermelho para estrelas frias—computadas diretamente na GPU por pixel.46

### **6.3 Texturas Procedurais e Ruído**

Para objetos mais próximos sem imagens de superfície detalhadas, como o Sol ou atmosferas de gigantes gasosos dinâmicos, são utilizados shaders procedurais. Algoritmos envolvendo ruído de Perlin ou ruído Simplex simulam a granulação da superfície solar ou os redemoinhos de nuvens, animados ao longo de variáveis de tempo passadas como _uniforms_ para o shader.48

## **7\. Gerenciamento de Ativos e Otimização de Rede**

Para funcionar suavemente em um navegador, o NASA Eyes deve gerenciar ativos (modelos 3D, texturas, arquivos de dados) de forma extremamente eficiente, minimizando o tempo de carregamento e o uso de memória.

### **7.1 Pipeline de Ativos Assíncrono**

Para manter a responsividade da interface, ativos como texturas, modelos e kernels são carregados de forma assíncrona. A aplicação utiliza o padrão Promise.all e gerenciadores de carregamento (THREE.LoadingManager) para garantir que os kernels essenciais (como o SPK do planeta alvo) sejam carregados e processados antes que o loop de renderização tente consultar posições, evitando erros de execução.34

### **7.2 Formatos de Geometria e Instanciamento**

Os modelos das espaçonaves são otimizados para transmissão web. Enquanto versões antigas podiam usar formatos proprietários, implementações modernas favorecem o **glTF (GL Transmission Format)**, frequentemente chamado de "JPEG do 3D". O glTF suporta fluxos binários (arquivos.glb) e geometria comprimida (Draco compression), que requerem parsing mínimo pelo navegador.50

Para o cinturão de asteroides, que contém centenas de milhares de rochas individuais, o motor usa **Renderização Instanciada** (THREE.InstancedMesh). Esta técnica permite que a GPU desenhe a mesma geometria (uma rocha de asteroide genérica) milhares de vezes em uma única chamada de desenho (draw call), com apenas as matrizes de transformação (posição, rotação, escala) variando por instância. Isso reduz drasticamente a sobrecarga da CPU e permite a visualização densa de campos de asteroides.44

### **7.3 Nível de Detalhe (LOD)**

Para corpos planetários, a aplicação utiliza técnicas de **LOD (Level of Detail)**. Quando a câmera está distante, uma esfera de baixa resolução com uma textura simples é renderizada. À medida que a câmera se aproxima, a malha é subdividida ou substituída por versões de maior resolução, e texturas de alta definição (frequentemente transmitidas via protocolos como WMTS ou tilesets hierárquicos) são trocadas. Isso gerencia o uso de memória da GPU, o que é crítico para o desempenho baseado em navegador, especialmente em dispositivos móveis.8

## **8\. Conclusão**

O "NASA Eyes on the Solar System" é um exemplo paradigmático de engenharia de software aplicada à divulgação científica. Seu sucesso depende da integração perfeita do **SPICE toolkit** para a astrodinâmica de backend com a biblioteca **Three.js** para a visualização de frontend.

As conquistas técnicas críticas que permitem essa experiência incluem:

1. **Solução de Escala:** A implementação de **Origem Flutuante** e **Buffers de Profundidade Logarítmica** elimina artefatos visuais inerentes à renderização de distâncias astronômicas em hardware padrão.
2. **Navegação Robusta:** O uso de **Quatérnions** e **SLERP** para interpolação de câmera, juntamente com controles orbitais amortecidos e paternidade dinâmica, proporciona uma navegação fluida e livre de erros matemáticos como o gimbal lock.
3. **Precisão de Dados:** A ponte **timecraftjs** permite que algoritmos de interpolação de alta precisão (Chebyshev) sejam executados no cliente, garantindo que a posição de cada pixel corresponda à realidade física da missão.

Ao desacoplar o tempo de simulação do tempo de renderização e utilizar grafos de cena hierárquicos, a aplicação oferece uma experiência de usuário que é tanto fisicamente precisa quanto visualmente imersiva, servindo como referência primária de como as tecnologias web modernas podem lidar com visualização científica em escala cósmica.

### ---

**Tabela 1: Matriz de Tecnologias Chave e Algoritmos no NASA Eyes**

| Domínio Tecnológico      | Tecnologia/Algoritmo Específico      | Função Crítica no NASA Eyes                                           |
| :----------------------- | :----------------------------------- | :-------------------------------------------------------------------- |
| **Renderização**         | WebGL / Three.js                     | Aceleração gráfica 3D no navegador sem plugins.                       |
| **Precisão Numérica**    | Continuous Floating Origin           | Previne "jitter" (tremulação) da geometria longe da origem $(0,0,0)$. |
| **Profundidade**         | Logarithmic Depth Buffer             | Resolve "Z-fighting" entre planetas e luas distantes.                 |
| **Dados Astrodinâmicos** | SPICE / timecraftjs (WASM)           | Computa efemérides precisas usando polinômios de Chebyshev.           |
| **Transição de Câmera**  | Quaternion SLERP                     | Interpolação esférica suave entre orientações de câmera.              |
| **Inputs do Usuário**    | Damped OrbitControls                 | Simula inércia física para interação suave com mouse/toque.           |
| **Renderização Estelar** | GLSL Point Sprites / B-V Mapping     | Renderiza milhões de estrelas com cores termicamente precisas.        |
| **Hierarquia Espacial**  | Grafo de Cena / Paternidade Dinâmica | Gerencia o movimento relativo (órbitas) e referência da câmera.       |

#### **Referências citadas**

1. NASA's Eyes, acessado em dezembro 9, 2025, [https://science.nasa.gov/eyes/](https://science.nasa.gov/eyes/)
2. sanderblue/solar-system-threejs: The Solar System modeled to scale with Three.js \- GitHub, acessado em dezembro 9, 2025, [https://github.com/sanderblue/solar-system-threejs](https://github.com/sanderblue/solar-system-threejs)
3. Coding a 3D Solar System with JavaScript \+ Three.js \- YouTube, acessado em dezembro 9, 2025, [https://www.youtube.com/watch?v=KOSMzSyiEiA](https://www.youtube.com/watch?v=KOSMzSyiEiA)
4. I built a fully interactive 3D Solar System using ThreeJS \- With Copilot \- Reddit, acessado em dezembro 9, 2025, [https://www.reddit.com/r/threejs/comments/1msjm2j/i_built_a_fully_interactive_3d_solar_system_using/](https://www.reddit.com/r/threejs/comments/1msjm2j/i_built_a_fully_interactive_3d_solar_system_using/)
5. NASA Open Source Software, acessado em dezembro 9, 2025, [https://code.nasa.gov/](https://code.nasa.gov/)
6. Dspace: Real-time 3D Visualization System for Spacecraft Dynamics Simulation \- JPL Robotics \- NASA, acessado em dezembro 9, 2025, [https://www-robotics.jpl.nasa.gov/media/documents/2009-smcit-dspace_2.pdf](https://www-robotics.jpl.nasa.gov/media/documents/2009-smcit-dspace_2.pdf)
7. Floating Origin (Huge Scenes Support) \- Babylon.js Documentation, acessado em dezembro 9, 2025, [https://doc.babylonjs.com/features/featuresDeepDive/scene/floating_origin/](https://doc.babylonjs.com/features/featuresDeepDive/scene/floating_origin/)
8. CosmoScout VR: A Modular 3D Solar System Based on SPICE, acessado em dezembro 9, 2025, [https://elib.dlr.de/189930/1/cosmoscout_vr.pdf](https://elib.dlr.de/189930/1/cosmoscout_vr.pdf)
9. Using a Floating Origin to Improve Fidelity and Performance of Large, Distributed Virtual Worlds \- ResearchGate, acessado em dezembro 9, 2025, [https://www.researchgate.net/publication/331628217_Using_a_Floating_Origin_to_Improve_Fidelity_and_Performance_of_Large_Distributed_Virtual_Worlds](https://www.researchgate.net/publication/331628217_Using_a_Floating_Origin_to_Improve_Fidelity_and_Performance_of_Large_Distributed_Virtual_Worlds)
10. Floating Origin Template for BJS 5.x \- Demos and projects \- Babylon.js Forum, acessado em dezembro 9, 2025, [https://forum.babylonjs.com/t/floating-origin-template-for-bjs-5-x/29833](https://forum.babylonjs.com/t/floating-origin-template-for-bjs-5-x/29833)
11. Build a 3D Float Effect using Three.js, Framer Motion, Next.js \- YouTube, acessado em dezembro 9, 2025, [https://www.youtube.com/watch?v=BgHv1G3oFDg](https://www.youtube.com/watch?v=BgHv1G3oFDg)
12. BoundingSpheres for floating point origin meshes \- Questions \- three.js forum, acessado em dezembro 9, 2025, [https://discourse.threejs.org/t/boundingspheres-for-floating-point-origin-meshes/59531](https://discourse.threejs.org/t/boundingspheres-for-floating-point-origin-meshes/59531)
13. WebGLRenderer.logarithmicDepthBuffer – three.js docs, acessado em dezembro 9, 2025, [https://threejs.org/docs/\#api/en/renderers/WebGLRenderer.logarithmicDepthBuffer](https://threejs.org/docs/#api/en/renderers/WebGLRenderer.logarithmicDepthBuffer)
14. Logarithmic Depth value \- Questions \- three.js forum, acessado em dezembro 9, 2025, [https://discourse.threejs.org/t/logarithmic-depth-value/11003](https://discourse.threejs.org/t/logarithmic-depth-value/11003)
15. Logarithmic Depth Buffers and Problems of Scale (3D World Generation \#9) \- YouTube, acessado em dezembro 9, 2025, [https://www.youtube.com/watch?v=8bRS9RRWfSs](https://www.youtube.com/watch?v=8bRS9RRWfSs)
16. Practical Analysis on the Z-fighting and the Logarithmic Depth Tests for Computer Graphics, acessado em dezembro 9, 2025, [https://medium.com/@e92rodbearings/practical-analysis-on-the-z-fighting-and-the-logarithmic-depth-tests-for-computer-graphics-43509504e065](https://medium.com/@e92rodbearings/practical-analysis-on-the-z-fighting-and-the-logarithmic-depth-tests-for-computer-graphics-43509504e065)
17. OrbitControls – three.js docs, acessado em dezembro 9, 2025, [https://threejs.org/docs/pages/OrbitControls.html](https://threejs.org/docs/pages/OrbitControls.html)
18. OrbitControls: Speed and sensitivity is too high · Issue \#9577 · mrdoob/three.js \- GitHub, acessado em dezembro 9, 2025, [https://github.com/mrdoob/three.js/issues/9577](https://github.com/mrdoob/three.js/issues/9577)
19. Building a Real-Time Black Hole Simulation: Physics, WebGL, TypeScript and React, acessado em dezembro 9, 2025, [https://medium.com/@christianmatabaro92/building-a-real-time-black-hole-simulation-physics-webgl-typescript-and-react-b8675322cde2](https://medium.com/@christianmatabaro92/building-a-real-time-black-hole-simulation-physics-webgl-typescript-and-react-b8675322cde2)
20. How move camera position rotation to target \- Needle Engine, acessado em dezembro 9, 2025, [https://forum.needle.tools/t/how-move-camera-position-rotation-to-target/2213](https://forum.needle.tools/t/how-move-camera-position-rotation-to-target/2213)
21. threejs: smoothly rotate camera towards an object \- Stack Overflow, acessado em dezembro 9, 2025, [https://stackoverflow.com/questions/32723678/threejs-smoothly-rotate-camera-towards-an-object](https://stackoverflow.com/questions/32723678/threejs-smoothly-rotate-camera-towards-an-object)
22. Scripting API: Quaternion.Slerp \- Unity \- Manual, acessado em dezembro 9, 2025, [https://docs.unity3d.com/ScriptReference/Quaternion.Slerp.html](https://docs.unity3d.com/ScriptReference/Quaternion.Slerp.html)
23. Quaternion.slerp – three.js docs, acessado em dezembro 9, 2025, [https://threejs.org/docs/\#api/en/math/Quaternion.slerp](https://threejs.org/docs/#api/en/math/Quaternion.slerp)
24. Animating perspective camera to mimic orbit controls \- Questions \- three.js forum, acessado em dezembro 9, 2025, [https://discourse.threejs.org/t/animating-perspective-camera-to-mimic-orbit-controls/18644](https://discourse.threejs.org/t/animating-perspective-camera-to-mimic-orbit-controls/18644)
25. Discovering Gale Crater: How we did it \- Los Angeles Times, acessado em dezembro 9, 2025, [https://graphics.latimes.com/mars-gale-crater-how-we-did-it/](https://graphics.latimes.com/mars-gale-crater-how-we-did-it/)
26. three.js \- Change parent of component and keep position \- Stack Overflow, acessado em dezembro 9, 2025, [https://stackoverflow.com/questions/52318200/change-parent-of-component-and-keep-position](https://stackoverflow.com/questions/52318200/change-parent-of-component-and-keep-position)
27. Keep objects world position after childing to a parent object \- Questions \- three.js forum, acessado em dezembro 9, 2025, [https://discourse.threejs.org/t/keep-objects-world-position-after-childing-to-a-parent-object/31007](https://discourse.threejs.org/t/keep-objects-world-position-after-childing-to-a-parent-object/31007)
28. 3d \- Three.js: Proper way to add and remove child objects using THREE.SceneUtils.attach/detach functions \- Stack Overflow, acessado em dezembro 9, 2025, [https://stackoverflow.com/questions/23385623/three-js-proper-way-to-add-and-remove-child-objects-using-three-sceneutils-atta](https://stackoverflow.com/questions/23385623/three-js-proper-way-to-add-and-remove-child-objects-using-three-sceneutils-atta)
29. cspice · GitHub Topics, acessado em dezembro 9, 2025, [https://github.com/topics/cspice](https://github.com/topics/cspice)
30. SPICE Tutorials All | PDF | Nasa | Data \- Scribd, acessado em dezembro 9, 2025, [https://www.scribd.com/document/662335631/SPICE-Tutorials-All](https://www.scribd.com/document/662335631/SPICE-Tutorials-All)
31. SPICE Tutorials \- NASA, acessado em dezembro 9, 2025, [https://naif.jpl.nasa.gov/naif/tutorials.html](https://naif.jpl.nasa.gov/naif/tutorials.html)
32. How is the Chebyshev method used by JPL? \- Space Exploration Stack Exchange, acessado em dezembro 9, 2025, [https://space.stackexchange.com/questions/30579/how-is-the-chebyshev-method-used-by-jpl](https://space.stackexchange.com/questions/30579/how-is-the-chebyshev-method-used-by-jpl)
33. JPL Planetary and Lunar Ephemerides, acessado em dezembro 9, 2025, [https://ssd.jpl.nasa.gov/planets/eph_export.html](https://ssd.jpl.nasa.gov/planets/eph_export.html)
34. NASA-AMMOS/timecraftjs: Time conversion using NAIF CSPICE Toolkit in JavaScript via Emscripten. \- GitHub, acessado em dezembro 9, 2025, [https://github.com/NASA-AMMOS/timecraftjs](https://github.com/NASA-AMMOS/timecraftjs)
35. How to convert a SPICE SPK kernel into human-readable data using SPICE toolkit and utilities \- Space Exploration Stack Exchange, acessado em dezembro 9, 2025, [https://space.stackexchange.com/questions/48105/how-to-convert-a-spice-spk-kernel-into-human-readable-data-using-spice-toolkit-a](https://space.stackexchange.com/questions/48105/how-to-convert-a-spice-spk-kernel-into-human-readable-data-using-spice-toolkit-a)
36. How to retrieve MSL EDL trajectory using Javascript and webgeocalc API?, acessado em dezembro 9, 2025, [https://space.stackexchange.com/questions/49665/how-to-retrieve-msl-edl-trajectory-using-javascript-and-webgeocalc-api](https://space.stackexchange.com/questions/49665/how-to-retrieve-msl-edl-trajectory-using-javascript-and-webgeocalc-api)
37. NASA's Self-Driving Perseverance Mars Rover 'Takes the Wheel', acessado em dezembro 9, 2025, [https://www.jpl.nasa.gov/news/nasas-self-driving-perseverance-mars-rover-takes-the-wheel/](https://www.jpl.nasa.gov/news/nasas-self-driving-perseverance-mars-rover-takes-the-wheel/)
38. Development of a real-time solution for an interactive VR representation of large star catalogues \- Webthesis, acessado em dezembro 9, 2025, [https://webthesis.biblio.polito.it/18136/1/tesi.pdf](https://webthesis.biblio.polito.it/18136/1/tesi.pdf)
39. Visualization in Astrophysics \- Scientific Computing and Imaging Institute \- The University of Utah, acessado em dezembro 9, 2025, [https://www.sci.utah.edu/\~beiwang/publications/STAR_Astro_BeiWang_2021.pdf](https://www.sci.utah.edu/~beiwang/publications/STAR_Astro_BeiWang_2021.pdf)
40. star-catalog \- Lib.rs, acessado em dezembro 9, 2025, [https://lib.rs/crates/star-catalog](https://lib.rs/crates/star-catalog)
41. Star Catalogs, acessado em dezembro 9, 2025, [https://astrogreg.com/starcatalog/starcatalogs.html](https://astrogreg.com/starcatalog/starcatalogs.html)
42. Converting Equatorial Celestial Coordinates to a Cartesian System \- James Watkins, acessado em dezembro 9, 2025, [https://www.jameswatkins.me/posts/converting-equatorial-to-cartesian.html](https://www.jameswatkins.me/posts/converting-equatorial-to-cartesian.html)
43. three.js \- how to generate stars efficiently \- Stack Overflow, acessado em dezembro 9, 2025, [https://stackoverflow.com/questions/54190036/three-js-how-to-generate-stars-efficiently](https://stackoverflow.com/questions/54190036/three-js-how-to-generate-stars-efficiently)
44. Building an Interactive 3D Rocket Easter Egg with React Three Fiber \- DEV Community, acessado em dezembro 9, 2025, [https://dev.to/zerodays/building-an-interactive-3d-rocket-easter-egg-with-react-three-fiber-4pc](https://dev.to/zerodays/building-an-interactive-3d-rocket-easter-egg-with-react-three-fiber-4pc)
45. Point sprite size attenuation with modern OpenGL \- Stack Overflow, acessado em dezembro 9, 2025, [https://stackoverflow.com/questions/26387730/point-sprite-size-attenuation-with-modern-opengl](https://stackoverflow.com/questions/26387730/point-sprite-size-attenuation-with-modern-opengl)
46. Star B-V color index to apparent RGB color \- Stack Overflow, acessado em dezembro 9, 2025, [https://stackoverflow.com/questions/21977786/star-b-v-color-index-to-apparent-rgb-color](https://stackoverflow.com/questions/21977786/star-b-v-color-index-to-apparent-rgb-color)
47. bpodgursky/uncharted: Visualization of our solar neighborhood using three.js \- GitHub, acessado em dezembro 9, 2025, [https://github.com/bpodgursky/uncharted](https://github.com/bpodgursky/uncharted)
48. Github \- Ben Podgursky, acessado em dezembro 9, 2025, [https://bpodgursky.com/category/github/](https://bpodgursky.com/category/github/)
49. Procedural star rendering with three.js and WebGL shaders \- Ben Podgursky, acessado em dezembro 9, 2025, [https://bpodgursky.com/2017/02/01/procedural-star-rendering-with-three-js-and-webgl-shaders/](https://bpodgursky.com/2017/02/01/procedural-star-rendering-with-three-js-and-webgl-shaders/)
50. Three.js: how to create smooth camera movement with Blender | by Yoann Guény \- Medium, acessado em dezembro 9, 2025, [https://medium.com/@yoanngueny/three-js-how-to-create-smooth-camera-movement-with-blender-e757b68754ae](https://medium.com/@yoanngueny/three-js-how-to-create-smooth-camera-movement-with-blender-e757b68754ae)
