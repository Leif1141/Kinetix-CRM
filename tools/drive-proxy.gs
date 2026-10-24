// Kinetix CRM Drive proxy. Google Apps Script web app, owned by leif.berger26@gmail.com.
// Runs with Leif's own Drive permissions, so the CRM page never needs a browser Google token.
//
// Who may call it: only the CRM page signed in as OWNER. Each call carries the page's Firebase ID token
// (idToken); the proxy asks Google to verify it and checks the e-mail address. There is no shared key.
//
// Deploy once: script.google.com, New project, paste this file, Deploy, New deployment, type Web app,
// Execute as: Me, Who has access: Anyone, Deploy, authorise. Put the web app URL into Firebase at
// crm-config/driveProxy/url.
// Updating later: Deploy, Manage deployments, Edit (pencil), Version: New version, Deploy. That keeps the URL.
// A "New deployment" creates a new URL, and the CRM stops reaching Drive until Firebase is updated.
//
// get and archive only act on files that sit directly in the CRM folder.
//
// Actions (GET or POST):
//   ping      -> {ok, user}
//   list      -> patch files in the CRM folder
//   get       -> content of one patch file in the CRM folder (by id)
//   archive   -> move one patch file from the CRM folder into "0. Archive"
//   granola   -> newest 60 files in "Granola Call Notes" (name, link, date; no content)
//   backup    -> POST {idToken, action:'backup', snapshot:bool, data:{...}} writes the rolling backup
// POST bodies are sent as text/plain so the browser does not preflight (Apps Script has no OPTIONS).

var OWNER = 'leif.berger26@gmail.com';
var FIREBASE_WEB_API_KEY = 'AIzaSyAEWlsy09Xhw0XMcTauGw9Hw_2lSn_GlYI'; // public web key from the CRM config
var CRM_FOLDER_ID = '19NSMw1zEmNctsmWuPnXCLZeX09ehO6bW';
var ARCHIVE_NAME = '0. Archive';
var BACKUP_NAME = 'KinetixCRM Backup.json';
var GRANOLA_NAME = 'Granola Call Notes';

function doGet(e) { return handle_(e.parameter || {}); }

function doPost(e) {
  var p = {};
  try { p = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (err) { return out_({ error: 'bad json' }); }
  var q = e.parameter || {};
  for (var k in q) if (!(k in p)) p[k] = q[k];
  return handle_(p);
}

function handle_(p) {
  if (!caller_(p)) return out_({ error: 'forbidden' });
  try {
    switch (p.action) {
      case 'ping':    return out_({ ok: true, user: Session.getEffectiveUser().getEmail() });
      case 'list':    return out_({ files: listPatches_() });
      case 'get':     var f = crmFile_(p.id); return out_({ id: p.id, name: f.getName(), content: f.getBlob().getDataAsString('UTF-8') });
      case 'archive': crmFile_(p.id).moveTo(archiveFolder_()); return out_({ ok: true });
      case 'granola': return out_({ files: listGranola_() });
      case 'backup':  return out_(backup_(p.data, !!p.snapshot));
      default:        return out_({ error: 'unknown action' });
    }
  } catch (err) {
    return out_({ error: String(err && err.message || err) });
  }
}

// True when the call carries a valid Firebase ID token of OWNER with a verified address.
// Verified tokens are remembered for five minutes so a burst of calls costs one lookup.
function caller_(p) {
  if (!p.idToken) return false;
  var cache = CacheService.getScriptCache();
  var h = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, p.idToken));
  if (cache.get(h) === OWNER) return true;
  var r = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_WEB_API_KEY, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: p.idToken }), muteHttpExceptions: true
  });
  if (r.getResponseCode() !== 200) return false;
  var u = (JSON.parse(r.getContentText()).users || [])[0];
  if (!u || u.email !== OWNER || !u.emailVerified) return false;
  cache.put(h, OWNER, 300);
  return true;
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function crmFolder_() { return DriveApp.getFolderById(CRM_FOLDER_ID); }

// A file the proxy may read or move: it must sit directly in the CRM folder.
function crmFile_(id) {
  if (!id) throw new Error('no id');
  var f = DriveApp.getFileById(id), parents = f.getParents();
  while (parents.hasNext()) if (parents.next().getId() === CRM_FOLDER_ID) return f;
  throw new Error('file is not in the CRM folder');
}

function archiveFolder_() {
  var it = crmFolder_().getFoldersByName(ARCHIVE_NAME);
  return it.hasNext() ? it.next() : crmFolder_().createFolder(ARCHIVE_NAME);
}

function listPatches_() {
  var res = [], it = crmFolder_().getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName().indexOf('KinetixCRM Patch') >= 0 && !f.isTrashed()) res.push({ id: f.getId(), name: f.getName() });
  }
  res.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
  return res;
}

function listGranola_() {
  var it = DriveApp.getFoldersByName(GRANOLA_NAME);
  if (!it.hasNext()) return [];
  var files = it.next().getFiles(), res = [];
  while (files.hasNext()) {
    var f = files.next();
    if (f.isTrashed()) continue;
    res.push({ id: f.getId(), name: f.getName(), webViewLink: f.getUrl(), createdTime: f.getDateCreated().toISOString() });
  }
  res.sort(function (a, b) { return a.createdTime < b.createdTime ? 1 : -1; });
  return res.slice(0, 60);
}

function backup_(data, snapshot) {
  if (!data) throw new Error('no data');
  var json = JSON.stringify(data);
  var folder = crmFolder_();
  var it = folder.getFilesByName(BACKUP_NAME), f;
  if (it.hasNext()) { f = it.next(); f.setContent(json); }
  else { f = folder.createFile(BACKUP_NAME, json, 'application/json'); }
  var snap = null;
  if (snapshot) {
    var stamp = Utilities.formatDate(new Date(), 'Europe/Berlin', 'yyyyMMdd');
    snap = archiveFolder_().createFile(stamp + ' ' + BACKUP_NAME, json, 'application/json').getName();
  }
  return { ok: true, id: f.getId(), bytes: json.length, snapshot: snap, at: new Date().toISOString() };
}
