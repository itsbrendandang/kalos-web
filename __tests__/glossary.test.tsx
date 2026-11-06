// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Term, WordsLine } from "@/components/kit/term";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GLOSSARY, WORDS_LINE_ORDER, wordsLine } from "@/lib/glossary";

afterEach(cleanup);

/*
 * First-time study, F9: campaign, round, recipe, run sheet, model and raise are defined once, in one line
 * under the first heading of Home and Setup, and on hover wherever a <Term> wraps the word.
 */

describe("the glossary", () => {
  it("defines the six core nouns, in plain words, in this order", () => {
    expect(WORDS_LINE_ORDER).toEqual(["campaign", "round", "recipe", "run sheet", "model", "raise"]);
    for (const k of WORDS_LINE_ORDER) expect(GLOSSARY[k].meaning).toMatch(/^[a-z]/);
    expect(wordsLine()).toBe(
      "a campaign is one question about one target, worked on in rounds; a round is one planning cycle: about five recipes run together, then their results recorded; a recipe is the settings of one run, such as the medium composition or the temperature; a run sheet is your spreadsheet of past runs, one run per row and one column per setting or result; the model is what Kalos learns from your runs, so it can predict a result for a recipe it has not seen; to raise means get more of the target, such as a higher titer; Kalos never aims to lower it.",
    );
  });
  it("never uses a statistics or software word", () => {
    const all = Object.values(GLOSSARY).map((g) => g.meaning).join(" ");
    expect(all).not.toMatch(/surrogate|optimi[sz]|engine|objective|feature|parameter|experiment|batch|iteration/i);
  });
});

describe("WordsLine and Term", () => {
  it("renders the line once with every word carrying its definition as a title", () => {
    render(
      <TooltipProvider>
        <WordsLine />
      </TooltipProvider>,
    );
    const line = screen.getByText(/What these words mean\./).closest("p")!;
    expect(line.textContent).toContain("A campaign is one question about one target, worked on in rounds; a round is");
    expect(line.textContent).toContain("to raise means get more of the target");
    const campaign = screen.getByText("campaign", { selector: "span[title]" });
    expect(campaign.getAttribute("title")).toBe("campaign: one question about one target, worked on in rounds.");
  });
  it("a Term keeps the sentence's own word and attaches the meaning", () => {
    render(
      <TooltipProvider>
        <p>
          Proposed <Term word="recipe">recipes</Term> for <Term word="round">round</Term> 1
        </p>
      </TooltipProvider>,
    );
    expect(screen.getByText("recipes").getAttribute("title")).toBe("recipe: the settings of one run, such as the medium composition or the temperature.");
    expect(screen.getByText("round").getAttribute("title")).toMatch(/^round: one planning cycle/);
  });
});
