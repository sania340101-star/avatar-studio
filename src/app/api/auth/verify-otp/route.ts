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
    let falKey: string | undefined;
    let anthropicKey: string | undefined;

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

      if (!afData.ok) {
        const status = afData.error?.includes('expired') || afData.error?.includes('Invalid') ? 401 : 400;
        return NextResponse.json(
          { error: afData.error || 'Invalid or expired code', attemptsLeft: afData.attemptsLeft },
          { status },
        );
      }

      const user = afData.user || {};
      userId = user.userId || `otp-${Buffer.from(email.toLowerCase()).toString('base64url')}`;
      userName = user.userName || email.split('@')[0];
      userEmail = user.email || email.toLowerCase();

      const sk = afData.serviceKeys || {};
      const isAfUser = afData.isAfUser === true;
      falKey = sk.fal_ai_api_key || sk.fal_ai_access_token || (isAfUser ? process.env.FAL_KEY : undefined);
      anthropicKey = sk.anthropic_api_key || (isAfUser ? process.env.ANTHROPIC_API_KEY : undefined);
    } else {
      // Dev fallback: local OTP verification
      if (!verifyOtp(email, code)) {
        return NextResponse.json({ error: 'Invalid or expired code' }, { status: 401 });
      }

      userId = `otp-${Buffer.from(email.toLowerCase()).toString('base64url')}`;
      userName = email.split('@')[0];
      userEmail = email.toLowerCase();
      falKey = process.env.FAL_KEY;
      anthropicKey = process.env.ANTHROPIC_API_KEY;
    }

    return NextResponse.json({
      userId,
      userName,
      email: userEmail,
      role: 'user',
      authMethod: 'otp',
      falKey: falKey || undefined,
      anthropicKey: anthropicKey || undefined,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Verification failed' }, { status: 500 });
  }
}
