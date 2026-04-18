# 🌌 **Atlas Orbital: Uma Jornada Científica pelo Sistema Solar**

## **Bem-vindo a uma visualização 3D de alta fidelidade do Sistema Solar direto no navegador**

Prepare-se para explorar o cosmos como nunca antes. **Atlas Orbital** não é apenas mais uma visualização bonita do espaço — é uma experiência educacional de alta fidelidade do nosso Sistema Solar, baseada em dados astronômicos documentados e referências de missões espaciais, renderizada com tecnologia web moderna.

---

## 🔬 **Precisão Científica Incomparável**

### **Mecânica Orbital Autêntica**

Cada planeta, lua e asteroide segue um modelo orbital analítico calibrado. O Atlas Orbital combina **teorias por família** — VSOP87D para os oito planetas, Pluto-Meeus (Capítulo 37) para Plutão, ELP/MPP02-trunc para a Lua, e propagação Kepleriana de elementos osculantes derivados de fixtures JPL Horizons para as demais luas e asteroides.

**O que isso significa?**

- Posições recalculadas em tempo real a partir da série analítica de cada corpo, não animações pré-programadas.
- Pipeline de regressão valida os 28 corpos principais contra JPL Horizons em 4 épocas, com tolerâncias por família (≤ 0,1°/0,2°/0,5°) registradas em `src/lib/orbital/regression.test.ts`.
- Elementos orbitais clássicos (a, e, i, Ω, ω, M, n) são tratados por cada provider conforme convenção da teoria que o origina.
- Ressonâncias orbitais reais aparecem como consequência da precisão das séries (ex.: a ressonância 1:2:4 entre Io, Europa e Ganimedes — as luas de Júpiter que "dançam" em sincronia).

### **70+ Objetos Celestes com Dados Reais**

Exploramos:

- **8 planetas** (de Mercúrio a Netuno)
- **O Sol** (com física emissiva realista)
- **27+ luas naturais** (incluindo a nossa Lua, as 4 luas galileanas de Júpiter, as fascinantes luas de Saturno como Titã e Encélado, e até as misteriosas luas de Urano)
- **Planetas anões** (Plutão, Ceres, Éris, Makemake, Haumea)
- **Asteroides** (Vesta, Pallas, Hygiea com modelos 3D de alta definição)

Cada corpo celeste inclui:

- **Propriedades físicas verificadas**: massa real (ex: Sol = 1,989 × 10³⁰ kg), gravidade na superfície, composição química
- **Atmosferas detalhadas**: composição com percentuais precisos (Terra: 78% N₂, 21% O₂; Júpiter: H₂/He)
- **Temperaturas**, períodos de rotação, e até o ângulo de inclinação axial (como os extremos 97,77° de Urano)
- **Curiosidades científicas** verificadas: desde o recorde de ventos mais rápidos (Netuno) até o maior vulcão do Sistema Solar (Olympus Mons em Marte)
- **Marcos de exploração espacial**: com missões específicas e datas (Parker Solar Probe 2018, Perseverance 2021, New Horizons 2015)

---

## 🎨 **Excelência Visual de Tirar o Fôlego**

### **Texturas em Ultra Alta Resolução (8K)**

Usamos as **melhores imagens disponíveis da NASA** — as mesmas que cientistas e agências espaciais utilizam:

- Texturas 8K (8192×4096 pixels) para **Sol, Mercúrio, Vênus, Terra, Lua, Marte, Júpiter, Saturno, Urano, Plutão** e para o fundo estelar da Via Láctea.
- Mapas 4K/2K para corpos menores (luas de Marte, luas galileanas, luas principais de Saturno, Netuno, asteroides) — tier escolhido conforme salência em tela e perfil de qualidade do dispositivo.
- Mapas especiais: **Terra de noite** mostrando luzes das cidades, **camadas de nuvens**, **transparência dos anéis de Saturno**, além de normal/roughness maps PBR para a Terra.

