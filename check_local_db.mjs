import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error(err.message);
    process.exit(1);
  }
});

db.serialize(() => {
  console.log('=== TABLE INFO (pejabat) ===');
  db.all("PRAGMA table_info(pejabat)", [], (err, rows) => {
    if (err) throw err;
    console.log(rows.map(t => `${t.name}: ${t.type}`));
  });

  console.log('\n=== SAMPLE DATA (pejabat) ===');
  db.all("SELECT id, nama_pejabat, nama_jabatan, opd, kd FROM pejabat LIMIT 3", [], (err, rows) => {
    if (err) throw err;
    console.log(JSON.stringify(rows, null, 2));
  });

  console.log('\n=== DISTINCT OPD di SQLite lokal ===');
  db.all("SELECT opd, COUNT(*) as jumlah FROM pejabat GROUP BY opd ORDER BY jumlah DESC LIMIT 10", [], (err, rows) => {
    if (err) throw err;
    console.log(JSON.stringify(rows, null, 2));
    db.close();
  });
});
