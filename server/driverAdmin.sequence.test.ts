/**
 * Unit tests for the pure guards that protect a route's stop set.
 *
 * These exist because the originals failed open: an unknown order id fell back
 * to `{ canPickup: true, canDeliver: true, canBoth: true }` and created route
 * stops for an order that doesn't exist, and deleteRoute/removeOrderFromRoute
 * had no state check at all — deleting a worked route destroyed its POD photos
 * and silently moved that day's COD reconciliation, because routeOrders rows
 * are the only source both of those reports have.
 *
 * Everything here is DB-free on purpose: the rules live in pure functions and
 * the database wrappers around them stay thin.
 */
import { describe, expect, it } from "vitest";
import {
    assertRouteDeletable,
    assertStopsRemovable,
    assertStopSpecsAssignable,
    expandStopSpecs,
} from "./driverAdmin";
import type { AssignmentFlags, GuardableStop, RouteStopSpec } from "./driverAdmin";

const ALL: AssignmentFlags = { canPickup: true, canDeliver: true, canBoth: true };
const flagsFor = (entries: Record<number, Partial<AssignmentFlags>>) =>
    new Map<number, AssignmentFlags>(
        Object.entries(entries).map(([id, f]) => [Number(id), { ...ALL, ...f }]),
    );

const legs = (specs: RouteStopSpec[]) => specs.map(s => `${s.orderId}:${s.type}`);

const openStop = (over: Partial<GuardableStop> = {}): GuardableStop => ({
    status: "pending",
    collectedAmount: null,
    proofPhotoUrl: null,
    proofPhotoUrl2: null,
    deliveredAt: null,
    pickedUpAt: null,
    attemptedAt: null,
    waybillNumber: "PX202600001-001",
    ...over,
});

describe("expandStopSpecs", () => {
    it("emits pickup then delivery for mode 'both'", () => {
        expect(legs(expandStopSpecs([7], "both", flagsFor({ 7: {} })))).toEqual([
            "7:pickup", "7:delivery",
        ]);
    });

    it("keeps 'both' atomic — drops the pair when canBoth is false", () => {
        const flags = flagsFor({ 7: { canBoth: false, canPickup: true, canDeliver: true } });
        expect(expandStopSpecs([7], "both", flags)).toEqual([]);
    });

    it("emits a single leg for pickup_only / delivery_only", () => {
        expect(legs(expandStopSpecs([7], "pickup_only", flagsFor({ 7: {} })))).toEqual(["7:pickup"]);
        expect(legs(expandStopSpecs([7], "delivery_only", flagsFor({ 7: {} })))).toEqual(["7:delivery"]);
    });

    it("drops a single leg the order can't take", () => {
        expect(expandStopSpecs([7], "pickup_only", flagsFor({ 7: { canPickup: false } }))).toEqual([]);
        expect(expandStopSpecs([7], "delivery_only", flagsFor({ 7: { canDeliver: false } }))).toEqual([]);
    });

    it("preserves the caller's order across several orders", () => {
        const flags = flagsFor({ 3: {}, 1: {}, 2: {} });
        expect(legs(expandStopSpecs([3, 1, 2], "both", flags))).toEqual([
            "3:pickup", "3:delivery", "1:pickup", "1:delivery", "2:pickup", "2:delivery",
        ]);
    });

    it("THROWS on an unknown order id instead of assuming it's assignable", () => {
        expect(() => expandStopSpecs([7, 99], "both", flagsFor({ 7: {} })))
            .toThrow(/99/);
    });
});