### **Campo Estelar Realista: Catálogo HYG v4.2 em Tiers Adaptativos**

Enquanto outros simuladores usam texturas 2D de fundo com estrelas falsas, o **Atlas Orbital renderiza estrelas reais do catálogo HYG** — até ~109.400 delas no tier `ultra`, com posições, cores e brilhos astronômicos autênticos. O runtime seleciona automaticamente um tier compatível com o hardware e a banda (subsets menores para dispositivos com pouca memória ou rede lenta).

**Dados do Catálogo HYG v4.2** (HYpparcos + Yale + Gliese)

- Baseado em **medições de paralaxe reais** (até magnitude 12.0)
- Combina dados dos catálogos astronômicos mais respeitados:
  - **Hipparcos**: catálogo da ESA com 118.000+ estrelas medidas por satélite
  - **Yale Bright Star Catalog**: estrelas visíveis a olho nu
  - **Gliese Catalog**: estrelas próximas ao Sistema Solar

**Cada Estrela Inclui Dados Científicos Reais:**

- **Ascensão Reta (RA) e Declinação (Dec)**: coordenadas celestes precisas em graus
- **Paralaxe**: medida da distância em miliarcosegundos (convertida para parsecs)
- **Magnitude Visual**: brilho aparente exato de cada estrela (-1.46 para Sírio até magnitude 12)
- **Índice de Cor (B-V)**: determina a cor espectral baseada em radiação de corpo negro

**Conversão de Coordenadas Astronômicas para 3D**

O sistema implementa a transformação matemática completa:

```
Distância (parsecs) = 1000 / paralaxe (mas)
X = distância × cos(Dec) × cos(RA)
Y = distância × cos(Dec) × sin(RA)
Z = distância × sin(Dec)
```

- Mapeamento correto entre **coordenadas equatoriais** (sistema astronômico) e **coordenadas cartesianas 3D** (Three.js)
- Rotação de **23,4°** (obliquidade da eclíptica) para alinhar o céu estelar com o plano orbital do Sistema Solar
- 1 parsec = 206.265 AU na escala de visualização (1 AU = 1.000 unidades)

**Renderização Física das Estrelas**

Sistema de shaders customizado com 3 técnicas científicas:

**1. Cores Estelares Realistas (Radiação de Corpo Negro)**

- Converte o **Índice de Cor B-V** em RGB usando aproximação de blackbody
- **B-V = -0.4** (estrelas azuis quentes como Rigel) → RGB com máximo de azul
- **B-V = 0.65** (estrelas tipo Sol amarelas) → RGB equilibrado
- **B-V = 2.0** (estrelas vermelhas frias como Betelgeuse) → RGB com máximo de vermelho
- Preserva a aparência científica: estrelas O/B são azuis, K/M são laranjas/vermelhas

**2. Tamanho Baseado em Magnitude (Razão de Pogson)**

- Fórmula exponencial: `size = 0.5 + normalized^4.0 × 12.0`
- **Magnitude -1.46** (Sírio, a mais brilhante) → ponto grande e brilhante
- **Magnitude 6** (limite do olho humano) → ponto médio
- **Magnitude 12** (limite do catálogo) → ponto minúsculo
- Simula o efeito de "glare" de estrelas brilhantes sem exagero

**3. LOD Dinâmico (Level of Detail)**

- Quando a câmera está afastada (vista do Sistema Solar completo), apenas estrelas brilhantes (mag < 2) são visíveis
- Quando a câmera está próxima, estrelas mais fracas aparecem gradualmente
- Fórmula logarítmica: `maxMag = 6.0 + log(zoom) × 1.0`
- **Otimização de performance**: não renderiza estrelas invisíveis, economizando GPU

**Realismo Espacial (Sem Atmosfera)**

