import { useEffect, useState } from "react";

const getMatches = (query: string) => {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }

  return window.matchMedia(query).matches;
};

export const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(() => getMatches(query));

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const mediaQueryList = window.matchMedia(query);
    const updateMatches = () => setMatches(mediaQueryList.matches);

    updateMatches();
    mediaQueryList.addEventListener("change", updateMatches);

    return () => mediaQueryList.removeEventListener("change", updateMatches);
  }, [query]);

  return matches;
};
