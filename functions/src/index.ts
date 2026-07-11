import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import express, { Request, Response } from "express";
import axios from "axios";
import cors from "cors";
import OpenAI from "openai";

admin.initializeApp();

const ALLOWED_ORIGINS = [
  "https://hoopsatlas.com",
  "https://app.hoopsatlas.com",
  "https://www.hoopsatlas.com",
];

const app = express();
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  }
}));
app.use(express.json({ limit: "64kb" }));

type SubscriptionPlan = "free" | "basic" | "pro" | "club10" | "club20" | "clubUnlimited" | "gameAnalysis";

const ACTIVE_STRIPE_STATUSES = new Set(["active", "trialing"]);

const PLAN_PRIORITY: Record<SubscriptionPlan, number> = {
  free: 0,
  basic: 1,
  pro: 2,
  club10: 3,
  club20: 4,
  clubUnlimited: 5,
  gameAnalysis: 2,
};

const STRIPE_PRICE_TO_PLAN: Record<string, SubscriptionPlan> = {
  [process.env.VITE_STRIPE_PRICE_BASIC_MONTH || "price_1Ske3UP2I9jygKKDEx9iTc8o"]: "basic",
  [process.env.VITE_STRIPE_PRICE_BASIC_YEAR || "price_1Ske3UP2I9jygKKDsyuemUrz"]: "basic",
  [process.env.VITE_STRIPE_PRICE_PRO_MONTH || "price_1SlBQMP2I9jygKKDWMEdjIEm"]: "pro",
  [process.env.VITE_STRIPE_PRICE_PRO_YEAR || "price_1SlBQMP2I9jygKKDAPzu4krq"]: "pro",
  [process.env.VITE_STRIPE_PRICE_CLUB10_MONTH || "price_1SoVVvP2I9jygKKDMqczYko2"]: "club10",
  [process.env.VITE_STRIPE_PRICE_CLUB10_YEAR || "price_1SoVVvP2I9jygKKDuUpPvPNH"]: "club10",
  [process.env.VITE_STRIPE_PRICE_CLUB20_MONTH || "price_1SoVXFP2I9jygKKDulHau63s"]: "club20",
  [process.env.VITE_STRIPE_PRICE_CLUB20_YEAR || "price_1SoVXFP2I9jygKKDweZqAKZb"]: "club20",
  [process.env.VITE_STRIPE_PRICE_CLUBUNLIMITED_MONTH || "price_1SoVp9P2I9jygKKD0yTNqgSU"]: "clubUnlimited",
  [process.env.VITE_STRIPE_PRICE_CLUBUNLIMITED_YEAR || "price_1SoVpbP2I9jygKKDHSLAHLNC"]: "clubUnlimited",
  [process.env.VITE_STRIPE_PRICE_GAMEANALYSIS_MONTH || "price_1Tgg8cP2I9jygKKDzAVwAZc1"]: "gameAnalysis",
  [process.env.VITE_STRIPE_PRICE_GAMEANALYSIS_YEAR || "price_1Tgg8cP2I9jygKKDUBcKvibr"]: "gameAnalysis",
};

const normalizePlan = (value?: unknown): SubscriptionPlan => {
  const normalized = String(value || "").toLowerCase().replace(/[_\s-]/g, "");
  if (normalized === "basic") return "basic";
  if (normalized === "pro") return "pro";
  if (normalized === "club10") return "club10";
  if (normalized === "club20") return "club20";
  if (normalized === "clubunlimited") return "clubUnlimited";
  if (normalized === "gameanalysis") return "gameAnalysis";
  return "free";
};

const getNested = (source: Record<string, unknown>, path: string): unknown => {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    if (Array.isArray(current)) {
      const index = Number(key);
      return Number.isInteger(index) ? current[index] : undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, source);
};

