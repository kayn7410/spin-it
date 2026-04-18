import fs from "node:fs";
import path from "node:path";
import type { Entry, RoleWeight, WheelData } from "@/lib/types";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "wheel.json");

const DEFAULT_DATA: WheelData = {
  entries: [],
  roleWeights: [
    { id: "default-everyone", role: "@everyone", weight: 1 },
    { id: "default-subscriber", role: "Subscriber", weight: 10 },
    { id: "default-vip", role: "VIP", weight: 25 },
  ],
  channelId: "",
};

let memoryCache: WheelData | null = null;

function ensureFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2), "utf-8");
    }
  } catch (e) {
    // Read-only FS (e.g. Cloudflare Worker) — fall back to memory.
    if (!memoryCache) memoryCache = structuredClone(DEFAULT_DATA);
  }
}

export function readData(): WheelData {
  ensureFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw) as WheelData;
    return {
      entries: parsed.entries ?? [],
      roleWeights: parsed.roleWeights ?? DEFAULT_DATA.roleWeights,
      channelId: parsed.channelId ?? "",
    };
  } catch {
    if (!memoryCache) memoryCache = structuredClone(DEFAULT_DATA);
    return memoryCache;
  }
}

export function writeData(data: WheelData): WheelData {
  ensureFile();
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    memoryCache = data;
  }
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

export function addDiscordEntry(opts: {
  name: string;
  discordUserId: string;
  roles: string[];
}): { entry: Entry | null; reason?: string } {
  const data = readData();
  // Ignore subsequent submissions from same user
  if (data.entries.some((e) => e.discordUserId === opts.discordUserId)) {
    return { entry: null, reason: "duplicate-user" };
  }
  // Resolve highest weight from user's roles, fallback to @everyone
  const lowerRoles = opts.roles.map((r) => r.toLowerCase());
  let bestWeight = 1;
  let bestRole = "@everyone";
  for (const rw of data.roleWeights) {
    const r = rw.role.toLowerCase();
    if (r === "@everyone" || lowerRoles.includes(r)) {
      if (rw.weight > bestWeight) {
        bestWeight = rw.weight;
        bestRole = rw.role;
      }
    }
  }
  const entry: Entry = {
    id: uid(),
    name: opts.name.trim().slice(0, 64),
    weight: bestWeight,
    source: "discord",
    discordUserId: opts.discordUserId,
    discordRole: bestRole,
    createdAt: Date.now(),
  };
  data.entries.push(entry);
  writeData(data);
  return { entry };
}

export function removeEntry(id: string): boolean {
  const data = readData();
  const before = data.entries.length;
  data.entries = data.entries.filter((e) => e.id !== id);
  if (data.entries.length === before) return false;
  writeData(data);
  return true;
}

export function clearEntries(): void {
  const data = readData();
  data.entries = [];
  writeData(data);
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
