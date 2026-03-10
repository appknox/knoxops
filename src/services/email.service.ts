import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

// Check if email is configured
const isEmailConfigured = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);

// Only create transporter if SMTP is configured
const transporter = isEmailConfigured
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    })
  : null;

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  if (!isEmailConfigured || !transporter) {
    console.log('[DEV] Email would be sent:');
    console.log('  To:', options.to);
    console.log('  Subject:', options.subject);
    console.log('  (SMTP not configured - email not actually sent)');
    return;
  }

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });
}

export async function sendInviteEmail(
  email: string,
  inviteToken: string,
  inviterName: string,
  role: string
): Promise<void> {
  const inviteUrl = `${env.FRONTEND_URL}/invite/accept?token=${inviteToken}`;

  const subject = 'You have been invited to KnoxAdmin';

  const text = `
Hello,

${inviterName} has invited you to join KnoxAdmin as a ${role.replace('_', ' ')}.

To accept this invitation and set up your account, please visit:
${inviteUrl}

This invitation will expire in 7 days.

If you did not expect this invitation, you can safely ignore this email.

Best regards,
KnoxAdmin Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="margin: 0 0 20px; color: #1a1a1a; font-size: 24px;">You're Invited!</h1>
    <p style="margin: 0 0 15px;">
      <strong>${inviterName}</strong> has invited you to join <strong>KnoxAdmin</strong> as a <strong>${role.replace('_', ' ')}</strong>.
    </p>
    <p style="margin: 0 0 25px;">
      Click the button below to accept this invitation and set up your account:
    </p>
    <a href="${inviteUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">
      Accept Invitation
    </a>
    <p style="margin: 25px 0 0; font-size: 14px; color: #666;">
      This invitation will expire in 7 days.
    </p>
  </div>
  <p style="font-size: 12px; color: #999; text-align: center;">
    If you did not expect this invitation, you can safely ignore this email.
  </p>
</body>
</html>
  `.trim();

  await sendEmail({ to: email, subject, text, html });
}

export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  userName: string
): Promise<void> {
  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  const subject = 'Reset your KnoxAdmin password';

  const text = `
Hello ${userName},

We received a request to reset your password for your KnoxAdmin account.

To reset your password, please visit:
${resetUrl}

This link will expire in 1 hour.

If you did not request a password reset, please ignore this email or contact support if you have concerns.

Best regards,
KnoxAdmin Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="margin: 0 0 20px; color: #1a1a1a; font-size: 24px;">Reset Your Password</h1>
    <p style="margin: 0 0 15px;">
      Hello <strong>${userName}</strong>,
    </p>
    <p style="margin: 0 0 15px;">
      We received a request to reset your password for your KnoxAdmin account.
    </p>
    <p style="margin: 0 0 25px;">
      Click the button below to reset your password:
    </p>
    <a href="${resetUrl}" style="display: inline-block; background: #dc2626; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">
      Reset Password
    </a>
    <p style="margin: 25px 0 0; font-size: 14px; color: #666;">
      This link will expire in 1 hour.
    </p>
  </div>
  <p style="font-size: 12px; color: #999; text-align: center;">
    If you did not request a password reset, please ignore this email.
  </p>
</body>
</html>
  `.trim();

  await sendEmail({ to: email, subject, text, html });
}
