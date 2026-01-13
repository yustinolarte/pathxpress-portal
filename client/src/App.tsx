import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { lazy, Suspense } from "react";
import { Spinner } from "@/components/ui/spinner";

const NotFound = lazy(() => import("@/pages/NotFound"));
const Home = lazy(() => import("./pages/Home"));
const Tracking = lazy(() => import("./pages/Tracking"));
const TrackShipment = lazy(() => import("./pages/TrackShipment"));
const RequestQuote = lazy(() => import("./pages/RequestQuote"));
const RequestPickup = lazy(() => import("./pages/RequestPickup"));
const Pricing = lazy(() => import("./pages/Pricing"));
const CustomerPortal = lazy(() => import("./pages/CustomerPortal"));
const Contact = lazy(() => import("./pages/Contact"));
const Services = lazy(() => import("./pages/Services"));
const About = lazy(() => import("./pages/About"));
const PortalLogin = lazy(() => import("./pages/portal/PortalLogin"));
const AdminDashboard = lazy(() => import("./pages/portal/AdminDashboard"));
const CustomerDashboard = lazy(() => import("./pages/portal/CustomerDashboard"));

// Lazy load named exports from Legal
const Privacy = lazy(() => import("./pages/Legal").then(module => ({ default: module.Privacy })));
const Terms = lazy(() => import("./pages/Legal").then(module => ({ default: module.Terms })));
const Refund = lazy(() => import("./pages/Legal").then(module => ({ default: module.Refund })));
const Accessibility = lazy(() => import("./pages/Legal").then(module => ({ default: module.Accessibility })));

// SEO Landing Pages
const SameDayDeliveryDubai = lazy(() => import("./pages/seo/SameDayDeliveryDubai"));
const NextDayDeliveryUAE = lazy(() => import("./pages/seo/NextDayDeliveryUAE"));
const CashOnDeliveryUAE = lazy(() => import("./pages/seo/CashOnDeliveryUAE"));
const EcommerceLastMileUAE = lazy(() => import("./pages/seo/EcommerceLastMileUAE"));

function Router() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Spinner className="size-10" /></div>}>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/tracking"} component={Tracking} />
        <Route path={"/track"} component={TrackShipment} />
        <Route path="/request-quote" component={RequestQuote} />
        <Route path="/request-pickup" component={RequestPickup} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/customer-portal" component={CustomerPortal} />
        <Route path="/portal/login" component={PortalLogin} />
        <Route path="/portal/admin" component={AdminDashboard} />
        <Route path="/portal/customer" component={CustomerDashboard} />
        <Route path="/contact" component={Contact} />
        <Route path="/services" component={Services} />
        <Route path="/about" component={About} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/terms" component={Terms} />
        <Route path="/refund" component={Refund} />
        <Route path="/accessibility" component={Accessibility} />
        {/* SEO Landing Pages */}
        <Route path="/same-day-delivery-dubai" component={SameDayDeliveryDubai} />
        <Route path="/next-day-delivery-uae" component={NextDayDeliveryUAE} />
        <Route path="/cash-on-delivery-uae" component={CashOnDeliveryUAE} />
        <Route path="/ecommerce-last-mile-uae" component={EcommerceLastMileUAE} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="dark"
      // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
