import { useEffect, useState } from "react";
import {
  collectDeviceSignals,
  resolveQualityProfile,
  type QualityMode,
  type WindowLike,
} from "../lib/qualityProfile";

const getDefaultWindowLike = (): WindowLike | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window as unknown as WindowLike;
};

export const useQualityProfile = (
  mode: QualityMode = "auto",
  windowLike?: WindowLike
) => {
  const resolvedWindowLike = windowLike ?? getDefaultWindowLike();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (mode !== "auto" || !resolvedWindowLike?.addEventListener) {
      return;
    }

    const bumpRevision = () => {
      setRevision((current) => current + 1);
    };

    resolvedWindowLike.addEventListener("resize", bumpRevision);
    resolvedWindowLike.addEventListener("orientationchange", bumpRevision);

    return () => {
      resolvedWindowLike.removeEventListener?.("resize", bumpRevision);
      resolvedWindowLike.removeEventListener?.(
        "orientationchange",
        bumpRevision
      );
    };
  }, [mode, resolvedWindowLike]);

  void revision;

  return resolveQualityProfile(mode, collectDeviceSignals(resolvedWindowLike));
};
