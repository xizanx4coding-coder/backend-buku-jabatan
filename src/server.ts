import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import * as path from 'path';
import * as fs from 'fs';
import * as bcrypt from 'bcryptjs';
import * as XLSX from 'xlsx';
import { initDatabase, dbGet, dbAll, dbRun, createAuditLog } from './database';
import { PejabatRecord } from './parser';
import { generateToken, authenticateToken, optionalAuth, requireRole, AuthenticatedRequest } from './auth';

// Fields that are only returned to authenticated users. NIP in particular doubles as a
// login identifier elsewhere in the system and must never be exposed to anonymous callers.
const RESTRICTED_FIELDS = [
  'nip', 'tanggal_lahir', 'agama', 'kompetensi_teknis', 'kompetensi_manajerial',
  'kompetensi_social_kultural', 'nilai_kinerja', 'kategori', 'rencana_karir', 'rencana_kompetensi'
] as const;

function redactForAnonymous<T extends Record<string, any>>(record: T): T {
  const copy: Record<string, any> = { ...record };
  for (const field of RESTRICTED_FIELDS) {
    delete copy[field];
  }
  return copy as T;
}

const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors());
app.use(express.json());


// Kode eselon standar yang diakui oleh Buku Nominatif Jabatan
const VALID_ESELON_CODES = new Set(['1A', '1B', '2A', '2B', '3A', '3B', '4A', '4B']);

function convertEselonToLocal(es: string | null | undefined): string | null {
  if (!es) return null;
  // Normalisasi: ganti titik atau spasi menjadi slash, lalu uppercase
  const clean = es.trim().toUpperCase().replace(/\./g, '/').replace(/\s+/g, '');
  // Romawi I
  if (clean === 'I/A') return '1A';
  if (clean === 'I/B') return '1B';
  // Romawi II
  if (clean === 'II/A') return '2A';
  if (clean === 'II/B') return '2B';
  // Romawi III
  if (clean === 'III/A') return '3A';
  if (clean === 'III/B') return '3B';
  // Romawi IV
  if (clean === 'IV/A') return '4A';
  if (clean === 'IV/B') return '4B';
  // Sudah dalam format angka (misal 2A, 3B)
  if (VALID_ESELON_CODES.has(clean)) return clean;
  // Format tidak dikenal (NON, -, dll) — kembalikan null
  return null;
}

// Daftar referensi OPD utama untuk pemetaan kode (kd) dan nama lokal (opd)
const OPD_MAPPING = [
  { kd: 'BKPSDM', match: ['kepegawaian', 'bkpsdm'], localName: '15. BADAN KEPEGAWAIAN DAN PENGEMBANGAN SUMBER DAYA MANUSIA' },
  { kd: 'BKBP', match: ['kesatuan bangsa', 'kesbang'], localName: '13. BADAN KESATUAN BANGSA DAN POLITIK' },
  { kd: 'BKAD', match: ['keuangan dan aset', 'bkad'], localName: '26. BADAN KEUANGAN DAN ASET DAERAH' },
  { kd: 'BPBD', match: ['penanggulangan bencana', 'bpbd'], localName: '13. BADAN PENANGGULANGAN BENCANA DAERAH' },
  { kd: 'BPD', match: ['pendapatan daerah', 'bapenda'], localName: '27. BADAN PENDAPATAN DAERAH' },
  { kd: 'BAPERIDA', match: ['perencanaan pembangunan', 'baperida', 'bappeda', 'riset dan inovasi'], localName: '25. BADAN PERENCANAAN PEMBANGUNAN, RISET DAN INOVASI DAERAH' },
  { kd: 'CAPIL', match: ['kependudukan', 'pencatatan sipil', 'capil'], localName: '14. DINAS KEPENDUDUKAN DAN PENCATATAN SIPIL' },
  { kd: 'DINKES', match: ['kesehatan'], localName: '5. UPTD. PUSKESMAS PADA DINAS KESEHATAN' },
  { kd: 'DKPTPH', match: ['ketahanan pangan', 'tanaman pangan', 'hortikultura', 'dkptph'], localName: '21. DINAS KETAHANAN PANGAN, TANAMAN PANGAN DAN HORTIKULTURA' },
  { kd: 'KOMINFO', match: ['komunikasi', 'informatika', 'kominfo'], localName: '18. DINAS KOMUNIKASI DAN INFORMATIKA' },
  { kd: 'UMKM', match: ['koperasi', 'ukm', 'industri', 'dagang', 'diskoperindag', 'perindustrian'], localName: '17. DINAS KOPERASI, UKM, PERINDUSTRIAN DAN PERDAGANGAN' },
  { kd: 'LH', match: ['lingkungan hidup', 'dlh'], localName: '21. DINAS LINGKUNGAN HIDUP' },
  { kd: 'DISPAREKRAF', match: ['pariwisata', 'ekonomi kreatif', 'dispar'], localName: '17. DINAS PARIWISATA DAN EKONOMI KREATIF' },
  { kd: 'PUPR', match: ['pekerjaan umum', 'perumahan rakyat', 'pupr'], localName: '9. DINAS PEKERJAAN UMUM DAN PERUMAHAN RAKYAT' },
  { kd: 'DAMKR', match: ['pemadam', 'penyelamatan', 'damkar'], localName: '12. DINAS PEMADAM KEBAKARAN DAN PENYELAMATAN' },
  { kd: 'PMD', match: ['pemberdayaan masyarakat', 'pmd'], localName: '17. DINAS PEMBERDAYAAN MASYARAKAT DAN DESA' },
  { kd: 'DP3AP2KB', match: ['pemberdayaan perempuan', 'perlindungan anak', 'dp3ap2kb', 'keluarga berencana'], localName: '21. DINAS PEMBERDAYAAN PEREMPUAN, PERLINDUNGAN ANAK, PENGENDALIAN PENDUDUK DAN KELUARGA BERENCANA' },
  { kd: 'PORA', match: ['pemuda dan olah', 'pora', 'dispora', 'olahraga', 'olah raga'], localName: '16. DINAS PEMUDA DAN OLAH RAGA' },
  { kd: 'DPMPTSP', match: ['penanaman modal', 'dpmptsp', 'perizinan'], localName: '11. DINAS PENANAMAN MODAL DAN PELAYANAN TERPADU SATU PINTU' },
  { kd: 'DISDIKBUD', match: ['pendidikan', 'kebudayaan', 'disdik'], localName: '7. DINAS PENDIDIKAN DAN KEBUDAYAAN' },
  { kd: 'DISHUB', match: ['perhubungan', 'dishub'], localName: '13. DINAS PERHUBUNGAN' },
  { kd: 'PERIKANAN', match: ['perikanan'], localName: '17. DINAS PERIKANAN' },
  { kd: 'BUNAK', match: ['perkebunan', 'peternakan', 'disbunnak'], localName: '2. UPTD. PADA DINAS PERKEBUNAN DAN PETERNAKAN' },
  { kd: 'PERPUS', match: ['perpustakaan', 'kearsipan', 'perpus'], localName: '14. DINAS PERPUSTAKAAN DAN KEARSIPAN DAERAH' },
  { kd: 'DINSOS', match: ['sosial', 'dinsos'], localName: '17. DINAS SOSIAL' },
  { kd: 'NAKER', match: ['tenaga kerja', 'disnaker', 'ketenagakerjaan'], localName: '11. DINAS TENAGA KERJA' },
  { kd: 'INSPKT', match: ['inspektorat'], localName: '10. INSPEKTORAT DAERAH' },
  { kd: 'POLPP', match: ['polisi pamong', 'satpol', 'pol pp'], localName: '17. SATUAN POLISI PAMONG PRAJA' },
  { kd: 'DPRD', match: ['sekretariat dewan', 'sekretariat dprd', 'dprd', 'dewan perwakilan'], localName: 'SEKRETARIAT DEWAN PERWAKILAN RAKYAT DAERAH' },
  { kd: 'RSUD', match: ['batin mangunang', 'rsud'], localName: '14. RUMAH SAKIT UMUM DAERAH BATIN MANGUNANG' },
  // Sekretariat Daerah (harus di-check TERAKHIR karena bisa overlap dengan unit induk lain)
  { kd: 'SETDA', match: ['sekretariat daerah', 'setda', 'pemerintah kab'], localName: '1. SEKRETARIAT DAERAH' },
];

