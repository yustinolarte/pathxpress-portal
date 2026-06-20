/* ============================================================
   PATHXPRESS — Email templates (shared client + server)
   HTML with inline CSS, compatible with Gmail / Outlook / Apple Mail.
   The brand layout (navy header, footer, red X) is FIXED.
   The client uses it for the PREVIEW; the server for SENDING
   (server-side render to guarantee the brand).
   ============================================================ */

// Brand palette
export const C = {
  navy: '#0A1628', red: '#E10600', ink: '#16181C', slate: '#5A5F67',
  muted: '#8A8F98', line: '#E8E6E0', mist: '#F7F6F2',
  green: '#1F8A5B', amber: '#B5790A', blue: '#2A6FDB',
} as const;

// Hosted brand images (same as the Welcome FINAL).
export const HEADER_IMG = 'https://res.cloudinary.com/du7z4fgxl/image/upload/v1781948708/pathxpress-header_cozaso.png';
export const LOCK_IMG = 'https://res.cloudinary.com/du7z4fgxl/image/upload/v1781948707/pathxpress-lock_mi1tfz.png';

// Allowed senders (allowlist). Must belong to a domain verified in Resend.
export interface FromOption { label: string; value: string; }
export const FROMS: FromOption[] = [
  { label: '🧪 TEST — Resend <onboarding@resend.dev>', value: 'PATHXPRESS <onboarding@resend.dev>' },
  { label: 'PATHXPRESS <welcome@pathxpress.net>', value: 'PATHXPRESS <welcome@pathxpress.net>' },
  { label: 'PATHXPRESS <envios@pathxpress.net>', value: 'PATHXPRESS <envios@pathxpress.net>' },
  { label: 'PATHXPRESS · Finance <finanzas@pathxpress.net>', value: 'PATHXPRESS Finance <finanzas@pathxpress.net>' },
  { label: 'PATHXPRESS · Billing <facturacion@pathxpress.net>', value: 'PATHXPRESS Billing <facturacion@pathxpress.net>' },
  { label: 'PATHXPRESS <info@pathxpress.net>', value: 'PATHXPRESS <info@pathxpress.net>' },
];

export type Vars = Record<string, string>;

/* ---------- block helpers (all inline) ---------- */
const esc = (s: unknown): string => String(s == null ? '' : s);
const nl = (s: unknown): string => esc(s).replace(/\n/g, '<br/>');

type Tone = 'green' | 'amber' | 'blue' | 'red';
function tag(text: string, tone: Tone): string {
  const map: Record<Tone, [string, string]> = {
    green: ['#E9F3EE', C.green], amber: ['#F6EFD9', C.amber],
    blue: ['#E5EEFB', C.blue], red: ['#FBE5E5', C.red],
  };
  const t = map[tone] || map.green;
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td style="background:' + t[0] + ';border-radius:30px;padding:6px 13px;font-family:\'Outfit\',Arial,sans-serif;font-weight:600;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:' + t[1] + ';">' +
    '&#9679;&nbsp; ' + esc(text) + '</td></tr></table>';
}

const h1 = (t: string): string =>
  '<h1 style="margin:18px 0 0;font-family:\'Outfit\',Arial,sans-serif;font-weight:700;font-size:26px;line-height:1.15;letter-spacing:-.025em;color:' + C.ink + ';">' + esc(t) + '</h1>';

const lede = (htmlStr: string): string =>
  '<p style="margin:12px 0 0;font-family:\'Hanken Grotesk\',Arial,sans-serif;font-size:15px;line-height:1.6;color:' + C.slate + ';">' + htmlStr + '</p>';

const note = (t: string): string =>
  '<p style="margin:12px 0 0;font-family:\'Hanken Grotesk\',Arial,sans-serif;font-size:11.5px;line-height:1.5;color:' + C.muted + ';">' + esc(t) + '</p>';

