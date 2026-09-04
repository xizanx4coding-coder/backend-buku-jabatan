import * as path from 'path';
import * as fs from 'fs';
import * as XLSX from 'xlsx';

export interface PejabatRecord {
  no: number | null;
  kd: string | null;
  opd: string;
  nama_jabatan_structural: string | null;
  nama_jabatan_fungsional: string | null;
  nama_jabatan: string | null;
  nama_pejabat: string | null;
  ket_status: string | null;
  nip: string | null;
  pangkat_gol_tmt: string | null;
  pendidikan: string | null;
  tmt_jabatan: string | null;
  mkj_terakhir: string | null;
  kode_eselon: string | null;
  tmt_eselon: string | null;
  mkj_eselon: string | null;
  ket: string | null;
  agama: string | null;
  jk_gender: string | null;
  nilai_kinerja: string | null;
  kompetensi_teknis: number | null;
  kompetensi_manajerial: number | null;
  kompetensi_social_kultural: number | null;
  kategori: string | null;
  tahun_kinerja: number | null;
  rencana_karir: string | null;
  rencana_kompetensi: string | null;
  tanggal_lahir: string | null;
  usia: string | null;
  tmt_pensiun: string | null;
}

function formatDate(val: any): string | null {
  if (!val) return null;
  
  // If it's an Excel serial date number
  if (typeof val === 'number') {
    const date = XLSX.SSF.parse_date_code(val);
    const d = String(date.d).padStart(2, '0');
    const m = String(date.m).padStart(2, '0');
    const y = date.y;
    return `${d}-${m}-${y}`;
  }
  
  if (val instanceof Date) {
    const d = String(val.getDate()).padStart(2, '0');
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const y = val.getFullYear();
    return `${d}-${m}-${y}`;
  }

  const str = String(val).trim();
  if (str.toLowerCase() === 'nan' || str.toLowerCase() === 'null' || str === '-' || str === '') {
    return null;
  }
  return str;
}

function formatString(val: any): string | null {
  if (val === undefined || val === null) return null;
  const str = String(val).trim();
  if (str.toLowerCase() === 'nan' || str.toLowerCase() === 'null' || str === '-' || str === '') {
    return null;
  }
  return str;
}

function formatNumber(val: any): number | null {
  if (val === undefined || val === null) return null;
  const num = Number(val);
  if (isNaN(num)) return null;
  return num;
}

