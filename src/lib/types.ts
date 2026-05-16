export type Entry = {
  id: string;
  name: string;
  weight: number;
  source: "manual" | "discord" | "twitter";
  discordUserId?: string;
  discordRole?: string;
  /** Twitter user id (used to dedupe so each user only enters once per post). */
  twitterUserId?: string;
  /** The tweet id being tracked (the post whose replies are entries). */
  twitterTweetId?: string;
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
  /** Optional password required when opening the wheel via a shared link. */
  sharePassword?: string;
  /** Client-side flag indicating whether a share password is set (server strips sharePassword). */
  hasSharePassword?: boolean;
};