function cta(label: string, href?: string, ghost?: boolean): string {
  const h = href || '#';
  if (ghost) {
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;"><tr>' +
      '<td align="center" style="border:1.5px solid ' + C.line + ';border-radius:30px;">' +
      '<a href="' + esc(h) + '" style="display:inline-block;font-family:\'Outfit\',Arial,sans-serif;font-weight:600;font-size:15px;color:' + C.navy + ';text-decoration:none;padding:15px 40px;border-radius:30px;">' + esc(label) + '</a>' +
      '</td></tr></table>';
  }
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;"><tr>' +
    '<td align="center" bgcolor="' + C.red + '" style="background:' + C.red + ';border-radius:30px;">' +
    '<a href="' + esc(h) + '" style="display:inline-block;font-family:\'Outfit\',Arial,sans-serif;font-weight:600;font-size:15px;color:#ffffff;text-decoration:none;padding:15px 44px;border-radius:30px;">' + esc(label) + '</a>' +
    '</td></tr></table>';
}

function tcard(kLabel: string, kVal: string, etaLabel: string, etaVal: string): string {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;border:1px solid ' + C.line + ';border-radius:14px;background:' + C.mist + ';"><tr><td style="padding:20px 22px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td valign="top"><div style="font-family:\'Space Mono\',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:' + C.muted + ';">' + esc(kLabel) + '</div>' +
    '<div style="font-family:\'Space Mono\',monospace;font-size:16px;font-weight:700;color:' + C.ink + ';margin-top:3px;">' + esc(kVal) + '</div></td>' +
    '<td valign="top" align="right"><div style="font-family:\'Space Mono\',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:' + C.muted + ';">' + esc(etaLabel) + '</div>' +
    '<div style="font-family:\'Outfit\',Arial,sans-serif;font-size:18px;font-weight:700;color:' + C.red + ';margin-top:3px;">' + esc(etaVal) + '</div></td>' +
    '</tr></table></td></tr></table>';
}

interface Step { label: string; time?: string; state?: 'done' | 'now' | ''; }
function steps(items: Step[]): string {
  const cells = items.map((s) => {
    const dot = s.state === 'done' ? C.green : s.state === 'now' ? C.red : '#D4D2CC';
    return '<td align="center" valign="top" width="25%" style="width:25%;">' +
      '<div style="width:14px;height:14px;border-radius:50%;background:' + dot + ';margin:0 auto 8px;"></div>' +
      '<div style="font-family:\'Outfit\',Arial,sans-serif;font-size:11px;font-weight:600;color:' + C.slate + ';">' + esc(s.label) + '</div>' +
      '<div style="font-family:\'Space Mono\',monospace;font-size:10px;color:' + C.muted + ';margin-top:2px;">' + esc(s.time || '—') + '</div>' +
      '</td>';
  }).join('');
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;"><tr>' + cells + '</tr></table>';
}

interface GridCell { label: string; html: string; }
function addrGrid(left: GridCell, right: GridCell): string {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;border-top:1px solid ' + C.line + ';"><tr>' +
    '<td class="stack" valign="top" width="50%" style="width:50%;padding:22px 20px 0 0;">' +
    '<div style="font-family:\'Space Mono\',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:' + C.muted + ';">' + esc(left.label) + '</div>' +
    '<div style="font-family:\'Hanken Grotesk\',Arial,sans-serif;font-size:13.5px;line-height:1.6;color:' + C.ink + ';margin-top:6px;">' + left.html + '</div></td>' +
    '<td class="stack stack-last" valign="top" width="50%" style="width:50%;padding:22px 0 0 20px;">' +
    '<div style="font-family:\'Space Mono\',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:' + C.muted + ';">' + esc(right.label) + '</div>' +
    '<div style="font-family:\'Hanken Grotesk\',Arial,sans-serif;font-size:13.5px;line-height:1.6;color:' + C.ink + ';margin-top:6px;">' + right.html + '</div></td>' +
    '</tr></table>';
}

