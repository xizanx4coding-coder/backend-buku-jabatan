const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function mapBegawiToPejabat(p) {
  const namaJabatanStr = p.jabatan_nama || p.nama_jabatan || '';
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
  const isStructural = isCurrentlyStruktural && !isExcluded;

  // Pelaksana detection
  const isPelaksana = 
    ja1 === '4' || 
    ja1Lower.includes('fungsional_umum') || 
    activeJabLower.includes('pelaksana') || 
    activeJabLower.includes('jfu');

  let eselon = null;
  if (isStructural) {
    eselon = 'Structural';
  } else if (isPelaksana) {
    eselon = 'Pelaksana';
  } else {
    eselon = 'JF';
  }

  return {
    nip: p.nip,
    nama: p.nama,
    jabatan: namaJabatanStr,
    eselon,
    jenis_jabatan: p.jenis_jabatan
  };
}

async function main() {
  const baseUrl = `${process.env.INTEGRATION_BEGAWI_URL || 'http://localhost:3001'}/api/v1/integration/pegawai`;
  const apiKey = process.env.INTEGRATION_BEGAWI_API_KEY || '';
  
  let page = 1;
  const perPage = 100;
  let hasMore = true;
  const allPegawai = [];

  console.log('Fetching from:', baseUrl);
  while (hasMore) {
    try {
      const res = await fetch(`${baseUrl}?page=${page}&per_page=${perPage}`, {
        headers: { 'x-api-key': apiKey }
      });
      const json = await res.json();
      if (json.status === 'success' && Array.isArray(json.data)) {
        allPegawai.push(...json.data);
        const meta = json.meta;
        if (meta && meta.page < meta.total_pages) {
          page++;
        } else {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    } catch (e) {
      console.error(e);
      break;
    }
  }

  console.log('Total Pegawai fetched:', allPegawai.length);
  const mapped = allPegawai.map(mapBegawiToPejabat);
  const structural = mapped.filter(p => p.eselon === 'Structural');
  const pelaksana = mapped.filter(p => p.eselon === 'Pelaksana');
  const jf = mapped.filter(p => p.eselon === 'JF');

  console.log('Structural count:', structural.length);
  console.log('Pelaksana count:', pelaksana.length);
  console.log('JF (Fungsional) count:', jf.length);
}

main();
