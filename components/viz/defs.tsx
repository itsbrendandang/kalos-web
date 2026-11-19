/** Shared SVG defs for every chart: the refusal hatch (VIZ_SPEC 3.6). Pattern ids are scoped per chart to stay unique. */
export function VizDefs({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={`${id}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="var(--chart-zone-licensed)" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="var(--chart-refused)" strokeWidth="1.5" />
      </pattern>
    </defs>
  );
}

export const hatchFill = (id: string) => `url(#${id}-hatch)`;