const getPlanFromSubscription = (subscription: Record<string, unknown>): SubscriptionPlan => {
  const rolePlan = normalizePlan(
    subscription.role ||
    subscription.stripeRole ||
    getNested(subscription, "metadata.firebaseRole") ||
    getNested(subscription, "metadata.plan")
  );
  if (rolePlan !== "free") return rolePlan;

  const priceCandidates = [
    subscription.price,
    getNested(subscription, "price.id"),
    subscription.priceId,
    subscription.price_id,
    getNested(subscription, "items.0.price"),
    getNested(subscription, "items.0.price.id"),
    getNested(subscription, "items.data.0.price"),
    getNested(subscription, "items.data.0.price.id"),
  ];

  for (const candidate of priceCandidates) {
    const priceId = typeof candidate === "string"
      ? candidate
      : candidate && typeof candidate === "object"
        ? String((candidate as Record<string, unknown>).id || "")
        : "";
    const plan = STRIPE_PRICE_TO_PLAN[priceId];
    if (plan) return plan;
  }

  return "free";
};

const maxPlan = (current: SubscriptionPlan, next: SubscriptionPlan): SubscriptionPlan => {
  return PLAN_PRIORITY[next] > PLAN_PRIORITY[current] ? next : current;
};

// VBL Proxy Config
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

// Verify Firebase ID token
const verifyToken = async (req: Request): Promise<admin.auth.DecodedIdToken | null> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    return await admin.auth().verifyIdToken(authHeader.slice(7));
  } catch {
    return null;
  }
};

// Allowlist of models and a hard cap on tokens
const ALLOWED_MODELS = new Set(["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]);
const MAX_TOKENS_CAP = 2000;

// Validate that a VBL path parameter only contains safe characters
const isValidVblId = (id: string) => /^[\w\-]{1,64}$/.test(id);

// Health check
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// AI proxy endpoint — requires auth
app.post("/api/ai/chat", async (req: Request, res: Response) => {
  const decoded = await verifyToken(req);
  if (!decoded) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const { messages, response_format, temperature } = req.body;
  const model = ALLOWED_MODELS.has(req.body.model) ? req.body.model : "gpt-4o";
  const max_tokens = Math.min(Number(req.body.max_tokens) || 1000, MAX_TOKENS_CAP);

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array required" });
  }

  // Only allow role+content fields per message — strip everything else
  const sanitizedMessages = messages.map((m: any) => ({
    role: ["system", "user", "assistant"].includes(m.role) ? m.role : "user",
    content: typeof m.content === "string" ? m.content.slice(0, 8000) : "",
  }));

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OpenAI API key not configured" });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model,
      messages: sanitizedMessages,
      max_tokens,
      ...(response_format && { response_format }),
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
    return res.status(400).json({ error: "Invalid amount (min €1, max €1000)" });
  }
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: "Stripe not configured" });
  }

  // Only allow origin from our own domain
  const origin = ALLOWED_ORIGINS.includes(req.headers.origin || "")
    ? req.headers.origin!
    : "https://hoopsatlas.com";

  const successUrl = matchCode
    ? `${origin}/?matchCode=${encodeURIComponent(String(matchCode).slice(0, 50))}&donation=success`
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
    res.status(500).json({ error: "Payment session creation failed" });
  }
});

// Search for clubs/teams
app.get("/api/vbl/search", async (req: Request, res: Response) => {
  const { q } = req.query;
  const endpoints = ["/Clubs", "/Club/GetClubs", "/Clubs/GetClubs", "/Club"];

  for (const endpoint of endpoints) {
    try {
      const response = await vblApi.get(endpoint);
      if (response.data && Array.isArray(response.data)) {
        const filtered = response.data.filter((c: any) =>
          (c.naam && c.naam.toLowerCase().includes(String(q).toLowerCase())) ||
          (c.stamnummer && String(c.stamnummer).includes(String(q)))
        ).slice(0, 15);
        return res.json(filtered);
      }
    } catch (error: any) {
      console.warn(`VBL Search failed for ${endpoint}: ${error.message}`);
    }
  }
  res.status(404).json({ error: "Failed to fetch clubs from VBL" });
});

// Get teams for a club
app.get("/api/vbl/club/:clubId/teams", async (req: Request, res: Response) => {
  const { clubId } = req.params;
  if (!isValidVblId(clubId)) return res.status(400).json({ error: "Invalid clubId" });
  const endpoints = [`/Clubs/${clubId}/Teams`, `/Team/GetTeamsByClub?clubGuid=${clubId}`];
  for (const endpoint of endpoints) {
    try {
      const response = await vblApi.get(endpoint);
      if (response.data) return res.json(response.data);
    } catch (error) { console.warn(`VBL Teams fetch failed for ${clubId} at ${endpoint}:`, (error as Error).message); }
  }
  res.status(404).json({ error: "Failed to fetch teams" });
});