- **Estrelas nítidas e pontuais**: simulam difração limitada, não há "brilho atmosférico" como na Terra
- **Sem cintilação**: no espaço, estrelas não piscam (diferente da visão da superfície terrestre)
- **Falloff acentuado**: `strength = pow(1.0 - dist×2.0, 3.0)` para pontos ultra-definidos
- **Blending aditivo**: estrelas sobrepostas somam luz realisticamente

**Precisão de Coordenadas**

- Sistema de buffer de profundidade logarítmico para lidar com distâncias extremas (até 10¹² unidades)
- Mapeamento correto entre sistemas de coordenadas:
  - **Astronômico**: Z é Norte Celestial, X é Equinócio Vernal
  - **Three.js**: Y é "para cima", X é direita, Z é profundidade
- Alinhamento perfeito entre céu estelar e eclíptica do Sistema Solar

**Pipeline de Processamento de Dados**

Scripts Node.js dedicados que:

- Lêem o arquivo CSV HYG v4.2 (119.000+ estrelas brutas).
- Sanitizam entradas inválidas (coordenadas não-finitas, paralaxe zero) e derivam paralaxe a partir de distância quando necessário.
- Emitem **binários gzipados por tier** em `public/data/hyg-stars/` (ex.: `hyg-v1-full.bin.gz` ~1,77 MB com ~109.400 estrelas). Os tiers `low`/`medium`/`high` servem subsets menores (500 / 10k / 50k) para dispositivos constrained/balanced.
- São reproduzíveis via `npm run download:hyg` + `npm run build:hyg`.

**Resultado Visual**

Um céu estrelado **cientificamente preciso** onde:

- Constelações familiares (Órion, Cruzeiro do Sul, Ursa Maior) aparecem nas posições corretas
- Cores estelares refletem temperaturas reais (azuis quentes, vermelhas frias)
- Brilho relativo das estrelas corresponde ao que vemos do espaço
- Via Láctea (textura 8K separada) complementa as estrelas pontuais

### **Shaders Customizados (Tecnologia de Renderização Avançada)**

Desenvolvemos **4 sistemas de shader especializados** que rodam na sua GPU para criar efeitos realistas que você não vê em visualizadores comuns:

**1. Atmosferas Brilhantes (Fresnel Glow)**

- Halos atmosféricos que aparecem nas bordas dos planetas usando física de luz real
- Efeito **Fresnel** que simula como a luz se dispersa na atmosfera
- Visível em ângulos rasantes, exatamente como na realidade

**2. Sombras dos Anéis no Planeta**

- As sombras dos anéis de Saturno são calculadas **em tempo real** por geometria analítica (interseção raio-plano)
- Detecta onde o planeta está no escuro e suaviza as bordas das sombras
- Usa a textura de transparência dos anéis para criar sombras com densidades variadas

**3. Sombras do Planeta nos Anéis**

- Sistema inverso: o planeta projeta sombra nos anéis usando **interseção raio-esfera** (equação quadrática |O + tD|² = R²)
- Calcula o cone de sombra no espaço 3D com precisão matemática
- Penumbra realista (transição suave da sombra)

**4. Terra Dia/Noite**

- Sistema de texturas duplas que mostra o lado diurno E o noturno simultaneamente
- Luzes das cidades aparecem gradualmente no lado escuro
- Transição suave baseada no ângulo do Sol

### **Pipeline de Pós-Processamento HDR**

Efeitos cinematográficos em tempo real:

- **Bloom**: objetos brilhantes (como o Sol) emitem luz que "vaza" naturalmente
- **Tone Mapping**: adaptação dinâmica de brilho, como nossos olhos fazem
- **Ajuste de saturação e contraste** para cores vibrantes mas realistas
- Tudo calibrado para rodar de forma fluida no navegador, com perfis de qualidade ajustáveis

### **Renderização Fisicamente Baseada (PBR)**

