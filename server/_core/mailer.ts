import nodemailer from 'nodemailer';

const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Internal heads-up email to the team (ADMIN_EMAIL). Never throws — callers
 * fire and forget so a mail outage can't fail the user-facing request.
 * Values are HTML-escaped: most of them come from public forms.
 */
export async function notifyAdmin(subject: string, heading: string, rows: Array<[string, unknown]>) {
  if (process.env.NODE_ENV === 'test') return;

  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_APP_PASSWORD;
  const adminEmail = process.env.ADMIN_EMAIL || emailUser;

  if (!emailUser || !emailPass) {
    console.warn(`⚠️ Admin notification skipped (EMAIL_USER/EMAIL_APP_PASSWORD not set): ${subject}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: emailUser,
      pass: emailPass,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  const body = rows
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([label, value]) =>
      `<tr><td style="padding:6px 12px;font-weight:bold;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:6px 12px;white-space:pre-wrap;">${escapeHtml(value)}</td></tr>`)
    .join('');

  try {
    await transporter.sendMail({
      from: `"PathXpress" <${emailUser}>`,
      to: adminEmail,
      subject,
      html: `
        <h2 style="color:#1a1a1a;">${escapeHtml(heading)}</h2>
        <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">${body}</table>
      `,
    });
  } catch (error: any) {
    console.warn('⚠️ Email notification failed:', error.message);
  }
}

export async function notifyAdminNewOrder(
  waybillNumber: string,
  customerName: string,
  customerPhone: string,
) {
  await notifyAdmin(`New Order: ${waybillNumber}`, 'New Order Received', [
    ['Waybill', waybillNumber],
    ['Customer', customerName],
    ['Phone', customerPhone],
  ]);
}
