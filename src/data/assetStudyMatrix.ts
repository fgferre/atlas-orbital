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
    runtimeAssetToday: "Esfera com mapa atual de 7200x3600",
    candidateAsset: "jupiter_nasa_io_b_3d_resource.jpg",
    primarySource:
      "NASA Science 3D Resources no candidato; mapa atual segue sem fonte fechada no repo",
    license:
      "NASA media guidelines no candidato; atual sem licenca clara no repo",
    resolution: "7200x3600 -> 1440x720",
    diskSize: "7.60 MiB -> 632.9 KiB",
    format: "JPG",
    scientificFidelityNote:
      "O candidato oficial tem proveniencia muito melhor, mas perde bastante resolucao frente ao mapa atual.",
    regressionRisk:
      "Alto. O candidato oficial pode ficar visualmente mole demais apesar da boa governanca.",
    verdict: "manter",
    recommendation:
      "Decisao fechada: manter o mapa atual e guardar o oficial apenas como referencia de proveniencia.",
    currentAssetIds: ["jupiter-map-active"],
    candidateAssetIds: ["jupiter-map-candidate"],
    comparison: {
      current: {
        label: "Runtime atual",
        mode: "sphere",
        mapAssetId: "jupiter-map-active",
        note: "Mapa atual ativo em producao.",
      },
      candidate: {
        label: "Candidato documentado",
        mode: "sphere",
        mapAssetId: "jupiter-map-candidate",
        note: "Melhor candidato oficial encontrado na NASA 3D Resources durante a varredura externa.",
      },
    },
  },
  {
    bodyId: "uranus",
    bodyLabel: "Uranus",
    currentRepoAsset: "uranus_texture_map_8k_by_floridaemojicat_dj4s9vd.jpg",
    runtimeAssetToday: "Esfera com mapa comunitario de 8000x4336",
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
    runtimeAssetToday: "Esfera com mosaico oficial Cassini/USGS de 4040x2020",
    candidateAsset: "titan_cassini_iss_global_mosaic_4km.jpg",
    primarySource: "USGS Astrogeology / Cassini ISS Team",
    license: "USGS use constraints: please cite authors",
    resolution: "4096x2048 -> 4040x2020",
    diskSize: "7.30 MiB -> 1.57 MiB",
    format: "PNG -> JPG",
    scientificFidelityNote:
      "O candidato externo e um mosaico oficial de Cassini ISS, com qualidade observacional e governanca muito melhores que o mapa comunitario atual.",
    regressionRisk:
      "Medio. A atmosfera de Titan pode fazer o mosaico oficial parecer menos dramatico, apesar de ser cientificamente mais forte.",
    verdict: "substituir",
    recommendation:
      "Promovido: o mosaico oficial Cassini/USGS passa a ser o mapa ativo de Titan.",
    currentAssetIds: ["titan-map-fallback"],
    candidateAssetIds: ["titan-map-active"],
    comparison: {
      current: {
        label: "Baseline anterior",
        mode: "sphere",
        mapAssetId: "titan-map-fallback",
        note: "Mapa comunitario anterior, mantido apenas como fallback e referencia visual.",
      },
      candidate: {
        label: "Runtime promovido",
        mode: "sphere",
        mapAssetId: "titan-map-active",
        note: "Mosaico oficial da USGS/Cassini agora promovido para o runtime.",
      },
    },
  },
  {
    bodyId: "europa",
    bodyLabel: "Europa",
    currentRepoAsset: "4k_europa_gemini.png",
    runtimeAssetToday:
      "Esfera com mosaico oficial Voyager/Galileo de 4096x2048",
    candidateAsset: "europa_voyager_galileo_global_mosaic_500m.jpg",
    primarySource: "USGS Astrogeology / Voyager + Galileo SSI",
    license: "USGS use constraints: please cite authors",
    resolution: "2912x1440 -> 4096x2048",
    diskSize: "5.59 MiB -> 1.92 MiB",
    format: "PNG -> JPG",
    scientificFidelityNote:
      "O candidato externo ganha em proveniencia e tambem sobe a resolucao util para o runtime, vindo de um mosaico oficial Voyager/Galileo.",
    regressionRisk:
      "Baixo a medio. O maior risco e ajuste de contraste, nao falta de detalhe ou de fonte.",
    verdict: "substituir",
    recommendation:
      "Promovido: o mosaico oficial Voyager/Galileo passa a ser o mapa ativo de Europa.",
    currentAssetIds: ["europa-map-fallback"],
    candidateAssetIds: ["europa-map-active"],
    comparison: {
      current: {
        label: "Baseline anterior",
        mode: "sphere",
        mapAssetId: "europa-map-fallback",
        note: "Mapa anterior mantido apenas como fallback e referencia visual.",
      },
      candidate: {
        label: "Runtime promovido",
        mode: "sphere",
        mapAssetId: "europa-map-active",
        note: "Mosaico oficial Voyager/Galileo agora promovido para o runtime.",
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
