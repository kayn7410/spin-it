import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { addManualEntry, clearEntries, removeEntry } from "@/server/store";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const PostSchema = z.object({
  name: z.string().min(1).max(64),
  weight: z.number().int().min(1).max(1000).optional(),
});

export const Route = createFileRoute("/api/entries")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }: { request: Request }) => {
        const body = await request.json().catch(() => null);
        const parsed = PostSchema.safeParse(body);
        if (!parsed.success) {
          return new Response(
            JSON.stringify({ error: "Invalid input", details: parsed.error.flatten() }),
            { status: 400, headers: { "Content-Type": "application/json", ...cors } },
          );
        }
        const entry = addManualEntry(parsed.data.name, parsed.data.weight ?? 1);
        return new Response(JSON.stringify({ entry }), {
          status: 201,
          headers: { "Content-Type": "application/json", ...cors },
        });
      },
      DELETE: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("all") === "1") {
          clearEntries();
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...cors },
          });
        }
        const id = url.searchParams.get("id");
        if (!id) {
          return new Response(JSON.stringify({ error: "Missing id" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...cors },
          });
        }
        const ok = removeEntry(id);
        return new Response(JSON.stringify({ ok }), {
          status: ok ? 200 : 404,
          headers: { "Content-Type": "application/json", ...cors },
        });
      },
    },
  },
} as any);
