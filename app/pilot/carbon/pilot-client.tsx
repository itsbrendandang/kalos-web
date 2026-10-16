"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import {
  DataTable, NumberInput, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow,
} from "@carbon/react";
import { toHeatmapData, type SurfacePayload } from "@/lib/pilot/mock-surface";
import { SurfaceOverlay } from "./surface-overlay";

// Carbon Charts touches the DOM on mount: client-only.
const HeatmapChart = dynamic(() => import("@carbon/charts-react").then((m) => m.HeatmapChart), { ssr: false });

const HEADERS = [
  { key: "id", header: "Run" },
  { key: "x", header: "Temperature (°C)" },
  { key: "y", header: "pH" },
  { key: "titer", header: "Titer (g/L)" },
];

export function PilotClient({ surface }: { surface: SurfacePayload }) {
  const [temp, setTemp] = useState(35);
  const rows = surface.runs.map((r) => ({ ...r, id: r.id, x: String(r.x), y: String(r.y), titer: String(r.titer) }));
  const zs = surface.z.flat();

  return (
    <main style={{ padding: "2rem", maxWidth: 1100, margin: "0 auto", display: "grid", gap: "2rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Carbon pilot</h1>

      <section aria-label="Campaign runs">
        <DataTable rows={rows} headers={HEADERS} size="md">
          {({ rows: rs, headers, getTableProps, getHeaderProps, getRowProps }) => (
            <TableContainer title="Campaign runs" description="12 completed runs (mock data)">
              <Table {...getTableProps()}>
                <TableHead>
                  <TableRow>
                    {headers.map((h) => {
                      const { key, ...rest } = getHeaderProps({ header: h });
                      return <TableHeader key={key} {...rest}>{h.header}</TableHeader>;
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rs.map((row) => {
                    const { key, ...rest } = getRowProps({ row });
                    return (
                      <TableRow key={key} {...rest}>
                        {row.cells.map((c) => <TableCell key={c.id}>{c.value}</TableCell>)}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>
      </section>

      <section aria-label="Driver input" style={{ maxWidth: 320 }}>
        <NumberInput
          id="temp-input"
          label="Temperature"
          helperText="Setpoint in °C (units shown in label)"
          min={30} max={38} step={0.5}
          value={temp}
          invalidText="Between 30 and 38 °C"
          onChange={(_, { value }) => setTemp(Number(value))}
        />
      </section>

      <section aria-label="Response surface" style={{ display: "grid", gap: "1.5rem" }}>
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600 }}>1 · Carbon heatmap (21×21 posterior mean)</h2>
          <p style={{ color: "var(--fg-muted)", fontSize: 14 }}>
            Native Carbon Charts. It has no contour, star or diamond layer, so the incumbent and proposals cannot be drawn here.
          </p>
          <HeatmapChart
            data={toHeatmapData(surface)}
            options={{
              title: "Titer posterior mean (g/L)",
              axes: {
                bottom: { title: surface.x_feature, mapsTo: "x", scaleType: "labels" as never },
                left: { title: surface.y_feature, mapsTo: "y", scaleType: "labels" as never },
              },
              heatmap: {
                colorLegend: { title: "g/L" },
                colorDomain: { min: Math.min(...zs), max: Math.max(...zs) },
              },
              height: "520px",
            } as never}
          />
        </div>
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600 }}>2 · Fallback: SVG overlay (same payload)</h2>
          <p style={{ color: "var(--fg-muted)", fontSize: 14 }}>
            Mean as cells, uncertainty (σ) as contour lines, ★ incumbent, ◆ proposals.
          </p>
          <SurfaceOverlay surface={surface} />
        </div>
      </section>
    </main>
  );
}
