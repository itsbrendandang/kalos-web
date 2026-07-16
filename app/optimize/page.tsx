import { redirect } from "next/navigation";

/** Optimize folded into Results' "Recommended actions" section - this route
 *  stays in place as a redirect so existing links/bookmarks still resolve. */
export default function OptimizeRedirect() {
  redirect("/results#next-experiments");
}