describe("assertStopSpecsAssignable", () => {
    it("accepts both legs when canBoth", () => {
        const specs: RouteStopSpec[] = [
            { orderId: 1, type: "pickup" },
            { orderId: 1, type: "delivery" },
        ];
        expect(() => assertStopSpecsAssignable(specs, flagsFor({ 1: {} }))).not.toThrow();
    });

    it("rejects both legs when only the single-leg flags are open", () => {
        const specs: RouteStopSpec[] = [
            { orderId: 1, type: "pickup" },
            { orderId: 1, type: "delivery" },
        ];
        const flags = flagsFor({ 1: { canBoth: false } });
        expect(() => assertStopSpecsAssignable(specs, flags)).toThrow(/1/);
    });

    it("checks a lone leg against its own flag, not canBoth", () => {
        const pickupOnly: RouteStopSpec[] = [{ orderId: 1, type: "pickup" }];
        expect(() => assertStopSpecsAssignable(pickupOnly, flagsFor({ 1: { canBoth: false } })))
            .not.toThrow();
        expect(() => assertStopSpecsAssignable(pickupOnly, flagsFor({ 1: { canPickup: false } })))
            .toThrow();
    });

    it("rejects an order with no flags at all", () => {
        expect(() => assertStopSpecsAssignable([{ orderId: 42, type: "delivery" }], flagsFor({})))
            .toThrow(/42/);
    });

    it("accepts an empty list", () => {
        expect(() => assertStopSpecsAssignable([], flagsFor({}))).not.toThrow();
    });
});

describe("assertRouteDeletable", () => {
    it("allows deleting an untouched route", () => {
        expect(() => assertRouteDeletable({ status: "pending" }, [openStop(), openStop()]))
            .not.toThrow();
    });

    it("refuses a route already marked completed", () => {
        expect(() => assertRouteDeletable({ status: "completed" }, [])).toThrow(/cancelada/);
    });

    it.each([
        ["picked_up", { pickedUpAt: new Date() }],
        ["delivered", { deliveredAt: new Date() }],
        ["attempted", { attemptedAt: new Date() }],
        ["returned", { attemptedAt: new Date() }],
        ["failed", { attemptedAt: new Date() }],
    ] as const)(
        "refuses a route holding a %s stop with recorded evidence",
        (status, evidence) => {
            expect(() => assertRouteDeletable({ status: "in_progress" }, [openStop({ status, ...evidence })]))
                .toThrow(/POD/);
        },
    );

    it("allows deleting a route whose stop only has a stale status with no recorded evidence", () => {
        // updateOrderStatus's admin-side sync (server/db.ts) can stamp a terminal
        // status onto a routeOrders row by hand, with no photo/amount/timestamp —
        // that must not read as proof of real driver work.
        expect(() => assertRouteDeletable({ status: "in_progress" }, [openStop({ status: "picked_up" })]))
            .not.toThrow();
    });

    it("refuses a route holding collected cash even if the stop looks open", () => {
        expect(() => assertRouteDeletable({ status: "in_progress" }, [openStop({ collectedAmount: "150.00" })]))
            .toThrow();
    });

    it("refuses a route holding a proof photo", () => {
        expect(() => assertRouteDeletable({ status: "in_progress" }, [openStop({ proofPhotoUrl: "https://res.cloudinary.com/x.jpg" })]))
            .toThrow();
    });

    it("allows deleting an on_hold stop — postponed is not done", () => {
        expect(() => assertRouteDeletable({ status: "in_progress" }, [openStop({ status: "on_hold" })]))
            .not.toThrow();
    });
});

describe("assertStopsRemovable", () => {
    it("allows removing pending stops", () => {
        expect(() => assertStopsRemovable([openStop(), openStop({ status: "in_progress" })]))
            .not.toThrow();
    });

    it("refuses a delivered stop and names the waybill", () => {
        expect(() => assertStopsRemovable([openStop({
            status: "delivered", deliveredAt: new Date(), waybillNumber: "PX202600987-828",
        })])).toThrow(/PX202600987-828/);
    });

    it("refuses a stop with COD already collected", () => {
        expect(() => assertStopsRemovable([openStop({ collectedAmount: "75.50" })])).toThrow();
    });

    it("allows removing a stop with a stale status but no recorded evidence", () => {
        // Same root cause as the assertRouteDeletable case above: a status-only
        // row from the admin-side sync must not block removal.
        expect(() => assertStopsRemovable([openStop({ status: "picked_up" })])).not.toThrow();
    });

    it("accepts an empty list", () => {
        expect(() => assertStopsRemovable([])).not.toThrow();
    });
});