const bold = (t: string): string =>
  '<span style="font-family:\'Outfit\',Arial,sans-serif;font-weight:600;">' + esc(t) + '</span>';

interface CredRow { label: string; value: string; href?: string; }
function creds(title: string, rows: CredRow[]): string {
  const inner = rows.map((r, i) => {
    const border = i < rows.length - 1 ? 'border-bottom:1px solid ' + C.line + ';' : '';
    const val = r.href ? '<a href="' + esc(r.href) + '" style="color:' + C.ink + ';text-decoration:none;">' + esc(r.value) + '</a>' : esc(r.value);
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="' + border + '"><tr><td style="padding:13px 0;">' +
      '<div style="font-family:\'Space Mono\',monospace;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:' + C.muted + ';">' + esc(r.label) + '</div>' +
      '<div style="font-family:\'Space Mono\',monospace;font-size:14.5px;font-weight:700;color:' + C.ink + ';margin-top:3px;">' + val + '</div>' +
      '</td></tr></table>';
  }).join('');
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;border:1px solid ' + C.line + ';border-radius:14px;overflow:hidden;">' +
    '<tr><td bgcolor="' + C.navy + '" style="background:' + C.navy + ';padding:13px 20px;">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td valign="middle" style="padding-right:9px;line-height:0;"><img src="' + LOCK_IMG + '" width="16" height="16" alt="" style="display:block;width:16px;height:16px;border:0;" /></td>' +
    '<td valign="middle" style="font-family:\'Outfit\',Arial,sans-serif;font-weight:600;font-size:13.5px;color:#ffffff;">' + esc(title) + '</td>' +
    '</tr></table></td></tr>' +
    '<tr><td style="padding:6px 20px 18px;">' + inner + '</td></tr></table>';
}

interface OnbItem { title: string; desc: string; }
function onb(items: OnbItem[]): string {
  const rows = items.map((o, i) => {
    const border = i < items.length - 1 ? 'border-bottom:1px solid ' + C.line + ';' : '';
    return '<tr><td style="padding:14px 0;' + border + '"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
      '<td valign="top" width="44" style="width:44px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
      '<td align="center" valign="middle" width="30" height="30" bgcolor="' + C.red + '" style="width:30px;height:30px;background:' + C.red + ';border-radius:9px;font-family:\'Outfit\',Arial,sans-serif;font-weight:700;font-size:14px;color:#ffffff;">' + (i + 1) + '</td>' +
      '</tr></table></td>' +
      '<td valign="top"><div style="font-family:\'Outfit\',Arial,sans-serif;font-weight:600;font-size:14.5px;color:' + C.ink + ';">' + esc(o.title) + '</div>' +
      '<div style="font-family:\'Hanken Grotesk\',Arial,sans-serif;font-size:13px;color:' + C.muted + ';margin-top:2px;">' + esc(o.desc) + '</div></td>' +
      '</tr></table></td></tr>';
  }).join('');
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">' + rows + '</table>';
}

interface SumRow { label: string; value: string; }
function sumtable(rows: SumRow[], total: SumRow): string {
  const body = rows.map((r) =>
    '<tr><td style="padding:11px 0;border-bottom:1px solid ' + C.line + ';font-family:\'Hanken Grotesk\',Arial,sans-serif;font-size:13.5px;color:' + C.slate + ';">' + esc(r.label) + '</td>' +
    '<td align="right" style="padding:11px 0;border-bottom:1px solid ' + C.line + ';font-family:\'Space Mono\',monospace;font-size:13.5px;color:' + C.ink + ';">' + esc(r.value) + '</td></tr>'
  ).join('');
  const tot = '<tr><td style="padding-top:16px;font-family:\'Outfit\',Arial,sans-serif;font-weight:700;font-size:17px;color:' + C.ink + ';">' + esc(total.label) + '</td>' +
    '<td align="right" style="padding-top:16px;font-family:\'Outfit\',Arial,sans-serif;font-weight:700;font-size:17px;color:' + C.red + ';">' + esc(total.value) + '</td></tr>';
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;">' + body + tot + '</table>';
}

