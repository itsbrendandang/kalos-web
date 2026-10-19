// Minimal, dependency-free reader for the cells of one worksheet of an .xlsx file, so the browser can run
// the same pre-fit sheet checks (e.g. the data_type row-type split) on Excel as on CSV.
//
// Why hand-rolled: the repo has no spreadsheet library, and adding a ~1 MB one only to count the values of
// one column is a bigger decision than this check. An .xlsx is a zip of XML parts; the browser's built-in
// DecompressionStream("deflate-raw") inflates the entries. Scope is deliberately narrow: cell TEXT (shared
// strings, inline strings, numbers as written), the first sheet or one chosen by name. Legacy binary .xls
// is not supported (callers get null). Never throws; returns null when the file is not a readable xlsx.

const MAX_PART_BYTES = 64 * 1024 * 1024;

export type XlsxRows = { rows: string[][]; sheets: string[]; sheetUsed: string };

type Entry = { method: number; compSize: number; size: number; offset: number };

const u16 = (v: DataView, o: number) => v.getUint16(o, true);
const u32 = (v: DataView, o: number) => v.getUint32(o, true);

function readDirectory(buf: Uint8Array): Map<string, Entry> | null {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (u32(v, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = u16(v, eocd + 10);
  let p = u32(v, eocd + 16);
  const out = new Map<string, Entry>();
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || u32(v, p) !== 0x02014b50) return null;
    const nameLen = u16(v, p + 28);
    const extraLen = u16(v, p + 30);
    const commentLen = u16(v, p + 32);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    out.set(name, { method: u16(v, p + 10), compSize: u32(v, p + 20), size: u32(v, p + 24), offset: u32(v, p + 42) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function readPart(buf: Uint8Array, e: Entry): Promise<string | null> {
  if (e.size > MAX_PART_BYTES) return null;
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (e.offset + 30 > buf.length || u32(v, e.offset) !== 0x04034b50) return null;
  const start = e.offset + 30 + u16(v, e.offset + 26) + u16(v, e.offset + 28);
  const data = buf.subarray(start, start + e.compSize);
  if (e.method === 0) return new TextDecoder().decode(data);
  if (e.method !== 8) return null;
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, g: string) => {
    if (g[0] === "#") {
      const n = g[1] === "x" || g[1] === "X" ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[g] ?? m;
  });
}

/** Concatenated text of every <t> in a fragment, skipping phonetic runs. */
function textOf(fragment: string): string {
  const clean = fragment.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of clean.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) out += m[1] ?? "";
  return unescapeXml(out);
}

const attr = (attrs: string, name: string): string | null => {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs);
  return m ? unescapeXml(m[1]) : null;
};

function colIndex(ref: string): number {
  const letters = /^[A-Za-z]+/.exec(ref)?.[0].toUpperCase() ?? "";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Cells of the first sheet (or the sheet called `sheet`) as strings; blank-only rows are skipped like the CSV reader does. */
export async function readXlsxRows(data: ArrayBuffer, sheet?: string): Promise<XlsxRows | null> {
  try {
    const buf = new Uint8Array(data);
    const dir = readDirectory(buf);
    if (!dir) return null;
    const part = async (name: string) => {
      const e = dir.get(name);
      return e ? readPart(buf, e) : null;
    };
    const workbook = await part("xl/workbook.xml");
    if (!workbook) return null;
    const rels = (await part("xl/_rels/workbook.xml.rels")) ?? "";
    const targets = new Map<string, string>();
    for (const m of rels.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
      const id = attr(m[1], "Id");
      const target = attr(m[1], "Target");
      if (id && target) targets.set(id, target);
    }
    const sheets: { name: string; path: string }[] = [];
    for (const m of workbook.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
      const name = attr(m[1], "name");
      const rid = attr(m[1], "r:id");
      const target = rid ? targets.get(rid) : null;
      if (name && target) sheets.push({ name, path: target.startsWith("/") ? target.slice(1) : `xl/${target}` });
    }
    const chosen = sheet ? sheets.find((s) => s.name === sheet) : sheets[0];
    if (!chosen) return null;
    const xml = await part(chosen.path);
    if (!xml) return null;

    const shared: string[] = [];
    const sst = await part("xl/sharedStrings.xml");
    if (sst) for (const m of sst.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) shared.push(textOf(m[1] ?? ""));

    const rows: string[][] = [];
    for (const rm of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const cells: string[] = [];
      let next = 0;
      for (const cm of (rm[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(cm[1], "r");
        const at = ref ? colIndex(ref) : next;
        const type = attr(cm[1], "t");
        const inner = cm[2] ?? "";
        let value = "";
        if (type === "inlineStr") value = textOf(inner);
        else {
          const raw = /<v\b[^>]*?>([\s\S]*?)<\/v>/.exec(inner)?.[1];
          if (raw !== undefined) value = type === "s" ? shared[Number(raw)] ?? "" : type === "b" ? (raw === "1" ? "TRUE" : "FALSE") : unescapeXml(raw);
        }
        while (cells.length < at) cells.push("");
        cells[at] = value;
        next = at + 1;
      }
      if (cells.some((x) => x !== "")) rows.push(cells);
    }
    return { rows, sheets: sheets.map((s) => s.name), sheetUsed: chosen.name };
  } catch {
    return null;
  }
}
