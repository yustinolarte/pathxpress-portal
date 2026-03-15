/**
 * International Rate Engine — TypeScript port of the standalone calculator's quote() logic.
 * Reads rate data from the database (seeded from JSON files).
 * Supports client-specific discounts via intlDiscountPercent.
 */
import { drizzle } from "drizzle-orm/mysql2";
import { eq, and } from "drizzle-orm";
import { internationalRates, internationalCountryMaps } from "../drizzle/schema";

// ─── Constants ───────────────────────────────────────────────────────────────

export const LIMITS = {
    volumetricDivisor: 5000,
    premiumMaxKg: 30,
    premiumMaxDimsCm: { length: 110, width: 70, height: 70 },
};

export const SERVICE = {
    PRIME_EXPRESS: "PRIME_EXPRESS",
    PRIME_TRACKED: "PRIME_TRACKED",
    PRIME_REGISTERED_POD: "PRIME_REGISTERED_POD",
    GCC: "GCC",
    PREMIUM_EXPORT: "PREMIUM_EXPORT",
} as const;

export type ServiceKey = (typeof SERVICE)[keyof typeof SERVICE];

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QuoteInput {
    originCountry: string;
    destinationCountry: string;
    realWeightKg: number;
    dimensionsCm: { length: number; width: number; height: number };
}

export interface ServiceOption {
    serviceKey: ServiceKey;
    displayName: string;
    currency: string;
    total: number;
    totalAfterDiscount?: number;
    discountPercent?: number;
    bracketUsed: { unit: string; value: number };
    breakdown: Record<string, number>;
    calc: { realKg: number; volKg: number; billableKg: number };
    notes: string[];
    isRecommended?: boolean;
}

export interface QuoteResult {
    inputs: {
        originCountry: string;
        destinationCountry: string;
        realWeightKg: number;
        dimensionsCm: { length: number; width: number; height: number };
    };
    calc: {
        realKg: number;
        volKg: number;
        billableKg: number;
        billableKgRounded05: number;
        primeGramsBracket: number;
    };
    options: ServiceOption[];
    reasons: string[];
}

// ─── Helper Functions ────────────────────────────────────────────────────────

export function normalizeCountryName(input: string): string {
    const s = (input ?? "").trim();
    if (!s) return "";
    const low = s.toLowerCase();
    const aliases = new Map<string, string>([
        ["uae", "United Arab Emirates"],
        ["u.a.e", "United Arab Emirates"],
        ["united arab emirates", "United Arab Emirates"],
        ["emirates", "United Arab Emirates"],
        ["ksa", "Saudi Arabia"],
        ["saudi", "Saudi Arabia"],
        ["usa", "United States"],
        ["u.s.a", "United States"],
        ["uk", "United Kingdom"],
        ["u.k", "United Kingdom"],
    ]);
    if (aliases.has(low)) return aliases.get(low)!;
    // Title-case fallback
    return s
        .split(" ")
        .filter(Boolean)
        .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
        .join(" ");
}

export function roundUpToIncrement(x: number, inc: number): number {
    if (!Number.isFinite(x) || x <= 0) return inc;
    const v = Math.ceil((x - 1e-9) / inc) * inc;
    return Math.round(v * 1000) / 1000;
}

function kgKey(x: number): string {
    const r = Math.round(x * 10) / 10;
    return r.toFixed(1);
}

export function calcVolumetricKg(dims: { length: number; width: number; height: number }): number {
    if (![dims.length, dims.width, dims.height].every((n) => Number.isFinite(n) && n > 0)) return 0;
    return (dims.length * dims.width * dims.height) / LIMITS.volumetricDivisor;
}

export function validateInput(input: QuoteInput): string[] {
    const errs: string[] = [];
    if (!input.originCountry) errs.push("Origin country is required.");
    if (!input.destinationCountry) errs.push("Destination country is required.");
    if (!Number.isFinite(input.realWeightKg) || input.realWeightKg <= 0) errs.push("Real weight (kg) must be > 0.");
    const { length, width, height } = input.dimensionsCm;
    if (![length, width, height].every((n) => Number.isFinite(n) && n > 0)) errs.push("All dimensions (L/W/H) must be > 0.");
    return errs;
}

// ─── Database Helpers ────────────────────────────────────────────────────────

interface RateDataFromDB {
    primeRates: Record<string, Record<string, Record<string, number>>>; // country -> serviceKey -> bracket -> price
    gccRates: Record<string, Record<string, number>>; // country -> bracket -> price
    premiumRates: Record<string, Record<string, number>>; // zone -> bracket -> price
    countryMaps: Record<string, { zone: string | null; primeEligible: boolean; gccEligible: boolean; riskFlag: boolean }>;
}

