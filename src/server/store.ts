import type { Entry, RoleWeight, WheelData } from "@/lib/types";

const DEFAULT_DATA: WheelData = {
  entries: [],
  roleWeights: [
    { id: "default-everyone", role: "@everyone", weight: 1 },
    { id: "default-subscriber", role: "Subscriber", weight: 10 },
    { id: "default-vip", role: "VIP", weight: 25 },
  ],
  channelId: "",
  centerImage: "",
  imageBonusEnabled: false,
  imageBonusPerImage: 5,
};

let memoryCache: WheelData | null = null;
let lastClearedSnapshot: Entry[] | null = null;

// Lazily resolved file-system handle. Importing `node:fs` at the top level
// would pull it into the client bundle and break the page, so we resolve it
// only inside server-only code paths.
type FsModule = typeof import("node:fs");
type PathModule = typeof import("node:path");
let fsMod: FsModule | null = null;
let pathMod: PathModule | null = null;
let dataFile: string | null = null;
let triedFs = false;

function getFs(): { fs: FsModule; file: string } | null {
  if (triedFs) {
    return fsMod && dataFile ? { fs: fsMod, file: dataFile } : null;
  }
  triedFs = true;
  // Only attempt on Node-like environments.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc: any = (globalThis as any).process;
  if (!proc?.versions?.node) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    fsMod = require("node:fs") as FsModule;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    pathMod = require("node:path") as PathModule;
    const dir = pathMod.resolve(proc.cwd(), "data");
    dataFile = pathMod.join(dir, "wheel.json");
    if (!fsMod.existsSync(dir)) fsMod.mkdirSync(dir, { recursive: true });
    if (!fsMod.existsSync(dataFile)) {
      fsMod.writeFileSync(dataFile, JSON.stringify(DEFAULT_DATA, null, 2), "utf-8");
    }
    return { fs: fsMod, file: dataFile };
  } catch {
    fsMod = null;
    pathMod = null;
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
}): { entry: Entry | null; reason?: string } {
  const data = readData();
  if (data.entries.some((e) => e.discordUserId === opts.discordUserId)) {
    return { entry: null, reason: "duplicate-user" };
  }
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
  let imageBonus = 0;
  if (data.imageBonusEnabled && opts.attachmentCount && opts.attachmentCount > 0) {
    imageBonus = opts.attachmentCount * (data.imageBonusPerImage ?? 5);
  }
  const entry: Entry = {
    id: uid(),
    name: opts.name.trim().slice(0, 64),
    weight: bestWeight + imageBonus,
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
