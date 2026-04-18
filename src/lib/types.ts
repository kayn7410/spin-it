export type Entry = {
  id: string;
  name: string;
  weight: number;
  source: "manual" | "discord";
  discordUserId?: string;
  discordRole?: string;
  createdAt: number;
};

export type RoleWeight = {
  id: string;
  /** Discord role name as it appears in the server (case-insensitive match). Use "@everyone" for default. */
  role: string;
  weight: number;
};

export type WheelData = {
  entries: Entry[];
  roleWeights: RoleWeight[];
  /** Discord channel ID the bot listens to. Configurable in UI for reference. */
  channelId: string;
};