export async function loadRatesFromDB(db: ReturnType<typeof drizzle>): Promise<RateDataFromDB> {
    // Load all active rates
    const rates = await db.select().from(internationalRates).where(eq(internationalRates.isActive, 1));
    const countries = await db.select().from(internationalCountryMaps).where(eq(internationalCountryMaps.isActive, 1));

    // Build structured data
    const primeRates: RateDataFromDB["primeRates"] = {};
    const gccRates: RateDataFromDB["gccRates"] = {};
    const premiumRates: RateDataFromDB["premiumRates"] = {};

    for (const r of rates) {
        if (r.rateType === "prime" && r.country && r.serviceKey) {
            if (!primeRates[r.country]) primeRates[r.country] = {};
            if (!primeRates[r.country][r.serviceKey]) primeRates[r.country][r.serviceKey] = {};
            primeRates[r.country][r.serviceKey][r.weightBracket] = Number(r.price);
        } else if (r.rateType === "gcc" && r.country) {
            if (!gccRates[r.country]) gccRates[r.country] = {};
            gccRates[r.country][r.weightBracket] = Number(r.price);
        } else if (r.rateType === "premium" && r.zone) {
            if (!premiumRates[r.zone]) premiumRates[r.zone] = {};
            premiumRates[r.zone][r.weightBracket] = Number(r.price);
        }
    }

    const countryMapsResult: RateDataFromDB["countryMaps"] = {};
    for (const c of countries) {
        countryMapsResult[c.country] = {
            zone: c.zone,
            primeEligible: c.primeEligible === 1,
            gccEligible: c.gccEligible === 1,
            riskFlag: c.riskFlag === 1,
        };
    }

    return { primeRates, gccRates, premiumRates, countryMaps: countryMapsResult };
}

export async function getCountryList(db: ReturnType<typeof drizzle>): Promise<string[]> {
    const countries = await db.select({ country: internationalCountryMaps.country })
        .from(internationalCountryMaps)
        .where(eq(internationalCountryMaps.isActive, 1));
    return countries.map((c) => c.country).sort((a, b) => a.localeCompare(b));
}

// ─── Core Quote Engine ───────────────────────────────────────────────────────

