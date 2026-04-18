import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { deleteRoleWeight, setChannelId, upsertRoleWeight } from "@/server/store";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const RoleSchema = z.object({
  id: z.string().optional(),
  role: z.string().min(1).max(100),
  weight: z.number().int().min(1).max(1000),
});

const ChannelSchema = z.object({
  channelId: z.string().max(64),
});

export const Route = createFileRoute("/api/config")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null);
        // Determine action: role upsert or channel set
        if (body && typeof body === "object" && "channelId" in body) {
          const parsed = ChannelSchema.safeParse(body);
          if (!parsed.success) {
            return new Response(JSON.stringify({ error: "Invalid input" }), {
              status: 400,
              headers: { "Content-Type": "application/json", ...cors },
            });
          }
          setChannelId(parsed.data.channelId);
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...cors },
          });
        }
        const parsed = RoleSchema.safeParse(body);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: "Invalid input" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...cors },
          });
        }
        const saved = upsertRoleWeight(parsed.data);
        return new Response(JSON.stringify({ roleWeight: saved }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...cors },
        });
      },
      DELETE: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        if (!id) {
          return new Response(JSON.stringify({ error: "Missing id" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...cors },
          });
        }
        const ok = deleteRoleWeight(id);
        return new Response(JSON.stringify({ ok }), {
          status: ok ? 200 : 404,
          headers: { "Content-Type": "application/json", ...cors },
        });
      },
    },
  },
});
