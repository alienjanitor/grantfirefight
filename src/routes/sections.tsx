import { Hono } from "hono";
import type { FC } from "hono/jsx";
import { checkCoverage, type CoverageReport, type CoverageStatus } from "../ai/checker";
import { aiConfigured, describeAiError } from "../ai/claude";
import { coachTurn, openingQuestion, type Fact, type TranscriptTurn } from "../ai/coach";
import type { DepartmentContext } from "../ai/context";
import { MAX_AUDIO_BYTES, transcribe } from "../ai/transcribe";
import {
  getInterview,
  getSection,
  listApplicationNeeds,
  listCallCounts,
  saveCoverage,
  saveDraft,
  saveInterview,
  saveSimilarity,
  touchApplication,
  type DepartmentRow,
  type SectionRow,
} from "../db";
import { checkLimit } from "../domain/charcount";
import { VERDICT_LABELS, type Span } from "../domain/similarity";
import { text } from "../forms";
import { dept, page, redirect, user, type AppEnv, type Ctx } from "../http";
import type { NarrativeSpec } from "../library";
import { checkText, indexText, type SimilarityResult } from "../similarity-index";
import { Badge, Empty, fmtDate, pct, Sources, type Tone } from "../views/components";
import { loadApplication } from "./applications";

export const sectionRoutes = new Hono<AppEnv>();

const MAX_DRAFT = 20_000;
const MAX_ANSWER = 4_000;

const COVERAGE_TONE: Record<CoverageStatus, Tone> = { covered: "ok", partial: "warn", missing: "bad" };
const COVERAGE_LABEL: Record<CoverageStatus, string> = { covered: "Covered", partial: "Partly covered", missing: "Missing" };
const VERDICT_TONE: Record<string, Tone> = { too_short: "muted", original: "ok", some_overlap: "warn", high_overlap: "bad" };

async function loadSection(c: Ctx) {
  const loaded = await loadApplication(c);
  if (!loaded) return null;
  const spec = loaded.cycle.narratives?.find((n) => n.key === c.req.param("key"));
  if (!spec) return null;
  const section = await getSection(c.env.DB, loaded.app.id, spec.key);
  if (!section) return null;
  return { ...loaded, spec, section };
}

