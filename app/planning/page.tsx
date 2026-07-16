import { redirect } from "next/navigation";

/** Planning moved into the Experiments hub's Board view - this route stays
 *  in place as a redirect so existing links/bookmarks still resolve. */
export default function PlanningRedirect() {
  redirect("/?view=board");
}