// Daftar kecamatan dengan kode spesifik
const KECAMATAN_MAPPING: Record<string, string> = {
  'air naningan': 'AIR. N',
  'bandar negeri': 'BNS',
  'bulok': 'BULOK',
  'cukuh balak': 'C.BALAK',
  'gisting': 'GISTING',
  'gunung alip': 'G.ALIP',
  'kelumbayan barat': 'KLMBAR',
  'kelumbayan': 'KLMBYN',
  'kota agung barat': 'KOBAR',
  'kota agung timur': 'KOTIM',
  'kota agung': 'KOTA AGUNG',
  'limau': 'LIMAU',
  'pematang sawa': 'P.SAWA',
  'pugung': 'PUGUNG',
  'pulau panggung': 'PULPA',
  'semaka': 'SEMAKA',
  'sumberejo': 'SUMBEREJO',
  'talang padang': 'TLPD',
  'ulu belu': 'UBL',
  'wonosobo': 'WNSB',
};

function matchOPD(unitKerjaInduk: string, unitKerjaSpesifik: string): { opd: string, kd: string } {
  const textToSearch = `${unitKerjaInduk} ${unitKerjaSpesifik}`.toLowerCase();
  
  // 1. Cek kecamatan terlebih dahulu (lebih spesifik)
  if (textToSearch.includes('kecamatan')) {
    for (const [namaKec, kdKec] of Object.entries(KECAMATAN_MAPPING)) {
      if (textToSearch.includes(namaKec)) {
        return { opd: `KECAMATAN ${namaKec.toUpperCase()}`, kd: kdKec };
      }
    }
    // Fallback kecamatan: ambil semua kata sesudah "kecamatan"
    const match = textToSearch.match(/kecamatan\s+([a-z\s]+?)(?:\s+kabupaten|\s+kab\.?|$)/);
    if (match) {
      const namaKec = match[1].trim().toUpperCase();
      const kdKec = namaKec.replace(/\s+/g, '').substring(0, 8).toUpperCase();
      return { opd: `KECAMATAN ${namaKec}`, kd: kdKec };
    }
  }
  
  // 2. Cari di mapping OPD utama
  for (const m of OPD_MAPPING) {
    if (m.match.some(keyword => textToSearch.includes(keyword))) {
      return { opd: m.localName, kd: m.kd };
    }
  }

  // 3. Fallback default ke SETDA jika tidak dikenali sama sekali
  const fallbackName = unitKerjaInduk || unitKerjaSpesifik || '';
  return { 
    opd: fallbackName || '1. SEKRETARIAT DAERAH', 
    kd: fallbackName ? fallbackName.replace(/\s+/g, '').substring(0, 6).toUpperCase() : 'SETDA'
  };
}

function getJenjangFungsional(namaJabatan: string, golongan: string): string {
  const cleanJabatan = (namaJabatan || '').toLowerCase();
  const cleanGol = (golongan || '').trim();

  if (cleanJabatan.includes('ahli pertama')) return 'Ahli Pertama';
  if (cleanJabatan.includes('ahli muda')) return 'Ahli Muda';
  if (cleanJabatan.includes('ahli madya')) return 'Ahli Madya';
  if (cleanJabatan.includes('ahli utama')) return 'Ahli Utama';
  if (cleanJabatan.includes('pemula')) return 'Pemula';
  if (cleanJabatan.includes('terampil')) return 'Terampil';
  if (cleanJabatan.includes('mahir')) return 'Mahir';
  if (cleanJabatan.includes('penyelia')) return 'Penyelia';

  // Fallback based on Golongan for Fungsional
  if (cleanGol === 'II/a' || cleanGol === 'II/b') return 'Pemula';
  if (cleanGol === 'II/c' || cleanGol === 'II/d') return 'Terampil';
  
  if (cleanGol === 'III/a' || cleanGol === 'III/b') {
    return 'Ahli Pertama';
  }
  if (cleanGol === 'III/c' || cleanGol === 'III/d') {
    return 'Ahli Muda';
  }
  if (cleanGol === 'IV/a' || cleanGol === 'IV/b') {
    return 'Ahli Madya';
  }
  if (cleanGol === 'IV/c' || cleanGol === 'IV/d' || cleanGol === 'IV/e') {
    return 'Ahli Utama';
  }

  return 'Fungsional Umum / Pelaksana';
}

