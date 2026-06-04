import type { Entry, RoleWeight, WheelData } from "@/lib/types";
import * as nodeFs from "node:fs";
import * as nodePath from "node:path";

const DEFAULT_DATA: WheelData = {
  entries: [],
  roleWeights: [
    { id: "default-everyone", role: "@everyone", weight: 1 },
  ],
  channelId: "",
  centerImage: "",
  imageBonusEnabled: false,
  imageBonusPerImage: 5,
  spinDurationSec: 5,
};

function sanitizeForClient(data: WheelData): WheelData {
  const { sharePassword, ...rest } = data;
  return { ...rest, hasSharePassword: !!(sharePassword && sharePassword.length > 0) };
}

export function readPublicData(): WheelData {
  return sanitizeForClient(readData());
}

export function setSharePassword(password: string): void {
  const data = readData();
  data.sharePassword = password.trim() || undefined;
  writeData(data);
}

export function verifySharePassword(password: string): boolean {
  const data = readData();
  if (!data.sharePassword) return true;
  return data.sharePassword === password;
}

export function hasSharePassword(): boolean {
  const data = readData();
  return !!(data.sharePassword && data.sharePassword.length > 0);
}

let memoryCache: WheelData | null = null;
let lastClearedSnapshot: Entry[] | null = null;

type FsModule = typeof import("node:fs");
let fsMod: FsModule | null = null;
let dataFile: string | null = null;
let triedFs = false;

function getFs(): { fs: FsModule; file: string } | null {
  if (triedFs) {
    return fsMod && dataFile ? { fs: fsMod, file: dataFile } : null;
  }
  triedFs = true;
  try {
    fsMod = nodeFs;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proc: any = (globalThis as any).process;
    const cwd = typeof proc?.cwd === "function" ? proc.cwd() : "/";
    const dir = nodePath.resolve(cwd, "data");
    dataFile = nodePath.join(dir, "wheel.json");
    if (!fsMod.existsSync(dir)) fsMod.mkdirSync(dir, { recursive: true });
    if (!fsMod.existsSync(dataFile)) {
      fsMod.writeFileSync(dataFile, JSON.stringify(DEFAULT_DATA, null, 2), "utf-8");
    }
    return { fs: fsMod, file: dataFile };
  } catch (err) {
    console.warn("[store] fs unavailable, falling back to memory:", err);
    fsMod = null;
    dataFile = null;
    return null;
  }
}

export function readData(): WheelData {
  const handle = getFs();
  if (handle) {
    try {
      const raw = handle.fs.readFileSync(handle.file, "utf-8");
      const parsed = JSON.parse(raw) as Partial<WheelData>;
      return {
        entries: parsed.entries ?? [],
        roleWeights: parsed.roleWeights ?? DEFAULT_DATA.roleWeights,
        channelId: parsed.channelId ?? "",
        centerImage: parsed.centerImage ?? "",
        imageBonusEnabled: parsed.imageBonusEnabled ?? false,
        imageBonusPerImage: parsed.imageBonusPerImage ?? 5,
        spinDurationSec: parsed.spinDurationSec ?? 5,
        sharePassword: parsed.sharePassword,
      };
    } catch {
      // fall through to memory
    }
  }
  if (!memoryCache) memoryCache = structuredClone(DEFAULT_DATA);
  return memoryCache;
}

