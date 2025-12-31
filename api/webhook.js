import crypto from 'crypto';

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-paystack-signature');

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const secret = process.env.PAYSTACK_SECRET_KEY;

        if (!secret) {
            console.error('PAYSTACK_SECRET_KEY is not defined');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const body = req.body;
        if (!body) {
            return res.status(400).json({ error: 'No request body provided' });
        }

        // Paystack sends the body as JSON, but signature uses stringified version.
        // Important: If using a framework that parses body, ensure JSON.stringify matches Paystack's raw body.
        // For robustness in this setup, we rely on JSON.stringify(req.body).
        const hash = crypto.createHmac('sha512', secret)
            .update(JSON.stringify(body))
            .digest('hex');

        if (hash !== req.headers['x-paystack-signature']) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        const event = body;

        if (event.event === 'charge.success') {
            const { reference, amount, customer, channel } = event.data;

            console.log(`Deposit successful for ${customer.email}:`, {
                reference,
                amount: amount / 100, // Convert back to main currency unit
                channel
            });

            // TODO: Update user balance in database here
            // await updateBalance(customer.email, amount / 100);
        }

        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed', details: error.message });
    }
}
