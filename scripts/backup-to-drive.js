#!/usr/bin/env node
/**
 * Firebase Realtime Database → Google Drive backup (OAuth / personal Drive).
 *
 * The backup file is owned by YOUR Google account and uses YOUR Drive storage,
 * which avoids the "service accounts have no storage quota" limitation.
 *
 * Auth split:
 *   - Firebase Admin (read DB)  → service-account key  (SERVICE_ACCOUNT_JSON)
 *   - Google Drive (upload)     → OAuth refresh token   (OAUTH_* env vars)
 *
 * Required environment variables:
 *   SERVICE_ACCOUNT_JSON   service-account key JSON (string)  [DB read]
 *   DATABASE_URL           your RTDB url
 *   OAUTH_CLIENT_ID        OAuth client id        (Drive upload)
 *   OAUTH_CLIENT_SECRET    OAuth client secret    (Drive upload)
 *   OAUTH_REFRESH_TOKEN    OAuth refresh token    (Drive upload)
 *   DRIVE_FOLDER_ID        destination folder id in YOUR Drive
 *   RETENTION_DAYS         optional, delete backups older than N days (default 30; 0 = keep all)
 */

const admin = require('firebase-admin');
const { google } = require('googleapis');
const { Readable } = require('stream');

function fail(m){ console.error('❌ ' + m); process.exit(1); }

const rawKey       = process.env.SERVICE_ACCOUNT_JSON;
const databaseURL  = process.env.DATABASE_URL;
const clientId     = process.env.OAUTH_CLIENT_ID;
const clientSecret = process.env.OAUTH_CLIENT_SECRET;
const refreshToken = process.env.OAUTH_REFRESH_TOKEN;
const folderId     = process.env.DRIVE_FOLDER_ID;
const retentionDays= parseInt(process.env.RETENTION_DAYS || '30', 10);

if (!rawKey)       fail('SERVICE_ACCOUNT_JSON is not set.');
if (!databaseURL)  fail('DATABASE_URL is not set.');
if (!clientId)     fail('OAUTH_CLIENT_ID is not set.');
if (!clientSecret) fail('OAUTH_CLIENT_SECRET is not set.');
if (!refreshToken) fail('OAUTH_REFRESH_TOKEN is not set.');
if (!folderId)     fail('DRIVE_FOLDER_ID is not set.');

let serviceAccount;
try { serviceAccount = JSON.parse(rawKey); }
catch (e){ fail('SERVICE_ACCOUNT_JSON is not valid JSON: ' + e.message); }

function stamp(){
  const d = new Date(), p = n => String(n).padStart(2,'0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function driveClient(){
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oauth2 });
}

async function main(){
  // 1) Read the database with the service account
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), databaseURL });
  console.log('⏳ Reading database…');
  const snap = await admin.database().ref('/').once('value');
  const json = JSON.stringify(snap.val() || {}, null, 2);
  console.log(`✅ Read database (${(Buffer.byteLength(json,'utf8')/1024).toFixed(1)} KB).`);

  // 2) Upload to YOUR Drive via OAuth
  const drive = driveClient();
  const filename = `rtdb-backup_${stamp()}.json`;
  console.log(`⏳ Uploading ${filename} to Drive folder ${folderId}…`);
  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId], mimeType: 'application/json' },
    media: { mimeType: 'application/json', body: Readable.from([json]) },
    fields: 'id,name',
    supportsAllDrives: true,
  });
  console.log(`✅ Uploaded: ${res.data.name} (id=${res.data.id})`);

  // 3) Retention
  if (retentionDays > 0){
    const cutoff = new Date(Date.now() - retentionDays*86400000);
    console.log(`⏳ Retention: deleting backups older than ${retentionDays} days…`);
    let pageToken=null, deleted=0;
    do {
      const list = await drive.files.list({
        q: `'${folderId}' in parents and name contains 'rtdb-backup_' and trashed = false`,
        fields: 'nextPageToken, files(id,name,createdTime)',
        pageToken, pageSize: 100, supportsAllDrives: true, includeItemsFromAllDrives: true,
      });
      for (const f of list.data.files || []){
        if (new Date(f.createdTime) < cutoff){
          await drive.files.delete({ fileId: f.id, supportsAllDrives: true });
          deleted++; console.log(`   🗑️  Deleted old backup: ${f.name}`);
        }
      }
      pageToken = list.data.nextPageToken;
    } while (pageToken);
    console.log(`✅ Retention done (${deleted} removed).`);
  }

  console.log('🎉 Backup complete.');
  process.exit(0);
}
main().catch(e => fail(e.stack || e.message));
