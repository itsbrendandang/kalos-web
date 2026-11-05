"use client";

import { useEffect, useState } from "react";
import { profileSheet, type SheetProfile } from "@/components/campaign/data/profile";
import { readSheetRows } from "@/components/campaign/data/read-rows";

export type SheetProfileState =
  | { status: "loading" }
  | { status: "unreadable"; reason: "too-large" | "unreadable" }
  | { status: "ready"; profile: SheetProfile; sheetUsed: string | null };

/**
 * The profile of a held file, read in the browser. Each result is tagged with the file and sheet it came from,
 * so a slow read of an earlier file is never shown for the current one.
 */
export function useSheetProfile(file: File | null, sheet?: string): SheetProfileState | null {
  const [result, setResult] = useState<{ file: File; sheet?: string; state: SheetProfileState } | null>(null);
  useEffect(() => {
    if (!file) return;
    let live = true;
    readSheetRows(file, sheet).then((r) => {
      if (!live) return;
      const state: SheetProfileState = r.ok ? { status: "ready", profile: profileSheet(r.rows), sheetUsed: r.sheetUsed } : { status: "unreadable", reason: r.reason };
      setResult({ file, sheet, state });
    });
    return () => {
      live = false;
    };
  }, [file, sheet]);
  if (!file) return null;
  if (result && result.file === file && result.sheet === sheet) return result.state;
  return { status: "loading" };
}
