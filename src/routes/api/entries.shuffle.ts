import { createFileRoute } from "@tanstack/react-router";
import { shuffleEntries } from "@/lib/store.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

export const Route = createFileRoute("/api/entries/shuffle")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async () => {
        const entries = shuffleEntries();
        return json({ ok: true, count: entries.length });
      },
    },
  },
} as any);
