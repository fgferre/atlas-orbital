/**
 * Tile-pyramid planning math for view-dependent texture streaming.
 *
 * This is the sizing model behind `tasks/waves/tiled-streaming-2026-07-28.md`.
 * It is deliberately pure and GPU-free: the whole point of the design is that
 * its memory behaviour can be proven with arithmetic and unit tests, on a CI
 * box with no GPU, *before* anyone rewrites the planet renderer.
 *
 * ## The model
 *
 * Same shape as a slippy map (Google Maps, OSM), applied to an equirectangular
 * planet map instead of a Mercator world:
 *
 *   level 0 = 2x1 tiles          (512x256 texels of effective map)
 *   level L = 2^(L+1) x 2^L      (2^(L+1)*TILE x 2^L*TILE texels)
 *
 * A body is drawn from whichever level makes one texel land on roughly one
 * screen pixel, and only the tiles the camera can actually see are resident.
 *
 * ## Why this bounds memory, which the current loader does not
 *
 * Today a focused body loads one monolithic equirectangular image per channel,
 * so its cost is set by the file, not by the view: Earth at ultra is
 * 5 x 8192x4096 = 853 MB whether it fills the viewport or covers 200 pixels.
 *
 * Under a pyramid, zooming in raises the level but shrinks the visible surface
 * by the same factor. The two cancel, so resident bytes approach a constant set
 * by the *viewport*, not by the zoom. That is the property to hold onto —
 * `estimateResidentTiles` encodes it and `texturePyramid.test.ts` pins it.
 */

/** Tile edge in texels. 256 matches the slippy-map convention. */
export const TILE_PX = 256;

/** RGBA8 plus a full mip chain. Matches `deferredTextureCache.ts`. */
const BYTES_PER_TEXEL = 4;
const MIPMAP_FACTOR = 4 / 3;

/**
 * Levels kept resident for the whole globe regardless of view, so there is
 * always something to draw while finer tiles stream in — the blurry-then-sharp
 * behaviour a slippy map has. Levels 0-2 are 42 tiles, ~14 MB, whole globe.
 */
export const BASE_RESIDENT_LEVEL = 2;

export const tileGridForLevel = (level: number) => ({
  columns: 2 ** (level + 1),
  rows: 2 ** level,
});

export const tileCountForLevel = (level: number) => {
  const { columns, rows } = tileGridForLevel(level);
  return columns * rows;
};

/** Effective equirectangular resolution a level is equivalent to. */
export const levelResolution = (level: number) => {
  const { columns, rows } = tileGridForLevel(level);
  return { width: columns * TILE_PX, height: rows * TILE_PX };
};

/**
 * The level whose texel density is closest to one texel per screen pixel for a
 * sphere of `projectedRadiusPx`.
 *
 * A sphere of screen radius r shows one hemisphere, so its horizontal extent
 * spans pi radians of longitude across 2r pixels. A map W texels wide spans
 * 2pi, so the visible half contributes W/2 texels across those 2r pixels:
 *
 *   texels per pixel = (W / 2) / (2r) = W / (4r)
 *
 * Setting that to 1 gives W = 4r, and with W = 2^(L+1) * TILE_PX:
 *
 *   L = log2(4r / TILE_PX) - 1
 *
 * Sanity: r=128px -> L0 (512x256), r=1024px -> L3 (4096x2048),
 * r=2048px -> L4 (8192x4096). Those are the tiers the app ships today, which
 * is the cross-check that the formula is not inventing a scale.
 */
export const selectTileLevel = (
  projectedRadiusPx: number,
  maxLevel: number
): number => {
  if (!Number.isFinite(projectedRadiusPx) || projectedRadiusPx <= 0) return 0;
  const ideal = Math.log2((4 * projectedRadiusPx) / TILE_PX) - 1;
  return Math.max(0, Math.min(maxLevel, Math.round(ideal)));
};

