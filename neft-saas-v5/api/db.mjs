// D1 database layer (safe, parameterized)
let _initDone = false;

export async function sqlInit(env){
  if (_initDone) return;
  // no-op; migrations create schema
  _initDone = true;
}

export const db = {
  async createClass(env, { teacherName }){
    const classCode = await genClassCode(env);
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO classes(id, class_code, teacher_name, created_at) VALUES(?,?,?,?)`
    ).bind(id, classCode, teacherName, new Date().toISOString()).run();
    return classCode;
  },

  async createStudent(env, { classCode, displayName, pin }){
    if (!/^[A-Z0-9]{5}$/.test(classCode)) throw new Error("Invalid classCode format.");
    if (!/^[0-9]{4}$/.test(pin)) throw new Error("PIN must be 4 digits.");
    const cls = await env.DB.prepare(`SELECT id FROM classes WHERE class_code=?`).bind(classCode).first();
    if (!cls) throw new Error("Class not found.");
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO students(id, class_id, class_code, display_name, pin_hash, created_at)
       VALUES(?,?,?,?,?,?)`
    ).bind(id, cls.id, classCode, displayName, await hashPin(pin), new Date().toISOString()).run();
    return { id, classCode, displayName };
  },

  async authStudent(env, { classCode, pin }){
    if (!/^[A-Z0-9]{5}$/.test(classCode)) return null;
    if (!/^[0-9]{4}$/.test(pin)) return null;
    const rows = await env.DB.prepare(
      `SELECT id, class_code, display_name, pin_hash FROM students WHERE class_code=?`
    ).bind(classCode).all();

    for (const r of rows.results || []){
      if (await verifyPin(pin, r.pin_hash)) return r;
    }
    return null;
  },

  async ingestBatch(env, { studentId, classCode, events }){
    const ts = new Date().toISOString();
    const stmt = env.DB.prepare(
      `INSERT INTO attempts(id, student_id, class_code, event_type, payload_json, created_at)
       VALUES(?,?,?,?,?,?)`
    );

    const batch = [];
    for (const e of events){
      const id = crypto.randomUUID();
      batch.push(stmt.bind(id, studentId, classCode, String(e.type || "attempt"), JSON.stringify(e), ts));
    }
    if (batch.length) await env.DB.batch(batch);
  },

  async studentSummary(env, { studentId }){
    const attempts = await env.DB.prepare(
      `SELECT payload_json FROM attempts WHERE student_id=? ORDER BY created_at DESC LIMIT 5000`
    ).bind(studentId).all();

    const skill = new Map();
    let total=0, correct=0;

    for (const row of (attempts.results || [])){
      const p = safeJson(row.payload_json);
      if (!p || p.type !== "attempt") continue;
      total++;
      if (p.correct) correct++;
      const k = String(p.skill || "unknown");
      const v = skill.get(k) || { seen:0, correct:0, missed:0 };
      v.seen += 1;
      if (p.correct) v.correct += 1; else v.missed += 1;
      skill.set(k, v);
    }

    const skills = Array.from(skill.entries()).map(([k,v]) => ({
      skill: k,
      seen: v.seen,
      correct: v.correct,
      missed: v.missed,
      pct: v.seen ? Math.round((v.correct / v.seen) * 100) : 0
    })).sort((a,b)=> (b.missed - a.missed));

    return {
      totals: { attempts: total, correct, accuracy: total ? Math.round((correct/total)*100) : 0 },
      skills
    };
  },

  async classExport(env, { classCode }){
    if (!/^[A-Z0-9]{5}$/.test(classCode)) throw new Error("Invalid classCode.");
    const students = await env.DB.prepare(
      `SELECT id, display_name FROM students WHERE class_code=? ORDER BY display_name`
    ).bind(classCode).all();

    const out = [];
    for (const s of (students.results || [])){
      const summary = await this.studentSummary(env, { studentId: s.id });
      out.push({ studentId: s.id, displayName: s.display_name, summary });
    }
    return { classCode, students: out };
  }
};

async function genClassCode(env){
  // 5 chars base32-ish; retry on collision
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let i=0;i<12;i++){
    let code = "";
    for (let j=0;j<5;j++) code += alphabet[Math.floor(Math.random()*alphabet.length)];
    const exists = await env.DB.prepare(`SELECT 1 FROM classes WHERE class_code=?`).bind(code).first();
    if (!exists) return code;
  }
  throw new Error("Failed to allocate class code.");
}

// PIN hashing (PBKDF2)
async function hashPin(pin){
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), { name:"PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", salt, iterations: 120000, hash: "SHA-256" }, key, 256);
  const hash = new Uint8Array(bits);
  return "v1:" + b64(salt) + ":" + b64(hash);
}
async function verifyPin(pin, stored){
  try{
    const [v, saltB64, hashB64] = String(stored).split(":");
    if (v !== "v1") return false;
    const salt = ub64(saltB64);
    const expected = ub64(hashB64);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), { name:"PBKDF2" }, false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", salt, iterations: 120000, hash: "SHA-256" }, key, 256);
    const got = new Uint8Array(bits);
    return timingSafeEqual(got, expected);
  } catch { return false; }
}

function timingSafeEqual(a,b){
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i=0;i<a.length;i++) r |= (a[i] ^ b[i]);
  return r === 0;
}

function b64(u8){ return btoa(String.fromCharCode(...u8)); }
function ub64(s){ return new Uint8Array([...atob(s)].map(c=>c.charCodeAt(0))); }
function safeJson(s){ try { return JSON.parse(s); } catch { return null; } }
