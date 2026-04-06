Continuar a fase de fidelidade visual do Atlas Orbital em `/Users/fgferre/Github/atlas-orbital`.

Objetivo imediato:

- consolidar a integracao oficial de `pallas` e `hygiea`
- usar a matriz de estudo para decidir futuras trocas de textura
- validar candidatos por screenshot controlado, nao por impressao

Contexto fechado:

- `pallas` ja aponta para `public/models/Pallas_DAMIT_101.obj`
- `hygiea` ja aponta para `public/models/Hygiea_DAMIT_4392.obj`
- `hygiea` ainda bloqueia o mapa VLT no caminho difuso principal por decisao de estudo
- a regra de mapa direto agora consulta `src/data/assetManifest.ts`
- a matriz comparativa vive em `src/data/assetStudyMatrix.ts`
- a pagina de estudo existe em `/?study=asset-review`
- a varredura externa ja importou:
  - `public/textures/jupiter_nasa_io_b_3d_resource.jpg`
  - `public/textures/titan_cassini_iss_global_mosaic_4km.jpg`
  - `public/textures/europa_voyager_galileo_global_mosaic_500m.jpg`
- `uranus` ainda nao ganhou um replacement externo forte
- decisoes ja tomadas:
  - `jupiter` permanece com o mapa atual
  - `titan` usa o mosaico oficial Cassini/USGS
  - `europa` usa o mosaico oficial Voyager/Galileo

Arquivos principais:

- `src/data/celestialBodies.ts`
- `src/data/assetManifest.ts`
- `src/data/assetStudyMatrix.ts`
- `src/utils/proceduralSurface.ts`
- `src/components/ui/AssetStudyApp.tsx`
- `docs/fase-6-handoff.md`

Guardrails:

- nao promover textura nova so porque o arquivo e maior
- priorizar ganho visivel + proveniencia igual ou melhor + custo aceitavel
- manter `vesta` e `haumea` como baseline nesta fase
- tratar `titan` e `europa` como estudo ainda inconclusivo em proveniencia

Ordem sugerida:

1. abrir `/?study=asset-review`
2. gerar screenshots desktop/mobile com Playwright CLI
3. comparar `jupiter` e `uranus` como principais candidatos de troca de textura
4. validar se `hygiea` merece promover o mapa VLT
5. atualizar matriz/vereditos e, so entao, considerar promover qualquer textura
