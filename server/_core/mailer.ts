import nodemailer from 'nodemailer';

export async function notifyAdminNewOrder(
  waybillNumber: string,
  customerName: string,
  customerPhone: string,
) {
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_APP_PASSWORD;
  const adminEmail = process.env.ADMIN_EMAIL || emailUser;

  if (!emailUser || !emailPass) return;

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

  try {
    await transporter.sendMail({
      from: `"PathXpress" <${emailUser}>`,
      to: adminEmail,
      subject: `Nueva Orden: ${waybillNumber}`,
      html: `
        <h2 style="color:#1a1a1a;">Nueva Orden Recibida</h2>
        <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
          <tr><td style="padding:6px 12px;font-weight:bold;">Waybill</td><td style="padding:6px 12px;">${waybillNumber}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;">Cliente</td><td style="padding:6px 12px;">${customerName}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;">Teléfono</td><td style="padding:6px 12px;">${customerPhone}</td></tr>
        </table>
      `,
    });
  } catch (error: any) {
    console.warn('⚠️ Email notification failed:', error.message);
  }
}
