// Discord bot — fully local Node.js script.
// Reads names from a configured channel and POSTs them to your local wheel API.
//
// SETUP
//   1. cd bot && npm install
//   2. cp .env.example .env  (then edit)
//   3. node bot.mjs
//
// .env
//   DISCORD_TOKEN=your-bot-token
//   API_URL=http://localhost:8080         # your wheel app
//   CHANNEL_ID=1234567890                 # channel the bot listens to
//
// Behavior
//   - Listens to messages in CHANNEL_ID only (ignores everything else).
//   - The full message content (trimmed, max 64 chars) is used as the name.
//   - Each user can only submit ONCE; later messages from same user are ignored.
//   - Entry weight is decided by the user's highest-weighted role
//     (configured in the web UI Settings).

import { Client, GatewayIntentBits, Partials, Events } from "discord.js";
import "dotenv/config";

const TOKEN = process.env.DISCORD_TOKEN;
const API_URL = (process.env.API_URL || "http://localhost:8080").replace(/\/$/, "");
const CHANNEL_ID = process.env.CHANNEL_ID;

if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN in environment");
  process.exit(1);
}
if (!CHANNEL_ID) {
  console.error("Missing CHANNEL_ID in environment");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once(Events.ClientReady, (c) => {
  console.log(`✓ Logged in as ${c.user.tag}`);
  console.log(`  Listening to channel: ${CHANNEL_ID}`);
  console.log(`  Posting to: ${API_URL}/api/discord/submit`);
});

client.on(Events.MessageCreate, async (msg) => {
  try {
    if (msg.author.bot) return;
    if (msg.channelId !== CHANNEL_ID) return;

    const name = (msg.content || "").trim();
    if (!name) return;

    // Resolve roles by name (skip @everyone here, the API treats it as default)
    const roleNames =
      msg.member?.roles?.cache
        ?.filter((r) => r.name !== "@everyone")
        ?.map((r) => r.name) ?? [];

    const res = await fetch(`${API_URL}/api/discord/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.slice(0, 64),
        discordUserId: msg.author.id,
        roles: roleNames,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 201 && data.entry) {
      await msg.react("✅").catch(() => {});
      console.log(
        `+ Added "${data.entry.name}" (×${data.entry.weight}, ${data.entry.discordRole})`,
      );
    } else if (data.reason === "duplicate-user") {
      await msg.react("⚠️").catch(() => {});
      console.log(`- Ignored duplicate from ${msg.author.tag}`);
    } else {
      await msg.react("❌").catch(() => {});
      console.warn(`! API error ${res.status}:`, data);
    }
  } catch (err) {
    console.error("Handler error:", err);
  }
});

client.login(TOKEN);
