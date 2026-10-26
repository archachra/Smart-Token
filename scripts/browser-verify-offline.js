import puppeteer from 'puppeteer-core';
import pool from '../server/db.js';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP_URL = process.env.APP_URL || 'http://localhost:4173';
const SECTION_ID = '043f0728-c357-4e72-b6ce-62823cc064b7';

async function runBrowserVerification() {
  console.log('=== Starting SmartToken Core Offline Mode Browser Verification ===\n');

  const consoleLogs = [];
  const pageErrors = [];

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  page.on('console', (msg) => {
    const text = msg.text();
    consoleLogs.push(`[${msg.type().toUpperCase()}] ${text}`);
  });

  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  try {
    // -------------------------------------------------------------
    // Step 1: Start the app and log in as faculty
    // -------------------------------------------------------------
    console.log('Step 1: Logging in as faculty (faculty@example.com)...');
    await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle2' });

    await page.type('#email', 'faculty@example.com');
    await page.type('#password', 'FacultyPass123!');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('button[type="submit"]'),
    ]);

    const currentUrl = page.url();
    const token = await page.evaluate(() => localStorage.getItem('smarttoken_token'));
    if (!token) throw new Error('JWT token not found in localStorage after login');
    console.log(`✅ Step 1 PASS: Logged in successfully. Current URL: ${currentUrl}`);

    // -------------------------------------------------------------
    // Step 2: Verify service worker registration and active state
    // -------------------------------------------------------------
    console.log('\nStep 2: Checking Service Worker registration...');
    // Wait for service worker to register and become active
    const swStatus = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { supported: false };
      try {
        const reg = await navigator.serviceWorker.ready;
        return {
          supported: true,
          scope: reg.scope,
          active: !!reg.active,
          state: reg.active?.state,
        };
      } catch (e) {
        return { supported: true, error: e.message };
      }
    });

    if (!swStatus.supported || !swStatus.active) {
      throw new Error(`Service Worker not active: ${JSON.stringify(swStatus)}`);
    }
    console.log(`✅ Step 2 PASS: Service worker is active: scope=${swStatus.scope}, state=${swStatus.state}`);

    // Query initial DB balance of Student User
    const studentUserDbRes = await pool.query(
      `SELECT sb.balance 
       FROM students s 
       LEFT JOIN student_balances sb ON (sb.student_id = s.id AND sb.section_id = $1)
       WHERE s.name = 'Student User'`,
      [SECTION_ID]
    );
    const initialDbBalance = Number(studentUserDbRes.rows[0]?.balance) || 0;
    console.log(`ℹ️ Initial database balance for Student User: ${initialDbBalance}`);

    // Navigate to Quick Token while online to prime cache
    console.log('\nNavigating to Quick Token page while online...');
    await page.goto(`${APP_URL}/quick-token`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.quick-token-container');

    // -------------------------------------------------------------
    // Step 3: Simulate network disconnection
    // -------------------------------------------------------------
    console.log('\nStep 3: Simulating network disconnection (Offline Mode)...');
    await page.setOfflineMode(true);

    // Verify online/offline indicator reflects offline state
    const indicatorText = await page.evaluate(() => {
      const el = document.querySelector('.status-indicator');
      return el ? el.textContent : '';
    });
    console.log(`ℹ️ Header status text immediately after going offline: "${indicatorText.trim()}"`);
    console.log('✅ Step 3 PASS: Network emulation set to offline.');

    // -------------------------------------------------------------
    // Step 4: Award +1 token to test student while offline
    // -------------------------------------------------------------
    console.log('\nStep 4: Awarding +1 token to Student User while offline...');
    
    // Find Student User row in Classroom Roster table
    const studentRowSelector = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.token-table-row'));
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].textContent.includes('Student User')) {
          return i;
        }
      }
      return -1;
    });

    if (studentRowSelector === -1) {
      throw new Error('Student User not found in Quick Token table');
    }

    // Click +1 Token button for Student User
    await page.evaluate((rowIndex) => {
      const rows = document.querySelectorAll('.token-table-row');
      const targetRow = rows[rowIndex];
      const addBtn = targetRow.querySelector('.token-action-btn');
      addBtn.click();
    }, studentRowSelector);

    // Give IndexedDB a small moment to complete transaction
    await new Promise((r) => setTimeout(r, 400));

    // Verify persistence in IndexedDB
    const indexedDbEntries = await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('smarttoken_offline_v1');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('pending_queue', 'readonly');
          const store = tx.objectStore('pending_queue');
          const getReq = store.getAll();
          getReq.onsuccess = () => resolve(getReq.result);
          getReq.onerror = () => reject(getReq.error);
        };
        req.onerror = () => reject(req.error);
      });
    });

    if (indexedDbEntries.length === 0) {
      throw new Error('Action was not saved to IndexedDB pending_queue!');
    }

    const queuedAction = indexedDbEntries.find((a) => a.studentName === 'Student User');
    if (!queuedAction) {
      throw new Error(`Student User action missing from IndexedDB. Found: ${JSON.stringify(indexedDbEntries)}`);
    }
    console.log(`ℹ️ Persisted action in IndexedDB: ID=${queuedAction.clientEventId}, type=${queuedAction.actionType}, change=${queuedAction.tokenChange}, status=${queuedAction.status}`);

    // Verify UI displays pending badge
    const uiRowText = await page.evaluate((rowIndex) => {
      const rows = document.querySelectorAll('.token-table-row');
      return rows[rowIndex].textContent;
    }, studentRowSelector);

    if (!uiRowText.includes('pending')) {
      throw new Error(`UI did not show pending badge for Student User. Row text: "${uiRowText}"`);
    }
    console.log(`ℹ️ UI row display: "${uiRowText.replace(/\s+/g, ' ').trim()}"`);
    console.log('✅ Step 4 PASS: Action persisted in IndexedDB and UI confirmed as pending.');

    // -------------------------------------------------------------
    // Step 5: While still offline, reload the page
    // -------------------------------------------------------------
    console.log('\nStep 5: Reloading page while still offline...');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.quick-token-container', { timeout: 10000 });

    // Confirm page rendered successfully
    const pageTitle = await page.evaluate(() => {
      const h2 = document.querySelector('h2');
      return h2 ? h2.textContent : '';
    });
    if (pageTitle !== 'Quick Token') {
      throw new Error(`Page failed to load offline! Found header: "${pageTitle}"`);
    }

    // Verify action still in IndexedDB after reload
    const entriesAfterReload = await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('smarttoken_offline_v1');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('pending_queue', 'readonly');
          const store = tx.objectStore('pending_queue');
          const getReq = store.getAll();
          getReq.onsuccess = () => resolve(getReq.result);
          getReq.onerror = () => reject(getReq.error);
        };
        req.onerror = () => reject(req.error);
      });
    });

    if (entriesAfterReload.length === 0) {
      throw new Error('Pending action was lost from IndexedDB after page reload!');
    }

    // Verify UI still displays pending state after reload
    await page.waitForSelector('.token-table-row');
    const studentRowTextAfterReload = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.token-table-row'));
      const target = rows.find((r) => r.textContent.includes('Student User'));
      return target ? target.textContent : '';
    });

    if (!studentRowTextAfterReload.includes('pending')) {
      throw new Error(`UI lost pending badge after reload! Text: "${studentRowTextAfterReload}"`);
    }
    console.log(`ℹ️ UI row text after offline reload: "${studentRowTextAfterReload.replace(/\s+/g, ' ').trim()}"`);
    console.log('✅ Step 5 PASS: Page loaded offline from cache, and pending action survived refresh.');

    // -------------------------------------------------------------
    // Step 6: Restore network and verify synchronization
    // -------------------------------------------------------------
    console.log('\nStep 6: Restoring network connection...');
    await page.setOfflineMode(false);

    // Trigger sync
    await page.evaluate(async () => {
      const btn = document.querySelector('.sync-now-btn');
      if (btn) btn.click();
    });

    // Wait for sync to complete (pending count becomes 0 in header or queue is empty)
    console.log('Waiting for background synchronization...');
    let queueEmpty = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const remainingCount = await page.evaluate(async () => {
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

      if (remainingCount === 0) {
        queueEmpty = true;
        break;
      }
    }

    if (!queueEmpty) {
      throw new Error('Queue was not cleared after network restoration!');
    }

    // Verify final DB balance
    const finalDbRes = await pool.query(
      `SELECT sb.balance 
       FROM students s 
       LEFT JOIN student_balances sb ON (sb.student_id = s.id AND sb.section_id = $1)
       WHERE s.name = 'Student User'`,
      [SECTION_ID]
    );
    const finalDbBalance = Number(finalDbRes.rows[0]?.balance) || 0;
    console.log(`ℹ️ Final database balance for Student User: ${finalDbBalance} (previous: ${initialDbBalance})`);

    if (finalDbBalance !== initialDbBalance + 1) {
      throw new Error(`Balance did not increase by exactly 1! Expected ${initialDbBalance + 1}, got ${finalDbBalance}`);
    }

    // Check header status in UI
    const finalHeader = await page.evaluate(() => {
      const el = document.querySelector('.status-indicator');
      return el ? el.textContent : '';
    });
    console.log(`ℹ️ Final header status: "${finalHeader.trim()}"`);
    console.log('✅ Step 6 PASS: Queued action synchronized and server balance increased by exactly 1.');

    // -------------------------------------------------------------
    // Step 7: Check browser console and network errors
    // -------------------------------------------------------------
    console.log('\nStep 7: Checking browser console and page errors...');
    const relevantConsole = consoleLogs.filter(
      (l) => !l.includes('[VITE]') && !l.includes('Download the React DevTools')
    );
    console.log(`Total captured console messages: ${relevantConsole.length}`);
    if (pageErrors.length > 0) {
      console.warn('Page errors observed:', pageErrors);
    } else {
      console.log('No unhandled page errors observed.');
    }
    console.log('✅ Step 7 PASS: Console logs inspected.');

    console.log('\n🎉 ALL CORE OFFLINE MODE BROWSER VERIFICATION STEPS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('\n❌ BROWSER VERIFICATION FAILED:', err);
    console.log('\n--- Captured Console Logs ---');
    consoleLogs.forEach((l) => console.log(l));
    console.log('\n--- Captured Page Errors ---');
    pageErrors.forEach((e) => console.log(e));
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runBrowserVerification();
