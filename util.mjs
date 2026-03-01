export function json(obj, status=200){
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
export function err(message, status=400){
  return json({ error: message }, status);
}
export function cors(res, origin="*"){
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Teacher-Key");
  h.set("Access-Control-Max-Age", "86400");
  return new Response(res.body, { status: res.status, headers: h });
}
export async function parseJson(req){
  const text = await req.text();
  try { return text ? JSON.parse(text) : {}; } catch { throw new Error("Invalid JSON body."); }
}
export function nowIso(){ return new Date().toISOString(); }
