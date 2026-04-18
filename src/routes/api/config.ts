import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  deleteRoleWeight,
  setCenterImage,
  setImageBonus,
  setSpinDuration,
  upsertRoleWeight,
} from "@/server/store";

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

// Center image as data URL (cap ~2 MB raw → ~2.7 MB base64).
const CenterImageSchema = z.object({
  centerImage: z.string().max(3_000_000),
});

const ImageBonusSchema = z.object({
  imageBonusEnabled: z.boolean().optional(),
  imageBonusPerImage: z.number().int().min(1).max(1000).optional(),
});

const SpinDurationSchema = z.object({
  spinDurationSec: z.number().min(1).max(20),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

export const Route = createFileRoute("/api/config")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }: { request: Request }) => {
        const body = await request.json().catch(() => null);
        if (body && typeof body === "object") {
          if ("centerImage" in body) {
            const parsed = CenterImageSchema.safeParse(body);
            if (!parsed.success) return json({ error: "Invalid input" }, 400);
            setCenterImage(parsed.data.centerImage);
            return json({ ok: true });
          }
          if ("imageBonusEnabled" in body || "imageBonusPerImage" in body) {
            const parsed = ImageBonusSchema.safeParse(body);
            if (!parsed.success) return json({ error: "Invalid input" }, 400);
            setImageBonus({
              enabled: parsed.data.imageBonusEnabled,
              perImage: parsed.data.imageBonusPerImage,
            });
            return json({ ok: true });
          }
          if ("spinDurationSec" in body) {
            const parsed = SpinDurationSchema.safeParse(body);
            if (!parsed.success) return json({ error: "Invalid input" }, 400);
            setSpinDuration(parsed.data.spinDurationSec);
            return json({ ok: true });
          }
        }
        const parsed = RoleSchema.safeParse(body);
        if (!parsed.success) return json({ error: "Invalid input" }, 400);
        const saved = upsertRoleWeight(parsed.data);
        return json({ roleWeight: saved });
      },
      DELETE: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        if (!id) return json({ error: "Missing id" }, 400);
        const ok = deleteRoleWeight(id);
        return json({ ok }, ok ? 200 : 404);
      },
    },
  },
} as any);
