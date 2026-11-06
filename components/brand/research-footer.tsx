/** The one line at the foot of every page: what a suggestion is. Said once per page, here and nowhere else. */
export const RESEARCH_LINE = "Suggestions are ideas to test in the lab, not settings.";

export function ResearchFooter() {
  return (
    <footer className="mt-16 pb-2 text-center">
      <p className="text-caption text-fg-muted">Research use only. {RESEARCH_LINE}</p>
    </footer>
  );
}
