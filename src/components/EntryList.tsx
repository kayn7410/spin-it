import { useState } from "react";
import { Trash2, X, Pencil, Check, Undo2, Shuffle } from "lucide-react";
import type { Entry } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Props = {
  entries: Entry[];
  onAdd: (name: string, weight: number) => Promise<void>;
  onAddBulk: (names: string[], weight: number) => Promise<void>;
  onUpdate: (id: string, patch: { name?: string; weight?: number }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onClear: () => Promise<void>;
  onUndoClear: () => Promise<void>;
  onShuffle: () => Promise<void>;
  canUndo: boolean;
};

export function EntryList({
  entries,
  onAdd,
  onAddBulk,
  onUpdate,
  onRemove,
  onClear,
  onUndoClear,
  onShuffle,
  canUndo,
}: Props) {
  const [name, setName] = useState("");
  const [weight, setWeight] = useState(1);
  const [bulkText, setBulkText] = useState("");
  const [bulkWeight, setBulkWeight] = useState(1);

  async function submitSingle(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await onAdd(name.trim(), weight);
    setName("");
    setWeight(1);
  }

  async function submitBulk(e: React.FormEvent) {
    e.preventDefault();
    const names = bulkText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    await onAddBulk(names, bulkWeight);
    setBulkText("");
    setBulkWeight(1);
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Entries ({entries.length})</h2>
        <div className="flex items-center gap-1">
          {canUndo && (
            <Button variant="outline" size="sm" onClick={onUndoClear}>
              <Undo2 className="mr-1 h-4 w-4" />
              Undo clear
            </Button>
          )}
          {entries.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onShuffle}
              title="Shuffle entries"
            >
              <Shuffle className="mr-1 h-4 w-4" />
              Shuffle
            </Button>
          )}
          {entries.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Clear all
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="single" className="mb-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="single">Single</TabsTrigger>
          <TabsTrigger value="bulk">Bulk paste</TabsTrigger>
        </TabsList>
        <TabsContent value="single" className="mt-3">
          <form onSubmit={submitSingle} className="flex gap-2">
            <Input
              placeholder="Add a name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
            />
            <Input
              type="number"
              min={1}
              max={1000}
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value) || 1)}
              className="w-20"
              title="Number of entries (weight)"
            />
            <Button type="submit">Add</Button>
          </form>
        </TabsContent>
        <TabsContent value="bulk" className="mt-3">
          <form onSubmit={submitBulk} className="space-y-2">
            <Textarea
              placeholder={"Paste names — one per line\nAlice\nBob\nCharlie"}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={6}
              className="resize-y"
            />
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={1000}
                value={bulkWeight}
                onChange={(e) => setBulkWeight(Number(e.target.value) || 1)}
                className="w-24"
                title="Weight applied to every name"
              />
              <span className="text-xs text-muted-foreground">
                weight per name ·{" "}
                {bulkText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).length} ready
              </span>
              <Button type="submit" className="ml-auto">
                Add all
              </Button>
            </div>
          </form>
        </TabsContent>
      </Tabs>

      <ScrollArea className="h-72 flex-1">
        <ul className="space-y-1 pr-3">
          {entries.length === 0 && (
            <li className="py-8 text-center text-sm text-muted-foreground">
              No entries yet. Add a name above or send one from Discord.
            </li>
          )}
          {entries.map((e) => (
            <EntryRow key={e.id} entry={e} onUpdate={onUpdate} onRemove={onRemove} />
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}

function EntryRow({
  entry,
  onUpdate,
  onRemove,
}: {
  entry: Entry;
  onUpdate: (id: string, patch: { name?: string; weight?: number }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(entry.name);
  const [weight, setWeight] = useState(entry.weight);

  async function save() {
    if (!name.trim()) return;
    await onUpdate(entry.id, { name, weight });
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="flex items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5">
        <Input
          value={name}
          onChange={(ev) => setName(ev.target.value)}
          maxLength={64}
          className="h-8 flex-1"
          autoFocus
        />
        <Input
          type="number"
          min={1}
          max={1000}
          value={weight}
          onChange={(ev) => setWeight(Number(ev.target.value) || 1)}
          className="h-8 w-16"
        />
        <Button size="icon" variant="ghost" onClick={save} aria-label="Save">
          <Check className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            setName(entry.name);
            setWeight(entry.weight);
            setEditing(false);
          }}
          aria-label="Cancel"
        >
          <X className="h-4 w-4" />
        </Button>
      </li>
    );
  }

  return (
    <li className="group flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate font-medium">{entry.name}</span>
        <Badge variant="secondary" className="shrink-0">
          ×{entry.weight}
        </Badge>
        {entry.source === "discord" && (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {entry.discordRole ?? "discord"}
            {entry.imageBonus ? ` +${entry.imageBonus}🖼` : ""}
          </Badge>
        )}
      </div>
      <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => setEditing(true)}
          className="rounded p-1 hover:bg-accent"
          aria-label={`Edit ${entry.name}`}
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => onRemove(entry.id)}
          className="rounded p-1 hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Remove ${entry.name}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
