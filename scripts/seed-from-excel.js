#!/usr/bin/env node
/**
 * seed-from-excel.js
 * Script untuk me-reset dan seed ulang database dari file Excel
 * "BUKU JABATAN & REKAP JABATAN LOWONG.xlsx"
 *
 * Usage: node scripts/seed-from-excel.js
 *
 * CATATAN: Script ini akan menghapus semua data pejabat, jabatan_lowong,
 * dan pejabat_pensiun yang ada, lalu mengisinya kembali dari Excel.
 * Data users (admin/editor/viewer) TIDAK akan dihapus.
 */

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const XLSX = require('xlsx');

const DB_PATH = path.join(__dirname, '..', 'database.sqlite');
const EXCEL_PATH = path.join(__dirname, '..', 'BUKU JABATAN & REKAP JABATAN LOWONG.xlsx');

if (!fs.existsSync(EXCEL_PATH)) {
  console.error('ERROR: File Excel tidak ditemukan:', EXCEL_PATH);
  process.exit(1);
}

if (!fs.existsSync(DB_PATH)) {
  console.error('ERROR: database.sqlite tidak ditemukan. Jalankan server terlebih dahulu untuk membuat database.');
  process.exit(1);
}

console.log('=== Seed Ulang Database dari Excel ===');
console.log('Excel:', EXCEL_PATH);
console.log('DB:', DB_PATH);
console.log('');

const db = new sqlite3.Database(DB_PATH);

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function formatDate(val) {
  if (!val) return null;
  if (typeof val === 'number') {
    // Excel serial date
    const epoch = new Date(1899, 11, 30);
    epoch.setDate(epoch.getDate() + val);
    const d = String(epoch.getDate()).padStart(2, '0');
    const m = String(epoch.getMonth() + 1).padStart(2, '0');
    return `${d}-${m}-${epoch.getFullYear()}`;
  }
  if (val instanceof Date) {
    const d = String(val.getDate()).padStart(2, '0');
    const m = String(val.getMonth() + 1).padStart(2, '0');
    return `${d}-${m}-${val.getFullYear()}`;
  }
  const str = String(val).trim();
  if (!str || str === '-' || str.toLowerCase() === 'null') return null;
  return str;
}

function formatString(val) {
  if (val === undefined || val === null) return null;
  const str = String(val).trim();
  if (!str || str === '-' || str.toLowerCase() === 'null' || str.toLowerCase() === 'nan') return null;
  return str;
}

function formatNumber(val) {
  if (val === undefined || val === null) return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

function parsePejabat(wb) {
  const ws = wb.Sheets['DATA NOMINATIF JABATAN'];
  if (!ws) throw new Error('Sheet DATA NOMINATIF JABATAN tidak ditemukan');
  const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const records = [];
  let currentKd = null;
  let currentOpd = 'PIMPINAN DAERAH';

  for (let i = 3; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;

    const noVal = row[0];
    const kdVal = row[1];
    const nameJabatanVal = row[2];
    const namePejabatVal = row[4];

    const isNoEmpty = noVal === undefined || noVal === null || String(noVal).trim() === '';
    const isPejabatEmpty = namePejabatVal === undefined || namePejabatVal === null || String(namePejabatVal).trim() === '';
    const hasKd = kdVal !== undefined && kdVal !== null && String(kdVal).trim() !== '';
    const hasJabatan = nameJabatanVal !== undefined && nameJabatanVal !== null && String(nameJabatanVal).trim() !== '';

    if (isNoEmpty && isPejabatEmpty && hasKd && hasJabatan) {
      currentKd = String(kdVal).trim();
      currentOpd = String(nameJabatanVal).trim();
      continue;
    }

    const hasNip = row[6] !== undefined && row[6] !== null && String(row[6]).trim() !== '';
    const hasEselon = row[11] !== undefined && row[11] !== null && String(row[11]).trim() !== '';

    if (isPejabatEmpty && !hasNip && !hasEselon) continue;

    let cleanNo = null;
    if (noVal !== undefined && noVal !== null) {
      const parsedNo = parseInt(String(noVal), 10);
      if (!isNaN(parsedNo)) cleanNo = parsedNo;
    }

    const namaJabatanStr = formatString(nameJabatanVal);
    const namaJabatanFung = formatString(row[3]);

    const record = {
      no: cleanNo,
      kd: currentKd,
      opd: currentOpd,
      nama_jabatan_structural: namaJabatanStr,
      nama_jabatan_fungsional: namaJabatanFung,
      nama_jabatan: namaJabatanStr || namaJabatanFung || null,
      nama_pejabat: formatString(namePejabatVal),
      ket_status: formatString(row[5]),
      nip: formatString(row[6]),
      pangkat_gol_tmt: formatString(row[7]),
      pendidikan: formatString(row[8]),
      tmt_jabatan: formatDate(row[9]),
      mkj_terakhir: formatString(row[10]),
      kode_eselon: formatString(row[11]),
      tmt_eselon: formatDate(row[12]),
      mkj_eselon: formatString(row[13]),
      ket: formatString(row[14]),
      agama: formatString(row[15]),
      jk_gender: formatString(row[16]),
      nilai_kinerja: formatString(row[21]),
      kompetensi_teknis: formatNumber(row[22]),
      kompetensi_manajerial: formatNumber(row[23]),
      kompetensi_social_kultural: formatNumber(row[24]),
      kategori: formatString(row[25]),
      tahun_kinerja: formatNumber(row[26]),
      rencana_karir: formatString(row[27]),
      rencana_kompetensi: formatString(row[28]),
      tanggal_lahir: formatDate(row[29]),
      usia: formatString(row[30]),
      tmt_pensiun: formatDate(row[31]),
    };

    records.push(record);
  }
  return records;
}

function parseJabatanLowong(wb) {
  const records = [];
  const sheetLevels = [
    { sheetName: 'Eselon II', level: 'eselon2' },
    { sheetName: 'Eselon III', level: 'eselon3' },
    { sheetName: 'Eselon IV', level: 'eselon4' },
  ];

  for (const { sheetName, level } of sheetLevels) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });
    let currentOpd = '';

    for (let i = 4; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || !row.some(c => c !== null && c !== undefined && c !== '')) continue;

      const noVal = row[0];
      const namaJabatanVal = row[1];
      const eselonVal = row[2];
      const pltVal = row[3];

      if ((noVal === null || noVal === undefined) && namaJabatanVal) {
        const strNama = String(namaJabatanVal).trim();
        if (strNama === strNama.toUpperCase() && !strNama.match(/^\d+$/)) {
          currentOpd = strNama;
          continue;
        }
      }

      if (String(namaJabatanVal || '').toLowerCase().includes('jumlah')) continue;

      const noNum = parseInt(String(noVal), 10);
      if (isNaN(noNum)) continue;

      records.push({
        no: noNum,
        nama_jabatan: String(namaJabatanVal || '').trim(),
        eselon: String(eselonVal || '').trim(),
        plt_nama: pltVal ? String(pltVal).trim() : null,
        opd: currentOpd,
        level,
      });
    }
  }
  return records;
}