function mapBegawiToPejabat(p: any): any {
  const jk = p.jenis_kelamin;
  let jk_gender = 'Laki-Laki';
  if (jk) {
    if (jk.toUpperCase() === 'F' || jk.toLowerCase().includes('perempuan') || jk.toLowerCase() === 'p') {
      jk_gender = 'Perempuan';
    } else if (jk.toUpperCase() === 'M' || jk.toLowerCase().includes('laki') || jk.toLowerCase() === 'l') {
      jk_gender = 'Laki-Laki';
    }
  }

  // Pemetan unit kerja cerdas (OPD)
  const { opd, kd } = matchOPD(p.unit_kerja_induk || '', p.unit_kerja || '');

  // Hitung usia
  let usia = '';
  if (p.tanggal_lahir) {
    const birthYear = new Date(p.tanggal_lahir).getFullYear();
    if (!isNaN(birthYear)) {
      usia = String(new Date().getFullYear() - birthYear);
    }
  }

  // Deteksi pengecualian jabatan fungsional (Exclusion list)
  const namaJabatanStr = p.jabatan_nama || p.nama_jabatan || p.jabatan_fungsional_nama || p.jabatan_fu_nama || p.jabatanNama || '';
  const activeJabLower = namaJabatanStr.toLowerCase();
  const isExcluded = 
    activeJabLower.includes('guru') || 
    activeJabLower.includes('kepala sd') || 
    activeJabLower.includes('kepala smp') || 
    activeJabLower.includes('kepala tk') || 
    activeJabLower.includes('kepala sekolah') || 
    activeJabLower.includes('pengawas sekolah') ||
    activeJabLower.includes('dokter') ||
    activeJabLower.includes('perawat') ||
    (activeJabLower.includes('bidan') && !activeJabLower.includes('bidang')) ||
    activeJabLower.includes('puskesmas');

  const ja1 = String(p.jenis_jabatan || '').trim();
  const ja1Lower = ja1.toLowerCase();
  const isCurrentlyStruktural = ja1 === '1' || ja1Lower.includes('structural') || ja1Lower.includes('struktural');

  // Deteksi Eselon dengan fallback lengkap
  let computedEselon: string | null = null;
  const isStructural = isCurrentlyStruktural && !isExcluded;

  // Pelaksana detection
  const isPelaksana = 
    ja1 === '4' || 
    ja1Lower.includes('fungsional_umum') || 
    activeJabLower.includes('pelaksana') || 
    activeJabLower.includes('jfu');

  if (isStructural) {
    if (p.eselon && p.eselon.trim() && p.eselon !== 'NON' && !p.eselon.toLowerCase().includes('non')) {
      const cleanEs = p.eselon.trim();
      if (cleanEs === 'II') {
        computedEselon = '2B';
      } else if (cleanEs === 'III') {
        computedEselon = '3B';
      } else if (cleanEs === 'IV') {
        computedEselon = '4B';
      } else {
        computedEselon = convertEselonToLocal(cleanEs);
      }
    }

    // Fallback Golongan
    if (!computedEselon) {
      const gol = p.golongan_ruang || p.pangkat_gol_tmt || '';
      if (gol.startsWith('IV/d') || gol.startsWith('IV/e')) {
        computedEselon = '2A';
      } else if (gol.startsWith('IV/c')) {
        computedEselon = '2B';
      } else if (gol.startsWith('IV/b')) {
        computedEselon = '3A';
      } else if (gol.startsWith('IV/a')) {
        computedEselon = '3B';
      } else if (gol.startsWith('III/d') || gol.startsWith('III/c')) {
        computedEselon = '4A';
      } else {
        computedEselon = '4B';
      }
    }
  } else if (isPelaksana) {
    // Exclude Pelaksana from JF (eselon remains null, which gets ignored as Pelaksana)
    computedEselon = null;
  } else {
    // Non-struktural and non-pelaksana is Jabatan Fungsional (JF)
    computedEselon = 'JF';
  }

  // Deteksi status jabatan definitif, PLT, atau PLH dari jenis_penugasan_id (API) atau nama jabatan
  let statusJabatan: 'Definitif' | 'PLT' | 'PLH' = 'Definitif';
  
  if (p.jenis_penugasan_id === 'PLT') {
    statusJabatan = 'PLT';
  } else if (p.jenis_penugasan_id === 'PLH') {
    statusJabatan = 'PLH';
  } else if (activeJabLower.includes('plt') || activeJabLower.includes('pelaksana tugas')) {
    statusJabatan = 'PLT';
  } else if (activeJabLower.includes('plh') || activeJabLower.includes('pelaksana harian')) {
    statusJabatan = 'PLH';
  }

  const pGol = p.golongan_ruang || p.pangkat_gol_tmt || '';

  return {
    id: p.id,
    nip: p.nip,
    nama_pejabat: p.nama,
    nama_jabatan: namaJabatanStr || '-',
    nama_jabatan_structural: isStructural ? namaJabatanStr : null,
    nama_jabatan_fungsional: !isStructural ? namaJabatanStr : null,
    opd: opd,
    kd: kd,
    jk_gender: jk_gender,
    pangkat_gol_tmt: pGol,
    pendidikan: p.pendidikan_terakhir || p.pendidikan || '',
    ket_status: statusJabatan,
    kode_eselon: computedEselon,
    jenjang_fungsional: !isStructural ? getJenjangFungsional(namaJabatanStr, pGol) : null,
    agama: p.agama || '',
    tanggal_lahir: p.tanggal_lahir || '',
    usia: usia,
    tmt_jabatan: p.tmt_jabatan || '',
    nilai_kinerja: p.nilai_kinerja || '85',
    kompetensi_teknis: p.kompetensi_teknis || 80,
    kompetensi_manajerial: p.kompetensi_manajerial || 80,
    kompetensi_social_kultural: p.kompetensi_social_kultural || 80,
    kategori: p.kategori || 'Sangat Baik',
    tahun_kinerja: p.tahun_kinerja || new Date().getFullYear(),
    jabatan_plt_plh: p.jabatan_plt_plh || null,
    status_plt_plh: p.status_plt_plh || 0
  };
}

const CACHE_FILE_PATH = path.join(__dirname, '..', 'scratch', 'cached_begawi_pegawai.json');
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes cache
let isRefreshing = false;

async function fetchAllPegawaiFromBegawi(): Promise<any[]> {
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      const stats = fs.statSync(CACHE_FILE_PATH);
      const age = Date.now() - stats.mtimeMs;
      if (age < CACHE_DURATION) {
        const cachedRaw = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
        return JSON.parse(cachedRaw);
      }
    }
  } catch (cacheReadErr) {
    console.warn('Gagal membaca cache file:', cacheReadErr);
  }

  const hasCacheFile = fs.existsSync(CACHE_FILE_PATH);
  if (hasCacheFile) {
    triggerBackgroundRefresh();
    try {
      const cachedRaw = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
      return JSON.parse(cachedRaw);
    } catch (err) {
      // ignore
    }
  }

  return performBlockingFetch();
}

function triggerBackgroundRefresh() {
  if (isRefreshing) return;
  isRefreshing = true;
  console.log('Memulai sinkronisasi background data Begawi-ASN...');
  performBlockingFetch()
    .then(() => {
      console.log('Sinkronisasi background data Begawi-ASN selesai.');
    })
    .catch(err => {
      console.error('Sinkronisasi background data Begawi-ASN gagal:', err);
    })
    .finally(() => {
      isRefreshing = false;
    });
}

