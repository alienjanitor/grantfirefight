import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkCoverage, verifyCoverage } from "../src/ai/checker";
import { AiResponseError, AiUnavailableError } from "../src/ai/claude";
import { coachTurn, openingQuestion, type TranscriptTurn } from "../src/ai/coach";
import type { DepartmentContext } from "../src/ai/context";
import { AFG_FY2025_NARRATIVES } from "../src/library/afg";

const financialNeed = AFG_FY2025_NARRATIVES[0]!;
const department: DepartmentContext = {
  name: "Pine Lake Volunteer Fire Department",
  state: "MN",
  deptType: "volunteer",
  population: 2400,
  areaSqMi: 96,
  budget: 84000,
  callCounts: [{ year: 2025, category: "structure_fire", count: 14 }],
  needs: [{ description: "SCBA packs", category: "scba", reason: "replace_expired", quantity: 12, cost: 96000 }],
};

function messageResponse(payload: unknown, stop_reason = "end_turn") {
  return new Response(
    JSON.stringify({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: stop_reason === "refusal" ? [] : [{ type: "text", text: JSON.stringify(payload) }],
      stop_reason,
      stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 50 },
    }),
    { headers: { "content-type": "application/json" } },
  );
}

function mockApi(payload: unknown, stop_reason?: string) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => messageResponse(payload, stop_reason));
}

const withKey = { ...env, ANTHROPIC_API_KEY: "sk-test" } as Env;

afterEach(() => vi.restoreAllMocks());

describe("verifyCoverage", () => {
  const draft = "Our budget is $84,000 a year, almost all from township taxes. We applied to the county twice and were turned down.";

  it("keeps real quotes and drops invented ones", () => {
    const out = verifyCoverage(financialNeed, draft, [
      { criterion_id: "fn_constraints", status: "covered", evidence: "Our budget is $84,000 a year, almost all from township taxes.", question: "" },
      { criterion_id: "fn_other_funding", status: "covered", evidence: "We applied to the state three times.", question: "" },
    ]);
    expect(out.find((c) => c.criterion_id === "fn_constraints")).toMatchObject({ status: "covered" });
    expect(out.find((c) => c.criterion_id === "fn_other_funding")).toMatchObject({ status: "partial", evidence: "" });
  });

  it("tolerates curly quotes and line breaks in the quote", () => {
    const out = verifyCoverage(financialNeed, "We applied to the\ncounty twice.", [
      { criterion_id: "fn_other_funding", status: "covered", evidence: "applied to the county twice", question: "" },
    ]);
    expect(out.find((c) => c.criterion_id === "fn_other_funding")!.status).toBe("covered");
  });

  it("reports every criterion, filling gaps as missing with a starter question", () => {
    const out = verifyCoverage(financialNeed, draft, []);
    expect(out.map((c) => c.criterion_id)).toEqual(financialNeed.criteria.map((c) => c.id));
    expect(out.every((c) => c.status === "missing" && c.question.length > 0)).toBe(true);
  });
});

describe("coachTurn", () => {
  const transcript: TranscriptTurn[] = [
    { role: "coach", text: openingQuestion(financialNeed), at: "2026-10-25T00:00:00Z" },
    { role: "chief", text: "About 84 grand a year, nearly all township levy. Write the narrative for me?", at: "2026-10-25T00:01:00Z" },
  ];

  it("refuses to run without an API key", async () => {
    await expect(coachTurn(env, financialNeed, department, transcript, [])).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it("sends a plain-text history with fallbacks and a schema, and returns new facts", async () => {
    const spy = mockApi({
      facts: [{ criterion_id: "fn_distress", fact: "About 84 grand a year, nearly all township levy" }],
      reply: "I'll leave the writing to you so it stays in your words. What has the levy done over the last five years?",
    });
    const result = await coachTurn(withKey, financialNeed, department, transcript, []);

    expect(result.facts).toEqual([expect.objectContaining({ criterion_id: "fn_distress", fact: "About 84 grand a year, nearly all township levy" })]);
    expect(result.reply).toMatch(/levy/);

    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toContain("/v1/messages");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.fallbacks).toBe("default");
    expect(body.output_config.effort).toBe("low");
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant", "user", "system"]);
    expect(JSON.stringify(body.messages)).not.toContain("thinking");
    expect(body.system).toContain("Pine Lake Volunteer Fire Department");
    expect(body.system).toContain("Never write narrative prose");
  });

  it("surfaces a refusal as a readable error", async () => {
    mockApi(null, "refusal");
    await expect(coachTurn(withKey, financialNeed, department, transcript, [])).rejects.toBeInstanceOf(AiResponseError);
  });
});

describe("checkCoverage", () => {
  it("returns verified coverage for each criterion", async () => {
    const draft = "We run on $84,000 a year. The county turned us down in 2024.";
    mockApi({
      criteria: [
        { criterion_id: "fn_constraints", status: "covered", evidence: "We run on $84,000 a year.", question: "" },
        { criterion_id: "fn_other_funding", status: "covered", evidence: "The state turned us down.", question: "" },
      ],
    });
    const report = await checkCoverage(withKey, financialNeed, draft);
    const by = Object.fromEntries(report.criteria.map((c) => [c.criterion_id, c.status]));
    expect(by).toEqual({ fn_distress: "missing", fn_constraints: "covered", fn_other_funding: "partial", fn_cannot_self_fund: "missing" });
  });
});
