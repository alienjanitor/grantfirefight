// Form parsing with the validation a chief needs to see: a bad value sends
// them back with a plain message instead of a 500.

export type FormBody = Record<string, string | File | (string | File)[]>;

export class FormError extends Error {}

function raw(form: FormBody, key: string): string {
  const v = form[key];
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : "";
  return typeof v === "string" ? v : "";
}

export function text(form: FormBody, key: string, max = 500): string {
  return raw(form, key).trim().slice(0, max);
}

export function requiredText(form: FormBody, key: string, label: string, max = 500): string {
  const v = text(form, key, max);
  if (!v) throw new FormError(`${label} is required.`);
  return v;
}

export function optText(form: FormBody, key: string, max = 500): string | null {
  return text(form, key, max) || null;
}

export function optNumber(form: FormBody, key: string, label: string, opts: { min?: number; max?: number; integer?: boolean } = {}): number | null {
  const t = text(form, key, 40).replace(/[,$\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  const { min = 0, max = 1e12, integer = true } = opts;
  if (!Number.isFinite(n) || n < min || n > max) throw new FormError(`${label} must be a number between ${min.toLocaleString("en-US")} and ${max.toLocaleString("en-US")}.`);
  return integer ? Math.round(n) : n;
}

export function checkbox(form: FormBody, key: string): 0 | 1 {
  return raw(form, key) ? 1 : 0;
}

export function choice<T extends string>(form: FormBody, key: string, options: Readonly<Record<T, unknown>>, fallback: T): T {
  const v = raw(form, key);
  return Object.hasOwn(options, v) ? (v as T) : fallback;
}

export function list(form: FormBody, key: string): string[] {
  const v = form[key] ?? form[`${key}[]`];
  if (v == null) return [];
  return (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === "string");
}

// "2011", "2011-06" or "2011-06-15".
export function optPartialDate(form: FormBody, key: string, label: string): string | null {
  const t = text(form, key, 20);
  if (!t) return null;
  const m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(t);
  if (!m) throw new FormError(`${label} should look like 2011, 2011-06, or 2011-06-15.`);
  const [y, mo, d] = [m[1]!, m[2], m[3]];
  if (Number(y) < 1950 || Number(y) > 2100 || (mo && (Number(mo) < 1 || Number(mo) > 12)) || (d && (Number(d) < 1 || Number(d) > 31))) {
    throw new FormError(`${label} isn't a real date.`);
  }
  return [y, mo?.padStart(2, "0"), d?.padStart(2, "0")].filter(Boolean).join("-");
}

export function optIsoDate(form: FormBody, key: string, label: string): string | null {
  const t = text(form, key, 20);
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(Date.parse(t))) throw new FormError(`${label} must be a date.`);
  return t;
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
