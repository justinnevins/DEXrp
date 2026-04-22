import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Mail, Loader2, Eye, EyeOff } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { FaXTwitter } from "react-icons/fa6";
import { useAuth } from "@/hooks/useAuth";
import { queryClient } from "@/lib/queryClient";

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoadingEmail, setIsLoadingEmail] = useState(false);
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
  const [isLoadingTwitter, setIsLoadingTwitter] = useState(false);
  const initialMode = new URLSearchParams(window.location.search).get("mode") === "register" ? "register" : "login";
  const [mode, setMode] = useState<"login" | "register">(initialMode);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isAuthenticated) {
    setLocation("/");
    return null;
  }

  // Check if running in an iframe (e.g., Replit preview)
  const isInIframe = window.self !== window.top;

  const handleGoogleLogin = async () => {
    // Google blocks OAuth in iframes - open in new tab instead
    if (isInIframe) {
      window.open(window.location.href, "_blank");
      toast({
        title: "Opening in new tab",
        description: "Google sign-in requires opening the app in a new browser tab.",
      });
      return;
    }

    setIsLoadingGoogle(true);
    try {
      const response = await fetch("/api/auth/google/url");
      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({
          title: "Google login unavailable",
          description: data.message || "Please try another login method",
          variant: "destructive",
        });
        setIsLoadingGoogle(false);
      }
    } catch (error) {
      toast({
        title: "Login failed",
        description: "Could not connect to Google. Please try again.",
        variant: "destructive",
      });
      setIsLoadingGoogle(false);
    }
  };

  const handleTwitterLogin = async () => {
    // Twitter/X also blocks OAuth in iframes - open in new tab instead
    if (isInIframe) {
      window.open(window.location.href, "_blank");
      toast({
        title: "Opening in new tab",
        description: "X sign-in requires opening the app in a new browser tab.",
      });
      return;
    }

    setIsLoadingTwitter(true);
    try {
      const response = await fetch("/api/auth/twitter/url");
      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({
          title: "X login unavailable",
          description: data.message || "Please try another login method",
          variant: "destructive",
        });
        setIsLoadingTwitter(false);
      }
    } catch (error) {
      toast({
        title: "Login failed",
        description: "Could not connect to X. Please try again.",
        variant: "destructive",
      });
      setIsLoadingTwitter(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes("@")) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    if (!password) {
      toast({
        title: "Password required",
        description: "Please enter your password",
        variant: "destructive",
      });
      return;
    }

    if (mode === "register" && password.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters",
        variant: "destructive",
      });
      return;
    }

    setIsLoadingEmail(true);
    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: mode === "register" ? "Account created" : "Welcome back",
          description: mode === "register" ? "Your account has been created successfully" : "You are now signed in",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        setLocation("/");
      } else {
        toast({
          title: mode === "register" ? "Registration failed" : "Login failed",
          description: data.message || "Please try again",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingEmail(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen px-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            {mode === "login" ? "Welcome back" : "Create an account"}
          </CardTitle>
          <CardDescription>
            {mode === "login" 
              ? "Sign in to access premium features and cloud sync"
              : "Sign up to unlock premium features"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Button
              onClick={handleGoogleLogin}
              disabled={isLoadingGoogle}
              variant="outline"
              className="w-full h-12"
              data-testid="button-login-google"
            >
              {isLoadingGoogle ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              ) : (
                <SiGoogle className="w-5 h-5 mr-2" />
              )}
              Continue with Google
            </Button>

            <Button
              onClick={handleTwitterLogin}
              disabled={isLoadingTwitter}
              variant="outline"
              className="w-full h-12"
              data-testid="button-login-twitter"
            >
              {isLoadingTwitter ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              ) : (
                <FaXTwitter className="w-5 h-5 mr-2" />
              )}
              Continue with X
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or continue with email
              </span>
            </div>
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoadingEmail}
                data-testid="input-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={mode === "register" ? "At least 8 characters" : "Enter your password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoadingEmail}
                  data-testid="input-password"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
            <Button
              type="submit"
              disabled={isLoadingEmail || !email || !password}
              className="w-full h-12"
              data-testid="button-submit-email"
            >
              {isLoadingEmail ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              ) : (
                <Mail className="w-5 h-5 mr-2" />
              )}
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="text-center">
            <Button
              variant="link"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
              className="text-sm"
              data-testid="button-toggle-mode"
            >
              {mode === "login" 
                ? "Don't have an account? Sign up"
                : "Already have an account? Sign in"}
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>

          <div className="text-center">
            <Button
              variant="ghost"
              onClick={() => setLocation("/")}
              className="text-sm"
              data-testid="button-continue-guest"
            >
              Continue as guest
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
