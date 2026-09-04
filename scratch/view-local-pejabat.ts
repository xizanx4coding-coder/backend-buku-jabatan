import * as sqlite3 from 'sqlite3';
import * as path from 'path';

const DB_PATH = path.join(__dirname, '..', 'database.sqlite');
console.log('Membaca database local Buka Jabatan Baru:', DB_PATH);

const db = new sqlite3.Database(DB_PATH);

db.all('SELECT id, nama_pejabat, nip, nama_jabatan, opd, kode_eselon FROM pejabat LIMIT 5', [], (err, rows) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  console.log('SAMPEL DATA LOKAL (Buku Nominatif):');
  console.log(rows);
  db.close();
});
