/**
 * Tests for the wizard's draft stop list and the per-leg coordinate resolver.
 *
 * The coordinate half matters because the two legs of an order sit at DIFFERENT
 * addresses. A pickup always reads the shipper columns and a delivery always
 * reads the consignee columns — including for returns/exchanges, since the
 * return-order creation code already writes those columns as the physical
 * pickup/delivery entity (not the original shipper/consignee). Getting this
 * backwards pins a pickup at the wrong door — and, worse, made the server
 * optimizer and the portal map disagree about where a stop actually is.
 */
import { describe, expect, it } from "vitest";
import { buildDraftStops, type SequencerStop } from "../client/src/lib/routeDraft";
import { stopLegCoords, stopLocationTarget } from "../client/src/lib/orderFilters";

const order = (over: Record<string, any> = {}) => ({
    id: 1,
    waybillNumber: "PX202600001-001",
    customerName: "Aisha",
    city: "Dubai",
    address: "Marina Gate 1",
    shipperName: "Noon",
    shipperCity: "Al Quoz",
    latitude: "25.0802",
    longitude: "55.1402",
    shipperLat: "25.1972",
    shipperLng: "55.2744",
    locationAccuracy: "exact",
    isReturn: 0,
    ...over,
});

const keys = (stops: SequencerStop[]) => stops.map(s => s.key);
const mapOf = (...orders: any[]) => new Map(orders.map(o => [o.id, o]));

describe("stopLocationTarget", () => {
    it("sends a normal pickup to the shipper and its delivery to the consignee", () => {
        expect(stopLocationTarget({ type: "pickup", isReturn: 0 })).toBe("shipper");
        expect(stopLocationTarget({ type: "delivery", isReturn: 0 })).toBe("delivery");
    });

    it("does not re-invert on a return — the order's columns are already the physical pickup/delivery entity", () => {
        expect(stopLocationTarget({ type: "pickup", isReturn: 1 })).toBe("shipper");
        expect(stopLocationTarget({ type: "delivery", isReturn: 1 })).toBe("delivery");
    });
});

describe("stopLegCoords", () => {
    it("uses the shipper pin for a pickup and the consignee pin for a delivery", () => {
        expect(stopLegCoords({ ...order(), type: "pickup" })).toMatchObject({ lat: 25.1972, lng: 55.2744 });
        expect(stopLegCoords({ ...order(), type: "delivery" })).toMatchObject({ lat: 25.0802, lng: 55.1402 });
    });

    it("keeps shipper-pin-for-pickup / consignee-pin-for-delivery on a return", () => {
        const ret = { ...order({ isReturn: 1 }) };
        expect(stopLegCoords({ ...ret, type: "pickup" })).toMatchObject({ lat: 25.1972, lng: 55.2744 });
        expect(stopLegCoords({ ...ret, type: "delivery" })).toMatchObject({ lat: 25.0802, lng: 55.1402 });
    });

    it("falls back to the consignee pin when the shipper has none, flagged approx", () => {
        const noShipper = { ...order({ shipperLat: null, shipperLng: null }), type: "pickup" };
        expect(stopLegCoords(noShipper)).toMatchObject({ lat: 25.0802, lng: 55.1402, approx: true });
    });

    it("returns nulls when neither end has coordinates", () => {
        const blind = {
            ...order({ latitude: null, longitude: null, shipperLat: null, shipperLng: null }),
            type: "delivery",
        };
        expect(stopLegCoords(blind)).toMatchObject({ lat: null, lng: null, approx: false });
    });

    it("tolerates empty strings and garbage", () => {
        expect(stopLegCoords({ ...order({ latitude: "", longitude: "" }), type: "delivery" }).lat).toBeNull();
        expect(stopLegCoords({ ...order({ latitude: "n/a", longitude: "n/a" }), type: "delivery" }).lat).toBeNull();
    });
});

describe("buildDraftStops", () => {
    it("expands 'both' into pickup then delivery", () => {
        const stops = buildDraftStops([{ id: 1, mode: "both" }], mapOf(order()));
        expect(keys(stops)).toEqual(["1:pickup", "1:delivery"]);
    });

    it("expands single-leg modes into one stop", () => {
        expect(keys(buildDraftStops([{ id: 1, mode: "pickup_only" }], mapOf(order())))).toEqual(["1:pickup"]);
        expect(keys(buildDraftStops([{ id: 1, mode: "delivery_only" }], mapOf(order())))).toEqual(["1:delivery"]);
    });

    it("labels each leg with the party the driver actually visits", () => {
        const [pickup, delivery] = buildDraftStops([{ id: 1, mode: "both" }], mapOf(order()));
        expect(pickup).toMatchObject({ customerName: "Noon", city: "Al Quoz" });
        expect(delivery).toMatchObject({ customerName: "Aisha", city: "Dubai" });
    });

    it("skips orders that aren't in the map instead of emitting blank stops", () => {
        expect(buildDraftStops([{ id: 99, mode: "both" }], mapOf(order()))).toEqual([]);
    });

    it("PRESERVES an arranged order when a new order is added", () => {
        const orders = mapOf(order({ id: 1 }), order({ id: 2, waybillNumber: "PX-2" }));
        const arranged = buildDraftStops(
            [{ id: 1, mode: "both" }],
            orders,
        ).reverse(); // admin dragged the delivery above the pickup's slot

        const next = buildDraftStops(
            [{ id: 1, mode: "both" }, { id: 2, mode: "delivery_only" }],
            orders,
            arranged,
        );
        // Existing legs keep the arranged positions; the new one lands at the end.
        expect(keys(next)).toEqual(["1:delivery", "1:pickup", "2:delivery"]);
    });

    it("drops legs whose order was deselected", () => {
        const orders = mapOf(order({ id: 1 }), order({ id: 2, waybillNumber: "PX-2" }));
        const previous = buildDraftStops(
            [{ id: 1, mode: "both" }, { id: 2, mode: "both" }],
            orders,
        );
        const next = buildDraftStops([{ id: 2, mode: "both" }], orders, previous);
        expect(keys(next)).toEqual(["2:pickup", "2:delivery"]);
    });

    it("reacts to a mode change by replacing the legs", () => {
        const orders = mapOf(order());
        const previous = buildDraftStops([{ id: 1, mode: "both" }], orders);
        const next = buildDraftStops([{ id: 1, mode: "delivery_only" }], orders, previous);
        expect(keys(next)).toEqual(["1:delivery"]);
    });

    it("carries the resolved per-leg coordinates through", () => {
        const [pickup, delivery] = buildDraftStops([{ id: 1, mode: "both" }], mapOf(order()));
        expect(pickup).toMatchObject({ lat: 25.1972, lng: 55.2744 });
        expect(delivery).toMatchObject({ lat: 25.0802, lng: 55.1402 });
    });

    it("returns an empty list for an empty selection", () => {
        expect(buildDraftStops([], mapOf(order()))).toEqual([]);
    });
});
