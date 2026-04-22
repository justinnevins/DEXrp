import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { WalletProvider } from "@/contexts/wallet-context";
import { FormSubmissionProvider } from "@/contexts/form-submission-context";
import { SyncProvider } from "@/contexts/sync-context";
import { MobileAppLayout } from "@/components/layout/mobile-app-layout";
import Home from "@/pages/home";
import Send from "@/pages/send";
import Transactions from "@/pages/transactions";
import Assets from "@/pages/assets";
import DEX from "@/pages/dex";
import Profile from "@/pages/profile";
import Privacy from "@/pages/Privacy";
import Login from "@/pages/login";
import NotFound from "@/pages/NotFoundPage";

function Router() {
  return (
    <>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/send" component={Send} />
        <Route path="/transactions" component={Transactions} />
        <Route path="/assets" component={Assets} />
        <Route path="/dex" component={DEX} />
        <Route path="/profile" component={Profile} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/login" component={Login} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="xrpl-wallet-theme">
        <WalletProvider>
          <SyncProvider>
            <FormSubmissionProvider>
              <TooltipProvider>
                <Toaster />
                <MobileAppLayout>
                  <Router />
                </MobileAppLayout>
              </TooltipProvider>
            </FormSubmissionProvider>
          </SyncProvider>
        </WalletProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
