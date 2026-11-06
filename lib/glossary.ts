// The core nouns, defined once, in the words of docs/PLAIN-WORDS.md ("One name for each thing"). The
// "What these words mean" line under the first heading of Home and Setup reads them in this order, and a
// <Term> shows one on hover wherever the word first appears. Tested in __tests__/glossary.test.ts.

export const GLOSSARY = {
  campaign: { word: "campaign", meaning: "one question about one target, worked on in rounds" },
  round: { word: "round", meaning: "one planning cycle: about five recipes run together, then their results recorded" },
  recipe: { word: "recipe", meaning: "the settings of one run, such as the medium composition or the temperature" },
  "run sheet": { word: "run sheet", meaning: "your spreadsheet of past runs, one run per row and one column per setting or result" },
  model: { word: "the model", meaning: "what Kalos learns from your runs, so it can predict a result for a recipe it has not seen" },
  raise: { word: "raise", meaning: "get more of the target, such as a higher titer; Kalos never aims to lower it" },
  run: { word: "run", meaning: "one go in the lab: one flask, one plate or one reactor, and one row of the sheet" },
  target: { word: "target", meaning: "the column Kalos aims to raise, such as Titer" },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;

/** The order of the one-line glossary. */
export const WORDS_LINE_ORDER: readonly GlossaryKey[] = ["campaign", "round", "recipe", "run sheet", "model", "raise"];

/** "A campaign is one question ..; a round is ..": the one line, as plain text, for tests and tooltips. */
export function wordsLine(keys: readonly GlossaryKey[] = WORDS_LINE_ORDER): string {
  return keys
    .map((k) => {
      const g = GLOSSARY[k];
      const article = k === "model" ? "" : k === "raise" ? "to " : /^[aeiou]/i.test(g.word) ? "an " : "a ";
      return `${article}${g.word} ${k === "raise" ? "means" : "is"} ${g.meaning}`;
    })
    .join("; ")
    .concat(".");
}
