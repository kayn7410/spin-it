import { createFileRoute } from "@tanstack/react-router";
import { readData } from "@/server/store";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/api/state")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async () => {
        const data = readData();
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { "Content-Type": "application/json", ...cors },
        });
      },
    },
  },
});
