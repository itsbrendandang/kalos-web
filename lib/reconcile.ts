// Shared optimistic-update reconciliation helper. app/experiments/page.tsx
// applies an optimistic status change to local state, fires the mutating
// request, then must reconcile local state back to server truth afterward -
// on both success and failure - so a failed PATCH/run doesn't leave a stale
// optimistic status on screen. Extracted as a pure function (rather than left
// as an inline .then/.catch/.finally chain in the component) so the
// "reconcile always runs" contract has direct test coverage that does not
// depend on rendering the component - see __tests__/reconcile.test.ts.
export async function runWithReconcile(
  action: () => Promise<unknown>,
  reconcile: () => void,
  onError?: (error: unknown) => void,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    onError?.(error);
  } finally {
    reconcile();
  }
}
