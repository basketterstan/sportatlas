import express, { Request, Response } from "express";
import axios from "axios";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";

const __dirname = process.cwd();

// Load .env file into process.env (Vite only does this for the frontend build, not the server process)
const envFilePath = path.join(__dirname, ".env");
if (fs.existsSync(envFilePath)) {
  fs.readFileSync(envFilePath, "utf-8").split("\n").forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        const k = trimmed.slice(0, eq).trim();
        const v = trimmed.slice(eq + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
  });
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  console.log(`[Server] Initializing on port ${PORT}...`);

  app.use(cors());
  app.use(express.json());

  // Verify Firebase ID token via REST (no admin SDK needed)
  const verifyFirebaseToken = async (token: string): Promise<boolean> => {
    try {
      const firebaseApiKey = process.env.VITE_FIREBASE_API_KEY;
      if (!firebaseApiKey) return false;
      const response = await axios.post(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`,
        { idToken: token }
      );
      return response.status === 200 && response.data?.users?.length > 0;
    } catch {
      return false;
    }
  };

  // AI proxy endpoint — OpenAI key stays on the server, never sent to browser
  app.post("/api/ai/chat", async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const token = authHeader.slice(7);
    const isValid = await verifyFirebaseToken(token);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const { model, messages, response_format, max_tokens, temperature } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array required" });
    }

    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await openai.chat.completions.create({
        model: model || "gpt-4o",
        messages,
        ...(response_format && { response_format }),
        ...(max_tokens && { max_tokens }),
        ...(temperature !== undefined && { temperature }),
      });
      res.json({ content: completion.choices[0]?.message?.content || "" });
    } catch (err: any) {
      console.error("[AI Proxy] OpenAI error:", err?.message);
      res.status(500).json({ error: "AI request failed" });
    }
  });

  // Stripe donation — one-time payment, no auth required
  app.post("/api/stripe/donate", async (req: Request, res: Response) => {
    const { amount, matchCode } = req.body;
    if (!Number.isInteger(amount) || amount < 100 || amount > 100000) {
      return res.status(400).json({ error: "Ongeldig bedrag (min €1, max €1000)" });
    }
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return res.status(500).json({ error: "Stripe niet geconfigureerd" });
    }
    const origin = req.headers.origin || "https://hoopsatlas.com";
    const successUrl = matchCode
      ? `${origin}/?matchCode=${encodeURIComponent(matchCode)}&donation=success`
      : `${origin}/?donation=success`;
    try {
      const params = new URLSearchParams({
        "payment_method_types[]": "card",
        "line_items[0][price_data][currency]": "eur",
        "line_items[0][price_data][product_data][name]": "Support HoopsAtlas",
        "line_items[0][price_data][product_data][description]": "Thank you! Every contribution helps us keep filming games for free.",
        "line_items[0][price_data][unit_amount]": String(amount),
        "line_items[0][quantity]": "1",
        "mode": "payment",
        "success_url": successUrl,
        "cancel_url": `${origin}/?donation=cancelled`,
      });
      const response = await axios.post(
        "https://api.stripe.com/v1/checkout/sessions",
        params.toString(),
        { headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" } }
      );
      res.json({ url: response.data.url });
    } catch (err: any) {
      console.error("[Donate] Stripe error:", err?.response?.data || err?.message);
      res.status(500).json({ error: "Betaalsessie aanmaken mislukt" });
    }
  });

  // Health check endpoint
  app.get("/api/health", (req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString()
    });
  });

  // Scrimmage Hub tracked redirect
  app.get("/scrimmage", (req: Request, res: Response) => {
    res.redirect(302, "/?ref=scrimmage-hub&view=scrimmage-hub");
  });

  // VBL Proxy Routes
  const vblApi = axios.create({
    baseURL: "https://vblweb.wisseq.eu/api/v1",
    headers: {
      "Accept": "application/json, text/plain, */*",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Origin": "https://www.basketbal.vlaanderen",
      "Referer": "https://www.basketbal.vlaanderen/"
    },
    timeout: 15000
  });

  // Search for clubs/teams
  app.get("/api/vbl/search", async (req: Request, res: Response) => {
    const { q } = req.query;
    const endpoints = ["/Clubs", "/Club/GetClubs", "/Clubs/GetClubs", "/Club"];
    
    for (const endpoint of endpoints) {
      try {
        console.log(`Trying VBL Search: ${endpoint}`);
        const response = await vblApi.get(endpoint);
        if (response.data && Array.isArray(response.data)) {
          const filtered = response.data.filter((c: any) => 
            (c.naam && c.naam.toLowerCase().includes(String(q).toLowerCase())) ||
            (c.stamnummer && String(c.stamnummer).includes(String(q)))
          ).slice(0, 15);
          return res.json(filtered);
        }
      } catch (error: any) {
        console.warn(`VBL Search failed for ${endpoint}: ${error.message} (${error.response?.status})`);
      }
    }
    res.status(404).json({ error: "Failed to fetch clubs from VBL. The API might be temporarily unavailable." });
  });

  // Get teams for a club
  app.get("/api/vbl/club/:clubId/teams", async (req: Request, res: Response) => {
    const { clubId } = req.params;
    const endpoints = [
      `/Clubs/${clubId}/Teams`, 
      `/Team/GetTeamsByClub?clubGuid=${clubId}`, 
      `/Clubs/GetTeams?clubGuid=${clubId}`,
      `/Club/${clubId}/Teams`
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await vblApi.get(endpoint);
        if (response.data) return res.json(response.data);
      } catch (error: any) {
        console.warn(`VBL Teams failed for ${endpoint}: ${error.message}`);
      }
    }
    res.status(404).json({ error: "Failed to fetch teams from VBL" });
  });

  // Get matches for a team
  app.get("/api/vbl/team/:teamId/matches", async (req: Request, res: Response) => {
    const { teamId } = req.params;
    const endpoints = [
      `/Teams/${teamId}/Matches`, 
      `/Match/GetMatchesByTeam?teamGuid=${teamId}`, 
      `/Teams/GetMatches?teamGuid=${teamId}`,
      `/Team/${teamId}/Matches`
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await vblApi.get(endpoint);
        if (response.data) return res.json(response.data);
      } catch (error: any) {
        console.warn(`VBL Matches failed for ${endpoint}: ${error.message}`);
      }
    }
    res.status(404).json({ error: "Failed to fetch matches from VBL" });
  });

  // Get team details by ID
  app.get("/api/vbl/team/:teamId", async (req: Request, res: Response) => {
    const { teamId } = req.params;
    const endpoints = [`/Teams/${teamId}`, `/Team/GetTeam?teamGuid=${teamId}`, `/Team/${teamId}`];
    
    for (const endpoint of endpoints) {
      try {
        const response = await vblApi.get(endpoint);
        if (response.data) return res.json(response.data);
      } catch (error: any) {
        console.warn(`VBL Team Detail failed for ${endpoint}: ${error.message}`);
      }
    }
    res.status(404).json({ error: "Failed to fetch team details" });
  });

  // Get all competitions
  app.get("/api/vbl/competitions", async (req: Request, res: Response) => {
    const endpoints = [
      "/Competitions", 
      "/Competition/GetCompetitions", 
      "/Matches/GetCompetitions", 
      "/Competities",
      "/Competition"
    ];
    
    for (const endpoint of endpoints) {
      try {
        console.log(`Trying VBL Competitions: ${endpoint}`);
        const response = await vblApi.get(endpoint);
        if (response.data && Array.isArray(response.data)) {
          return res.json(response.data);
        }
      } catch (error: any) {
        console.warn(`VBL Competitions failed for ${endpoint}: ${error.message} (${error.response?.status})`);
      }
    }
    res.status(404).json({ error: "Could not find competitions list on VBL servers." });
  });

  // Get matches for a competition
  app.get("/api/vbl/competition/:compId/matches", async (req: Request, res: Response) => {
    const { compId } = req.params;
    const endpoints = [
      `/Competitions/${compId}/Matches`, 
      `/Match/GetMatchesByCompetition?competitionGuid=${compId}`, 
      `/Competitions/GetMatches?competitionGuid=${compId}`,
      `/Competition/${compId}/Matches`
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await vblApi.get(endpoint);
        if (response.data) return res.json(response.data);
      } catch (error: any) {
        console.warn(`VBL Comp Matches failed for ${endpoint}: ${error.message}`);
      }
    }
    res.status(404).json({ error: "Failed to fetch competition matches" });
  });

  // Vite middleware for development
  const isProduction = process.env.NODE_ENV === "production";
  const distPath = path.join(__dirname, "dist");

  if (isProduction && fs.existsSync(distPath)) {
    console.log(`[Server] Production mode: Serving static files from ${distPath}`);
    // Serve static files from root
    app.use(express.static(distPath));
    
    // Fallback for all other routes to index.html (SPA routing)
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    console.log("[Server] Development mode: Loading Vite...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    // Explicit fallback for development
    app.get("*", async (req: Request, res: Response, next) => {
      try {
        const url = req.originalUrl;
        const template = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf-8");
        const html = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  }

  app.listen(PORT, () => {
    console.log(`[Server] SUCCESS: Listening on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error("[Server] FATAL ERROR during startup:", err);
  process.exit(1);
});
