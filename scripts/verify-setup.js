// Run at the start of every session to verify env + Sheets connection.
// Usage: node scripts/verify-setup.js
// Must be run from project root: node scripts/verify-setup.js

const fs = require('fs');
const path = require('path');

// Walk up from __dirname/../ looking for credentials.json.
// This handles both normal layout (scripts/../credentials.json) and git worktrees
// where credentials.json lives in the parent repo root, not the worktree root.
function findRootWithCredentials(dir) {
  if (fs.existsSync(path.join(dir, 'credentials.json'))) return dir;
  const parent = path.dirname(dir);
  if (parent === dir) return path.join(__dirname, '..'); // give up, use default
  return findRootWithCredentials(parent);
}
const ROOT = findRootWithCredentials(path.join(__dirname, '..'));
const EXPECTED_SHEET_ID = '1RFYBmGqCeoG0RwcsXZ5HHrCFqa3ViN-J26g-sAAQEDc';
// Explicitly named for the critical lowercase-i: V(i)N not VIN
const VIN_CHARS = { 29: 'V', 30: 'i', 31: 'N' }; // 1-indexed positions in sheet ID

function pass(msg) {
  console.log(`✅ ${msg}`);
}

function fail(msg, fix) {
  console.log(`\n❌ ${msg}`);
  if (fix) console.log(`\n   Fix: ${fix}\n`);
  process.exit(1);
}

function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const raw = trimmed.slice(eqIdx + 1).trim();
    vars[key] = raw.replace(/^['"]|['"]$/g, '');
  }
  return vars;
}

async function main() {
  console.log('NAND Cycle Monitor — setup verification\n');

  // ── Check 1: credentials.json ──────────────────────────────────────────────
  const credsPath = path.join(ROOT, 'credentials.json');
  if (!fs.existsSync(credsPath)) {
    fail(
      'credentials.json not found at project root',
      'Download the service account JSON key from:\n' +
      '   Google Cloud Console → IAM & Admin → Service Accounts\n' +
      '   → nand-cycle-monitor-sa → Keys → Add Key → JSON\n' +
      '   Save the file as credentials.json in the project root.\n' +
      '   Confirm it is in .gitignore.'
    );
  }
  let creds;
  try {
    creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
  } catch {
    fail('credentials.json exists but is not valid JSON', 'Re-download the service account key file from Google Cloud Console.');
  }
  pass(`credentials.json exists (service account: ${creds.client_email || 'unknown'})`);

  // ── Check 2: .env.local ────────────────────────────────────────────────────
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) {
    fail(
      '.env.local not found',
      'Create .env.local in the project root with:\n' +
      "   GOOGLE_CREDENTIALS_JSON='{...full JSON from credentials.json as one line...}'\n" +
      '   ANTHROPIC_API_KEY=sk-ant-...'
    );
  }
  const env = parseEnvFile(envPath);

  if (!env.GOOGLE_CREDENTIALS_JSON) {
    fail(
      'GOOGLE_CREDENTIALS_JSON missing from .env.local',
      'Add this line to .env.local:\n' +
      "   GOOGLE_CREDENTIALS_JSON='{...}'\n" +
      '   Paste the entire contents of credentials.json, minified to one line, as the value.\n' +
      '   Quick way: node -e "console.log(JSON.stringify(require(\'./credentials.json\')))" | pbcopy\n' +
      '   Then: GOOGLE_CREDENTIALS_JSON=<paste>'
    );
  }
  pass('GOOGLE_CREDENTIALS_JSON set in .env.local');

  if (!env.ANTHROPIC_API_KEY) {
    fail(
      'ANTHROPIC_API_KEY missing from .env.local',
      'Add this line to .env.local:\n' +
      '   ANTHROPIC_API_KEY=sk-ant-...'
    );
  }
  pass('ANTHROPIC_API_KEY set in .env.local');

  // ── Check 3: Sheet ID — character by character ─────────────────────────────
  // Critical: the ID contains lowercase 'i' in 'ViN' (not 'VIN')
  const id = EXPECTED_SHEET_ID;
  const chars = id.split('');
  let vinOk = true;
  for (const [pos, expected] of Object.entries(VIN_CHARS)) {
    const actual = chars[Number(pos) - 1]; // convert to 0-indexed
    if (actual !== expected) {
      vinOk = false;
      console.log(`   Position ${pos}: expected '${expected}', found '${actual}'`);
    }
  }
  if (!vinOk) {
    fail(
      'Sheet ID has wrong characters in ViN section',
      `Correct Sheet ID: ${id}\n` +
      '   The 29th char must be uppercase V, 30th lowercase i, 31st uppercase N.\n' +
      '   Update EXPECTED_SHEET_ID in this file and in init-sheets.js.'
    );
  }
  // Print the ViN section explicitly for visual confirmation
  const vinSection = id.slice(28, 31); // chars 29-31 (0-indexed 28-30)
  pass(`Sheet ID verified — ViN section: "${vinSection}" ✓ (V=capital, i=lowercase, N=capital)`);

  // ── Check 4: Sheets connection ─────────────────────────────────────────────
  let sheets;
  let spreadsheet;
  try {
    const { google } = require('googleapis');
    const auth = new google.auth.GoogleAuth({
      keyFile: credsPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    sheets = google.sheets({ version: 'v4', auth });
    const resp = await sheets.spreadsheets.get({ spreadsheetId: id });
    spreadsheet = resp.data;
    pass(`Sheets connection works — spreadsheet: "${spreadsheet.properties.title}"`);
  } catch (e) {
    fail(
      `Sheets connection failed: ${e.message}`,
      'Check that:\n' +
      '   1. credentials.json is a valid service account key\n' +
      '   2. The service account has Editor access on the spreadsheet\n' +
      '   3. Google Sheets API is enabled in the Cloud project'
    );
  }

  // ── Check 5: Required tabs ─────────────────────────────────────────────────
  const sheetNames = spreadsheet.sheets.map(s => s.properties.title);
  const required = ['signals', 'config'];
  for (const tab of required) {
    if (!sheetNames.includes(tab)) {
      fail(
        `Required tab "${tab}" not found`,
        `Run: node scripts/init-sheets.js\n` +
        `   Current tabs: ${sheetNames.join(', ')}`
      );
    }
    pass(`Tab "${tab}" exists`);
  }

  console.log('\n✅ All checks passed. Ready to build.\n');
}

main().catch(e => {
  console.error('\nUnexpected error:', e.message);
  process.exit(1);
});
