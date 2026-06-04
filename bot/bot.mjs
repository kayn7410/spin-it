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
//     (role IDs configured in the web UI Settings).

import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags,
} from "discord.js";
import "dotenv/config";

const TOKEN = process.env.DISCORD_TOKEN;
const API_URL = (process.env.API_URL || "http://localhost:8080").replace(/\/$/, "");
const CHANNEL_ID = process.env.CHANNEL_ID;
const GUILD_ID = process.env.GUILD_ID || "";

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

const scanCommand = new SlashCommandBuilder()
  .setName("scan")
  .setDescription(
    "Scan the channel: add the first message per user, applying role weights and Server Booster multipliers.",
  )
  .toJSON();

const crawlCommand = new SlashCommandBuilder()
  .setName("crawl")
  .setDescription(
    "Crawl the channel: add the first message per user with exactly 1 entry each (no role/boost multipliers).",
  )
  .toJSON();

async function registerCommands(appId) {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  const body = [scanCommand, crawlCommand];
  try {
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(appId, GUILD_ID), { body });
      console.log(`✓ Registered /scan and /crawl in guild ${GUILD_ID}`);
    } else {
      await rest.put(Routes.applicationCommands(appId), { body });
      console.log("✓ Registered /scan and /crawl globally (may take up to 1h to appear)");
    }
  } catch (err) {
    console.error("Failed to register slash commands:", err);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`✓ Logged in as ${c.user.tag}`);
  console.log(`  Target channel: ${CHANNEL_ID}`);
  console.log(`  Posting to: ${API_URL}/api/discord/submit`);
  await registerCommands(c.user.id);
});

/**
 * Fetch every message in the channel (paginated, oldest → newest order in result).
 */
async function fetchAllMessages(channel) {
  const all = [];
  let before;
  // Discord caps at 100 per request. Loop until empty.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;
    for (const m of batch.values()) all.push(m);
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }
  // Sort oldest first so "first message per user" is correct.
  all.sort((a, b) => Number(a.createdTimestamp - b.createdTimestamp));
  return all;
}

async function submitMessage(msg) {
  const name = (msg.content || "").trim();
  if (!name) return { skipped: "empty" };

  let member = msg.member;
  if (!member && msg.guild) {
    member = await msg.guild.members.fetch(msg.author.id).catch(() => null);
  }
  const memberRoles =
    member?.roles?.cache?.filter((r) => r.name !== "@everyone") ?? [];
  const roleNames = [...memberRoles.map((r) => r.name)];

  const attachmentCount = msg.attachments
    ? [...msg.attachments.values()].filter((a) => {
        const ct = (a.contentType || "").toLowerCase();
        return ct.startsWith("image/");
      }).length
    : 0;

  const res = await fetch(`${API_URL}/api/discord/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: name.slice(0, 500),
      discordUserId: msg.author.id,
      roles: roleNames,
      attachmentCount,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 201 && data.entry) return { added: data.entry };
  return { skipped: data.reason || `http-${res.status}` };
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "scan") return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      await interaction.editReply(
        `Could not access channel \`${CHANNEL_ID}\`. Check CHANNEL_ID and bot permissions.`,
      );
      return;
    }

    console.log(`/scan invoked by ${interaction.user.tag}`);
    const messages = await fetchAllMessages(channel);
    console.log(`  fetched ${messages.length} messages`);

    // Keep only the first (earliest) message per non-bot user.
    const firstByUser = new Map();
    for (const m of messages) {
      if (m.author.bot) continue;
      if (!firstByUser.has(m.author.id)) firstByUser.set(m.author.id, m);
    }

    let added = 0;
    let skipped = 0;
    const reasons = {};
    for (const m of firstByUser.values()) {
      const result = await submitMessage(m);
      if (result.added) {
        added++;
      } else {
        skipped++;
        reasons[result.skipped] = (reasons[result.skipped] || 0) + 1;
      }
    }

    const reasonStr = Object.entries(reasons)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    await interaction.editReply(
      `Scan complete. Scanned ${messages.length} messages from ${firstByUser.size} unique users.\n` +
        `Added: **${added}** · Skipped: **${skipped}**${reasonStr ? ` (${reasonStr})` : ""}`,
    );
    console.log(`  added=${added} skipped=${skipped} ${reasonStr}`);
  } catch (err) {
    console.error("Scan error:", err);
    await interaction
      .editReply(`Scan failed: ${err.message || "unknown error"}`)
      .catch(() => {});
  }
});

client.login(TOKEN);
