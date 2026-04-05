# Fase 3 Handoff - fidelidade visual e proveniencia de assets

## Objetivo

Executar a fase de fidelidade visual dos corpos menores sem inventar "realismo falso".

O alvo desta fase e melhorar a representacao visual de objetos que hoje usam placeholders ou fallbacks temporarios, mas sem fazer uma troca cosmetica enganosa. Quando nao existir textura, shape model ou observacao resolvida suficiente, o app deve:

- usar um visual procedural ou interpretativo honesto
- explicar isso claramente na bio / painel do objeto
- dizer por que nao existe asset real adequado

Em resumo: esta fase nao e "trocar tudo por uma imagem bonita"; e "subir a fidelidade quando houver base cientifica e declarar limites quando nao houver".

## Contexto atual

Depois da Fase 2:

- os `404` de texturas principais foram neutralizados com remapeamentos temporarios em `src/data/celestialBodies.ts`
- esses remapeamentos evitam erro de runtime, mas varios ainda sao placeholders visuais
- o app ja suporta dois caminhos visuais para corpos:
  - esfera + textura via `Planet.tsx`
  - modelo 3D `GLB/GLTF` ou `OBJ` via `PlanetModel.tsx`

Arquivos centrais para esta fase:

- `src/data/celestialBodies.ts`
- `src/lib/astrophysics.ts`
- `src/components/ui/Sidebar.tsx`
- `src/components/canvas/Planet.tsx`
- `src/components/canvas/PlanetModel.tsx`
- `src/components/ui/CreditsModal.tsx`

## Regra numero 1

Nao apresentar concept art, artist impression ou placeholder procedural como se fosse "textura real observada".

Se o asset for:

- medido por missao espacial
- derivado de mapa astronomico resolvido
- shape model por inversao / occultation / adaptive optics
- interpretativo
- procedural

isso precisa ficar claro no codigo e na UI.

## Regra numero 2

Todo objeto com fidelidade limitada deve explicar isso na bio.

Nao basta deixar a limitacao "sabida pelo time". O painel lateral precisa deixar claro, em linguagem curta e compreensivel, algo como:

- qual e a origem visual do objeto
- se existe ou nao existe imagem / textura global observada
- por que o visual atual e interpretativo

## Regra numero 3

Quando houver asset forte e observacional, priorizar fidelidade real.

Quando nao houver, priorizar honestidade cientifica e coerencia visual.

## Estado atual que precisa ser substituido ou consolidado

Hoje existem fallbacks temporarios para estes corpos:

- `gonggong`
- `quaoar`
- `orcus`
- `sedna`
- `salacia`
- `vanth`
- `weywot`
- `vesta`
- `pallas`
- `hygiea`

Esses fallbacks cumpriram o objetivo de remover `404`, mas nao devem ser tratados como resolucao final.

## Estrategia validada por objeto

### Grupo A - Upgrade forte com asset real

#### Vesta

Decisao recomendada:

- usar `modelo 3D + textura`

Motivo:

- existe shape/model forte da NASA / Dawn
- existe mosaico global observacional forte para textura

Implementacao recomendada:

- preferir `GLB` oficial da NASA para geometria
- usar mosaico global Dawn/USGS como textura principal
- manter fallback local temporario ate o asset novo entrar

Bio / painel deve dizer:

- que o visual deriva de observacoes da missao Dawn
- que e um dos corpos de alta fidelidade do app

#### Pallas

Decisao recomendada:

- usar `modelo 3D`
- nao prometer textura global real se ela nao existir em qualidade adequada

Motivo:

- existe shape model observacional util
- nao ha textura global forte comparavel a Vesta

Implementacao recomendada:

- priorizar `OBJ` de shape model
- usar material simples e coerente em vez de mapa detalhado inventado
- se houver textura de apoio, tratar explicitamente como interpretativa

Bio / painel deve dizer:

- que a forma vem de shape model observacional
- que a superficie nao possui mapa fotografico global resolvido equivalente a uma missao de sobrevoo / orbita

#### Hygiea

Decisao recomendada:

- usar `modelo 3D + textura`

Motivo:

- existe shape model util
- existe mapa / referencia observacional publica melhor do que o placeholder atual

Implementacao recomendada:

- priorizar `OBJ` do shape model
- usar mapa observacional como textura base, aceitando fidelidade menor do que Vesta

