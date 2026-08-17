import { RequestQuoteForm } from './RequestQuote';

// Request Pickup uses the same form as Request Quote
export default function RequestPickup() {
  return <RequestQuoteForm mode="pickup" />;
}
