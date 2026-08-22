import { trpc } from '@/lib/trpc';
import ClientLocationsManager, { type LocationFormValues } from '@/components/ClientLocationsManager';

const MAX_LOCATIONS = 10;

/**
 * Self-service CRUD over the client's own saved locations. Scoped entirely to
 * their own account (server enforces clientId from the session) — no access
 * to any other client-settings capability (rates, COD, services stay admin-only).
 */
export default function CustomerLocationsSection() {
    const utils = trpc.useUtils();
    const locationsQuery = trpc.portal.customer.getSavedShippers.useQuery();

    const invalidate = () => utils.portal.customer.getSavedShippers.invalidate();

    const createMutation = trpc.portal.customer.createSavedShipper.useMutation({ onSuccess: invalidate });
    const updateMutation = trpc.portal.customer.updateSavedShipper.useMutation({ onSuccess: invalidate });
    const setDefaultMutation = trpc.portal.customer.setDefaultSavedShipper.useMutation({ onSuccess: invalidate });
    const deleteMutation = trpc.portal.customer.deleteSavedShipper.useMutation({ onSuccess: invalidate });

    return (
        <ClientLocationsManager
            locations={locationsQuery.data ?? []}
            isLoading={locationsQuery.isLoading}
            maxLocations={MAX_LOCATIONS}
            helperText="Save your shop, warehouse or return address here. Your default location auto-fills as the shipper on every new shipment and exchange — with its exact map pin, so drivers don't need to search for it."
            onCreate={async (values: LocationFormValues) => {
                await createMutation.mutateAsync(values);
            }}
            onUpdate={async (id: number, values: LocationFormValues) => {
                await updateMutation.mutateAsync({ shipperId: id, ...values });
            }}
            onSetDefault={async (id: number) => {
                await setDefaultMutation.mutateAsync({ shipperId: id });
            }}
            onDelete={async (id: number) => {
                await deleteMutation.mutateAsync({ shipperId: id });
            }}
        />
    );
}
