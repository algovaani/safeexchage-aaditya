import nodemailer from 'nodemailer';

const transporter =
  process.env.SMTP_HOST && process.env.SMTP_USER
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    : null;

export async function sendEmail(to: string, subject: string, text: string) {
  if (!transporter) {
    console.log(`[email:dev] To: ${to} | ${subject} | ${text}`);
    return;
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@safex.com',
    to,
    subject,
    text,
  });
}

export function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
