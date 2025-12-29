import axios from 'axios';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { reference } = req.query;

    if (!reference) {
        return res.status(400).json({ error: 'Transaction reference is required' });
    }

    try {
        const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
            headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
            }
        });

        const data = response.data.data;

        // Check specific status
        if (data.status === 'success') {
            res.status(200).json({
                status: 'success',
                message: 'Deposit verified successfully',
                amount: data.amount / 100, // Convert kobo to main currency
                customer: data.customer,
                channel: data.channel,
                paid_at: data.paid_at
            });
        } else {
            res.status(200).json({
                status: data.status, // 'pending', 'failed', 'abandoned'
                message: `Transaction is ${data.status}`
            });
        }

    } catch (error) {
        console.error('Verification error:', error?.response?.data || error.toString());
        res.status(500).json({
            error: error?.response?.data || 'Error verifying deposit'
        });
    }
}