// "2026-10-25 18:00:00" and ISO timestamps both appear; compare as instants.
function at(ts: string | null): number {
  if (!ts) return 0;
  return Date.parse(ts.includes("T") ? ts : `${ts.replace(" ", "T")}Z`);
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function departmentContext(c: Ctx, d: DepartmentRow, applicationId: string): Promise<DepartmentContext> {
  const [counts, needs] = await Promise.all([listCallCounts(c.env.DB, d.id), listApplicationNeeds(c.env.DB, applicationId)]);
  return {
    name: d.name,
    state: d.state,
    deptType: d.dept_type,
    population: d.population_served,
    areaSqMi: d.protection_area_sq_mi,
    budget: d.operating_budget,
    callCounts: counts.slice(0, 30),
    needs: needs.map((n) => ({ description: n.description, category: n.category, reason: n.reason, quantity: n.quantity, cost: n.estimated_cost })),
  };
}

const Highlighted: FC<{ text: string; spans: Span[] }> = ({ text: t, spans }) => {
  const parts: (string | ReturnType<FC>)[] = [];
  let pos = 0;
  for (const s of spans) {
    if (s.start > pos) parts.push(t.slice(pos, s.start));
    parts.push(<mark>{t.slice(s.start, s.end)}</mark>);
    pos = s.end;
  }
  parts.push(t.slice(pos));
  return <div class="draft-view">{parts}</div>;
};

sectionRoutes.get("/applications/:id/sections/:key", async (c) => {
  const loaded = await loadSection(c);
  if (!loaded) return c.notFound();
  const { app, spec, section } = loaded;
  const interview = await getInterview(c.env.DB, section.id);
  const transcript = parseJson<TranscriptTurn[]>(interview?.transcript, []);
  const facts = parseJson<Fact[]>(interview?.extracted_facts, []);
  const coverage = parseJson<CoverageReport | null>(section.criteria_coverage, null);
  const similarity = parseJson<SimilarityResult | null>(section.similarity_detail, null);
  const ai = aiConfigured(c.env);
  const base = `/applications/${app.id}/sections/${spec.key}`;
  const shown: TranscriptTurn[] = transcript.length ? transcript : [{ role: "coach", text: openingQuestion(spec), at: "" }];

  return page(
    c,
    { title: spec.title, active: "applications" },
    <>
      <p>
        <a href={`/applications/${app.id}`}>← {app.title}</a>
      </p>
      <h1>{spec.title}</h1>
      <p class="sub">
        {spec.weight} · {spec.charLimit.toLocaleString("en-US")} characters, spaces included
      </p>

      <section class="card">
        <h2>What reviewers look for</h2>
        <ul class="criteria">
          {spec.criteria.map((cr) => {
            const cov = coverage?.criteria.find((x) => x.criterion_id === cr.id);
            return (
              <li>
                <strong>{cr.label}</strong> {cov ? <Badge tone={COVERAGE_TONE[cov.status]}>{COVERAGE_LABEL[cov.status]}</Badge> : null}
                <div class="sub">{cr.guidance}</div>
              </li>
            );
          })}
        </ul>
        <Sources sources={spec.sources} />
      </section>

      <section class="card" id="coach">
        <h2>1. Talk it through</h2>
        <p class="hint">Answer in your own words, typed or spoken. The coach asks; you answer; your facts land in the notes below.</p>
        <ol class="chat">
          {shown.map((t) => (
            <li class={t.role}>
              <span class="who">{t.role === "coach" ? "Coach" : "You"}</span>
              <p>{t.text}</p>
            </li>
          ))}
        </ol>
        {ai ? null : (
          <div class="callout warn">
            The AI coach isn't turned on for this site, so answers are saved without follow-up questions. Work through the starter questions:
            <ul>
              {spec.criteria.flatMap((cr) => cr.questions).map((q) => (
                <li>{q}</li>
              ))}
            </ul>
          </div>
        )}
        <form method="post" action={`${base}/interview`} class="stack" data-busy="The coach is thinking…">
          <label class="field">
            <span class="field-label">Your answer</span>
            <textarea id="answer" name="answer" rows={4} maxlength={MAX_ANSWER} required></textarea>
          </label>
          <div class="row">
            <button type="submit">Send answer</button>
            <button type="button" class="secondary" data-record={`${base}/transcribe`} data-target="answer" data-status="record-status">
              Record answer
            </button>
            <span id="record-status" class="hint" aria-live="polite"></span>
          </div>
        </form>
      </section>

      <section class="card" id="notes">
        <h2>Your notes</h2>
        {facts.length ? (
          spec.criteria.map((cr) => {
            const mine = facts.filter((f) => f.criterion_id === cr.id);
            return (
              <div class="notes-group">
                <h3>{cr.label}</h3>
                {mine.length ? (
                  <ul>
                    {mine.map((f) => (
                      <li>{f.fact}</li>
                    ))}
                  </ul>
                ) : (
                  <p class="hint">Nothing yet.</p>
                )}
              </div>
            );
          })
        ) : (
          <Empty>Facts from your answers show up here, sorted by what reviewers score.</Empty>
        )}
      </section>

      <section class="card" id="draft">
        <h2>2. Write it</h2>
        <p class="hint">
          Write it yourself, from your notes. Your own words are what keep it from looking like anyone else's, and FEMA can throw out narratives that
          copy other submissions.
        </p>
        <form method="post" action={`${base}/draft`} class="stack">
          <textarea name="draft" rows={18} maxlength={MAX_DRAFT} data-limit={spec.charLimit} data-counter="draft-count">
            {section.draft_text}
          </textarea>
          <div class="row">
            <button type="submit">Save draft</button>
            <span id="draft-count" class={checkLimit(section.draft_text, spec.charLimit).over ? "count over" : "count"}>
              {checkLimit(section.draft_text, spec.charLimit).count.toLocaleString("en-US")} / {spec.charLimit.toLocaleString("en-US")}
            </span>
          </div>
          <p class="hint">Line breaks count as two characters, the way web forms send them.</p>
        </form>
      </section>

      <section class="card" id="check">
        <h2>3. Check it</h2>
        <Checks section={section} spec={spec} coverage={coverage} similarity={similarity} ai={ai} action={`${base}/check`} />
      </section>
    </>,
  );
});

const Checks: FC<{
  section: SectionRow;
  spec: NarrativeSpec;
  coverage: CoverageReport | null;
  similarity: SimilarityResult | null;
  ai: boolean;
  action: string;
}> = ({ section, spec, coverage, similarity, ai, action }) => {
  const draftAt = at(section.updated_at);
  const simFresh = similarity && at(section.similarity_checked_at) >= draftAt;
  const covFresh = coverage && at(section.coverage_checked_at) >= draftAt;
  return (
    <>
      <form method="post" action={action} data-busy="Checking…">
        <button type="submit" disabled={!section.draft_text.trim()}>
          {ai ? "Check criteria and originality" : "Check originality"}
        </button>
      </form>

      <h3>Criteria coverage</h3>
      {coverage ? (
        <>
          {!covFresh ? <p class="callout warn">The draft changed after this check. Run it again.</p> : null}
          <ul class="coverage">
            {coverage.criteria.map((cv) => {
              const cr = spec.criteria.find((x) => x.id === cv.criterion_id);
              return (
                <li>
                  <div class="item-head">
                    <strong>{cr?.label ?? cv.criterion_id}</strong>
                    <Badge tone={COVERAGE_TONE[cv.status]}>{COVERAGE_LABEL[cv.status]}</Badge>
                  </div>
                  {cv.evidence ? <blockquote>{cv.evidence}</blockquote> : null}
                  {cv.question ? <p class="ask">Ask yourself: {cv.question}</p> : null}
                </li>
              );
            })}
          </ul>
          <p class="hint">Checked {fmtDate(coverage.checked_at.slice(0, 10))}. Coverage only; not a score.</p>
        </>
      ) : (
        <Empty>{ai ? "Not checked yet." : "Criteria checks need the AI coach turned on."}</Empty>
      )}

      <h3>Originality</h3>
      {similarity && simFresh ? (
        <>
          <p>
            <Badge tone={VERDICT_TONE[similarity.verdict]!}>{VERDICT_LABELS[similarity.verdict]}</Badge>{" "}
            {similarity.verdict === "too_short"
              ? "Write a bit more before checking."
              : `${pct(similarity.overall)} of this draft matches text in other departments' drafts or known templates.`}
          </p>
          {similarity.sources.length ? (
            <ul>
              {similarity.sources.map((s) => (
                <li>
                  {s.label}: {pct(s.containment)} of your draft
                </li>
              ))}
            </ul>
          ) : null}
          {similarity.spans.length ? (
            <>
              <p class="hint">Highlighted passages also appear elsewhere. Rewrite them in your own words.</p>
              <Highlighted text={section.draft_text} spans={similarity.spans} />
            </>
          ) : null}
        </>
      ) : (
        <Empty>Saving the draft runs this check.</Empty>
      )}
    </>
  );
};

async function refreshSimilarity(c: Ctx, section: SectionRow, draft: string, label: string) {
  const d = dept(c);
  await indexText(c.env.DB, section.id, "section", d.id, label, draft);
  const result = await checkText(c.env.DB, d.id, draft);
  await saveSimilarity(c.env.DB, section.id, result.maxContainment, JSON.stringify(result));
}

sectionRoutes.post("/applications/:id/sections/:key/draft", async (c) => {
  const loaded = await loadSection(c);
  if (!loaded) return c.notFound();
  const { app, spec, section } = loaded;
  const form = await c.req.parseBody();
  const draft = (typeof form.draft === "string" ? form.draft : "").replace(/\r\n?/g, "\n").slice(0, MAX_DRAFT);
  await saveDraft(c.env.DB, section.id, draft, user(c).id);
  await refreshSimilarity(c, section, draft, spec.title);
  await touchApplication(c.env.DB, app.id);
  const lim = checkLimit(draft, spec.charLimit);
  return redirect(
    c,
    `/applications/${app.id}/sections/${spec.key}`,
    lim.over ? { err: `Saved, but ${(-lim.remaining).toLocaleString("en-US")} characters over the limit.` } : { msg: "Draft saved." },
    "#draft",
  );
});

sectionRoutes.post("/applications/:id/sections/:key/interview", async (c) => {
  const loaded = await loadSection(c);
  if (!loaded) return c.notFound();
  const { app, spec, section } = loaded;
  const back = `/applications/${app.id}/sections/${spec.key}`;
  const answer = text(await c.req.parseBody(), "answer", MAX_ANSWER);
  if (!answer) return redirect(c, back, { err: "Type or record an answer first." }, "#coach");

  const interview = await getInterview(c.env.DB, section.id);
  const transcript = parseJson<TranscriptTurn[]>(interview?.transcript, []);
  const facts = parseJson<Fact[]>(interview?.extracted_facts, []);
  const now = new Date().toISOString();
  if (!transcript.length) transcript.push({ role: "coach", text: openingQuestion(spec), at: now });
  transcript.push({ role: "chief", text: answer, at: now });
  // Save the answer before calling the model so it's never lost.
  await saveInterview(c.env.DB, section.id, JSON.stringify(transcript), JSON.stringify(facts));

  if (!aiConfigured(c.env)) return redirect(c, back, { msg: "Answer saved." }, "#coach");
  try {
    const result = await coachTurn(c.env, spec, await departmentContext(c, dept(c), app.id), transcript, facts);
    transcript.push({ role: "coach", text: result.reply, at: new Date().toISOString() });
    facts.push(...result.facts);
    await saveInterview(c.env.DB, section.id, JSON.stringify(transcript), JSON.stringify(facts));
    return redirect(c, back, {}, "#coach");
  } catch (err) {
    console.error("coach turn failed", err);
    return redirect(c, back, { err: `Answer saved. ${describeAiError(err)}` }, "#coach");
  }
});

sectionRoutes.post("/applications/:id/sections/:key/transcribe", async (c) => {
  const loaded = await loadSection(c);
  if (!loaded) return c.json({ error: "Not found." }, 404);
  const length = Number(c.req.header("content-length") ?? 0);
  if (length > MAX_AUDIO_BYTES) return c.json({ error: "That recording is too long. Keep answers under a few minutes." }, 413);
  try {
    const audio = await c.req.arrayBuffer();
    return c.json({ text: await transcribe(c.env.AI, audio) });
  } catch (err) {
    console.error("transcription failed", err);
    return c.json({ error: "Couldn't transcribe that recording. Try again, or type your answer." }, 502);
  }
});

sectionRoutes.post("/applications/:id/sections/:key/check", async (c) => {
  const loaded = await loadSection(c);
  if (!loaded) return c.notFound();
  const { app, spec, section } = loaded;
  const back = `/applications/${app.id}/sections/${spec.key}`;
  if (!section.draft_text.trim()) return redirect(c, back, { err: "Write and save a draft first." }, "#check");

  await refreshSimilarity(c, section, section.draft_text, spec.title);
  if (!aiConfigured(c.env)) return redirect(c, back, { msg: "Originality checked." }, "#check");
  try {
    const report = await checkCoverage(c.env, spec, section.draft_text);
    await saveCoverage(c.env.DB, section.id, JSON.stringify(report));
    return redirect(c, back, { msg: "Draft checked." }, "#check");
  } catch (err) {
    console.error("coverage check failed", err);
    return redirect(c, back, { err: `Originality checked. ${describeAiError(err)}` }, "#check");
  }
});
