// Narrative limits count every character, spaces and punctuation included.
// A line break counts as two because browsers submit textarea line breaks as
// CRLF, so a draft that fits here also fits in the portal's form.
//
// public/app.js carries a copy of countChars for the live counter in the
// editor; test/charcount.test.ts keeps the two in step.

export function countChars(text: string): number {
  let count = 0;
  for (const ch of text.replace(/\r\n?/g, "\n")) {
    count += ch === "\n" ? 2 : 1;
  }
  return count;
}

export interface LimitCheck {
  count: number;
  limit: number;
  remaining: number;
  over: boolean;
}

export function checkLimit(text: string, limit: number): LimitCheck {
  const count = countChars(text);
  return { count, limit, remaining: limit - count, over: count > limit };
}