async function performBlockingFetch(): Promise<any[]> {
  const allData: any[] = [];
  let page = 1;
  const perPage = 50;
  let hasMore = true;

  const baseUrl = `${process.env.INTEGRATION_BEGAWI_URL || 'http://localhost:3000'}/api/v1/integration/pegawai`;
  const apiKey = process.env.INTEGRATION_BEGAWI_API_KEY || '';

  while (hasMore) {
    try {
      const url = `${baseUrl}?page=${page}&per_page=${perPage}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey
        }
      });

      if (!response.ok) {
        console.error(`Gagal mengambil data Begawi pada halaman ${page}: status ${response.status}`);
        break;
      }

      const json = await response.json() as any;
      if (json.status === 'success' && Array.isArray(json.data)) {
        allData.push(...json.data);
        
        const meta = json.meta;
        if (meta && meta.page < meta.total_pages) {
          page++;
        } else {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    } catch (err) {
      console.error(`Error saat fetch Begawi page ${page}:`, err);
      break;
    }
  }

  if (allData.length > 0) {
    try {
      fs.mkdirSync(path.dirname(CACHE_FILE_PATH), { recursive: true });
      fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(allData), 'utf-8');
      console.log(`Cache file baru disimpan dengan ${allData.length} records.`);
    } catch (writeErr) {
      console.warn('Gagal menulis cache file:', writeErr);
    }
  }

  return allData;
}

// Serve dashboard static files (moved to bottom to allow dynamic API routes to take precedence)

// AUTH: Login
app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi.' });
  }

  try {
    const user = await dbGet<any>('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      return res.status(401).json({ error: 'Username atau password salah.' });
    }

    const passwordMatch = bcrypt.compareSync(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Username atau password salah.' });
    }

    const token = generateToken({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    });

    res.json({
      token,
      user: {
        username: user.username,
        name: user.name,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Terjadi kesalahan pada server saat login.' });
  }
});

// API: Get all pejabat with search & filters (SQLite database or dynamic integration)
app.get('/api/pejabat', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { search, opd, eselon, status, gender, page = '1', limit = '1000', category } = req.query;
  
  // Dynamic integration path
  if (process.env.INTEGRATION_BEGAWI_ENABLED === 'true') {
    try {
      const dataPegawai = await fetchAllPegawaiFromBegawi();
      let mappedList = dataPegawai.map(mapBegawiToPejabat);

      // Apply in-memory filters
      // 1. OPD Filter
      if (opd) {
        mappedList = mappedList.filter((p: any) => p.opd === opd || p.kd === opd);
      }

      // 2. Eselon & Category Filter
      if (category === 'fungsional' || eselon === 'JF') {
        mappedList = mappedList.filter((p: any) => p.kode_eselon === 'JF');
      } else if (category === 'structural') {
        mappedList = mappedList.filter((p: any) => p.kode_eselon && VALID_ESELON_CODES.has(p.kode_eselon));
      } else if (category === 'all') {
        mappedList = mappedList.filter((p: any) => p.kode_eselon === 'JF' || (p.kode_eselon && VALID_ESELON_CODES.has(p.kode_eselon)));
      } else {
        if (eselon) {
          if (eselon === '-') {
            mappedList = mappedList.filter((p: any) => !p.kode_eselon || p.kode_eselon === '-');
          } else {
            mappedList = mappedList.filter((p: any) => p.kode_eselon === eselon);
          }
        } else {
          // Default: show structural
          mappedList = mappedList.filter((p: any) => p.kode_eselon && VALID_ESELON_CODES.has(p.kode_eselon));
        }
      }

      // 3. Status Filter
      if (status) {
        if (status === 'Lowong') {
          mappedList = mappedList.filter((p: any) => p.nama_pejabat === 'LOWONG');
        } else {
          mappedList = mappedList.filter((p: any) => p.nama_pejabat !== 'LOWONG' && p.ket_status === status);
        }
      }

      // 4. Gender Filter
      if (gender) {
        mappedList = mappedList.filter((p: any) => p.jk_gender === gender);
      }

      // 5. Search Filter (name, NIP, or jabatan)
      if (search) {
        const q = (search as string).toLowerCase().trim();
        mappedList = mappedList.filter((p: any) => 
          (p.nama_pejabat && p.nama_pejabat.toLowerCase().includes(q)) ||
          (p.nama_jabatan && p.nama_jabatan.toLowerCase().includes(q)) ||
          (p.nip && p.nip.replace(/\s+/g, '').includes(q.replace(/\s+/g, '')))
        );
      }

      // Apply local pagination
      const pPage = parseInt(page as string, 10);
      const pLimit = parseInt(limit as string, 10);
      const startIndex = (pPage - 1) * pLimit;
      const paginatedList = mappedList.slice(startIndex, startIndex + pLimit);

      return res.json({
        total: mappedList.length,
        page: pPage,
        limit: pLimit,
        pages: Math.ceil(mappedList.length / pLimit),
        data: req.user ? paginatedList : paginatedList.map(redactForAnonymous)
      });
    } catch (integrationErr) {
      console.warn('Gagal mengambil data dari Begawi-ASN integration API, menggunakan data lokal:', integrationErr);
    }
  }

  try {
    let sql = 'SELECT * FROM pejabat WHERE 1=1';
    const params: any[] = [];

    // OPD Filter
    if (typeof opd === 'string' && opd) {
      sql += ' AND kd = ?';
      params.push(opd);
    }

    // Eselon Filter
    if (typeof eselon === 'string' && eselon) {
      if (eselon === '-') {
        sql += ' AND kode_eselon IS NULL';
      } else {
        sql += ' AND kode_eselon = ?';
        params.push(eselon);
      }
    }

    // Status Filter
    if (typeof status === 'string' && status) {
      if (status === 'Lowong') {
        sql += " AND nama_pejabat = 'LOWONG'";
      } else {
        sql += " AND nama_pejabat != 'LOWONG' AND ket_status = ?";
        params.push(status);
      }
    }

    // Gender Filter
    if (typeof gender === 'string' && gender) {
      sql += ' AND jk_gender = ?';
      params.push(gender);
    }

    // Search Filter (NIP, Name, Jabatan)
    if (typeof search === 'string' && search) {
      const q = `%${search.toLowerCase().trim()}%`;
      sql += ' AND (LOWER(nama_pejabat) LIKE ? OR LOWER(nama_jabatan) LIKE ? OR LOWER(nip) LIKE ?)';
      params.push(q, q, q);
    }

    // Get Total Count
    const countSql = `SELECT COUNT(*) as count FROM (${sql})`;
    const countRow = await dbGet<{ count: number }>(countSql, params);
    const total = countRow ? countRow.count : 0;

    // Apply Pagination
    const p = parseInt(page as string, 10);
    const l = parseInt(limit as string, 10);
    sql += ' LIMIT ? OFFSET ?';
    params.push(l, (p - 1) * l);

    const rows = await dbAll<PejabatRecord>(sql, params);
    const data = req.user ? rows : rows.map(redactForAnonymous);

    res.json({
      total,
      page: p,
      limit: l,
      pages: Math.ceil(total / l),
      data
    });
  } catch (err) {
    console.error('Error fetching pejabat:', err);
    res.status(500).json({ error: 'Gagal mengambil data pejabat.' });
  }
});

// API: Get statistics for dashboard (dynamic or integrated)
app.get('/api/stats', async (req: Request, res: Response) => {
  if (process.env.INTEGRATION_BEGAWI_ENABLED === 'true') {
    try {
      const dataPegawai = await fetchAllPegawaiFromBegawi();
      const mappedList = dataPegawai.map(mapBegawiToPejabat);

      let definitif = 0;
      let plt = 0;
      let lowong = 0;
      const eselonCounts: Record<string, number> = {};
      const genderCounts: Record<string, number> = {};

      // JF / Fungsional stats
      let definitifJF = 0;
      let pltJF = 0;
      let lowongJF = 0;
      const jfJenjangCounts: Record<string, number> = {};
      const jfGenderCounts: Record<string, number> = {};

      mappedList.forEach((p: any) => {
        const hasEselon = p.kode_eselon && VALID_ESELON_CODES.has(p.kode_eselon);

        if (hasEselon) {
          if (p.nama_pejabat === 'LOWONG') {
            lowong++;
          } else if (p.ket_status === 'PLT' || p.ket_status === 'PLH') {
            plt++;
          } else {
            definitif++;
          }

          eselonCounts[p.kode_eselon] = (eselonCounts[p.kode_eselon] || 0) + 1;

          const gen = p.jk_gender || 'Laki-Laki';
          genderCounts[gen] = (genderCounts[gen] || 0) + 1;
        } else if (p.kode_eselon === 'JF') {
          if (p.nama_pejabat === 'LOWONG') {
            lowongJF++;
          } else if (p.ket_status === 'PLT' || p.ket_status === 'PLH') {
            pltJF++;
          } else {
            definitifJF++;
          }

          const jenjang = p.jenjang_fungsional || 'Fungsional Umum / Pelaksana';
          jfJenjangCounts[jenjang] = (jfJenjangCounts[jenjang] || 0) + 1;

          const gen = p.jk_gender || 'Laki-Laki';
          jfGenderCounts[gen] = (jfGenderCounts[gen] || 0) + 1;
        }
      });

      const totalEselon = mappedList.filter((p: any) => p.kode_eselon && VALID_ESELON_CODES.has(p.kode_eselon)).length;
      const totalJF = mappedList.filter((p: any) => p.kode_eselon === 'JF').length;

      const totalCombined = totalEselon + totalJF;
      const combinedStatus = {
        lowong: lowong + lowongJF,
        definitif: definitif + definitifJF,
        plt: plt + pltJF
      };

      const combinedEselonAndJenjang = { ...eselonCounts, ...jfJenjangCounts };

      const combinedGender = {
        'Laki-Laki': (genderCounts['Laki-Laki'] || 0) + (jfGenderCounts['Laki-Laki'] || 0),
        'Perempuan': (genderCounts['Perempuan'] || 0) + (jfGenderCounts['Perempuan'] || 0)
      };

      return res.json({
        total: totalCombined,
        status: combinedStatus,
        eselon: combinedEselonAndJenjang,
        gender: combinedGender,
        competencyAverage: {
          teknis: 80,
          manajerial: 80,
          social_kultural: 80
        },
        structural: {
          total: totalEselon,
          status: { lowong, definitif, plt },
          eselon: eselonCounts,
          gender: genderCounts
        },
        fungsional: {
          total: totalJF,
          status: { lowong: lowongJF, definitif: definitifJF, plt: pltJF },
          jenjang: jfJenjangCounts,
          gender: jfGenderCounts
        }
      });
    } catch (integrationErr) {
      console.warn('Gagal mengambil stats dari Begawi-ASN integration API, menggunakan data lokal:', integrationErr);
    }
  }

  // Local database stats calculation fallback
  try {
    const totalRow = await dbGet<{ count: number }>('SELECT COUNT(*) as count FROM pejabat');
    
    // Eselon
    const eselonRows = await dbAll<{ kode_eselon: string | null, count: number }>(
      'SELECT kode_eselon, COUNT(*) as count FROM pejabat GROUP BY kode_eselon'
    );
    const eselonCounts: Record<string, number> = {};
    const jfJenjangCounts: Record<string, number> = {};
    eselonRows.forEach(r => {
      if (r.kode_eselon === 'JF') {
        jfJenjangCounts['Fungsional Umum / Pelaksana'] = (jfJenjangCounts['Fungsional Umum / Pelaksana'] || 0) + r.count; // approximation if jenjang not split
      }
      const key = r.kode_eselon || '-';
      eselonCounts[key] = r.count;
    });

    // Gender
    const genderRows = await dbAll<{ jk_gender: string | null, kode_eselon: string | null, count: number }>(
      'SELECT jk_gender, kode_eselon, COUNT(*) as count FROM pejabat GROUP BY jk_gender, kode_eselon'
    );
    const genderCounts: Record<string, number> = {};
    const jfGenderCounts: Record<string, number> = {};
    genderRows.forEach(r => {
      const gen = r.jk_gender || 'Laki-Laki';
      if (r.kode_eselon === 'JF') {
        jfGenderCounts[gen] = (jfGenderCounts[gen] || 0) + r.count;
      } else {
        genderCounts[gen] = (genderCounts[gen] || 0) + r.count;
      }
    });
    
    const combinedGender = {
      'Laki-Laki': (genderCounts['Laki-Laki'] || 0) + (jfGenderCounts['Laki-Laki'] || 0),
      'Perempuan': (genderCounts['Perempuan'] || 0) + (jfGenderCounts['Perempuan'] || 0)
    };

    // Competency averages
    const compRow = await dbGet<{ avg_t: number, avg_m: number, avg_s: number }>(
      'SELECT AVG(kompetensi_teknis) as avg_t, AVG(kompetensi_manajerial) as avg_m, AVG(kompetensi_social_kultural) as avg_s FROM pejabat WHERE nama_pejabat != \'LOWONG\''
    );

    // Totals
    const totalJFRow = await dbGet<{ count: number }>("SELECT COUNT(*) as count FROM pejabat WHERE kode_eselon = 'JF'");
    const totalJF = totalJFRow ? totalJFRow.count : 0;
    const totalEselon = (totalRow ? totalRow.count : 0) - totalJF;
    const totalCombined = totalRow ? totalRow.count : 0;

    // Lowong & PLT
    const structLowongRow = await dbGet<{ count: number }>("SELECT COUNT(*) as count FROM pejabat WHERE nama_pejabat = 'LOWONG' AND (kode_eselon != 'JF' OR kode_eselon IS NULL)");
    const jfLowongRow = await dbGet<{ count: number }>("SELECT COUNT(*) as count FROM pejabat WHERE nama_pejabat = 'LOWONG' AND kode_eselon = 'JF'");
    
    // Count PLT from jabatan_lowong
    const pltRow = await dbGet<{ count: number }>("SELECT COUNT(*) as count FROM jabatan_lowong WHERE plt_nama IS NOT NULL AND plt_nama != ''");
    const pltStruct = pltRow ? pltRow.count : 0;
    const pltJF = 0; // Assume all PLTs in jabatan_lowong are structural
    
    const lowongStruct = Math.max(0, (structLowongRow ? structLowongRow.count : 0) - pltStruct);
    const definitifStruct = Math.max(0, totalEselon - lowongStruct - pltStruct);
    
    const lowongJF = jfLowongRow ? jfLowongRow.count : 0;
    const definitifJF = Math.max(0, totalJF - lowongJF - pltJF);

    res.json({
      total: totalCombined,
      status: { 
        lowong: lowongStruct + lowongJF, 
        definitif: definitifStruct + definitifJF, 
        plt: pltStruct + pltJF 
      },
      eselon: { ...eselonCounts, ...jfJenjangCounts },
      gender: combinedGender,
      competencyAverage: {
        teknis: compRow && compRow.avg_t ? Math.round(compRow.avg_t) : 0,
        manajerial: compRow && compRow.avg_m ? Math.round(compRow.avg_m) : 0,
        social_kultural: compRow && compRow.avg_s ? Math.round(compRow.avg_s) : 0
      },
      structural: {
        total: totalEselon,
        status: { lowong: lowongStruct, definitif: definitifStruct, plt: pltStruct },
        eselon: eselonCounts,
        gender: genderCounts
      },
      fungsional: {
        total: totalJF,
        status: { lowong: lowongJF, definitif: definitifJF, plt: pltJF },
        jenjang: jfJenjangCounts,
        gender: jfGenderCounts
      }
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Gagal mengambil statistik pejabat.' });
  }
});

// API: Get unique OPD list (dynamic or integrated)
app.get('/api/opd', async (req: Request, res: Response) => {
  if (process.env.INTEGRATION_BEGAWI_ENABLED === 'true') {
    try {
      const dataPegawai = await fetchAllPegawaiFromBegawi();
      
      const opdMap = new Map<string, { kd: string, name: string, count: number }>();
      
      dataPegawai.forEach((p: any) => {
        const hasEselon = p.eselon || p.kode_eselon;
        // Hanya hitung OPD untuk pegawai yang ber-eselon (pejabat struktural)
        if (hasEselon && (p.jenis_jabatan === '1' || String(p.jenis_jabatan).toLowerCase().includes('structural') || String(p.jenis_jabatan).toLowerCase().includes('struktural'))) {
          const { opd, kd } = matchOPD(p.unit_kerja_induk || '', p.unit_kerja || '');
          const existing = opdMap.get(kd);
          if (existing) {
            existing.count++;
          } else {
            opdMap.set(kd, { kd, name: opd, count: 1 });
          }
        }
      });

      const opdList = Array.from(opdMap.values()).sort((a, b) => a.name.localeCompare(b.name));
      return res.json(opdList);
    } catch (integrationErr) {
      console.warn('Gagal mengambil OPD dari Begawi-ASN integration API, menggunakan fallback lokal:', integrationErr);
    }
  }

  // Local database OPD list fallback
  try {
    const rows = await dbAll<{ kd: string, opd: string, count: number }>(
      'SELECT kd, opd, COUNT(*) as count FROM pejabat WHERE kd IS NOT NULL AND opd IS NOT NULL GROUP BY kd ORDER BY opd ASC'
    );
    const opdList = rows.map(r => ({ kd: r.kd, name: r.opd.replace(/^\d+\.\s*/, ''), count: r.count }));
    res.json(opdList);
  } catch (err) {
    console.error('Error fetching OPDs:', err);
    res.status(500).json({ error: 'Gagal mengambil daftar OPD.' });
  }
});

// API: Get pejabat details by NIP
app.get('/api/pejabat/:nip', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { nip } = req.params;

  // Dynamic integration path
  if (process.env.INTEGRATION_BEGAWI_ENABLED === 'true') {
    try {
      const nipClean = String(nip).replace(/\s+/g, '');
      const response = await fetch(`${process.env.INTEGRATION_BEGAWI_URL || 'http://localhost:3000'}/api/v1/integration/pegawai/${nipClean}`, {
        method: 'GET',
        headers: {
          'x-api-key': process.env.INTEGRATION_BEGAWI_API_KEY || ''
        }
      });

      if (response.ok) {
        const json = await response.json() as any;
        if (json.status === 'success' && json.data) {
          const mapped = mapBegawiToPejabat(json.data);
          return res.json(req.user ? mapped : redactForAnonymous(mapped));
        }
      }
    } catch (integrationErr) {
      console.warn('Gagal mengambil detail dari Begawi-ASN integration API, menggunakan data lokal:', integrationErr);
    }
  }

  try {
    const record = await dbGet('SELECT * FROM pejabat WHERE nip = ?', [nip]);
    if (!record) {
      return res.status(404).json({ error: `Pejabat dengan NIP ${nip} tidak ditemukan.` });
    }
    res.json(req.user ? record : redactForAnonymous(record));
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil detail pejabat.' });
  }
});




// CRUD: Create Pejabat (Editor/Admin only)
app.post('/api/pejabat', authenticateToken, requireRole(['editor', 'admin']), async (req: AuthenticatedRequest, res: Response) => {
  const r = req.body;
  if (!r.opd || !r.nama_pejabat) {
    return res.status(400).json({ error: 'Nama Pejabat dan Unit Kerja (OPD) wajib diisi.' });
  }

  try {
    const insertSql = `
      INSERT INTO pejabat (
        no, kd, opd, nama_jabatan_structural, nama_jabatan_fungsional, nama_jabatan, nama_pejabat,
        ket_status, nip, pangkat_gol_tmt, pendidikan, tmt_jabatan, mkj_terakhir, kode_eselon,
        tmt_eselon, mkj_eselon, ket, agama, jk_gender, nilai_kinerja, kompetensi_teknis,
        kompetensi_manajerial, kompetensi_social_kultural, kategori, tahun_kinerja,
        rencana_karir, rencana_kompetensi, tanggal_lahir, usia, tmt_pensiun,
        jabatan_plt_plh, status_plt_plh
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    // Combined job title logic
    let nama_jabatan = null;
    if (r.nama_jabatan_structural) nama_jabatan = r.nama_jabatan_structural;
    else if (r.nama_jabatan_fungsional) nama_jabatan = r.nama_jabatan_fungsional;

    await dbRun(insertSql, [
      r.no, r.kd, r.opd, r.nama_jabatan_structural, r.nama_jabatan_fungsional, nama_jabatan, r.nama_pejabat,
      r.ket_status, r.nip, r.pangkat_gol_tmt, r.pendidikan, r.tmt_jabatan, r.mkj_terakhir, r.kode_eselon,
      r.tmt_eselon, r.mkj_eselon, r.ket, r.agama, r.jk_gender, r.nilai_kinerja, r.kompetensi_teknis,
      r.kompetensi_manajerial, r.kompetensi_social_kultural, r.kategori, r.tahun_kinerja,
      r.rencana_karir, r.rencana_kompetensi, r.tanggal_lahir, r.usia, r.tmt_pensiun,
      r.jabatan_plt_plh || null, r.status_plt_plh !== undefined ? Number(r.status_plt_plh) : 0
    ]);

    await createAuditLog(req.user?.username || 'system', 'CREATE_PEJABAT', `Added official: ${r.nama_pejabat} (NIP: ${r.nip || '-'})`);

    res.status(201).json({ message: 'Pejabat berhasil ditambahkan.' });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Pegawai dengan NIP tersebut sudah terdaftar.' });
    }
    console.error('Create error:', err);
    res.status(500).json({ error: 'Gagal menambahkan pejabat ke database.' });
  }
});

