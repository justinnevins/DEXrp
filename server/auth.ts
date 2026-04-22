import session from "express-session";
import type { Express, RequestHandler, Request, Response, NextFunction } from "express";
import connectPg from "connect-pg-simple";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import type { User, AuthProvider } from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    expiresAt?: number;
  }
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
      sameSite: "lax",
    },
  });
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function generateUserId(): string {
  return crypto.randomUUID();
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  // Helper to get the correct protocol (always HTTPS in production)
  const getProtocol = (req: any) => {
    // Check x-forwarded-proto header first (set by reverse proxy)
    const forwardedProto = req.get("x-forwarded-proto");
    if (forwardedProto) return forwardedProto.split(",")[0].trim();
    // Fall back to req.protocol, but prefer HTTPS in production
    if (process.env.NODE_ENV === "production" || req.get("host")?.includes(".replit")) return "https";
    return req.protocol;
  };

  // Google OAuth - Get authorization URL
  app.get("/api/auth/google/url", (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ message: "Google OAuth not configured" });
    }

    const host = req.get("host");
    const protocol = getProtocol(req);
    const redirectUri = `${protocol}://${host}/api/auth/google/callback`;
    const state = generateToken();
    
    // Store state in session for CSRF protection
    req.session.oauthState = state;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "offline",
      prompt: "consent",
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    console.log("[Google OAuth] Generated URL with redirect_uri:", redirectUri);
    res.json({ url });
  });

  // Google OAuth callback
  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      
      if (!code || typeof code !== "string") {
        return res.redirect("/?error=missing_code");
      }

      // Verify state for CSRF protection
      if (state !== req.session.oauthState) {
        return res.redirect("/?error=invalid_state");
      }
      delete req.session.oauthState;

      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        return res.redirect("/?error=oauth_not_configured");
      }

      const host = req.get("host");
      const protocol = getProtocol(req);
      const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

      // Exchange code for tokens
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        console.error("Google token exchange failed:", await tokenResponse.text());
        return res.redirect("/?error=token_exchange_failed");
      }

      const tokens = await tokenResponse.json();

      // Get user info
      const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      if (!userInfoResponse.ok) {
        return res.redirect("/?error=userinfo_failed");
      }

      const googleUser = await userInfoResponse.json();

      // Find or create user
      const user = await findOrCreateOAuthUser({
        provider: "google",
        providerAccountId: googleUser.id,
        email: googleUser.email,
        firstName: googleUser.given_name,
        lastName: googleUser.family_name,
        profileImageUrl: googleUser.picture,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined,
      });

      // Set session
      req.session.userId = user.id;
      req.session.expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
      
      res.redirect("/");
    } catch (error) {
      console.error("Google OAuth error:", error);
      res.redirect("/?error=oauth_error");
    }
  });

  // X (Twitter) OAuth - Get authorization URL
  app.get("/api/auth/twitter/url", (req, res) => {
    const clientId = process.env.TWITTER_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ message: "X OAuth not configured" });
    }

    const host = req.get("host");
    const protocol = getProtocol(req);
    const redirectUri = `${protocol}://${host}/api/auth/twitter/callback`;
    const state = generateToken();
    const codeVerifier = generateToken();
    
    // Store state and code verifier in session for PKCE
    req.session.oauthState = state;
    req.session.codeVerifier = codeVerifier;

    // Generate code challenge for PKCE
    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "users.read tweet.read offline.access",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    const url = `https://twitter.com/i/oauth2/authorize?${params}`;
    res.json({ url });
  });

  // X (Twitter) OAuth callback
  app.get("/api/auth/twitter/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      
      if (!code || typeof code !== "string") {
        return res.redirect("/?error=missing_code");
      }

      if (state !== req.session.oauthState) {
        return res.redirect("/?error=invalid_state");
      }
      
      const codeVerifier = req.session.codeVerifier;
      delete req.session.oauthState;
      delete req.session.codeVerifier;

      if (!codeVerifier) {
        return res.redirect("/?error=missing_verifier");
      }

      const clientId = process.env.TWITTER_CLIENT_ID;
      const clientSecret = process.env.TWITTER_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        return res.redirect("/?error=oauth_not_configured");
      }

      const host = req.get("host");
      const protocol = getProtocol(req);
      const redirectUri = `${protocol}://${host}/api/auth/twitter/callback`;

      // Exchange code for tokens
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const tokenResponse = await fetch("https://api.twitter.com/2/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          code,
          grant_type: "authorization_code",
          client_id: clientId,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      });

      if (!tokenResponse.ok) {
        console.error("Twitter token exchange failed:", await tokenResponse.text());
        return res.redirect("/?error=token_exchange_failed");
      }

      const tokens = await tokenResponse.json();

      // Get user info
      const userInfoResponse = await fetch("https://api.twitter.com/2/users/me?user.fields=profile_image_url", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      if (!userInfoResponse.ok) {
        return res.redirect("/?error=userinfo_failed");
      }

      const twitterData = await userInfoResponse.json();
      const twitterUser = twitterData.data;

      // Find or create user
      const user = await findOrCreateOAuthUser({
        provider: "twitter",
        providerAccountId: twitterUser.id,
        email: null, // Twitter doesn't always provide email
        firstName: twitterUser.name?.split(" ")[0],
        lastName: twitterUser.name?.split(" ").slice(1).join(" "),
        profileImageUrl: twitterUser.profile_image_url,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined,
      });

      // Set session
      req.session.userId = user.id;
      req.session.expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
      
      res.redirect("/");
    } catch (error) {
      console.error("Twitter OAuth error:", error);
      res.redirect("/?error=oauth_error");
    }
  });

  // Email/Password Registration
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || typeof email !== "string" || !email.includes("@")) {
        return res.status(400).json({ message: "Valid email is required" });
      }
      
      if (!password || typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const normalizedEmail = email.toLowerCase().trim();
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(normalizedEmail);
      if (existingUser) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user
      const user = await storage.upsertUser({
        id: generateUserId(),
        email: normalizedEmail,
        passwordHash,
      });

      // Create OAuth account record for email provider
      await storage.createOAuthAccount({
        userId: user.id,
        provider: "email",
        providerAccountId: normalizedEmail,
        email: normalizedEmail,
      });

      // Set session
      req.session.userId = user.id;
      req.session.expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Failed to save session" });
        }
        res.json({ message: "Account created successfully", user: { id: user.id, email: user.email } });
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Failed to create account" });
    }
  });

  // Email/Password Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || typeof email !== "string" || !email.includes("@")) {
        return res.status(400).json({ message: "Valid email is required" });
      }
      
      if (!password || typeof password !== "string") {
        return res.status(400).json({ message: "Password is required" });
      }

      const normalizedEmail = email.toLowerCase().trim();
      
      // Find user
      const user = await storage.getUserByEmail(normalizedEmail);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Check if user has a password (might have signed up with OAuth only)
      if (!user.passwordHash) {
        return res.status(401).json({ 
          message: "This account was created with Google or X. Please sign in using those methods, then you can set a password in your profile.",
          noPassword: true 
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Set session
      req.session.userId = user.id;
      req.session.expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Failed to save session" });
        }
        res.json({ message: "Logged in successfully", user: { id: user.id, email: user.email } });
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Failed to log in" });
    }
  });

  // Set password for authenticated users (for accounts created via OAuth)
  app.post("/api/auth/set-password", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { password } = req.body;
      
      if (!password || typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      await storage.updateUser(userId, { passwordHash });

      res.json({ message: "Password set successfully" });
    } catch (error) {
      console.error("Set password error:", error);
      res.status(500).json({ message: "Failed to set password" });
    }
  });

  // Logout
  app.post("/api/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out" });
    });
  });

  // Also support GET for convenience
  app.get("/api/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.redirect("/?error=logout_failed");
      }
      res.clearCookie("connect.sid");
      res.redirect("/");
    });
  });
}

