// Run once to set up all tab headers in Google Sheets
// Usage: node scripts/init-sheets.js

const { google } = require('googleapis');
const creds = require('../credentials.json');

const SHEET_ID = '1RFYBmGqCeoG0RwcsXZ5HHrCFqa3ViN-J26g-sAAQEDc';

async function getSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return google.sheets({ version: 'v4', auth });
}

const HEADERS = {
  vendors: [
    'company', 'ticker', 'quarter', 'report_date',
    // Supply
    'bit_growth_yoy', 'bit_growth_qoq', 'inventory_days', 'utilization_rate',
    'capex_guidance', 'capex_yoy_pct', 'wafer_starts_direction', 'node_transition_notes',
    // Pricing
    'asp_seq_pct', 'asp_yoy_pct', 'pricing_tone',
    // Demand
    'revenue_yoy', 'datacenter_revenue', 'gross_margin', 'gross_margin_qoq',
    'rpo', 'contracted_volume_pct',
    // Qualitative
    'mgmt_tone_score', 'language_flags', 'guidance_posture', 'supply_demand_commentary',
    // Meta
    'transcript_url', 'run_id', 'confirmed_at', 'run_notes'
  ],
  hyperscalers: [
    'company', 'ticker', 'quarter', 'report_date',
    // CapEx
    'capex_actual', 'capex_qoq_pct', 'capex_fy_guidance', 'capex_intensity_pct',
    // Storage & demand
    'datacenter_revenue', 'datacenter_yoy', 'backlog', 'backlog_yoy',
    'storage_constraint_tone', 'pull_forward_procurement', 'memory_cost_commentary',
    // Qualitative
    'storage_sufficiency_score', 'agentic_ai_commentary', 'inference_vs_training',
    'token_compute_volume', 'vendor_mentions',
    // Meta
    'transcript_url', 'run_id', 'confirmed_at', 'run_notes'
  ],
  analysts: [
    'source', 'quarter', 'report_date',
    'supply_bit_growth_est', 'demand_bit_growth_est',
    'cycle_position_call', 'price_forecast_direction',
    'key_quote_1', 'key_quote_2', 'key_quote_3',
    'delta_vs_hard_data',
    'source_url', 'run_id', 'confirmed_at'
  ],
  semi_bbb: [
    'month', 'book_to_bill', 'interpretation', 'entered_at'
  ],
  cycle_scores: [
    'run_id', 'run_date', 'quarter',
    'vendor_composite', 'hyperscaler_composite', 'semi_score',
    'master_score', 'cycle_position',
    'confidence_level', 'gates_passing',
    'sources_current', 'sources_total',
    'pairs_firing', 'pair_vendor_hyperscaler', 'pair_asp_inventory',
    'pair_mgmt_capex', 'pair_spot_contract',
    'analyst_divergence', 'run_notes'
  ],
  config: [
    'key', 'value', 'description', 'updated_at'
  ]
};

