import { redirect } from "next/navigation";

/** The home route is the Scale-up readout: the one scale-up story the engine
 *  backs with the user's own multi-scale data. A server-side redirect (not a
 *  client-side push) so `/` never flashes an empty shell first. */
export default function HomeRedirect() {
  redirect("/scale-readout");
}
