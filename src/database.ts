import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { parseExcelData, parseJabatanLowong, parsePensiun, PejabatRecord } from './parser';

const isGlitch = !!process.env.PROJECT_DOMAIN;
const DB_PATH = isGlitch 
  ? path.join(__dirname, '..', '.data', 'database.sqlite')
  : path.join(__dirname, '..', 'database.sqlite');
const EXCEL_PATH = path.join(__dirname, '..', 'BUKU JABATAN & REKAP JABATAN LOWONG.xlsx');

export let db: sqlite3.Database;

// Promise-based wrappers for SQL queries
export function dbRun(sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function dbAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
}

export function dbGet<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T | undefined);
    });
  });
}

export async function initDatabase(): Promise<void> {
  const dbExists = fs.existsSync(DB_PATH);
  
  db = new sqlite3.Database(DB_PATH);
  
  // Enable foreign keys
  await dbRun('PRAGMA foreign_keys = ON;');

  // Always ensure audit_logs table exists
  await dbRun(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      action TEXT,
      details TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Ensure pejabat table has PLT/PLH columns if it exists
  try {
    const tableInfo = await dbAll("PRAGMA table_info(pejabat);");
    const columnNames = tableInfo.map((col: any) => col.name);
    if (columnNames.length > 0) {
      if (!columnNames.includes('jabatan_plt_plh')) {
        await dbRun('ALTER TABLE pejabat ADD COLUMN jabatan_plt_plh TEXT;');
        console.log('Added column jabatan_plt_plh to pejabat table.');
      }
      if (!columnNames.includes('status_plt_plh')) {
        await dbRun('ALTER TABLE pejabat ADD COLUMN status_plt_plh INTEGER DEFAULT 0;');
        console.log('Added column status_plt_plh to pejabat table.');
      }
    }
  } catch (err) {
    console.warn('Failed to check/alter pejabat table columns:', err);
  }

  if (!dbExists) {
    console.log('Database file not found. Creating database.sqlite and seeding initial data...');
    
    // Create users table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT CHECK(role IN ('admin', 'editor', 'viewer')) NOT NULL
      );
    `);

    // Create pejabat table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS pejabat (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        no INTEGER,
        kd TEXT,
        opd TEXT NOT NULL,
        nama_jabatan_structural TEXT,
        nama_jabatan_fungsional TEXT,
        nama_jabatan TEXT,
        nama_pejabat TEXT,
        ket_status TEXT,
        nip TEXT,
        pangkat_gol_tmt TEXT,
        pendidikan TEXT,
        tmt_jabatan TEXT,
        mkj_terakhir TEXT,
        kode_eselon TEXT,
        tmt_eselon TEXT,
        mkj_eselon TEXT,
        ket TEXT,
        agama TEXT,
        jk_gender TEXT,
        nilai_kinerja TEXT,
        kompetensi_teknis INTEGER,
        kompetensi_manajerial INTEGER,
        kompetensi_social_kultural INTEGER,
        kategori TEXT,
        tahun_kinerja INTEGER,
        rencana_karir TEXT,
        rencana_kompetensi TEXT,
        tanggal_lahir TEXT,
        usia TEXT,
        tmt_pensiun TEXT,
        jabatan_plt_plh TEXT,
        status_plt_plh INTEGER DEFAULT 0
      );
    `);

    // Create jabatan_lowong table (from Eselon II, III, IV sheets)
    await dbRun(`
      CREATE TABLE IF NOT EXISTS jabatan_lowong (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        no INTEGER,
        nama_jabatan TEXT NOT NULL,
        eselon TEXT,
        plt_nama TEXT,
        opd TEXT,
        level TEXT CHECK(level IN ('eselon2','eselon3','eselon4'))
      );
    `);

    // Create pejabat_pensiun table (from PENSIUN sheet)
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

    // Seed default accounts with randomly generated passwords (never hardcoded/well-known)
    console.log('Seeding default user accounts (admin, editor, viewer)...');
    const generatedCredentials: { username: string; password: string }[] = [];
    const seedAccount = async (username: string, name: string, role: 'admin' | 'editor' | 'viewer') => {
      const password = crypto.randomBytes(9).toString('base64url');
      const hash = bcrypt.hashSync(password, 10);
      await dbRun('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)', [username, hash, name, role]);
      generatedCredentials.push({ username, password });
    };

    await seedAccount('admin', 'Administrator BKPSDM', 'admin');
    await seedAccount('editor', 'Editor Data Pegawai', 'editor');
    await seedAccount('viewer', 'Viewer Pegawai', 'viewer');

    const credentialsPath = path.join(__dirname, '..', 'INITIAL_CREDENTIALS.txt');
    const credentialsText = [
      'Buku Nominatif Jabatan - initial account credentials',
      'Generated once at first database setup. Log in and note these down now,',
      'then delete this file. These are not recoverable once removed.',
      '',
      ...generatedCredentials.map(c => `${c.username} / ${c.password}`),
      ''
    ].join('\n');
    fs.writeFileSync(credentialsPath, credentialsText);
    console.log(`Initial account passwords written to ${credentialsPath} — read them now and delete the file.`);

    // Seed pejabat from Excel
    if (fs.existsSync(EXCEL_PATH)) {
      console.log('Parsing Excel spreadsheet for initial seed...');
      const records = parseExcelData(EXCEL_PATH);
      console.log(`Inserting ${records.length} pejabat into database...`);

      await dbRun('BEGIN TRANSACTION;');
      const insertSql = `
        INSERT INTO pejabat (
          no, kd, opd, nama_jabatan_structural, nama_jabatan_fungsional, nama_jabatan, nama_pejabat,
          ket_status, nip, pangkat_gol_tmt, pendidikan, tmt_jabatan, mkj_terakhir, kode_eselon,
          tmt_eselon, mkj_eselon, ket, agama, jk_gender, nilai_kinerja, kompetensi_teknis,
          kompetensi_manajerial, kompetensi_social_kultural, kategori, tahun_kinerja,
          rencana_karir, rencana_kompetensi, tanggal_lahir, usia, tmt_pensiun
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      try {
        for (const r of records) {
          await dbRun(insertSql, [
            r.no, r.kd, r.opd, r.nama_jabatan_structural, r.nama_jabatan_fungsional, r.nama_jabatan, r.nama_pejabat,
            r.ket_status, r.nip, r.pangkat_gol_tmt, r.pendidikan, r.tmt_jabatan, r.mkj_terakhir, r.kode_eselon,
            r.tmt_eselon, r.mkj_eselon, r.ket, r.agama, r.jk_gender, r.nilai_kinerja, r.kompetensi_teknis,
            r.kompetensi_manajerial, r.kompetensi_social_kultural, r.kategori, r.tahun_kinerja,
            r.rencana_karir, r.rencana_kompetensi, r.tanggal_lahir, r.usia, r.tmt_pensiun
          ]);
        }
        await dbRun('COMMIT;');
        console.log('Seeding pejabat selesai.');
        await createAuditLog('system', 'INITIAL_SEED', `Seeded ${records.length} pejabat from Excel`);
      } catch (err) {
        console.error('Seeding pejabat gagal. Rolling back.', err);
        await dbRun('ROLLBACK;');
      }

      // Seed jabatan lowong
      try {
        const lowongRecords = parseJabatanLowong(EXCEL_PATH);
        console.log(`Inserting ${lowongRecords.length} jabatan lowong...`);
        await dbRun('BEGIN TRANSACTION;');
        for (const r of lowongRecords) {
          await dbRun(
            'INSERT INTO jabatan_lowong (no, nama_jabatan, eselon, plt_nama, opd, level) VALUES (?, ?, ?, ?, ?, ?)',
            [r.no, r.nama_jabatan, r.eselon, r.plt_nama, r.opd, r.level]
          );
        }
        await dbRun('COMMIT;');
        console.log('Seeding jabatan lowong selesai.');
      } catch (err) {
        console.error('Seeding jabatan lowong gagal:', err);
        await dbRun('ROLLBACK;');
      }

      // Seed pensiun
      try {
        const pensiunRecords = parsePensiun(EXCEL_PATH);
        console.log(`Inserting ${pensiunRecords.length} data pensiun...`);
        await dbRun('BEGIN TRANSACTION;');
        for (const r of pensiunRecords) {
          await dbRun(
            'INSERT INTO pejabat_pensiun (no, nama_jabatan, eselon, nama_pejabat, keterangan_pensiun, opd) VALUES (?, ?, ?, ?, ?, ?)',
            [r.no, r.nama_jabatan, r.eselon, r.nama_pejabat, r.keterangan_pensiun, r.opd]
          );
        }
        await dbRun('COMMIT;');
        console.log('Seeding data pensiun selesai.');
      } catch (err) {
        console.error('Seeding pensiun gagal:', err);
        await dbRun('ROLLBACK;');
      }
    } else {
      console.warn('Excel file not found for initial seeding. Created empty tables.');
    }
  } else {
    console.log('database.sqlite verified.');
  }
}

export async function createAuditLog(username: string, action: string, details: string): Promise<void> {
  try {
    await dbRun(
      'INSERT INTO audit_logs (username, action, details) VALUES (?, ?, ?)',
      [username || 'unknown', action, details]
    );
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
