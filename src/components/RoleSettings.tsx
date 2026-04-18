import { useRef, useState } from "react";
import { Trash2, Plus, Upload, ImageOff } from "lucide-react";
import type { RoleWeight } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

type Props = {
  roleWeights: RoleWeight[];
  channelId: string;
  centerImage: string;
  imageBonusEnabled: boolean;
  imageBonusPerImage: number;
  onSaveRole: (rw: { id?: string; role: string; weight: number }) => Promise<void>;
  onDeleteRole: (id: string) => Promise<void>;
  onSaveChannel: (channelId: string) => Promise<void>;
  onSaveCenterImage: (dataUrl: string) => Promise<void>;
  onSaveImageBonus: (opts: {
    imageBonusEnabled?: boolean;
    imageBonusPerImage?: number;
  }) => Promise<void>;
};

export function RoleSettings({
  roleWeights,
  channelId,
  centerImage,
  imageBonusEnabled,
  imageBonusPerImage,
  onSaveRole,
  onDeleteRole,
  onSaveChannel,
  onSaveCenterImage,
  onSaveImageBonus,
}: Props) {
  const [newRole, setNewRole] = useState("");
  const [newWeight, setNewWeight] = useState(5);
  const [channel, setChannel] = useState(channelId);
  const [perImage, setPerImage] = useState(imageBonusPerImage);
  const fileRef = useRef<HTMLInputElement>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newRole.trim()) return;
    await onSaveRole({ role: newRole.trim(), weight: newWeight });
    setNewRole("");
    setNewWeight(5);
  }

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Image must be smaller than 2 MB.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    await onSaveCenterImage(dataUrl);
  }

  return (
    <div className="space-y-6 rounded-xl">
      {/* Center image */}
      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Wheel center image
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
            {centerImage ? (
              <img src={centerImage} alt="Center" className="h-full w-full object-cover" />
            ) : (
              <ImageOff className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1 h-4 w-4" />
            Upload
          </Button>
          {centerImage && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSaveCenterImage("")}
              className="text-destructive"
            >
              Remove
            </Button>
          )}
        </div>
      </section>

      <Separator />

      {/* Channel */}
      <section className="space-y-2">
        <Label htmlFor="channel">Discord channel ID</Label>
        <div className="flex gap-2">
          <Input
            id="channel"
            placeholder="e.g. 1234567890"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          />
          <Button onClick={() => onSaveChannel(channel)} variant="secondary">
            Save
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Bot only listens in this channel.
        </p>
      </section>

      <Separator />

      {/* Image bonus */}
      <section className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="img-bonus" className="text-base">
              Image attachment bonus
            </Label>
            <p className="text-xs text-muted-foreground">
              Add extra entries when a Discord message has image attachments.
            </p>
          </div>
          <Switch
            id="img-bonus"
            checked={imageBonusEnabled}
            onCheckedChange={(v) => onSaveImageBonus({ imageBonusEnabled: v })}
          />
        </div>
        {imageBonusEnabled && (
          <div className="flex items-center gap-2">
            <Label htmlFor="per-image" className="text-sm">
              Entries per image
            </Label>
            <Input
              id="per-image"
              type="number"
              min={1}
              max={1000}
              value={perImage}
              onChange={(e) => setPerImage(Number(e.target.value) || 1)}
              className="w-24"
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onSaveImageBonus({ imageBonusPerImage: perImage })}
            >
              Save
            </Button>
            <span className="text-xs text-muted-foreground">
              (e.g. 5 → 1 img = +5, 2 imgs = +10)
            </span>
          </div>
        )}
      </section>

      <Separator />

      {/* Role weights */}
      <section className="space-y-2">
        <Label>Role weights</Label>
        <ul className="space-y-2">
          {roleWeights.map((rw) => (
            <RoleRow
              key={rw.id}
              rw={rw}
              onSave={onSaveRole}
              onDelete={() => onDeleteRole(rw.id)}
            />
          ))}
        </ul>
        <form onSubmit={add} className="mt-3 flex gap-2">
          <Input
            placeholder="Role name (e.g. Subscriber)"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
          />
          <Input
            type="number"
            min={1}
            max={1000}
            value={newWeight}
            onChange={(e) => setNewWeight(Number(e.target.value) || 1)}
            className="w-24"
          />
          <Button type="submit" size="icon" aria-label="Add role">
            <Plus className="h-4 w-4" />
          </Button>
        </form>
      </section>
    </div>
  );
}

function RoleRow({
  rw,
  onSave,
  onDelete,
}: {
  rw: RoleWeight;
  onSave: (rw: { id?: string; role: string; weight: number }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [role, setRole] = useState(rw.role);
  const [weight, setWeight] = useState(rw.weight);
  const dirty = role !== rw.role || weight !== rw.weight;
  return (
    <li className="flex items-center gap-2 rounded-md bg-muted/50 p-2">
      <Input value={role} onChange={(e) => setRole(e.target.value)} className="flex-1" />
      <Input
        type="number"
        min={1}
        max={1000}
        value={weight}
        onChange={(e) => setWeight(Number(e.target.value) || 1)}
        className="w-20"
      />
      {dirty && (
        <Button size="sm" onClick={() => onSave({ id: rw.id, role, weight })}>
          Save
        </Button>
      )}
      <Button size="icon" variant="ghost" onClick={onDelete} aria-label={`Delete ${rw.role}`}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </li>
  );
}
