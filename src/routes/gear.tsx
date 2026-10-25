import { Hono } from "hono";
import type { FC } from "hono/jsx";
import {
  deleteAsset,
  deleteNeed,
  getAsset,
  getNeed,
  insertAsset,
  insertNeed,
  listAssets,
  listNeeds,
  updateAsset,
  updateNeed,
  type AssetInput,
  type AssetRow,
  type NeedInput,
  type NeedRow,
} from "../db";
import { ASSET_KINDS, isAssetKind, projectAsset, statusLabel, todayIso, type AssetKind, type GearProjection } from "../domain/gear";
import { NEED_CATEGORIES, NEED_REASONS, type NeedCategory, type NeedReason } from "../domain/needs";
import { checkbox, choice, FormError, optNumber, optPartialDate, optText, requiredText, text, type FormBody } from "../forms";
import { dept, isLead, page, redirect, requireLead, type AppEnv } from "../http";
import { Badge, Check, Empty, Field, fmtDate, money, Select, Sources, type Tone } from "../views/components";

export const gearRoutes = new Hono<AppEnv>();

const DATE_SOURCES = { label: "From the label", records: "From purchase records", estimate: "Estimate" } as const;
const CONDITIONS = { good: "Good", fair: "Fair", poor: "Poor", out_of_service: "Out of service" } as const;
const MATERIALS = { "": "Not a cylinder / unknown", carbon: "Carbon fiber", fiberglass: "Fiberglass", other: "Other" } as const;
const PRIORITIES = { high: "High", medium: "Medium", low: "Low" } as const;
const NEED_STATUSES = { open: "Open", planned: "In an application", funded: "Funded", closed: "Closed" } as const;

const STATUS_TONES: Record<GearProjection["status"], Tone> = { expired: "bad", hydro_due: "bad", due_soon: "warn", ok: "ok", unknown: "muted" };

function kindLabel(kind: string) {
  return ASSET_KINDS[kind as AssetKind] ?? kind;
}

// Gear

const AssetFields: FC<{ a?: Partial<AssetRow> }> = ({ a = {} }) => (
  <>
    <div class="grid2">
      <Field label="Type">
        <Select name="kind" options={ASSET_KINDS} value={a.kind ?? "turnout"} />
      </Field>
      <Field label="Description" hint="Make and model, or which set, e.g. “Scott Air-Pak X3, engine 1”.">
        <input name="description" value={a.description ?? ""} maxlength={200} />
      </Field>
      <Field label="How many">
        <input name="quantity" inputmode="numeric" value={a.quantity ?? 1} required />
      </Field>
      <Field label="Manufacture date" hint="From the label: 2011, 2011-06 or 2011-06-15. Model year for apparatus.">
        <input name="manufacture_date" value={a.manufacture_date ?? ""} placeholder="2011-06" maxlength={10} />
      </Field>
      <Field label="Where the date came from">
        <Select name="date_source" options={DATE_SOURCES} value={a.date_source ?? "estimate"} />
      </Field>
      <Field label="Condition">
        <Select name="condition" options={CONDITIONS} value={a.condition ?? "good"} />
      </Field>
      <Field label="Cylinder material" hint="SCBA cylinders only.">
        <Select name="cylinder_material" options={MATERIALS} value={a.cylinder_material ?? ""} />
      </Field>
      <Field label="Last hydrostatic test" hint="SCBA cylinders only. From the neck label.">
        <input name="last_hydro_date" value={a.last_hydro_date ?? ""} placeholder="2022-03" maxlength={10} />
      </Field>
      <Field label="Retirement date override" hint="Only if you know a different date than the standard gives.">
        <input name="expires_on" value={a.expires_on ?? ""} placeholder="2027-01-15" maxlength={10} />
      </Field>
    </div>
    <Field label="Notes">
      <textarea name="notes" rows={2} maxlength={1000}>
        {a.notes ?? ""}
      </textarea>
    </Field>
  </>
);

