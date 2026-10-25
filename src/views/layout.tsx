import type { Child, FC } from "hono/jsx";
import { raw } from "hono/html";
import type { DepartmentRow, UserRow } from "../db";

const NAV = [
  { href: "/", label: "Dashboard", key: "home" },
  { href: "/gear", label: "Gear", key: "gear" },
  { href: "/needs", label: "Needs", key: "needs" },
  { href: "/grants", label: "Grants", key: "grants" },
  { href: "/applications", label: "Applications", key: "applications" },
  { href: "/department", label: "Department", key: "department" },
  { href: "/team", label: "Team", key: "team" },
];

export interface LayoutProps {
  title: string;
  active?: string;
  user?: UserRow | null;
  dept?: DepartmentRow | null;
  msg?: string | null;
  err?: string | null;
  children?: Child;
}

export const Layout: FC<LayoutProps> = ({ title, active, user, dept, msg, err, children }) => (
  <>
    {raw("<!doctype html>")}
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${title} · Grant Firefight`}</title>
        <link rel="stylesheet" href="/app.css" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <script src="/app.js" defer></script>
      </head>
      <body>
        <header class="top">
          <div class="top-inner">
            <a class="brand" href="/">
              Grant Firefight
            </a>
            {dept ? <span class="dept-name">{dept.name}</span> : null}
          </div>
          {dept ? (
            <nav class="nav" aria-label="Main">
              {NAV.map((n) => (
                <a href={n.href} class={n.key === active ? "active" : undefined} aria-current={n.key === active ? "page" : undefined}>
                  {n.label}
                </a>
              ))}
            </nav>
          ) : null}
        </header>
        <main>
          {msg ? <p class="flash ok" role="status">{msg}</p> : null}
          {err ? <p class="flash bad" role="alert">{err}</p> : null}
          {children}
        </main>
        <footer class="foot">
          <p>
            Grant Firefight coaches and checks. Your department writes every word and submits every application.
            {user ? <> Signed in as {user.email}{user.role === "helper" ? " (helper)" : ""}.</> : null}
          </p>
        </footer>
      </body>
    </html>
  </>
);
