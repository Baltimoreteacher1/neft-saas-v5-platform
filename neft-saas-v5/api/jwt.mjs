// Minimal JWT HS256 (no deps) — for session tokens
function b64url(u8){
  return btoa(String.fromCharCode(...u8)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function ub64url(s){
  s = s.replace(/-/g,"+").replace(/_/g,"/");
  while (s.length % 4) s += "=";
  return new Uint8Array([...atob(s)].map(c=>c.charCodeAt(0)));
}
async function hmac(secret, msg){
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["sign","verify"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return new Uint8Array(sig);
}
function safeEq(a,b){
  if (a.length !== b.length) return false;
  let r=0; for (let i=0;i<a.length;i++) r |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return r===0;
}

export async function sign(secret, claims, ttlSec){
  const header = { alg:"HS256", typ:"JWT" };
  const now = Math.floor(Date.now()/1000);
  const payload = Object.assign({}, claims, { iat: now, exp: now + ttlSec });
  const h = b64url(new TextEncoder().encode(JSON.stringify(header)));
  const p = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const data = `${h}.${p}`;
  const sig = await hmac(secret, data);
  return `${data}.${b64url(sig)}`;
}

export async function verify(secret, token){
  try{
    const parts = String(token||"").split(".");
    if (parts.length !== 3) return null;
    const [h,p,s] = parts;
    const data = `${h}.${p}`;
    const sig = await hmac(secret, data);
    const expected = b64url(sig);
    if (!safeEq(expected, s)) return null;
    const payload = JSON.parse(new TextDecoder().decode(ub64url(p)));
    const now = Math.floor(Date.now()/1000);
    if (payload.exp && now > payload.exp) return null;
    return payload;
  } catch { return null; }
}
