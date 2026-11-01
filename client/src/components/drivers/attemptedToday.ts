/**
 * Orders already attempted TODAY can still be planned again (the customer may
 * have asked for a second visit), but dispatch confirms it first — decided
 * 2026-10-31: badge + confirmation, never hidden.
 */
import { dubaiTimeOfDay } from '@shared/dubaiTime';

interface Attempted {
    waybillNumber: string;
    attempts?: { today: boolean; lastAt: string | Date | null; lastReason: string | null } | null;
}

/** True to go ahead. Shows one native confirm listing every order attempted today. */
export function confirmAttemptedToday(orders: Attempted[]): boolean {
    const today = orders.filter(o => o.attempts?.today);
    if (today.length === 0) return true;
    const lines = today.slice(0, 8).map(o => {
        const at = o.attempts?.lastAt ? ` at ${dubaiTimeOfDay(o.attempts.lastAt)}` : '';
        const why = o.attempts?.lastReason ? ` — ${o.attempts.lastReason}` : '';
        return `• ${o.waybillNumber}${at}${why}`;
    });
    if (today.length > 8) lines.push(`• …and ${today.length - 8} more`);
    return confirm(
        `${today.length === 1 ? 'This order was' : `${today.length} orders were`} already attempted today:\n\n${lines.join('\n')}\n\nPlan ${today.length === 1 ? 'it' : 'them'} again anyway?`,
    );
}
