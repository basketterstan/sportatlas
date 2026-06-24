/**
 * Coach Marcus — HoopsAtlas AI community coach
 * Posts 2-3 times/day across channels and replies to recent posts.
 *
 * Requires Node 18+ (built-in fetch).
 * Reads from .env in the parent directory (or from environment variables).
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Load parent project .env
config({ path: resolve(__dirname, '../.env') });

const FIREBASE_API_KEY  = process.env.VITE_FIREBASE_API_KEY;
const FIREBASE_PROJECT  = process.env.VITE_FIREBASE_PROJECT_ID;
const OPENAI_API_KEY    = process.env.OPENAI_API_KEY;
const COACH_EMAIL       = process.env.COACH_EMAIL;
const COACH_PASSWORD    = process.env.COACH_PASSWORD;

if (!FIREBASE_API_KEY || !FIREBASE_PROJECT || !OPENAI_API_KEY || !COACH_EMAIL || !COACH_PASSWORD) {
  console.error('❌  Missing env vars. Required: VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID, OPENAI_API_KEY, COACH_EMAIL, COACH_PASSWORD');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const COACH_NAME  = 'Coach Marcus';
const FIRESTORE   = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents`;
const AUTH_URL    = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;

// ── Coach persona ─────────────────────────────────────────────────────────────
const PERSONA = `You are Coach Marcus, a basketball coach with 15+ years of experience coaching youth and high school teams.
You're knowledgeable, practical, and love sharing insights with fellow coaches.
Write like you're talking to a colleague in the gym — direct, clear, no fluff.
Keep it short: 3-5 sentences max. No emojis. No hashtags.`;

// ── Channels ──────────────────────────────────────────────────────────────────
const CHANNELS = [
  {
    id: 'general',
    label: 'General Chat',
    topics: [
      'pre-season preparation and goal setting',
      'handling player conflicts within a team',
      'building trust with parents on game day',
      'motivating players after a bad loss',
      'balancing development and winning',
      'keeping energy high in long practice weeks',
      'reading your team\'s body language before a game',
    ],
  },
  {
    id: 'drills',
    label: 'Drills & Practice Ideas',
    topics: [
      'ball-handling under defensive pressure',
      'correcting shooting form in young players',
      'competitive rebounding box-out drills',
      'defensive slide and closeout footwork',
      'transition drill to sharpen fast break reads',
      'full-court passing chains for point guards',
      'conditioning drills that also build decision-making',
    ],
  },
  {
    id: 'offense',
    label: 'Offense & Plays',
    topics: [
      'motion offense principles for youth teams',
      'pick-and-roll execution and reads',
      'quick-hitter plays out of a timeout',
      'half-court sets to attack a 2-3 zone',
      'transition offense structure and spacing',
      'drive-and-kick spacing principles',
      'BLOB plays that actually work under pressure',
    ],
  },
  {
    id: 'defense',
    label: 'Defense',
    topics: [
      'switching vs. hedging in pick-and-roll coverage',
      'teaching help-side rotations to beginners',
      'when to press and when to back off',
      'defending the high pick-and-roll at youth level',
      'zone adjustments after halftime',
      'transition defense sprint assignments',
      'taking away the corner three late in games',
    ],
  },
  {
    id: 'situations',
    label: 'Game Situations',
    topics: [
      'inbound plays when down by two with 10 seconds left',
      'managing a close lead in the final 90 seconds',
      'last-possession play design from a timeout',
      'intentional foul strategy when up three',
      'beating a full-court press with your offense',
      'halftime speech when you\'re down 12 at the break',
      'deciding when to call a timeout to kill momentum',
    ],
  },
];

// ── Firestore helpers ─────────────────────────────────────────────────────────

function toFirestoreValue(val) {
  if (typeof val === 'string')  return { stringValue: val };
  if (typeof val === 'number')  return { integerValue: String(val) };
  if (typeof val === 'boolean') return { booleanValue: val };
  throw new Error(`Unsupported type: ${typeof val}`);
}

function buildFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = toFirestoreValue(v);
  }
  return fields;
}

async function firestoreWrite(collection, data, idToken) {
  const res = await fetch(`${FIRESTORE}/${collection}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ fields: buildFields(data) }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firestore write failed (${res.status}): ${err}`);
  }
  const json = await res.json();
  // name is like "projects/.../documents/collection/docId"
  return json.name.split('/').pop();
}

async function firestoreUpdate(collection, docId, fields, idToken) {
  const updateMask = Object.keys(fields).map(f => `updateMask.fieldPaths=${f}`).join('&');
  const res = await fetch(`${FIRESTORE}/${collection}/${docId}?${updateMask}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ fields: buildFields(fields) }),
  });
  if (!res.ok) throw new Error(`Firestore update failed (${res.status}): ${await res.text()}`);
}

async function firestoreQuery(collection, filters, idToken, limit = 30) {
  const structuredQuery = {
    from: [{ collectionId: collection }],
    where: {
      compositeFilter: {
        op: 'AND',
        filters: filters.map(([field, op, value]) => ({
          fieldFilter: {
            field: { fieldPath: field },
            op,
            value: toFirestoreValue(value),
          },
        })),
      },
    },
    orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
    limit,
  };

  const res = await fetch(`${FIRESTORE}:runQuery`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) throw new Error(`Firestore query failed (${res.status}): ${await res.text()}`);
  const rows = await res.json();
  return rows
    .filter(r => r.document)
    .map(r => {
      const id = r.document.name.split('/').pop();
      const raw = r.document.fields;
      const obj = { id };
      for (const [k, v] of Object.entries(raw)) {
        obj[k] = v.stringValue ?? v.integerValue ?? v.booleanValue ?? null;
      }
      return obj;
    });
}

// ── Firebase Auth ─────────────────────────────────────────────────────────────
async function signIn() {
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: COACH_EMAIL, password: COACH_PASSWORD, returnSecureToken: true }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Firebase sign-in failed: ${err.error?.message}`);
  }
  const data = await res.json();
  return { idToken: data.idToken, uid: data.localId };
}

// ── OpenAI helpers ────────────────────────────────────────────────────────────
async function generatePost(channel) {
  const topics = channel.topics;
  const topic = topics[Math.floor(Math.random() * topics.length)];

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: PERSONA },
      {
        role: 'user',
        content: `Write a post for the "${channel.label}" community channel about: ${topic}.
Return JSON only — no markdown — with this shape:
{"title": "...", "content": "..."}
Title: max 10 words, punchy, no question marks in the title.
Content: 3-5 sentences, practical and direct.`,
      },
    ],
    temperature: 0.85,
    max_tokens: 300,
  });

  return JSON.parse(res.choices[0].message.content.trim());
}

async function generateReply(post) {
  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: PERSONA },
      {
        role: 'user',
        content: `Another coach posted this in our basketball community:

Title: "${post.title}"
Post: "${post.content}"

Write a short reply (2-4 sentences). Add something concrete — a follow-up tip, a different angle, or a question back to the group.
Return only the reply text, no quotes, no extra formatting.`,
      },
    ],
    temperature: 0.8,
    max_tokens: 180,
  });

  return res.choices[0].message.content.trim();
}

// ── Misc ──────────────────────────────────────────────────────────────────────
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function todayKey() { return new Date().toISOString().slice(0, 10); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`🏀  Coach Marcus AI — ${todayKey()}`);

  const { idToken, uid } = await signIn();
  console.log(`🔑  Signed in as ${COACH_EMAIL} (uid: ${uid})`);

  // ── 1. New posts ─────────────────────────────────────────────────────────
  const postCount = 2 + Math.floor(Math.random() * 2); // 2 or 3
  const shuffled  = [...CHANNELS].sort(() => Math.random() - 0.5);

  for (const channel of shuffled.slice(0, postCount)) {
    try {
      const { title, content } = await generatePost(channel);
      const docId = await firestoreWrite('communityPosts', {
        channelId:    channel.id,
        authorId:     uid,
        authorName:   COACH_NAME,
        authorIsPro:  true,
        title,
        content,
        createdAt:    Date.now(),
        updatedAt:    Date.now(),
        likesCount:   0,
        repliesCount: 0,
        isPinned:     false,
        isFeatured:   false,
        status:       'active',
      }, idToken);
      console.log(`✅  Posted [${channel.id}] "${title}" → ${docId}`);
      await sleep(1500);
    } catch (err) {
      console.error(`❌  Post failed [${channel.id}]: ${err.message}`);
    }
  }

  // ── 2. Replies ────────────────────────────────────────────────────────────
  const replyTarget = 1 + Math.floor(Math.random() * 2); // 1 or 2
  let replied = 0;

  // Fetch recent posts not by Marcus
  const recentPosts = await firestoreQuery(
    'communityPosts',
    [['status', 'EQUAL', 'active']],
    idToken,
    40,
  );

  const candidates = recentPosts
    .filter(p => p.authorId !== uid)
    .sort(() => Math.random() - 0.5);

  for (const post of candidates) {
    if (replied >= replyTarget) break;

    // Check if already replied to this post
    const existing = await firestoreQuery(
      'communityReplies',
      [['postId', 'EQUAL', post.id], ['authorId', 'EQUAL', uid]],
      idToken,
      1,
    );
    if (existing.length > 0) continue;

    try {
      const content = await generateReply(post);

      // Write reply
      await firestoreWrite('communityReplies', {
        postId:      post.id,
        authorId:    uid,
        authorName:  COACH_NAME,
        authorIsPro: true,
        content,
        createdAt:   Date.now(),
        likesCount:  0,
        status:      'active',
      }, idToken);

      // Increment repliesCount on the post
      const current = parseInt(post.repliesCount ?? '0', 10);
      await firestoreUpdate('communityPosts', post.id, { repliesCount: current + 1 }, idToken);

      console.log(`💬  Replied to "${post.title}" (${post.id})`);
      replied++;
      await sleep(1500);
    } catch (err) {
      console.error(`❌  Reply failed: ${err.message}`);
    }
  }

  if (replied === 0) console.log('ℹ️   No new posts to reply to today.');
  console.log('✔   Done.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
