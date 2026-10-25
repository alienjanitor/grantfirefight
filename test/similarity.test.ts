import { describe, expect, it } from "vitest";
import { fnv1a, overlapSpans, tokenize, uniqueShingles, verdictFor } from "../src/domain/similarity";

describe("tokenize", () => {
  it("keeps offsets into the original text and folds case and apostrophes", () => {
    const tokens = tokenize("Our SCBA’s are 15-years old.");
    expect(tokens.map((t) => t.word)).toEqual(["our", "scba's", "are", "15", "years", "old"]);
    expect(tokens[1]).toMatchObject({ start: 4, end: 10 });
  });
});

describe("fnv1a", () => {
  it("matches the reference vector", () => {
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("a")).toBe(0xe40c292c);
  });
});

describe("shingles and spans", () => {
  const other = "Our department relies entirely on volunteers who answer every call in the township at all hours.";

  it("ignores case and punctuation differences", () => {
    expect(uniqueShingles("Answer every call in the township, at ALL hours")).toEqual(
      uniqueShingles("answer every call in the township at all hours"),
    );
  });

  it("highlights only the copied run in the draft", () => {
    const draft = "We have 22 members. Volunteers who answer every call in the township at all hours keep us going.";
    const matched = new Set(uniqueShingles(other));
    const spans = overlapSpans(draft, matched);
    expect(spans).toHaveLength(1);
    expect(draft.slice(spans[0]!.start, spans[0]!.end)).toBe("Volunteers who answer every call in the township at all hours");
  });

  it("finds nothing in independent writing", () => {
    const draft = "Twenty-two members cover ninety square miles of farmland along Highway 10, mostly at night.";
    expect(overlapSpans(draft, new Set(uniqueShingles(other)))).toEqual([]);
  });
});

describe("verdictFor", () => {
  it("bands overlap", () => {
    expect(verdictFor(0.5, 5)).toBe("too_short");
    expect(verdictFor(0.01, 400)).toBe("original");
    expect(verdictFor(0.05, 400)).toBe("some_overlap");
    expect(verdictFor(0.2, 400)).toBe("high_overlap");
  });
});
