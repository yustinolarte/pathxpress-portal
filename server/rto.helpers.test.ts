import { describe, it, expect } from 'vitest';
import {
  billingDestination,
  buildRtoRevert,
  buildRtoSwap,
  canUndoRto,
  deliveredStatusFor,
  isRtoEligible,
  parseRtoSnapshot,
  type RtoOrderFields,
} from '@shared/rto';

function makeOrder(overrides: Partial<RtoOrderFields> = {}): RtoOrderFields {
  return {
    status: 'failed_delivery',
    isReturn: 0,
    isRto: 0,
    rtoSnapshot: null,
    shipperName: 'Shop LLC',
    shipperAddress: 'Warehouse 4, Al Quoz',
    shipperCity: 'Dubai',
    shipperCountry: 'UAE',
    shipperPhone: '+971 501111111',
    shipperLat: '25.1300',
    shipperLng: '55.2300',
    customerName: 'Jane Customer',
    customerPhone: '+971 552222222',
    address: 'Villa 9, Al Jimi',
    city: 'Al Ain',
    emirate: 'Abu Dhabi',
    postalCode: '00000',
    destinationCountry: 'UAE',
    latitude: '24.2200',
    longitude: '55.7400',
    locationAccuracy: 'exact',
    codRequired: 1,
    codAmount: '250.00',
    codCurrency: 'AED',
    codPaymentMethod: 'cash',
    fitOnDelivery: 1,
    preferredDeliveryDate: '2026-10-25',
    preferredDeliveryTime: '18:00',
    ...overrides,
  };
}

/** The order row after the update is written. */
function applyUpdate(order: RtoOrderFields, update: ReturnType<typeof buildRtoSwap>): RtoOrderFields {
  const { rtoAt: _rtoAt, ...fields } = update;
  return { ...order, ...fields };
}

describe('isRtoEligible', () => {
  it('allows shipments that left the shipper and are not closed', () => {
    for (const status of ['picked_up', 'in_transit', 'out_for_delivery', 'delivery_attempted', 'failed_delivery', 'on_hold']) {
      expect(isRtoEligible(makeOrder({ status }))).toBe(true);
    }
  });

  it('rejects pending pickup and closed statuses', () => {
    for (const status of ['pending_pickup', 'delivered', 'returned_to_sender', 'returned', 'canceled']) {
      expect(isRtoEligible(makeOrder({ status }))).toBe(false);
    }
  });

  it('rejects return waybills, orders already returning and international orders', () => {
    expect(isRtoEligible(makeOrder({ isReturn: 1 }))).toBe(false);
    expect(isRtoEligible(makeOrder({ isRto: 1 }))).toBe(false);
    expect(isRtoEligible(makeOrder({ destinationCountry: 'Saudi Arabia' }))).toBe(false);
    expect(isRtoEligible(makeOrder({ destinationCountry: '' }))).toBe(true);
  });
});

describe('buildRtoSwap', () => {
  it('sends the delivery leg to the shipper', () => {
    const update = buildRtoSwap(makeOrder());
    expect(update).toMatchObject({
      customerName: 'Shop LLC',
      customerPhone: '+971 501111111',
      address: 'Warehouse 4, Al Quoz',
      city: 'Dubai',
      destinationCountry: 'UAE',
      latitude: '25.1300',
      longitude: '55.2300',
      locationAccuracy: 'exact',
      postalCode: null,
      shipperName: 'Jane Customer',
      shipperPhone: '+971 552222222',
      shipperAddress: 'Villa 9, Al Jimi',
      shipperCity: 'Al Ain',
      shipperLat: '24.2200',
      shipperLng: '55.7400',
      isRto: 1,
    });
  });

  it('derives the emirate from the shipper city', () => {
    expect(buildRtoSwap(makeOrder({ shipperCity: 'Ajman' })).emirate).toBe('Ajman');
    expect(buildRtoSwap(makeOrder({ shipperCity: 'Atlantis' })).emirate).toBeNull();
  });

  it('marks the location as missing when the shipper has no pin', () => {
    const update = buildRtoSwap(makeOrder({ shipperLat: null, shipperLng: null }));
    expect(update.locationAccuracy).toBe('none');
    expect(update.latitude).toBeNull();
  });

  it('drops COD (amount included), FOD and the preferred slot', () => {
    expect(buildRtoSwap(makeOrder())).toMatchObject({
      codRequired: 0,
      codAmount: null,
      codCurrency: null,
      codPaymentMethod: null,
      fitOnDelivery: 0,
      preferredDeliveryDate: null,
      preferredDeliveryTime: null,
    });
  });

  it('moves the order back to in_transit unless a driver already has it out', () => {
    expect(buildRtoSwap(makeOrder({ status: 'failed_delivery' })).status).toBe('in_transit');
    expect(buildRtoSwap(makeOrder({ status: 'on_hold' })).status).toBe('in_transit');
    expect(buildRtoSwap(makeOrder({ status: 'out_for_delivery' })).status).toBe('out_for_delivery');
  });

  it('keeps the original values in the snapshot', () => {
    const snapshot = parseRtoSnapshot(buildRtoSwap(makeOrder()).rtoSnapshot);
    expect(snapshot).toMatchObject({
      status: 'failed_delivery',
      rtoStatus: 'in_transit',
      customerName: 'Jane Customer',
      city: 'Al Ain',
      codAmount: '250.00',
    });
  });
});

describe('buildRtoRevert', () => {
  it('restores every original field', () => {
    const original = makeOrder();
    const rto = applyUpdate(original, buildRtoSwap(original));
    const reverted = applyUpdate(rto, buildRtoRevert(rto)!);
    expect(reverted).toEqual({ ...original, isRto: 0, rtoSnapshot: null });
  });

  it('keeps a newer status the order reached after the RTO', () => {
    const original = makeOrder();
    const rto = { ...applyUpdate(original, buildRtoSwap(original)), status: 'delivery_attempted' };
    expect(buildRtoRevert(rto)!.status).toBe('delivery_attempted');
  });

  it('returns null without a usable snapshot', () => {
    expect(buildRtoRevert(makeOrder({ isRto: 1, rtoSnapshot: null }))).toBeNull();
    expect(buildRtoRevert(makeOrder({ isRto: 1, rtoSnapshot: '{broken' }))).toBeNull();
  });
});

describe('canUndoRto', () => {
  it('only while the return is still open', () => {
    expect(canUndoRto({ isRto: 1, status: 'in_transit' })).toBe(true);
    expect(canUndoRto({ isRto: 1, status: 'returned_to_sender' })).toBe(false);
    expect(canUndoRto({ isRto: 0, status: 'in_transit' })).toBe(false);
  });
});

describe('deliveredStatusFor', () => {
  it('closes an RTO as returned_to_sender', () => {
    expect(deliveredStatusFor({ isRto: 1 })).toBe('returned_to_sender');
    expect(deliveredStatusFor({ isRto: 0 })).toBe('delivered');
    expect(deliveredStatusFor({})).toBe('delivered');
  });
});

describe('billingDestination', () => {
  it('prices an RTO at the original consignee, not the shipper', () => {
    const original = makeOrder();
    const rto = applyUpdate(original, buildRtoSwap(original));
    expect(billingDestination(rto)).toEqual({
      city: 'Al Ain', emirate: 'Abu Dhabi', latitude: '24.2200', longitude: '55.7400',
    });
  });

  it('uses the live destination for normal orders', () => {
    expect(billingDestination(makeOrder({ city: 'Sharjah', emirate: 'Sharjah' }))).toMatchObject({ city: 'Sharjah' });
  });
});
