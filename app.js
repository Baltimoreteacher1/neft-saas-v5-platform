// Neft SaaS v5 Client — Offline-first event queue + simple login
// Set API base via Cloudflare Pages env var injection pattern:
// In Pages, define API_BASE; Cloudflare injects as window.ENV if you add it yourself.
// For simplicity, we default to same-origin /api if you proxy, otherwise set manually.

const DEFAULT_API_BASE = (window.API_BASE || "").trim();
const API_BASE = DEFAULT_API_BASE || localStorage.getItem("API_BASE") || "https://YOUR-WORKER.workers.dev";

const app = document.getElementById("app");

const LS = {
  token: "neft_v5_token",
  student: "neft_v5_student",
  api: "neft_v5_api_base",
  queue: "neft_v5_event_queue"
};

function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));}

function loadQueue(){
  try { return JSON.parse(localStorage.getItem(LS.queue) || "[]"); } catch { return []; }
}
function saveQueue(q){ localStorage.setItem(LS.queue, JSON.stringify(q)); }

async function api(path, opts={}){
  const token = localStorage.getItem(LS.token) || "";
  const headers = Object.assign({"Content-Type":"application/json"}, opts.headers || {});
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, Object.assign({}, opts, {headers}));
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error((data && data.error) ? data.error : `HTTP ${res.status}`);
  return data;
}

function viewLogin(errorMsg=""){
  app.innerHTML = `
    <div class="card">
      <h1>Neft SaaS v5 — Login</h1>
      <p class="small">API Base: <span class="badge">${escapeHtml(API_BASE)}</span></p>
      <div class="row" style="margin-top:10px">
        <input id="classCode" placeholder="Class Code (e.g., 6A2K9)" />
        <input id="pin" placeholder="Student PIN (4 digits)" inputmode="numeric" />
        <button class="primary" id="btnLogin">Start</button>
      </div>
      <p class="small">Teacher creates a class code; students join with a 4-digit PIN. No email required.</p>
      ${errorMsg ? `<p style="color:#c62828;font-weight:700">${escapeHtml(errorMsg)}</p>` : ""}
      <hr style="border:none;border-top:1px solid rgba(0,0,0,.08);margin:16px 0"/>
      <div class="row">
        <input id="apiBase" placeholder="Optional: set API base URL" />
        <button id="btnSetApi">Save API</button>
      </div>
      <p class="small">If you haven't deployed your Worker yet, leave it for later.</p>
    </div>
  `;

  document.getElementById("btnSetApi").onclick = () => {
    const v = (document.getElementById("apiBase").value || "").trim();
    if (!v) return;
    localStorage.setItem("API_BASE", v);
    localStorage.setItem(LS.api, v);
    location.reload();
  };

  document.getElementById("btnLogin").onclick = async () => {
    const classCode = (document.getElementById("classCode").value || "").trim().toUpperCase();
    const pin = (document.getElementById("pin").value || "").trim();
    try {
      const data = await api("/v1/auth/student-login", {
        method: "POST",
        body: JSON.stringify({ classCode, pin })
      });
      localStorage.setItem(LS.token, data.token);
      localStorage.setItem(LS.student, JSON.stringify(data.student));
      viewPlay();
    } catch (e) {
      viewLogin(String(e.message || e));
    }
  };
}

function viewPlay(){
  const student = JSON.parse(localStorage.getItem(LS.student) || "null");
  if (!student) return viewLogin("No student session found.");

  app.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <div>
          <h1>Play Session</h1>
          <p class="small">Student: <span class="badge">${escapeHtml(student.displayName)}</span>
          Class: <span class="badge">${escapeHtml(student.classCode)}</span></p>
        </div>
        <div class="row">
          <button id="btnFlush">Sync</button>
          <button id="btnExport">Export</button>
          <button id="btnLogout">Logout</button>
        </div>
      </div>

      <p>Use this client as your SaaS backbone. You can embed your v3/v4 game here and call <code>logAttempt()</code> on each answer.</p>

      <div class="row" style="margin-top:12px">
        <button class="primary" id="btnDemoCorrect">Demo: Correct Attempt</button>
        <button id="btnDemoWrong">Demo: Wrong Attempt</button>
      </div>

      <p class="small" id="syncStatus"></p>
      <pre id="debug"></pre>
    </div>
  `;

  document.getElementById("btnLogout").onclick = () => {
    localStorage.removeItem(LS.token);
    localStorage.removeItem(LS.student);
    viewLogin();
  };

  document.getElementById("btnFlush").onclick = flushQueue;
  document.getElementById("btnExport").onclick = exportMySummary;

  document.getElementById("btnDemoCorrect").onclick = () => logAttempt({
    questionId: "DEMO-001",
    skill: "6.EE.B.8",
    correct: true,
    answer: "x > 3",
    expected: "x > 3",
    durationMs: 4200,
    difficulty: 2,
    mode: "mcq"
  });

  document.getElementById("btnDemoWrong").onclick = () => logAttempt({
    questionId: "DEMO-002",
    skill: "6.EE.B.8",
    correct: false,
    answer: "x ≥ 3",
    expected: "x > 3",
    durationMs: 6100,
    difficulty: 2,
    mode: "mcq",
    misconception: "open_vs_closed"
  });

  updateDebug();
}

function updateDebug(){
  const q = loadQueue();
  const status = document.getElementById("syncStatus");
  const dbg = document.getElementById("debug");
  if (status) status.textContent = `Queued events: ${q.length}`;
  if (dbg) dbg.textContent = JSON.stringify({ apiBase: API_BASE, queued: q.slice(-10) }, null, 2);
}

function logAttempt(evt){
  // Offline-first: enqueue immediately; flush when possible
  const q = loadQueue();
  q.push({
    t: Date.now(),
    type: "attempt",
    ...evt
  });
  saveQueue(q);
  updateDebug();
}

async function flushQueue(){
  const q = loadQueue();
  if (!q.length) return updateDebug();

  try {
    await api("/v1/ingest/batch", {
      method: "POST",
      body: JSON.stringify({ events: q })
    });
    saveQueue([]);
  } catch (e) {
    // keep queue; just report
    console.warn("Flush failed:", e);
  }
  updateDebug();
}

async function exportMySummary(){
  try {
    const data = await api("/v1/me/summary");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "my-summary.json";
    a.click();
  } catch (e) {
    alert("Export failed: " + String(e.message || e));
  }
}

(function init(){
  // Best-effort background sync
  setInterval(() => { flushQueue(); }, 12000);
  const hasStudent = !!localStorage.getItem(LS.student);
  if (hasStudent) viewPlay();
  else viewLogin();
})();
