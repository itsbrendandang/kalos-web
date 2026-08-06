"use client";

// Camera for the graph canvas: wheel zoom, drag pan, and a full keyboard
// equivalent for both. None of it touches the layout - the simulation stays
// frozen (see lib/workspace/graph/simulation.ts) and this only changes the
// transform on the wrapping <g>, so panning can never reflow the graph.
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";

export type Viewport = { k: number; x: number; y: number };

const SCALE_EXTENT: [number, number] = [0.45, 4];
const PAN_STEP = 48;
/** Shift accelerates panning, per the interaction spec. */
const PAN_FAST = 4;
const KEY_ZOOM_STEP = 1.25;

export function useGraphViewport(ref: RefObject<SVGSVGElement | null>): Viewport & { reset: () => void } {
  const [viewport, setViewport] = useState<Viewport>({ k: 1, x: 0, y: 0 });
  const behaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const behavior = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent(SCALE_EXTENT)
      .on("zoom", (event: { transform: ZoomTransform }) => {
        const t = event.transform;
        setViewport({ k: t.k, x: t.x, y: t.y });
      });
    behaviorRef.current = behavior;

    const selection = select(el);
    selection.call(behavior);
    // d3-zoom's own dblclick handler would fight the canvas's click-to-select.
    selection.on("dblclick.zoom", null);

    return () => {
      selection.on(".zoom", null);
      behaviorRef.current = null;
    };
  }, [ref]);

  const apply = useCallback(
    (fn: (sel: ReturnType<typeof select<SVGSVGElement, unknown>>, behavior: ZoomBehavior<SVGSVGElement, unknown>) => void) => {
      const el = ref.current;
      const behavior = behaviorRef.current;
      if (!el || !behavior) return;
      fn(select(el), behavior);
    },
    [ref],
  );

  const reset = useCallback(() => {
    apply((sel, behavior) => {
      behavior.transform(sel, zoomIdentity);
    });
  }, [apply]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function onKeyDown(event: KeyboardEvent) {
      const step = event.shiftKey ? PAN_STEP * PAN_FAST : PAN_STEP;
      const pan: Record<string, [number, number]> = {
        ArrowLeft: [step, 0],
        ArrowRight: [-step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
      };
      const delta = pan[event.key];
      const zoomIn = event.key === "+" || event.key === "=";
      const zoomOut = event.key === "-" || event.key === "_";
      const isReset = event.key === "0";
      if (!delta && !zoomIn && !zoomOut && !isReset) return;
      event.preventDefault();

      apply((sel, behavior) => {
        // Applied instantly, with no d3 transition. That is not a shortcut:
        // it means the camera never animates, so `prefers-reduced-motion` is
        // satisfied by construction rather than by a branch that could rot.
        if (delta) behavior.translateBy(sel, delta[0], delta[1]);
        else if (isReset) behavior.transform(sel, zoomIdentity);
        else behavior.scaleBy(sel, zoomIn ? KEY_ZOOM_STEP : 1 / KEY_ZOOM_STEP);
      });
    }

    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [ref, apply]);

  return { ...viewport, reset };
}
