import { useEffect, useState } from "react";
import {
  getStarfieldLoadErrorMessage,
  type StarfieldSource,
} from "../../lib/starfield";
import { useStore } from "../../store";

interface UseStarfieldCatalogOptions<T> {
  source: StarfieldSource;
  loadCatalog: () => Promise<T>;
  getCachedCatalog: () => T | null;
}

export const useStarfieldCatalog = <T>({
  source,
  loadCatalog,
  getCachedCatalog,
}: UseStarfieldCatalogOptions<T>) => {
  const setStarfieldProviderState = useStore(
    (state) => state.setStarfieldProviderState
  );
  const [catalog, setCatalog] = useState<T | null>(() => getCachedCatalog());

  useEffect(() => {
    const cachedCatalog = getCachedCatalog();

    if (cachedCatalog) {
      // Snap to the cached value too: when the hook's load/cache
      // identity changes (e.g. tier switch for HYG), we want the new
      // catalog to replace the one currently rendered even if the new
      // slice is already in memory. The hook is acting as a subscription
      // to an external cache whose identity changes with the loader, so
      // reconciling our local `catalog` state with it inside the effect
      // is the correct pattern here (cf. React docs on syncing with
      // external systems — this is not derived-from-props).
      // eslint-disable-next-line react-hooks/set-state-in-effect -- external cache sync
      setCatalog(cachedCatalog);
      setStarfieldProviderState(source, { status: "ready", error: null });
      return;
    }

    let cancelled = false;
    setStarfieldProviderState(source, { status: "loading", error: null });

    loadCatalog()
      .then((loadedCatalog) => {
        if (cancelled) {
          return;
        }

        setCatalog(loadedCatalog);
        setStarfieldProviderState(source, { status: "ready", error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setCatalog(null);
        setStarfieldProviderState(source, {
          status: "error",
          error: getStarfieldLoadErrorMessage(source, error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [getCachedCatalog, loadCatalog, setStarfieldProviderState, source]);

  return catalog;
};