// Get matches for a team
app.get("/api/vbl/team/:teamId/matches", async (req: Request, res: Response) => {
  const { teamId } = req.params;
  if (!isValidVblId(teamId)) return res.status(400).json({ error: "Invalid teamId" });
  try {
    const response = await vblApi.get(`/Teams/${teamId}/Matches`);
    return res.json(response.data);
  } catch (error) {
    res.status(404).json({ error: "Failed to fetch matches" });
  }
});

// Get team details
app.get("/api/vbl/team/:teamId", async (req: Request, res: Response) => {
  const { teamId } = req.params;
  if (!isValidVblId(teamId)) return res.status(400).json({ error: "Invalid teamId" });
  try {
    const response = await vblApi.get(`/Teams/${teamId}`);
    return res.json(response.data);
  } catch (error) {
    res.status(404).json({ error: "Failed to fetch team details" });
  }
});

// Get competitions
app.get("/api/vbl/competitions", async (_req: Request, res: Response) => {
  try {
    const response = await vblApi.get("/Competitions");
    return res.json(response.data);
  } catch (error) {
    res.status(404).json({ error: "Failed to fetch competitions" });
  }
});

// Get matches for competition
app.get("/api/vbl/competition/:compId/matches", async (req: Request, res: Response) => {
  const { compId } = req.params;
  if (!isValidVblId(compId)) return res.status(400).json({ error: "Invalid compId" });
  try {
    const response = await vblApi.get(`/Competitions/${compId}/Matches`);
    return res.json(response.data);
  } catch (error) {
    res.status(404).json({ error: "Failed to fetch competition matches" });
  }
});

// Klaviyo — subscribe email to list
app.post("/api/klaviyo/subscribe", async (req: Request, res: Response) => {
  const { email, name, plan, sport } = req.body;
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "Invalid email" });
  }
  const klaviyoKey = process.env.KLAVIYO_API_KEY;
  if (!klaviyoKey) {
    return res.status(500).json({ error: "Klaviyo not configured" });
  }
  try {
    await axios.post(
      "https://a.klaviyo.com/api/profiles/",
      {
        data: {
          type: "profile",
          attributes: {
            email,
            first_name: name || "",
            properties: {
              plan: plan || "free",
              sport: sport || "",
            },
          },
        },
      },
      {
        headers: {
          Authorization: `Klaviyo-API-Key ${klaviyoKey}`,
          "Content-Type": "application/json",
          revision: "2024-02-15",
        },
      }
    );
    res.json({ success: true });
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 409) return res.json({ success: true }); // profile already exists
    console.error("[Klaviyo] subscribe error:", err?.response?.data || err?.message);
    res.status(500).json({ error: "Klaviyo request failed" });
  }
});

export const api = functions
  .runWith({ secrets: ["OPENAI_API_KEY", "STRIPE_SECRET_KEY", "KLAVIYO_API_KEY"] })
  .https.onRequest(app);

export const syncStripeSubscriptionToUser = functions.firestore
  .document("customers/{uid}/subscriptions/{subscriptionId}")
  .onWrite(async (_change, context) => {
    const uid = context.params.uid;
    const subscriptionsSnap = await admin.firestore()
      .collection("customers")
      .doc(uid)
      .collection("subscriptions")
      .get();

    let plan: SubscriptionPlan = "free";

    subscriptionsSnap.forEach((subscriptionDoc) => {
      const data = subscriptionDoc.data() as Record<string, unknown>;
      const status = String(data.status || "").toLowerCase();
      if (!ACTIVE_STRIPE_STATUSES.has(status)) return;
      plan = maxPlan(plan, getPlanFromSubscription(data));
    });

    const subscriptionActive = plan !== "free";
    await admin.firestore().collection("users").doc(uid).set({
      plan,
      stripeRole: plan,
      subscriptionActive,
      isSubscribed: subscriptionActive,
      updatedAt: Date.now(),
    }, { merge: true });

    console.log(`Synced Stripe subscription for ${uid}: ${plan}`);
  });

