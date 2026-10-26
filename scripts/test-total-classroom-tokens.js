import puppeteer from 'puppeteer-core';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP_URL = process.env.APP_URL || 'http://localhost:4173';

async function verifyTotalTokens() {
  console.log('=== Starting Total Classroom Tokens & Student Isolation Verification ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  try {
    console.log('Step 1: Logging in as faculty...');
    await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle2' });
    await page.type('#email', 'faculty@example.com');
    await page.type('#password', 'FacultyPass123!');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('button[type="submit"]'),
    ]);

    console.log('Step 2: Navigating to Quick Token page...');
    await page.goto(`${APP_URL}/quick-token`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.quick-token-container');

    // Helper to get total tokens from header card
    const getTotalTokens = async () => {
      const txt = await page.evaluate(() => {
        const el = document.querySelector('.total-tokens-value');
        return el ? el.textContent : '';
      });
      return parseInt(txt, 10);
    };

    // Helper to get token count for a given student
    const getStudentTokens = async (studentName) => {
      return page.evaluate((name) => {
        const rows = Array.from(document.querySelectorAll('.token-table-row'));
        const row = rows.find((r) => r.querySelector('.student-name-text')?.textContent.trim() === name);
        if (!row) return null;
        const totalText = row.querySelector('.token-total-text')?.textContent || '';
        const match = totalText.match(/(\d+)\s+tokens/);
        return match ? parseInt(match[1], 10) : null;
      }, studentName);
    };

    // Helper to click +1 token on a student
    const clickAddToken = async (studentName) => {
      await page.evaluate((name) => {
        const rows = Array.from(document.querySelectorAll('.token-table-row'));
        const row = rows.find((r) => r.querySelector('.student-name-text')?.textContent.trim() === name);
        if (!row) throw new Error('Student row not found: ' + name);
        const addBtn = row.querySelector('.token-action-btn');
        addBtn.click();
      }, studentName);
    };

    // Helper to click '-' token on a student
    const clickSubToken = async (studentName) => {
      await page.evaluate((name) => {
        const rows = Array.from(document.querySelectorAll('.token-table-row'));
        const row = rows.find((r) => r.querySelector('.student-name-text')?.textContent.trim() === name);
        if (!row) throw new Error('Student row not found: ' + name);
        const decBtn = row.querySelector('.ctrl-btn.dec');
        decBtn.click();
      }, studentName);
    };

    // Check initial counts
    const initialTotal = await getTotalTokens();
    const piyushInitial = await getStudentTokens('Piyush');
    const himanshiInitial = await getStudentTokens('Himanshi Gupta');
    const kashishInitial = await getStudentTokens('Kashish Kannojiya');

    console.log(`Initial Total Tokens: ${initialTotal}`);
    console.log(`Initial Piyush Tokens: ${piyushInitial}`);
    console.log(`Initial Himanshi Gupta Tokens: ${himanshiInitial}`);
    console.log(`Initial Kashish Kannojiya Tokens: ${kashishInitial}`);

    if (himanshiInitial === piyushInitial && himanshiInitial !== 0) {
      console.warn('⚠️ Warning: Himanshi had same balance as Piyush initially!');
    }

    const waitForSyncSettled = async () => {
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const cnt = await page.evaluate(async () => {
          return new Promise((resolve) => {
            const req = indexedDB.open('smarttoken_offline_v1');
            req.onsuccess = () => {
              const db = req.result;
              const tx = db.transaction('pending_queue', 'readonly');
              const store = tx.objectStore('pending_queue');
              const cntReq = store.count();
              cntReq.onsuccess = () => resolve(cntReq.result);
            };
            req.onerror = () => resolve(-1);
          });
        });
        if (cnt === 0) {
          await new Promise((r) => setTimeout(r, 200));
          return;
        }
      }
    };

    // -----------------------------------------------------------------
    // TEST 1: Click +1 on Piyush
    // -----------------------------------------------------------------
    console.log('\n--- Test 1: Click +1 on Piyush ---');
    await clickAddToken('Piyush');
    await waitForSyncSettled();

    const totalAfterPiyushAdd = await getTotalTokens();
    const piyushAfterAdd = await getStudentTokens('Piyush');
    const himanshiAfterAdd = await getStudentTokens('Himanshi Gupta');
    const kashishAfterAdd = await getStudentTokens('Kashish Kannojiya');

    console.log(`After +1 Piyush:`);
    console.log(`  Total Tokens: ${totalAfterPiyushAdd} (diff: ${totalAfterPiyushAdd - initialTotal})`);
    console.log(`  Piyush: ${piyushAfterAdd} (diff: ${piyushAfterAdd - piyushInitial})`);
    console.log(`  Himanshi Gupta: ${himanshiAfterAdd} (diff: ${himanshiAfterAdd - himanshiInitial})`);
    console.log(`  Kashish Kannojiya: ${kashishAfterAdd} (diff: ${kashishAfterAdd - kashishInitial})`);

    const totalDiff = totalAfterPiyushAdd - initialTotal;
    if (totalDiff !== 1) {
      throw new Error(`FAIL: Total Classroom Tokens changed by ${totalDiff} instead of exactly 1!`);
    }
    if (piyushAfterAdd !== piyushInitial + 1) {
      throw new Error(`FAIL: Piyush tokens did not increase by 1 (expected ${piyushInitial + 1}, got ${piyushAfterAdd})`);
    }
    if (himanshiAfterAdd !== himanshiInitial) {
      throw new Error(`FAIL: Himanshi Gupta tokens changed when Piyush was clicked!`);
    }
    if (kashishAfterAdd !== kashishInitial) {
      throw new Error(`FAIL: Kashish Kannojiya tokens changed when Piyush was clicked!`);
    }
    console.log('✅ Test 1 PASS: Clicking +1 on Piyush added EXACTLY 1 to Total Tokens, and only Piyush changed!\n');

    // -----------------------------------------------------------------
    // TEST 2: Click '-' on Piyush (correction)
    // -----------------------------------------------------------------
    console.log('--- Test 2: Click "-" on Piyush ---');
    await clickSubToken('Piyush');
    await waitForSyncSettled();

    const totalAfterSub = await getTotalTokens();
    const piyushAfterSub = await getStudentTokens('Piyush');
    console.log(`After "-" Piyush: Total Tokens = ${totalAfterSub}, Piyush Tokens = ${piyushAfterSub}`);

    if (totalAfterSub !== initialTotal) {
      throw new Error(`FAIL: Total tokens did not revert to initial (expected ${initialTotal}, got ${totalAfterSub})`);
    }
    if (piyushAfterSub !== piyushInitial) {
      throw new Error(`FAIL: Piyush tokens did not revert to initial (expected ${piyushInitial}, got ${piyushAfterSub})`);
    }
    console.log('✅ Test 2 PASS: Clicking "-" on Piyush decreased Total Tokens by EXACTLY 1.\n');

    // -----------------------------------------------------------------
    // TEST 3: Test other previously colliding students (Shaurya, Aditya Gupta, Kunal, Rhythm)
    // -----------------------------------------------------------------
    const testStudents = ['Shaurya', 'Aditya Gupta', 'Kunal', 'Rhythm'];
    for (const name of testStudents) {
      console.log(`--- Test 3: Testing +1 on ${name} ---`);
      const beforeTotal = await getTotalTokens();
      const beforeTokens = await getStudentTokens(name);

      await clickAddToken(name);
      await waitForSyncSettled();

      const afterTotal = await getTotalTokens();
      const afterTokens = await getStudentTokens(name);
      const diff = afterTotal - beforeTotal;

      console.log(`  ${name}: ${beforeTokens} -> ${afterTokens}, Total: ${beforeTotal} -> ${afterTotal} (diff: ${diff})`);

      if (diff !== 1) {
        throw new Error(`FAIL: Clicking +1 on ${name} added ${diff} to total instead of 1!`);
      }

      // Revert
      await clickSubToken(name);
      await waitForSyncSettled();
      console.log(`  Reverted ${name} cleanly.`);
    }

    console.log('\n🎉 ALL TOTAL CLASSROOM TOKEN TESTS PASSED WITH 100% ACCURACY!');
  } finally {
    await browser.close();
  }
}

verifyTotalTokens().catch((err) => {
  console.error('\n❌ VERIFICATION FAILED:', err);
  process.exit(1);
});
