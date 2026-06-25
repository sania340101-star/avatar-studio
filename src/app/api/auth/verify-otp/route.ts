import { NextRequest, NextResponse } from 'next/server';
import { verifyOtp } from '@/lib/otp';

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();
    if (!email || !code) {
      return NextResponse.json({ error: 'Email and code are required' }, { status: 400 });
    }

    if (!verifyOtp(email, code)) {
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 401 });
    }

    const userId = `otp-${Buffer.from(email.toLowerCase()).toString('base64url')}`;
    const userName = email.split('@')[0];

    return NextResponse.json({
      userId,
      userName,
      email: email.toLowerCase(),
      role: 'user',
      authMethod: 'otp',
      falKey: process.env.FAL_KEY || undefined,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Verification failed' }, { status: 500 });
  }
}