Bio / painel deve dizer:

- que o visual vem de observacoes remotas e shape model
- que a fidelidade e observacional, mas inferior a corpos visitados por missoes dedicadas

### Grupo B - Upgrade de geometria, nao de textura

#### Quaoar

Decisao recomendada:

- substituir esfera simples por elipsoide / geometria observacional simplificada
- manter superficie interpretativa

Motivo:

- ha base cientifica boa para forma elipsoidal
- nao ha textura fotografica global resolvida

Implementacao recomendada:

- usar parametros de elipsoide baseados em occultation / paper recente
- nao inventar mapa detalhado de crateras / manchas

Bio / painel deve dizer:

- que a geometria e baseada em ajuste observacional
- que nao existe textura global observada reutilizavel

### Grupo C - Manter visual interpretativo honesto

Corpos:

- `gonggong`
- `orcus`
- `sedna`
- `salacia`
- `vanth`
- `weywot`

Decisao recomendada:

- manter esfera ou forma simples
- usar material procedural / interpretativo guiado por cor, albedo e composicao
- nao buscar "textura falsa detalhada" so para parecer premium

Motivo:

- nao ha shape model 3D publico reutilizavel forte para a maioria
- nao ha textura global fotografica resolvida
- em varios casos so existem deteccoes telescopicas, imagens nao resolvidas ou concept art

Bio / painel deve dizer explicitamente o por que:

- sem missao dedicada
- sem imagem global resolvida
- objeto observado apenas como disco muito pequeno, ponto, occultation, AO ou fotometria
- visual atual e interpretativo

## Recomendacao de modelagem de dados

Esta fase fica mais limpa se o projeto ganhar um campo dedicado para proveniencia visual em `CelestialBody`, em vez de esconder tudo em `description` ou `facts`.

Estrutura sugerida:

```ts
visualProvenance?: {
  fidelity: "measured" | "observational-model" | "interpretive" | "procedural";
  summary: string;
  limitationReason?: string;
  sources?: Array<{
    label: string;
    url: string;
  }>;
}
```

Uso recomendado:

- `summary`: texto curto mostrado no Sidebar
- `limitationReason`: quando nao houver asset real forte
- `sources`: links para origem do asset ou base cientifica

Se nao houver tempo para criar um bloco novo no tipo/UI, alternativa minima:

- adicionar esse contexto em `description` e/ou `facts`

Mas isso e menos ideal do que uma secao propria como `Visual Source` ou `Visual Fidelity`.

## Recomendacao de UI

### Sidebar

Adicionar uma secao dedicada no `Sidebar.tsx`, de preferencia logo apos a descricao principal ou apos `Physical Data`.

Titulo sugerido:

- `Visual Source`
- ou `Visual Fidelity`

Conteudo esperado:

- uma frase curta sobre a origem do visual
- uma frase curta sobre a limitacao, quando existir
- opcionalmente 1 ou 2 links na UI futura; se nao houver UI de link, ao menos manter os links no dado

Exemplos de copy aceitavel:

- `Shape and surface are based on Dawn mission data.`
- `Shape is observation-based, but no resolved global texture map exists.`
- `No resolved spacecraft or telescope surface map exists; this visualization is interpretive, guided by color and composition estimates.`

### Credits

Atualizar `CreditsModal.tsx` se novos assets / fontes entrarem:

- NASA Science
- USGS planetary maps
- DAMIT / Observatoire de la Cote d'Azur / shape-model provenance
- Wikimedia Commons, quando a fonte final vier de la e a licenca permitir

## Ordem recomendada de execucao

1. Congelar o principio de honestidade visual no handoff e no codigo.
2. Introduzir `visualProvenance` no tipo `CelestialBody` e no `Sidebar`.
3. Substituir Vesta por `GLB + textura` observacional.
4. Substituir Pallas por `OBJ` / shape model e material honesto.
5. Substituir Hygiea por `OBJ + mapa` observacional.
6. Aplicar upgrade de geometria para Quaoar.
7. Revisar Gonggong, Orcus, Sedna, Salacia, Vanth e Weywot para materiais interpretativos coerentes.
8. Remover dependencias de placeholders temporarios nao necessarios.
9. Atualizar credits e documentacao.
10. Rodar validacao completa.