// CRUD: Update Pejabat (Editor/Admin only)
app.put('/api/pejabat/:id', authenticateToken, requireRole(['editor', 'admin']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const r = req.body;

  if (!r.opd || !r.nama_pejabat) {
    return res.status(400).json({ error: 'Nama Pejabat dan Unit Kerja (OPD) wajib diisi.' });
  }

  try {
    // Combined job title logic
    let nama_jabatan = null;
    if (r.nama_jabatan_structural) nama_jabatan = r.nama_jabatan_structural;
    else if (r.nama_jabatan_fungsional) nama_jabatan = r.nama_jabatan_fungsional;

    const updateSql = `
      UPDATE pejabat SET
        no = ?, kd = ?, opd = ?, nama_jabatan_structural = ?, nama_jabatan_fungsional = ?, nama_jabatan = ?, 
        nama_pejabat = ?, ket_status = ?, nip = ?, pangkat_gol_tmt = ?, pendidikan = ?, tmt_jabatan = ?, 
        mkj_terakhir = ?, kode_eselon = ?, tmt_eselon = ?, mkj_eselon = ?, ket = ?, agama = ?, 
        jk_gender = ?, nilai_kinerja = ?, kompetensi_teknis = ?, kompetensi_manajerial = ?, 
        kompetensi_social_kultural = ?, kategori = ?, tahun_kinerja = ?, rencana_karir = ?, 
        rencana_kompetensi = ?, tanggal_lahir = ?, usia = ?, tmt_pensiun = ?,
        jabatan_plt_plh = ?, status_plt_plh = ?
      WHERE id = ?
    `;

    await dbRun(updateSql, [
      r.no, r.kd, r.opd, r.nama_jabatan_structural, r.nama_jabatan_fungsional, nama_jabatan, r.nama_pejabat,
      r.ket_status, r.nip, r.pangkat_gol_tmt, r.pendidikan, r.tmt_jabatan, r.mkj_terakhir, r.kode_eselon,
      r.tmt_eselon, r.mkj_eselon, r.ket, r.agama, r.jk_gender, r.nilai_kinerja, r.kompetensi_teknis,
      r.kompetensi_manajerial, r.kompetensi_social_kultural, r.kategori, r.tahun_kinerja,
      r.rencana_karir, r.rencana_kompetensi, r.tanggal_lahir, r.usia, r.tmt_pensiun,
      r.jabatan_plt_plh || null, r.status_plt_plh !== undefined ? Number(r.status_plt_plh) : 0,
      id
    ]);

    await createAuditLog(req.user?.username || 'system', 'UPDATE_PEJABAT', `Updated details for official: ${r.nama_pejabat} (ID: ${id})`);

    res.json({ message: 'Data pejabat berhasil diperbarui.' });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'NIP yang dimasukkan sudah digunakan oleh pegawai lain.' });
    }
    console.error('Update error:', err);
    res.status(500).json({ error: 'Gagal memperbarui data pejabat.' });
  }
});