export function parseExcelData(filePath: string): PejabatRecord[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Excel file not found at path: ${filePath}`);
  }

  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = 'DATA NOMINATIF JABATAN';
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`Sheet '${sheetName}' not found in Excel file.`);
  }

  const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  const records: PejabatRecord[] = [];

  let currentKd: string | null = null;
  let currentOpd = 'PIMPINAN DAERAH';

  // Headers are in index 2 (row 3). Data starts at index 3 (row 4)
  for (let i = 3; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;

    const noVal = row[0];
    const kdVal = row[1];
    const nameJabatanVal = row[2];
    const col3Val = row[3];
    const namePejabatVal = row[4];

    // Check if this is an OPD header row
    // Condition: noVal is empty/null, namePejabatVal is empty/null, kdVal and nameJabatanVal are present
    const isNoEmpty = noVal === undefined || noVal === null || String(noVal).trim() === '';
    const isPejabatEmpty = namePejabatVal === undefined || namePejabatVal === null || String(namePejabatVal).trim() === '';
    const hasKd = kdVal !== undefined && kdVal !== null && String(kdVal).trim() !== '';
    const hasJabatan = nameJabatanVal !== undefined && nameJabatanVal !== null && String(nameJabatanVal).trim() !== '';

    if (isNoEmpty && isPejabatEmpty && hasKd && hasJabatan) {
      currentKd = String(kdVal).trim();
      currentOpd = String(nameJabatanVal).trim();
      continue;
    }

    // Check if the row has any useful data
    const hasNip = row[6] !== undefined && row[6] !== null && String(row[6]).trim() !== '';
    const hasEselon = row[11] !== undefined && row[11] !== null && String(row[11]).trim() !== '';

    if (isPejabatEmpty && !hasNip && !hasEselon) {
      continue;
    }

    // Clean up No field
    let cleanNo: number | null = null;
    if (noVal !== undefined && noVal !== null) {
      const parsedNo = parseInt(String(noVal), 10);
      if (!isNaN(parsedNo)) cleanNo = parsedNo;
    }

    const record: PejabatRecord = {
      no: cleanNo,
      kd: currentKd,
      opd: currentOpd,
      nama_jabatan_structural: formatString(nameJabatanVal),
      nama_jabatan_fungsional: formatString(col3Val),
      nama_jabatan: null,
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

    // Combined job title compatibility
    if (record.nama_jabatan_structural) {
      record.nama_jabatan = record.nama_jabatan_structural;
    } else if (record.nama_jabatan_fungsional) {
      record.nama_jabatan = record.nama_jabatan_fungsional;
    } else {
      record.nama_jabatan = null;
    }

    records.push(record);
  }

  return records;
}

export interface JabatanLowongRecord {
  no: number;
  nama_jabatan: string;
  eselon: string;
  plt_nama: string | null;
  opd: string;
  level: 'eselon2' | 'eselon3' | 'eselon4';
}

export interface PensiunRecord {
  no: number;
  nama_jabatan: string;
  eselon: string;
  nama_pejabat: string;
  keterangan_pensiun: string;
  opd: string;
}

export function parseJabatanLowong(filePath: string): JabatanLowongRecord[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Excel file not found at path: ${filePath}`);
  }

  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const records: JabatanLowongRecord[] = [];

  const sheetLevels: { sheetName: string; level: 'eselon2' | 'eselon3' | 'eselon4' }[] = [
    { sheetName: 'Eselon II', level: 'eselon2' },
    { sheetName: 'Eselon III', level: 'eselon3' },
    { sheetName: 'Eselon IV', level: 'eselon4' },
  ];

  for (const { sheetName, level } of sheetLevels) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;

    const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    let currentOpd = '';

    // Data starts at row index 4 (row 5 in Excel), header at index 2
    for (let i = 4; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || !row.some((c: any) => c !== null && c !== undefined && c !== '')) continue;

      const noVal = row[0];
      const namaJabatanVal = row[1];
      const eselonVal = row[2];
      const pltVal = row[3];

      // Check if this is a group header (OPD name row)
      if ((noVal === null || noVal === undefined) && namaJabatanVal) {
        const strNama = String(namaJabatanVal).trim();
        // Group headers are all caps or contain "JUMLAH"
        if (strNama === strNama.toUpperCase() && !strNama.match(/^\d+$/)) {
          currentOpd = strNama;
          continue;
        }
      }

      // Skip summary rows
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

export function parsePensiun(filePath: string): PensiunRecord[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Excel file not found at path: ${filePath}`);
  }

  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const worksheet = workbook.Sheets['PENSIUN'];
  if (!worksheet) return [];

  const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  const records: PensiunRecord[] = [];
  let currentOpd = '';

  for (let i = 4; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || !row.some((c: any) => c !== null && c !== undefined && c !== '')) continue;

    const noVal = row[0];
    const namaJabatanVal = row[1];
    const eselonVal = row[2];
    const namaVal = row[3];
    const ketPensiunVal = row[4];

    // Group header row (OPD name)
    if ((noVal === null || noVal === undefined) && namaJabatanVal) {
      const strNama = String(namaJabatanVal).trim();
      if (strNama === strNama.toUpperCase() && !strNama.match(/^JUMLAH/i)) {
        currentOpd = strNama;
        continue;
      }
    }

    // Skip summary rows
    if (String(namaJabatanVal || '').toLowerCase().includes('jumlah')) continue;

    const noNum = parseInt(String(noVal), 10);
    if (isNaN(noNum)) continue;

    records.push({
      no: noNum,
      nama_jabatan: String(namaJabatanVal || '').trim(),
      eselon: String(eselonVal || '').trim(),
      nama_pejabat: String(namaVal || '').trim(),
      keterangan_pensiun: String(ketPensiunVal || '').trim(),
      opd: currentOpd,
    });
  }

  return records;
}
