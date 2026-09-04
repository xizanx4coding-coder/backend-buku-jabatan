const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');

const RESTRICTED_FIELDS = [
  'nip', 'tanggal_lahir', 'agama', 'kompetensi_teknis', 'kompetensi_manajerial',
  'kompetensi_social_kultural', 'nilai_kinerja', 'kategori', 'rencana_karir', 'rencana_kompetensi'
];

function redact(record) {
  const copy = { ...record };
  for (const f of RESTRICTED_FIELDS) delete copy[f];
  return copy;
}

// Eselon codes that are considered "struktural"
const STRUKTURAL_ESELON = ['2A', '2B', '3A', '3B', '4A', '4B'];

const db = new sqlite3.Database(path.join(__dirname, '..', 'database.sqlite'));

db.all('SELECT * FROM pejabat ORDER BY no ASC', [], (err, rows) => {
  if (err) throw err;
  const data = rows.map(redact);
  const pejabatOut = { total: data.length, page: 1, limit: data.length, pages: 1, data };
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'api', 'pejabat.json'), JSON.stringify(pejabatOut));
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'api', 'pejabat'), JSON.stringify(pejabatOut));
  console.log(`Exported ${data.length} records to pejabat.json`);

  // OPD list
  db.all("SELECT kd, opd, COUNT(*) as count FROM pejabat WHERE kd IS NOT NULL GROUP BY kd", [], (err2, opdRows) => {
    if (err2) throw err2;
    const list = opdRows.map(r => ({ kd: r.kd, name: r.opd.replace(/^\d+\.\s*/, ''), count: r.count }))
      .sort((a, b) => a.name.localeCompare(b.name));
    fs.writeFileSync(path.join(__dirname, '..', 'public', 'api', 'opd.json'), JSON.stringify(list));
    fs.writeFileSync(path.join(__dirname, '..', 'public', 'api', 'opd'), JSON.stringify(list));

    // === GLOBAL STATS ===
    db.all('SELECT kode_eselon, jk_gender, ket_status, nama_pejabat FROM pejabat', [], (e3, allRows) => {
      if (e3) throw e3;

      function calcStats(subset) {
        const total = subset.length;
        const lowong = subset.filter(r => r.nama_pejabat && r.nama_pejabat.trim().toUpperCase() === 'LOWONG').length;
        const plt = subset.filter(r => r.ket_status === 'Pelaksana Tugas' || r.ket_status === 'PLT' || r.ket_status === 'Plt').length;
        const definitif = total - lowong - plt;

        // Build eselon counts in correct hierarchy order
        const ESELON_ORDER = ['2A', '2B', '3A', '3B', '4A', '4B'];
        const rawEselonCounts = {};
        subset.forEach(r => {
          const k = r.kode_eselon || 'Lainnya';
          rawEselonCounts[k] = (rawEselonCounts[k] || 0) + 1;
        });
        // Sort by hierarchy then alphabetically
        const eselonCounts = {};
        ESELON_ORDER.forEach(k => { if (rawEselonCounts[k]) eselonCounts[k] = rawEselonCounts[k]; });
        Object.keys(rawEselonCounts).filter(k => !ESELON_ORDER.includes(k)).sort().forEach(k => {
          eselonCounts[k] = rawEselonCounts[k];
        });

        const genderCounts = {};
        subset.forEach(r => {
          if (r.jk_gender) {
            // Normalize gender labels
            const g = r.jk_gender.trim();
            const normalized = g.toLowerCase().startsWith('l') ? 'Laki-Laki' : 'Perempuan';
            genderCounts[normalized] = (genderCounts[normalized] || 0) + 1;
          }
        });

        return { total, status: { lowong, definitif, plt }, eselon: eselonCounts, gender: genderCounts };
      }

      // Structural: rows with eselon in STRUKTURAL_ESELON
      const structRows = allRows.filter(r => r.kode_eselon && STRUKTURAL_ESELON.includes(r.kode_eselon.trim()));
      // Fungsional: the rest (JF, Tugas Tambahan, etc.)
      const fungRows = allRows.filter(r => !r.kode_eselon || !STRUKTURAL_ESELON.includes(r.kode_eselon.trim()));

      const globalStats = calcStats(allRows);
      const structStats = calcStats(structRows);
      const fungStats = calcStats(fungRows);

      // For fungsional, rename eselon to jenjang
      const jenjangCounts = {};
      fungRows.forEach(r => {
        const k = r.kode_eselon || 'Lainnya';
        jenjangCounts[k] = (jenjangCounts[k] || 0) + 1;
      });
      fungStats.jenjang = jenjangCounts;
      delete fungStats.eselon;

      db.get(`SELECT AVG(kompetensi_teknis) as avg_t, AVG(kompetensi_manajerial) as avg_m, AVG(kompetensi_social_kultural) as avg_s FROM pejabat WHERE kompetensi_teknis IS NOT NULL`, [], (e4, compRow) => {
        const stats = {
          ...globalStats,
          competencyAverage: {
            teknis: Math.round((compRow && compRow.avg_t) || 0),
            manajerial: Math.round((compRow && compRow.avg_m) || 0),
            social_kultural: Math.round((compRow && compRow.avg_s) || 0)
          },
          structural: structStats,
          fungsional: fungStats
        };

        fs.writeFileSync(path.join(__dirname, '..', 'public', 'api', 'stats.json'), JSON.stringify(stats));
        fs.writeFileSync(path.join(__dirname, '..', 'public', 'api', 'stats'), JSON.stringify(stats));

        console.log('=== Stats Summary ===');
        console.log(`Global  : total=${stats.total}, lowong=${stats.status.lowong}, plt=${stats.status.plt}, definitif=${stats.status.definitif}`);
        console.log(`Struktural: total=${structStats.total}, lowong=${structStats.status.lowong}, plt=${structStats.status.plt}`);
        console.log(`Fungsional: total=${fungStats.total}, lowong=${fungStats.status.lowong}, plt=${fungStats.status.plt}`);
        console.log('Regenerated public/api snapshot files successfully.');
        db.close();
      });
    });
  });
});
