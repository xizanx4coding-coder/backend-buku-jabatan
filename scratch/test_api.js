async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/v1/integration/pegawai?page=1&per_page=10', {
      headers: {
        'x-api-key': 'apk_cee0fa8ba45f1e6487ad41023c35ee7670b007907911d96f77401deec57ce8a5'
      }
    });
    console.log('Status:', res.status);
    const json = await res.json();
    console.log('API RESPONSE:', JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('Error fetching API:', err);
  }
}

test();
