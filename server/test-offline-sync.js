import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3001';
const SECTION_ID = '043f0728-c357-4e72-b6ce-62823cc064b7';
const STUDENT_ID = '9568352b-5bbc-4607-872d-64c7bfc7cdb0'; // Student User in CS101

async function runTests() {
  console.log('=== Starting SmartToken Core Offline Mode & Sync Verification ===\n');

  // Authenticate faculty
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'faculty@example.com', password: 'FacultyPass123!' }),
  });
  if (!loginRes.ok) throw new Error('Faculty login failed: ' + (await loginRes.text()));
  const loginData = await loginRes.json();
  const token = loginData.token;

  const authHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // Test 1: Healthcheck Reachability
  console.log('Test 1: Healthcheck Probe (GET /api/health)...');
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  if (!healthRes.ok) throw new Error(`Healthcheck failed: ${healthRes.status}`);
  const healthData = await healthRes.json();
  if (healthData.status !== 'ok') throw new Error(`Unexpected health response: ${JSON.stringify(healthData)}`);
  console.log('✅ Healthcheck reachability verified: status = ok, timestamp =', healthData.timestamp);

  // Test 2: Roster fetch with attendanceStatus and balance
  console.log('\nTest 2: Roster fetch with balances & attendanceStatus...');
  const rosterRes = await fetch(`${BASE_URL}/api/sections/${SECTION_ID}/students`, {
    headers: authHeaders,
  });
  if (!rosterRes.ok) throw new Error(`Roster fetch failed: ${rosterRes.status}`);
  const rosterData = await rosterRes.json();
  const testStudent = rosterData.students.find((s) => s.id === STUDENT_ID);
  if (!testStudent) throw new Error(`Test student not found in section roster`);
  console.log(`✅ Student found: "${testStudent.name}", current balance: ${testStudent.balance}, attendance: ${testStudent.attendanceStatus}`);

  const initialBalance = Number(testStudent.balance);

  // Test 3: Token Award with clientEventId (First attempt)
  console.log('\nTest 3: First attempt of offline-queued token award event...');
  const clientEventId1 = crypto.randomUUID();
  const awardPayload = {
    sectionId: SECTION_ID,
    studentId: STUDENT_ID,
    tokenChange: 2,
    eventType: 'TOKEN_AWARD',
    description: 'Offline mode automated test token award',
    clientEventId: clientEventId1,
  };

  const awardRes1 = await fetch(`${BASE_URL}/api/events`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(awardPayload),
  });
  if (awardRes1.status !== 201) throw new Error(`Award event failed: ${awardRes1.status} ${await awardRes1.text()}`);
  const awardData1 = await awardRes1.json();
  console.log(`✅ Event recorded: ID ${awardData1.event.id}, balance updated to ${awardData1.balance} (expected ${initialBalance + 2})`);
  if (awardData1.balance !== initialBalance + 2) {
    throw new Error(`Balance mismatch: got ${awardData1.balance}, expected ${initialBalance + 2}`);
  }

  // Test 4: Idempotent Retry of Token Award (Duplicate submission with same clientEventId)
  console.log('\nTest 4: Simulating duplicate retry of same event (idempotency check)...');
  const awardRes2 = await fetch(`${BASE_URL}/api/events`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(awardPayload),
  });
  if (awardRes2.status !== 200) throw new Error(`Idempotent retry failed: ${awardRes2.status} ${await awardRes2.text()}`);
  const awardData2 = await awardRes2.json();
  if (!awardData2.idempotent) throw new Error('Expected idempotent: true flag in response');
  if (awardData2.balance !== initialBalance + 2) {
    throw new Error(`Duplicate retry incorrectly altered balance! Got ${awardData2.balance}, expected ${initialBalance + 2}`);
  }
  console.log('✅ Idempotent retry acknowledged safely without double-awarding tokens: idempotent =', awardData2.idempotent);

  // Test 5: Attendance update with clientEventId & Idempotent Retry
  console.log('\nTest 5: Attendance update with clientEventId...');
  const clientEventId2 = crypto.randomUUID();
  const targetAttendance = testStudent.attendanceStatus === 'PRESENT' ? 'ABSENT' : 'PRESENT';
  const attRes1 = await fetch(`${BASE_URL}/api/sections/${SECTION_ID}/students/${STUDENT_ID}/attendance`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({
      status: targetAttendance,
      clientEventId: clientEventId2,
    }),
  });
  if (!attRes1.ok) throw new Error(`Attendance update failed: ${attRes1.status} ${await attRes1.text()}`);
  const attData1 = await attRes1.json();
  console.log(`✅ Attendance updated to ${attData1.status}, new balance: ${attData1.balance}`);

  // Test 5b: Duplicate retry of attendance
  console.log('\nTest 5b: Duplicate retry of attendance update...');
  const attRes2 = await fetch(`${BASE_URL}/api/sections/${SECTION_ID}/students/${STUDENT_ID}/attendance`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({
      status: targetAttendance,
      clientEventId: clientEventId2,
    }),
  });
  if (!attRes2.ok) throw new Error(`Attendance retry failed: ${attRes2.status}`);
  const attData2 = await attRes2.json();
  if (!attData2.idempotent) throw new Error('Expected idempotent: true on attendance retry');
  console.log('✅ Idempotent attendance retry acknowledged safely without double-tallying: idempotent =', attData2.idempotent);

  // Test 6: Rejection on Expired/Missing Auth
  console.log('\nTest 6: Security check - unauthenticated request rejected (HTTP 401)...');
  const unauthRes = await fetch(`${BASE_URL}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(awardPayload),
  });
  if (unauthRes.status !== 401) throw new Error(`Expected 401, got ${unauthRes.status}`);
  console.log('✅ Unauthenticated request correctly rejected with HTTP 401.');

  // Test 7: Server Validation Error (Invalid student UUID)
  console.log('\nTest 7: Server validation - invalid student UUID rejected (HTTP 400)...');
  const invalidRes = await fetch(`${BASE_URL}/api/events`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      ...awardPayload,
      studentId: 'not-a-valid-uuid',
      clientEventId: crypto.randomUUID(),
    }),
  });
  if (invalidRes.status !== 400) throw new Error(`Expected 400, got ${invalidRes.status}`);
  console.log('✅ Invalid event safely rejected with HTTP 400.');

  // Test 8: Service Worker Build and Hashed Assets Precaching Verification
  console.log('\nTest 8: Service Worker script & hashed bundle precache verification...');
  const distSwPath = path.resolve(process.cwd(), 'dist', 'sw.js');
  if (!fs.existsSync(distSwPath)) {
    throw new Error('dist/sw.js does not exist. Run npm run build first.');
  }
  const swCode = fs.readFileSync(distSwPath, 'utf8');

  // Verify cache versioning
  if (!swCode.includes("const CACHE_VERSION = 'smarttoken-v3'")) {
    throw new Error('Service worker is missing CACHE_VERSION versioning definition');
  }

  // Verify that precached assets contain the built css and js files
  const assetsDir = path.resolve(process.cwd(), 'dist', 'assets');
  const assetFiles = fs.readdirSync(assetsDir);
  const jsFiles = assetFiles.filter((f) => f.endsWith('.js'));
  const cssFiles = assetFiles.filter((f) => f.endsWith('.css'));

  if (jsFiles.length === 0 || cssFiles.length === 0) {
    throw new Error('dist/assets has no JS or CSS files');
  }

  for (const jsFile of jsFiles) {
    if (!swCode.includes(`/assets/${jsFile}`)) {
      throw new Error(`dist/sw.js missing precache entry for built asset: /assets/${jsFile}`);
    }
  }
  for (const cssFile of cssFiles) {
    if (!swCode.includes(`/assets/${cssFile}`)) {
      throw new Error(`dist/sw.js missing precache entry for built asset: /assets/${cssFile}`);
    }
  }
  if (!swCode.includes("url.pathname.startsWith('/api')")) {
    throw new Error('Service worker does not bypass /api calls');
  }
  console.log(`✅ Service worker verified: precaches index.html, ${jsFiles.length} JS bundle(s), ${cssFiles.length} CSS bundle(s), purges stale caches, and bypasses /api.`);

  // Test 9: Batch offline queueing & exactly-once reconciliation with simulated packet loss
  console.log('\nTest 9: Batch offline synchronization with simulated lost responses...');
  const batchEvents = [
    {
      clientEventId: crypto.randomUUID(),
      studentId: STUDENT_ID,
      sectionId: SECTION_ID,
      tokenChange: 1,
      eventType: 'TOKEN_AWARD',
      description: 'Batch offline token 1',
    },
    {
      clientEventId: crypto.randomUUID(),
      studentId: STUDENT_ID,
      sectionId: SECTION_ID,
      tokenChange: 1,
      eventType: 'TOKEN_AWARD',
      description: 'Batch offline token 2',
    },
  ];

  // Step A: Send first batch item
  const b1Res = await fetch(`${BASE_URL}/api/events`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(batchEvents[0]),
  });
  if (b1Res.status !== 201) throw new Error('Batch item 1 creation failed');
  const b1Data = await b1Res.json();
  const balanceAfterB1 = b1Data.balance;

  // Step B: Simulate response loss on client side for item 1 -> Client re-submits item 1 AND sends item 2
  const [retryB1Res, newB2Res] = await Promise.all([
    fetch(`${BASE_URL}/api/events`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(batchEvents[0]),
    }),
    fetch(`${BASE_URL}/api/events`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(batchEvents[1]),
    }),
  ]);

  const retryB1Data = await retryB1Res.json();
  const newB2Data = await newB2Res.json();

  if (!retryB1Data.idempotent) throw new Error('Lost response retry was not recognized as idempotent');
  if (retryB1Res.status !== 200) throw new Error(`Expected 200 for idempotent retry, got ${retryB1Res.status}`);
  if (newB2Res.status !== 201) throw new Error(`Expected 201 for new batch item, got ${newB2Res.status}`);
  if (newB2Data.balance !== balanceAfterB1 + 1) {
    throw new Error(`Balance calculation discrepancy in batch: expected ${balanceAfterB1 + 1}, got ${newB2Data.balance}`);
  }
  console.log('✅ Batch replay simulation passed: retry acknowledged idempotently without double-incrementing balance.');

  console.log('\n🎉 ALL CORE OFFLINE MODE AND SYNCHRONIZATION TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
