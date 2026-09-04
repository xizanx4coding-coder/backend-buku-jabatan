async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/v1/integration/pegawai?page=1&per_page=1', {
      headers: {
        'x-api-key': 'apk_cee0fa8ba45f1e6487ad41023c35ee7670b007907911d96f77401deec57ce8a5'
      }
    });
    const json = await res.json();
    console.log('INTEGRATION TOTAL META:', json.meta);
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
