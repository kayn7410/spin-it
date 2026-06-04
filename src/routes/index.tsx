import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Settings, Moon, Sun, PanelRightOpen, Share2 } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import type { Entry, WheelData } from "@/lib/types";
import { Wheel } from "@/components/Wheel";
import { EntryList } from "@/components/EntryList";
import { TwitterEntries } from "@/components/TwitterEntries";
import { RoleSettings } from "@/components/RoleSettings";
import { Confetti } from "@/components/Confetti";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  const { theme, toggle: toggleTheme } = useTheme();
  const [data, setData] = useState<WheelData | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Entry | null>(null);
  const [showWinner, setShowWinner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const pollRef = useRef<number | null>(null);

  // Share-link password gating.
  const [shareGate, setShareGate] = useState<"checking" | "locked" | "open">(
    "checking",
  );
  const [sharePwInput, setSharePwInput] = useState("");
  const [shareError, setShareError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const host = window.location.hostname;
    const isLocal =
      host === "localhost" || host === "127.0.0.1" || host === "::1";
    // Mark this browser as the "owner" the first time it's used on localhost,
    // so the person hosting the wheel never gets prompted for their own password.
    if (isLocal) localStorage.setItem("wheel-owner", "1");
    const isOwner = localStorage.getItem("wheel-owner") === "1";
    // Explicit override: ?share=1 forces the share gate (useful for previewing).
    const forceShare = params.get("share") === "1";
    if (isOwner && !forceShare) {
      setShareGate("open");
      return;
    }
    if (sessionStorage.getItem("share-ok") === "1") {
      setShareGate("open");
      return;
    }
    fetch("/api/share/verify")
      .then((r) => r.json())
      .then((d) => {
        if (d?.requiresPassword) setShareGate("locked");
        else setShareGate("open");
      })
      .catch(() => setShareGate("open"));
  }, []);

  async function submitSharePassword(e: React.FormEvent) {
    e.preventDefault();
    setShareError("");
    const res = await fetch("/api/share/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: sharePwInput }),
    });
    if (res.ok) {
      sessionStorage.setItem("share-ok", "1");
      setShareGate("open");
    } else {
      setShareError("Wrong password");
    }
  }

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state");
      if (res.ok) setData(await res.json());
    } catch {
      // ignore transient
    }
  }, []);

  useEffect(() => {
    if (shareGate !== "open") return;
    refresh();
    pollRef.current = window.setInterval(() => {
      if (!spinning) refresh();
    }, 3000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [refresh, spinning, shareGate]);

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

  async function shuffleEntries() {
    await fetch("/api/entries/shuffle", { method: "POST" });
    toast.success("Entries shuffled");
    await refresh();
  }

  async function saveSpinDuration(seconds: number) {
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spinDurationSec: seconds }),
    });
    await refresh();
  }

  async function saveSharePassword(password: string) {
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sharePassword: password }),
    });
    await refresh();
  }

  async function removeWinnerAndClose() {
    if (winner) await removeEntry(winner.id);
    setShowWinner(false);
    setWinner(null);
  }

  const entries = data?.entries ?? [];
  const roleWeights = data?.roleWeights ?? [];
  const centerImage = data?.centerImage ?? "";
  const imageBonusEnabled = data?.imageBonusEnabled ?? false;
  const imageBonusPerImage = data?.imageBonusPerImage ?? 5;
  const spinDurationSec = data?.spinDurationSec ?? 5;
  const hasSharePassword = data?.hasSharePassword ?? false;

  if (shareGate === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (shareGate === "locked") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <form
          onSubmit={submitSharePassword}
          className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 shadow"
        >
          <div>
            <h1 className="text-xl font-bold">🔒 Password required</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              This shared wheel is protected. Enter the password to continue.
            </p>
          </div>
          <Input
            type="password"
            autoFocus
            value={sharePwInput}
            onChange={(e) => setSharePwInput(e.target.value)}
            placeholder="Password"
          />
          {shareError && (
            <p className="text-sm text-destructive">{shareError}</p>
          )}
          <Button type="submit" className="w-full">
            Unlock
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Confetti show={showWinner} />

      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              🎡 Wheel of Giveaways
            </h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              ​
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleTheme}
              aria-label="Toggle dark mode"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowPanel(true)}>
              <PanelRightOpen className="mr-2 h-4 w-4" />
              Entries
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const url = window.location.origin + "/?share=1";
                try {
                  await navigator.clipboard.writeText(url);
                  toast.success("Share link copied", {
                    description: hasSharePassword
                      ? "Recipients will be asked for the password you set."
                      : "Anyone with the link can view & edit. Set a password in Settings to restrict access.",
                  });
                } catch {
                  toast.message("Share link", { description: url });
                }
              }}
              title="Copy a public link to this wheel"
            >
              <Share2 className="mr-2 h-4 w-4" />
              Share
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-6 px-4 py-8 sm:px-6">
        <Wheel
          entries={entries}
          onResult={handleResult}
          spinning={spinning}
          setSpinning={setSpinning}
          centerImage={centerImage}
          spinDurationSec={spinDurationSec}
          locked={showWinner}
        />
        <p className="text-center text-sm text-muted-foreground">
          Total entries:{" "}
          <span className="font-semibold text-foreground">
            {entries.reduce((s, e) => s + e.weight, 0)}
          </span>{" "}
          · Names:{" "}
          <span className="font-semibold text-foreground">{entries.length}</span>
        </p>
      </main>

      <Sheet open={showPanel} onOpenChange={setShowPanel}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:!max-w-[min(95vw,720px)]"
        >
          <SheetHeader>
            <SheetTitle>Entries</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-6">
            <EntryList
              entries={entries}
              onAdd={addEntry}
              onAddBulk={addEntriesBulk}
              onUpdate={updateEntry}
              onRemove={removeEntry}
              onClear={clearEntries}
              onUndoClear={undoClear}
              onShuffle={shuffleEntries}
              canUndo={canUndo}
            />
            <TwitterEntries onAddBulk={addEntriesBulk} />
          </div>
        </SheetContent>
      </Sheet>

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
            centerImage={centerImage}
            imageBonusEnabled={imageBonusEnabled}
            imageBonusPerImage={imageBonusPerImage}
            spinDurationSec={spinDurationSec}
            hasSharePassword={hasSharePassword}
            onSaveRole={saveRole}
            onDeleteRole={deleteRole}
            onSaveCenterImage={saveCenterImage}
            onSaveImageBonus={saveImageBonus}
            onSaveSpinDuration={saveSpinDuration}
            onSaveSharePassword={saveSharePassword}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
