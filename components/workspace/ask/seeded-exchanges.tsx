/** The two seeded exchanges from design spec section 1.4.
 *
 *  This is DEMO CONTENT, and it is the only content in this panel that looks
 *  like an answer. The kalos engine has no answering endpoint and no indexed
 *  SOP corpus, so nothing here was produced by anything - it is the design
 *  mock, transcribed, illustrating a capability that does not exist yet. It
 *  renders only behind NEXT_PUBLIC_DEMO_MODE (see lib/demo.ts), under the same
 *  visible DemoBadge the rest of the workspace uses for seeded data, and the
 *  caption above it says in words that these are not answers about the
 *  reader's campaign.
 *
 *  Copy is transcribed verbatim from the spec, including its em dash and en
 *  dash - altering shipped design copy would misrepresent it. */
import { DemoBadge } from "@/components/page-header";
import {
  Answer,
  ChipOverflow,
  ChipRow,
  EvidenceBlock,
  Exchange,
  InlineMono,
  MonoChip,
  SopCitation,
  SourceRow,
  UserMessage,
} from "./primitives";

const COLUMNS = ["glucose_gL", "feed_rate", "pH_setpoint"];

const DROPPED: { key: string; note: string }[] = [
  { key: "osmolality", note: "constant across all 142 runs" },
  { key: "seed_lot", note: "68% missing" },
  { key: "operator, plate_id", note: "identifiers, not inputs" },
];

export function SeededExchanges() {
  return (
    <>
      <div className="flex flex-col items-start gap-1.5">
        <DemoBadge />
        <p className="text-[11px] leading-[1.5] text-muted">
          Two illustrative exchanges from the design mock, shown because demo mode is on. No model wrote them and they
          are not answers about this campaign.
        </p>
      </div>

      <Exchange>
        <UserMessage>Which columns actually feed the model?</UserMessage>
        <Answer>
          Eleven of the fifteen columns in the upload. The four left out were dropped for cause, not preference.
        </Answer>
        <ChipRow>
          {COLUMNS.map((c) => (
            <MonoChip key={c}>{c}</MonoChip>
          ))}
          <ChipOverflow>+8 more</ChipOverflow>
        </ChipRow>
        <EvidenceBlock rows={DROPPED} />
        <SourceRow
          source={<span className="font-plex-mono">bioqore_titer_v4.csv</span>}
          action="open the column map"
        />
      </Exchange>

      <Exchange separated>
        <UserMessage>Can I run glucose at 7.5 g/L under the current SOP?</UserMessage>
        <Answer>
          Yes, up to <InlineMono>8.0 g/L</InlineMono> — but above 7.0 the SOP requires the low feed rate, which rules
          out two of the six proposals as written.
        </Answer>
        <SopCitation
          clause="§4.2"
          title="SOP CHO-FB-014"
          text="Glucose 3.0–8.0 g/L. Above 7.0 g/L, feed rate must not exceed 0.6 mL/h."
        />
        <SourceRow source={<span>Rows 1 and 4 conflict</span>} action="show them in the batch" actionInk />
      </Exchange>
    </>
  );
}
