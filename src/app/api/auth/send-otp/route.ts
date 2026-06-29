import { NextRequest, NextResponse } from 'next/server';
import { createOtp, sendOtpEmail, isEmailAllowed } from '@/lib/otp';
import { audit } from '@/lib/audit';
const AF_URL = process.env.AF_INTERNAL_URL || 'http://172.18.32.73:3380';
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip') || 'unknown';
  try {
    const { email } = await req.json();
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }
    if (!isEmailAllowed(email)) {
      audit({ event: 'otp_sent', ip, path: '/api/auth/send-otp', detail: `blocked:${email}` });
      return NextResponse.json({ error: 'This email domain is not allowed' }, { status: 403 });
    }
    audit({ event: 'otp_sent', ip, path: '/api/auth/send-otp', detail: email });
    if (SERVICE_KEY) {
      const afRes = await fetch(`${AF_URL}/api/internal/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Key': SERVICE_KEY,
        },
        body: JSON.stringify({ email }),
      });
      const afData = await afRes.json();
      if (!afRes.ok) {
        return NextResponse.json(
          { error: afData.error || 'Failed to send code' },
          { status: afRes.status },
        );
      }
      return NextResponse.json({ ok: true });
    }
    const code = createOtp(email);
    const result = await sendOtpEmail(email, code);
    if (!result.sent && result.devCode) {
      console.log(`[DEV] OTP code for ${email}: ${result.devCode}`);
      return NextResponse.json({ ok: true, smtpNotConfigured: true });
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to send code' }, { status: 500 });
  }
}
