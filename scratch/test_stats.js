async function test() {
  try {
    const res = await fetch('http://localhost:3005/api/stats');
    const json = await res.json();
    console.log('STATS API RESPONSE:', json);
  } catch (err) {
    console.error('Error fetching stats:', err);
  }
}

test();
