import { trpc } from '@/lib/trpc';

export interface PortalUser {
  userId: number;
  email: string;
  role: 'admin' | 'customer';
  clientId?: number;
}

export function usePortalAuth() {
  const utils = trpc.useUtils();

  const { data: sessionData, isLoading } = trpc.portal.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.portal.auth.logout.useMutation({
    onSuccess: () => {
      utils.portal.auth.me.invalidate();
    },
  });

  const user: PortalUser | null = sessionData?.user
    ? {
        userId: sessionData.user.userId,
        email: sessionData.user.email,
        role: sessionData.user.role as 'admin' | 'customer',
        clientId: sessionData.user.clientId,
      }
    : null;

  const logout = () => {
    logoutMutation.mutate();
  };

  return {
    user,
    loading: isLoading,
    isAuthenticated: !!user,
    logout,
    // Kept for backward compatibility — no-ops since auth is now cookie-based
    setLoading: (_: boolean) => {},
    setUser: (_: PortalUser | null) => {},
  };
}
