import { NextRequest, NextResponse } from 'next/server';
import { verifyOtp } from '@/lib/otp';

const AF_URL = process.env.AF_INTERNAL_URL || 'http://172.18.32.73:3380';
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();
    if (!email || !code) {
      return NextResponse.json({ error: 'Email and code are required' }, { status: 400 });
    }

    let userId: string;
    let userName: string;
    let userEmail: string;

    // If INTERNAL_SERVICE_KEY is configured, use Agent Factory API
    if (SERVICE_KEY) {
      const afRes = await fetch(`${AF_URL}/api/internal/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Key': SERVICE_KEY,
        },
        body: JSON.stringify({ email, code }),
      });
      const afData = await afRes.json();

      if (!afRes.ok) {
        return NextResponse.json(
          { error: afData.error || 'Invalid or expired code' },
          { status: afRes.status },
        );
      }

      userId = afData.userId || `otp-${Buffer.from(email.toLowerCase()).toString('base64url')}`;
      userName = afData.userName || email.split('@')[0];
      userEmail = afData.email || email.toLowerCase();
    } else {
      // Dev fallback: local OTP verification
      if (!verifyOtp(email, code)) {
        return NextResponse.json({ error: 'Invalid or expired code' }, { status: 401 });
      }

      userId = `otp-${Buffer.from(email.toLowerCase()).toString('base64url')}`;
      userName = email.split('@')[0];
      userEmail = email.toLowerCase();
    }

    return NextResponse.json({
      userId,
      userName,
      email: userEmail,
      role: 'user',
      authMethod: 'otp',
      falKey: process.env.FAL_KEY || undefined,
      anthropicKey: process.env.ANTHROPIC_API_KEY || undefined,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Verification failed' }, { status: 500 });
  }
}
