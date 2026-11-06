"use client";

import { Section } from "@/components/kit/section";
import { ModeBadge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { proposalRecipe, type PopulatedResult } from "@/lib/api";
import { formatNumber } from "@/lib/format";

/** The proposed recipes: one row per recipe, the inputs as the lab sets them, the predicted value and the kind of bet. Shown on Overview and inside the conversation. */
export function ProposedRecipes({ analysis, target, round, compact = false }: { analysis: PopulatedResult; target: string; round: number | null; /** Inside the conversation: a shorter description. */ compact?: boolean }) {
  const features = analysis.proposal_features;
  const n = analysis.proposals.length;
  return (
    <Section
      title={`Proposed recipes for ${round ? `round ${round}` : "the next round"}`}
      description={compact ? `${n} ${n === 1 ? "recipe" : "recipes"}, predicted by the model, not measured.` : `${n} ${n === 1 ? "recipe" : "recipes"}, predicted by the model, not measured. Best bet: the model expects a high value. New ground: a recipe the model is unsure about, run to learn from.`}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            {features.map((f) => (
              <TableHead key={f} numeric className="font-mono text-code">
                {f}
              </TableHead>
            ))}
            <TableHead numeric>Predicted {target}</TableHead>
            <TableHead>Kind of bet</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {analysis.proposals.map((p, i) => {
            const recipe = proposalRecipe(p, features);
            return (
              <TableRow key={i}>
                <TableCell className="text-fg-muted tabular-nums">{i + 1}</TableCell>
                {features.map((f) => (
                  <TableCell key={f} numeric className="tabular-nums">
                    {formatNumber(recipe[f])}
                  </TableCell>
                ))}
                <TableCell numeric className="font-medium text-fg tabular-nums">
                  {formatNumber(p.pred)}
                </TableCell>
                <TableCell>
                  <ModeBadge mode={p.mode} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Section>
  );
}
