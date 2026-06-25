import { useState, useMemo, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Mail, Send, FlaskConical, Paperclip, X } from 'lucide-react';
import { TEMPLATES, FROMS, renderEmail, getTemplate, type Vars } from '@shared/emailTemplates';

function defaultsFor(key: string): Vars {
  const t = getTemplate(key);
  const v: Vars = {};
  t?.fields.forEach((f) => { v[f.name] = f.value; });
  return v;
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

  const template = useMemo(() => getTemplate(selectedKey)!, [selectedKey]);

  // On template change: reset fields, sender and subject.
  useEffect(() => {
    const t = getTemplate(selectedKey);
    if (!t) return;
    setValues(defaultsFor(selectedKey));
    setFromValue(t.from);
    setSubjectDirty(false);
    setAttachments([]);
  }, [selectedKey]);

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
