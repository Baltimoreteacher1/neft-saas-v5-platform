/**
 * Neft SaaS v5 — Cloudflare Worker API (module syntax, no bundler)
 * Bindings:
 * - DB (D1)
 * Env vars:
 * - APP_ENV=prod|dev
 * - JWT_SECRET=long random secret
 * - TURNSTILE_SECRET=optional
 */
import { sqlInit, db } from "./db.mjs";
import { router } from "./router.mjs";
import { json, err, cors, parseJson, nowIso } from "./util.mjs";
import { sign, verify } from "./jwt.mjs";

export default {
  async fetch(req, env, ctx) {
    await sqlInit(env); // lazy init guard
    const origin = req.headers.get("Origin") || "*";

    if (req.method === "OPTIONS") return cors(json({ ok: true }), origin);

    try {
      const res = await router(req, env, ctx);
      return cors(res, origin);
    } catch (e) {
      return cors(err(String(e?.message || e), 500), origin);
    }
  }
};

// ---------------- Routes ----------------
router.route("GET", "/health", async () => json({ ok: true, t: nowIso() }));

// Teacher: create class
router.route("POST", "/v1/teacher/create-class", async (req, env) => {
  const body = await parseJson(req);
  const displayName = String(body.displayName || "Teacher").slice(0, 50);
  const classCode = await db.createClass(env, { teacherName: displayName });
  return json({ classCode });
});

// Teacher: create student PIN
router.route("POST", "/v1/teacher/create-student", async (req, env) => {
  const body = await parseJson(req);
  const classCode = String(body.classCode || "").toUpperCase();
  const displayName = String(body.displayName || "Student").slice(0, 50);
  const pin = String(body.pin || "");
  const student = await db.createStudent(env, { classCode, displayName, pin });
  return json({ student });
});

// Student login: returns token
router.route("POST", "/v1/auth/student-login", async (req, env) => {
  const body = await parseJson(req);
  const classCode = String(body.classCode || "").toUpperCase();
  const pin = String(body.pin || "");
  const student = await db.authStudent(env, { classCode, pin });
  if (!student) return err("Invalid class code or PIN.", 401);
  const token = await sign(env.JWT_SECRET, {
    sub: student.id,
    classCode: student.class_code,
    role: "student"
  }, 60 * 60 * 6); // 6 hours
  return json({
    token,
    student: {
      id: student.id,
      displayName: student.display_name,
      classCode: student.class_code
    }
  });
});

// Batch ingest attempts (student token required)
router.route("POST", "/v1/ingest/batch", async (req, env) => {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const claims = await verify(env.JWT_SECRET, token);
  if (!claims || claims.role !== "student") return err("Unauthorized.", 401);

  const body = await parseJson(req);
  const events = Array.isArray(body.events) ? body.events : [];
  if (events.length > 400) return err("Too many events in one batch.", 400);

  await db.ingestBatch(env, {
    studentId: claims.sub,
    classCode: claims.classCode,
    events
  });
  return json({ ok: true, accepted: events.length });
});

// My summary (student token)
router.route("GET", "/v1/me/summary", async (req, env) => {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const claims = await verify(env.JWT_SECRET, token);
  if (!claims || claims.role !== "student") return err("Unauthorized.", 401);

  const summary = await db.studentSummary(env, { studentId: claims.sub });
  return json(summary);
});

// Teacher export (simple shared secret header for now)
router.route("GET", "/v1/teacher/class-export", async (req, env) => {
  const url = new URL(req.url);
  const classCode = String(url.searchParams.get("classCode") || "").toUpperCase();
  const key = req.headers.get("X-Teacher-Key") || "";
  // Minimal control: require JWT_SECRET-derived key pattern in prod
  if (env.APP_ENV === "prod" && key !== env.JWT_SECRET.slice(0, 12)) return err("Forbidden.", 403);

  const data = await db.classExport(env, { classCode });
  return json(data);
});
