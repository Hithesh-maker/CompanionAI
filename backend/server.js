import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, '../frontend');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const CRISIS_REGEX = /\b(kill myself|end my life|suicide|self[- ]harm|hurt myself|want to die)\b/i;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, originalHex] = String(stored).split(':');
  if (!salt || !originalHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  return derived.length === original.length && crypto.timingSafeEqual(derived, original);
}

export function analyzeEmotion(text) {
  const lower = text.toLowerCase();
  if (CRISIS_REGEX.test(lower)) {
    return {
      emotion: 'distressed',
      crisis: true,
      recommendation: 'Reach out to a trusted person, local emergency services, or call/text 988 (US/Canada) or your local crisis helpline immediately.',
    };
  }
  if (/\b(overwhelmed|anxious|stressed|panic|worried|nervous|exam|deadline)\b/.test(lower)) {
    return {
      emotion: 'anxious',
      crisis: false,
      recommendation: 'Try 4-4-6 breathing for two minutes and break the next task into one small 10-minute step.',
    };
  }
  if (/\b(sad|lonely|down|tired|exhausted|empty|cry|upset|unmotivated)\b/.test(lower)) {
    return {
      emotion: 'low',
      crisis: false,
      recommendation: 'Be gentle with yourself today—hydrate, step away from screens briefly, or message someone you trust.',
    };
  }
  if (/\b(angry|frustrated|annoyed|mad|irritated|stuck)\b/.test(lower)) {
    return {
      emotion: 'frustrated',
      crisis: false,
      recommendation: 'Pause before reacting, name what feels unfair or blocked, and take a short reset walk.',
    };
  }
  if (/\b(happy|good|great|proud|excited|grateful|calm|better|relieved)\b/.test(lower)) {
    return {
      emotion: 'positive',
      crisis: false,
      recommendation: 'Notice what helped create this moment so you can lean on it again later.',
    };
  }
  return {
    emotion: 'reflective',
    crisis: false,
    recommendation: 'Take your time exploring what feels most important right now.',
  };
}

function generateSupportiveReply(text, analysis, memories, privacyMode) {
  if (analysis.crisis) {
    return (
      "I'm really glad you spoke up, and I want you to be safe. I'm an AI companion and can't provide crisis or medical care, " +
      'so please reach out to someone who can be with you right now—contact local emergency services, a trusted family member/counselor, ' +
      'or call/text 988 (Suicide & Crisis Lifeline) or findahelpline.com for free, confidential support.'
    );
  }

  const memoryHint =
    !privacyMode && memories.length > 0
      ? ` I also remember you noted "${memories[0].title}" as something helpful.`
      : '';

  const templates = {
    anxious: `It sounds like a lot is weighing on you at once. When things feel overwhelming, you don't have to solve everything tonight—what is one small piece we can untangle first?${memoryHint}`,
    low: `Thank you for sharing how you're feeling. Carrying low energy or sadness can feel heavy, and it's okay to move slowly right now. Would you like to talk through what brought this on, or just take a quiet pause?${memoryHint}`,
    frustrated: `That sounds genuinely frustrating. It makes sense to feel tense when things push back against your effort. What part feels most stuck right now?${memoryHint}`,
    positive: `That's wonderful to hear—it sounds like things are moving in a steadier direction. What felt most meaningful about today?${memoryHint}`,
    reflective: `I hear you. Thank you for putting that into words—tell me a bit more about what's been on your mind lately.${memoryHint}`,
  };
  return templates[analysis.emotion] || templates.reflective;
}

