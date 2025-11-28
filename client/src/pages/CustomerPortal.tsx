import { useEffect } from 'react';
import { useLocation } from 'wouter';

export default function CustomerPortal() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Redirect to portal login
    setLocation('/portal/login');
  }, [setLocation]);

  return null;
}
