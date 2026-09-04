import sqlite3
import json
import os

conn = sqlite3.connect('database.sqlite')
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

# Get total pejabat
cursor.execute('SELECT COUNT(*) as count FROM pejabat')
total = cursor.fetchone()['count']

# Get status
cursor.execute('SELECT COUNT(*) as count FROM pejabat WHERE nama_pejabat = "LOWONG"')
lowong = cursor.fetchone()['count']

cursor.execute('SELECT COUNT(*) as count FROM pejabat WHERE ket_status = "Definitif" AND nama_pejabat != "LOWONG"')
definitif = cursor.fetchone()['count']

cursor.execute('SELECT COUNT(*) as count FROM pejabat WHERE ket_status LIKE "Pelaksana Tugas%" AND nama_pejabat != "LOWONG"')
plt = cursor.fetchone()['count']

# Get eselon stats
cursor.execute('SELECT kode_eselon, COUNT(*) as count FROM pejabat GROUP BY kode_eselon')
eselon_stats = {}
for r in cursor.fetchall():
    esl = r['kode_eselon']
    if esl is None:
        esl = '-'
    eselon_stats[esl] = r['count']

# Get gender stats
cursor.execute('SELECT jk_gender, COUNT(*) as count FROM pejabat GROUP BY jk_gender')
gender_stats = {}
for r in cursor.fetchall():
    g = r['jk_gender']
    if g:
        gender_stats[g] = r['count']

# Get competency averages
cursor.execute('SELECT AVG(kompetensi_teknis) as t, AVG(kompetensi_manajerial) as m, AVG(kompetensi_social_kultural) as s FROM pejabat')
row_avg = cursor.fetchone()
avg_t = round(row_avg['t'] or 0)
avg_m = round(row_avg['m'] or 0)
avg_s = round(row_avg['s'] or 0)

stats_data = {
    'total': total,
    'status': {
        'lowong': lowong,
        'definitif': definitif,
        'plt': plt
    },
    'eselon': eselon_stats,
    'gender': gender_stats,
    'competencyAverage': {
        'teknis': avg_t,
        'manajerial': avg_m,
        'social_kultural': avg_s
    }
}

conn.close()

# Ensure directories exist
os.makedirs('public/api', exist_ok=True)

# Write static JSON mock files for stats
with open('public/api/stats', 'w', encoding='utf-8') as f:
    json.dump(stats_data, f, ensure_ascii=False, indent=2)

with open('public/api/stats.json', 'w', encoding='utf-8') as f:
    json.dump(stats_data, f, ensure_ascii=False, indent=2)

print('Static stats API files successfully created under public/api/stats')