interface OAuthUserData {
  provider: AuthProvider;
  providerAccountId: string;
  email: string | null;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
}

async function findOrCreateOAuthUser(data: OAuthUserData): Promise<User> {
  // Check if OAuth account already exists
  const existingAccount = await storage.getOAuthAccount(data.provider, data.providerAccountId);
  
  if (existingAccount) {
    // Update tokens if provided
    if (data.accessToken || data.refreshToken) {
      await storage.updateOAuthAccount(existingAccount.id, {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
      });
    }
    
    // Return existing user
    const user = await storage.getUser(existingAccount.userId);
    if (user) return user;
  }

  // Check if user exists with same email
  let user: User | undefined;
  if (data.email) {
    user = await storage.getUserByEmail(data.email);
  }

  if (!user) {
    // Create new user
    user = await storage.upsertUser({
      id: generateUserId(),
      email: data.email || undefined,
      firstName: data.firstName,
      lastName: data.lastName,
      profileImageUrl: data.profileImageUrl,
    });
  } else {
    // Update existing user profile
    await storage.updateUser(user.id, {
      firstName: data.firstName || user.firstName,
      lastName: data.lastName || user.lastName,
      profileImageUrl: data.profileImageUrl || user.profileImageUrl,
    });
  }

  // Create OAuth account link if it doesn't exist
  if (!existingAccount) {
    await storage.createOAuthAccount({
      userId: user.id,
      provider: data.provider,
      providerAccountId: data.providerAccountId,
      email: data.email,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
    });
  }

  return user;
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const userId = req.session?.userId;
  const expiresAt = req.session?.expiresAt;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Check if session is still valid
  if (expiresAt && Date.now() > expiresAt) {
    return res.status(401).json({ message: "Session expired" });
  }

  // Verify user still exists
  const user = await storage.getUser(userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Attach user to request for downstream handlers
  (req as any).user = user;
  next();
};

// Extend session types
declare module "express-session" {
  interface SessionData {
    oauthState?: string;
    codeVerifier?: string;
  }
}
