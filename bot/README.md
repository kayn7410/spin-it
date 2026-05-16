# Wheel of Names — Local + Discord Bot

A self-hosted spinning wheel of names with weighted entries, plus an optional
Discord bot that adds names from a channel based on the author's roles.

## Run the web app

```bash
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:8080`).

Entries and role weights are persisted to `data/wheel.json` next to your project.

## Run the Discord bot

The bot is a separate Node.js process that runs locally and talks to your
running web app over HTTP.

### 1. Create a Discord application
- Go to https://discord.com/developers/applications → New Application
- Bot tab → Reset Token → copy the token
- **Privileged Gateway Intents**: enable
  - `MESSAGE CONTENT INTENT`
  - `SERVER MEMBERS INTENT`
- OAuth2 → URL Generator → scopes: `bot`; permissions: `Read Messages/View Channels`,
  `Send Messages`, `Add Reactions`, `Read Message History`
- Visit the generated URL to invite the bot to your server.

### 2. Get the channel ID
In Discord: Settings → Advanced → enable Developer Mode. Right-click the
channel → "Copy Channel ID".

### 3. Configure & run
```bash
cd bot
npm install
cp .env.example .env
# edit .env: DISCORD_TOKEN, CHANNEL_ID, and API_URL if your wheel runs on a non-default port
npm start
```

### 4. Configure role weights in the web UI
Open the wheel page → ⚙ Settings. Map Discord role names (e.g. `Subscriber`,
`VIP`) to the number of wheel entries. The `@everyone` row is the fallback
weight used when the user has no matching role.

Also paste the same channel ID into Settings → "Listening channel ID" so it's
recorded in `data/wheel.json` (the bot itself uses the value from `bot/.env`).

## Behavior
- Bot only reacts to messages in the configured channel; everything else is ignored.
- Messages MUST follow this format (case-insensitive, order doesn't matter):
  ```
  twitter username: yourhandle
  boosts: 3
  ```
  The `twitter username` becomes the wheel entry name. The `boosts` number is
  multiplied by the **Server Booster** role weight (configured in Settings) and
  added on top of the @everyone baseline — but only if the user actually has
  the `Server Booster` role in Discord.
- Each Discord user can submit **once**. Later submissions are ignored (⚠️).
- Messages that don't match the format get a ❌ reaction and a short reply
  mentioning only the author with the correct format. The reply auto-deletes
  after 15 seconds; the original message is left in place.
- ✅ added · ⚠️ duplicate · ❌ invalid format / error
