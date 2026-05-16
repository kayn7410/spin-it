import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  addManualEntriesBulk,
  addManualEntry,
  clearEntries,
  removeEntry,
  updateEntry,
} from "@/lib/store.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const PostSingle = z.object({
  name: z.string().min(1).max(64),
  weight: z.number().int().min(1).max(1000).optional(),
});

const PostBulk = z.object({
  names: z.array(z.string().min(1).max(64)).min(1).max(500),
  weight: z.number().int().min(1).max(1000).optional(),
});

const PutSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(64).optional(),
  weight: z.number().int().min(1).max(1000).optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

export const Route = createFileRoute("/api/entries")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }: { request: Request }) => {
        const body = await request.json().catch(() => null);
        const bulk = PostBulk.safeParse(body);
        if (bulk.success) {
          const created = addManualEntriesBulk(bulk.data.names, bulk.data.weight ?? 1);
          return json({ entries: created }, 201);
        }
        const single = PostSingle.safeParse(body);
        if (!single.success) {
          return json({ error: "Invalid input" }, 400);
        }
        const entry = addManualEntry(single.data.name, single.data.weight ?? 1);
        return json({ entry }, 201);
      },
      PUT: async ({ request }: { request: Request }) => {
        const body = await request.json().catch(() => null);
        const parsed = PutSchema.safeParse(body);
        if (!parsed.success) return json({ error: "Invalid input" }, 400);
        const updated = updateEntry(parsed.data.id, {
          name: parsed.data.name,
          weight: parsed.data.weight,
        });
        if (!updated) return json({ error: "Not found" }, 404);
        return json({ entry: updated });
      },
      DELETE: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("all") === "1") {
          const cleared = clearEntries();
          return json({ ok: true, clearedCount: cleared.length });
        }
        const id = url.searchParams.get("id");
        if (!id) return json({ error: "Missing id" }, 400);
        const ok = removeEntry(id);
        return json({ ok }, ok ? 200 : 404);
      },
    },
  },
} as any);