// Quick toggle PLT/PLH status (Editor/Admin only)
app.post('/api/pejabat/:id/toggle-plt-status', authenticateToken, requireRole(['editor', 'admin']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const record = await dbGet('SELECT status_plt_plh, nama_pejabat FROM pejabat WHERE id = ?', [id]);
    if (!record) return res.status(404).json({ error: 'Pejabat tidak ditemukan.' });
    const newStatus = record.status_plt_plh ? 0 : 1;
    await dbRun('UPDATE pejabat SET status_plt_plh = ? WHERE id = ?', [newStatus, id]);
    await createAuditLog(req.user?.username || 'system', 'TOGGLE_PLT_STATUS', `Toggled PLT/PLH status for ${record.nama_pejabat} to ${newStatus}`);
    res.json({ message: 'Status PLT/PLH berhasil diperbarui.', status_plt_plh: newStatus });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memperbarui status PLT/PLH.' });
  }
});

// CRUD: Delete Pejabat (Admin only)
app.delete('/api/pejabat/:id', authenticateToken, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const target = await dbGet('SELECT nama_pejabat FROM pejabat WHERE id = ?', [id]);
    const name = target ? target.nama_pejabat : 'Unknown';

    await dbRun('DELETE FROM pejabat WHERE id = ?', [id]);
    await createAuditLog(req.user?.username || 'system', 'DELETE_PEJABAT', `Deleted official: ${name} (ID: ${id})`);
    
    res.json({ message: 'Pejabat berhasil dihapus.' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus pejabat dari database.' });
  }
});

