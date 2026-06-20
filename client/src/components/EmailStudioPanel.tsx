import { useState, useMemo, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Mail, Send, FlaskConical } from 'lucide-react';
import { TEMPLATES, FROMS, renderEmail, getTemplate, type Vars } from '@shared/emailTemplates';

function defaultsFor(key: string): Vars {
  const t = getTemplate(key);
  const v: Vars = {};
  t?.fields.forEach((f) => { v[f.name] = f.value; });
  return v;
}

export default function EmailStudioPanel() {
  const [selectedKey, setSelectedKey] = useState<string>(TEMPLATES[0].key);
  const [values, setValues] = useState<Vars>(() => defaultsFor(TEMPLATES[0].key));
  const [fromValue, setFromValue] = useState<string>(TEMPLATES[0].from);
  const [to, setTo] = useState('');
  const [testTo, setTestTo] = useState('');
  const [subjectText, setSubjectText] = useState('');
  const [subjectDirty, setSubjectDirty] = useState(false);

  const template = useMemo(() => getTemplate(selectedKey)!, [selectedKey]);

  // Al cambiar de plantilla: reset de campos, remitente y asunto.
  useEffect(() => {
    const t = getTemplate(selectedKey);
    if (!t) return;
    setValues(defaultsFor(selectedKey));
    setFromValue(t.from);
    setSubjectDirty(false);
  }, [selectedKey]);

  // Render de preview + asunto automático.
  const rendered = useMemo(
    () => renderEmail(selectedKey, values, fromValue),
    [selectedKey, values, fromValue],
  );

  // Sincroniza el asunto automático mientras el usuario no lo haya editado a mano.
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
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,380px)_minmax(0,1fr)] gap-4">
      {/* RAIL: lista de plantillas */}
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
