import { redirect } from "next/navigation";

/** Experiments moved into the Experiments hub's Table view - this route
 *  stays in place as a redirect so existing links/bookmarks still resolve. */
export default function ExperimentsRedirect() {
  redirect("/?view=table");
}