// USER MANAGEMENT (Admin only)
app.get('/api/users', authenticateToken, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const rows = await dbAll('SELECT id, username, name, role FROM users');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil daftar pengguna.' });
  }
});

app.post('/api/users', authenticateToken, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  const { username, password, name, role } = req.body;
  if (!username || !password || !name || !role) {
    return res.status(400).json({ error: 'Seluruh kolom isian wajib diisi.' });
  }

  try {
    const passHash = bcrypt.hashSync(password, 10);
    await dbRun('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)', [username, passHash, name, role]);
    await createAuditLog(req.user?.username || 'system', 'CREATE_USER', `Created user account: ${username} (${role})`);
    res.status(201).json({ message: 'Pengguna berhasil ditambahkan.' });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Username sudah digunakan oleh akun lain.' });
    }
    res.status(500).json({ error: 'Gagal menyimpan data pengguna.' });
  }
});

app.put('/api/users/:id', authenticateToken, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, role, password } = req.body;

  try {
    if (password && password.trim()) {
      const passHash = bcrypt.hashSync(password, 10);
      await dbRun('UPDATE users SET name = ?, role = ?, password = ? WHERE id = ?', [name, role, passHash, id]);
    } else {
      await dbRun('UPDATE users SET name = ?, role = ? WHERE id = ?', [name, role, id]);
    }
    
    const target = await dbGet('SELECT username FROM users WHERE id = ?', [id]);
    await createAuditLog(req.user?.username || 'system', 'UPDATE_USER', `Updated user account settings: ${target?.username}`);
    
    res.json({ message: 'Data pengguna berhasil diperbarui.' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memperbarui data pengguna.' });
  }
});

app.delete('/api/users/:id', authenticateToken, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  
  if (parseInt(id, 10) === req.user?.id) {
    return res.status(400).json({ error: 'Anda tidak dapat menghapus akun Anda sendiri.' });
  }

  try {
    const target = await dbGet('SELECT username FROM users WHERE id = ?', [id]);
    await dbRun('DELETE FROM users WHERE id = ?', [id]);
    await createAuditLog(req.user?.username || 'system', 'DELETE_USER', `Deleted user account: ${target?.username}`);
    res.json({ message: 'Pengguna berhasil dihapus.' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus pengguna.' });
  }
});

// SYSTEM AUDIT LOGS (Admin only)
app.get('/api/audit-logs', authenticateToken, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const rows = await dbAll('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 500');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil riwayat audit.' });
  }
});

// GET SYSTEM SETTINGS (Integration state)
app.get('/api/settings', (req: Request, res: Response) => {
  const isEnabled = process.env.INTEGRATION_BEGAWI_ENABLED === 'true';
  const url = process.env.INTEGRATION_BEGAWI_URL || 'http://localhost:3001';
  const apiKey = process.env.INTEGRATION_BEGAWI_API_KEY || '';
  // Mask the API key for security
  const maskedApiKey = apiKey 
    ? (apiKey.length > 8 ? `${apiKey.substring(0, 7)}•••` : '••••••••')
    : 'Tidak ada';

  res.json({
    integrationEnabled: isEnabled,
    integrationUrl: url,
    integrationApiKey: maskedApiKey,
    appName: 'Evan-ID (Elektronik Verification And Analytics Nominatif - Integrated Dashboard)',
    dbType: 'SQLite3',
    version: '1.0.0'
  });
});

// Diagnostic endpoint to test the integration connectivity and response
app.get('/api/settings/test', async (req: Request, res: Response) => {
  const isEnabled = process.env.INTEGRATION_BEGAWI_ENABLED === 'true';
  const url = process.env.INTEGRATION_BEGAWI_URL || 'http://localhost:3001';
  const apiKey = process.env.INTEGRATION_BEGAWI_API_KEY || '';

  const integrationUrl = `${url}/api/v1/integration/pegawai?page=1&per_page=2`;
  
  try {
    const response = await fetch(integrationUrl, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey
      }
    });

    const status = response.status;
    const ok = response.ok;
    let responseBody = '';
    try {
      responseBody = await response.text();
    } catch (e: any) {
      responseBody = `Error reading body: ${e.message}`;
    }

    res.json({
      configuredEnabled: isEnabled,
      integrationUrl,
      httpStatus: status,
      httpOk: ok,
      responseBody
    });
  } catch (error: any) {
    res.json({
      configuredEnabled: isEnabled,
      integrationUrl,
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack
    });
  }
});

