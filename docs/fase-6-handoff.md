# Fase 6 Handoff - integracao oficial de modelos e estudo visual controlado

## Objetivo

Executar uma fase curta e controlada para:

- colocar `pallas` e `hygiea` nos modelos oficiais ja baixados
- alinhar o que o dataset declara com o que o runtime realmente renderiza
- criar uma base objetiva para decidir futuras trocas de textura
- evitar upgrade visual por impressao ou por tamanho de arquivo apenas

## Baseline atual

Arquivos centrais desta fase:

- `src/data/celestialBodies.ts`
- `src/data/assetManifest.ts`
- `src/data/assetStudyMatrix.ts`
- `src/utils/proceduralSurface.ts`
- `src/components/ui/AssetStudyApp.tsx`

Estado consolidado:

- `Planet.tsx` continua priorizando `model` quando ele existe
- `pallas` agora aponta para `Pallas_DAMIT_101.obj`
- `hygiea` agora aponta para `Hygiea_DAMIT_4392.obj`
- `hygiea` ainda nao promove o mapa VLT no caminho difuso principal
- a decisao de mapa direto deixou de ser um hardcode solto e agora consulta o `assetManifest`
- `vesta` e `haumea` permanecem como baseline oficial de alta fidelidade nesta fase
- a varredura externa trouxe candidatos novos para:
  - `jupiter`: `jupiter_nasa_io_b_3d_resource.jpg`
  - `titan`: `titan_cassini_iss_global_mosaic_4km.jpg`
  - `europa`: `europa_voyager_galileo_global_mosaic_500m.jpg`
- `uranus` continua sem replacement externo forte aprovado
- decisao curatorial fechada:
  - `jupiter` mantido como esta
  - `titan` promovido para o mosaico oficial Cassini/USGS
  - `europa` promovida para o mosaico oficial Voyager/Galileo

## Decisoes fechadas

- `pallas` entra com shape model oficial DAMIT e superficie procedural honesta
- `hygiea` entra com shape model oficial DAMIT agora
- o mapa VLT de `hygiea` continua como `candidate` ate vencer o estudo visual
- `jupiter` e `uranus` ficam com candidatos locais documentados para comparacao
- `titan` e `europa` entram no estudo, mas os candidatos locais continuam fracos em proveniencia
- nenhum asset novo deve ser promovido so por ser maior ou mais pesado

## Manifest e matriz

Fonte unica de verdade desta fase:

- `src/data/assetManifest.ts`
- `src/data/assetStudyMatrix.ts`

O `assetManifest` registra:

- corpo
- arquivo
- tipo
- formato
- tamanho
- resolucao
- origem
- URL
- licenca
- atribuicao
- status
- data de verificacao

A `assetStudyMatrix` cobre:

- `pallas`
- `hygiea`
- `vesta`
- `haumea`
- `jupiter`
- `uranus`
- `titan`
- `europa`

## Superficie de estudo

Existe uma pagina dedicada e escondida por query param:

- `/?study=asset-review`

Filtro opcional:

- `/?study=asset-review&body=pallas,hygiea`

Ela mostra:

- matriz resumida
- preview flat dos assets
- viewport aplicado na geometria
- metadata por asset
- veredito por corpo

## Captura por CLI

Com o servidor de teste ativo em `127.0.0.1:4173`:

Desktop:

```bash
npx playwright screenshot \
  --viewport-size "1440,2200" \
  --full-page \
  --wait-for-selector "[data-testid='asset-study-root']" \
  "http://127.0.0.1:4173/?study=asset-review" \
  output/asset-study-desktop.png
```

Mobile:

```bash
npx playwright screenshot \
  --device "iPhone 13" \
  --full-page \
  --wait-for-selector "[data-testid='asset-study-root']" \
  "http://127.0.0.1:4173/?study=asset-review" \
  output/asset-study-mobile.png
```

## Checklist de aceite

- `pallas` carrega com o novo OBJ DAMIT
- `hygiea` carrega com o novo OBJ DAMIT
- `hygiea` continua sem promover silenciosamente o mapa VLT
- a regra de mapa direto consulta o `assetManifest`
- a matriz tecnica inicial cobre os 8 corpos
- a superficie `asset-review` abre sem depender da UI principal
- os screenshots podem ser gerados por Playwright CLI