export function createApp({ dbPath = path.resolve(__dirname, '../data/companion.db'), secret = process.env.COMPANION_SECRET || crypto.randomBytes(32).toString('hex') } = {}) {
  const db = createDatabase(dbPath);

  function signToken(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  function verifyToken(token) {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    try {
      const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (parsed.exp && Date.now() > parsed.exp) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function parseCookies(req) {
    const header = req.headers.cookie || '';
    const out = {};
    for (const part of header.split(';')) {
      const idx = part.indexOf('=');
      if (idx > 0) {
        out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
      }
    }
    return out;
  }

  function getAuthUser(req) {
    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const cookieToken = parseCookies(req).companion_token;
    const payload = verifyToken(bearer || cookieToken);
    if (!payload?.userId) return null;
    return db.prepare('SELECT id, name, email, theme, created_at FROM users WHERE id = ?').get(payload.userId) || null;
  }

  async function readJsonBody(req) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > 1024 * 1024) throw new Error('PAYLOAD_TOO_LARGE');
      chunks.push(chunk);
    }
    if (chunks.length === 0) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new Error('INVALID_JSON');
    }
  }

  function sendJson(res, status, data, extraHeaders = {}) {
    const body = JSON.stringify(data);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      ...extraHeaders,
    });
    res.end(body);
  }

  function serveStatic(reqPath, res) {
    let relPath = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
    relPath = decodeURIComponent(relPath);
    const resolved = path.resolve(FRONTEND_DIR, relPath);
    if (!resolved.startsWith(FRONTEND_DIR) || !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
    });
    fs.createReadStream(resolved).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = url.pathname;
    const method = req.method || 'GET';

    try {
      if (method === 'GET' && pathname === '/api/health') {
        return sendJson(res, 200, { status: 'ok', service: 'CompanionAI' });
      }

      if (method === 'POST' && pathname === '/api/auth/register') {
        const body = await readJsonBody(req);
        const name = String(body.name || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');

        if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6) {
          return sendJson(res, 400, { error: 'Valid name, email, and password (min 6 chars) are required.' });
        }
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) {
          return sendJson(res, 409, { error: 'An account with this email already exists.' });
        }
        const result = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(
          name,
          email,
          hashPassword(password),
        );
        const userId = Number(result.lastInsertRowid);
        db.prepare('INSERT INTO privacy_settings (user_id) VALUES (?)').run(userId);
        const user = db.prepare('SELECT id, name, email, theme, created_at FROM users WHERE id = ?').get(userId);
        const token = signToken({ userId, exp: Date.now() + 7 * 86400_000 });
        return sendJson(res, 201, { user, token }, {
          'Set-Cookie': `companion_token=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`,
        });
      }

      if (method === 'POST' && pathname === '/api/auth/login') {
        const body = await readJsonBody(req);
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (!row || !verifyPassword(password, row.password_hash)) {
          return sendJson(res, 401, { error: 'Invalid email or password.' });
        }
        const user = { id: row.id, name: row.name, email: row.email, theme: row.theme, created_at: row.created_at };
        const token = signToken({ userId: row.id, exp: Date.now() + 7 * 86400_000 });
        return sendJson(res, 200, { user, token }, {
          'Set-Cookie': `companion_token=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`,
        });
      }

      if (method === 'POST' && pathname === '/api/auth/logout') {
        return sendJson(res, 200, { ok: true }, {
          'Set-Cookie': 'companion_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0',
        });
      }

      if (pathname.startsWith('/api/')) {
        const user = getAuthUser(req);
        if (!user) return sendJson(res, 401, { error: 'Authentication required.' });

        if (method === 'GET' && pathname === '/api/auth/me') {
          const privacy = db.prepare('SELECT privacy_mode, sensor_enabled, external_ai_enabled FROM privacy_settings WHERE user_id = ?').get(user.id);
          return sendJson(res, 200, { user, privacy });
        }

        if (method === 'GET' && pathname === '/api/chat') {
          const messages = db.prepare('SELECT id, role, content, emotion, recommendation, created_at FROM messages WHERE user_id = ? ORDER BY id ASC').all(user.id);
          const latestAi = [...messages].reverse().find((m) => m.role === 'ai');
          return sendJson(res, 200, {
            messages,
            emotionalContext: latestAi
              ? { emotion: latestAi.emotion, recommendation: latestAi.recommendation }
              : { emotion: 'calm', recommendation: 'Share what is on your mind whenever you are ready.' },
          });
        }

        if (method === 'POST' && pathname === '/api/chat') {
          const body = await readJsonBody(req);
          const message = String(body.message || '').trim();
          if (!message || message.length > 2000) {
            return sendJson(res, 400, { error: 'Message must be 1 to 2000 characters.' });
          }
          const privacy = db.prepare('SELECT privacy_mode FROM privacy_settings WHERE user_id = ?').get(user.id);
          const memories = db.prepare('SELECT title, content, sensitive FROM memories WHERE user_id = ? AND sensitive = 0 ORDER BY id DESC LIMIT 3').all(user.id);
          const analysis = analyzeEmotion(message);
          const reply = generateSupportiveReply(message, analysis, memories, Boolean(privacy?.privacy_mode));

          db.prepare('INSERT INTO messages (user_id, role, content, emotion, recommendation) VALUES (?, ?, ?, ?, ?)').run(
            user.id, 'user', message, analysis.emotion, '',
          );
          const aiRes = db.prepare('INSERT INTO messages (user_id, role, content, emotion, recommendation) VALUES (?, ?, ?, ?, ?)').run(
            user.id, 'ai', reply, analysis.emotion, analysis.recommendation,
          );

          return sendJson(res, 201, {
            reply: {
              id: Number(aiRes.lastInsertRowid),
              role: 'ai',
              content: reply,
              emotion: analysis.emotion,
              recommendation: analysis.recommendation,
              crisis: analysis.crisis,
            },
            emotionalContext: {
              emotion: analysis.emotion,
              recommendation: analysis.recommendation,
              crisis: analysis.crisis,
            },
          });
        }

        if (method === 'GET' && pathname === '/api/memories') {
          const memories = db.prepare('SELECT id, title, content, sensitive, created_at FROM memories WHERE user_id = ? ORDER BY id DESC').all(user.id);
          return sendJson(res, 200, { memories });
        }

        if (method === 'POST' && pathname === '/api/memories') {
          const body = await readJsonBody(req);
          const title = String(body.title || '').trim();
          const content = String(body.content || '').trim();
          const sensitive = body.sensitive ? 1 : 0;
          if (!title || title.length > 100 || !content || content.length > 1000) {
            return sendJson(res, 400, { error: 'Valid title (<=100) and content (<=1000) are required.' });
          }
          const resIns = db.prepare('INSERT INTO memories (user_id, title, content, sensitive) VALUES (?, ?, ?, ?)').run(
            user.id, title, content, sensitive,
          );
          const memory = db.prepare('SELECT id, title, content, sensitive, created_at FROM memories WHERE id = ?').get(Number(resIns.lastInsertRowid));
          return sendJson(res, 201, { memory });
        }

        const memDeleteMatch = pathname.match(/^\/api\/memories\/(\d+)$/);
        if (method === 'DELETE' && memDeleteMatch) {
          const id = Number(memDeleteMatch[1]);
          const del = db.prepare('DELETE FROM memories WHERE id = ? AND user_id = ?').run(id, user.id);
          if (del.changes === 0) return sendJson(res, 404, { error: 'Memory not found.' });
          return sendJson(res, 200, { deleted: true });
        }

        if (method === 'GET' && pathname === '/api/privacy') {
          const privacy = db.prepare('SELECT privacy_mode, sensor_enabled, external_ai_enabled, updated_at FROM privacy_settings WHERE user_id = ?').get(user.id);
          return sendJson(res, 200, { privacy });
        }

        if (method === 'PUT' && pathname === '/api/privacy') {
          const body = await readJsonBody(req);
          const privacyMode = body.privacy_mode ? 1 : 0;
          const sensorEnabled = body.sensor_enabled ? 1 : 0;
          const externalAiEnabled = body.external_ai_enabled ? 1 : 0;
          db.prepare(
            "UPDATE privacy_settings SET privacy_mode = ?, sensor_enabled = ?, external_ai_enabled = ?, updated_at = datetime('now') WHERE user_id = ?",
          ).run(privacyMode, sensorEnabled, externalAiEnabled, user.id);
          const privacy = db.prepare('SELECT privacy_mode, sensor_enabled, external_ai_enabled, updated_at FROM privacy_settings WHERE user_id = ?').get(user.id);
          return sendJson(res, 200, { privacy });
        }

        if (method === 'POST' && pathname === '/api/safety/checkin') {
          const body = await readJsonBody(req);
          const kind = String(body.kind || 'grounding').trim();
          const note = String(body.note || 'Completed self-check-in').trim();
          db.prepare('INSERT INTO safety_checkins (user_id, kind, note) VALUES (?, ?, ?)').run(user.id, kind, note);
          return sendJson(res, 201, {
            ok: true,
            guidance: kind === 'safety'
              ? 'If you are in danger, contact local emergency services or call/text 988.'
              : 'Take 3 slow breaths: name 5 things you see, 4 you feel, and 3 you hear.',
          });
        }

        if (method === 'PUT' && pathname === '/api/settings') {
          const body = await readJsonBody(req);
          const theme = body.theme === 'dark' ? 'dark' : 'light';
          db.prepare('UPDATE users SET theme = ? WHERE id = ?').run(theme, user.id);
          const updated = db.prepare('SELECT id, name, email, theme, created_at FROM users WHERE id = ?').get(user.id);
          return sendJson(res, 200, { user: updated });
        }

        return sendJson(res, 404, { error: 'API route not found.' });
      }

      return serveStatic(pathname, res);
    } catch (err) {
      if (err.message === 'INVALID_JSON') return sendJson(res, 400, { error: 'Invalid JSON body.' });
      if (err.message === 'PAYLOAD_TOO_LARGE') return sendJson(res, 413, { error: 'Payload too large.' });
      return sendJson(res, 500, { error: 'Internal server error.' });
    }
  });

  return { server, db };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const port = Number(process.env.PORT || 4100);
  const { server } = createApp();
  server.listen(port, () => {
    console.log(`CompanionAI running at http://localhost:${port}`);
  });
}
