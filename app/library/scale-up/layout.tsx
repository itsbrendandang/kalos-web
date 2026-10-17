import type { ReactNode } from "react";
import { routeMetadata } from "@/lib/route-metadata";

export const metadata = routeMetadata("/library/scale-up");

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
