import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { hasSharePassword, verifySharePassword } from "@/lib/store.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

const Schema = z.object({ password: z.string().max(200) });

export const Route = createFileRoute("/api/share/verify")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async () => json({ requiresPassword: hasSharePassword() }),
      POST: async ({ request }: { request: Request }) => {
        const body = await request.json().catch(() => null);
        const parsed = Schema.safeParse(body);
        if (!parsed.success) return json({ ok: false, error: "Invalid input" }, 400);
        const ok = verifySharePassword(parsed.data.password);
        return json({ ok }, ok ? 200 : 401);
      },
    },
  },
} as any);