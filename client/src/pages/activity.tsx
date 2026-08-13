import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity as ActivityIcon, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/brand";
import { useApp } from "@/state/app";
import { downloadCsv, parseMeta, relativeTime } from "@/lib/analytics";
import type { Event } from "@shared/schema";

const TYPE_LABEL: Record<string, string> = {
  generated: "Generated a password",
  saved: "Saved to vault",
  updated: "Updated an entry",
  deleted: "Deleted an entry",
  copied: "Copied a secret",
  login: "Signed in",
  logout: "Signed out",
  signup: "Created the vault",
  audit: "Ran an audit action",
  rekey: "Changed the master password",
  settings: "Changed settings",
  profile: "Updated the profile",
};

const TYPE_TONE: Record<string, string> = {
  generated: "bg-primary",
  saved: "bg-chart-2",
  updated: "bg-chart-3",
  deleted: "bg-destructive",
  copied: "bg-chart-4",
  rekey: "bg-chart-5",
};

function describe(e: Event): string {
  const meta = parseMeta(e.meta);
  const parts: string[] = [];
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${k}: ${String(v)}`);
  }
  return parts.join(" · ");
}

export default function ActivityPage() {
  const { session } = useApp();
  const { data, isLoading } = useQuery<Event[]>({ queryKey: ["/api/events"], enabled: !!session });
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");

  const events = data ?? [];
  const types = useMemo(() => Array.from(new Set(events.map((e) => e.type))).sort(), [events]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events
      .filter((e) => (type === "all" ? true : e.type === type))
      .filter((e) => (!q ? true : (TYPE_LABEL[e.type] ?? e.type).toLowerCase().includes(q) || e.meta.toLowerCase().includes(q)))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [events, query, type]);

  const grouped = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of filtered) {
      const key = new Date(e.createdAt).toDateString();
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div data-testid="view-activity">
      <PageHeader
        title="Activity"
        description="A local audit trail of vault actions. Event metadata never contains a password."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={!filtered.length}
            onClick={() =>
              downloadCsv(`passforge-activity-${new Date().toISOString().slice(0, 10)}.csv`, [
                ["timestamp", "type", "detail"],
                ...filtered.map((e) => [new Date(e.createdAt).toISOString(), e.type, describe(e)]),
              ])
            }
            data-testid="button-export-activity"
          >
            <Download className="mr-2 h-3.5 w-3.5" />
            Export CSV
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the log…"
            className="flex-1"
            data-testid="input-activity-search"
          />
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-activity-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All event types</SelectItem>
              {types.map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABEL[t] ?? t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2" data-testid="state-activity-loading">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !grouped.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center" data-testid="state-activity-empty">
            <ActivityIcon className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">Nothing logged yet</p>
            <p className="text-xs text-muted-foreground">
              Generate or save a password and it will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5" data-testid="list-activity">
          {grouped.map(([day, list]) => (
            <div key={day}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {day}
                </h2>
                <span className="text-[11px] text-muted-foreground tnum">{list.length} events</span>
              </div>
              <Card>
                <ul className="divide-y divide-border">
                  {list.map((e) => (
                    <li key={e.id} className="flex items-start gap-3 px-3.5 py-2.5" data-testid={`row-event-${e.id}`}>
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TYPE_TONE[e.type] ?? "bg-muted-foreground"}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium">{TYPE_LABEL[e.type] ?? e.type}</div>
                        {describe(e) && (
                          <div className="truncate text-[11px] text-muted-foreground">{describe(e)}</div>
                        )}
                      </div>
                      <time
                        className="shrink-0 text-[11px] text-muted-foreground tnum"
                        dateTime={new Date(e.createdAt).toISOString()}
                        title={new Date(e.createdAt).toLocaleString()}
                      >
                        {relativeTime(e.createdAt)}
                      </time>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