function parsePensiun(wb) {
  const ws = wb.Sheets['PENSIUN'];
  if (!ws) return [];
  const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const records = [];
  let currentOpd = '';

  for (let i = 4; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || !row.some(c => c !== null && c !== undefined && c !== '')) continue;

    const noVal = row[0];
    const namaJabatanVal = row[1];

    if ((noVal === null || noVal === undefined) && namaJabatanVal) {
      const strNama = String(namaJabatanVal).trim();
      if (strNama === strNama.toUpperCase() && !strNama.match(/^JUMLAH/i)) {
        currentOpd = strNama;
        continue;
      }
    }

    if (String(namaJabatanVal || '').toLowerCase().includes('jumlah')) continue;

    const noNum = parseInt(String(noVal), 10);
    if (isNaN(noNum)) continue;

    records.push({
      no: noNum,
      nama_jabatan: String(namaJabatanVal || '').trim(),
      eselon: String(row[2] || '').trim(),
      nama_pejabat: String(row[3] || '').trim(),
      keterangan_pensiun: String(row[4] || '').trim(),
      opd: currentOpd,
    });
  }
  return records;
}

async function ensureTables() {
  // Ensure jabatan_lowong table exists
  await dbRun(`
    CREATE TABLE IF NOT EXISTS jabatan_lowong (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      no INTEGER,
      nama_jabatan TEXT NOT NULL,
      eselon TEXT,
      plt_nama TEXT,
      opd TEXT,
      level TEXT
    );
  `);
  // Ensure pejabat_pensiun table exists
  await dbRun(`
    CREATE TABLE IF NOT EXISTS pejabat_pensiun (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      no INTEGER,
      nama_jabatan TEXT,
      eselon TEXT,
      nama_pejabat TEXT,
      keterangan_pensiun TEXT,
      opd TEXT
    );
  `);
}

