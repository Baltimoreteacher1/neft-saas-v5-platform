// Tiny router (no deps)
import { err } from "./util.mjs";

export const router = (function(){
  const routes = [];
  function route(method, path, handler){ routes.push({ method, path, handler }); }
  async function handle(req, env, ctx){
    const url = new URL(req.url);
    const p = url.pathname;
    for (const r of routes){
      if (r.method === req.method && r.path === p) return r.handler(req, env, ctx);
    }
    return err("Not found.", 404);
  }
  handle.route = route;
  return handle;
})();
