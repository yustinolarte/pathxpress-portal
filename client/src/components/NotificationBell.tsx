/**
 * NotificationBell — Functional notification bell for the customer portal header.
 * Shows unread count badge and a dropdown with recent notifications.
 */
import { useState, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc';

interface NotificationBellProps {
    token: string;
}

export default function NotificationBell({ token }: NotificationBellProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // Fetch unread count (refetch every 30s)
    const { data: unreadData } = trpc.portal.notifications.getUnreadCount.useQuery(
        { token },
        { enabled: !!token, refetchInterval: 30000 }
    );

    // Fetch notification list (only when dropdown is open)
    const { data: notifications, refetch: refetchList } = trpc.portal.notifications.list.useQuery(
        { token, limit: 15 },
        { enabled: !!token && open }
    );

    const markAsReadMutation = trpc.portal.notifications.markAsRead.useMutation();

    const unreadCount = unreadData?.count ?? 0;

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        if (open) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    const handleMarkAllRead = async () => {
        await markAsReadMutation.mutateAsync({ token });
        refetchList();
    };

    const handleNotificationClick = async (id: number, link?: string | null) => {
        await markAsReadMutation.mutateAsync({ token, notificationId: id });
        refetchList();
        if (link) {
            // Dispatch a custom event that the parent dashboard can listen to for navigation
            window.dispatchEvent(new CustomEvent('px-navigate', { detail: link }));
            setOpen(false);
        }
    };

    const timeAgo = (dateStr: string) => {
        const now = Date.now();
        const diff = now - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'ORDER_UPDATE': return 'local_shipping';
            case 'INVOICE_GENERATED': return 'receipt_long';
            case 'COD_UPDATE': return 'payments';
            default: return 'info';
        }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'ORDER_UPDATE': return 'text-blue-400';
            case 'INVOICE_GENERATED': return 'text-emerald-400';
            case 'COD_UPDATE': return 'text-amber-400';
            default: return 'text-muted-foreground';
        }
    };

    return (
        <div className="relative" ref={ref}>
            {/* Bell Button */}
            <button
                onClick={() => setOpen(!open)}
                className="p-2.5 rounded-xl bg-background text-muted-foreground hover:text-primary transition-colors relative border border-primary/10 hover:border-primary/30"
            >
                <span className="material-symbols-outlined">notifications</span>
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full px-1 border-2 border-background">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {open && (
                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-card border border-primary/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-primary/10">
                        <h3 className="text-sm font-semibold">Notifications</h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={handleMarkAllRead}
                                className="text-xs text-primary hover:text-primary/80 transition-colors font-medium"
                            >
                                Mark all as read
                            </button>
                        )}
                    </div>

                    {/* List */}
                    <div className="max-h-80 overflow-y-auto">
                        {!notifications || notifications.length === 0 ? (
                            <div className="py-10 text-center">
                                <span className="material-symbols-outlined text-3xl text-muted-foreground/30 mb-2 block">notifications_off</span>
                                <p className="text-sm text-muted-foreground">No notifications yet</p>
                            </div>
                        ) : (
                            notifications.map((n) => (
                                <button
                                    key={n.id}
                                    onClick={() => handleNotificationClick(n.id, n.link)}
                                    className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-primary/5 transition-colors border-b border-primary/5 last:border-b-0 ${
                                        n.isRead === 0 ? 'bg-primary/5' : ''
                                    }`}
                                >
                                    <span className={`material-symbols-outlined text-lg mt-0.5 shrink-0 ${getTypeColor(n.type)}`}>
                                        {getTypeIcon(n.type)}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className={`text-sm truncate ${n.isRead === 0 ? 'font-semibold' : 'font-medium text-muted-foreground'}`}>
                                                {n.title}
                                            </p>
                                            {n.isRead === 0 && (
                                                <span className="size-2 rounded-full bg-primary shrink-0"></span>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                                        <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.createdAt as unknown as string)}</p>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
