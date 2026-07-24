import * as THREE from "three";
import { BODIES_BY_ID } from "../../data/celestialBodies";

export const SMART_SUN_LIGHT_LAYER = 1;

type LayerListenerPair = {
  childAdded: (event: { child: THREE.Object3D }) => void;
  childRemoved: (event: { child: THREE.Object3D }) => void;
};

/**
 * Applies the focused-body light layer once, then keeps it correct when
 * Suspense or a loader adds/removes descendants later. This replaces the old
 * full subtree traversal on every animation frame.
 */
export const bindSmartSunLayer = (
  root: THREE.Object3D,
  bodyId: string
): (() => void) => {
  const listeners = new Map<THREE.Object3D, LayerListenerPair>();

  const detachSubtree = (object: THREE.Object3D, disableLayer: boolean) => {
    for (const child of [...object.children]) {
      detachSubtree(child, disableLayer);
    }

    const pair = listeners.get(object);
    if (pair) {
      object.removeEventListener("childadded", pair.childAdded);
      object.removeEventListener("childremoved", pair.childRemoved);
      listeners.delete(object);
    }

    if (disableLayer) {
      object.layers.disable(SMART_SUN_LIGHT_LAYER);
    }
  };

  const attachSubtree = (
    object: THREE.Object3D,
    parentEnabled: boolean,
    isRoot = false
  ) => {
    const isNestedBody =
      !isRoot && object.name !== bodyId && BODIES_BY_ID.has(object.name);
    const enabled = parentEnabled && !isNestedBody;

    if (enabled) {
      object.layers.enable(SMART_SUN_LIGHT_LAYER);
    } else {
      object.layers.disable(SMART_SUN_LIGHT_LAYER);
    }

    if (!listeners.has(object)) {
      const pair: LayerListenerPair = {
        childAdded: ({ child }) => {
          attachSubtree(child, enabled);
        },
        childRemoved: ({ child }) => {
          detachSubtree(child, true);
        },
      };
      listeners.set(object, pair);
      object.addEventListener("childadded", pair.childAdded);
      object.addEventListener("childremoved", pair.childRemoved);
    }

    for (const child of object.children) {
      attachSubtree(child, enabled);
    }
  };

  attachSubtree(root, true, true);

  return () => {
    detachSubtree(root, true);
  };
};
