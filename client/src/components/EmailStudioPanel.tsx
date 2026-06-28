import { useState, useMemo, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Mail, Send, FlaskConical, Paperclip, X, FileText, Loader2 } from 'lucide-react';
import { TEMPLATES, FROMS, renderEmail, getTemplate, type Vars } from '@shared/emailTemplates';
import { generateInvoicePDF } from '@/utils/invoicePdfGenerator';

function defaultsFor(key: string): Vars {
  const t = getTemplate(key);
  const v: Vars = {};
  t?.fields.forEach((f) => { v[f.name] = f.value; });
  return v;
}

// "2062.00" → "AED 2,062.00"
function fmtMoney(currency: string, amount: string | number): string {
  const n = Number(amount);
  if (!isFinite(n)) return `${currency} ${amount}`;
  return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Date → "01 Jun 2026"
function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Keep total attachments under the 10 MB request body limit (base64 inflates ~33%).
const MAX_ATTACH_BYTES = 7 * 1024 * 1024;

interface AttachmentDraft { filename: string; content: string; contentType: string; size: number; }

function fileToAttachment(file: File): Promise<AttachmentDraft> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.slice(result.indexOf(',') + 1) : result;
      resolve({ filename: file.name, content: base64, contentType: file.type || 'application/octet-stream', size: file.size });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatBytes(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function EmailStudioPanel() {
  const [selectedKey, setSelectedKey] = useState<string>(TEMPLATES[0].key);
  const [values, setValues] = useState<Vars>(() => defaultsFor(TEMPLATES[0].key));
  const [fromValue, setFromValue] = useState<string>(TEMPLATES[0].from);
  const [to, setTo] = useState('');
  const [testTo, setTestTo] = useState('');
  const [subjectText, setSubjectText] = useState('');
  const [subjectDirty, setSubjectDirty] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [selectedRemittanceId, setSelectedRemittanceId] = useState<string>('');
  const [pickerLoading, setPickerLoading] = useState(false);

  const utils = trpc.useUtils();
  const template = useMemo(() => getTemplate(selectedKey)!, [selectedKey]);
  const isInvoice = selectedKey === 'invoice';
  const isRemittance = selectedKey === 'cod_remittance';

  // Record-picker data (only loaded for the templates that use it).
  const { data: allInvoices } = trpc.portal.billing.getAllInvoices.useQuery(undefined, { enabled: isInvoice });
  const { data: clients } = trpc.portal.admin.getClients.useQuery(undefined, { enabled: isInvoice });
  const { data: allRemittances } = trpc.portal.cod.getAllRemittances.useQuery(undefined, { enabled: isRemittance });

  // On template change: reset fields, sender and subject.
  useEffect(() => {
    const t = getTemplate(selectedKey);
    if (!t) return;
    setValues(defaultsFor(selectedKey));
    setFromValue(t.from);
    setSubjectDirty(false);
    setAttachments([]);
    setSelectedInvoiceId('');
    setSelectedRemittanceId('');
  }, [selectedKey]);

  // Pick an existing invoice → auto-fill all fields, set the recipient and attach the PDF.
  async function applyInvoice(idStr: string) {
    setSelectedInvoiceId(idStr);
    const id = Number(idStr);
    const inv = (allInvoices ?? []).find((i) => i.id === id);
    if (!inv) return;
    const client = (clients ?? []).find((c) => c.id === inv.clientId);
    const currency = inv.currency || 'AED';

    setValues({
      ...defaultsFor('invoice'),
      client_name: client?.companyName || `Client #${inv.clientId}`,
      period: `${fmtDate(inv.periodFrom)} – ${fmtDate(inv.periodTo)}`,
      shipment_count: String(inv.shipmentCount ?? ''),
      subtotal: fmtMoney(currency, inv.subtotal),
      vat: fmtMoney(currency, inv.taxes || '0'),
      total: fmtMoney(currency, inv.total),
      invoice_number: inv.invoiceNumber,
      issued_date: fmtDate(inv.issueDate),
      due_date: fmtDate(inv.dueDate),
      pdf_url: 'https://pathxpress.net/portal/customer?tab=invoices',
      pay_url: client?.paymentLink || 'https://pathxpress.net/portal/customer?tab=invoices',
    });
    if (client?.billingEmail) setTo(client.billingEmail);

    // Build the invoice PDF in-browser and attach it to the email.
    setPickerLoading(true);
    try {
      const details = await utils.portal.billing.getInvoiceDetails.fetch({ invoiceId: id });
      const blob = generateInvoicePDF({
        id: details.invoice.id,
        invoiceNumber: details.invoice.invoiceNumber,
        clientName: client?.companyName || `Client #${inv.clientId}`,
        billingAddress: client?.billingAddress || null,
        billingEmail: client?.billingEmail || null,
        issueDate: new Date(details.invoice.issueDate),
        dueDate: new Date(details.invoice.dueDate),
        periodStart: new Date(details.invoice.periodFrom),
        periodEnd: new Date(details.invoice.periodTo),
        subtotal: details.invoice.subtotal,
        tax: details.invoice.taxes || '0',
        total: details.invoice.total,
        amountPaid: details.invoice.amountPaid || '0',
        balance: details.invoice.balance || details.invoice.total,
        status: details.invoice.status,
        currency: details.invoice.currency,
        isAdjusted: !!details.invoice.isAdjusted,
        adjustmentNotes: details.invoice.adjustmentNotes || null,
        items: details.items.map((item) => ({ id: item.id, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, amount: item.total })),
      }, { output: 'blob' }) as Blob;

      const base64 = await blobToBase64(blob);
      setAttachments([{ filename: `Invoice-${details.invoice.invoiceNumber}.pdf`, content: base64, contentType: 'application/pdf', size: blob.size }]);
      toast.success('Invoice loaded — PDF attached');
    } catch {
      toast.error('Could not load the invoice PDF');
    } finally {
      setPickerLoading(false);
    }
  }

  // Pick an existing COD remittance → auto-fill all fields, set the recipient and attach the receipt PDF.
  async function applyRemittance(idStr: string) {
    setSelectedRemittanceId(idStr);
    const id = Number(idStr);
    const rem = (allRemittances ?? []).find((r) => r.id === id);
    if (!rem) return;
    const client = rem.client;
    const currency = rem.currency || 'AED';

    setPickerLoading(true);
    try {
      const details = await utils.portal.cod.getRemittanceDetails.fetch({ remittanceId: id });

      // The remittance has no stored period, so derive it from the COD records' collection dates.
      const times = (details.items ?? [])
        .map((it) => it.codRecord?.collectedDate)
        .filter((d): d is NonNullable<typeof d> => !!d)
        .map((d) => new Date(d).getTime())
        .filter((n) => !isNaN(n));
      const period = times.length
        ? `${fmtDate(new Date(Math.min(...times)))} – ${fmtDate(new Date(Math.max(...times)))}`
        : fmtDate(rem.processedDate || rem.createdAt);

      setValues({
        ...defaultsFor('cod_remittance'),
        client_name: client?.companyName || `Client #${rem.clientId}`,
        period,
        count: String(rem.shipmentCount ?? ''),
        gross: fmtMoney(currency, rem.grossAmount),
        handling_fee: '—', // remittances track a single fee, mapped to "COD fee" below
        cod_fee: `− ${fmtMoney(currency, rem.feeAmount || '0')}`,
        net: fmtMoney(currency, rem.totalAmount),
        reference: rem.remittanceNumber,
        bank: client?.companyName || '',
        receipt_url: 'https://pathxpress.net/portal/customer?tab=cod',
      });
      if (client?.billingEmail) setTo(client.billingEmail);

      const { generateRemittancePDF } = await import('@/lib/reportUtils');
      const blob = generateRemittancePDF(details.remittance, details.items).output('blob') as Blob;
      const base64 = await blobToBase64(blob);
      setAttachments([{ filename: `Remittance-${details.remittance.remittanceNumber}.pdf`, content: base64, contentType: 'application/pdf', size: blob.size }]);
      toast.success('Remittance loaded — PDF attached');
    } catch {
      toast.error('Could not load the remittance PDF');
    } finally {
      setPickerLoading(false);
    }
  }

  // Preview render + automatic subject.
  const rendered = useMemo(
    () => renderEmail(selectedKey, values, fromValue),
    [selectedKey, values, fromValue],
  );

  // Keep the subject in sync with the auto value until the user edits it manually.
  useEffect(() => {
    if (!subjectDirty && rendered) setSubjectText(rendered.subject);
  }, [rendered, subjectDirty]);

  const sendMutation = trpc.portal.email.send.useMutation({
    onSuccess: (res) => {
      toast.success(`Email sent to ${res.to}`);
    },
    onError: (err) => {
      toast.error(err.message || 'Could not send the email');
    },
  });

  function doSend(recipient: string) {
    const target = recipient.trim();
    if (!target) {
      toast.error('Enter a destination email');
      return;
    }
    sendMutation.mutate({
      templateKey: selectedKey,
      from: fromValue,
      to: target,
      vars: values,
      subjectOverride: subjectText.trim() || undefined,
      attachments: attachments.length
        ? attachments.map(({ filename, content, contentType }) => ({ filename, content, contentType }))
        : undefined,
    });
  }

  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const incoming: AttachmentDraft[] = [];
    for (const file of Array.from(list)) {
      try {
        incoming.push(await fileToAttachment(file));
      } catch {
        toast.error(`Could not read ${file.name}`);
      }
    }
    setAttachments((prev) => {
      const next = [...prev, ...incoming];
      const total = next.reduce((s, a) => s + a.size, 0);
      if (total > MAX_ATTACH_BYTES) {
        toast.error('Attachments exceed the 7 MB total limit.');
        return prev;
      }
      return next;
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,380px)_minmax(0,1fr)] gap-4">
      {/* RAIL: template list */}
      <Card className="h-fit">
        <CardContent className="p-3 space-y-1">
          <div className="flex items-center gap-2 px-2 py-2 text-sm font-semibold text-muted-foreground">
            <Mail className="h-4 w-4" /> Templates
          </div>
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              onClick={() => setSelectedKey(t.key)}
              className={
                'w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ' +
                (t.key === selectedKey
                  ? 'bg-[#E10600] text-white'
                  : 'text-foreground hover:bg-muted')
              }
            >
              {t.label}
            </button>
          ))}
        </CardContent>
      </Card>

      {/* FORM */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div>
            <h3 className="text-lg font-bold tracking-tight">{template.label}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Template: {template.key}</p>
          </div>

          {isInvoice && (
            <div className="border-t pt-3 space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                {pickerLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                Load from existing invoice
              </Label>
              <Select value={selectedInvoiceId} onValueChange={applyInvoice} disabled={pickerLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={pickerLoading ? 'Loading…' : 'Select an invoice to auto-fill'} />
                </SelectTrigger>
                <SelectContent>
                  {(allInvoices ?? []).map((inv) => {
                    const client = (clients ?? []).find((c) => c.id === inv.clientId);
                    return (
                      <SelectItem key={inv.id} value={String(inv.id)}>
                        {inv.invoiceNumber} · {client?.companyName || `Client #${inv.clientId}`} · {fmtMoney(inv.currency || 'AED', inv.total)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Auto-fills every field, sets the recipient and attaches the invoice PDF.</p>
            </div>
          )}

          {isRemittance && (
            <div className="border-t pt-3 space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                {pickerLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                Load from existing remittance
              </Label>
              <Select value={selectedRemittanceId} onValueChange={applyRemittance} disabled={pickerLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={pickerLoading ? 'Loading…' : 'Select a remittance to auto-fill'} />
                </SelectTrigger>
                <SelectContent>
                  {(allRemittances ?? []).map((rem) => (
                    <SelectItem key={rem.id} value={String(rem.id)}>
                      {rem.remittanceNumber} · {rem.client?.companyName || `Client #${rem.clientId}`} · {fmtMoney(rem.currency || 'AED', rem.totalAmount)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Auto-fills every field, sets the recipient and attaches the remittance receipt PDF.</p>
            </div>
          )}

          <div className="border-t pt-3 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">From (sender)</Label>
              <Select value={fromValue} onValueChange={setFromValue}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FROMS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">To (real recipient)</Label>
              <Input
                type="email"
                placeholder="customer@email.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Subject</Label>
              <Input
                type="text"
                value={subjectText}
                onChange={(e) => { setSubjectText(e.target.value); setSubjectDirty(true); }}
              />
            </div>
          </div>

          <div className="border-t pt-3 space-y-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">
              Email content
            </div>
            {template.fields.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <Label className="text-xs">{f.label}</Label>
                {f.type === 'textarea' ? (
                  <Textarea
                    rows={3}
                    value={values[f.name] ?? ''}
                    onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))}
                  />
                ) : (
                  <Input
                    type="text"
                    value={values[f.name] ?? ''}
                    onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>

          {template.attachments && (
            <div className="border-t pt-3 space-y-2">
              <Label className="text-xs">Attachments</Label>
              <label className="flex items-center justify-center gap-2 w-full rounded-lg border border-dashed border-input px-3 py-3 text-sm text-muted-foreground cursor-pointer hover:bg-muted transition-colors">
                <Paperclip className="h-4 w-4" />
                <span>Add files (PDF, images…)</span>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => { void addFiles(e.target.files); e.currentTarget.value = ''; }}
                />
              </label>
              {attachments.length > 0 && (
                <ul className="space-y-1.5">
                  {attachments.map((a, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 rounded-md bg-muted px-2.5 py-1.5 text-xs">
                      <span className="truncate">{a.filename}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-muted-foreground font-mono">{formatBytes(a.size)}</span>
                        <button
                          type="button"
                          onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-muted-foreground hover:text-[#E10600]"
                          aria-label={`Remove ${a.filename}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-muted-foreground">Up to 7 MB total · files are attached to the email the recipient receives.</p>
            </div>
          )}

          <div className="border-t pt-3 space-y-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Test email (sent to you)</Label>
              <Input
                type="email"
                placeholder="your-email@pathxpress.net"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              className="w-full"
              disabled={sendMutation.isPending}
              onClick={() => doSend(testTo)}
            >
              <FlaskConical className="h-4 w-4 mr-2" /> Send test
            </Button>
            <Button
              className="w-full bg-[#E10600] hover:bg-[#c50500] text-white"
              disabled={sendMutation.isPending}
              onClick={() => {
                if (!to.trim()) { toast.error('Enter the recipient email'); return; }
                if (window.confirm(`Send this email to ${to.trim()}?`)) doSend(to);
              }}
            >
              <Send className="h-4 w-4 mr-2" />
              {sendMutation.isPending ? 'Sending…' : 'Send to recipient'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* PREVIEW */}
      <Card className="h-fit">
        <CardContent className="p-4">
          <div className="text-sm font-semibold text-muted-foreground mb-3">
            Preview · <span className="text-foreground">{template.label}</span>
          </div>
          <div className="rounded-xl overflow-hidden border bg-white">
            <iframe
              title="Email preview"
              srcDoc={rendered?.html ?? ''}
              className="w-full"
              style={{ height: 1200, border: 0, display: 'block', background: '#fff' }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
