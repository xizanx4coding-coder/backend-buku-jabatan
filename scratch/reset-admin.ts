import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import * as bcrypt from 'bcryptjs';

const DB_PATH = path.join(__dirname, '..', 'database.sqlite');
console.log('Mengakses database:', DB_PATH);

const db = new sqlite3.Database(DB_PATH);

const newPassword = 'Admin123!';
const hash = bcrypt.hashSync(newPassword, 10);

db.serialize(() => {
  // Cek daftar user terlebih dahulu
  db.all('SELECT id, username, name, role FROM users', [], (err, rows) => {
    if (err) {
      console.error('Error membaca tabel users:', err);
      return;
    }
    console.log('User terdaftar saat ini:', rows);

    // Update password untuk admin
    db.run('UPDATE users SET password = ? WHERE username = ?', [hash, 'admin'], function(err) {
      if (err) {
        console.error('Gagal me-reset password admin:', err);
      } else {
        console.log(`Password untuk user "admin" berhasil di-reset menjadi: ${newPassword}`);
      }
      db.close();
    });
  });
});
