const fs = require('fs');
const cache = JSON.parse(fs.readFileSync('scratch/cached_begawi_pegawai.json', 'utf8'));

console.log('Total records in cache:', cache.length);
console.log('First 5 records keys & sample:');
cache.slice(0, 5).forEach((r, i) => {
  console.log(`Record ${i + 1}:`);
  console.log('NIP:', r.nip);
  console.log('Nama:', r.nama);
  console.log('jabatan_nama:', r.jabatan_nama);
  console.log('nama_jabatan:', r.nama_jabatan);
  console.log('pegawai_asn:', r.pegawai_asn);
  console.log('---------------------------------');
});
