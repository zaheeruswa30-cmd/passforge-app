import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowDownAZ,
  Copy,
  Download,
  Eye,
  EyeOff,
  Pencil,
  Search,
  Trash2,
  Vault as VaultIcon,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader, SecretText, StrengthBadge } from "@/components/brand";
import { useApp, useVault } from "@/state/app";
import type { DecryptedItem } from "@/state/app";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { downloadCsv, relativeTime } from "@/lib/analytics";
import { strengthClass } from "@/lib/generator";

type SortKey = "created" | "label" | "strength" | "updated";

export default function VaultPage() {
  const { settings, copySecret, encryptSecret, logEvent } = useApp();
  const { items, isLoading } = useVault();
  const { toast } = useToast();

  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("all");
  const [strength, setStrength] = useState("all");
  const [sort, setSort] = useState<SortKey>("created");
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<DecryptedItem | null>(null);
  const [editForm, setEditForm] = useState({ label: "", username: "", url: "", tag: "", password: "", notes: "" });
  const [deleting, setDeleting] = useState<DecryptedItem | null>(null);

  const tags = useMemo(() => Array.from(new Set(items.map((i) => i.tag))).sort(), [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = items.filter((i) => {
      if (tag !== "all" && i.tag !== tag) return false;
      if (strength !== "all" && strengthClass(i.strengthBits) !== strength) return false;
      if (!q) return true;
      return [i.label, i.username, i.url, i.tag, i.mode].some((f) => f.toLowerCase().includes(q));
    });
    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (sort === "label") return a.label.localeCompare(b.label);
      if (sort === "strength") return b.strengthBits - a.strengthBits;
      if (sort === "updated") return b.updatedAt - a.updatedAt;
      return b.createdAt - a.createdAt;
    });
    return sorted;
  }, [items, query, tag, strength, sort]);

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { iv, ct } = await encryptSecret({ password: editForm.password, notes: editForm.notes });
      await apiRequest("PATCH", `/api/items/${editing.id}`, {
        label: editForm.label,
        username: editForm.username,
        url: editForm.url,
        tag: editForm.tag,
        length: editForm.password.length,
        iv,
        ct,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setEditing(null);
      toast({ title: "Item updated", description: "Re-encrypted before upload." });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setDeleting(null);
      toast({ title: "Item deleted" });
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  function toggleReveal(id: number) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportCsv(rows: DecryptedItem[]) {
    downloadCsv(`passforge-vault-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["label", "username", "url", "tag", "mode", "entropy_bits", "length", "created", "updated"],
      ...rows.map((i) => [
        i.label,
        i.username,
        i.url,
        i.tag,
        i.mode,
        i.strengthBits,
        i.length,
        new Date(i.createdAt).toISOString(),
        new Date(i.updatedAt).toISOString(),
      ]),
    ]);
    toast({
      title: "Vault metadata exported",
      description: "Plaintext passwords are never written to the CSV.",
    });
  }

  const selectedRows = filtered.filter((i) => selected.has(i.id));

  return (
    <div data-testid="view-vault">
      <PageHeader
        title="Vault"
        description={`${items.length} encrypted entr${items.length === 1 ? "y" : "ies"}. Everything below was decrypted locally with your in-memory vault key.`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCsv(selectedRows.length ? selectedRows : filtered)}
            disabled={!filtered.length}
            data-testid="button-export-vault"
          >
            <Download className="mr-2 h-3.5 w-3.5" />
            Export {selectedRows.length ? `${selectedRows.length} selected` : "CSV"}
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search labels, usernames, URLs…"
              className="pl-9"
              data-testid="input-vault-search"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={tag} onValueChange={setTag}>
              <SelectTrigger className="w-[130px]" data-testid="select-filter-tag">
                <SelectValue placeholder="Tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tags</SelectItem>
                {tags.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={strength} onValueChange={setStrength}>
              <SelectTrigger className="w-[140px]" data-testid="select-filter-strength">
                <SelectValue placeholder="Strength" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All strengths</SelectItem>
                <SelectItem value="weak">Weak</SelectItem>
                <SelectItem value="reasonable">Reasonable</SelectItem>
                <SelectItem value="strong">Strong</SelectItem>
                <SelectItem value="overkill">Overkill</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="w-[150px]" data-testid="select-sort">
                <ArrowDownAZ className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created">Newest first</SelectItem>
                <SelectItem value="updated">Recently updated</SelectItem>
                <SelectItem value="label">Label A-Z</SelectItem>
                <SelectItem value="strength">Strongest first</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2" data-testid="state-vault-loading">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !items.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center" data-testid="state-vault-empty">
            <VaultIcon className="h-7 w-7 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Your vault is empty</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Forge a password and save it — it is encrypted before it ever leaves this tab.
              </p>
            </div>
            <Button asChild size="sm" data-testid="button-empty-generate">
              <Link href="/generator">Open the generator</Link>
            </Button>
          </CardContent>
        </Card>
      ) : !filtered.length ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground" data-testid="state-vault-no-match">
            No entries match those filters.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* desktop table */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-sm" data-testid="table-vault">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="w-10 px-3 py-2.5">
                    <Checkbox
                      checked={selected.size > 0 && selectedRows.length === filtered.length}
                      onCheckedChange={(v) =>
                        setSelected(v ? new Set(filtered.map((i) => i.id)) : new Set())
                      }
                      aria-label="Select all"
                      data-testid="checkbox-select-all"
                    />
                  </th>
                  <th className="px-3 py-2.5 font-medium">Entry</th>
                  <th className="px-3 py-2.5 font-medium">Password</th>
                  <th className="px-3 py-2.5 font-medium">Strength</th>
                  <th className="px-3 py-2.5 font-medium">Tag</th>
                  <th className="px-3 py-2.5 font-medium">Updated</th>
                  <th className="w-[132px] px-3 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b border-border last:border-0 ${settings.density === "compact" ? "[&>td]:py-1.5" : "[&>td]:py-3"}`}
                    data-testid={`row-item-${item.id}`}
                  >
                    <td className="px-3">
                      <Checkbox
                        checked={selected.has(item.id)}
                        onCheckedChange={() => toggleSelect(item.id)}
                        aria-label={`Select ${item.label}`}
                        data-testid={`checkbox-item-${item.id}`}
                      />
                    </td>
                    <td className="px-3">
                      <div className="max-w-[220px] truncate font-medium" data-testid={`text-label-${item.id}`}>
                        {item.label}
                      </div>
                      <div className="max-w-[220px] truncate text-[11px] text-muted-foreground">
                        {item.username || "—"}
                        {item.url ? ` · ${item.url}` : ""}
                      </div>
                    </td>
                    <td className="px-3">
                      {item.decryptError ? (
                        <span className="text-xs text-destructive">Cannot decrypt</span>
                      ) : (
                        <SecretText
                          value={item.password}
                          masked={!revealed.has(item.id)}
                          className="block max-w-[240px] truncate text-xs"
                          testId={`text-password-${item.id}`}
                        />
                      )}
                    </td>
                    <td className="px-3">
                      <StrengthBadge bits={item.strengthBits} testId={`badge-strength-${item.id}`} />
                    </td>
                    <td className="px-3">
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                        {item.tag}
                      </span>
                    </td>
                    <td className="px-3 text-xs text-muted-foreground tnum">{relativeTime(item.updatedAt)}</td>
                    <td className="px-3">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => toggleReveal(item.id)}
                          aria-label={revealed.has(item.id) ? "Hide password" : "Reveal password"}
                          data-testid={`button-reveal-${item.id}`}
                        >
                          {revealed.has(item.id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => {
                            void copySecret(item.password);
                            logEvent("copied", { label: item.label });
                            toast({ title: `Copied ${item.label}` });
                          }}
                          aria-label="Copy password"
                          data-testid={`button-copy-${item.id}`}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => {
                            setEditing(item);
                            setEditForm({
                              label: item.label,
                              username: item.username,
                              url: item.url,
                              tag: item.tag,
                              password: item.password,
                              notes: item.notes,
                            });
                          }}
                          aria-label="Edit entry"
                          data-testid={`button-edit-${item.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => setDeleting(item)}
                          aria-label="Delete entry"
                          data-testid={`button-delete-${item.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* mobile / tablet cards */}
          <ul className="divide-y divide-border lg:hidden" data-testid="list-vault-mobile">
            {filtered.map((item) => (
              <li key={item.id} className="p-3" data-testid={`card-item-${item.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{item.label}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {item.username || item.url || item.tag} · {relativeTime(item.updatedAt)}
                    </div>
                  </div>
                  <StrengthBadge bits={item.strengthBits} showBits={false} />
                </div>
                <div className="mt-2 rounded-md border border-border bg-muted/40 px-2.5 py-2">
                  <SecretText
                    value={item.password}
                    masked={!revealed.has(item.id)}
                    className="block text-[11px]"
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => toggleReveal(item.id)} data-testid={`button-mobile-reveal-${item.id}`}>
                    {revealed.has(item.id) ? "Hide" : "Reveal"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => void copySecret(item.password)} data-testid={`button-mobile-copy-${item.id}`}>
                    Copy
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => {
                      setEditing(item);
                      setEditForm({
                        label: item.label,
                        username: item.username,
                        url: item.url,
                        tag: item.tag,
                        password: item.password,
                        notes: item.notes,
                      });
                    }}
                    data-testid={`button-mobile-edit-${item.id}`}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px] text-destructive"
                    onClick={() => setDeleting(item)}
                    data-testid={`button-mobile-delete-${item.id}`}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* edit dialog */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit entry</DialogTitle>
            <DialogDescription>
              Saving re-encrypts the secret with your vault key before it is sent.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="edit-label">Label</Label>
              <Input
                id="edit-label"
                value={editForm.label}
                onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                className="mt-1.5"
                data-testid="input-edit-label"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="edit-username">Username</Label>
                <Input
                  id="edit-username"
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  className="mt-1.5"
                  data-testid="input-edit-username"
                />
              </div>
              <div>
                <Label htmlFor="edit-url">URL</Label>
                <Input
                  id="edit-url"
                  value={editForm.url}
                  onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                  className="mt-1.5"
                  data-testid="input-edit-url"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="edit-tag">Tag</Label>
              <Input
                id="edit-tag"
                value={editForm.tag}
                onChange={(e) => setEditForm({ ...editForm, tag: e.target.value })}
                className="mt-1.5"
                data-testid="input-edit-tag"
              />
            </div>
            <div>
              <Label htmlFor="edit-password">Password</Label>
              <Input
                id="edit-password"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                className="mt-1.5 font-mono text-xs"
                data-testid="input-edit-password"
              />
            </div>
            <div>
              <Label htmlFor="edit-notes">Notes</Label>
              <Input
                id="edit-notes"
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                className="mt-1.5"
                data-testid="input-edit-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button
              onClick={() => editMutation.mutate()}
              disabled={editMutation.isPending}
              data-testid="button-save-edit"
            >
              {editMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the encrypted entry. There is no undo and no server-side copy
              of the plaintext.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
              data-testid="button-confirm-delete"
            >
              Delete entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
