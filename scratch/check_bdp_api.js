const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const url = 'http://localhost:3001/api/v1/integration/pegawai?page=1&per_page=10';
  const apiKey = process.env.INTEGRATION_BEGAWI_API_KEY || '';
  console.log('Fetching:', url, 'with API key:', apiKey ? 'exists' : 'missing');
  try {
    const res = await fetch(url, {
      headers: {
        'x-api-key': apiKey
      }
    });
    const json = await res.json();
    console.log('Status:', json.status);
    if (json.data && json.data.length > 0) {
      console.log('First record sample fields:');
      const r = json.data[0];
      console.log('nip:', r.nip);
      console.log('nama:', r.nama);
      console.log('jabatan_nama:', r.jabatan_nama);
      console.log('nama_jabatan:', r.nama_jabatan);
      console.log('unor:', r.unit_kerja);
      console.log('all keys:', Object.keys(r));
    } else {
      console.log('No data found, response:', json);
    }
  } catch (e) {
    console.error(e);
  }
}
main();