function parseAsset(form: FormBody): AssetInput {
  return {
    kind: choice(form, "kind", ASSET_KINDS, "other"),
    description: text(form, "description", 200),
    quantity: optNumber(form, "quantity", "How many", { min: 1, max: 10_000 }) ?? 1,
    manufacture_date: optPartialDate(form, "manufacture_date", "Manufacture date"),
    date_source: choice(form, "date_source", DATE_SOURCES, "estimate"),
    cylinder_material: optText(form, "cylinder_material", 20) && choice(form, "cylinder_material", MATERIALS, "other"),
    last_hydro_date: optPartialDate(form, "last_hydro_date", "Last hydrostatic test"),
    expires_on: optPartialDate(form, "expires_on", "Retirement date override"),
    condition: choice(form, "condition", CONDITIONS, "good"),
    notes: text(form, "notes", 1000),
  };
}

const Projection: FC<{ p: GearProjection }> = ({ p }) => (
  <div class="projection">
    {p.milestones.length ? (
      <ul class="milestones">
        {p.milestones.map((m) => (
          <li class={m.timing}>
            {m.label}: <strong>{fmtDate(m.date)}</strong>
          </li>
        ))}
      </ul>
    ) : null}
    {p.notes.map((n) => (
      <p class="hint">{n}</p>
    ))}
    {p.rule ? (
      <p class="hint">
        {p.rule.text} <Sources sources={[p.rule.source]} label="Source" />
      </p>
    ) : null}
  </div>
);

