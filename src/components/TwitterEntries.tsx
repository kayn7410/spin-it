import { useMemo, useState } from "react";
import { Twitter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  onAddBulk: (names: string[], weight: number) => Promise<void>;
};

/**
 * Extract unique @usernames from pasted text (e.g. copied from a tweet's
 * comment section). A username line is any line containing an @handle —
 * we pick the FIRST @handle on each line, dedupe case-insensitively, and
 * skip obvious non-usernames.
 */
function extractUsernames(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const handleRe = /@([A-Za-z0-9_]{1,15})\b/;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(handleRe);
    if (!m) continue;
    const handle = m[1];
    const key = handle.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`@${handle}`);
  }
  return out;
}

export function TwitterEntries({ onAddBulk }: Props) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const preview = useMemo(() => extractUsernames(text), [text]);

  async function submit() {
    if (preview.length === 0) return;
    setSubmitting(true);
    try {
      await onAddBulk(preview, 1);
      setText("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Twitter className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold">Twitter entries</h2>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Select all the replies on a tweet, paste them below. We'll pull every
        line that contains an @username and add each one to the wheel with 1
        entry.
      </p>
      <Textarea
        placeholder={"Paste the comment section from a tweet here..."}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="resize-y"
      />
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {preview.length} unique username{preview.length === 1 ? "" : "s"} detected
        </span>
        <Button onClick={submit} disabled={preview.length === 0 || submitting}>
          Add {preview.length > 0 ? preview.length : ""} to wheel
        </Button>
      </div>
      {preview.length > 0 && (
        <div className="mt-3 max-h-32 overflow-y-auto rounded-md border border-border bg-muted/40 p-2 text-xs">
          {preview.join(", ")}
        </div>
      )}
    </div>
  );
}
