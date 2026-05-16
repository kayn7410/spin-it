import { useState } from "react";
import { Trash2, X, Undo2, Shuffle } from "lucide-react";
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
              title="Number of entries"
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
                title="Entries applied to every name"
              />
              <span className="text-xs text-muted-foreground">
                entries per name ·{" "}
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
  const [name, setName] = useState(entry.name);
  const [weight, setWeight] = useState(entry.weight);

  // Keep local state in sync if entry changes from elsewhere (e.g. polling)
  if (name !== entry.name && document.activeElement?.getAttribute("data-entry-id") !== entry.id + "-name") {
    // no-op; we use uncontrolled sync via key in parent if needed
  }

  async function commitName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === entry.name) {
      setName(entry.name);
      return;
    }
    await onUpdate(entry.id, { name: trimmed });
  }

  async function commitWeight(next: number) {
    const w = Math.max(1, Math.min(1000, Math.floor(next) || 1));
    setWeight(w);
    if (w === entry.weight) return;
    await onUpdate(entry.id, { weight: w });
  }

  return (
    <li className="group flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60">
      <Input
        data-entry-id={`${entry.id}-name`}
        value={name}
        placeholder={entry.source === "discord" ? "(no display name)" : "name"}
        onChange={(ev) => setName(ev.target.value)}
        onBlur={commitName}
        onKeyDown={(ev) => {
          if (ev.key === "Enter") (ev.target as HTMLInputElement).blur();
          if (ev.key === "Escape") {
            setName(entry.name);
            (ev.target as HTMLInputElement).blur();
          }
        }}
        maxLength={64}
        className="h-8 min-w-[10rem] flex-1 border-transparent bg-transparent px-2 font-medium hover:border-border focus:border-border"
      />
      <Input
        type="number"
        min={1}
        max={1000}
        value={weight}
        onChange={(ev) => setWeight(Number(ev.target.value) || 1)}
        onBlur={(ev) => commitWeight(Number(ev.target.value) || 1)}
        onKeyDown={(ev) => {
          if (ev.key === "Enter") (ev.target as HTMLInputElement).blur();
        }}
        className="h-8 w-14 px-2 text-center"
        title="Entries"
      />
      {entry.source === "discord" && (
        <Badge variant="outline" className="shrink-0 whitespace-nowrap text-[10px]">
          {entry.discordRole ?? "discord"}
          {entry.imageBonus ? ` +${entry.imageBonus}🖼` : ""}
        </Badge>
      )}
      {entry.source === "twitter" && (
        <Badge variant="outline" className="shrink-0 text-[10px]">
          twitter
        </Badge>
      )}
      <button
        onClick={() => onRemove(entry.id)}
        className="ml-auto shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        aria-label={`Remove ${entry.name}`}
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  );
}
