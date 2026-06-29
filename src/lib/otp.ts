import { randomInt } from 'crypto';
import nodemailer from 'nodemailer';

interface OtpEntry {
  code: string;
  email: string;
  expiresAt: number;
  attempts: number;
}

const otpStore = new Map<string, OtpEntry>();
const OTP_TTL = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of otpStore) {
    if (now > entry.expiresAt) otpStore.delete(key);
  }
}, 60_000);

function generateCode(): string {
  return String(randomInt(100000, 1000000));
}

export function createOtp(email: string): string {
  const code = generateCode();
  const key = email.toLowerCase();
  otpStore.set(key, {
    code,
    email: key,
    expiresAt: Date.now() + OTP_TTL,
    attempts: 0,
  });
  return code;
}

export function verifyOtp(email: string, code: string): boolean {
  const key = email.toLowerCase();
  const entry = otpStore.get(key);
  if (!entry) return false;

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key);
    return false;
  }

  entry.attempts++;
  if (entry.attempts > MAX_ATTEMPTS) {
    otpStore.delete(key);
    return false;
  }

  if (entry.code !== code) return false;

  otpStore.delete(key);
  return true;
}

export function isEmailAllowed(email: string): boolean {
  const allowed = process.env.ALLOWED_EMAIL_DOMAINS;
  if (!allowed) return true;
  const domains = allowed.split(',').map(d => d.trim().toLowerCase());
  const emailDomain = email.toLowerCase().split('@')[1];
  return domains.includes(emailDomain);
}

let transporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    } : undefined,
  });
  return transporter;
}

export async function sendOtpEmail(email: string, code: string): Promise<{ sent: boolean; devCode?: string }> {
  const t = getTransporter();
  if (!t) {
    console.log(`[OTP] No SMTP configured. Code for ${email}: ${code}`);
    return { sent: false, devCode: code };
  }

  await t.sendMail({
    from: process.env.SMTP_FROM || 'Avatar Studio <noreply@hypervsn.com>',
    to: email,
    subject: 'Avatar Studio — Login Code',
    text: `Your login code: ${code}\n\nThis code expires in 5 minutes.`,
    html: `
      <div style="font-family: 'Encode Sans', sans-serif; max-width: 400px; margin: 0 auto; padding: 32px; background: #1a1625; border-radius: 16px;">
        <h2 style="color: #6c3ce0; margin: 0 0 16px;">Avatar Studio</h2>
        <p style="margin: 0 0 24px; color: #a8a3b8;">Your login code:</p>
        <div style="font-size: 32px; font-weight: 600; letter-spacing: 8px; text-align: center; padding: 16px; background: #2a2435; border-radius: 8px; color: #e8e4f0;">
          ${code}
        </div>
        <p style="margin: 24px 0 0; font-size: 12px; color: #6b6580;">This code expires in 5 minutes.</p>
      </div>
    `,
  });

  return { sent: true };
}
