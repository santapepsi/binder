// Supabase Edge Function: copies one YGOPRODeck card image into the public
// `card-images` bucket and returns it. Browsers cannot download YGOPRODeck
// images directly from another site, so the binder asks this function the
// first time it needs an image; afterwards it reads the bucket.
//
// Deploy: supabase functions deploy card-image --no-verify-jwt
// (or create it in the dashboard with "Verify JWT" turned off).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SOURCE: Record<string, string> = {
  small: "https://images.ygoprodeck.com/images/cards_small",
  full: "https://images.ygoprodeck.com/images/cards",
};
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const size = url.searchParams.get("size") ?? "small";
  if (!/^\d{1,10}$/.test(id) || !SOURCE[size]) {
    return new Response("Expected ?id=<number>&size=small|full", { status: 400, headers: CORS });
  }
  const path = `${size}/${id}.jpg`;

  // Already copied?
  const stored = await fetch(`${SUPABASE_URL}/storage/v1/object/public/card-images/${path}`);
  if (stored.ok) return image(await stored.arrayBuffer());

  const original = await fetch(`${SOURCE[size]}/${id}.jpg`, {
    headers: { "User-Agent": "Binder personal card collection (Supabase function)" },
  });
  if (!original.ok) return new Response("Image not found", { status: original.status, headers: CORS });
  const bytes = await original.arrayBuffer();

  await fetch(`${SUPABASE_URL}/storage/v1/object/card-images/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      "Content-Type": "image/jpeg",
      "Cache-Control": "max-age=31536000",
      "x-upsert": "true",
    },
    body: bytes,
  });
  return image(bytes);
});

function image(bytes: ArrayBuffer) {
  return new Response(bytes, {
    headers: { ...CORS, "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
