import type { ReactNode } from "react";
import { routeMetadata } from "@/lib/route-metadata";

export const metadata = routeMetadata("/campaign/run");

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
