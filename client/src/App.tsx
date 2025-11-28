import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Tracking from "./pages/Tracking";
import TrackShipment from "./pages/TrackShipment";
import RequestQuote from "./pages/RequestQuote";
import RequestPickup from "./pages/RequestPickup";
import Pricing from "./pages/Pricing";
import CustomerPortal from "./pages/CustomerPortal";
import Contact from "./pages/Contact";
import Services from "./pages/Services";
import About from "./pages/About";
import { Privacy, Terms, Refund, Accessibility } from "./pages/Legal";
import PortalLogin from "./pages/portal/PortalLogin";
import AdminDashboard from "./pages/portal/AdminDashboard";
import CustomerDashboard from "./pages/portal/CustomerDashboard";

function Router() {
  return (
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
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
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