function pod(photoUrl: string, receivedBy: string, timeLoc: string): string {
  const img = photoUrl
    ? '<img src="' + esc(photoUrl) + '" width="100%" style="display:block;width:100%;height:auto;border:0;" alt="Proof of delivery"/>'
    : '<div style="height:150px;background:#ECEAE4;text-align:center;line-height:150px;font-family:\'Space Mono\',monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8C8F96;">Photo · proof of delivery</div>';
  const row = (k: string, v: string): string =>
    '<tr><td style="padding:14px 18px;border-top:1px solid ' + C.line + ';"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td style="font-family:\'Hanken Grotesk\',Arial,sans-serif;font-size:12.5px;color:' + C.muted + ';">' + esc(k) + '</td>' +
    '<td align="right" style="font-family:\'Outfit\',Arial,sans-serif;font-weight:600;font-size:12.5px;color:' + C.ink + ';">' + esc(v) + '</td>' +
    '</tr></table></td></tr>';
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;border:1px solid ' + C.line + ';border-radius:14px;overflow:hidden;">' +
    '<tr><td style="padding:0;font-size:0;line-height:0;">' + img + '</td></tr>' +
    row('Received by', receivedBy) + row('Time · location', timeLoc) + '</table>';
}

/* ---------- email wrapper (fixed header + footer) ---------- */
export function wrap(bodyInner: string, fromEmail: string): string {
  return '<!doctype html><html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head>' +
    '<meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>' +
    '<meta http-equiv="X-UA-Compatible" content="IE=edge"/><meta name="x-apple-disable-message-reformatting"/>' +
    '<meta name="color-scheme" content="light only"/><meta name="supported-color-schemes" content="light only"/>' +
    '<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->' +
    '<style>' +
    'body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}' +
    'table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}' +
    'img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;display:block;}' +
    'body{margin:0;padding:0;width:100%!important;height:100%!important;}' +
    '@media only screen and (max-width:660px){.container{width:100%!important;}.stack{display:block!important;width:100%!important;padding:0 0 18px 0!important;}.stack-last{padding-bottom:0!important;}}' +
    '</style></head>' +
    '<body style="margin:0;padding:0;background:#ffffff;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;"><tr><td align="center" style="padding:24px 16px;">' +
    '<table role="presentation" class="container" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;background:#ffffff;">' +
    // HEADER (full-bleed image, square corners)
    '<tr><td bgcolor="' + C.navy + '" style="background:' + C.navy + ';padding:0;font-size:0;line-height:0;">' +
    '<img src="' + HEADER_IMG + '" width="640" alt="PATHXPRESS" style="display:block;width:100%;max-width:640px;height:auto;border:0;" />' +
    '</td></tr>' +
    // BODY
    '<tr><td style="padding:36px;font-family:\'Hanken Grotesk\',Arial,Helvetica,sans-serif;color:' + C.ink + ';">' + bodyInner + '</td></tr>' +
    // FOOTER
    '<tr><td bgcolor="' + C.mist + '" style="background:' + C.mist + ';padding:26px 36px;border-top:2px solid ' + C.red + ';">' +
    '<div style="font-family:\'Outfit\',Arial,sans-serif;font-weight:600;font-size:12.5px;">' +
    '<a href="https://pathxpress.net/portal/login" style="color:' + C.navy + ';text-decoration:none;">Sign in</a>&nbsp;&nbsp;&nbsp;' +
    '<a href="https://pathxpress.net" style="color:' + C.navy + ';text-decoration:none;">Help center</a>&nbsp;&nbsp;&nbsp;' +
    '<a href="mailto:info@pathxpress.net" style="color:' + C.navy + ';text-decoration:none;">Contact us</a></div>' +
    '<p style="margin:14px 0 0;font-family:\'Hanken Grotesk\',Arial,sans-serif;font-size:11.5px;line-height:1.6;color:' + C.muted + ';">' +
    'PATHXPRESS FZCO · IFZA, Dubai, UAE · ' + esc(fromEmail) + ' · +971 58 814 2535</p>' +
    '<p style="margin:10px 0 0;font-family:\'Outfit\',Arial,sans-serif;font-weight:700;font-size:15px;color:' + C.red + ';">X</p>' +
    '</td></tr>' +
    '</table></td></tr></table></body></html>';
}

