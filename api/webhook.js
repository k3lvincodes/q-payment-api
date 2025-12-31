import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
// Use Service Role Key if available for bypassing RLS, otherwise Anon Key
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const paystackSecret = process.env.PAYSTACK_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    // specific check for Paystack signature
    const signature = req.headers['x-paystack-signature'];
    if (!signature) {
        return res.status(400).send('Missing signature');
    }

    const hash = crypto.createHmac('sha512', paystackSecret)
        .update(JSON.stringify(req.body))
        .digest('hex');

    if (hash !== signature) {
        return res.status(400).send('Invalid signature');
    }

    const event = req.body;

    if (event.event === 'charge.success') {
        const { reference, amount, customer, channel, metadata } = event.data;
        const email = customer.email;
        const amountInNaira = amount / 100; // Paystack sends amount in kobo

        try {
            // 1. Find User
            // We need to resolve the user. If metadata has user_id, use it.
            // Otherwise try to find by email in profiles.
            let userId = metadata?.user_id;

            if (!userId) {
                const { data: userProfile, error: userError } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('email', email)
                    .single();

                if (userProfile) {
                    userId = userProfile.id;
                } else {
                    console.error(`User not found for email: ${email}`);
                    // Return 200 to acknowledge webhook so Paystack doesn't retry indefinitely
                    return res.status(200).send('User not found');
                }
            }

            // 2. Check for duplicate transaction
            const { data: existingTx } = await supabase
                .from('transactions')
                .select('id')
                .like('description', `%${reference}%`) // Assuming description contains reference
                .single();

            if (existingTx) {
                return res.status(200).send('Transaction already processed');
            }

            // 3. Insert Transaction
            const { error: txError } = await supabase
                .from('transactions')
                .insert({
                    user_id: userId,
                    amount: amountInNaira,
                    type: 'credit',
                    description: `Deposit via ${channel} (Ref: ${reference})`,
                    created_at: new Date().toISOString()
                });

            if (txError) {
                console.error('Transaction insert error:', txError);
                return res.status(500).send('Error recording transaction');
            }

            // 4. Update Balance
            // Try RPC first (atomic)
            const { error: rpcError } = await supabase
                .rpc('increment_balance', { user_id: userId, amount: amountInNaira });

            if (rpcError) {
                console.warn('RPC increment_balance failed, falling back to manual update:', rpcError);

                // Fallback: Get current balance and update
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('balance')
                    .eq('id', userId)
                    .single();

                const newBalance = (profile?.balance || 0) + amountInNaira;

                const { error: updateError } = await supabase
                    .from('profiles')
                    .update({ balance: newBalance })
                    .eq('id', userId);

                if (updateError) {
                    console.error('Balance update error:', updateError);
                    return res.status(500).send('Error updating balance');
                }
            }

            return res.status(200).send('Webhook processed successfully');

        } catch (err) {
            console.error('Webhook processing error:', err);
            return res.status(500).send('Internal Server Error');
        }
    }

    // Acknowledge other events
    res.status(200).send('Event received');
}
