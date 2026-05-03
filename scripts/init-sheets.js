// Creates/resets the signals and config tabs with v4 schema.
// Deletes old tabs: analysts, semi_bbb, cycle_scores.
// Safe to re-run — creates missing tabs, skips existing ones.
// Usage: node scripts/init-sheets.js

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SHEET_ID = '1RFYBmGqCeoG0RwcsXZ5HHrCFqa3ViN-J26g-sAAQEDc';

function findRootWithCredentials(dir) {
  if (fs.existsSync(path.join(dir, 'credentials.json'))) return dir;
  const parent = path.dirname(dir);
  if (parent === dir) return path.join(__dirname, '..');
  return findRootWithCredentials(parent);
}
const CREDS_PATH = path.join(findRootWithCredentials(path.join(__dirname, '..')), 'credentials.json');

// ── Schema ─────────────────────────────────────────────────────────────────

const SIGNALS_HEADERS = [
  'run_id',
  'quarter',
  'ingested_at',
  'company',
  'ticker',
  'type',
  'bit_growth_pct',
  'capex_pct',
  'asp_change_pct',
  'inventory_days',
  'mgmt_tone_score',
  'node_transition_note',
  'bit_growth_quote',
  'capex_quote',
  'asp_quote',
  'inventory_quote',
  'mgmt_tone_quote',
  'transcript_url',
];

const CONFIG_HEADERS = [
  'ticker',
  'company',
  'type',
  'default_url',
  'last_updated',
  'notes',
];

// Q1 2026 verified URLs from HANDOFF_v4 section 8
const CONFIG_DATA = [
  ['SNDK', 'SanDisk',   'vendor',       'https://www.fool.com/earnings/call-transcripts/2026/04/30/sandisk-sndk-q3-2026-earnings-transcript/',                    '2026-05-03', 'Motley Fool'],
  ['MU',   'Micron',    'vendor',       'https://www.fool.com/earnings/call-transcripts/2026/03/18/micron-mu-q2-2026-earnings-call-transcript/',                   '2026-05-03', 'Motley Fool'],
  ['SSNLF','Samsung',   'vendor',       'https://images.samsung.com/is/content/samsung/assets/global/ir/docs/2026_1Q_conference_eng.pdf',                          '2026-05-03', 'Samsung IR PDF — auto-updates with pattern: {YEAR}_{Q}Q_conference_eng.pdf'],
  ['HXSCL','SK Hynix',  'vendor',       'https://www.gurufocus.com/news/8811276/q1-2026-sk-hynix-inc-earnings-call-transcript',                                   '2026-05-03', 'GuruFocus'],
  ['MSFT', 'Microsoft', 'hyperscaler',  'https://www.fool.com/earnings/call-transcripts/2025/10/29/microsoft-msft-q1-2026-earnings-call-transcript/',              '2026-05-03', 'Motley Fool'],
  ['GOOG', 'Alphabet',  'hyperscaler',  'https://www.fool.com/earnings/call-transcripts/2026/04/29/alphabet-googl-q1-2026-earnings-call-transcript/',              '2026-05-03', 'Motley Fool'],
  ['AMZN', 'Amazon',    'hyperscaler',  'https://www.fool.com/earnings/call-transcripts/2026/04/29/amazon-amzn-q1-2026-earnings-call-transcript/',                '2026-05-03', 'Motley Fool'],
  ['META', 'Meta',      'hyperscaler',  'https://www.fool.com/earnings/call-transcripts/2026/04/29/meta-meta-q1-2026-earnings-call-transcript/',                  '2026-05-03', 'Motley Fool'],
];

const TABS_TO_DELETE = ['analysts', 'semi_bbb', 'cycle_scores'];
const TABS_TO_CREATE = ['signals', 'config'];

// ── Auth ───────────────────────────────────────────────────────────────────

async function getSheets() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function getSheetMap(sheets) {
  const resp = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const map = {};
  for (const s of resp.data.sheets) {
    map[s.properties.title] = s.properties.sheetId;
  }
  return map;
}

async function createTab(sheets, title) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{ addSheet: { properties: { title } } }],
    },
  });
  console.log(`  Created tab: ${title}`);
}

async function deleteTab(sheets, sheetId, title) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{ deleteSheet: { sheetId } }],
    },
  });
  console.log(`  Deleted tab: ${title}`);
}

async function setHeaders(sheets, tab, headers) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [headers] },
  });
  console.log(`  Headers set for ${tab} (${headers.length} columns)`);
}

async function writeRows(sheets, tab, startRow, rows) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A${startRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
  console.log(`  Wrote ${rows.length} rows to ${tab} starting at row ${startRow}`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Initializing sheets for NAND Cycle Monitor v4...\n');

  const sheets = await getSheets();
  let sheetMap = await getSheetMap(sheets);
  console.log(`Current tabs: ${Object.keys(sheetMap).join(', ')}\n`);

  // Step 1: Create missing required tabs
  console.log('Step 1: Ensure required tabs exist');
  for (const tab of TABS_TO_CREATE) {
    if (!sheetMap[tab]) {
      await createTab(sheets, tab);
    } else {
      console.log(`  Tab exists: ${tab}`);
    }
  }

  // Step 2: Set headers
  console.log('\nStep 2: Set headers');
  await setHeaders(sheets, 'signals', SIGNALS_HEADERS);
  await setHeaders(sheets, 'config', CONFIG_HEADERS);

  // Step 3: Populate config with company data
  console.log('\nStep 3: Populate config tab');
  await writeRows(sheets, 'config', 2, CONFIG_DATA);

  // Step 4: Delete old tabs
  console.log('\nStep 4: Delete old tabs');
  // Refresh sheet map after creates
  sheetMap = await getSheetMap(sheets);
  for (const tab of TABS_TO_DELETE) {
    if (sheetMap[tab] !== undefined) {
      await deleteTab(sheets, sheetMap[tab], tab);
    } else {
      console.log(`  Tab not found (already deleted): ${tab}`);
    }
  }

  console.log('\n✅ Sheet initialization complete.');
  console.log(`\n   signals tab: ${SIGNALS_HEADERS.length} columns`);
  console.log(`   config tab:  ${CONFIG_HEADERS.length} columns, ${CONFIG_DATA.length} companies pre-populated`);
  console.log('\n   Run node scripts/verify-setup.js to confirm.');
}

main().catch(e => {
  console.error('\n❌ Error:', e.message);
  process.exit(1);
});
