import { useRef, useState } from "react";
import { Trash2, Plus, Upload, ImageOff, Lock } from "lucide-react";
import type { RoleWeight } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

type Props = {
  roleWeights: RoleWeight[];
  centerImage: string;
  imageBonusEnabled: boolean;
  imageBonusPerImage: number;
  spinDurationSec: number;
  hasSharePassword: boolean;
  onSaveRole: (rw: { id?: string; role: string; weight: number }) => Promise<void>;
  onDeleteRole: (id: string) => Promise<void>;
  onSaveCenterImage: (dataUrl: string) => Promise<void>;
  onSaveImageBonus: (opts: {
    imageBonusEnabled?: boolean;
    imageBonusPerImage?: number;
  }) => Promise<void>;
  onSaveSpinDuration: (seconds: number) => Promise<void>;
  onSaveSharePassword: (password: string) => Promise<void>;
};

export function RoleSettings({
  roleWeights,
  centerImage,
  imageBonusEnabled,
  imageBonusPerImage,
  spinDurationSec,
  hasSharePassword,
  onSaveRole,
  onDeleteRole,
  onSaveCenterImage,
  onSaveImageBonus,
  onSaveSpinDuration,
  onSaveSharePassword,
}: Props) {
  const [newRole, setNewRole] = useState("");
  const [newWeight, setNewWeight] = useState(5);
  const [perImage, setPerImage] = useState(imageBonusPerImage);
  const [duration, setDuration] = useState(spinDurationSec);
  const [sharePw, setSharePw] = useState("");
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

      {/* Spin duration */}
      <section className="space-y-2">
        <Label htmlFor="spin-duration" className="text-base">
          Spin duration
        </Label>
        <p className="text-xs text-muted-foreground">
          How long the wheel takes to land on a winner.
        </p>
        <div className="flex items-center gap-3">
          <input
            id="spin-duration"
            type="range"
            min={1}
            max={20}
            step={1}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            onMouseUp={() => onSaveSpinDuration(duration)}
            onTouchEnd={() => onSaveSpinDuration(duration)}
            className="flex-1 accent-[var(--primary)]"
          />
          <span className="w-16 text-right text-sm font-medium tabular-nums">
            {duration}s
          </span>
        </div>
      </section>

      <Separator />

      {/* Share password */}
      <section className="space-y-2">
        <Label htmlFor="share-pw" className="flex items-center gap-2 text-base">
          <Lock className="h-4 w-4" />
          Share link password
        </Label>
        <p className="text-xs text-muted-foreground">
          Anyone opening the share link will be asked for this password.
          {hasSharePassword ? " A password is currently set." : " No password is set — link is public."}
        </p>
        <div className="flex items-center gap-2">
          <Input
            id="share-pw"
            type="password"
            placeholder={hasSharePassword ? "•••••••• (set)" : "Enter a password"}
            value={sharePw}
            onChange={(e) => setSharePw(e.target.value)}
          />
          <Button
            size="sm"
            onClick={async () => {
              await onSaveSharePassword(sharePw);
              setSharePw("");
            }}
            disabled={!sharePw}
          >
            Save
          </Button>
          {hasSharePassword && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={async () => {
                await onSaveSharePassword("");
                setSharePw("");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </section>

      <Separator />

      {/* Role entries */}
      <section className="space-y-2">
        <Label>Role entries</Label>
        <p className="text-xs text-muted-foreground">
          Enter the Discord role <strong>name</strong> (case-insensitive) and how many entries
          users with that role get. If a user has multiple matching roles, the entries{" "}
          <strong>stack</strong> (sum together). Use{" "}
          <code className="rounded bg-muted px-1">@everyone</code> as the baseline for users
          with no matching role.
        </p>
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
            placeholder="Role name (e.g. Booster)"
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
            title="Entries per user with this role"
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
      <Input
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className="flex-1"
        placeholder="Role name or @everyone"
      />
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