- Mesma tecnologia usada em jogos AAA como Unreal Engine e Unity
- Materiais com rugosidade e metalicidade configuráveis
- Iluminação que simula como a luz interage com diferentes superfícies (rochas, gelo, gases)

---

## 🎓 **Educação e Interatividade**

### **Dois Modos de Visualização Inteligentes**

**Modo Realista**

- Proporções 1:1 do Sistema Solar real
- Sinta a **imensidão** real do espaço
- Veja como os planetas são minúsculos comparados às distâncias entre eles

**Modo Didático**

- Algoritmo matemático especial que usa **escala não-linear** (fórmula: r' = A × r^0.45)
- Permite ver todo o Sistema Solar mantendo os planetas visíveis
- Preserva relações topológicas enquanto sacrifica proporções exatas para clareza educacional
- **Inovação única**: você pode alternar entre os modos instantaneamente!

### **Controles Interativos Poderosos**

**Linha do Tempo**

- Avance ou retroceda no tempo
- Velocidades configuráveis: 1x (tempo real), 10x, 100x
- Veja eclipses históricos ou futuros alinhamentos planetários

**Busca Instantânea**

- Procure qualquer um dos 70+ corpos celestes
- Navegação rápida para qualquer lugar do Sistema Solar
- Suporte bilíngue (português/inglês)

**Câmera Inteligente**

- Voe suavemente entre planetas com animações cinematográficas
- Sistema de auto-enquadramento: a câmera automaticamente se posiciona na distância perfeita
- Controle total com mouse/toque (6 graus de liberdade)
- Zoom adaptativo que funciona em objetos de qualquer tamanho

**Painéis Informativos Ricos**

Para cada corpo celeste:

- Classificação e propriedades físicas detalhadas
- Massa, gravidade, composição, atmosfera
- Faixas de temperatura e períodos de rotação/órbita
- **Curiosidades únicas**: desde oceanos subterrâneos até vulcões ativos
- Marcos históricos de exploração espacial
- Recordes e superlativos (maior, mais rápido, mais frio, etc.)

**Tutorial Integrado**

- Sistema de introdução passo-a-passo para novos usuários
- Animações suaves para guiar a experiência
- Não repete para quem já conhece o app

---

## 🚀 **Inovações Técnicas que Fazem a Diferença**

### **Cálculos Analíticos em Tempo Real**

Diferente de outros simuladores que usam sombras "assadas" (pré-calculadas), o Atlas Orbital calcula tudo **durante a renderização**:

- Sombras realistas em qualquer distância ou escala
- Eficiente para a CPU enquanto usa o poder da GPU
- Comportamento correto de sombras independente de onde você está

### **Gerenciamento de Escalas Extremas**

O desafio mais difícil em simulações espaciais: como mostrar algo da ordem de quilômetros e algo da ordem de bilhões de quilômetros na mesma cena sem perder detalhe?

- Buffer de profundidade logarítmico do WebGL para distâncias dinâmicas muito amplas.
- Câmera com clamps de `near`/`far` adaptativos ao corpo focado (ajustados em `CameraController` conforme o raio do alvo).
- Dois modos de escala intercambiáveis (didático × realista) para cobrir a faixa de leitura desejada sem trocar de cena.

### **Precisão de Vírgula Flutuante**

- Gerenciamento cuidadoso de erros de arredondamento
- Mantém estabilidade numérica em cálculos astronômicos
- Posicionamento correto mesmo em escalas extremas

---

## 🌟 **Por Que o Atlas Orbital é Diferente?**

### **Comparação com Outros Simuladores**

**vs. Stellarium** (planetário desktop)

- Stellarium: vista 2D do céu da Terra
- **Atlas Orbital**: navegação 3D completa + mecânica orbital real

**vs. Celestia** (simulador clássico)

- Celestia: app desktop, tecnologia antiga
- **Atlas Orbital**: web moderno (sem instalação) + stack React/Three.js de ponta

**vs. OpenSpace** (usado em planetários profissionais)

- OpenSpace: ferramenta VR/planetário para profissionais
- **Atlas Orbital**: acessível na web + foco educacional

**vs. NASA's Eyes** (visualizador oficial da NASA)

- NASA's Eyes: focado em trajetórias de missões específicas
- **Atlas Orbital**: cálculos orbitais em tempo real + mais abrangente

---

## 💎 **O Equilíbrio Perfeito**

O que torna o Atlas Orbital especial é que ele **NÃO COMPROMETE**:

✅ **Rigor Científico** (dados astronômicos documentados, teorias analíticas por família — VSOP87D / Pluto-Meeus / ELP-MPP02 / Kepler osculante — validadas contra JPL Horizons)
✅ **Beleza Visual** (texturas 8K, shaders customizados, renderização PBR)
✅ **Acessibilidade** (roda no navegador, sem instalação, interface intuitiva)
✅ **Performance** (renderização WebGL otimizada, carregamento eficiente, perfis de qualidade)

---

## 📊 **Resumo dos Achievements Técnicos e Científicos**

### **Rigor Científico:**

- Mecânica orbital analítica por família (VSOP87D, Pluto-Meeus, ELP-MPP02-trunc, Kepler de elementos osculantes) com regressão contra JPL Horizons em 28 corpos × 4 épocas.
- Constantes físicas e propriedades documentadas no repositório.
- Ressonâncias orbitais emergem naturalmente da precisão das séries.
- Catálogo HYG v4.2 (Hipparcos/Yale/Gliese) em tiers — até ~109.400 estrelas no tier `ultra`.

### **Excelência Visual:**

- Texturas 8K para planetas principais
- Efeitos de shader customizados (halos atmosféricos, sombras de anéis, efeitos dia/noite)
- Materiais PBR para iluminação realista
- Capacidade de zoom em 40+ ordens de magnitude
- Campo estelar com posições 3D calculadas a partir de paralaxe e coordenadas celestes

### **Design Educacional:**

- Modo de escala didática com rigor matemático
- Displays de informação interativos com fatos e recordes
- Controle de linha do tempo com movimento orbital realista
- Sistema de tutorial e funcionalidade de busca

### **Inovação Técnica:**

- Cálculos de sombra analíticos em shaders
- Gerenciamento de precisão de ponto flutuante em escalas extremas
- Posicionamento inteligente de câmera e transições suaves
- Renderização WebGL eficiente com pós-processamento
- Cores baseadas em índice B-V (radiação de corpo negro)
- Sistema LOD que adapta densidade estelar ao nível de zoom
- Renderização realista sem cintilação atmosférica

### **Acessibilidade:**

- Baseado na web (sem instalação)
- Interface bilíngue (inglês/português)
- Responsivo a controles de toque e mouse
- Divulgação progressiva de informações

---

## 🎯 **Experimente Agora**

**Sem instalação. Sem cadastro. Apenas pura exploração científica.**

Navegue pelo Sistema Solar com um motor orbital analítico calibrado contra dados reais. Veja a Terra de uma perspectiva rara. Testemunhe a majestade dos anéis de Saturno com sombras calculadas em tempo real. Viaje até Plutão e suas 5 luas. Avance o tempo e veja os planetas dançarem em suas órbitas reais. Contemple dezenas de milhares de estrelas reais posicionadas a partir do catálogo HYG v4.2, com o tier escolhido automaticamente conforme o seu dispositivo.

**Atlas Orbital: O Cosmos ao alcance de um clique.**

---

_Baseado em referências e ativos de: NASA Eyes, NASA Science/JPL/USGS, ESA, Catálogo HYG v4.2 (Hipparcos/Yale/Gliese), missões Parker Solar Probe, Perseverance, New Horizons, Voyager, Cassini-Huygens, Galileo e MESSENGER, além de dados astronômicos documentados no repositório._
