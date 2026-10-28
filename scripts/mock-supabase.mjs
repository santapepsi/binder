// Minimal stand-in for Supabase (auth + the PostgREST calls the app makes), for
// local sync tests. Usage: node scripts/mock-supabase.mjs [port] [--no-show-name]
import http from "node:http";

const port = Number(process.argv[2] || 54321);
const noShowName = process.argv.includes("--no-show-name");
const tables = { binders: new Map(), binder_cards: new Map(), binder_tables: new Map() };
const storage = new Map();
const user = { id: "00000000-0000-4000-8000-000000000001", email: "test@example.com" };
let clock = Date.now();
const now = () => new Date(++clock).toISOString();

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
};
const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, { ...cors, "Content-Type": type });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const read = (req) => new Promise((resolve) => { const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => resolve(Buffer.concat(chunks))); });

http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, "");
  const url = new URL(req.url, "http://x");
  const body = await read(req);
  if (url.pathname.startsWith("/auth/v1/")) {
    return send(res, 200, { access_token: "t", refresh_token: "r", expires_in: 3600, user });
  }
  if (url.pathname.startsWith("/storage/v1/object/")) {
    const key = url.pathname.replace(/^\/storage\/v1\/object\/(authenticated\/|public\/)?/, "");
    if (req.method === "POST") { storage.set(key, body); return send(res, 200, { Key: key }); }
    return storage.has(key) ? send(res, 200, storage.get(key), "application/octet-stream") : send(res, 404, { error: "not found" });
  }
  const name = url.pathname.replace("/rest/v1/", "");
  const table = tables[name];
  if (!table) return send(res, 404, { code: "PGRST205", message: `Could not find the table 'public.${name}'` });
  const key = name === "binder_tables" ? "user_id" : "id";
  if (req.method === "POST") {
    const rows = JSON.parse(body.toString());
    for (const row of rows) {
      if (noShowName && name === "binders" && "show_name" in row)
        return send(res, 400, { code: "PGRST204", message: "Could not find the 'show_name' column of 'binders' in the schema cache" });
      table.set(row[key], { ...table.get(row[key]), ...row, user_id: user.id, server_updated_at: now() });
    }
    return send(res, 201, "");
  }
  let rows = [...table.values()];
  const gt = url.searchParams.get("server_updated_at");
  if (gt?.startsWith("gt.")) rows = rows.filter((row) => row.server_updated_at > gt.slice(3));
  rows.sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at));
  return send(res, 200, rows);
}).listen(port, () => console.log(`mock supabase on ${port}${noShowName ? " (no show_name column)" : ""}`));