async function run() {
  try {
    await dbRun('PRAGMA foreign_keys = OFF;');
    await ensureTables();

    // Baca Excel
    console.log('Membaca file Excel...');
    const wb = XLSX.readFile(EXCEL_PATH, { cellDates: true });

    // ─── 1. Reset & seed tabel pejabat ───────────────────────────────────
    console.log('\n[1/3] Mereset tabel pejabat...');
    await dbRun('DELETE FROM pejabat;');
    await dbRun("DELETE FROM sqlite_sequence WHERE name='pejabat';");

    const pejabatRecords = parsePejabat(wb);
    console.log(`     Parsing selesai: ${pejabatRecords.length} records`);

    await dbRun('BEGIN TRANSACTION;');
    const insertPejabat = `
      INSERT INTO pejabat (
        no, kd, opd, nama_jabatan_structural, nama_jabatan_fungsional, nama_jabatan, nama_pejabat,
        ket_status, nip, pangkat_gol_tmt, pendidikan, tmt_jabatan, mkj_terakhir, kode_eselon,
        tmt_eselon, mkj_eselon, ket, agama, jk_gender, nilai_kinerja, kompetensi_teknis,
        kompetensi_manajerial, kompetensi_social_kultural, kategori, tahun_kinerja,
        rencana_karir, rencana_kompetensi, tanggal_lahir, usia, tmt_pensiun
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    for (const r of pejabatRecords) {
      await dbRun(insertPejabat, [
        r.no, r.kd, r.opd, r.nama_jabatan_structural, r.nama_jabatan_fungsional, r.nama_jabatan, r.nama_pejabat,
        r.ket_status, r.nip, r.pangkat_gol_tmt, r.pendidikan, r.tmt_jabatan, r.mkj_terakhir, r.kode_eselon,
        r.tmt_eselon, r.mkj_eselon, r.ket, r.agama, r.jk_gender, r.nilai_kinerja, r.kompetensi_teknis,
        r.kompetensi_manajerial, r.kompetensi_social_kultural, r.kategori, r.tahun_kinerja,
        r.rencana_karir, r.rencana_kompetensi, r.tanggal_lahir, r.usia, r.tmt_pensiun
      ]);
    }
    await dbRun('COMMIT;');
    console.log(`     ✓ ${pejabatRecords.length} pejabat berhasil di-seed`);

    // ─── 2. Reset & seed tabel jabatan_lowong ────────────────────────────
    console.log('\n[2/3] Mereset tabel jabatan_lowong...');
    await dbRun('DELETE FROM jabatan_lowong;');
    await dbRun("DELETE FROM sqlite_sequence WHERE name='jabatan_lowong';");

    const lowongRecords = parseJabatanLowong(wb);
    console.log(`     Parsing selesai: ${lowongRecords.length} records`);

    await dbRun('BEGIN TRANSACTION;');
    for (const r of lowongRecords) {
      await dbRun(
        'INSERT INTO jabatan_lowong (no, nama_jabatan, eselon, plt_nama, opd, level) VALUES (?, ?, ?, ?, ?, ?)',
        [r.no, r.nama_jabatan, r.eselon, r.plt_nama, r.opd, r.level]
      );
    }
    await dbRun('COMMIT;');
    console.log(`     ✓ ${lowongRecords.length} jabatan lowong berhasil di-seed`);

    // ─── 3. Reset & seed tabel pejabat_pensiun ───────────────────────────
    console.log('\n[3/3] Mereset tabel pejabat_pensiun...');
    await dbRun('DELETE FROM pejabat_pensiun;');
    await dbRun("DELETE FROM sqlite_sequence WHERE name='pejabat_pensiun';");

    const pensiunRecords = parsePensiun(wb);
    console.log(`     Parsing selesai: ${pensiunRecords.length} records`);

    await dbRun('BEGIN TRANSACTION;');
    for (const r of pensiunRecords) {
      await dbRun(
        'INSERT INTO pejabat_pensiun (no, nama_jabatan, eselon, nama_pejabat, keterangan_pensiun, opd) VALUES (?, ?, ?, ?, ?, ?)',
        [r.no, r.nama_jabatan, r.eselon, r.nama_pejabat, r.keterangan_pensiun, r.opd]
      );
    }
    await dbRun('COMMIT;');
    console.log(`     ✓ ${pensiunRecords.length} data pensiun berhasil di-seed`);

    // Audit log
    await dbRun(
      "INSERT INTO audit_logs (username, action, details) VALUES ('system', 'RESEED', ?)",
      [`Reseed dari BUKU JABATAN & REKAP JABATAN LOWONG.xlsx: ${pejabatRecords.length} pejabat, ${lowongRecords.length} jabatan lowong, ${pensiunRecords.length} pensiun`]
    );

    console.log('\n=== Seeding Selesai! ===');

    // Ringkasan
    const stats = await dbAll('SELECT kode_eselon, COUNT(*) as cnt FROM pejabat GROUP BY kode_eselon ORDER BY kode_eselon');
    const lowongCount = await dbAll('SELECT level, COUNT(*) as cnt FROM jabatan_lowong GROUP BY level');
    const pensiunCount = await dbAll('SELECT COUNT(*) as cnt FROM pejabat_pensiun');

    console.log('\nRingkasan database:');
    console.log('Pejabat per Eselon:');
    stats.forEach(s => console.log(`  ${s.kode_eselon || 'null'}: ${s.cnt}`));
    console.log('Jabatan Lowong:');
    lowongCount.forEach(l => console.log(`  ${l.level}: ${l.cnt}`));
    console.log(`Pejabat Pensiun: ${pensiunCount[0].cnt}`);

    db.close();
  } catch (err) {
    console.error('\nERROR saat seeding:', err);
    try { await dbRun('ROLLBACK;'); } catch (_) {}
    db.close();
    process.exit(1);
  }
}

run();
