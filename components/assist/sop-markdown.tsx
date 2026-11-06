import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parseMarkdown, placeholderLabel, type Block, type Inline } from "@/lib/sop";
import { cn } from "@/lib/utils";

/**
 * The rendered draft. Each [[TO FILL: name]] placeholder is a visible mark
 * with the placeholder's plain name, so a reader sees at once what the lab
 * still has to fill in. Nothing in the markdown is read as HTML.
 */
export function SopMarkdown({ markdown, className }: { markdown: string; className?: string }) {
  const blocks = parseMarkdown(markdown);
  return (
    <div className={cn("flex flex-col gap-4 text-body text-fg", className)}>
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "heading": {
      const cls = block.level === 1 ? "text-title" : block.level === 2 ? "text-heading" : "text-label";
      return block.level === 1 ? <h2 className={cls}>{inline(block.inline)}</h2> : block.level === 2 ? <h3 className={cls}>{inline(block.inline)}</h3> : <h4 className={cls}>{inline(block.inline)}</h4>;
    }
    case "paragraph":
      return <p>{inline(block.inline)}</p>;
    case "quote":
      return <p className="text-fg-muted">{inline(block.inline)}</p>;
    case "list":
      return block.ordered ? (
        <ol className="flex list-decimal flex-col gap-1.5 pl-6">
          {block.items.map((it, i) => (
            <li key={i}>{inline(it)}</li>
          ))}
        </ol>
      ) : (
        <ul className="flex list-disc flex-col gap-1.5 pl-6">
          {block.items.map((it, i) => (
            <li key={i}>{inline(it)}</li>
          ))}
        </ul>
      );
    case "table":
      return (
        <Table>
          <TableHeader>
            <TableRow>
              {block.header.map((c, i) => (
                <TableHead key={i}>{inline(c)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {block.rows.map((r, i) => (
              <TableRow key={i}>
                {r.map((c, j) => (
                  <TableCell key={j}>{inline(c)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
  }
}

function inline(parts: Inline[]) {
  return parts.map((p, i) => {
    switch (p.kind) {
      case "bold":
        return <strong key={i}>{p.text}</strong>;
      case "code":
        return (
          <span key={i} className="font-mono text-code">
            {p.text}
          </span>
        );
      case "placeholder":
        return (
          <mark key={i} data-placeholder={p.name} className="rounded-lg bg-warn-soft px-1.5 py-0.5 text-label text-fg">
            {placeholderLabel(p.name)}
          </mark>
        );
      default:
        return p.text;
    }
  });
}
