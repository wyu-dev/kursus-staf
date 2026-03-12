// ═══════════════════════════════════════════════════════════════════
// SISTEM PELAPORAN KURSUS STAF — ADTEC KUANTAN 2026
// Google Apps Script Backend
// ═══════════════════════════════════════════════════════════════════
//
// CARA SETUP:
// 1. Buka script.google.com → New Project
// 2. Paste kod ini (ganti SPREADSHEET_ID)
// 3. Deploy → New Deployment → Web App
//    - Execute as: Me
//    - Who has access: Anyone
// 4. Copy URL deployment → paste dalam HTML (GAS_URL)
// ═══════════════════════════════════════════════════════════════════

const SPREADSHEET_ID = 'GANTI_SPREADSHEET_ID_ANDA';
const DRIVE_FOLDER_ID = '19MDlVOeJ_l1LI9I_QpY_E45n2AW3_ov2';
const TAHUN = '2026';

const SH_STAF    = 'STAF';
const SH_LOG     = 'LOG_KURSUS';
const SH_SENARAI = 'SENARAI_NAMA';

// ═══════════════════════════════════════════════
// ENTRY POINTS
// Semua call guna GET dengan ?action=xxx&data={...}
// Ini elak CORS issue dalam Apps Script
// ═══════════════════════════════════════════════
function doGet(e) {
  try {
    const action = e.parameter.action;

    // Kalau tiada action → serve HTML page
    if (!action) {
      return HtmlService.createHtmlOutputFromFile('index')
        .setTitle('Sistem Kursus Staf | ADTEC Kuantan')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    let payload = {};
    if (e.parameter.data) {
      payload = JSON.parse(decodeURIComponent(e.parameter.data));
    }

    let result;
    switch (action) {
      case 'daftar':     result = daftarStaf(payload); break;
      case 'login':      result = loginStaf(payload); break;
      case 'simpan':     result = simpanKursus(payload); break;
      case 'getRekod':   result = getRekodStaf(payload); break;
      case 'getAdmin':   result = getAdminData(); break;
      case 'tambahNama': result = tambahNamaStaf(payload); break;
      default:           result = { ok: true, msg: 'Server berjalan OK.' };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, msg: 'Server error: ' + err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  // Terima POST biasa (fallback)
  try {
    let payload = {};
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    }
    const action = payload.action;

    let result;
    switch (action) {
      case 'daftar':     result = daftarStaf(payload); break;
      case 'login':      result = loginStaf(payload); break;
      case 'simpan':     result = simpanKursus(payload); break;
      case 'getRekod':   result = getRekodStaf(payload); break;
      case 'getAdmin':   result = getAdminData(); break;
      case 'tambahNama': result = tambahNamaStaf(payload); break;
      default:           result = { ok: false, msg: 'Action tidak dikenali.' };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, msg: 'Server error: ' + err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ═══════════════════════════════════════════════
// HELPER: Get or create sheet with headers
// ═══════════════════════════════════════════════
function getSheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (name === SH_STAF) {
      sh.appendRow(['NAMA', 'IC4', 'TARIKH_DAFTAR']);
    } else if (name === SH_LOG) {
      sh.appendRow(['ID','NAMA_STAF','NAMA_SIJIL','TAJUK','KATEGORI',
                    'TARIKH_MULA','TARIKH_TAMAT','JAM','DRIVE_URL','TARIKH_UPLOAD']);
    } else if (name === SH_SENARAI) {
      sh.appendRow(['NAMA']);
    }
    sh.setFrozenRows(1);
  }
  return sh;
}

// ═══════════════════════════════════════════════
// DAFTAR STAF
// ═══════════════════════════════════════════════
function daftarStaf({ nama, ic4 }) {
  if (!nama || !ic4) return { ok: false, msg: 'Data tidak lengkap.' };
  if (ic4.length !== 4) return { ok: false, msg: 'IC4 mesti 4 digit.' };

  const sh = getSheet(SH_STAF);
  const data = sh.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString().toUpperCase() === nama.toUpperCase()) {
      return { ok: false, msg: 'Nama ini sudah didaftarkan. Sila log masuk.' };
    }
  }

  sh.appendRow([nama.toUpperCase(), ic4, new Date().toISOString()]);
  return { ok: true };
}

// ═══════════════════════════════════════════════
// LOGIN STAF
// ═══════════════════════════════════════════════
function loginStaf({ nama, ic4 }) {
  if (!nama || !ic4) return { ok: false, msg: 'Data tidak lengkap.' };

  const sh = getSheet(SH_STAF);
  const data = sh.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString().toUpperCase() === nama.toUpperCase()
        && data[i][1].toString() === ic4) {
      return { ok: true };
    }
  }
  return { ok: false, msg: 'Nama atau kata laluan tidak sepadan.' };
}