## Matriz de decisoes por objeto

| Objeto   | Estado final recomendado                        | Tipo de asset        | Bio precisa explicar limite? | Observacao                                      |
| -------- | ----------------------------------------------- | -------------------- | ---------------------------- | ----------------------------------------------- |
| Vesta    | alta fidelidade                                 | `GLB + textura`      | sim, mas curta               | corpo com melhor base cientifica da lista       |
| Pallas   | forma forte, textura fraca                      | `OBJ + material`     | sim                          | nao fingir mapa global detalhado                |
| Hygiea   | boa fidelidade remota                           | `OBJ + textura`      | sim                          | melhor que placeholder, menor que Dawn          |
| Quaoar   | forma observacional + superficie interpretativa | geometria elipsoidal | sim                          | sem textura global resolvida                    |
| Gonggong | interpretativo honesto                          | procedural/material  | sim                          | concept art nao deve virar "mapa real"          |
| Orcus    | interpretativo honesto                          | esfera/material      | sim                          | imagem resolvida insuficiente                   |
| Sedna    | interpretativo honesto                          | esfera/material      | sim                          | sem mapa global, concept art so como referencia |
| Salacia  | interpretativo honesto                          | esfera/material      | sim                          | observacao limitada                             |
| Vanth    | interpretativo honesto                          | esfera/material      | sim                          | sem asset global real                           |
| Weywot   | interpretativo honesto                          | esfera/material      | sim                          | sem asset global real                           |

## Diretrizes especificas para a bio / visual provenance

### Corpos com asset observacional forte

#### Vesta

Mensagem esperada:

- forma e superficie derivadas de dados da missao Dawn

#### Pallas

Mensagem esperada:

- forma baseada em shape model observacional
- sem mapa fotografico global equivalente a corpos visitados por missao dedicada

#### Hygiea

Mensagem esperada:

- forma e aparencia baseadas em observacoes remotas e shape model

### Corpos sem asset global real

#### Quaoar

Mensagem esperada:

- forma aproximada a partir de observacoes / occultation
- sem textura global resolvida
- superficie atual e interpretativa

#### Gonggong

Mensagem esperada:

- nao existe textura global observada reutilizavel
- o visual atual e interpretativo, guiado por sua coloracao muito avermelhada observada por telescopios

#### Orcus

Mensagem esperada:

- nao existe mapa fotografico global resolvido
- a aparencia atual e uma aproximacao observacional / interpretativa

#### Sedna

Mensagem esperada:

- nao ha imagem global resolvida por missao espacial ou mapa fotografico observacional detalhado
- o visual atual e interpretativo, inspirado por estimativas de cor e composicao

#### Salacia

Mensagem esperada:

- observacoes atuais nao fornecem textura global detalhada
- visual atual e uma aproximacao coerente com albedo / composicao estimados

#### Vanth

Mensagem esperada:

- sem textura global resolvida
- visual atual e simplificado e interpretativo

#### Weywot

Mensagem esperada:

- observado apenas de forma muito limitada
- sem asset global real

## Fontes pesquisadas e recomendadas

### Vesta

