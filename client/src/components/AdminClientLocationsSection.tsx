import { trpc } from '@/lib/trpc';
import ClientLocationsManager, { type LocationFormValues } from '@/components/ClientLocationsManager';

interface AdminClientLocationsSectionProps {
    clientId: number;
}

/**
 * Full CRUD over a client's saved locations, from the admin side. No count
 * cap here (unlike the client's own self-service limit) — support may need to
 * set up several warehouses for a client during onboarding.
 */
export default function AdminClientLocationsSection({ clientId }: AdminClientLocationsSectionProps) {
    const utils = trpc.useUtils();
    const locationsQuery = trpc.portal.admin.adminGetClientSavedShippers.useQuery({ clientId });

    const invalidate = () => utils.portal.admin.adminGetClientSavedShippers.invalidate({ clientId });

    const createMutation = trpc.portal.admin.adminCreateClientSavedShipper.useMutation({ onSuccess: invalidate });
    const updateMutation = trpc.portal.admin.adminUpdateClientSavedShipper.useMutation({ onSuccess: invalidate });
    const setDefaultMutation = trpc.portal.admin.adminSetDefaultClientSavedShipper.useMutation({ onSuccess: invalidate });
    const deleteMutation = trpc.portal.admin.adminDeleteClientSavedShipper.useMutation({ onSuccess: invalidate });

    return (
        <ClientLocationsManager
            locations={locationsQuery.data ?? []}
            isLoading={locationsQuery.isLoading}
            helperText="These locations auto-fill as the shipper (or consignee, for returns) whenever this client is used to create an order or an exchange — the default one is used automatically, with its exact map pin."
            onCreate={async (values: LocationFormValues) => {
                await createMutation.mutateAsync({ clientId, ...values });
            }}
            onUpdate={async (id: number, values: LocationFormValues) => {
                await updateMutation.mutateAsync({ clientId, shipperId: id, ...values });
            }}
            onSetDefault={async (id: number) => {
                await setDefaultMutation.mutateAsync({ clientId, shipperId: id });
            }}
            onDelete={async (id: number) => {
                await deleteMutation.mutateAsync({ clientId, shipperId: id });
            }}
        />
    );
}
