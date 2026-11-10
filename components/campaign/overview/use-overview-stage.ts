"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  initialStageNav,
  integrateStageNav,
  parseStageParam,
  reduceStageNav,
  withStageParam,
  type OverviewStage,
  type StageEffect,
} from "@/lib/campaign-overview";

/**
 * URL and attention share integrateStageNav. A click is a separate reducer
 * event (push). Data refresh does not call select, so a pinned stage stays.
 */
export function useOverviewStage(active: boolean, campaignKey: string | null, attention: OverviewStage | null, settled: boolean) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const param = parseStageParam(searchParams.get("stage"));
  const navRef = useRef(initialStageNav);
  const [nav, setNav] = useState(initialStageNav);

  const write = useCallback(
    (effect: StageEffect) => {
      if (searchParams.get("stage") === effect.stage) return;
      const href = withStageParam(pathname, searchParams, effect.stage);
      if (effect.op === "push") router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const result = integrateStageNav(navRef.current, { active, campaignKey, param, attention, settled });
    if (result.state !== navRef.current) {
      navRef.current = result.state;
      setNav(result.state);
    }
    if (result.effect) write(result.effect);
  }, [active, attention, campaignKey, param, settled, write]);

  const select = useCallback(
    (stage: OverviewStage) => {
      const result = reduceStageNav(navRef.current, { type: "select", stage });
      if (result.state !== navRef.current) {
        navRef.current = result.state;
        setNav(result.state);
      }
      if (result.effect) write(result.effect);
    },
    [write],
  );

  return { stage: nav.stage, pinned: nav.pinned, select };
}