// ═══════════════════════════════════════════════
// SIMPAN KURSUS + UPLOAD KE DRIVE
// ═══════════════════════════════════════════════
function simpanKursus({ namaSendiri, namaSijil, tajuk, kategori,
                         tarikhMula, tarikhTamat, jam,
                         fileBase64, fileName, mimeType }) {
  try {
    // 1. Cari/buat subfolder nama staf
    const rootFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    let staffFolder;
    const folders = rootFolder.getFoldersByName(namaSendiri.toUpperCase());
    staffFolder = folders.hasNext() ? folders.next()
                                    : rootFolder.createFolder(namaSendiri.toUpperCase());

    // 2. Upload fail
    let driveUrl = '';
    if (fileBase64) {
      const bytes = Utilities.base64Decode(fileBase64);
      const blob = Utilities.newBlob(bytes, mimeType || 'image/jpeg', fileName || 'sijil.jpg');
      const uploaded = staffFolder.createFile(blob);
      uploaded.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      driveUrl = uploaded.getUrl();
    }

    // 3. Log ke Sheets
    const sh = getSheet(SH_LOG);
    sh.appendRow([
      Utilities.getUuid(),
      namaSendiri.toUpperCase(),
      namaSijil || namaSendiri,
      tajuk, kategori,
      tarikhMula, tarikhTamat,
      parseInt(jam) || 0,
      driveUrl,
      new Date().toISOString()
    ]);

    return { ok: true, driveUrl };
  } catch (err) {
    return { ok: false, msg: 'Gagal menyimpan: ' + err.message };
  }
}

// ═══════════════════════════════════════════════
// GET REKOD STAF
// ═══════════════════════════════════════════════
function getRekodStaf({ nama }) {
  const sh = getSheet(SH_LOG);
  const data = sh.getDataRange().getValues();
  const rekod = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const nm  = row[1].toString().toUpperCase();
    const tgl = row[5].toString();
    if (nm === nama.toUpperCase() && tgl.startsWith(TAHUN)) {
      rekod.push({
        id: row[0], nama: row[1], namaSijil: row[2],
        tajuk: row[3], kategori: row[4],
        tarikhMula: row[5], tarikhTamat: row[6],
        jam: row[7], driveUrl: row[8], tarikhUpload: row[9]
      });
    }
  }

  rekod.sort((a, b) => b.tarikhMula.toString().localeCompare(a.tarikhMula.toString()));
  return { ok: true, data: rekod };
}

// ═══════════════════════════════════════════════
// GET ADMIN DATA
// ═══════════════════════════════════════════════
function getAdminData() {
  const shStaf = getSheet(SH_STAF);
  const shLog  = getSheet(SH_LOG);

  const stafRows = shStaf.getDataRange().getValues();
  const logRows  = shLog.getDataRange().getValues();

  const lookup = {};
  for (let i = 1; i < logRows.length; i++) {
    const row = logRows[i];
    const nm  = row[1].toString().toUpperCase();
    const kat = row[4].toString();
    const jam = parseInt(row[7]) || 0;
    const tgl = row[5].toString();
    if (!tgl.startsWith(TAHUN)) continue;

    if (!lookup[nm]) lookup[nm] = { teknikal:0, bukanTeknikal:0, keselamatan:0, total:0, bilKursus:0 };
    if (kat === 'Teknikal')          lookup[nm].teknikal += jam;
    else if (kat === 'Bukan Teknikal') lookup[nm].bukanTeknikal += jam;
    else if (kat === 'Keselamatan')  lookup[nm].keselamatan += jam;
    lookup[nm].total += jam;
    lookup[nm].bilKursus++;
  }

  const result = [];
  for (let i = 1; i < stafRows.length; i++) {
    const nm = stafRows[i][0].toString().toUpperCase();
    if (!nm) continue;
    const s = lookup[nm] || { teknikal:0, bukanTeknikal:0, keselamatan:0, total:0, bilKursus:0 };
    result.push({ nama: nm, ...s });
  }

  return { ok: true, data: result };
}

// ═══════════════════════════════════════════════
// TAMBAH NAMA STAF (ADMIN)
// ═══════════════════════════════════════════════
function tambahNamaStaf({ nama }) {
  if (!nama) return { ok: false, msg: 'Nama kosong.' };

  const sh = getSheet(SH_SENARAI);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString().toUpperCase() === nama.toUpperCase()) {
      return { ok: false, msg: 'Nama sudah wujud.' };
    }
  }
  sh.appendRow([nama.toUpperCase()]);

  // Tambah juga ke STAF sheet kalau belum ada
  const shStaf = getSheet(SH_STAF);
  // (tidak auto-daftar — staf perlu daftar sendiri)

  return { ok: true };
}