/**
 * Tiles that must be resident to draw one body at one view.
 *
 * Two regimes, and the honest answer is the smaller of them:
 *
 *  - **Coverage bound.** Once a tile is ~TILE_PX pixels on screen, the visible
 *    surface needs about `viewportArea / TILE_PX^2` of them. This is flat in
 *    level, which is the property that makes zoom free.
 *  - **Hemisphere bound.** A level cannot need more tiles than the visible
 *    hemisphere holds: half the grid, `tileCountForLevel(level) / 2`. This is
 *    what dominates while the body is small and the whole disc is on screen.
 *
 * `2` accounts for a partially-visible tile ring around the horizon.
 */
export const estimateResidentTiles = (params: {
  viewportWidthPx: number;
  viewportHeightPx: number;
  projectedRadiusPx: number;
  level: number;
}) => {
  const { viewportWidthPx, viewportHeightPx, projectedRadiusPx, level } =
    params;

  // The body only covers a disc of the viewport, never more.
  const discAreaPx = Math.PI * projectedRadiusPx ** 2;
  const visibleAreaPx = Math.min(
    discAreaPx,
    viewportWidthPx * viewportHeightPx
  );

  const coverageBound = Math.ceil(visibleAreaPx / TILE_PX ** 2) + 2;
  const hemisphereBound = Math.ceil(tileCountForLevel(level) / 2);

  const leafTiles = Math.max(1, Math.min(coverageBound, hemisphereBound));

  // Ancestors kept for the always-there base, deduplicated against the leaves.
  let baseTiles = 0;
  for (let l = 0; l <= Math.min(BASE_RESIDENT_LEVEL, level); l += 1) {
    baseTiles += tileCountForLevel(l);
  }

  return { leafTiles, baseTiles, totalTiles: leafTiles + baseTiles };
};

export const tileBytes = (tiles: number) =>
  Math.ceil(tiles * TILE_PX ** 2 * BYTES_PER_TEXEL * MIPMAP_FACTOR);

/**
 * Bytes one monolithic equirectangular image costs decoded — what the app does
 * today. Kept here so the comparison in the tests is apples to apples.
 */
export const monolithicBytes = (width: number, height: number) =>
  Math.ceil(width * height * BYTES_PER_TEXEL * MIPMAP_FACTOR);

/**
 * Only the albedo map earns a pyramid.
 *
 * Tiling all of Earth's five channels at the map's level costs ~285 MB and
 * multiplies the streaming bookkeeping by five for no visible gain: night
 * lights, clouds, normal and roughness are low-frequency next to surface
 * albedo, and the eye cannot resolve a 1:1 texel in any of them. They stay as
 * one modest monolithic texture each, which also keeps the existing material
 * stack — eclipse, ring shadow, cloud terminator — reading a single sampler
 * per channel instead of an atlas.
 *
 * So the architecture is: **tile the map, cap the rest.**
 */
export const SECONDARY_CHANNEL_RESOLUTION = { width: 2048, height: 1024 };

/**
 * Total decoded bytes for one body at one view: a streamed pyramid for the
 * albedo map plus `secondaryChannelCount` fixed 2k textures.
 */
export const estimateBodyBytes = (params: {
  viewportWidthPx: number;
  viewportHeightPx: number;
  projectedRadiusPx: number;
  maxLevel: number;
  secondaryChannelCount: number;
}) => {
  const level = selectTileLevel(params.projectedRadiusPx, params.maxLevel);
  const { totalTiles } = estimateResidentTiles({ ...params, level });

  const mapBytes = tileBytes(totalTiles);
  const secondaryBytes =
    params.secondaryChannelCount *
    monolithicBytes(
      SECONDARY_CHANNEL_RESOLUTION.width,
      SECONDARY_CHANNEL_RESOLUTION.height
    );

  return {
    level,
    totalTiles,
    mapBytes,
    secondaryBytes,
    totalBytes: mapBytes + secondaryBytes,
  };
};
