import { describe, expect, it } from "vitest";
import clientJs from "../public/app.js?raw";
import { checkLimit, countChars } from "../src/domain/charcount";
import serverTs from "../src/domain/charcount.ts?raw";

describe("countChars", () => {
  it("counts spaces and punctuation", () => {
    expect(countChars("Two SCBA, 15 years old.")).toBe(23);
  });

  it("counts a line break as two characters whatever its form", () => {
    expect(countChars("a\nb")).toBe(4);
    expect(countChars("a\r\nb")).toBe(4);
    expect(countChars("a\rb")).toBe(4);
  });

  it("counts an emoji as one character", () => {
    expect(countChars("🚒")).toBe(1);
  });

  it("flags drafts over the limit", () => {
    expect(checkLimit("x".repeat(4000), 4000)).toEqual({ count: 4000, limit: 4000, remaining: 0, over: false });
    expect(checkLimit("x".repeat(4001), 4000).over).toBe(true);
  });
});

describe("the live counter in public/app.js", () => {
  const body = (src: string) => {
    const start = src.indexOf("function countChars");
    const open = src.indexOf("{", src.indexOf(")", start));
    const close = src.indexOf("\n}", open);
    return src.slice(open, close).replace(/\s+/g, " ");
  };

  it("uses the same counting logic as the server", () => {
    expect(body(clientJs)).toBe(body(serverTs));
  });
});
