import type { ReactNode } from "react";
import { NextStepLine } from "@/components/assist/next-step-card";
import { StageBar } from "@/components/campaign/stage-bar";

export default function CampaignLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <StageBar />
      {children}
      <NextStepLine />
    </>
  );
}
