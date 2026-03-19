import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  LayoutDashboard,
  BarChart3,
  Package,
  Search,
  Calculator,
  Globe,
  RotateCcw,
  FileText,
  Wallet,
  Download,
  AlertCircle,
  BookOpen,
  Lightbulb,
} from 'lucide-react';

// ─── Internal helpers ────────────────────────────────────────────────────────

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-3 text-sm">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <span className="text-muted-foreground leading-relaxed">{step}</span>
        </li>
      ))}
    </ol>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10 text-sm">
      <Lightbulb className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
      <span className="text-muted-foreground">{children}</span>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-sm">
      <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
      <span className="text-muted-foreground">{children}</span>
    </div>
  );
}

// ─── Section header pattern ──────────────────────────────────────────────────

interface SectionHeaderProps {
  icon: React.ReactNode;
  colorClass: string;
  title: string;
  description: string;
}

function SectionHeader({ icon, colorClass, title, description }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg ${colorClass}`}>{icon}</div>
      <div className="text-left">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground font-normal">{description}</p>
      </div>
    </div>
  );
}

// ─── Quick-nav pills data ────────────────────────────────────────────────────

const SECTIONS = [
  { label: 'Overview', icon: <LayoutDashboard className="h-3 w-3" /> },
  { label: 'Analytics', icon: <BarChart3 className="h-3 w-3" /> },
  { label: 'My Orders', icon: <Package className="h-3 w-3" /> },
  { label: 'Track Shipment', icon: <Search className="h-3 w-3" /> },
  { label: 'Rate Calculator', icon: <Calculator className="h-3 w-3" /> },
  { label: 'International', icon: <Globe className="h-3 w-3" /> },
  { label: 'Returns & Exchanges', icon: <RotateCcw className="h-3 w-3" /> },
  { label: 'Invoices', icon: <FileText className="h-3 w-3" /> },
  { label: 'COD', icon: <Wallet className="h-3 w-3" /> },
  { label: 'Reports', icon: <Download className="h-3 w-3" /> },
];

// ─── Main component ──────────────────────────────────────────────────────────

export default function CustomerPortalGuide() {
  return (
    <div className="space-y-6">
      {/* Hero header */}
      <Card className="border border-primary/10 rounded-2xl overflow-hidden shadow-xl shadow-primary/5">
        <div className="h-1 bg-gradient-to-r from-primary to-primary/20" />
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-3 text-2xl">
            <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
              <BookOpen className="h-6 w-6" />
            </div>
            PathXpress Customer Portal — Guide
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm leading-relaxed">
            A complete reference for using every feature of your customer portal. Expand any section below to see step-by-step instructions, tips, and important notes.
          </p>
        </CardContent>
      </Card>

      {/* Quick-nav pills */}
      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <Badge
            key={s.label}
            variant="outline"
            className="flex items-center gap-1.5 py-1 px-2.5 text-xs cursor-default select-none"
          >
            {s.icon}
            {s.label}
          </Badge>
        ))}
      </div>

      {/* Accordion sections */}
      <Accordion type="multiple" defaultValue={['overview']} className="space-y-3">

        {/* 1. Overview */}
        <AccordionItem
          value="overview"
          className="bg-card border border-primary/10 rounded-xl px-4 shadow-sm"
        >
          <AccordionTrigger className="hover:no-underline py-4">
            <SectionHeader
              icon={<LayoutDashboard className="h-5 w-5" />}
              colorClass="bg-primary/10 text-primary"
              title="Overview"
              description="Your dashboard at a glance — stats, trends and quick actions"
            />
          </AccordionTrigger>
          <AccordionContent>
            <div className="pt-1 pb-4 space-y-4">
              <StepList
                steps={[
                  'At the top you will find three stat cards: Shipments This Month, On-Time Delivery %, and Pending COD Amount.',
                  'The percentage badge on each card compares the current month against the previous month (green = up, red = down).',
                  'Below the stats, the performance chart shows your daily shipment volume. Use the "7 days" / "30 days" toggle to change the time range.',
                  'The Recent Orders table gives you a quick view of the latest shipments without leaving the Overview.',
                  'Use the Quick Actions buttons to jump directly to Create Shipment, Rate Calculator, or Track Shipment.',
                ]}
              />
              <Tip>Stats are fetched automatically every time you open or refresh the portal. No manual action required.</Tip>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 2. Analytics */}
        <AccordionItem
          value="analytics"
          className="bg-card border border-primary/10 rounded-xl px-4 shadow-sm"
        >
          <AccordionTrigger className="hover:no-underline py-4">
            <SectionHeader
              icon={<BarChart3 className="h-5 w-5" />}
              colorClass="bg-blue-500/10 text-blue-500"
              title="Analytics"
              description="Charts and KPIs for your shipment volume, revenue and on-time rates"
            />
          </AccordionTrigger>
          <AccordionContent>
            <div className="pt-1 pb-4 space-y-4">
              <StepList
                steps={[
                  'Click "Analytics" in the sidebar to open this section.',
                  'Use the 7-day / 30-day toggle at the top right of each chart to change the period.',
                  'The Volume Over Time area chart shows total shipments created per day.',
                  'The Status Breakdown pie chart shows the proportion of Delivered, In Transit, Pending, and other statuses.',
                  'The Performance Trends bar chart compares on-time delivery rates across the selected period.',
                ]}
              />
              <Tip>Hover over any data point on the charts to see the exact value for that day.</Tip>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 3. My Orders */}
        <AccordionItem
          value="orders"
          className="bg-card border border-primary/10 rounded-xl px-4 shadow-sm"
        >
          <AccordionTrigger className="hover:no-underline py-4">
            <SectionHeader
              icon={<Package className="h-5 w-5" />}
              colorClass="bg-green-500/10 text-green-500"
              title="My Orders"
              description="View, filter, download and manage all your domestic shipments"
            />
          </AccordionTrigger>
          <AccordionContent>
            <div className="pt-1 pb-4 space-y-4">
              <StepList
                steps={[
                  'Click "My Orders" in the sidebar.',
                  'Use the Status filter dropdown to show only specific statuses (e.g. Pending Pickup, In Transit, Delivered).',
                  'Set the "Date From" and "Date To" fields to narrow orders by creation date.',
                  'Click the waybill number in any row to open the tracking timeline for that shipment.',
                  'Click the download icon on a row to save that individual waybill as a PDF.',
                  'To download multiple waybills at once, check the checkboxes on the desired rows and click "Download Waybills (N)".',
                  'Click "Export Excel" to download a spreadsheet of all currently visible orders.',
                  'To cancel an order still in Pending Pickup, click the red X icon at the end of its row.',
                ]}
              />
              <Note>Bulk waybill download requires either specific rows to be selected OR a date range to be set.</Note>
              <Tip>Leave all filters empty to see all your orders since account creation.</Tip>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 4. Track Shipment */}
        <AccordionItem
          value="tracking"
          className="bg-card border border-primary/10 rounded-xl px-4 shadow-sm"
        >
          <AccordionTrigger className="hover:no-underline py-4">
            <SectionHeader
              icon={<Search className="h-5 w-5" />}
              colorClass="bg-purple-500/10 text-purple-500"
              title="Track Shipment"
              description="Real-time tracking and full scan history for any waybill"
            />
          </AccordionTrigger>
          <AccordionContent>
            <div className="pt-1 pb-4 space-y-4">
              <StepList
                steps={[
                  'Click "Track Shipment" in the sidebar.',
                  'Type the waybill number (e.g. PX123456) into the search field.',
                  'Press Enter or click the Search button.',
                  'The timeline below shows every scan event: status, location, and timestamp (Dubai timezone).',
                  'If a Proof of Delivery (POD) photo is available, it will appear at the bottom of the timeline.',
                ]}
              />
              <Tip>You can also click any waybill number directly in the My Orders table — it will open the tracking dialog instantly without switching tabs.</Tip>
              <Tip>The search icon at the top of the sidebar also accepts a waybill number for a quick lookup from any tab.</Tip>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 5. Rate Calculator */}
        <AccordionItem
          value="calculator"
          className="bg-card border border-primary/10 rounded-xl px-4 shadow-sm"
        >
          <AccordionTrigger className="hover:no-underline py-4">
            <SectionHeader
              icon={<Calculator className="h-5 w-5" />}
              colorClass="bg-orange-500/10 text-orange-500"
              title="Rate Calculator"
              description="Instant domestic shipping rate estimates for DOM and SDD services"
            />
          </AccordionTrigger>
          <AccordionContent>
            <div className="pt-1 pb-4 space-y-4">
              <StepList
                steps={[
                  'Click "Rate Calculator" in the sidebar.',
                  'Select the service type: DOM (Standard next-day delivery) or SDD (Same-Day Delivery).',
                  'Enter the package weight in kilograms.',
                  'Optionally enter dimensions (Length × Width × Height in cm). The system will use whichever is greater: actual weight or volumetric weight.',
                  'Select the destination emirate from the dropdown.',
                  'The estimated rate is displayed instantly — no button press needed.',
                  'If the shipment has a COD component, enable the COD toggle and enter the COD amount to see the added fee.',
                ]}
              />
              <Note>The calculator shows estimated rates based on your account tier. Final invoice amounts may differ slightly based on actual measurements at pickup.</Note>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 6. International */}
        <AccordionItem
          value="international"
          className="bg-card border border-primary/10 rounded-xl px-4 shadow-sm"
        >
          <AccordionTrigger className="hover:no-underline py-4">
            <SectionHeader
              icon={<Globe className="h-5 w-5" />}
              colorClass="bg-cyan-500/10 text-cyan-500"
              title="International"
              description="Rate quotes and booking for cross-border shipments"
            />
          </AccordionTrigger>
          <AccordionContent>
            <div className="pt-1 pb-4 space-y-4">
              <StepList
                steps={[
                  'Click "International" in the sidebar (only visible if international shipping is enabled on your account).',
                  'Use the Rate Calculator at the top to check the available service options and rates: select the destination country, enter weight and dimensions.',
                  'To create a shipment, click "Create International Shipment".',
                  'Phase 1 — Quote: Fill in origin, destination country, package weight and dimensions, then click "Get Quote". Review the service options and prices.',
                  'Phase 2 — Booking: Select your preferred service, fill in shipper and consignee details, declare customs value and item description, then click "Confirm Booking".',
                  'A waybill is generated and you can download it immediately after confirmation.',
                ]}
              />
              <Note>International shipping must be activated on your account. Contact support at support@pathxpress.net to enable it.</Note>
              <Tip>You can save a shipper profile in Phase 2 so you don't have to retype shipper details on future shipments.</Tip>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 7. Returns & Exchanges */}
        <AccordionItem
          value="returns"
          className="bg-card border border-primary/10 rounded-xl px-4 shadow-sm"
        >
          <AccordionTrigger className="hover:no-underline py-4">
            <SectionHeader
              icon={<RotateCcw className="h-5 w-5" />}
              colorClass="bg-rose-500/10 text-rose-500"
              title="Returns & Exchanges"
              description="Create reverse logistics shipments linked to original orders"
            />
          </AccordionTrigger>
          <AccordionContent>
            <div className="pt-1 pb-4 space-y-4">
              <StepList
                steps={[
                  'Click "Returns & Exchanges" in the sidebar.',
                  'Search for the original order using its waybill number.',
                  'Select the operation type: Return (customer sends item back to you) or Exchange (new item is delivered and the old one is collected simultaneously).',
                  'For a Return: confirm the pickup address (customer) and the delivery address (your warehouse). A new reverse waybill is created.',
                  'For an Exchange: fill in the new item details and destination. Two legs are created — one outbound for the new item and one inbound for the old item.',
                  'If needed, adjust the COD amount for the reverse shipment before submitting.',
                  'If the original waybill is not available, use the "Manual Creation" option to enter the addresses directly.',
                ]}
              />
              <Tip>The new waybill generated for a Return or Exchange is linked to the original order and will appear in My Orders with a distinct status badge.</Tip>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 8. Invoices */}
        <AccordionItem
          value="invoices"
          className="bg-card border border-primary/10 rounded-xl px-4 shadow-sm"
        >
          <AccordionTrigger className="hover:no-underline py-4">
            <SectionHeader
              icon={<FileText className="h-5 w-5" />}
              colorClass="bg-indigo-500/10 text-indigo-500"
              title="Invoices"
              description="View, filter and download your billing documents"
            />
          </AccordionTrigger>
          <AccordionContent>
            <div className="pt-1 pb-4 space-y-4">
              <StepList
                steps={[
                  'Click "Invoices" in the sidebar.',
                  'Use the Status filter to show only Pending, Paid, or Overdue invoices.',
                  'Set a date range to find invoices from a specific period.',
                  'Use the search box to look up an invoice by number or reference.',
                  'Click the eye icon on any row to open a detailed view of all line items, taxes, and the outstanding balance.',
                  'Click the download icon to save a PDF copy of the invoice to your device.',
                  'Click "Export Excel" to download all currently visible invoices as a spreadsheet.',
                ]}
              />
              <Note>Invoices are generated on the cycle agreed with your account manager (weekly or monthly). Contact support if an expected invoice is missing.</Note>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 9. COD */}
        <AccordionItem
          value="cod"
          className="bg-card border border-primary/10 rounded-xl px-4 shadow-sm"
        >
          <AccordionTrigger className="hover:no-underline py-4">
            <SectionHeader
              icon={<Wallet className="h-5 w-5" />}
              colorClass="bg-amber-500/10 text-amber-500"
              title="COD — Cash on Delivery"
              description="Track collected amounts, remittances and pending settlements"
            />
          </AccordionTrigger>
          <AccordionContent>
            <div className="pt-1 pb-4 space-y-4">
              <StepList
                steps={[
                  'Click "COD" in the sidebar.',
                  'The three summary cards at the top show: Total Pending COD, Collected This Month, and Total Remitted to Date.',
                  'Scroll down to the COD Records table to see the per-shipment breakdown: waybill, COD amount, collection date, and status.',
                  'Use the Status and Date filters to narrow the records.',
                  'Click "View Remittance" on any remittance entry to see the grouped settlement details and bank transfer reference.',
                  'Click "Export" to download the COD records or remittance data as an Excel file.',
                ]}
              />
              <Tip>COD funds are remitted on the schedule agreed with your account manager. The status badge will change from "Pending" to "Remitted" once the bank transfer has been processed.</Tip>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 10. Reports */}
        <AccordionItem
          value="reports"
          className="bg-card border border-primary/10 rounded-xl px-4 shadow-sm"
        >
          <AccordionTrigger className="hover:no-underline py-4">
            <SectionHeader
              icon={<Download className="h-5 w-5" />}
              colorClass="bg-teal-500/10 text-teal-500"
              title="Reports"
              description="Download monthly order and COD reports in PDF or Excel"
            />
          </AccordionTrigger>
          <AccordionContent>
            <div className="pt-1 pb-4 space-y-4">
              <StepList
                steps={[
                  'Click "Reports" in the sidebar.',
                  'Select the month you need from the dropdown (the last 12 months are available).',
                  'Click "Download PDF" to get a formatted monthly report with order details and COD summary.',
                  'Click "Download Excel" to get a spreadsheet version of the same data — useful for further analysis.',
                ]}
              />
              <Tip>Monthly reports are most useful at month-end for reconciliation with your warehouse, finance team, or accounting software.</Tip>
            </div>
          </AccordionContent>
        </AccordionItem>

      </Accordion>

      {/* Footer support note */}
      <Card className="border border-primary/10 rounded-xl shadow-sm">
        <CardContent className="pt-4 pb-4">
          <p className="text-sm text-muted-foreground text-center">
            Need further assistance?{' '}
            <span className="text-primary font-medium">support@pathxpress.net</span>
            {' · '}
            <span className="text-primary font-medium">+971 522 803 433</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