export function repl(tpl: string, v: Vars): string {
  return String(tpl).replace(/\{\{(\w+)\}\}/g, (_, k: string) => (v[k] != null ? v[k] : ''));
}

/* ============================================================
   TEMPLATE DEFINITIONS
   ============================================================ */
export type FieldType = 'text' | 'textarea';
export interface TemplateField { name: string; label: string; type: FieldType; value: string; }
export interface EmailTemplate {
  key: string;
  label: string;
  from: string;
  subject: string;
  fields: TemplateField[];
  render: (v: Vars) => string;
}

export const TEMPLATES: EmailTemplate[] = [
  /* 1) WELCOME + CREDENTIALS */
  {
    key: 'welcome',
    label: 'Welcome + access',
    from: 'PATHXPRESS <welcome@pathxpress.net>',
    subject: 'Welcome to PathXpress — your portal is ready',
    fields: [
      { name: 'client_name', label: 'Client company', type: 'text', value: 'Prasha Lifestyle' },
      { name: 'contact_name', label: 'Contact name', type: 'text', value: 'Prasha Lifestyle team' },
      { name: 'portal_url', label: 'Portal URL', type: 'text', value: 'pathxpress.net/portal/login' },
      { name: 'username', label: 'Email / username', type: 'text', value: 'prasha@pathxpress.net' },
      { name: 'temp_password', label: 'Temporary password', type: 'text', value: 'Prasha2026' },
      { name: 'manager_name', label: 'Account manager', type: 'text', value: 'Angelica Ospina' },
      { name: 'manager_email', label: 'Manager email', type: 'text', value: 'angelica@pathxpress.net' },
      { name: 'manager_phone', label: 'Manager phone', type: 'text', value: '+971 58 814 2535' },
      { name: 'services', label: 'Enabled services', type: 'textarea', value: 'Same-day · Next-day\nCash on Delivery (COD)\nFit on Delivery (FOD)' },
    ],
    render: (v) =>
      tag('Account activated', 'green') +
      h1('Welcome aboard, ' + esc(v.client_name) + '.') +
      lede('Hi ' + esc(v.contact_name) + ', your PathXpress account is live. You can now create shipments, track deliveries in real time, manage COD, and download invoices — all from your client portal. Here are your login details to get started.') +
      creds('Your portal credentials', [
        { label: 'Portal URL', value: v.portal_url, href: 'https://' + v.portal_url },
        { label: 'Email / username', value: v.username, href: 'mailto:' + v.username },
        { label: 'Temporary password', value: v.temp_password },
      ]) +
      note("For your security, you'll be asked to set a new password the first time you sign in. Never share your password — PathXpress staff will never ask for it.") +
      cta('Sign in & set password', 'https://' + v.portal_url) +
      onb([
        { title: 'Sign in and secure your account', desc: 'Use the credentials above, then set your own password.' },
        { title: 'Create your first shipment', desc: "Add a recipient, pick a service, and we'll generate the label." },
        { title: 'Book a pickup', desc: 'Tell us when to collect — we handle the rest across all 7 Emirates.' },
      ]) +
      addrGrid(
        { label: 'Your account manager', html: bold(v.manager_name) + '<br/><a href="mailto:' + esc(v.manager_email) + '" style="color:' + C.ink + ';text-decoration:none;">' + esc(v.manager_email) + '</a><br/><a href="tel:' + esc(v.manager_phone) + '" style="color:' + C.ink + ';text-decoration:none;">' + esc(v.manager_phone) + '</a>' },
        { label: 'Enabled services', html: nl(v.services) },
      ) +
      cta('Create my first shipment', 'https://' + v.portal_url, true),
  },

  /* 2) SHIPMENT CONFIRMED */
  {
    key: 'shipment_created',
    label: 'Shipment confirmed',
    from: 'PATHXPRESS <envios@pathxpress.net>',
    subject: 'Your shipment {{tracking_number}} is confirmed',
    fields: [
      { name: 'recipient_name', label: 'Recipient (name)', type: 'text', value: 'Khalid' },
      { name: 'sender', label: 'Sender (client)', type: 'text', value: 'Lumen Tech' },
      { name: 'tracking_number', label: 'Tracking number', type: 'text', value: 'PX-DXB-9051' },
      { name: 'eta', label: 'Estimated delivery', type: 'text', value: 'Tomorrow, before 18:00' },
      { name: 'registered_time', label: 'Registered time', type: 'text', value: 'Today 09:14' },
      { name: 'address', label: 'Delivery address', type: 'textarea', value: 'Khalid M.\nMarina Gate 1, Apt 2204\nDubai Marina, Dubai' },
      { name: 'details', label: 'Shipment details', type: 'textarea', value: 'Same-day service\n1 package · 0.8 kg\nNo COD' },
      { name: 'track_url', label: 'Tracking URL', type: 'text', value: 'https://pathxpress.net/track/PX-DXB-9051' },
    ],
    render: (v) =>
      tag('Pickup scheduled', 'amber') +
      h1("We've registered your shipment.") +
      lede('Hi ' + esc(v.recipient_name) + ', ' + bold(v.sender) + " has created a shipment in your name. We'll pick it up today and let you know as soon as it's out for delivery.") +
      tcard('Tracking number', v.tracking_number, 'Estimated delivery', v.eta) +
      steps([
        { label: 'Registered', time: v.registered_time, state: 'now' },
        { label: 'Picked up', time: '—', state: '' },
        { label: 'Out for delivery', time: '—', state: '' },
        { label: 'Delivered', time: '—', state: '' },
      ]) +
      addrGrid({ label: 'Deliver to', html: nl(v.address) }, { label: 'Details', html: nl(v.details) }) +
      cta('Track shipment', v.track_url),
  },

  /* 3) OUT FOR DELIVERY */
  {
    key: 'out_for_delivery',
    label: 'Out for delivery',
    from: 'PATHXPRESS <envios@pathxpress.net>',
    subject: 'Your package ships today — arriving approx. {{eta_window}}',
    fields: [
      { name: 'driver', label: 'Driver', type: 'text', value: 'Rashid' },
      { name: 'tracking_number', label: 'Tracking number', type: 'text', value: 'PX-AUH-4821' },
      { name: 'eta_window', label: 'Arrival window', type: 'text', value: 'Today 13:50–14:20' },
      { name: 'address', label: 'Delivery address', type: 'textarea', value: 'Mariam S.\nCorniche Rd, Tower 3, 12B\nAbu Dhabi' },
      { name: 'cod', label: 'To collect (COD)', type: 'textarea', value: 'AED 240.00\nCash or card\nHave the amount ready' },
      { name: 'map_url', label: 'Map URL', type: 'text', value: 'https://pathxpress.net/track/PX-AUH-4821' },
    ],
    render: (v) =>
      tag('Out for delivery', 'blue') +
      h1('Your package is on its way.') +
      lede('Our driver ' + bold(v.driver) + ' has your order and will arrive today within the estimated window. Keep your phone handy in case they need to reach you.') +
      tcard('Tracking number', v.tracking_number, 'Arrives approx.', v.eta_window) +
      steps([
        { label: 'Registered', time: 'Yesterday', state: 'done' },
        { label: 'Picked up', time: '08:02', state: 'done' },
        { label: 'Out for delivery', time: '12:30', state: 'now' },
        { label: 'Delivered', time: '—', state: '' },
      ]) +
      addrGrid(
        { label: 'Deliver to', html: nl(v.address) },
        { label: 'To collect (COD)', html: '<span style="color:' + C.red + ';font-family:\'Outfit\',Arial,sans-serif;font-weight:600;">' + esc(String(v.cod).split('\n')[0]) + '</span><br/>' + nl(String(v.cod).split('\n').slice(1).join('\n')) },
      ) +
      cta('View on map', v.map_url),
  },

  /* 4) DELIVERED */
  {
    key: 'delivered',
    label: 'Delivered',
    from: 'PATHXPRESS <envios@pathxpress.net>',
    subject: '✓ Delivered — {{tracking_number}}',
    fields: [
      { name: 'tracking_number', label: 'Tracking number', type: 'text', value: 'PX-AUH-4821' },
      { name: 'delivered_at', label: 'Delivery time', type: 'text', value: 'today at 14:08' },
      { name: 'received_by', label: 'Received by', type: 'text', value: 'M. Saeed' },
      { name: 'time_loc', label: 'Time · location', type: 'text', value: '14:08 · Reception' },
      { name: 'pod_photo_url', label: 'POD photo URL (optional)', type: 'text', value: '' },
      { name: 'guide_detail', label: 'Shipment detail', type: 'textarea', value: 'PX-AUH-4821\nSame-day · Abu Dhabi' },
      { name: 'cod_collected', label: 'COD collected', type: 'textarea', value: 'AED 240.00\nPaid in cash' },
    ],
    render: (v) =>
      tag('Delivered', 'green') +
      h1('Done! Your package was delivered.') +
      lede('We delivered your shipment ' + bold(v.delivered_at) + ". Thanks for trusting PathXpress. Here's your proof of delivery.") +
      pod(v.pod_photo_url, v.received_by, v.time_loc) +
      addrGrid(
        { label: 'Tracking', html: nl(v.guide_detail) },
        { label: 'COD collected', html: '<span style="color:' + C.green + ';font-family:\'Outfit\',Arial,sans-serif;font-weight:600;">' + esc(String(v.cod_collected).split('\n')[0]) + '</span><br/>' + nl(String(v.cod_collected).split('\n').slice(1).join('\n')) },
      ) +
      cta('Something off? Let us know', 'mailto:info@pathxpress.net', true),
  },

  /* 5) COD REMITTANCE */
  {
    key: 'cod_remittance',
    label: 'COD remittance',
    from: 'PATHXPRESS Finance <finanzas@pathxpress.net>',
    subject: 'COD remittance {{reference}} sent — {{net}}',
    fields: [
      { name: 'client_name', label: 'Client', type: 'text', value: 'Najm Store' },
      { name: 'period', label: 'Period', type: 'text', value: '05–09 Jun 2026' },
      { name: 'count', label: 'Shipments collected', type: 'text', value: '9' },
      { name: 'gross', label: 'Gross COD', type: 'text', value: 'AED 2,485.00' },
      { name: 'handling_fee', label: 'Handling fee', type: 'text', value: '− AED 54.00' },
      { name: 'cod_fee', label: 'COD fee', type: 'text', value: '− AED 49.70' },
      { name: 'net', label: 'Net transferred', type: 'text', value: 'AED 2,381.30' },
      { name: 'reference', label: 'Reference', type: 'text', value: 'RMT-2026-0091' },
      { name: 'bank', label: 'Destination account', type: 'textarea', value: 'Najm Store\nEmirates NBD ••4471' },
      { name: 'receipt_url', label: 'Receipt URL', type: 'text', value: 'https://pathxpress.net/portal/remittances' },
    ],
    render: (v) =>
      tag('Remittance processed', 'green') +
      h1("We've sent your COD remittance.") +
      lede('Hi ' + esc(v.client_name) + ", we've transferred the net of your COD collections for the period " + bold(v.period) + '. Funds arrive in 2–3 business days.') +
      sumtable([
        { label: 'Shipments collected', value: v.count },
        { label: 'Gross COD', value: v.gross },
        { label: 'Handling fee', value: v.handling_fee },
        { label: 'COD fee', value: v.cod_fee },
      ], { label: 'Net transferred', value: v.net }) +
      addrGrid(
        { label: 'Reference', html: bold(v.reference) + '<br/>Bank transfer' },
        { label: 'Destination account', html: nl(v.bank) },
      ) +
      cta('Download receipt', v.receipt_url),
  },

  /* 6) INVOICE AVAILABLE */
  {
    key: 'invoice',
    label: 'Invoice available',
    from: 'PATHXPRESS Billing <facturacion@pathxpress.net>',
    subject: 'Invoice {{invoice_number}} available — due {{due_date}}',
    fields: [
      { name: 'client_name', label: 'Client', type: 'text', value: 'Atlas Retail' },
      { name: 'period', label: 'Period', type: 'text', value: '01–07 Jun 2026' },
      { name: 'shipment_count', label: 'No. of shipments', type: 'text', value: '128' },
      { name: 'subtotal', label: 'Subtotal', type: 'text', value: 'AED 2,062.00' },
      { name: 'vat', label: 'VAT (5%)', type: 'text', value: 'AED 103.10' },
      { name: 'total', label: 'Total due', type: 'text', value: 'AED 2,165.10' },
      { name: 'invoice_number', label: 'Invoice number', type: 'text', value: 'INV-2026-0418' },
      { name: 'issued_date', label: 'Issue date', type: 'text', value: '12 Jun 2026' },
      { name: 'due_date', label: 'Due date', type: 'text', value: '26 Jun 2026' },
      { name: 'pdf_url', label: 'PDF URL', type: 'text', value: 'https://pathxpress.net/portal/invoices/INV-2026-0418.pdf' },
      { name: 'pay_url', label: 'Payment URL', type: 'text', value: 'https://pathxpress.net/portal/pay/INV-2026-0418' },
    ],
    render: (v) =>
      tag('Payment pending', 'amber') +
      h1('Your weekly invoice is ready.') +
      lede('Hi ' + esc(v.client_name) + ', please find your invoice for the period ' + bold(v.period) + ' (' + esc(v.shipment_count) + ' shipments). Payment is due on ' + bold(v.due_date) + '.') +
      sumtable([
        { label: 'Subtotal', value: v.subtotal },
        { label: 'VAT (5%)', value: v.vat },
      ], { label: 'Total due', value: v.total }) +
      addrGrid(
        { label: 'Invoice', html: bold(v.invoice_number) + '<br/>Issued ' + esc(v.issued_date) },
        { label: 'Due date', html: '<span style="color:' + C.red + ';font-family:\'Outfit\',Arial,sans-serif;font-weight:600;">' + esc(v.due_date) + '</span><br/>14-day terms' },
      ) +
      cta('Download invoice (PDF)', v.pdf_url) +
      cta('Pay now', v.pay_url, true),
  },
];

export function getTemplate(key: string): EmailTemplate | undefined {
  return TEMPLATES.find((t) => t.key === key);
}

/** Renders subject + full HTML of a template. Used by client (preview) and server (send). */
export function renderEmail(key: string, vars: Vars, fromEmail: string): { subject: string; html: string } | null {
  const t = getTemplate(key);
  if (!t) return null;
  const merged: Vars = {};
  t.fields.forEach((f) => { merged[f.name] = vars[f.name] != null ? vars[f.name] : f.value; });
  return { subject: repl(t.subject, merged), html: wrap(t.render(merged), fromEmail) };
}

export function isAllowedFrom(value: string): boolean {
  return FROMS.some((f) => f.value === value);
}
