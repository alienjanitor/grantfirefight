import type { Context, MiddlewareHandler } from "hono";
import type { Child } from "hono/jsx";
import type { DepartmentRow, UserRow } from "./db";
import { Layout, type LayoutProps } from "./views/layout";

export type AppEnv = {
  Bindings: Env;
  Variables: { email: string; user: UserRow | null; dept: DepartmentRow | null };
};

export type Ctx = Context<AppEnv>;

export function user(c: Ctx): UserRow {
  return c.get("user")!;
}

export function dept(c: Ctx): DepartmentRow {
  return c.get("dept")!;
}

export function isLead(c: Ctx): boolean {
  return c.get("user")?.role === "grant_lead";
}

export function page(c: Ctx, props: Omit<LayoutProps, "user" | "dept" | "msg" | "err" | "children">, body: Child, status: 200 | 400 | 401 | 403 | 404 = 200) {
  return c.html(
    <Layout {...props} user={c.get("user")} dept={c.get("dept")} msg={c.req.query("msg")} err={c.req.query("err")}>
      {body}
    </Layout>,
    status,
  );
}

export function redirect(c: Ctx, path: string, flash: { msg?: string; err?: string } = {}, hash = "") {
  const url = new URL(path, "http://x");
  url.searchParams.delete("msg");
  url.searchParams.delete("err");
  if (flash.msg) url.searchParams.set("msg", flash.msg);
  if (flash.err) url.searchParams.set("err", flash.err);
  return c.redirect(`${url.pathname}${url.search}${hash}`, 303);
}

// Same-origin path of the page that submitted the form, for sending errors back.
export function refererPath(c: Ctx): string {
  const ref = c.req.header("referer");
  if (!ref) return "/";
  try {
    const u = new URL(ref);
    return u.origin === new URL(c.req.url).origin ? `${u.pathname}${u.search}` : "/";
  } catch {
    return "/";
  }
}

export const requireDept: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("dept")) return c.redirect("/onboarding", 303);
  await next();
};

export const requireLead: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!isLead(c)) {
    return redirect(c, refererPath(c), { err: "Only the department's grant lead can do that." });
  }
  await next();
};
