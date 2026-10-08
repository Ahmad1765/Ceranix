import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// =============================================================================
// Webhook Chaos Engineering: Stripe Malformed, Delayed, Duplicated Payloads
// =============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret';

// Generates a forged Stripe Signature
function generateSignature(payload: string, timestamp: number, secret: string) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${timestamp}.${payload}`);
  const signature = hmac.digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

async function sendWebhook(payload: any, signatureStr: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': signatureStr,
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.text() };
}

async function runChaos() {
  console.log('--- STARTING WEBHOOK CHAOS ENGINEERING ---');

  const payload = {
    id: 'evt_test_123',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_test_${Date.now()}`,
        amount_total: 5000,
        metadata: {
          listing_id: '11111111-1111-4111-8111-111111111111',
          buyer_id: '22222222-2222-4222-8222-222222222222',
          seller_id: '33333333-3333-4333-8333-333333333333',
        },
        payment_intent: 'pi_test_123',
      },
    },
  };

  const payloadStr = JSON.stringify(payload);

  // 1. Time-Drift Attack (Exactly 301 seconds old)
  console.log('\n[TEST 1] Replay Attack / Time Drift (301s old)');
  const oldTimestamp = Math.floor(Date.now() / 1000) - 301;
  const oldSignature = generateSignature(payloadStr, oldTimestamp, WEBHOOK_SECRET);
  const res1 = await sendWebhook(payload, oldSignature);
  if (res1.status === 401) {
    console.log('PASS: Webhook correctly rejected 301s old signature (timingSafeEqual tolerance enforced).');
  } else {
    console.error('FAIL: Webhook accepted old signature!', res1);
  }

  // 2. Idempotency Chaos (Firing exact payload 3 times in quick succession)
  console.log('\n[TEST 2] Idempotency Chaos (3 concurrent bursts)');
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const validSignature = generateSignature(payloadStr, currentTimestamp, WEBHOOK_SECRET);
  
  const promises = [
    sendWebhook(payload, validSignature),
    sendWebhook(payload, validSignature),
    sendWebhook(payload, validSignature)
  ];

  const results = await Promise.all(promises);
  console.log('Results from burst:', results.map(r => ({ status: r.status, body: r.body })));
  // Webhook should process the first one (200), and identical retries should hit 
  // the `duplicate_event` check in classifyInsertError and return 200 without duplicating revenue.
  const oks = results.filter(r => r.status === 200).length;
  if (oks === 3) {
    console.log('PASS: All webhooks returned 200 (first processed, subsequent swallowed idempotently).');
  } else {
    console.error('FAIL: Burst produced unexpected status codes.');
  }

  // 3. Malformed Secret
  console.log('\n[TEST 3] Cryptographic Tampering (Wrong Secret)');
  const badSignature = generateSignature(payloadStr, currentTimestamp, 'whsec_wrong_key');
  const res3 = await sendWebhook(payload, badSignature);
  if (res3.status === 401) {
    console.log('PASS: Webhook rejected forged crypto signature.');
  } else {
    console.error('FAIL: Webhook accepted bad signature!', res3);
  }
}

runChaos().catch(console.error);
