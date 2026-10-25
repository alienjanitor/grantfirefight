import type { Child, FC } from "hono/jsx";
import type { Source } from "../domain/sources";

export type Tone = "ok" | "warn" | "bad" | "info" | "muted";

export const Badge: FC<{ tone: Tone; children?: Child }> = ({ tone, children }) => <span class={`badge ${tone}`}>{children}</span>;

export const Sources: FC<{ sources: readonly Source[]; label?: string }> = ({ sources, label = "Sources" }) =>
  sources.length ? (
    <p class="sources">
      {label}:{" "}
      {sources.map((s, i) => (
        <>
          {i > 0 ? "; " : ""}
          <a href={s.url} target="_blank" rel="noopener">
            {s.label}
          </a>
        </>
      ))}
    </p>
  ) : null;

export const money = (n: number | null | undefined) => (n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`);

export const pct = (x: number) => `${Math.round(x * 100)}%`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-12-01" → "Dec 1, 2026"; partial dates print what's known.
export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(value);
  if (!m) return value;
  const [, y, mo, d] = m;
  if (!mo) return y!;
  if (!d) return `${MONTHS[Number(mo) - 1]} ${y}`;
  return `${MONTHS[Number(mo) - 1]} ${Number(d)}, ${y}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

export const Field: FC<{ label: string; hint?: string; children?: Child }> = ({ label, hint, children }) => (
  <label class="field">
    <span class="field-label">{label}</span>
    {children}
    {hint ? <span class="hint">{hint}</span> : null}
  </label>
);

export const Select: FC<{ name: string; options: Record<string, string>; value?: string | null; required?: boolean; disabled?: boolean }> = ({
  name,
  options,
  value,
  required,
  disabled,
}) => (
  <select name={name} required={required} disabled={disabled}>
    {Object.entries(options).map(([k, label]) => (
      <option value={k} selected={k === value}>
        {label}
      </option>
    ))}
  </select>
);

export const Check: FC<{ name: string; checked?: boolean; label: string; disabled?: boolean }> = ({ name, checked, label, disabled }) => (
  <label class="check">
    <input type="checkbox" name={name} value="1" checked={checked} disabled={disabled} />
    <span>{label}</span>
  </label>
);

export const Empty: FC<{ children?: Child }> = ({ children }) => <p class="empty">{children}</p>;

export const STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