- NASA Science page: [Vesta 3D Model](https://science.nasa.gov/resource/vesta-3d-model/)
- GLB oficial: [Vesta_1_100.glb](https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/v/Vesta_1_100.glb?emrc=69d0894a353e7)
- Mosaico global Dawn / USGS: [Vesta Dawn FC HAMO Mosaic Global 74ppd](https://planetarymaps.usgs.gov/mosaic/Vesta_Dawn_FC_HAMO_Mosaic_Global_74ppd.tif)
- Base PDS / Dawn: [DWNVSPG_2.zip](https://sbnarchive.psi.edu/pds3/dawn/fc/DWNVSPG_2.zip)

### Pallas

- Shape model sugerido: [2_Pallas_mpcd.obj](https://observations.lam.fr/astero/3Dshape/2_Pallas_mpcd.obj)
- Alternativa leve: [2_Pallas_adam.obj](https://observations.lam.fr/astero/3Dshape/2_Pallas_adam.obj)
- Referencia visual: [Pallas - Potw2008a.jpg](https://upload.wikimedia.org/wikipedia/commons/5/56/Pallas_-_Potw2008a.jpg)

Observacao importante:

- o servidor do DAMIT / OCA pode responder mal a `HEAD` ou algumas requisicoes automatizadas; validar download real no momento da implementacao

### Hygiea

- Shape model sugerido: [10_Hygiea_mpcd.obj](https://observations.lam.fr/astero/3Dshape/10_Hygiea_mpcd.obj)
- Alternativa leve: [10_Hygiea_adam.obj](https://observations.lam.fr/astero/3Dshape/10_Hygiea_adam.obj)
- Mapa de referencia: [Hygiea VLT 2017-2018 map](https://upload.wikimedia.org/wikipedia/commons/f/f9/Hygiea_VLT_2017-2018_map.png)

### Quaoar

- Paper: [arXiv:2401.12679](https://arxiv.org/abs/2401.12679)
- Referencia visual do elipsoide: [Quaoar ellipsoid (Kiss et al. 2024)](https://commons.wikimedia.org/wiki/File:Quaoar_ellipsoid_Kiss_et_al._2024.png)

### Referencias para corpos interpretativos

- Gonggong concept / referencia: [The Planetary Society - Gonggong](https://www.planetary.org/space-images/2007-or10)
- Orcus observacao: [Orcus HST](https://upload.wikimedia.org/wikipedia/commons/6/6b/Orcus_HST.jpg)
- Sedna concept: [Artist's conception of Sedna](https://upload.wikimedia.org/wikipedia/commons/6/68/Artist%27s_conception_of_Sedna.jpg)
- Salacia and Actaea: [Keck-NIRC2 image](https://commons.wikimedia.org/wiki/File:Salacia_and_Actaea_Keck-NIRC2.jpg)
- Vanth reference: [Vanth.png](https://upload.wikimedia.org/wikipedia/commons/e/e6/Vanth.png)
- Weywot reference: [Weywot_hst.jpg](https://commons.wikimedia.org/wiki/File:Weywot_hst.jpg)

## Nao-negociaveis desta fase

- nao trocar placeholder por concept art sem marcar explicitamente como interpretativo
- nao afirmar em texto que existe textura fotografica global quando nao existe
- nao degradar o que ja funciona em `Vesta`, `Pallas`, `Hygiea` sem motivo forte
- nao quebrar `npm run lint`
- nao quebrar `npm run test:run`
- nao quebrar `npm run build`
- nao reintroduzir `404` de textura para os corpos citados

## Definicao de pronto

- `Vesta`, `Pallas` e `Hygiea` usam a estrategia final definida e nao placeholders temporarios
- `Quaoar` deixa de ser apenas esfera simples se a geometria elipsoidal entrar nesta fase
- `Gonggong`, `Orcus`, `Sedna`, `Salacia`, `Vanth` e `Weywot` passam a ter visual interpretativo coerente e texto explicativo no painel
- o `Sidebar` exibe a proveniencia visual ou limitacao do asset
- os `404` de textura para esse grupo nao existem mais
- `CreditsModal` reflete as novas fontes, quando aplicavel

## Validacao obrigatoria

### Tecnica

- `npm run lint`
- `npm run test:run`
- `npm run build`

### Runtime

- abrir `preview:test` e verificar console
- para os corpos desta fase, nao deve haver `404` de textura
- se restar erro de `favicon.ico`, ele e separavel desta fase

### Visual

- abrir o painel lateral de cada corpo listado
- confirmar que a bio explica corretamente a natureza do visual
- confirmar que nenhum texto vende placeholder como observacao real
- comparar `Vesta`, `Pallas` e `Hygiea` com as referencias externas escolhidas

## Prompt sugerido para a proxima conversa

```text
Leia `docs/fase-2-handoff.md` e `docs/fase-3-handoff.md`. Execute a fase de fidelidade visual dos corpos menores sem inventar realismo falso. Priorize Vesta, Pallas e Hygiea com assets reais quando houver base suficiente; use upgrade de geometria para Quaoar; mantenha Gonggong, Orcus, Sedna, Salacia, Vanth e Weywot como visuais interpretativos honestos se nao houver asset real adequado. Adicione no painel lateral / bio uma explicacao clara da proveniencia visual de cada objeto e do motivo de nao existir textura ou modelo real quando esse for o caso. Nao reintroduza 404s, e valide com lint, test:run, build e console limpo de erros de textura.
```
