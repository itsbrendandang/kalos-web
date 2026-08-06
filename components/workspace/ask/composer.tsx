/** Design spec section 1.4, the composer - built to the spec's geometry and
 *  disabled, because there is nothing to send to. A live-looking input that
 *  eats a question and never answers is the one failure mode this panel must
 *  not have, so the field is a real `disabled` input (muted wash, muted
 *  placeholder, dimmed send button) and the line beneath it says why in
 *  words.
 *
 *  The spec's focus treatment (`border-color: #343434`) is kept on the row as
 *  `focus-within:border-action`; a disabled input cannot take focus, so it is
 *  dormant until the day the `disabled` attributes come off. */
import { ArrowUp } from "lucide-react";

const NOTE_ID = "ask-composer-note";

export function AskComposer() {
  return (
    <div className="flex flex-none flex-col gap-[9px] border-t border-border px-[18px] pt-[14px] pb-4">
      {/* The design's field is white on white; a disabled control needs to look
          disabled, so the row takes the neutral tile fill instead. */}
      <div className="flex items-center gap-[9px] rounded-[11px] border border-border bg-blue-tint px-3 py-2.5 focus-within:border-action">
        <input
          type="text"
          disabled
          aria-describedby={NOTE_ID}
          placeholder="Ask about the data, a run, or an SOP"
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg placeholder:text-muted disabled:cursor-not-allowed"
        />
        <button
          type="button"
          disabled
          aria-label="Send"
          aria-describedby={NOTE_ID}
          className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-action text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ArrowUp className="size-3.5" aria-hidden />
        </button>
      </div>
      <p id={NOTE_ID} className="text-[10.5px] leading-[1.45] text-muted">
        Disabled: the engine has no answering endpoint yet. When one exists, answers will cite the run registry, and
        asking here will never book a run.
      </p>
    </div>
  );
}
