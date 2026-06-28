#!/usr/bin/env node
/**
 * Firebase Realtime Database → Google Drive backup.
 *
 * Reads the entire RTDB as JSON and uploads it as a timestamped file to a
 * Google Drive folder. Designed to run in GitHub Actions (no machine of your
 * own required) but also runs locally.
 *
 * Auth: a single Google service-account key (JSON) is used for BOTH:
 *   - Firebase Admin (read the database)
 *   - Google Drive API (upload the file)
 *
 * Required environment variables:
 *   SERVICE_ACCOUNT_JSON   full service-account key JSON (as a string)
 *   DATABASE_URL           e.g. https://cultureboteval-v2-18d9e-default-rtdb.europe-west1.firebasedatabase.app
 *   DRIVE_FOLDER_ID        the Google Drive folder ID to upload into
 *   RETENTION_DAYS         optional, delete backups older than N days (default: 30; 0 = keep forever)
 */

const admin = require('firebase-admin');
const { google } = require('googleapis');
const { Readable } = require('stream');

function fail(msg) { console.error('❌ ' + msg); process.exit(1); }

// ── Read & validate config ────────────────────────────────────────────────
const rawKey = process.env.SERVICE_ACCOUNT_JSON;
const databaseURL = process.env.DATABASE_URL;
const folderId = process.env.DRIVE_FOLDER_ID;
const retentionDays = parseInt(process.env.RETENTION_DAYS || '30', 10);

if (!rawKey) fail('SERVICE_ACCOUNT_JSON is not set.');
if (!databaseURL) fail('DATABASE_URL is not set.');
if (!folderId) fail('DRIVE_FOLDER_ID is not set.');

let serviceAccount;
try { serviceAccount = JSON.parse(rawKey); }
catch (e) { fail('SERVICE_ACCOUNT_JSON is not valid JSON: ' + e.message); }

// ── Helpers ───────────────────────────────────────────────────────────────
function stamp() {
  // YYYYMMDD_HHMMSS in UTC
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}_` +
         `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

async function main() {
  // 1) Firebase Admin — read the whole database
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL,
  });

  console.log('⏳ Reading database…');
  const snap = await admin.database().ref('/').once('value');
  const data = snap.val() || {};
  const json = JSON.stringify(data, null, 2);
  const sizeKB = (Buffer.byteLength(json, 'utf8') / 1024).toFixed(1);
  console.log(`✅ Read database (${sizeKB} KB).`);

  // 2) Google Drive — authenticate with the same service account
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  const drive = google.drive({ version: 'v3', auth });

  // 3) Upload the JSON
  const filename = `rtdb-backup_${stamp()}.json`;
  console.log(`⏳ Uploading ${filename} to Drive folder ${folderId}…`);

  const res = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
      mimeType: 'application/json',
    },
    media: {
      mimeType: 'application/json',
      body: Readable.from([json]),
    },
    fields: 'id,name,size',
    supportsAllDrives: true,
  });
  console.log(`✅ Uploaded: ${res.data.name} (id=${res.data.id})`);

  // 4) Retention — delete old backups (optional)
  if (retentionDays > 0) {
    const cutoff = new Date(Date.now() - retentionDays * 86400000);
    console.log(`⏳ Applying retention: deleting backups older than ${retentionDays} days…`);
    let pageToken = null, deleted = 0;
    do {
      const list = await drive.files.list({
        q: `'${folderId}' in parents and name contains 'rtdb-backup_' and trashed = false`,
        fields: 'nextPageToken, files(id,name,createdTime)',
        pageToken,
        pageSize: 100,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      for (const f of list.data.files || []) {
        if (new Date(f.createdTime) < cutoff) {
          await drive.files.delete({ fileId: f.id, supportsAllDrives: true });
          deleted++;
          console.log(`   🗑️  Deleted old backup: ${f.name}`);
        }
      }
      pageToken = list.data.nextPageToken;
    } while (pageToken);
    console.log(`✅ Retention done (${deleted} old file(s) removed).`);
  }

  console.log('🎉 Backup complete.');
  process.exit(0);
}

main().catch(e => fail(e.stack || e.message));
