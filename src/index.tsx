import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { identify } from "./auth";
import { getDepartment, getUserByEmail } from "./db";
import { FormError } from "./forms";
import { page, redirect, refererPath, requireDept, type AppEnv } from "./http";
import { applicationRoutes } from "./routes/applications";
import { gearRoutes } from "./routes/gear";
import { homeRoutes } from "./routes/home";
import { sectionRoutes } from "./routes/sections";

const app = new Hono<AppEnv>();

app.use(
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      mediaSrc: ["'self'", "blob:"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
    permissionsPolicy: { microphone: ["self"], camera: [], geolocation: [] },
  }),
);
app.use(csrf());

app.get("/healthz", (c) => c.text("ok"));

app.use("*", async (c, next) => {
  const email = await identify(c.req.raw, c.env);
  if (!email) {
    return page(
      c,
      { title: "Sign in" },
      <section class="card narrow">
        <h1>Sign in to Grant Firefight</h1>
        <p>Open the sign-in link your department received. You'll get a one-time code by email.</p>
      </section>,
      401,
    );
  }
  const user = await getUserByEmail(c.env.DB, email);
  const dept = user?.department_id ? await getDepartment(c.env.DB, user.department_id) : null;
  c.set("email", email);
  c.set("user", user);
  c.set("dept", dept);
  await next();
});

app.use("*", async (c, next) => {
  if (c.req.path === "/onboarding") return next();
  return requireDept(c, next);
});

app.route("/", homeRoutes);
app.route("/", gearRoutes);
app.route("/", applicationRoutes);
app.route("/", sectionRoutes);

app.notFound((c) =>
  page(
    c,
    { title: "Not found" },
    <section class="card narrow">
      <h1>Not found</h1>
      <p>
        That page doesn't exist, or it belongs to another department. <a href="/">Back to the dashboard</a>.
      </p>
    </section>,
    404,
  ),
);

app.onError((err, c) => {
  if (err instanceof FormError) return redirect(c, refererPath(c), { err: err.message });
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  return c.text("Something went wrong. Try again, and tell us if it keeps happening.", 500);
});

export default app;