export const notifyOnScrimmageMessage = functions.firestore
  .document("scrimmages/{scrimmageId}/messages/{messageId}")
  .onCreate(async (snap, context) => {
    const message = snap.data();
    const { scrimmageId } = context.params;

    const scrimmageDoc = await admin.firestore().collection("scrimmages").doc(scrimmageId).get();
    if (!scrimmageDoc.exists) return;
    const scrimmage = scrimmageDoc.data();

    const messagesSnap = await admin.firestore()
      .collection("scrimmages").doc(scrimmageId).collection("messages")
      .get();

    const uids = new Set<string>();
    uids.add(scrimmage?.authorId);
    messagesSnap.docs.forEach(d => uids.add(d.data().authorId));
    uids.delete(message.authorId);

    if (!uids.size) return;

    const userDocs = await Promise.all(
      [...uids].filter(Boolean).map(uid => admin.firestore().collection("users").doc(uid).get())
    );

    const validTokens: string[] = userDocs
      .filter(d => d.exists && d.data()?.fcmToken && d.data()?.notificationsEnabled)
      .map(d => d.data()!.fcmToken as string);

    if (!validTokens.length) return;

    const title = `New message — ${scrimmage?.location || 'Scrimmage'}`;
    const body = `${message.authorName}: ${message.content.slice(0, 100)}`;

    const messaging = admin.messaging();
    const BATCH = 500;
    for (let i = 0; i < validTokens.length; i += BATCH) {
      const batch = validTokens.slice(i, i + BATCH);
      await messaging.sendEachForMulticast({
        tokens: batch,
        notification: { title, body },
        data: { scrimmageId, type: 'scrimmage_message' },
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default' } } },
      });
    }
  });

export const notifyTeamOnNewEvent = functions.firestore
  .document("calendarEvents/{eventId}")
  .onCreate(async (snap) => {
    const event = snap.data();
    if (!event?.teamId) return;

    const teamDoc = await admin.firestore().collection("teams").doc(event.teamId).get();
    if (!teamDoc.exists) return;
    const team = teamDoc.data();
    const memberUids: string[] = team?.memberUids || (team?.members || []).map((m: any) => m.uid);
    if (!memberUids.length) return;

    const userDocs = await Promise.all(
      memberUids.map(uid => admin.firestore().collection("users").doc(uid).get())
    );

    const validTokens: string[] = userDocs
      .filter(d => d.exists && d.data()?.fcmToken && d.data()?.notificationsEnabled)
      .map(d => d.data()!.fcmToken as string);

    if (!validTokens.length) return;

    const eventTypeLabel = event.type === 'game' ? 'Game' : event.type === 'practice' ? 'Practice' : 'Event';
    const title = `${eventTypeLabel} scheduled: ${event.title}`;
    const body = `${event.date} at ${event.time}${event.location ? ` — ${event.location}` : ''}`;

    const messaging = admin.messaging();
    const BATCH = 500;
    for (let i = 0; i < validTokens.length; i += BATCH) {
      const batch = validTokens.slice(i, i + BATCH);
      await messaging.sendEachForMulticast({
        tokens: batch,
        notification: { title, body },
        data: { teamId: event.teamId, eventId: snap.id, type: event.type || 'other' },
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default' } } },
      });
    }
  });

// Admin-only: delete any user account
export const deleteUserAccount = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be authenticated.");
  }

  const callerDoc = await admin.firestore().collection("users").doc(context.auth.uid).get();
  if (!callerDoc.exists || !callerDoc.data()?.isAdmin) {
    throw new functions.https.HttpsError("permission-denied", "Admin access required.");
  }

  const { uid } = data as { uid: string };
  if (!uid || typeof uid !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "uid is required.");
  }

  await admin.auth().deleteUser(uid);
  await admin.firestore().collection("users").doc(uid).delete();

  return { success: true };
});

// Self-service: authenticated user deletes their own account (GDPR Art. 17)
export const selfDeleteAccount = functions.https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be authenticated.");
  }

  const uid = context.auth.uid;

  // Delete user data from Firestore
  await admin.firestore().collection("users").doc(uid).delete();

  // Delete the Firebase Auth account
  await admin.auth().deleteUser(uid);

  return { success: true };
});
