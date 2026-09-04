const fs = require('fs');
const path = require('path');

async function main() {
  try {
    console.log('Fetching live stats from local server...');
    const statsRes = await fetch('http://localhost:3005/api/stats');
    if (!statsRes.ok) throw new Error(`Stats status: ${statsRes.status}`);
    const statsData = await statsRes.json();
    fs.writeFileSync(path.join(__dirname, '..', 'public', 'api', 'stats.json'), JSON.stringify(statsData));
    fs.writeFileSync(path.join(__dirname, '..', 'public', 'api', 'stats'), JSON.stringify(statsData));
    console.log('Saved stats.json');

    console.log('Fetching live OPD list...');
    const opdRes = await fetch('http://localhost:3005/api/opd');
    if (!opdRes.ok) throw new Error(`OPD status: ${opdRes.status}`);
    const opdData = await opdRes.json();
    fs.writeFileSync(path.join(__dirname, '..', 'public', 'api', 'opd.json'), JSON.stringify(opdData));
    fs.writeFileSync(path.join(__dirname, '..', 'public', 'api', 'opd'), JSON.stringify(opdData));
    console.log('Saved opd.json');

    console.log('Fetching live redacted pejabat list (all)...');
    // Fetch with a large limit and category=all to get both structural and functional records
    const pejabatRes = await fetch('http://localhost:3005/api/pejabat?limit=12000&category=all');
    if (!pejabatRes.ok) throw new Error(`Pejabat status: ${pejabatRes.status}`);
    const pejabatData = await pejabatRes.json();
    
    fs.writeFileSync(path.join(__dirname, '..', 'public', 'api', 'pejabat.json'), JSON.stringify(pejabatData));
    fs.writeFileSync(path.join(__dirname, '..', 'public', 'api', 'pejabat'), JSON.stringify(pejabatData));
    console.log(`Saved pejabat.json (${pejabatData.total} records)`);

    console.log('✅ Integrated snapshot export completed successfully!');
  } catch (err) {
    console.error('❌ Failed to export integrated snapshot:', err);
    process.exit(1);
  }
}

main();