export function writeData(data: WheelData): WheelData {
  const handle = getFs();
  if (handle) {
    try {
      handle.fs.writeFileSync(handle.file, JSON.stringify(data, null, 2), "utf-8");
      return data;
    } catch {
      // fall through to memory
    }
  }
  memoryCache = data;
  return data;
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function addManualEntry(name: string, weight: number): Entry {
  const data = readData();
  const entry: Entry = {
    id: uid(),
    name: name.trim(),
    weight: Math.max(1, Math.floor(weight)),
    source: "manual",
    createdAt: Date.now(),
  };
  data.entries.push(entry);
  writeData(data);
  return entry;
}

export function addManualEntriesBulk(names: string[], weight: number): Entry[] {
  const data = readData();
  const created: Entry[] = [];
  const w = Math.max(1, Math.floor(weight));
  for (const raw of names) {
    const n = raw.trim();
    if (!n) continue;
    const entry: Entry = {
      id: uid(),
      name: n.slice(0, 64),
      weight: w,
      source: "manual",
      createdAt: Date.now(),
    };
    data.entries.push(entry);
    created.push(entry);
  }
  writeData(data);
  return created;
}

export function updateEntry(
  id: string,
  patch: { name?: string; weight?: number },
): Entry | null {
  const data = readData();
  const idx = data.entries.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  const cur = data.entries[idx];
  const updated: Entry = {
    ...cur,
    name: patch.name !== undefined ? patch.name.trim().slice(0, 64) || cur.name : cur.name,
    weight:
      patch.weight !== undefined
        ? Math.max(1, Math.floor(patch.weight))
        : cur.weight,
  };
  data.entries[idx] = updated;
  writeData(data);
  return updated;
}

export function addDiscordEntry(opts: {
  name: string;
  discordUserId: string;
  roles: string[];
  attachmentCount?: number;
  boostCount?: number;
  /** When true, ignore role weights & boosts — every user gets exactly 1 entry. */
  flat?: boolean;
}): { entry: Entry | null; reason?: string } {
  const data = readData();
  const text = (opts.name || "").trim();
  if (text.length > 100) {
    return { entry: null, reason: "too-long" };
  }
  const usernameMatch = text.match(/^@?(\S+)/);
  if (!usernameMatch) {
    return { entry: null, reason: "invalid-format" };
  }
  const twitterName = usernameMatch[1].slice(0, 64);
  if (!twitterName) {
    return { entry: null, reason: "invalid-format" };
  }
  if (data.entries.some((e) => e.discordUserId === opts.discordUserId)) {
    return { entry: null, reason: "duplicate-user" };
  }

  // /crawl mode — flat 1 entry per user, ignore all roles/boosts/image bonuses.
  if (opts.flat) {
    const entry: Entry = {
      id: uid(),
      name: twitterName,
      weight: 1,
      source: "discord",
      discordUserId: opts.discordUserId,
      discordRole: "crawl",
      createdAt: Date.now(),
    };
    data.entries.push(entry);
    writeData(data);
    return { entry };
  }

  // Boost count: prefer explicit boostCount field, fall back to "+N boosts" in the text.
  const rest = text.slice(usernameMatch[0].length);
  const boostMatch = rest.match(/(\d+)/);
  const parsedBoosts = boostMatch ? Math.max(0, parseInt(boostMatch[1], 10) || 0) : 0;
  const boosts = typeof opts.boostCount === "number" ? Math.max(0, opts.boostCount) : parsedBoosts;

  const normalizedRoles = new Set(
    opts.roles.map((r) => r.trim().toLowerCase()).filter(Boolean),
  );
  let everyoneWeight = 1;
  let boosterWeight = 0;
  let bestWeight = 0;
  let bestRoleName: string | null = null;
  for (const rw of data.roleWeights) {
    const r = rw.role.trim().toLowerCase();
    if (r === "@everyone") {
      everyoneWeight = Math.max(everyoneWeight, rw.weight);
      continue;
    }
    if (r === "server booster") {
      boosterWeight = rw.weight;
    }
    if (normalizedRoles.has(r) && rw.weight > bestWeight) {
      bestWeight = rw.weight;
      bestRoleName = rw.role;
    }
  }
  const hasBooster = normalizedRoles.has("server booster");
  // Server Booster role-weight is MULTIPLIED by the user's boost count.
  // If user is boosting but boostCount unknown, treat as 1.
  const boosterMultiplier = hasBooster ? Math.max(1, boosts) : 0;
  const boosterTotal = boosterWeight * boosterMultiplier;
  let totalEntries = everyoneWeight;
  const roleLabels: string[] = ["@everyone"];
  if (bestRoleName) {
    totalEntries += bestWeight;
    roleLabels.push(bestRoleName);
  }
  if (hasBooster && boosterTotal > 0) {
    totalEntries += boosterTotal;
    roleLabels.push(`Server Booster ×${boosterMultiplier}`);
  }
  totalEntries = Math.max(1, totalEntries);
  const bestRole = roleLabels.join(" + ");
  let imageBonus = 0;
  if (data.imageBonusEnabled && opts.attachmentCount && opts.attachmentCount > 0) {
    imageBonus = opts.attachmentCount * (data.imageBonusPerImage ?? 5);
  }
  const entry: Entry = {
    id: uid(),
    name: twitterName,
    weight: totalEntries + imageBonus,
    source: "discord",
    discordUserId: opts.discordUserId,
    discordRole: bestRole,
    imageBonus: imageBonus || undefined,
    createdAt: Date.now(),
  };
  data.entries.push(entry);
  writeData(data);
  return { entry };
}

// Twitter entries are now added via the manual bulk-paste flow in the UI
// (TwitterEntries component → addManualEntriesBulk). No dedicated server
// path is needed since usernames extracted from a pasted comment section
// are treated like any other manual entry.


export function removeEntry(id: string): boolean {
  const data = readData();
  const before = data.entries.length;
  data.entries = data.entries.filter((e) => e.id !== id);
  if (data.entries.length === before) return false;
  writeData(data);
  return true;
}

export function clearEntries(): Entry[] {
  const data = readData();
  lastClearedSnapshot = data.entries.slice();
  data.entries = [];
  writeData(data);
  return lastClearedSnapshot;
}

export function restoreLastCleared(): { restored: number } {
  if (!lastClearedSnapshot || lastClearedSnapshot.length === 0) {
    return { restored: 0 };
  }
  const data = readData();
  // Avoid duplicating ids if user added new entries in the meantime.
  const existingIds = new Set(data.entries.map((e) => e.id));
  const toAdd = lastClearedSnapshot.filter((e) => !existingIds.has(e.id));
  data.entries = [...data.entries, ...toAdd];
  writeData(data);
  const count = toAdd.length;
  lastClearedSnapshot = null;
  return { restored: count };
}

export function hasUndo(): boolean {
  return !!lastClearedSnapshot && lastClearedSnapshot.length > 0;
}

export function upsertRoleWeight(rw: Omit<RoleWeight, "id"> & { id?: string }): RoleWeight {
  const data = readData();
  if (rw.id) {
    const idx = data.roleWeights.findIndex((r) => r.id === rw.id);
    if (idx >= 0) {
      data.roleWeights[idx] = { ...data.roleWeights[idx], role: rw.role, weight: rw.weight };
      writeData(data);
      return data.roleWeights[idx];
    }
  }
  const created: RoleWeight = {
    id: uid(),
    role: rw.role.trim(),
    weight: Math.max(1, Math.floor(rw.weight)),
  };
  data.roleWeights.push(created);
  writeData(data);
  return created;
}

export function deleteRoleWeight(id: string): boolean {
  const data = readData();
  const before = data.roleWeights.length;
  data.roleWeights = data.roleWeights.filter((r) => r.id !== id);
  if (data.roleWeights.length === before) return false;
  writeData(data);
  return true;
}

export function setChannelId(channelId: string): void {
  const data = readData();
  data.channelId = channelId.trim();
  writeData(data);
}

export function setCenterImage(image: string): void {
  const data = readData();
  data.centerImage = image;
  writeData(data);
}

export function setImageBonus(opts: { enabled?: boolean; perImage?: number }): void {
  const data = readData();
  if (opts.enabled !== undefined) data.imageBonusEnabled = opts.enabled;
  if (opts.perImage !== undefined) {
    data.imageBonusPerImage = Math.max(1, Math.floor(opts.perImage));
  }
  writeData(data);
}

export function setSpinDuration(seconds: number): void {
  const data = readData();
  data.spinDurationSec = Math.min(20, Math.max(1, Math.round(seconds)));
  writeData(data);
}

/** Fisher–Yates shuffle of the entries array. */
export function shuffleEntries(): Entry[] {
  const data = readData();
  const arr = data.entries.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  data.entries = arr;
  writeData(data);
  return arr;
}
