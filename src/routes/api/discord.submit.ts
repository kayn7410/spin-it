import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { addDiscordEntry } from "@/server/store";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const Schema = z.object({
  name: z.string().min(1).max(64),
  discordUserId: z.string().min(1).max(64),
  roles: z.array(z.string().min(1).max(100)).max(50),
});

export const Route = createFileRoute("/api/discord/submit")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }: { request: Request }) => {
        const body = await request.json().catch(() => null);
        const parsed = Schema.safeParse(body);
        if (!parsed.success) {
          return new Response(
            JSON.stringify({ error: "Invalid input", details: parsed.error.flatten() }),
            { status: 400, headers: { "Content-Type": "application/json", ...cors } },
          );
        }
        const result = addDiscordEntry(parsed.data);
        if (!result.entry) {
          return new Response(JSON.stringify({ ok: false, reason: result.reason }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...cors },
          });
        }
        return new Response(JSON.stringify({ ok: true, entry: result.entry }), {
          status: 201,
          headers: { "Content-Type": "application/json", ...cors },
        });
      },
    },
  },
});
