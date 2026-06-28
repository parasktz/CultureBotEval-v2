#!/usr/bin/env node
/**
 * Restore a Firebase Realtime Database from a backup JSON file.
 *
 * ⚠️  THIS OVERWRITES DATA. Read the safety notes below.
 *
 * It can restore from either:
 *   - a local file:           --file ./rtdb-backup_20260101_023000.json
 *   - a Google Drive file id:  --drive <fileId>
 *
 * Two modes:
 *   --mode merge   (DEFAULT) update()s the data — existing keys NOT present in
 *                  the backup are LEFT ALONE. Safer. Good for restoring a path
 *                  or recovering deleted records without nuking newer data.
 *   --mode replace set()s the whole root — the database becomes EXACTLY the
 *                  backup. Anything newer than the backup is LOST. Destructive.
 *
 * Restore only a sub-path (recommended when you only lost part of the data):
 *   --path sessions/0D8NU6
 *
 * Safety:
 *   - Always takes a fresh "pre-restore" safety snapshot to ./pre-restore_*.json
 *     before writing anything, so you can undo.
 *   - Requires you to type the database project id to confirm (unless --yes).
 *
 * Required env:
 *   SERVICE_ACCOUNT_JSON   service-account key JSON (string)
 *   DATABASE_URL           your RTDB url
 *
 * Examples:
 *   SERVICE_ACCOUNT_JSON="$(cat key.json)" DATABASE_URL="https://...firebasedatabase.app" \
 *     node restore-from-backup.js --file ./backup.json --mode merge
 *
 *   node restore-from-backup.js --drive 1AbCdEf... --path sessions --mode merge
 */

const admin = require('firebase-admin');
const fs = require('fs');
const readline = require('readline');

function fail(m){ console.error('❌ ' + m); process.exit(1); }

// ── Parse args ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function arg(name, def){ const i = args.indexOf(name); return i >= 0 ? args[i+1] : def; }
const hasFlag = name => args.includes(name);

const fileArg   = arg('--file');
const driveId   = arg('--drive');
const mode      = (arg('--mode', 'merge') || 'merge').toLowerCase();
const restorePath = arg('--path', '/');
const autoYes   = hasFlag('--yes');

if (!fileArg && !driveId) fail('Provide --file <path> OR --drive <fileId>.');
if (fileArg && driveId)   fail('Use only one of --file / --drive.');
if (!['merge','replace'].includes(mode)) fail("--mode must be 'merge' or 'replace'.");

const rawKey = process.env.SERVICE_ACCOUNT_JSON;
const databaseURL = process.env.DATABASE_URL;
if (!rawKey) fail('SERVICE_ACCOUNT_JSON is not set.');
if (!databaseURL) fail('DATABASE_URL is not set.');

let serviceAccount;
try { serviceAccount = JSON.parse(rawKey); }
catch (e) { fail('SERVICE_ACCOUNT_JSON is not valid JSON: ' + e.message); }

function stamp(){
  const d = new Date(), p = n => String(n).padStart(2,'0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function confirm(question){
  if (autoYes) return Promise.resolve(true);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(question, ans => { rl.close(); res(ans); }));
}

async function loadBackupJson(){
  if (fileArg) {
    if (!fs.existsSync(fileArg)) fail('File not found: ' + fileArg);
    return JSON.parse(fs.readFileSync(fileArg, 'utf8'));
  }
  // Drive download
  const { google } = require('googleapis');
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const drive = google.drive({ version: 'v3', auth });
  console.log('⏳ Downloading backup from Drive id ' + driveId + ' …');
  const res = await drive.files.get(
    { fileId: driveId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  );
  return JSON.parse(Buffer.from(res.data).toString('utf8'));
}

async function main(){
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), databaseURL });
  const db = admin.database();
  const projectId = serviceAccount.project_id || 'unknown';

  // 1) Load backup
  const backup = await loadBackupJson();
  const node = restorePath === '/' ? backup
             : restorePath.split('/').filter(Boolean).reduce((o,k)=> (o ? o[k] : undefined), backup);
  if (node === undefined)
    fail(`Path "${restorePath}" not found inside the backup file.`);

  const sizeKB = (Buffer.byteLength(JSON.stringify(node), 'utf8')/1024).toFixed(1);
  console.log(`\n=== RESTORE PLAN ===`);
  console.log(`  Project:     ${projectId}`);
  console.log(`  Target path: ${restorePath}`);
  console.log(`  Mode:        ${mode.toUpperCase()}  ${mode==='replace' ? '(DESTRUCTIVE — overwrites everything at the path)' : '(merge — keeps keys not in backup)'}`);
  console.log(`  Payload:     ${sizeKB} KB`);
  console.log(`====================\n`);

  // 2) Safety snapshot of CURRENT data at the target path
  console.log('⏳ Taking pre-restore safety snapshot…');
  const cur = await db.ref(restorePath).once('value');
  const safetyFile = `pre-restore_${stamp()}.json`;
  fs.writeFileSync(safetyFile, JSON.stringify(cur.val() ?? null, null, 2));
  console.log(`✅ Saved current state to ${safetyFile} (use this to undo).`);

  // 3) Confirm
  if (!autoYes) {
    const ans = await confirm(`Type the project id "${projectId}" to proceed: `);
    if ((ans || '').trim() !== projectId) fail('Confirmation did not match. Aborted. (Nothing was written.)');
  }

  // 4) Write
  console.log(`⏳ Restoring (${mode})…`);
  if (mode === 'replace') {
    await db.ref(restorePath).set(node);
  } else {
    // merge: only valid when node is an object; for primitives, set() is the only option
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      await db.ref(restorePath).update(node);
    } else {
      console.log('   (value is not an object — using set for this path)');
      await db.ref(restorePath).set(node);
    }
  }
  console.log('🎉 Restore complete.');
  console.log(`   If something looks wrong, restore again from ${safetyFile} with --mode replace --path ${restorePath}`);
  process.exit(0);
}

main().catch(e => fail(e.stack || e.message));
