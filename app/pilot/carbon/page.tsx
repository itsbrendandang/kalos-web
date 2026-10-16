import type { Metadata } from "next";
import { PilotClient } from "./pilot-client";
import { mockSurface } from "@/lib/pilot/mock-surface";

export const metadata: Metadata = { title: "Carbon pilot · Kalos" };

export default function CarbonPilotPage() {
  return <PilotClient surface={mockSurface()} />;
}
