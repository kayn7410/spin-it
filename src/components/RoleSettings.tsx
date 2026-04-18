import { useState } from "react";
import { Trash2, Plus } from "lucide-react";
import type { RoleWeight } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  roleWeights: RoleWeight[];
  channelId: string;
  onSaveRole: (rw: { id?: string; role: string; weight: number }) => Promise<void>;
  onDeleteRole: (id: string) => Promise<void>;
  onSaveChannel: (channelId: string) => Promise<void>;
};

export function RoleSettings({
  roleWeights,
  channelId,
  onSaveRole,
  onDeleteRole,
  onSaveChannel,
}: Props) {
  const [newRole, setNewRole] = useState("");
  const [newWeight, setNewWeight] = useState(5);
  const [channel, setChannel] = useState(channelId);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newRole.trim()) return;
    await onSaveRole({ role: newRole.trim(), weight: newWeight });
    setNewRole("");
    setNewWeight(5);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold">Discord settings</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Map Discord role names to wheel entry counts. Bot listens to the channel ID below.
      </p>

      <div className="mb-5 space-y-2">
        <Label htmlFor="channel">Listening channel ID</Label>
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
      </div>

      <div className="space-y-2">
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
      </div>

      <form onSubmit={add} className="mt-4 flex gap-2">
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
