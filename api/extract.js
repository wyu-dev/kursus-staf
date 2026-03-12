// api/extract.js — Vercel Serverless Function
// Menyokong: image/jpeg, image/png, image/gif, image/webp, application/pdf

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { base64, mimeType } = req.body;

    if (!base64 || !mimeType) {
      return res.status(400).json({ ok: false, msg: 'Data tidak lengkap.' });
    }

    const prompt = `Analisis sijil/dokumen kursus ini dan ekstrak maklumat berikut dalam format JSON:
{
  "nama": "nama penerima sijil",
  "tajuk": "tajuk penuh kursus/seminar/webinar/latihan",
  "kategori": "Teknikal atau Bukan Teknikal atau Keselamatan",
  "tarikh_mula": "YYYY-MM-DD atau null",
  "tarikh_tamat": "YYYY-MM-DD atau null",
  "jam": nombor jam (integer) atau null jika tidak tersebut
}

Peraturan kategori:
- Teknikal: kursus berkaitan kemahiran vokasional, IT, kejuruteraan, teknikal
- Keselamatan: OSH, keselamatan pekerjaan, fire drill, first aid
- Bukan Teknikal: pengurusan, kewangan, komunikasi, soft skills, pembangunan diri

Peraturan jam:
- Jika sijil nyatakan jam/CPD hours, gunakan nilai tersebut
- Jika tidak ada jam tapi ada tarikh, kembalikan null
- Kembalikan JSON sahaja, tanpa teks lain.`;

    // Bina content block ikut jenis fail
    let fileBlock;
    if (mimeType === 'application/pdf') {
      fileBlock = {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64 }
      };
    } else {
      const validImages = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const safeMime = validImages.includes(mimeType) ? mimeType : 'image/jpeg';
      fileBlock = {
        type: 'image',
        source: { type: 'base64', media_type: safeMime, data: base64 }
      };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            fileBlock,
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ ok: false, msg: 'Claude API error: ' + (data.error?.message || 'Unknown') });
    }

    let text = data.content[0].text.replace(/```json|```/g, '').trim();
    const extracted = JSON.parse(text);

    return res.status(200).json({ ok: true, data: extracted });

  } catch (err) {
    return res.status(500).json({ ok: false, msg: 'Server error: ' + err.message });
  }
}
