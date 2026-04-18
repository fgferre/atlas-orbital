import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { useDeferredTexture } from "../../hooks/useDeferredTexture";
import { BODIES_BY_ID } from "../../data/celestialBodies";
import {
  ASSET_STUDY_MATRIX,
  getAssetStudyEntries,
  type AssetStudyMatrixRow,
  type AssetStudyRenderVariant,
} from "../../data/assetStudyMatrix";
import {
  getVisualAssetById,
  toPublicAssetUrl,
  type VisualAssetManifestEntry,
} from "../../data/assetManifest";
import { createProceduralSurfaceTexture } from "../../utils/proceduralSurface";
import {
  applyDepthSettings,
  cloneGlbSceneForRuntime,
  disposeObject3D,
  normalizeToUnitSphereScale,
  prepareObjMeshGeometry,
} from "../../lib/assetProcessing";

const formatBytes = (bytes: number) => {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${bytes} B`;
};

const getBody = (bodyId: string) => {
  const body = BODIES_BY_ID.get(bodyId);
  if (!body) {
    throw new Error(`Unknown body "${bodyId}" in asset study.`);
  }
  return body;
};

const useStudySurfaceTexture = (
  bodyId: string,
  mapAssetId?: string,
  useProceduralSurface = false
) => {
  const body = getBody(bodyId);
  const mapAsset = mapAssetId ? getVisualAssetById(mapAssetId) : null;
  const directTexture = useDeferredTexture(
    mapAsset ? toPublicAssetUrl(mapAsset.filePath) : null,
    {
      enabled: true,
      pin: true,
    }
  ).texture;

  const proceduralTexture = useMemo(() => {
    if (directTexture || !useProceduralSurface) {
      return null;
    }

    return createProceduralSurfaceTexture(body, 1024, 512);
  }, [body, directTexture, useProceduralSurface]);

  useEffect(() => {
    return () => {
      proceduralTexture?.dispose();
    };
  }, [proceduralTexture]);

  return directTexture ?? proceduralTexture ?? null;
};

const StudyGlbBody = ({
  bodyId,
  modelAssetId,
}: {
  bodyId: string;
  modelAssetId: string;
}) => {
  const body = getBody(bodyId);
  const modelAsset = getVisualAssetById(modelAssetId);

  if (!modelAsset) {
    throw new Error(`Unknown model asset "${modelAssetId}".`);
  }

  const { scene } = useGLTF(toPublicAssetUrl(modelAsset.filePath));

  const { cloned, normalizationScale } = useMemo(
    () =>
      cloneGlbSceneForRuntime(scene, (material, mesh) => {
        // Preserve pre-refactor behaviour: the old code only applied
        // overrides when `child.material` itself passed the instanceof
        // check (i.e. single-material meshes). Multi-material meshes
        // fell through untouched so the GLB's authored sub-materials
        // render as-imported. Today's shipped GLBs are single-material,
        // but skipping arrays here keeps the extract strictly render-
        // identical for any future multi-material study asset.
        if (Array.isArray(mesh.material)) return;
        if (
          material instanceof THREE.MeshStandardMaterial ||
          material instanceof THREE.MeshPhysicalMaterial
        ) {
          material.roughness = 0.9;
          material.metalness = 0.02;
          material.color ??= new THREE.Color(body.color);
        }
      }),
    [body.color, scene]
  );

  useEffect(() => {
    return () => {
      disposeObject3D(cloned);
    };
  }, [cloned]);

  return <primitive object={cloned} scale={normalizationScale} />;
};

const StudyObjBody = ({
  bodyId,
  modelAssetId,
  mapAssetId,
  useProceduralSurface,
}: {
  bodyId: string;
  modelAssetId: string;
  mapAssetId?: string;
  useProceduralSurface?: boolean;
}) => {
  const body = getBody(bodyId);
  const modelAsset = getVisualAssetById(modelAssetId);

  if (!modelAsset) {
    throw new Error(`Unknown model asset "${modelAssetId}".`);
  }

  const obj = useLoader(OBJLoader, toPublicAssetUrl(modelAsset.filePath));
  const surfaceTexture = useStudySurfaceTexture(
    bodyId,
    mapAssetId,
    useProceduralSurface
  );

  const { cloned, normalizationScale } = useMemo(() => {
    const clone = obj.clone();
    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry = prepareObjMeshGeometry(child.geometry);
      child.castShadow = true;
      child.receiveShadow = true;

      child.material = new THREE.MeshStandardMaterial({
        map: surfaceTexture ?? undefined,
        color: surfaceTexture ? "#ffffff" : body.color,
        roughness: 0.95,
        metalness: 0.01,
      });

      applyDepthSettings(child.material);
    });

    return {
      cloned: clone,
      normalizationScale: normalizeToUnitSphereScale(clone),
    };
  }, [body.color, obj, surfaceTexture]);

  useEffect(() => {
    return () => {
      disposeObject3D(cloned);
    };
  }, [cloned]);

  return <primitive object={cloned} scale={normalizationScale} />;
};

const StudySphereBody = ({
  bodyId,
  mapAssetId,
  useProceduralSurface,
}: {
  bodyId: string;
  mapAssetId?: string;
  useProceduralSurface?: boolean;
}) => {
  const body = getBody(bodyId);
  const surfaceTexture = useStudySurfaceTexture(
    bodyId,
    mapAssetId,
    useProceduralSurface
  );

  return (
    <mesh castShadow receiveShadow>
      <sphereGeometry args={[1, 64, 64]} />
      <meshStandardMaterial
        color={surfaceTexture ? "#ffffff" : body.color}
        map={surfaceTexture ?? undefined}
        roughness={0.95}
        metalness={0.01}
      />
    </mesh>
  );
};

const StudyBody = ({
  bodyId,
  variant,
}: {
  bodyId: string;
  variant: AssetStudyRenderVariant;
}) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!groupRef.current) {
      return;
    }

    groupRef.current.rotation.y += delta * 0.22;
  });

  const modelAsset =
    variant.modelAssetId != null
      ? getVisualAssetById(variant.modelAssetId)
      : null;

  return (
    <group ref={groupRef} rotation={[0.22, -0.65, 0]}>
      {variant.mode === "sphere" ? (
        <StudySphereBody
          bodyId={bodyId}
          mapAssetId={variant.mapAssetId}
          useProceduralSurface={variant.useProceduralSurface}
        />
      ) : modelAsset?.format === "glb" ? (
        <StudyGlbBody bodyId={bodyId} modelAssetId={variant.modelAssetId!} />
      ) : (
        <StudyObjBody
          bodyId={bodyId}
          modelAssetId={variant.modelAssetId!}
          mapAssetId={variant.mapAssetId}
          useProceduralSurface={variant.useProceduralSurface}
        />
      )}
    </group>
  );
};

const StudyViewport = ({
  bodyId,
  variant,
}: {
  bodyId: string;
  variant: AssetStudyRenderVariant;
}) => {
  return (
    <div className="h-72 rounded-xl border border-white/10 bg-[#08111d] overflow-hidden shadow-[0_18px_36px_rgba(0,0,0,0.35)]">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 4.6], fov: 34 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#08111d"]} />
        <ambientLight intensity={0.75} />
        <directionalLight position={[4, 3, 5]} intensity={1.35} castShadow />
        <directionalLight position={[-3, -2, 4]} intensity={0.38} />
        <Suspense fallback={null}>
          <StudyBody bodyId={bodyId} variant={variant} />
        </Suspense>
      </Canvas>
    </div>
  );
};

const AssetPreviewCard = ({ entry }: { entry: VisualAssetManifestEntry }) => {
  const isImage = entry.assetRole === "texture" && entry.resolution;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="border-b border-white/10 px-4 py-3 flex items-center justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/70">
            {entry.status}
          </div>
          <div className="text-sm font-semibold text-white">
            {entry.filePath.replace("public/", "")}
          </div>
        </div>
        <div className="text-right text-xs text-slate-400">
          <div>{entry.format.toUpperCase()}</div>
          <div>{formatBytes(entry.diskSizeBytes)}</div>
        </div>
      </div>

      {isImage ? (
        <img
          src={toPublicAssetUrl(entry.filePath)}
          alt={entry.sourceLabel}
          className="h-44 w-full object-cover bg-black/40"
          loading="lazy"
        />
      ) : (
        <div className="h-44 grid place-items-center bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),rgba(8,17,29,0.85))] text-slate-300 text-sm px-6 text-center">
          Sem texture flat aprovada. A comparacao visual depende da geometria e
          do material aplicado no viewport ao lado.
        </div>
      )}

      <div className="p-4 space-y-2 text-xs text-slate-300">
        <div>
          <span className="text-slate-500">Fonte:</span> {entry.sourceLabel}
        </div>
        <div>
          <span className="text-slate-500">Licenca:</span> {entry.license}
        </div>
        <div>
          <span className="text-slate-500">Resolucao:</span>{" "}
          {entry.resolution ?? "n/a"}
        </div>
        <div>
          <span className="text-slate-500">Atribuicao:</span>{" "}
          {entry.attributionRequired ? "obrigatoria" : "nao exigida"}
        </div>
        {entry.notes ? (
          <p className="text-slate-400 leading-relaxed">{entry.notes}</p>
        ) : null}
      </div>
    </div>
  );
};

const StudyPanel = ({
  bodyId,
  variant,
  assetIds,
}: {
  bodyId: string;
  variant: AssetStudyRenderVariant;
  assetIds: string[];
}) => {
  const entries = getAssetStudyEntries(assetIds);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{variant.label}</h3>
          <p className="text-sm leading-relaxed text-slate-300">
            {variant.note}
          </p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.05fr,0.95fr]">
        <div className="space-y-4">
          {entries.map((entry) => (
            <AssetPreviewCard key={entry.id} entry={entry} />
          ))}
        </div>
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-[0.18em] text-cyan-300/70">
            Applied Render
          </div>
          <StudyViewport bodyId={bodyId} variant={variant} />
        </div>
      </div>
    </section>
  );
};

const EmptyCandidatePanel = () => (
  <section className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 grid place-items-center min-h-72 text-center">
    <div className="max-w-sm space-y-2">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
        No Candidate Queued
      </div>
      <h3 className="text-lg font-semibold text-white">
        O baseline atual ja e a referencia
      </h3>
      <p className="text-sm leading-relaxed text-slate-300">
        Este corpo segue no estudo para comparacao de qualidade e proveniencia,
        mas nao tem replacement local promovivel nesta fase.
      </p>
    </div>
  </section>
);

const StudySummaryTable = ({ rows }: { rows: AssetStudyMatrixRow[] }) => {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03]">
      <table className="min-w-[1320px] w-full text-sm">
        <thead className="bg-white/[0.04] text-slate-300">
          <tr>
            {[
              "corpo",
              "asset atual no repo",
              "asset realmente usado no runtime",
              "asset candidato",
              "origem primaria",
              "licenca",
              "resolucao",
              "tamanho",
              "formato",
              "fidelidade cientifica",
              "risco de regressao",
              "veredito",
            ].map((label) => (
              <th
                key={label}
                className="px-4 py-3 text-left text-[11px] uppercase tracking-[0.16em] font-medium"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.bodyId}
              className="align-top border-t border-white/10 text-slate-200"
            >
              <td className="px-4 py-3 font-semibold text-white">
                {row.bodyLabel}
              </td>
              <td className="px-4 py-3">{row.currentRepoAsset}</td>
              <td className="px-4 py-3">{row.runtimeAssetToday}</td>
              <td className="px-4 py-3">{row.candidateAsset}</td>
              <td className="px-4 py-3">{row.primarySource}</td>
              <td className="px-4 py-3">{row.license}</td>
              <td className="px-4 py-3">{row.resolution}</td>
              <td className="px-4 py-3">{row.diskSize}</td>
              <td className="px-4 py-3">{row.format}</td>
              <td className="px-4 py-3">{row.scientificFidelityNote}</td>
              <td className="px-4 py-3">{row.regressionRisk}</td>
              <td className="px-4 py-3">
                <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-cyan-100">
                  {row.verdict}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const AssetStudyApp = () => {
  const rows = useMemo(() => {
    const params =
      typeof window === "undefined"
        ? new URLSearchParams()
        : new URLSearchParams(window.location.search);
    const bodyFilter = params.get("body");

    if (!bodyFilter) {
      return ASSET_STUDY_MATRIX;
    }

    const selectedIds = bodyFilter
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    return ASSET_STUDY_MATRIX.filter((row) => selectedIds.includes(row.bodyId));
  }, []);

  useEffect(() => {
    document.title = "Atlas Orbital - Asset Study";
  }, []);

  return (
    <main
      data-testid="asset-study-root"
      className="min-h-screen bg-[#050b13] text-white px-4 py-8 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="space-y-4">
          <div className="text-xs uppercase tracking-[0.25em] text-cyan-300/70">
            Atlas Orbital / Fase 6
          </div>
          <div className="space-y-3 max-w-4xl">
            <h1 className="text-3xl sm:text-4xl font-semibold">
              Asset Study Matrix + Controlled Visual Review
            </h1>
            <p className="text-slate-300 leading-relaxed">
              Esta superficie existe so para validacao reproduzivel via
              Playwright CLI. Ela compara baseline atual, candidatos locais e os
              metadados de proveniencia que sustentam a decisao final.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/70">
                Regra 1
              </div>
              <p className="mt-2 text-sm text-slate-300">
                Arquivo maior nao basta. A troca so avanca se houver ganho
                visivel e proveniencia igual ou melhor.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/70">
                Regra 2
              </div>
              <p className="mt-2 text-sm text-slate-300">
                `pallas` ganha shape oficial agora. `hygiea` ganha shape oficial
                agora, mas o mapa segue candidato ate vencer o baseline.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/70">
                Captura
              </div>
              <p className="mt-2 text-sm text-slate-300">
                Use `?study=asset-review` e opcionalmente `&body=pallas,hygiea`
                para capturas desktop/mobile sem interacao manual.
              </p>
            </div>
          </div>
        </header>

        <StudySummaryTable rows={rows} />

        <div className="space-y-10">
          {rows.map((row) => (
            <section
              key={row.bodyId}
              data-testid={`asset-study-${row.bodyId}`}
              className="space-y-5"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <h2 className="text-2xl font-semibold text-white">
                    {row.bodyLabel}
                  </h2>
                  <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-cyan-100">
                    {row.verdict}
                  </span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  {row.recommendation}
                </p>
              </div>

              {row.comparison ? (
                <div className="grid gap-5 2xl:grid-cols-2">
                  <StudyPanel
                    bodyId={row.bodyId}
                    variant={row.comparison.current}
                    assetIds={row.currentAssetIds}
                  />
                  {row.comparison.candidate ? (
                    <StudyPanel
                      bodyId={row.bodyId}
                      variant={row.comparison.candidate}
                      assetIds={row.candidateAssetIds}
                    />
                  ) : (
                    <EmptyCandidatePanel />
                  )}
                </div>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
};
