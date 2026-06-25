import { NextRequest, NextResponse } from 'next/server';
import { createOtp, sendOtpEmail, isEmailAllowed } from '@/lib/otp';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    if (!isEmailAllowed(email)) {
      return NextResponse.json({ error: 'This email domain is not allowed' }, { status: 403 });
    }

    const code = createOtp(email);
    await sendOtpEmail(email, code);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to send code' }, { status: 500 });
  }
}