const CONFIG_DEFAULTS = [
  ['staleness_days', '90', 'Days before a source is considered stale', new Date().toISOString()],
  ['confirmation_requirement', '2', 'Min independent companies needed for cycle position change', new Date().toISOString()],
  ['trend_gate_quarters', '2', 'Consecutive quarters required before cycle position change', new Date().toISOString()],
  ['analyst_divergence_threshold', '15', 'Delta points before analyst divergence flag raised', new Date().toISOString()],
  ['what_changed_threshold', '0.5', 'Min weight×magnitude to appear in What Changed list', new Date().toISOString()],
  ['vendor_weight', '0.50', 'Vendor composite weight in master score', new Date().toISOString()],
  ['hyperscaler_weight', '0.35', 'Hyperscaler composite weight in master score', new Date().toISOString()],
  ['semi_weight', '0.15', 'SEMI BBB weight in master score', new Date().toISOString()],
  ['w_bit_growth_yoy', '10', 'Vendor: Bit shipment growth YoY', new Date().toISOString()],
  ['w_inventory_days', '10', 'Vendor: Inventory days on hand', new Date().toISOString()],
  ['w_asp_seq', '10', 'Vendor: Sequential ASP change', new Date().toISOString()],
  ['w_bit_growth_qoq', '8', 'Vendor: Bit growth QoQ', new Date().toISOString()],
  ['w_capex_guidance', '8', 'Vendor: CapEx guidance', new Date().toISOString()],
  ['w_datacenter_revenue', '7', 'Vendor: Data center revenue', new Date().toISOString()],
  ['w_gross_margin', '7', 'Vendor: Gross margin', new Date().toISOString()],
  ['w_asp_yoy', '7', 'Vendor: ASP YoY', new Date().toISOString()],
  ['w_utilization_rate', '7', 'Vendor: Utilization rate', new Date().toISOString()],
  ['w_revenue_yoy', '6', 'Vendor: Revenue YoY', new Date().toISOString()],
  ['w_wafer_starts', '6', 'Vendor: Wafer starts direction', new Date().toISOString()],
  ['w_pricing_tone', '5', 'Vendor: Pricing tone', new Date().toISOString()],
  ['w_mgmt_tone', '5', 'Vendor: Management tone score', new Date().toISOString()],
  ['w_node_transition', '5', 'Vendor: Node transition commentary', new Date().toISOString()],
  ['w_rpo', '5', 'Vendor: RPO', new Date().toISOString()],
  ['w_guidance_posture', '4', 'Vendor: Guidance posture', new Date().toISOString()],
  ['w_contracted_volume', '4', 'Vendor: Contracted volume %', new Date().toISOString()],
  ['w_supply_demand_lang', '3', 'Vendor: Supply/demand language', new Date().toISOString()],
  ['w_language_flags', '3', 'Vendor: Language flags', new Date().toISOString()],
  ['wh_capex_actual', '10', 'Hyperscaler: CapEx actual', new Date().toISOString()],
  ['wh_capex_qoq', '10', 'Hyperscaler: CapEx QoQ change', new Date().toISOString()],
  ['wh_storage_constraint', '8', 'Hyperscaler: Storage constraint tone', new Date().toISOString()],
  ['wh_capex_guidance', '8', 'Hyperscaler: CapEx FY guidance', new Date().toISOString()],
  ['wh_datacenter_revenue', '8', 'Hyperscaler: Data center revenue', new Date().toISOString()],
  ['wh_pull_forward', '7', 'Hyperscaler: Pull-forward procurement', new Date().toISOString()],
  ['wh_backlog', '7', 'Hyperscaler: Backlog', new Date().toISOString()],
  ['wh_capex_intensity', '7', 'Hyperscaler: CapEx intensity', new Date().toISOString()],
  ['wh_memory_cost', '6', 'Hyperscaler: Memory cost commentary', new Date().toISOString()],
  ['wh_token_volume', '5', 'Hyperscaler: Token/compute volume', new Date().toISOString()],
  ['wh_inference_training', '5', 'Hyperscaler: Inference vs training', new Date().toISOString()],
  ['wh_storage_sufficiency', '5', 'Hyperscaler: Storage sufficiency score', new Date().toISOString()],
  ['wh_agentic_ai', '4', 'Hyperscaler: Agentic AI commentary', new Date().toISOString()],
  ['wh_vendor_mentions', '3', 'Hyperscaler: Vendor mentions', new Date().toISOString()],
];

async function initSheets() {
  const sheets = await getSheets();

  for (const [tab, headers] of Object.entries(HEADERS)) {
    console.log(`Setting headers for tab: ${tab}`);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${tab}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] }
    });
  }

  console.log('Populating config defaults...');
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'config!A2',
    valueInputOption: 'RAW',
    requestBody: { values: CONFIG_DEFAULTS }
  });

  console.log('✅ Sheet initialization complete');
}

initSheets().catch(console.error);