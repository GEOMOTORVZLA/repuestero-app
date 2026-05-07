import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async () => {
  return new Response(JSON.stringify({ ok: true, ping: "notify-registro" }), {
    headers: { "Content-Type": "application/json" },
  });
});