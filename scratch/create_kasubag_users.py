import sqlite3
import bcrypt

# Connect to database
conn = sqlite3.connect('database.sqlite')
cursor = conn.cursor()

# Search for Kasubag Umum
cursor.execute("SELECT id, nama_pejabat, nip, nama_jabatan, opd FROM pejabat WHERE nama_jabatan LIKE '%Sub Bagian Umum%' OR nama_jabatan LIKE '%Subbag%Umum%' OR nama_jabatan LIKE '%Kasubag%Umum%'")
rows = cursor.fetchall()

print(f"Ditemukan {len(rows)} pejabat Kepala Sub Bagian Umum:")
for r in rows:
    print(f"- Name: {r[1]}, NIP: {r[2]}, Jabatan: {r[3]} ({r[4]})")

# Create user accounts
password_plain = "123456"
# Generate bcrypt hash (round=10 is typical for bcryptjs/bcrypt)
password_hash = bcrypt.hashpw(password_plain.encode('utf-8'), bcrypt.gensalt(10)).decode('utf-8')

created_count = 0
skipped_count = 0

for r in rows:
    pejabat_id, name, nip, jabatan, opd = r
    if not nip or nip == 'LOWONG':
        print(f"Skipping {name} (NIP kosong/LOWONG)")
        skipped_count += 1
        continue
    
    # Clean NIP from spaces
    nip_cleaned = nip.replace(' ', '')
    
    try:
        cursor.execute(
            "INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)",
            (nip_cleaned, password_hash, name, 'editor')
        )
        conn.commit()
        print(f"Created account for: {name} (NIP: {nip_cleaned})")
        created_count += 1
        
        # Log to audit_logs
        cursor.execute(
            "INSERT INTO audit_logs (username, action, details) VALUES (?, ?, ?)",
            ('system', 'CREATE_USER_KASUBAG', f"Created automatic account for Kasubag: {name} (NIP: {nip_cleaned})")
        )
        conn.commit()
    except sqlite3.IntegrityError:
        print(f"Account already exists for: {name} (NIP: {nip_cleaned})")
        skipped_count += 1

conn.close()
print(f"\nSelesai! Berhasil membuat {created_count} akun baru, {skipped_count} dilewati.")
