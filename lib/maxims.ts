/**
 * The Delphic maxims carved at the temple of Apollo, each tied to a place in the
 * app. Shown as one quiet line at the foot of a page. Decorative: never the only
 * place anything important is said.
 */
export type Maxim = { greek: string; english: string; note: string };

const KNOW: Maxim = { greek: "Γνῶθι σεαυτόν", english: "Know thyself", note: "Start from what your own runs actually say." };
const EXCESS: Maxim = { greek: "Μηδὲν ἄγαν", english: "Nothing in excess", note: "Some runs for the best bet, some for new ground." };
const MEASURE: Maxim = { greek: "Μέτρον ἄριστον", english: "Measure is best", note: "Record what the lab measured, not what was hoped." };
const SEE: Maxim = { greek: "Ὅρα τέλος μακροῦ βίου", english: "Look to the end of a long life", note: "Judge a run by its result." };
const TIME: Maxim = { greek: "Γνῶθι καιρόν", english: "Know the right moment", note: "Run the next round when the last one has taught you something." };

const BY_ROUTE: [prefix: string, maxim: Maxim][] = [
  ["/campaign/setup", KNOW],
  ["/campaign/plan", EXCESS],
  ["/campaign/run", TIME],
  ["/agent", TIME],
  ["/campaign/record", MEASURE],
  ["/campaign/learn", SEE],
  ["/library", MEASURE],
  ["/data", KNOW],
];

export function maximFor(pathname: string): Maxim {
  return BY_ROUTE.find(([p]) => pathname.startsWith(p))?.[1] ?? KNOW;
}
