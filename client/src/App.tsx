import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider, useApp } from "@/state/app";
import { AppShell } from "@/components/shell";
import AuthPage from "@/pages/auth";
import Overview from "@/pages/overview";
import Generator from "@/pages/generator";
import VaultView from "@/pages/vault";
import Audit from "@/pages/audit";
import Activity from "@/pages/activity";
import Account from "@/pages/account";
import Settings from "@/pages/settings";
import Help from "@/pages/help";
import NotFound from "@/pages/not-found";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Overview} />
      <Route path="/generator" component={Generator} />
      <Route path="/vault" component={VaultView} />
      <Route path="/audit" component={Audit} />
      <Route path="/activity" component={Activity} />
      <Route path="/account" component={Account} />
      <Route path="/settings" component={Settings} />
      <Route path="/help" component={Help} />
      <Route component={NotFound} />
    </Switch>
  );
}

function Gate() {
  const { session } = useApp();
  if (!session) return <AuthPage />;
  return (
    <AppShell>
      <AppRouter />
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <Gate />
          </Router>
        </AppProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
