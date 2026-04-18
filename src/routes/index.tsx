import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import type { Entry, WheelData } from "@/lib/types";
import { Wheel } from "@/components/Wheel";
import { EntryList } from "@/components/EntryList";
import { RoleSettings } from "@/components/RoleSettings";
import { Confetti } from "@/components/Confetti";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "Wheel of Names — Local + Discord" },
      {
        name: "description",
        content:
          "Spin a weighted wheel of names. Self-hosted with a Discord bot that adds entries based on roles.",
      },
    ],
  }),
});

function Home() {
  const [data, setData] = useState<WheelData | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Entry | null>(null);
  const [showWinner, setShowWinner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const pollRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state");
      if (res.ok) setData(await res.json());
    } catch {
      // ignore transient
    }
  }, []);

  useEffect(() => {
    refresh();
    pollRef.current = window.setInterval(() => {
      if (!spinning) refresh();
    }, 3000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [refresh, spinning]);

  async function addEntry(name: string, weight: number) {
    await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, weight }),
    });
    await refresh();
  }

  async function addEntriesBulk(names: string[], weight: number) {
    await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names, weight }),
    });
    toast.success(`Added ${names.length} entries`);
    await refresh();
  }

  async function updateEntry(id: string, patch: { name?: string; weight?: number }) {
    await fetch("/api/entries", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    await refresh();
  }

  async function removeEntry(id: string) {
    await fetch(`/api/entries?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await refresh();
  }

  async function clearEntries() {
    const res = await fetch("/api/entries?all=1", { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (body?.clearedCount > 0) {
      setCanUndo(true);
      toast(`Cleared ${body.clearedCount} entries`, {
        action: { label: "Undo", onClick: () => undoClear() },
      });
    }
    await refresh();
  }

  async function undoClear() {
    const res = await fetch("/api/entries/restore", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (body?.restored > 0) {
      toast.success(`Restored ${body.restored} entries`);
    }
    setCanUndo(false);
    await refresh();
  }

  async function saveRole(rw: { id?: string; role: string; weight: number }) {
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rw),
    });
    await refresh();
  }

  async function deleteRole(id: string) {
    await fetch(`/api/config?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await refresh();
  }

  async function saveChannel(channelId: string) {
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId }),
    });
    await refresh();
  }

  async function saveCenterImage(centerImage: string) {
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ centerImage }),
    });
    await refresh();
  }

  async function saveImageBonus(opts: {
    imageBonusEnabled?: boolean;
    imageBonusPerImage?: number;
  }) {
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
    await refresh();
  }

  function handleResult(w: Entry) {
    setWinner(w);
    setShowWinner(true);
  }

  async function removeWinnerAndClose() {
    if (winner) await removeEntry(winner.id);
    setShowWinner(false);
    setWinner(null);
  }

  const entries = data?.entries ?? [];
  const roleWeights = data?.roleWeights ?? [];
  const channelId = data?.channelId ?? "";
  const centerImage = data?.centerImage ?? "";
  const imageBonusEnabled = data?.imageBonusEnabled ?? false;
  const imageBonusPerImage = data?.imageBonusPerImage ?? 5;

  return (
    <div className="min-h-screen bg-background">
      <Confetti show={showWinner} />

      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              🎡 Wheel of Names
            </h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Self-hosted · Discord-aware · Weighted entries
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_400px]">
        <section className="flex flex-col items-center justify-center gap-6">
          <Wheel
            entries={entries}
            onResult={handleResult}
            spinning={spinning}
            setSpinning={setSpinning}
            centerImage={centerImage}
          />
          <p className="text-center text-sm text-muted-foreground">
            Total weight:{" "}
            <span className="font-semibold text-foreground">
              {entries.reduce((s, e) => s + e.weight, 0)}
            </span>{" "}
            · Names:{" "}
            <span className="font-semibold text-foreground">{entries.length}</span>
          </p>
        </section>

        <aside className="space-y-6">
          <EntryList
            entries={entries}
            onAdd={addEntry}
            onAddBulk={addEntriesBulk}
            onUpdate={updateEntry}
            onRemove={removeEntry}
            onClear={clearEntries}
            onUndoClear={undoClear}
            canUndo={canUndo}
          />
        </aside>
      </main>

      <Dialog open={showWinner} onOpenChange={(o) => !o && setShowWinner(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-sm uppercase tracking-widest text-muted-foreground">
              Winner
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center">
            <p className="text-4xl font-extrabold sm:text-5xl">{winner?.name}</p>
            {winner?.discordRole && (
              <p className="mt-2 text-sm text-muted-foreground">
                via Discord · {winner.discordRole}
              </p>
            )}
          </div>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={() => setShowWinner(false)}>
              Keep on wheel
            </Button>
            <Button onClick={removeWinnerAndClose}>Remove & close</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>
          <RoleSettings
            roleWeights={roleWeights}
            channelId={channelId}
            centerImage={centerImage}
            imageBonusEnabled={imageBonusEnabled}
            imageBonusPerImage={imageBonusPerImage}
            onSaveRole={saveRole}
            onDeleteRole={deleteRole}
            onSaveChannel={saveChannel}
            onSaveCenterImage={saveCenterImage}
            onSaveImageBonus={saveImageBonus}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
