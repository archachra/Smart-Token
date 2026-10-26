import puppeteer from 'puppeteer-core';
import pool from '../server/db.js';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP_URL = process.env.APP_URL || 'http://localhost:4173';
const SECTION_ID = '043f0728-c357-4e72-b6ce-62823cc064b7';

async function runUXVerification() {
  console.log('=== Starting SmartToken Online/Offline UX Verification ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const consoleWarnings = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'warning' || text.toLowerCase().includes('duplicate key')) {
      consoleWarnings.push(`[${msg.type()}] ${text}`);
    }
  });

  try {
    // -----------------------------------------------------------------
    // Setup: Login as Faculty
    // -----------------------------------------------------------------
    console.log('Setup: Logging in as faculty...');
    await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle2' });
    await page.type('#email', 'faculty@example.com');
    await page.type('#password', 'FacultyPass123!');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('button[type="submit"]'),
    ]);
    console.log('✅ Logged in successfully.\n');

    // =================================================================
    // Scenario 1: Online Mode (No Flicker for Prompt Actions)
    // =================================================================
    console.log('--- Scenario 1: Online Mode Prompt Sync (Zero Flicker) ---');
    await page.goto(`${APP_URL}/quick-token`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.quick-token-container');

    // Query DB balance of Student User before action
    const dbResBefore = await pool.query(
      `SELECT sb.balance FROM students s 
       LEFT JOIN student_balances sb ON (sb.student_id = s.id AND sb.section_id = $1)
       WHERE s.name = 'Student User'`,
      [SECTION_ID]
    );
    const balBefore = Number(dbResBefore.rows[0]?.balance) || 0;
    console.log(`Initial Student User balance: ${balBefore}`);

    // Track any transient appearance of "pending" badge or header flicker
    let sawPendingBadgeOnline = false;
    let sawHeaderFlickerOnline = false;

    // Observe DOM mutations on Quick Token container and header for 800ms
    await page.evaluate(() => {
      window.__flickerTest = { sawPending: false, sawHeaderFlicker: false };

      const observer = new MutationObserver(() => {
        // Check for pending badge in rows
        const pendingBadge = document.querySelector('.pending-token-tag');
        if (pendingBadge && pendingBadge.textContent.includes('pending')) {
          window.__flickerTest.sawPending = true;
        }

        // Check header text
        const headerIndicator = document.querySelector('.status-indicator');
        if (headerIndicator) {
          const txt = headerIndicator.textContent;
          if (txt.includes('Syncing') || txt.includes('queued locally')) {
            window.__flickerTest.sawHeaderFlicker = true;
          }
        }
      });

      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    });

    // Click +1 Token for Student User while online
    console.log('Awarding +1 token while online...');
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.token-table-row'));
      const target = rows.find((r) => r.textContent.includes('Student User'));
      const addBtn = target.querySelector('.token-action-btn');
      addBtn.click();
    });

    // Give prompt sync time to complete
    await new Promise((r) => setTimeout(r, 600));

    const flickerResults = await page.evaluate(() => window.__flickerTest);
    console.log(`Online flicker test observation: sawPendingBadge = ${flickerResults.sawPending}, sawHeaderFlicker = ${flickerResults.sawHeaderFlicker}`);

    if (flickerResults.sawPending) {
      throw new Error('FAIL: "pending" badge flickered during online prompt sync!');
    }
    if (flickerResults.sawHeaderFlicker) {
      throw new Error('FAIL: Header flickered to Syncing/Queued during online prompt sync!');
    }

    // Verify DB updated
    const dbResAfterOnline = await pool.query(
      `SELECT sb.balance FROM students s 
       LEFT JOIN student_balances sb ON (sb.student_id = s.id AND sb.section_id = $1)
       WHERE s.name = 'Student User'`,
      [SECTION_ID]
    );
    const balAfterOnline = Number(dbResAfterOnline.rows[0]?.balance) || 0;
    if (balAfterOnline !== balBefore + 1) {
      throw new Error(`Expected balance ${balBefore + 1}, got ${balAfterOnline}`);
    }
    console.log(`✅ Scenario 1 PASS: Online token action synced seamlessly with 0 badge/header flicker. Balance: ${balAfterOnline}\n`);

    // =================================================================
    // Scenario 2: Attendance Online Mode Prompt Sync (Zero Flicker)
    // =================================================================
    console.log('--- Scenario 2: Attendance Online Mode (Zero Flicker) ---');
    await page.goto(`${APP_URL}/attendance`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.attendance-container');

    await page.evaluate(() => {
      window.__attendanceFlicker = { sawPending: false, sawHeaderFlicker: false };

      const observer = new MutationObserver(() => {
        const pendingBadge = document.querySelector('.pending-token-tag');
        if (pendingBadge && pendingBadge.textContent.includes('pending')) {
          window.__attendanceFlicker.sawPending = true;
        }

        const headerIndicator = document.querySelector('.status-indicator');
        if (headerIndicator) {
          const txt = headerIndicator.textContent;
          if (txt.includes('Syncing') || txt.includes('queued locally')) {
            window.__attendanceFlicker.sawHeaderFlicker = true;
          }
        }
      });

      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    });

    // Toggle attendance for Student User
    console.log('Toggling attendance for Student User while online...');
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.roster-row'));
      const target = rows.find((r) => r.textContent.includes('Student User'));
      const btn = target.querySelector('.attendance-toggle-btn');
      btn.click();
    });

    await new Promise((r) => setTimeout(r, 600));

    const attFlicker = await page.evaluate(() => window.__attendanceFlicker);
    console.log(`Attendance flicker observation: sawPendingBadge = ${attFlicker.sawPending}, sawHeaderFlicker = ${attFlicker.sawHeaderFlicker}`);

    if (attFlicker.sawPending) {
      throw new Error('FAIL: "pending sync" badge flickered during online prompt attendance toggle!');
    }
    if (attFlicker.sawHeaderFlicker) {
      throw new Error('FAIL: Header flickered during online prompt attendance toggle!');
    }
    console.log('✅ Scenario 2 PASS: Online attendance toggle synced seamlessly with 0 flicker.\n');

    // =================================================================
    // Scenario 3: Offline Queuing & Persistence
    // =================================================================
    console.log('--- Scenario 3: Offline Queuing & Persistence ---');
    await page.goto(`${APP_URL}/quick-token`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.quick-token-container');

    // Disconnect network
    console.log('Emulating offline mode...');
    await page.setOfflineMode(true);

    const offlineHeader = await page.evaluate(() => {
      const el = document.querySelector('.status-indicator');
      return el ? el.textContent : '';
    });
    console.log(`Header status after going offline: "${offlineHeader.trim()}"`);

    // Award +1 token while offline
    console.log('Awarding +1 token to Student User while offline...');
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.token-table-row'));
      const target = rows.find((r) => r.textContent.includes('Student User'));
      const addBtn = target.querySelector('.token-action-btn');
      addBtn.click();
    });

    await new Promise((r) => setTimeout(r, 300));

    // Verify UI immediately shows pending badge and row highlight
    const offlineRowInfo = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.token-table-row'));
      const target = rows.find((r) => r.textContent.includes('Student User'));
      return {
        text: target ? target.textContent : '',
        hasHighlight: target ? target.classList.contains('pending-row-highlight') : false,
      };
    });

    if (!offlineRowInfo.text.includes('pending')) {
      throw new Error(`FAIL: Expected pending badge in offline row, got: "${offlineRowInfo.text}"`);
    }
    if (!offlineRowInfo.hasHighlight) {
      throw new Error('FAIL: Expected pending-row-highlight class on offline row');
    }
    console.log(`UI row display while offline: "${offlineRowInfo.text.replace(/\s+/g, ' ').trim()}"`);
    console.log('✅ Scenario 3 PASS: Offline action immediately showed pending badge and highlight.\n');

    // =================================================================
    // Scenario 4: Offline Reload Persistence
    // =================================================================
    console.log('--- Scenario 4: Offline Page Reload ---');
    console.log('Reloading page while still offline...');
    await page.reload({ waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 1000));
    await page.waitForSelector('.quick-token-container', { timeout: 10000 });
    await page.waitForSelector('.token-table-row');

    const reloadedRowText = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.token-table-row'));
      const target = rows.find((r) => r.textContent.includes('Student User'));
      return target ? target.textContent : '';
    });

    if (!reloadedRowText.includes('pending')) {
      throw new Error(`FAIL: Pending badge lost after offline reload! Row text: "${reloadedRowText}"`);
    }
    console.log(`UI row text after offline reload: "${reloadedRowText.replace(/\s+/g, ' ').trim()}"`);
    console.log('✅ Scenario 4 PASS: Pending action survived offline reload.\n');

    // =================================================================
    // Scenario 5: Reconnection & Synchronization
    // =================================================================
    console.log('--- Scenario 5: Reconnection & Sync ---');
    console.log('Restoring network connection...');
    await page.setOfflineMode(false);

    // Click Sync Now / Retry if visible, or wait for background sync
    await page.evaluate(() => {
      const btn = document.querySelector('.sync-now-btn');
      if (btn) btn.click();
    });

    // Wait for queue to empty
    let queueDrained = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const count = await page.evaluate(async () => {
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
      if (count === 0) {
        queueDrained = true;
        break;
      }
    }

    if (!queueDrained) {
      throw new Error('FAIL: Queue did not drain after reconnection');
    }

    // Wait for UI to update
    await new Promise((r) => setTimeout(r, 500));

    const syncdRowText = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.token-table-row'));
      const target = rows.find((r) => r.textContent.includes('Student User'));
      return target ? target.textContent : '';
    });

    if (syncdRowText.includes('pending')) {
      throw new Error(`FAIL: Pending badge still visible after sync! Row: "${syncdRowText}"`);
    }

    const finalHeader = await page.evaluate(() => {
      const el = document.querySelector('.status-indicator');
      return el ? el.textContent : '';
    });

    console.log(`Final header status: "${finalHeader.trim()}"`);
    console.log('✅ Scenario 5 PASS: Reconnection successfully drained queue and cleared pending badges.\n');

    // =================================================================
    // Scenario 6: Slow Request Grace Period (> 400ms shows pending)
    // =================================================================
    console.log('--- Scenario 6: Slow Request Grace Period ---');
    // Intercept /api/events and delay response by 700ms to verify that pending state appears after 400ms
    const cdp = await page.target().createCDPSession();
    await cdp.send('Fetch.enable', {
      patterns: [{ urlPattern: '*api/events*', requestStage: 'Request' }],
    });

    cdp.on('Fetch.requestPaused', async (event) => {
      // Delay response by 700ms
      await new Promise((r) => setTimeout(r, 700));
      await cdp.send('Fetch.continueRequest', { requestId: event.requestId });
    });

    console.log('Triggering slow request (700ms delay)...');
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.token-table-row'));
      const target = rows.find((r) => r.textContent.includes('Student User'));
      const addBtn = target.querySelector('.token-action-btn');
      addBtn.click();
    });

    // At 200ms (before 400ms prompt window): should NOT show pending badge yet
    await new Promise((r) => setTimeout(r, 200));
    const at200ms = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.token-table-row'));
      const target = rows.find((r) => r.textContent.includes('Student User'));
      return target ? target.textContent.includes('pending') : false;
    });
    console.log(`At 200ms (prompt window): isPendingVisible = ${at200ms} (expected false)`);

    // At 550ms (after 400ms prompt window): SHOULD show pending badge!
    await new Promise((r) => setTimeout(r, 350));
    const at550ms = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.token-table-row'));
      const target = rows.find((r) => r.textContent.includes('Student User'));
      return target ? target.textContent.includes('pending') : false;
    });
    console.log(`At 550ms (slow sync): isPendingVisible = ${at550ms} (expected true)`);

    if (at200ms) {
      throw new Error('FAIL: Pending badge displayed too early during slow request!');
    }
    if (!at550ms) {
      throw new Error('FAIL: Pending badge was NOT displayed after 400ms slow sync threshold!');
    }

    // Wait for the delayed request to complete at ~700ms
    await new Promise((r) => setTimeout(r, 500));
    await cdp.send('Fetch.disable');

    console.log('✅ Scenario 6 PASS: Slow request properly showed pending badge after grace threshold.\n');

    // Final checks
    if (consoleWarnings.length > 0) {
      console.warn('Console warnings observed:', consoleWarnings);
    } else {
      console.log('No console warnings or duplicate-key errors observed.');
    }

    console.log('\n🎉 ALL ONLINE / OFFLINE UX VERIFICATION SCENARIOS PASSED 100%!');
  } finally {
    await browser.close();
  }
}

runUXVerification().catch((err) => {
  console.error('\n❌ UX VERIFICATION FAILED:', err);
  process.exit(1);
});
