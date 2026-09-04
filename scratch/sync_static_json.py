import sqlite3
import json
import os
import re

# Connect to local SQLite database
conn = sqlite3.connect('database.sqlite')
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

# 1. Fetch pejabat
cursor.execute('SELECT * FROM pejabat')
pejabat_rows = cursor.fetchall()
pejabat_list = []
for row in pejabat_rows:
    pejabat_list.append(dict(row))

# 2. Fetch OPD list and calculate count directly from database
cursor.execute('SELECT kd, opd, COUNT(*) as count FROM pejabat WHERE kd IS NOT NULL GROUP BY kd')
opd_rows = cursor.fetchall()
opd_list = []
for row in opd_rows:
    opd_list.append({
        'kd': row['kd'],
        'name': str(row['opd']),
        'count': row['count']
    })

# clean name in python
cleaned_opd_list = []
for item in opd_list:
    name = item['name']
    # Strip leading numbers like "1. SEKRETARIAT DAERAH" -> "SEKRETARIAT DAERAH"
    name = re.sub(r'^\d+\.\s*', '', name)
    cleaned_opd_list.append({
        'kd': item['kd'],
        'name': name,
        'count': item['count']
    })

# Sort OPD by name
cleaned_opd_list.sort(key=lambda x: x['name'])

# Write output files
os.makedirs('public/api', exist_ok=True)

# Write pejabat.json
pejabat_payload = {'data': pejabat_list}
with open('public/api/pejabat.json', 'w', encoding='utf-8') as f:
    json.dump(pejabat_payload, f, ensure_ascii=False, indent=2)

with open('public/api/pejabat', 'w', encoding='utf-8') as f:
    json.dump(pejabat_payload, f, ensure_ascii=False, indent=2)

# Write opd.json
with open('public/api/opd.json', 'w', encoding='utf-8') as f:
    json.dump(cleaned_opd_list, f, ensure_ascii=False, indent=2)

with open('public/api/opd', 'w', encoding='utf-8') as f:
    json.dump(cleaned_opd_list, f, ensure_ascii=False, indent=2)

# Write stats.json
cursor.execute('SELECT COUNT(*) as count FROM pejabat')
total = cursor.fetchone()['count']

cursor.execute('SELECT COUNT(*) as count FROM pejabat WHERE nama_pejabat = "LOWONG"')
lowong = cursor.fetchone()['count']

cursor.execute('SELECT COUNT(*) as count FROM pejabat WHERE ket_status = "Definitif" AND nama_pejabat != "LOWONG"')
definitif = cursor.fetchone()['count']

cursor.execute('SELECT COUNT(*) as count FROM pejabat WHERE ket_status LIKE "Pelaksana Tugas%" AND nama_pejabat != "LOWONG"')
plt = cursor.fetchone()['count']

cursor.execute('SELECT kode_eselon, COUNT(*) as count FROM pejabat GROUP BY kode_eselon')
eselon_stats = {}
for r in cursor.fetchall():
    esl = r['kode_eselon']
    if esl is None:
        esl = '-'
    eselon_stats[esl] = r['count']

cursor.execute('SELECT jk_gender, COUNT(*) as count FROM pejabat GROUP BY jk_gender')
gender_stats = {}
for r in cursor.fetchall():
    g = r['jk_gender']
    if g:
        gender_stats[g] = r['count']

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

with open('public/api/stats.json', 'w', encoding='utf-8') as f:
    json.dump(stats_data, f, ensure_ascii=False, indent=2)

with open('public/api/stats', 'w', encoding='utf-8') as f:
    json.dump(stats_data, f, ensure_ascii=False, indent=2)

conn.close()
print("Successfully synced all static files (pejabat.json, opd.json, stats.json) with SQLite database data!")
