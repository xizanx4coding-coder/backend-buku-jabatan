"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbRun = dbRun;
exports.dbAll = dbAll;
exports.dbGet = dbGet;
exports.initDatabase = initDatabase;
exports.createAuditLog = createAuditLog;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const crypto = __importStar(require("crypto"));
const bcrypt = __importStar(require("bcryptjs"));
const parser_1 = require("./parser");
// ─── Dual-DB Adapter ──────────────────────────────────────────────────────────
// Uses PostgreSQL (Supabase) when DATABASE_URL env is set, otherwise SQLite.
// This lets the same codebase run locally (SQLite) and on Vercel+Supabase (PG).
const USE_PG = true; // Force PG on Vercel
const DB_URL_FALLBACK = "postgresql://postgres.uqoqvgzwsvadpdnwagbe:X1z%40nX171283X4bukujabatan@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";
// ─── PostgreSQL Setup (Supabase) ─────────────────────────────────────────────
let pgPool = null;
if (USE_PG) {
    const { Pool } = require('pg');
    pgPool = new Pool({
        connectionString: process.env.DATABASE_URL || DB_URL_FALLBACK,
        ssl: { rejectUnauthorized: false },
    });
}
// ─── SQLite Setup (Local) ─────────────────────────────────────────────────────
const isGlitch = !!process.env.PROJECT_DOMAIN;
const DB_PATH = isGlitch
    ? path.join(__dirname, '..', '.data', 'database.sqlite')
    : path.join(__dirname, '..', 'database.sqlite');
const EXCEL_PATH = path.join(__dirname, '..', 'BUKU JABATAN & REKAP JABATAN LOWONG.xlsx');
// ─── Unified Query Wrappers ───────────────────────────────────────────────────
/**
 * Converts SQLite-style "?" placeholders to PostgreSQL "$1, $2, ..." style.
 */
