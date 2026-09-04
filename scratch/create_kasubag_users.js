const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const passwordPlain = "123456";
const passwordHash = bcrypt.hashSync(passwordPlain, 10);

db.all(
  "SELECT id, nama_pejabat, nip, nama_jabatan, opd FROM pejabat WHERE nama_jabatan LIKE '%Sub Bagian Umum%' OR nama_jabatan LIKE '%Subbag%Umum%' OR nama_jabatan LIKE '%Kasubag%Umum%'",
  [],
  (err, rows) => {
    if (err) {
      console.error(err);
      db.close();
      return;
    }

    console.log(`Ditemukan ${rows.length} pejabat Kepala Sub Bagian Umum:`);
    let createdCount = 0;
    let skippedCount = 0;
    let processed = 0;

    if (rows.length === 0) {
      db.close();
      return;
    }

    rows.forEach(r => {
      const { id, nama_pejabat, nip, nama_jabatan, opd } = r;
      if (!nip || nip === 'LOWONG' || nip.trim() === '—') {
        console.log(`Skipping ${nama_pejabat} (NIP kosong/LOWONG)`);
        skippedCount++;
        processed++;
        if (processed === rows.length) finish();
        return;
      }

      const nipCleaned = nip.replace(/\s+/g, '');

      db.run(
        "INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)",
        [nipCleaned, passwordHash, nama_pejabat, 'editor'],
        function(err2) {
          if (err2) {
            if (err2.message.includes('UNIQUE constraint failed')) {
              console.log(`Account already exists for: ${nama_pejabat} (NIP: ${nipCleaned})`);
            } else {
              console.error(`Error inserting ${nama_pejabat}:`, err2.message);
            }
            skippedCount++;
          } else {
            console.log(`Created account for: ${nama_pejabat} (NIP: ${nipCleaned})`);
            createdCount++;

            // Insert audit log
            db.run(
              "INSERT INTO audit_logs (username, action, details) VALUES (?, ?, ?)",
              ['system', 'CREATE_USER_KASUBAG', `Created automatic account for Kasubag: ${nama_pejabat} (NIP: ${nipCleaned})`]
            );
          }

          processed++;
          if (processed === rows.length) finish();
        }
      );
    });

    function finish() {
      console.log(`\nSelesai! Berhasil membuat ${createdCount} akun baru, ${skippedCount} dilewati/sudah ada.`);
      db.close();
    }
  }
);
