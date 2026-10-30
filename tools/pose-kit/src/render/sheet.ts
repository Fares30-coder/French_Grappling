export type SheetCell = { label: string; png: Buffer };
export type SheetRow = { title: string; cells: SheetCell[] };

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const SHEET_CELL = { width: 400, height: 300 } as const;

/** Self-contained HTML of the contact sheet: one row per step, one column per view. */
export function sheetHtml(heading: string, rows: SheetRow[]): string {
  const body = rows
    .map(
      (row) =>
        `<section><h2>${escapeHtml(row.title)}</h2><div class="row">${row.cells
          .map(
            (c) =>
              `<figure><img src="data:image/png;base64,${c.png.toString('base64')}" style="width:100%"><figcaption>${escapeHtml(c.label)}</figcaption></figure>`,
          )
          .join('')}</div></section>`,
    )
    .join('');
  return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:8px;font:13px system-ui,sans-serif;background:#fff;color:#0f172a;width:${SHEET_CELL.width * 4 + 8 * 5}px}
h1{font-size:16px;margin:0 0 6px}h2{font-size:13px;margin:6px 0 2px}
.row{display:flex;gap:8px}figure{margin:0;position:relative;width:${SHEET_CELL.width}px;height:${SHEET_CELL.height}px;background:#fff}
figcaption{position:absolute;left:4px;top:3px;font-size:11px;background:#fffc;padding:0 4px;border-radius:3px}
img{display:block;border:1px solid #cbd5e1}
</style><h1>${escapeHtml(heading)}</h1>${body}`;
}