function toPostgresSQL(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
}
async function dbRun(sql, params = []) {
    await pgPool.query(toPostgresSQL(sql), params);
}
async function dbAll(sql, params = []) {
    const result = await pgPool.query(toPostgresSQL(sql), params);
    return result.rows;
}
async function dbGet(sql, params = []) {
    const result = await pgPool.query(toPostgresSQL(sql), params);
    return result.rows[0];
}
// ─── Schema Initialisation ────────────────────────────────────────────────────
async function createTables() {
    // audit_logs
    await dbRun(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      username TEXT,
      action TEXT,
      details TEXT,
      timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);
    // users
    await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'editor', 'viewer'))
    );
  `);
    // pejabat
    await dbRun(`
    CREATE TABLE IF NOT EXISTS pejabat (
      id SERIAL PRIMARY KEY,
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
    // jabatan_lowong
    await dbRun(`
    CREATE TABLE IF NOT EXISTS jabatan_lowong (
      id SERIAL PRIMARY KEY,
      no INTEGER,
      nama_jabatan TEXT NOT NULL,
      eselon TEXT,
      plt_nama TEXT,
      opd TEXT,
      level TEXT CHECK(level IN ('eselon2','eselon3','eselon4'))
    );
  `);
    // pejabat_pensiun
    await dbRun(`
    CREATE TABLE IF NOT EXISTS pejabat_pensiun (
      id SERIAL PRIMARY KEY,
      no INTEGER,
      nama_jabatan TEXT,
      eselon TEXT,
      nama_pejabat TEXT,
      keterangan_pensiun TEXT,
      opd TEXT
    );
  `);
}
async function ensurePejabatColumns() {
    if (USE_PG) {
        // PostgreSQL - add columns if not exist
        try {
            await dbRun(`ALTER TABLE pejabat ADD COLUMN IF NOT EXISTS jabatan_plt_plh TEXT;`);
            await dbRun(`ALTER TABLE pejabat ADD COLUMN IF NOT EXISTS status_plt_plh INTEGER DEFAULT 0;`);
        }
        catch (_) { /* ignore */ }
        return;
    }
    // SQLite fallback
    try {
        const tableInfo = await dbAll("PRAGMA table_info(pejabat);");
        const columnNames = tableInfo.map((col) => col.name);
        if (columnNames.length > 0) {
            if (!columnNames.includes('jabatan_plt_plh')) {
                await dbRun('ALTER TABLE pejabat ADD COLUMN jabatan_plt_plh TEXT;');
            }
            if (!columnNames.includes('status_plt_plh')) {
                await dbRun('ALTER TABLE pejabat ADD COLUMN status_plt_plh INTEGER DEFAULT 0;');
            }
        }
    }
    catch (err) {
        console.warn('Failed to check/alter pejabat table columns:', err);
    }
}
async function seedInitialData() {
    // Check if users table already has data
    const existingUser = await dbGet('SELECT id FROM users LIMIT 1');
    if (existingUser) {
        console.log('Database already seeded. Skipping.');
        return;
    }
    console.log('Seeding default user accounts (admin, editor, viewer)...');
    const generatedCredentials = [];
    const seedAccount = async (username, name, role) => {
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
    try {
        fs.writeFileSync(credentialsPath, credentialsText);
        console.log(`Initial account passwords written to ${credentialsPath}`);
    }
    catch (_) {
        // On Vercel/read-only FS, log credentials to console instead
        console.log('=== INITIAL CREDENTIALS (SAVE THESE NOW) ===');
        generatedCredentials.forEach(c => console.log(`  ${c.username} / ${c.password}`));
        console.log('============================================');
    }
    // Seed pejabat from Excel (only applicable in local environment)
    if (fs.existsSync(EXCEL_PATH)) {
        console.log('Parsing Excel spreadsheet for initial seed...');
        const records = (0, parser_1.parseExcelData)(EXCEL_PATH);
        console.log(`Inserting ${records.length} pejabat into database...`);
        await dbRun('BEGIN');
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
            await dbRun('COMMIT');
            console.log('Seeding pejabat selesai.');
            await createAuditLog('system', 'INITIAL_SEED', `Seeded ${records.length} pejabat from Excel`);
        }
        catch (err) {
            console.error('Seeding pejabat gagal. Rolling back.', err);
            await dbRun('ROLLBACK');
        }
        // Seed jabatan lowong
        try {
            const lowongRecords = (0, parser_1.parseJabatanLowong)(EXCEL_PATH);
            console.log(`Inserting ${lowongRecords.length} jabatan lowong...`);
            await dbRun('BEGIN');
            for (const r of lowongRecords) {
                await dbRun('INSERT INTO jabatan_lowong (no, nama_jabatan, eselon, plt_nama, opd, level) VALUES (?, ?, ?, ?, ?, ?)', [r.no, r.nama_jabatan, r.eselon, r.plt_nama, r.opd, r.level]);
            }
            await dbRun('COMMIT');
            console.log('Seeding jabatan lowong selesai.');
        }
        catch (err) {
            console.error('Seeding jabatan lowong gagal:', err);
            await dbRun('ROLLBACK');
        }
        // Seed pensiun
        try {
            const pensiunRecords = (0, parser_1.parsePensiun)(EXCEL_PATH);
            console.log(`Inserting ${pensiunRecords.length} data pensiun...`);
            await dbRun('BEGIN');
            for (const r of pensiunRecords) {
                await dbRun('INSERT INTO pejabat_pensiun (no, nama_jabatan, eselon, nama_pejabat, keterangan_pensiun, opd) VALUES (?, ?, ?, ?, ?, ?)', [r.no, r.nama_jabatan, r.eselon, r.nama_pejabat, r.keterangan_pensiun, r.opd]);
            }
            await dbRun('COMMIT');
            console.log('Seeding data pensiun selesai.');
        }
        catch (err) {
            console.error('Seeding pensiun gagal:', err);
            await dbRun('ROLLBACK');
        }
    }
    else {
        console.warn('Excel file not found for initial seeding. Created empty tables.');
    }
}
async function initDatabase() {
    console.log('Using PostgreSQL (Supabase)...');
    await createTables();
    await ensurePejabatColumns();
    await seedInitialData();
}
async function createAuditLog(username, action, details) {
    try {
        await dbRun('INSERT INTO audit_logs (username, action, details) VALUES (?, ?, ?)', [username || 'unknown', action, details]);
    }
    catch (err) {
        console.error('Failed to write audit log:', err);
    }
}