// PUT SYSTEM SETTINGS (requires auth, admin role only)
app.put('/api/settings', authenticateToken, requireRole(['admin']), async (req: Request, res: Response) => {
  const { integrationEnabled, integrationUrl, integrationApiKey } = req.body;
  
  if (integrationEnabled !== undefined) {
    process.env.INTEGRATION_BEGAWI_ENABLED = integrationEnabled ? 'true' : 'false';
  }
  if (integrationUrl !== undefined) {
    process.env.INTEGRATION_BEGAWI_URL = integrationUrl;
  }
  if (integrationApiKey !== undefined && integrationApiKey !== '••••••••' && !integrationApiKey.includes('•••')) {
    process.env.INTEGRATION_BEGAWI_API_KEY = integrationApiKey;
  }

  // Persist back to .env file
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      
      const updates = {
        INTEGRATION_BEGAWI_ENABLED: process.env.INTEGRATION_BEGAWI_ENABLED,
        INTEGRATION_BEGAWI_URL: process.env.INTEGRATION_BEGAWI_URL,
        INTEGRATION_BEGAWI_API_KEY: process.env.INTEGRATION_BEGAWI_API_KEY
      };

      for (const [key, value] of Object.entries(updates)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
          envContent += `\n${key}=${value}`;
        }
      }
      fs.writeFileSync(envPath, envContent, 'utf8');
    }
  } catch (err) {
    console.error('Error writing settings to .env file:', err);
  }

  // Create audit log
  try {
    const user = (req as any).user;
    await createAuditLog(
      user.username,
      'UPDATE_SETTINGS',
      `Memperbarui pengaturan integrasi. Status: ${process.env.INTEGRATION_BEGAWI_ENABLED}`
    );
  } catch (logErr) {
    console.error('Error logging settings update:', logErr);
  }

  const apiKey = process.env.INTEGRATION_BEGAWI_API_KEY || '';
  const maskedApiKey = apiKey 
    ? (apiKey.length > 8 ? `${apiKey.substring(0, 7)}•••` : '••••••••')
    : 'Tidak ada';

  res.json({
    success: true,
    integrationEnabled: process.env.INTEGRATION_BEGAWI_ENABLED === 'true',
    integrationUrl: process.env.INTEGRATION_BEGAWI_URL,
    integrationApiKey: maskedApiKey
  });
});

// EXPORT TO EXCEL (contains full PII, authenticated users only)
app.get('/api/export/excel', authenticateToken, async (req: Request, res: Response) => {
  try {
    const rows = await dbAll('SELECT * FROM pejabat ORDER BY no ASC');
    
    // Convert SQLite rows to Excel-friendly keys
    const cleanRows = rows.map(r => ({
      'No': r.no || '',
      'Unit Kerja (OPD)': r.opd || '',
      'Nama Pejabat': r.nama_pejabat || '',
      'NIP': r.nip || '',
      'Jabatan Struktural': r.nama_jabatan_structural || '',
      'Jabatan Fungsional': r.nama_jabatan_fungsional || '',
      'Eselon': r.kode_eselon || '',
      'Status': r.ket_status || '',
      'Pangkat/Gol': r.pangkat_gol_tmt || '',
      'Pendidikan': r.pendidikan || '',
      'Predikat Kinerja': r.nilai_kinerja || '',
      'Usia': r.usia || '',
      'TMT Pensiun': r.tmt_pensiun || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(cleanRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Buku Nominatif Tanggamus');
    
    const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Disposition', 'attachment; filename=Buku_Nominatif_Tanggamus_2026.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    console.error('Excel Export Error:', err);
    res.status(500).json({ error: 'Gagal mengunduh dokumen Excel.' });
  }
});

// ─── API: Jabatan Lowong ──────────────────────────────────────────────────────

// GET /api/jabatan-lowong — semua jabatan lowong dari ketiga sheet
app.get('/api/jabatan-lowong', async (req: Request, res: Response) => {
  const { level, opd } = req.query;
  try {
    let sql = 'SELECT * FROM jabatan_lowong WHERE 1=1';
    const params: any[] = [];
    if (level) { sql += ' AND level = ?'; params.push(level); }
    if (opd) { sql += ' AND opd = ?'; params.push(opd); }
    sql += ' ORDER BY level, opd, no ASC';
    const rows = await dbAll(sql, params);
    res.json({ total: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil data jabatan lowong.' });
  }
});

// GET /api/jabatan-lowong/stats — ringkasan per level
app.get('/api/jabatan-lowong/stats', async (req: Request, res: Response) => {
  try {
    const byLevel = await dbAll<{ level: string; total: number; dengan_plt: number }>(
      `SELECT level,
              COUNT(*) AS total,
              COUNT(CASE WHEN plt_nama IS NOT NULL AND plt_nama != '' THEN 1 END) AS dengan_plt
       FROM jabatan_lowong
       GROUP BY level`
    );
    const byOpd = await dbAll<{ opd: string; level: string; total: number }>(
      'SELECT opd, level, COUNT(*) AS total FROM jabatan_lowong GROUP BY opd, level ORDER BY opd'
    );
    const total = byLevel.reduce((s, r) => s + r.total, 0);
    res.json({ total, byLevel, byOpd });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil statistik jabatan lowong.' });
  }
});

// GET /api/jabatan-lowong/eselon2 — khusus Eselon II
app.get('/api/jabatan-lowong/eselon2', async (req: Request, res: Response) => {
  try {
    const rows = await dbAll("SELECT * FROM jabatan_lowong WHERE level = 'eselon2' ORDER BY no ASC");
    res.json({ total: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil data jabatan lowong Eselon II.' });
  }
});

// GET /api/jabatan-lowong/eselon3 — khusus Eselon III
app.get('/api/jabatan-lowong/eselon3', async (req: Request, res: Response) => {
  try {
    const rows = await dbAll("SELECT * FROM jabatan_lowong WHERE level = 'eselon3' ORDER BY no ASC");
    res.json({ total: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil data jabatan lowong Eselon III.' });
  }
});

// GET /api/jabatan-lowong/eselon4 — khusus Eselon IV
app.get('/api/jabatan-lowong/eselon4', async (req: Request, res: Response) => {
  try {
    const rows = await dbAll("SELECT * FROM jabatan_lowong WHERE level = 'eselon4' ORDER BY opd, no ASC");
    res.json({ total: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil data jabatan lowong Eselon IV.' });
  }
});

// ─── API: Pejabat Pensiun ─────────────────────────────────────────────────────

// GET /api/pensiun — semua pejabat yang akan pensiun
app.get('/api/pensiun', async (req: Request, res: Response) => {
  try {
    const rows = await dbAll('SELECT * FROM pejabat_pensiun ORDER BY no ASC');
    res.json({ total: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil data pensiun.' });
  }
});

// Serve dashboard static files (placed after API routes to avoid static file intercepts)
const publicDir = path.join(__dirname, '..', 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
}
app.use(express.static(publicDir));


// Initialise SQLite/PostgreSQL
initDatabase().catch(err => {
  console.error('Failed to initialize database on startup:', err);
});

// Start server only if not running in a serverless environment like Vercel
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Buku Nominatif server running on port http://localhost:${PORT}`);
  });
}

export default app;
