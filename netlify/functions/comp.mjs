import { getStore } from "@netlify/blobs";

// Simple ID generator — no dependency needed
function makeId(len = 8) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const store = getStore({ name: "comps", consistency: "strong" });

  // POST /api/comp  — upload a comp, get back a short ID
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const id = makeId(8);
      await store.setJSON(id, body);
      return new Response(JSON.stringify({ id }), { status: 200, headers: CORS });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err.message) }), { status: 500, headers: CORS });
    }
  }

  // GET /api/comp?id=XXX  — fetch a comp by ID
  if (req.method === "GET") {
    try {
      const url = new URL(req.url);
      const id = url.searchParams.get("id");
      if (!id) return new Response(JSON.stringify({ error: "Missing id" }), { status: 400, headers: CORS });

      const data = await store.get(id, { type: "json" });
      if (!data) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: CORS });

      return new Response(JSON.stringify(data), { status: 200, headers: CORS });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err.message) }), { status: 500, headers: CORS });
    }
  }

  return new Response("Method not allowed", { status: 405, headers: CORS });
};

export const config = { path: "/api/comp" };
