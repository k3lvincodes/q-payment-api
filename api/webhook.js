import crypto from 'crypto';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const secret = process.env.PAYSTACK_SECRET_KEY;
    const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(req.body)).digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body;

    try {
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
        res.status(500).json({ error: 'Webhook processing failed' });
    }
}
