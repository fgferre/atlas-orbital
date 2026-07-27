import {
  getVisualAssetById,
  type VisualAssetManifestEntry,
} from "./assetManifest";

export type AssetStudyVerdict =
  | "substituir"
  | "manter"
  | "manter como alternativa"
  | "descartar";

export interface AssetStudyRenderVariant {
  label: string;
  mode: "model" | "sphere";
  modelAssetId?: string;
  mapAssetId?: string;
  useProceduralSurface?: boolean;
  note: string;
}

export interface AssetStudyMatrixRow {
  bodyId: string;
  bodyLabel: string;
  currentRepoAsset: string;
  runtimeAssetToday: string;
  candidateAsset: string;
  primarySource: string;
  license: string;
  resolution: string;
  diskSize: string;
  format: string;
  scientificFidelityNote: string;
  regressionRisk: string;
  verdict: AssetStudyVerdict;
  recommendation: string;
  currentAssetIds: string[];
  candidateAssetIds: string[];
  comparison?: {
    current: AssetStudyRenderVariant;
    candidate?: AssetStudyRenderVariant;
  };
}

export const ASSET_STUDY_MATRIX: AssetStudyMatrixRow[] = [
  {
    bodyId: "pallas",
    bodyLabel: "Pallas",
    currentRepoAsset: "Pallas_Torppa.obj",
    runtimeAssetToday: "OBJ observacional antigo com superficie procedural",
    candidateAsset: "Pallas_DAMIT_101.obj",
    primarySource: "DAMIT model 101",
    license: "CC BY 4.0 no candidato; legado atual sem licenca clara no repo",
    resolution: "sem mapa difuso",
    diskSize: "62.8 KiB -> 86.7 KiB",
    format: "OBJ",
    scientificFidelityNote:
      "Pallas nao tem textura global de missao. O ganho real aqui e geometria observacional melhor, nao pintura de superficie.",
    regressionRisk:
      "Baixo. O risco principal e normalizacao/escala do novo OBJ, nao perda de detalhe de textura.",
    verdict: "substituir",
    recommendation:
      "Promover o shape DAMIT agora e manter a superficie procedural honesta.",
    currentAssetIds: ["pallas-model-fallback"],
    candidateAssetIds: ["pallas-model-active"],
    comparison: {
      current: {
        label: "Runtime atual",
        mode: "model",
        modelAssetId: "pallas-model-fallback",
        useProceduralSurface: true,
        note: "Modelo legado com material procedural sem mapa fotografico.",
      },
      candidate: {
        label: "Shape oficial",
        mode: "model",
        modelAssetId: "pallas-model-active",
        useProceduralSurface: true,
        note: "Mesmo tratamento superficial, mas com shape DAMIT mais forte.",
      },
    },
  },
  {
    bodyId: "hygiea",
    bodyLabel: "Hygiea",
    currentRepoAsset: "Hygiea_Vernazza.obj + hygiea_vlt_2017_2018_map.png",
    runtimeAssetToday:
      "OBJ legado com superficie procedural; o mapa VLT fica bloqueado",
    candidateAsset: "Hygiea_DAMIT_4392.obj + mapa VLT em avaliacao",
    primarySource: "DAMIT model 4392 + ESO VLT / Wikimedia Commons",
    license: "CC BY 4.0 para o modelo DAMIT e para o mapa VLT",
    resolution: "mapa candidato 1024x512",
    diskSize: "91.9 KiB + 160 KiB -> 136.0 KiB + 160 KiB",
    format: "OBJ + PNG",
    scientificFidelityNote:
      "O shape oficial melhora a geometria imediatamente. Ja o mapa VLT e observacional, mas bem menos resolvido do que um produto de missao dedicada.",
    regressionRisk:
      "Medio. O mapa anotado/remoto pode piorar a leitura no render final se entrar cedo demais.",
    verdict: "substituir",
    recommendation:
      "Promover o shape DAMIT agora e manter o mapa VLT como candidato ate a comparacao visual.",
    currentAssetIds: ["hygiea-model-fallback", "hygiea-map-candidate"],
    candidateAssetIds: ["hygiea-model-active", "hygiea-map-candidate"],
    comparison: {
      current: {
        label: "Runtime atual",
        mode: "model",
        modelAssetId: "hygiea-model-fallback",
        useProceduralSurface: true,
        note: "Shape legado com superficie procedural, espelhando o comportamento do runtime hoje.",
      },
      candidate: {
        label: "Candidato sob estudo",
        mode: "model",
        modelAssetId: "hygiea-model-active",
        mapAssetId: "hygiea-map-candidate",
        note: "Shape DAMIT com o mapa VLT aplicado apenas para validacao visual.",
      },
    },
  },
  {
    bodyId: "vesta",
    bodyLabel: "Vesta",
    currentRepoAsset: "Vesta_1_100.glb + vesta_dawn_embedded.png",
    runtimeAssetToday:
      "GLB oficial da NASA; o PNG fica como fallback da esfera",
    candidateAsset: "Nenhum replacement local melhor documentado",
    primarySource: "NASA Science / Dawn / USGS",
    license:
      "NASA media guidelines; fallback PNG documentado mas nao promovido",
    resolution: "fallback 2048x1024",
    diskSize: "4.84 MiB model; 2.10 MiB fallback map",
    format: "GLB + PNG",
    scientificFidelityNote:
      "Vesta ja esta no melhor patamar de fidelidade do projeto entre os corpos menores.",
    regressionRisk:
      "Baixo, mas qualquer troca sem motivo forte corre risco de piorar um dos melhores ativos atuais.",
    verdict: "manter",
    recommendation:
      "Manter o modelo atual e usar o estudo so como baseline de referencia de qualidade.",
    currentAssetIds: ["vesta-model-active", "vesta-map-fallback"],
    candidateAssetIds: [],
    comparison: {
      current: {
        label: "Baseline atual",
        mode: "model",
        modelAssetId: "vesta-model-active",
        note: "Modelo oficial atual, usado como referencia de alta fidelidade.",
      },
    },
  },
  {
    bodyId: "haumea",
    bodyLabel: "Haumea",
    currentRepoAsset: "Haumea_1_1000.glb + 4k_haumea_fictional.jpg",
    runtimeAssetToday: "GLB oficial da NASA; JPG ficticio fica como fallback",
    candidateAsset: "Nenhum replacement local melhor documentado",
    primarySource: "NASA Science model + Solar System Scope fallback texture",
    license: "NASA media guidelines + CC BY 4.0 no fallback",
    resolution: "fallback 4096x2048",
    diskSize: "10.81 MiB model; 2.60 MiB fallback map",
    format: "GLB + JPG",
    scientificFidelityNote:
      "A geometria e oficial, mas a textura solta e assumidamente ficcional. Hoje o runtime ja evita promover esse JPG como superficie principal.",
    regressionRisk:
      "Baixo. O risco aqui e tratar um fallback ficcional como upgrade, o que o estudo deve evitar.",
    verdict: "manter",
    recommendation:
      "Manter o modelo atual e tratar a textura solta apenas como referencia/fallback ate surgir opcao melhor.",
    currentAssetIds: ["haumea-model-active", "haumea-map-fallback"],
    candidateAssetIds: [],
    comparison: {
      current: {
        label: "Baseline atual",
        mode: "model",
        modelAssetId: "haumea-model-active",
        note: "Modelo oficial atual com o mesmo caminho usado em producao.",
      },
    },
  },
  {
    bodyId: "jupiter",
    bodyLabel: "Jupiter",
    currentRepoAsset: "jupiter_vgr1_2025.jpg",
    runtimeAssetToday:
      "Esfera com o mapa de 7200x3600 no foco em ultra; abaixo disso a escada serve 8k_jupiter.jpg (4096x2048) e 2k_jupiter.jpg. Ate 2026-07-27 o mapa declarado nunca era carregado e todo perfil recebia 2048x1024.",
    candidateAsset:
      "Nenhum. O antigo candidato jupiter_nasa_io_b_3d_resource.jpg e um mapa de Io, nao de Jupiter",
    primarySource:
      "NASA Science 3D Resources no candidato; mapa atual segue sem fonte fechada no repo",
    license:
      "NASA media guidelines no candidato; atual sem licenca clara no repo",
    resolution: "7200x3600 -> 1440x720",
    diskSize: "7.60 MiB -> 632.9 KiB",
    format: "JPG",
    scientificFidelityNote:
      "A comparacao original era invalida: o arquivo tratado como candidato de Jupiter e um mapa global de Io publicado numa pagina da NASA sobre Jupiter. O veredito 'mole demais' media a coisa errada.",
    regressionRisk:
      "n/a enquanto nao houver um candidato de Jupiter de verdade. O mapa atual segue sem fonte fechada no repo.",
    verdict: "manter",
    recommendation:
      "Manter o mapa atual. O antigo candidato foi reclassificado como io-map-active e agora e o mapa de runtime de Io; Jupiter fica sem candidato externo.",
    currentAssetIds: ["jupiter-map-active"],
    candidateAssetIds: [],
    comparison: {
      current: {
        label: "Runtime atual",
        mode: "sphere",
        mapAssetId: "jupiter-map-active",
        note: "Mapa atual ativo em producao.",
      },
    },
  },
  {
    bodyId: "uranus",
    bodyLabel: "Uranus",
    currentRepoAsset: "uranus_texture_map_8k_by_floridaemojicat_dj4s9vd.jpg",
    runtimeAssetToday:
      "Esfera com o mapa comunitario de 8000x4336 no foco em ultra; nos demais perfis a escada serve 2k_uranus.jpg. Ate 2026-07-27 o mapa declarado nunca era carregado e todo perfil recebia 2k_uranus.jpg.",
    candidateAsset: "Nenhum replacement externo forte encontrado",
    primarySource:
      "A varredura em NASA, USGS e ESO nao encontrou um mapa global livre e forte o bastante para superar o atual",
    license: "sem candidato externo aprovado",
    resolution: "8000x4336 -> n/a",
    diskSize: "2.99 MiB -> n/a",
    format: "JPG",
    scientificFidelityNote:
      "Uranus depende muito mais de gradiente e colorimetria do que de relevo. Ate agora a varredura oficial nao trouxe um mapa global melhor e claramente reutilizavel.",
    regressionRisk:
      "Alto. Trocar so por governanca, sem um replacement externo forte, tende a piorar o resultado visual.",
    verdict: "manter",
    recommendation:
      "Manter o mapa atual enquanto a busca externa nao trouxer um candidato oficial mais convincente.",
    currentAssetIds: ["uranus-map-active"],
    candidateAssetIds: [],
    comparison: {
      current: {
        label: "Runtime atual",
        mode: "sphere",
        mapAssetId: "uranus-map-active",
        note: "Mapa atual ativo em producao.",
      },
    },
  },
  {
    bodyId: "titan",
    bodyLabel: "Titan",
    currentRepoAsset: "titan_map__2010__by_mapperpro_dg0iw6y.png",
    runtimeAssetToday:
      "Esfera com 2k_titan.jpg (1264x632) em todo perfil e salience. O mosaico Cassini/USGS nunca chegou ao runtime: e monocromatico e mostra emendas de mosaico visiveis na esfera.",
    candidateAsset: "titan_cassini_iss_global_mosaic_4km.jpg",
    primarySource: "USGS Astrogeology / Cassini ISS Team",
    license: "USGS use constraints: please cite authors",
    resolution: "4096x2048 -> 4040x2020",
    diskSize: "7.30 MiB -> 1.57 MiB",
    format: "PNG -> JPG",
    scientificFidelityNote:
      "O candidato externo e um mosaico oficial de Cassini ISS, com governanca muito melhor - mas e monocromatico e mostra a superficie atraves da janela de metano, nao a bruma laranja que se ve de fora.",
    regressionRisk:
      "Alto, medido em 2026-07-27: renderizado em esfera o mosaico fica cinza e com emendas de mosaico visiveis. A promocao de 2026-04-06 foi registrada mas nunca chegou ao runtime.",
    verdict: "manter como alternativa",
    recommendation:
      "Manter titan-mosaic-reference como referencia medida. Promover so depois de colorizacao e tratamento de emendas.",
    currentAssetIds: ["titan-map-active"],
    candidateAssetIds: ["titan-mosaic-reference"],
    comparison: {
      current: {
        label: "Runtime atual",
        mode: "sphere",
        mapAssetId: "titan-map-active",
        note: "2k_titan.jpg - o mapa que a escada de fato serve em todo perfil.",
      },
      candidate: {
        label: "Referencia medida",
        mode: "sphere",
        mapAssetId: "titan-mosaic-reference",
        note: "Mosaico oficial USGS/Cassini: monocromatico e com emendas visiveis, mantido como referencia e nao como runtime.",
      },
    },
  },
  {
    bodyId: "europa",
    bodyLabel: "Europa",
    currentRepoAsset: "4k_europa_gemini.png",
    runtimeAssetToday:
      "Esfera com 2k_europa.jpg (1264x632) em todo perfil e salience. O mosaico Voyager/Galileo nunca chegou ao runtime: e monocromatico e tem 68 linhas de no-data preto no polo sul.",
    candidateAsset: "europa_voyager_galileo_global_mosaic_500m.jpg",
    primarySource: "USGS Astrogeology / Voyager + Galileo SSI",
    license: "USGS use constraints: please cite authors",
    resolution: "2912x1440 -> 4096x2048",
    diskSize: "5.59 MiB -> 1.92 MiB",
    format: "PNG -> JPG",
    scientificFidelityNote:
      "O candidato externo ganha em proveniencia e resolucao, mas e monocromatico e as 68 ultimas linhas sao no-data preto solido.",
    regressionRisk:
      "Alto, medido em 2026-07-27: em esfera o no-data vira um buraco preto sobre a calota sul. A promocao de 2026-04-06 foi registrada mas nunca chegou ao runtime.",
    verdict: "manter como alternativa",
    recommendation:
      "Manter europa-mosaic-reference como referencia medida. Promover so depois de preencher o gore polar e dar um passe de cor - vale a pena, porque o runtime esta travado em 1264x632.",
    currentAssetIds: ["europa-map-active"],
    candidateAssetIds: ["europa-mosaic-reference"],
    comparison: {
      current: {
        label: "Runtime atual",
        mode: "sphere",
        mapAssetId: "europa-map-active",
        note: "2k_europa.jpg - o mapa que a escada de fato serve em todo perfil.",
      },
      candidate: {
        label: "Referencia medida",
        mode: "sphere",
        mapAssetId: "europa-mosaic-reference",
        note: "Mosaico oficial Voyager/Galileo: monocromatico e com no-data no polo sul, mantido como referencia e nao como runtime.",
      },
    },
  },
];

export const getAssetStudyRow = (bodyId: string) => {
  return ASSET_STUDY_MATRIX.find((row) => row.bodyId === bodyId) ?? null;
};

export const getAssetStudyEntries = (assetIds: string[]) => {
  return assetIds
    .map((assetId) => getVisualAssetById(assetId))
    .filter((entry): entry is VisualAssetManifestEntry => entry !== null);
};
