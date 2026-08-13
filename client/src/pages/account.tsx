import { useState } from "react";
import { KeyRound, ShieldCheck, Download, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { PageHeader, StrengthBadge } from "@/components/brand";
import { useApp, useVault } from "@/state/app";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { relativeTime } from "@/lib/analytics";
import { analyzePassword } from "@/lib/generator";
import { PBKDF2_ITERATIONS } from "@/lib/crypto";

export default function AccountPage() {
  const { user, session, updateProfile, changeMasterPassword, logout } = useApp();
  const { items } = useVault();
  const { toast } = useToast();

  const [profile, setProfile] = useState({ name: user?.name ?? "", email: user?.email ?? "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [rekeying, setRekeying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState("");

  const nextStrength = analyzePassword(pw.next);

  async function onSaveProfile() {
    setSavingProfile(true);
    try {
      await updateProfile(profile.name.trim(), profile.email.trim());
      toast({ title: "Profile updated" });
    } catch (e) {
      toast({ title: "Update failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  }

  async function onRekey() {
    if (pw.next !== pw.confirm) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (pw.next.length < 10) {
      toast({ title: "Use at least 10 characters", variant: "destructive" });
      return;
    }
    setRekeying(true);
    try {
      const count = await changeMasterPassword(pw.current, pw.next);
      setPw({ current: "", next: "", confirm: "" });
      toast({
        title: "Master password changed",
        description: `${count} vault item${count === 1 ? "" : "s"} re-encrypted with the new key.`,
      });
    } catch (e) {
      toast({ title: "Could not change password", description: (e as Error).message, variant: "destructive" });
    } finally {
      setRekeying(false);
    }
  }

  async function onExport() {
    try {
      const res = await apiRequest("GET", "/api/account/export");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `passforge-encrypted-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({
        title: "Encrypted export downloaded",
        description: "Ciphertext only — it is useless without your master password.",
      });
    } catch (e) {
      toast({ title: "Export failed", description: (e as Error).message, variant: "destructive" });
    }
  }

  async function onDeleteAccount() {
    try {
      await apiRequest("DELETE", "/api/account");
      await logout();
      toast({ title: "Account deleted", description: "Every encrypted record was removed." });
    } catch (e) {
      toast({ title: "Delete failed", description: (e as Error).message, variant: "destructive" });
    }
  }

  return (
    <div data-testid="view-account">
      <PageHeader title="Account" description="Identity, key rotation, export and deletion." />

      <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <UserRound className="h-4 w-4 text-primary" />
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="account-name">Display name</Label>
              <Input
                id="account-name"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                className="mt-1.5"
                data-testid="input-account-name"
              />
            </div>
            <div>
              <Label htmlFor="account-email">Email</Label>
              <Input
                id="account-email"
                type="email"
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                className="mt-1.5"
                data-testid="input-account-email"
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                The email is part of the auth-hash salt, so changing it re-derives your login hash on
                the next sign-in.
              </p>
            </div>
            <Button
              size="sm"
              onClick={onSaveProfile}
              disabled={savingProfile}
              data-testid="button-save-profile"
            >
              {savingProfile ? "Saving…" : "Save profile"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Session and key material
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-xs">
              {[
                ["Vault created", user ? relativeTime(user.createdAt) : "—"],
                ["Encrypted items", String(items.length)],
                ["Key derivation", `PBKDF2-SHA256, ${PBKDF2_ITERATIONS.toLocaleString()} iterations`],
                ["Cipher", "AES-256-GCM, 96-bit random IV per item"],
                ["Vault salt", session ? `${user?.vaultSalt.slice(0, 24)}…` : "—"],
                ["Token storage", "React memory only — no browser-persisted storage"],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-baseline justify-between gap-4 border-b border-border pb-2 last:border-0 last:pb-0"
                >
                  <dt className="shrink-0 text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 truncate text-right font-medium" title={v}>
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="h-4 w-4 text-primary" />
              Change master password
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Every item is decrypted with the old key and re-encrypted with the new one in this tab
              before anything is uploaded.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="pw-current">Current master password</Label>
              <Input
                id="pw-current"
                type="password"
                value={pw.current}
                onChange={(e) => setPw({ ...pw, current: e.target.value })}
                className="mt-1.5"
                data-testid="input-current-password"
              />
            </div>
            <div>
              <Label htmlFor="pw-next">New master password</Label>
              <Input
                id="pw-next"
                type="password"
                value={pw.next}
                onChange={(e) => setPw({ ...pw, next: e.target.value })}
                className="mt-1.5"
                data-testid="input-new-password"
              />
              {pw.next && (
                <div className="mt-2">
                  <StrengthBadge bits={nextStrength.bits} testId="badge-new-password-strength" />
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="pw-confirm">Confirm new password</Label>
              <Input
                id="pw-confirm"
                type="password"
                value={pw.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
                className="mt-1.5"
                data-testid="input-confirm-password"
              />
            </div>
            <Button
              size="sm"
              onClick={onRekey}
              disabled={rekeying || !pw.current || !pw.next}
              data-testid="button-change-password"
            >
              {rekeying ? "Re-encrypting vault…" : "Change and re-encrypt"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Download className="h-4 w-4 text-primary" />
              Data controls
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border border-border p-3">
              <p className="text-xs font-medium">Encrypted JSON export</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Downloads your profile metadata plus every item as ciphertext, IV and salt. Restoring
                requires your master password.
              </p>
              <Button size="sm" variant="outline" className="mt-2" onClick={onExport} data-testid="button-export-json">
                Download export
              </Button>
            </div>
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-xs font-medium text-destructive">Delete account</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Removes the user row, every session and all encrypted items. This cannot be undone.
              </p>
              <Button
                size="sm"
                variant="destructive"
                className="mt-2"
                onClick={() => setConfirmDelete(true)}
                data-testid="button-open-delete-account"
              >
                Delete my vault
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this vault permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              Type <span className="font-medium">{user?.email}</span> to confirm. All {items.length}{" "}
              encrypted entries will be destroyed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteEmail}
            onChange={(e) => setDeleteEmail(e.target.value)}
            placeholder={user?.email}
            data-testid="input-confirm-delete-email"
          />
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-account">Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteEmail !== user?.email}
              onClick={onDeleteAccount}
              data-testid="button-confirm-delete-account"
            >
              Delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