export function quote(rateData: RateDataFromDB, input: QuoteInput, discountPercent?: number): QuoteResult {
    const origin = normalizeCountryName(input.originCountry);
    const dest = normalizeCountryName(input.destinationCountry);
    const realKg = Number(input.realWeightKg);
    const dims = input.dimensionsCm;

    const volKg = calcVolumetricKg(dims);
    const billableKg = Math.max(realKg, volKg);
    const billableKgRounded05 = roundUpToIncrement(billableKg, 0.5);
    const billableGrams = billableKg * 1000;

    // PRIME (ePacket) brackets: 100g increments up to 1000g, then 200g increments up to 2000g.
    let primeGramsBracket = 100;
    if (billableGrams <= 1000) {
        primeGramsBracket = Math.max(100, Math.ceil((billableGrams - 1e-9) / 100) * 100);
    } else {
        primeGramsBracket = Math.min(2000, Math.ceil((billableGrams - 1e-9) / 200) * 200);
    }

    const out: QuoteResult = {
        inputs: { originCountry: origin, destinationCountry: dest, realWeightKg: realKg, dimensionsCm: dims },
        calc: { realKg, volKg, billableKg, billableKgRounded05, primeGramsBracket },
        options: [],
        reasons: [],
    };

    const gccTable = rateData.gccRates[dest];
    const primeTable = rateData.primeRates[dest];
    const countryMeta = rateData.countryMaps[dest] ?? null;
    const zone = countryMeta?.zone ?? null;
    const riskFlag = Boolean(countryMeta?.riskFlag);

    // ── GCC option ──
    if (gccTable) {
        const k = kgKey(billableKgRounded05);
        const price = gccTable[k];
        if (Number.isFinite(price)) {
            out.options.push({
                serviceKey: SERVICE.GCC,
                displayName: "GCC Service",
                currency: "AED",
                total: price,
                bracketUsed: { unit: "kg", value: billableKgRounded05 },
                breakdown: { base: price },
                calc: { realKg, volKg, billableKg },
                notes: ["GCC rate (AED).", "Destination customs-related charges may apply and are not included."],
            });
        } else {
            out.reasons.push(`GCC: no bracket found for ${billableKgRounded05}kg.`);
        }
    }

    // ── PRIME options (≤2.0kg billable) ──
    if (billableKg <= 2.0 + 1e-9 && primeTable) {
        const g = String(primeGramsBracket);
        const primeKeys = [SERVICE.PRIME_EXPRESS, SERVICE.PRIME_TRACKED, SERVICE.PRIME_REGISTERED_POD] as const;
        const primeNames: Record<string, string> = {
            [SERVICE.PRIME_EXPRESS]: "PRIME Express (E‑packets)",
            [SERVICE.PRIME_TRACKED]: "PRIME Tracked (E‑packets)",
            [SERVICE.PRIME_REGISTERED_POD]: "PRIME Registered (POD) (E‑packets)",
        };
        for (const sk of primeKeys) {
            const table = primeTable[sk];
            const price = table?.[g];
            if (Number.isFinite(price)) {
                out.options.push({
                    serviceKey: sk,
                    displayName: primeNames[sk],
                    currency: "AED",
                    total: price,
                    bracketUsed: { unit: "g", value: Number(g) },
                    breakdown: { base: price },
                    calc: { realKg, volKg, billableKg },
                    notes: ["Fuel surcharge included.", "VAT excluded.", "E‑packets available only for participating countries."],
                });
            }
        }
        const anyPrime = out.options.some((o) => o.serviceKey.startsWith("PRIME_"));
        if (!anyPrime) out.reasons.push("PRIME: destination in table but no matching gram bracket found.");
    } else {
        if (billableKg > 2.0) out.reasons.push("PRIME: not available because billable weight exceeds 2.0 kg.");
        if (!primeTable) out.reasons.push("PRIME: not available for this destination (not participating).");
    }

    // ── Premium Export (Zones) ──
    const dimsOk =
        dims.length <= LIMITS.premiumMaxDimsCm.length &&
        dims.width <= LIMITS.premiumMaxDimsCm.width &&
        dims.height <= LIMITS.premiumMaxDimsCm.height;

    if (zone && billableKg <= LIMITS.premiumMaxKg + 1e-9 && dimsOk) {
        const zRates = rateData.premiumRates[zone];
        const k = kgKey(billableKgRounded05);
        const base = zRates?.[k];
        if (Number.isFinite(base)) {
            const riskSurcharge = riskFlag ? 85 : 0;
            out.options.push({
                serviceKey: SERVICE.PREMIUM_EXPORT,
                displayName: "International Premium Export",
                currency: "AED",
                total: base + riskSurcharge,
                bracketUsed: { unit: "kg", value: billableKgRounded05 },
                breakdown: { base, ...(riskFlag ? { riskSurcharge } : {}) },
                calc: { realKg, volKg, billableKg },
                notes: [
                    "Government levy included.",
                    "Destination customs duties / taxes / clearance charges excluded.",
                    ...(riskFlag ? ["Elevated Risk Surcharge applied (AED 85)."] : []),
                ],
            });
        } else {
            out.reasons.push(`Premium: no bracket found for ${billableKgRounded05}kg in ${zone}.`);
        }
    } else {
        if (!zone) out.reasons.push("Premium: destination has no zone mapping.");
        if (billableKg > LIMITS.premiumMaxKg) out.reasons.push("Premium: not available because billable weight exceeds 30 kg.");
        if (!dimsOk) out.reasons.push("Premium: not available because dimensions exceed 110×70×70 cm.");
    }

    // ── Sort options ──
    const order: Record<string, number> = {
        [SERVICE.PRIME_EXPRESS]: 1,
        [SERVICE.PRIME_TRACKED]: 2,
        [SERVICE.PRIME_REGISTERED_POD]: 3,
        [SERVICE.GCC]: 4,
        [SERVICE.PREMIUM_EXPORT]: 5,
    };
    out.options.sort((a, b) => (order[a.serviceKey] ?? 99) - (order[b.serviceKey] ?? 99));

    // ── Recommendation logic ──
    let recIdx = -1;
    let minPrime = Infinity;
    let primeIdx = -1;
    let premIdx = -1;

    out.options.forEach((opt, idx) => {
        if (opt.serviceKey.startsWith("PRIME_")) {
            if (opt.total < minPrime) { minPrime = opt.total; primeIdx = idx; }
        } else if (opt.serviceKey === SERVICE.PREMIUM_EXPORT) {
            premIdx = idx;
        }
    });

    if (primeIdx !== -1) {
        if (premIdx !== -1 && out.options[premIdx].total < minPrime) {
            recIdx = premIdx;
        } else {
            recIdx = primeIdx;
        }
    } else if (premIdx !== -1) {
        recIdx = premIdx;
    }

    if (recIdx !== -1) {
        out.options[recIdx].isRecommended = true;
    }

    // ── Apply client discount ──
    if (discountPercent && discountPercent > 0) {
        const factor = 1 - discountPercent / 100;
        for (const opt of out.options) {
            opt.discountPercent = discountPercent;
            opt.totalAfterDiscount = Math.round(opt.total * factor * 100) / 100;
        }
    }

    return out;
}
