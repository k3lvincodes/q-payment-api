import axios from 'axios';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // API Key authentication
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.QUORIX_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, amount } = req.body;

  if (!email || !amount) {
    return res.status(400).json({ error: 'Email and amount are required' });
  }

  try {
    const response = await axios.post('https://api.paystack.co/transaction/initialize', {
      email,
      amount: amount * 100, // Paystack expects amount in kobo
      channels: ['bank_transfer']
    }, {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const data = response.data.data;

    res.status(200).json({
      status: 'pending',
      reference: data.reference,
      authorization_url: data.authorization_url,
      access_code: data.access_code
    });

  } catch (error) {
    console.error('Deposit init error:', error?.response?.data || error.toString());
    res.status(500).json({
      error: error?.response?.data || 'Error initializing deposit'
    });
  }
}
