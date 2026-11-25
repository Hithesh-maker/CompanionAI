import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeEmotion, createApp } from '../backend/server.js';

async function startTestServer() {
  const { server, db } = createApp({ dbPath: ':memory:', secret: 'test-secret-key' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => { db.close(); resolve(); })),
  };
}

test('analyzeEmotion detects anxiety, positive tone, and crisis keywords', () => {
  assert.equal(analyzeEmotion('I feel very overwhelmed before my exam').emotion, 'anxious');
  assert.equal(analyzeEmotion('Today was great and I feel calm').emotion, 'positive');
  const crisis = analyzeEmotion('I want to kill myself');
  assert.equal(crisis.crisis, true);
  assert.match(crisis.recommendation, /988/);
});

test('CompanionAI full-stack auth, chat, memory, privacy, and safety workflow', async () => {
  const srv = await startTestServer();
  try {
    // 1. Health check & static page
    const health = await fetch(`${srv.baseUrl}/api/health`).then((r) => r.json());
    assert.equal(health.status, 'ok');
    const htmlRes = await fetch(`${srv.baseUrl}/pages/safety.html`);
    assert.equal(htmlRes.status, 200);
    const htmlText = await htmlRes.text();
    assert.equal(htmlText.includes('```'), false);

    // 2. Unauthenticated access rejected
    const unauth = await fetch(`${srv.baseUrl}/api/memories`);
    assert.equal(unauth.status, 401);

    // 3. Register + Login
    const reg = await fetch(`${srv.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Hithesh', email: 'hithesh@example.com', password: 'password123' }),
    });
    assert.equal(reg.status, 201);
    const regData = await reg.json();
    assert.ok(regData.token);

    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${regData.token}`,
    };

    // 4. Privacy toggle (disable privacy mode so non-sensitive memory context works)
    const privPut = await fetch(`${srv.baseUrl}/api/privacy`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ privacy_mode: false, sensor_enabled: false, external_ai_enabled: false }),
    });
    assert.equal(privPut.status, 200);
    const privJson = await privPut.json();
    assert.equal(privJson.privacy.privacy_mode, 0);

    // 5. Create + list + delete memory
    const memPost = await fetch(`${srv.baseUrl}/api/memories`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ title: 'Evening walk', content: 'Walking helps me unwind.', sensitive: false }),
    });
    assert.equal(memPost.status, 201);
    const memJson = await memPost.json();
    assert.equal(memJson.memory.title, 'Evening walk');

    // 6. Chat uses emotion detection & memory hint
    const chatPost = await fetch(`${srv.baseUrl}/api/chat`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ message: 'I am feeling overwhelmed with deadlines.' }),
    });
    assert.equal(chatPost.status, 201);
    const chatJson = await chatPost.json();
    assert.equal(chatJson.reply.emotion, 'anxious');
    assert.match(chatJson.reply.content, /Evening walk/);

    // 7. Safety check-in & settings theme persistence
    const safetyPost = await fetch(`${srv.baseUrl}/api/safety/checkin`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ kind: 'grounding' }),
    });
    assert.equal(safetyPost.status, 201);

    const settingsPut = await fetch(`${srv.baseUrl}/api/settings`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ theme: 'dark' }),
    });
    assert.equal(settingsPut.status, 200);
    assert.equal((await settingsPut.json()).user.theme, 'dark');

    // 8. Delete memory
    const memDel = await fetch(`${srv.baseUrl}/api/memories/${memJson.memory.id}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    assert.equal(memDel.status, 200);
  } finally {
    await srv.close();
  }
});
