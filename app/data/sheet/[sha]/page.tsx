import { SheetPage } from "@/components/data/sheet-page";

// One stored run sheet, by the sha256 of its bytes (the key the engine stamps on its analysis). The rows live
// in the browser's IndexedDB, so the page is a client component and the server never sees them.
export default async function DataSheetPage({ params }: { params: Promise<{ sha: string }> }) {
  const { sha } = await params;
  return <SheetPage sha={sha} />;
}
