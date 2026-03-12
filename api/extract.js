// api/extract.js — Vercel Serverless Function
// API key Claude disimpan dalam Vercel Environment Variable
// Staf tidak boleh nampak key ini

export default async function handler(req, res) {
  // Allow CORS
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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: base64 }
            },
            {
              type: 'text',
              text: `Analisis sijil/dokumen kursus ini dan ekstrak maklumat berikut dalam format JSON:
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
- Jika tidak ada jam tapi ada tarikh, kembalikan null (sistem akan kira sendiri)
- Kembalikan JSON sahaja, tanpa teks lain.`
            }
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
