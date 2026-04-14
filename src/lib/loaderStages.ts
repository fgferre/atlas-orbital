import {
  STARFIELD_SOURCE_LABELS,
  type StarfieldLoadStatus,
  type StarfieldSource,
} from "./starfield";

export type LoaderStageId = "boot" | "assets" | "render" | "ready";
export type LoaderStageState = "pending" | "active" | "complete";
export type LoaderMetricTone = "neutral" | "positive" | "warning";

export interface LoaderStageViewModel {
  id: LoaderStageId;
  label: string;
  description: string;
  state: LoaderStageState;
}

export interface LoaderMetricViewModel {
  id: "assets" | "catalog" | "render";
  label: string;
  value: string;
  tone: LoaderMetricTone;
}

export interface LoaderSnapshot {
  currentStageId: LoaderStageId;
  title: string;
  detail: string;
  progressValue: number;
  stages: LoaderStageViewModel[];
  metrics: LoaderMetricViewModel[];
}

export interface ResolveLoaderSnapshotInput {
  progress: number;
  active: boolean;
  isSceneReady: boolean;
  showStarfield: boolean;
  starfieldSource: StarfieldSource;
  starfieldStatus: StarfieldLoadStatus | undefined;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const resolveCatalogMetric = ({
  showStarfield,
  starfieldSource,
  starfieldStatus,
}: Pick<
  ResolveLoaderSnapshotInput,
  "showStarfield" | "starfieldSource" | "starfieldStatus"
>): LoaderMetricViewModel => {
  const label = "Star catalog";

  if (!showStarfield) {
    return {
      id: "catalog",
      label,
      value: "disabled",
      tone: "neutral",
    };
  }

  const sourceLabel = STARFIELD_SOURCE_LABELS[starfieldSource];

  if (starfieldStatus === "ready") {
    return {
      id: "catalog",
      label,
      value: `${sourceLabel} ready`,
      tone: "positive",
    };
  }

  if (starfieldStatus === "loading") {
    return {
      id: "catalog",
      label,
      value: `downloading ${sourceLabel}`,
      tone: "neutral",
    };
  }

  if (starfieldStatus === "error") {
    return {
      id: "catalog",
      label,
      value: `${sourceLabel} unavailable`,
      tone: "warning",
    };
  }

  return {
    id: "catalog",
    label,
    value: `waiting for ${sourceLabel}`,
    tone: "neutral",
  };
};

const resolveCurrentStageId = ({
  progress,
  active,
  isSceneReady,
}: Pick<
  ResolveLoaderSnapshotInput,
  "progress" | "active" | "isSceneReady"
>) => {
  if (isSceneReady) {
    return "ready" satisfies LoaderStageId;
  }

  if (!active && progress <= 0) {
    return "boot" satisfies LoaderStageId;
  }

  if (active) {
    return "assets" satisfies LoaderStageId;
  }

  return "render" satisfies LoaderStageId;
};

const resolveProgressValue = (stageId: LoaderStageId, rawProgress: number) => {
  const progress = clamp(rawProgress, 0, 100);

  if (stageId === "boot") {
    return 8;
  }

  if (stageId === "assets") {
    return clamp(18 + progress * 0.64, 18, 82);
  }

  if (stageId === "render") {
    return clamp(Math.max(88, progress), 88, 96);
  }

  return 100;
};

const buildStages = (currentStageId: LoaderStageId): LoaderStageViewModel[] => {
  const stageOrder: Array<{
    id: LoaderStageId;
    label: string;
    description: string;
  }> = [
    {
      id: "boot",
      label: "Interface",
      description: "Mounting the initial application shell.",
    },
    {
      id: "assets",
      label: "Base scene",
      description: "Loading critical geometry, shaders, and textures.",
    },
    {
      id: "render",
      label: "Warm-up",
      description: "Validating canvas, camera, and first rendered frames.",
    },
    {
      id: "ready",
      label: "Handoff",
      description: "Handing off control to the orbital view.",
    },
  ];

  const currentIndex = stageOrder.findIndex(
    (stage) => stage.id === currentStageId
  );

  return stageOrder.map((stage, index) => {
    const state: LoaderStageState =
      index < currentIndex
        ? "complete"
        : index === currentIndex
          ? "active"
          : "pending";

    return {
      ...stage,
      state,
    };
  });
};

export const resolveLoaderSnapshot = (
  input: ResolveLoaderSnapshotInput
): LoaderSnapshot => {
  const currentStageId = resolveCurrentStageId(input);
  const progressValue = resolveProgressValue(currentStageId, input.progress);

  let title = "Preparing application shell";
  let detail =
    "Downloading the initial bundle and mounting the boot interface.";

  if (currentStageId === "assets") {
    title = "Loading base scene";
    detail =
      "Streaming models, shaders, and critical textures for the first frame.";
  } else if (currentStageId === "render") {
    title = "Warming up renderer";
    detail =
      "Waiting for the canvas to stabilize and confirm the first interactive frames.";
  } else if (currentStageId === "ready") {
    title = "Experience ready";
    detail = "Entering the scene and handing off to orbital navigation.";
  }

  const metrics: LoaderMetricViewModel[] = [
    {
      id: "assets",
      label: "Asset pipeline",
      value:
        currentStageId === "boot"
          ? "waiting"
          : input.active
            ? `${clamp(input.progress, 0, 100).toFixed(0)}%`
            : "ready",
      tone:
        currentStageId === "boot"
          ? "neutral"
          : input.active
            ? "neutral"
            : "positive",
    },
    resolveCatalogMetric(input),
    {
      id: "render",
      label: "Renderer",
      value:
        currentStageId === "ready"
          ? "online"
          : currentStageId === "render"
            ? "warming up"
            : "waiting",
      tone: currentStageId === "ready" ? "positive" : "neutral",
    },
  ];

  return {
    currentStageId,
    title,
    detail,
    progressValue,
    stages: buildStages(currentStageId),
    metrics,
  };
};
