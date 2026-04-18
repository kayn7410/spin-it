export type Entry = {
  id: string;
  name: string;
  weight: number;
  source: "manual" | "discord";
  discordUserId?: string;
  discordRole?: string;
  /** Bonus weight added from attachments (when image-bonus is on). */
  imageBonus?: number;
  createdAt: number;
};

export type RoleWeight = {
  id: string;
  /** Discord role name (case-insensitive). Use "@everyone" for default. */
  role: string;
  weight: number;
};

export type WheelData = {
  entries: Entry[];
  roleWeights: RoleWeight[];
  /** Discord channel ID the bot listens to. */
  channelId: string;
  /** Optional data-URL image displayed in wheel center. */
  centerImage?: string;
  /** When true, Discord image attachments add bonus entries (1 img = +5, 2 = +10, etc.). */
  imageBonusEnabled?: boolean;
  /** Entries per image attachment (default 5). */
  imageBonusPerImage?: number;
  /** Spin duration in seconds (default 5). */
  spinDurationSec?: number;
};