gearRoutes.get("/gear", async (c) => {
  const today = todayIso();
  const assets = (await listAssets(c.env.DB, dept(c).id)).map((a) => ({ a, p: projectAsset(a, today) }));
  const count = (s: GearProjection["status"]) => assets.filter((x) => x.p.status === s).length;

  return page(
    c,
    { title: "Gear", active: "gear" },
    <>
      <h1>Gear tracker</h1>
      <p class="lede">
        Turnout gear and SCBA carry dated retirement rules. Expired or noncompliant gear is the kind of request grant programs fund first, so a dated
        inventory pays for itself at application time.
      </p>
      <div class="stats">
        <div class="stat">
          <span class="stat-n">{count("expired")}</span> past retirement or replacement age
        </div>
        <div class="stat">
          <span class="stat-n">{count("hydro_due")}</span> hydro test overdue
        </div>
        <div class="stat">
          <span class="stat-n">{count("due_soon")}</span> due within 12 months
        </div>
      </div>

      <section class="card">
        {assets.length ? (
          <ul class="items">
            {assets.map(({ a, p }) => (
              <li>
                <div class="item-head">
                  <strong>
                    {a.quantity} × {a.description || kindLabel(a.kind)}
                  </strong>
                  <Badge tone={STATUS_TONES[p.status]}>{statusLabel(p)}</Badge>
                </div>
                <div class="sub">
                  {kindLabel(a.kind)} · made {fmtDate(a.manufacture_date)} ({DATE_SOURCES[a.date_source as keyof typeof DATE_SOURCES] ?? a.date_source}) ·{" "}
                  {CONDITIONS[a.condition as keyof typeof CONDITIONS] ?? a.condition}
                </div>
                <Projection p={p} />
                <div class="actions">
                  <a href={`/gear/${a.id}`}>Edit</a>
                  <form method="post" action={`/gear/${a.id}/need`} class="inline">
                    <button type="submit" class="link">
                      Add a replacement need
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No gear yet. Start with turnout gear and SCBA; those have the clearest retirement rules.</Empty>
        )}
      </section>

      <section class="card" id="add">
        <h2>Add gear</h2>
        <p class="hint">
          One entry per purchase batch is enough. Turnout gear shows the date on the garment label (the year is also inside the button backing); SCBA
          serial labels carry the manufacture date; every cylinder has its own neck label. Photographing labels makes a good training-night job.
        </p>
        <form method="post" action="/gear" class="stack">
          <AssetFields />
          <button type="submit">Add gear</button>
        </form>
      </section>
    </>,
  );
});

gearRoutes.post("/gear", async (c) => {
  await insertAsset(c.env.DB, dept(c).id, parseAsset(await c.req.parseBody()));
  return redirect(c, "/gear", { msg: "Gear added." });
});

gearRoutes.get("/gear/:id", async (c) => {
  const a = await getAsset(c.env.DB, dept(c).id, c.req.param("id"));
  if (!a) return c.notFound();
  return page(
    c,
    { title: "Edit gear", active: "gear" },
    <>
      <p>
        <a href="/gear">← Gear</a>
      </p>
      <h1>{a.description || kindLabel(a.kind)}</h1>
      <section class="card">
        <Projection p={projectAsset(a, todayIso())} />
        <form method="post" action={`/gear/${a.id}`} class="stack">
          <AssetFields a={a} />
          <button type="submit">Save</button>
        </form>
      </section>
      {isLead(c) ? (
        <form method="post" action={`/gear/${a.id}/delete`}>
          <button type="submit" class="danger">
            Delete this gear
          </button>
        </form>
      ) : null}
    </>,
  );
});

gearRoutes.post("/gear/:id", async (c) => {
  const id = c.req.param("id");
  if (!(await getAsset(c.env.DB, dept(c).id, id))) return c.notFound();
  await updateAsset(c.env.DB, dept(c).id, id, parseAsset(await c.req.parseBody()));
  return redirect(c, "/gear", { msg: "Gear saved." });
});

gearRoutes.post("/gear/:id/delete", requireLead, async (c) => {
  await deleteAsset(c.env.DB, dept(c).id, c.req.param("id"));
  return redirect(c, "/gear", { msg: "Gear deleted." });
});

const KIND_TO_CATEGORY: Record<AssetKind, NeedCategory> = {
  turnout: "turnout_ppe",
  helmet: "turnout_ppe",
  hood: "turnout_ppe",
  gloves: "turnout_ppe",
  boots: "turnout_ppe",
  scba: "scba",
  scba_cylinder: "scba",
  apparatus: "vehicle",
  radio: "radios_pagers",
  wildland_ppe: "wildland_ppe",
  other: "other",
};

// Turns a tracked item into a need, with the reason grant priorities care about.
gearRoutes.post("/gear/:id/need", async (c) => {
  const d = dept(c);
  const a = await getAsset(c.env.DB, d.id, c.req.param("id"));
  if (!a) return c.notFound();
  const p = projectAsset(a, todayIso());
  const reason: NeedReason =
    p.status === "expired" ? "replace_expired" : a.condition === "poor" || a.condition === "out_of_service" ? "replace_damaged" : "upgrade";
  await insertNeed(c.env.DB, d.id, {
    asset_id: a.id,
    category: KIND_TO_CATEGORY[isAssetKind(a.kind) ? a.kind : "other"],
    reason,
    description: `Replace ${a.description || kindLabel(a.kind).toLowerCase()}`,
    quantity: a.quantity,
    estimated_cost: 0,
    used_equipment: 0,
    priority: reason === "upgrade" ? "medium" : "high",
    status: "open",
  });
  return redirect(c, "/needs", { msg: "Need added. Add a cost estimate so it can go into an application." });
});

// Needs

const NeedFields: FC<{ n?: Partial<NeedRow>; assets: AssetRow[] }> = ({ n = {}, assets }) => (
  <>
    <Field label="What you need">
      <input name="description" required value={n.description ?? ""} maxlength={200} />
    </Field>
    <div class="grid2">
      <Field label="Category">
        <Select name="category" options={NEED_CATEGORIES} value={n.category ?? "turnout_ppe"} />
      </Field>
      <Field label="Why" hint="Grant priorities depend on this.">
        <Select name="reason" options={NEED_REASONS} value={n.reason ?? "replace_expired"} />
      </Field>
      <Field label="Quantity">
        <input name="quantity" inputmode="numeric" value={n.quantity ?? 1} required />
      </Field>
      <Field label="Estimated total cost ($)" hint="A vendor quote is best.">
        <input name="estimated_cost" inputmode="numeric" value={n.estimated_cost || ""} />
      </Field>
      <Field label="Your priority">
        <Select name="priority" options={PRIORITIES} value={n.priority ?? "medium"} />
      </Field>
      <Field label="Status">
        <Select name="status" options={NEED_STATUSES} value={n.status ?? "open"} />
      </Field>
      <Field label="Replaces tracked gear">
        <select name="asset_id">
          <option value="">None</option>
          {assets.map((a) => (
            <option value={a.id} selected={a.id === n.asset_id}>
              {a.quantity} × {a.description || kindLabel(a.kind)} ({fmtDate(a.manufacture_date)})
            </option>
          ))}
        </select>
      </Field>
    </div>
    <Check name="used_equipment" checked={!!n.used_equipment} label="This is used equipment" />
  </>
);

async function parseNeed(form: FormBody, db: D1Database, departmentId: string): Promise<NeedInput> {
  const assetId = optText(form, "asset_id", 64);
  if (assetId && !(await getAsset(db, departmentId, assetId))) throw new FormError("That gear isn't in your tracker.");
  return {
    asset_id: assetId,
    category: choice(form, "category", NEED_CATEGORIES, "other"),
    reason: choice(form, "reason", NEED_REASONS, "other"),
    description: requiredText(form, "description", "What you need", 200),
    quantity: optNumber(form, "quantity", "Quantity", { min: 1, max: 10_000 }) ?? 1,
    estimated_cost: optNumber(form, "estimated_cost", "Estimated cost", { max: 100_000_000 }) ?? 0,
    used_equipment: checkbox(form, "used_equipment"),
    priority: choice(form, "priority", PRIORITIES, "medium"),
    status: choice(form, "status", NEED_STATUSES, "open"),
  };
}

gearRoutes.get("/needs", async (c) => {
  const d = dept(c);
  const [needs, assets] = await Promise.all([listNeeds(c.env.DB, d.id), listAssets(c.env.DB, d.id)]);
  return page(
    c,
    { title: "Needs", active: "needs" },
    <>
      <h1>Needs</h1>
      <p class="lede">What the department needs, why, and what it costs. The grant matcher and every application draw from this list.</p>
      <section class="card">
        {needs.length ? (
          <ul class="items">
            {needs.map((n) => (
              <li>
                <div class="item-head">
                  <a href={`/needs/${n.id}`}>
                    <strong>
                      {n.quantity} × {n.description}
                    </strong>
                  </a>
                  <span>{money(n.estimated_cost)}</span>
                </div>
                <div class="sub">
                  {NEED_CATEGORIES[n.category as NeedCategory] ?? n.category} · {NEED_REASONS[n.reason as NeedReason] ?? n.reason} ·{" "}
                  {NEED_STATUSES[n.status as keyof typeof NEED_STATUSES] ?? n.status}
                  {n.used_equipment ? " · used" : ""}
                </div>
                {!n.estimated_cost ? <p class="hint">Add a cost estimate.</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No needs yet. Add them here, or from expiring gear on the Gear page.</Empty>
        )}
      </section>
      <section class="card" id="add">
        <h2>Add a need</h2>
        <form method="post" action="/needs" class="stack">
          <NeedFields assets={assets} />
          <button type="submit">Add need</button>
        </form>
      </section>
    </>,
  );
});

gearRoutes.post("/needs", async (c) => {
  const d = dept(c);
  await insertNeed(c.env.DB, d.id, await parseNeed(await c.req.parseBody(), c.env.DB, d.id));
  return redirect(c, "/needs", { msg: "Need added." });
});

gearRoutes.get("/needs/:id", async (c) => {
  const d = dept(c);
  const [n, assets] = await Promise.all([getNeed(c.env.DB, d.id, c.req.param("id")), listAssets(c.env.DB, d.id)]);
  if (!n) return c.notFound();
  return page(
    c,
    { title: "Edit need", active: "needs" },
    <>
      <p>
        <a href="/needs">← Needs</a>
      </p>
      <h1>{n.description}</h1>
      <section class="card">
        <form method="post" action={`/needs/${n.id}`} class="stack">
          <NeedFields n={n} assets={assets} />
          <button type="submit">Save</button>
        </form>
      </section>
      {isLead(c) ? (
        <form method="post" action={`/needs/${n.id}/delete`}>
          <button type="submit" class="danger">
            Delete this need
          </button>
        </form>
      ) : null}
    </>,
  );
});

gearRoutes.post("/needs/:id", async (c) => {
  const d = dept(c);
  const id = c.req.param("id");
  if (!(await getNeed(c.env.DB, d.id, id))) return c.notFound();
  await updateNeed(c.env.DB, d.id, id, await parseNeed(await c.req.parseBody(), c.env.DB, d.id));
  return redirect(c, "/needs", { msg: "Need saved." });
});

gearRoutes.post("/needs/:id/delete", requireLead, async (c) => {
  await deleteNeed(c.env.DB, dept(c).id, c.req.param("id"));
  return redirect(c, "/needs", { msg: "Need deleted." });
});
