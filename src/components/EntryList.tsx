import { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import type { Entry } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

type Props = {
  entries: Entry[];
  onAdd: (name: string, weight: number) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onClear: () => Promise<void>;
};

export function EntryList({ entries, onAdd, onRemove, onClear }: Props) {
  const [name, setName] = useState("");
  const [weight, setWeight] = useState(1);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await onAdd(name.trim(), weight);
    setName("");
    setWeight(1);
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Entries ({entries.length})</h2>
        {entries.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear} className="text-destructive">
            <Trash2 className="mr-1 h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      <form onSubmit={submit} className="mb-4 flex gap-2">
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

      <ScrollArea className="h-72 flex-1">
        <ul className="space-y-1 pr-3">
          {entries.length === 0 && (
            <li className="py-8 text-center text-sm text-muted-foreground">
              No entries yet. Add a name above or send one from Discord.
            </li>
          )}
          {entries.map((e) => (
            <li
              key={e.id}
              className="group flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate font-medium">{e.name}</span>
                <Badge variant="secondary" className="shrink-0">
                  ×{e.weight}
                </Badge>
                {e.source === "discord" && (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {e.discordRole ?? "discord"}
                  </Badge>
                )}
              </div>
              <button
                onClick={() => onRemove(e.id)}
                className="rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                aria-label={`Remove ${e.name}`}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}
