import { redirect } from "next/navigation";

/** The app root is the campaign workspace.
 *
 *  `/` used to be the Experiments hub (Live / Board / Table) and was kept as
 *  the landing surface only because nothing else in the app linked to it. Two
 *  of those three views (Live, Board) rendered `lib/mock/*` boards with no
 *  engine behind them and have been retired; the Table view moved back out to
 *  its own `/experiments` route. With the hub gone there is nothing left at
 *  `/` to land on, and the workspace is the surface the whole product is now
 *  organised around, so `/` resolves there.
 *
 *  It redirects to `/c` rather than a specific campaign because only the
 *  engine knows which campaign is current - `/c` resolves that (and renders a
 *  real "no campaigns yet" state when there is none), so this stays a pure
 *  routing hop with no data fetching of its own. */
export default function RootPage() {
  redirect("/c");
}
