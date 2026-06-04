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

/**
 * Build a map of userId -> { isBoosting, boostCount } for every member of the guild.
 *
 * NOTE: Discord's API does not expose a precise per-user boost count. We use
 * `premiumSinceTimestamp` to know whether a member is currently boosting and
 * count them as 1 boost. (Nitro members can boost up to 2x, but that isn't
 * surfaced via the API.) Anyone with the "Server Booster" role but no
 * premium_since (e.g. role granted manually) is also counted as 1.
 */
async function buildBoostMap(guild) {
  const map = new Map();
  try {
    const members = await guild.members.fetch();
    for (const m of members.values()) {
      const isBoosting = !!m.premiumSinceTimestamp;
      const hasBoosterRole = m.roles?.cache?.some(
        (r) => r.name.toLowerCase() === "server booster",
      );
      const boostCount = isBoosting || hasBoosterRole ? 1 : 0;
      map.set(m.id, { isBoosting: isBoosting || !!hasBoosterRole, boostCount });
    }
  } catch (err) {
    console.warn("  could not fetch guild members for boost info:", err.message);
  }
  return map;
}

async function submitMessage(msg, { flat = false, boostInfo = null } = {}) {
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

  const boostCount = boostInfo?.boostCount ?? 0;

  const res = await fetch(`${API_URL}/api/discord/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: name.slice(0, 500),
      discordUserId: msg.author.id,
      roles: flat ? [] : roleNames,
      attachmentCount: flat ? 0 : attachmentCount,
      boostCount: flat ? 0 : boostCount,
      flat,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 201 && data.entry) return { added: data.entry };
  return { skipped: data.reason || `http-${res.status}` };
}

async function runChannelImport(interaction, { flat }) {
  const label = flat ? "/crawl" : "/scan";
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      await interaction.editReply(
        `Could not access channel \`${CHANNEL_ID}\`. Check CHANNEL_ID and bot permissions.`,
      );
      return;
    }

    console.log(`${label} invoked by ${interaction.user.tag}`);

    // For /scan: collect boost info for every guild member first.
    let boostMap = new Map();
    if (!flat && channel.guild) {
      console.log("  collecting member boost info…");
      boostMap = await buildBoostMap(channel.guild);
      const boosting = [...boostMap.values()].filter((b) => b.isBoosting).length;
      console.log(`  ${boosting} boosting member(s) detected`);
    }

    const messages = await fetchAllMessages(channel);
    console.log(`  fetched ${messages.length} messages`);

    const firstByUser = new Map();
    for (const m of messages) {
      if (m.author.bot) continue;
      if (!firstByUser.has(m.author.id)) firstByUser.set(m.author.id, m);
    }

    let added = 0;
    let skipped = 0;
    const reasons = {};
    for (const m of firstByUser.values()) {
      const result = await submitMessage(m, {
        flat,
        boostInfo: boostMap.get(m.author.id) ?? null,
      });
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
      `${flat ? "Crawl" : "Scan"} complete. Processed ${messages.length} messages from ${firstByUser.size} unique users.\n` +
        `Added: **${added}** · Skipped: **${skipped}**${reasonStr ? ` (${reasonStr})` : ""}`,
    );
    console.log(`  added=${added} skipped=${skipped} ${reasonStr}`);
  } catch (err) {
    console.error(`${label} error:`, err);
    await interaction
      .editReply(`${label} failed: ${err.message || "unknown error"}`)
      .catch(() => {});
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "scan") {
    await runChannelImport(interaction, { flat: false });
  } else if (interaction.commandName === "crawl") {
    await runChannelImport(interaction, { flat: true });
  }
});
});

client.login(TOKEN);
