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
