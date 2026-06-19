import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { APP_TITLE, getLoginUrl } from "@/const";
import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Key, FileText, LogOut, Plus, Sun, Moon } from "lucide-react";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import NotificationBell from "./NotificationBell";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { useLocation } from "wouter";

function ThemeToggleItem() {
    const { theme, toggleTheme } = useTheme();
    return (
        <DropdownMenuItem onClick={toggleTheme} className="cursor-pointer">
            {theme === "dark"
                ? <Sun className="mr-2 h-4 w-4" />
                : <Moon className="mr-2 h-4 w-4" />}
            <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
        </DropdownMenuItem>
    );
}

export interface ModernMenuItem {
    icon: string;
    label: string;
    value: string;
    /** Mono uppercase group label rendered above the first item of each section */
    section?: string;
    /** Pending-count badge rendered at the end of the row */
    badge?: number;
}

interface ModernDashboardLayoutProps {
    children: React.ReactNode;
    menuItems: ModernMenuItem[];
    activeItem: string;
    onItemClick: (value: string, searchData?: string) => void;
    user: any;
    logout: () => void;
    loading?: boolean;
    title?: string;
    onCreateShipment?: () => void;
    topBanner?: React.ReactNode;
}

export default function ModernDashboardLayout({
    children,
    menuItems,
    activeItem,
    onItemClick,
    user,
    logout,
    loading = false,
    title = APP_TITLE,
    onCreateShipment,
    topBanner,
}: ModernDashboardLayoutProps) {
    const [, setLocation] = useLocation();
    const portalRef = useRef<HTMLDivElement>(null);

    // Sidebar collapse state
    const [isCollapsed, setIsCollapsed] = useState(false);
    const isMobileHook = useIsMobile();
    // Sync check to avoid flash of desktop layout on first render
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth < 768 : false
    );
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        setIsMobile(isMobileHook);
        if (!isMobileHook) setMobileMenuOpen(false);
    }, [isMobileHook]);

    // Password change state
    const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Waybill settings state (for customers only)
    const [waybillSettingsOpen, setWaybillSettingsOpen] = useState(false);
    const [hideShipperAddress, setHideShipperAddress] = useState(false);
    const [isSavingWaybillSettings, setIsSavingWaybillSettings] = useState(false);

    const isCustomer = user?.role === 'customer';
    const utils = trpc.useUtils();

    const { data: customerAccount } = trpc.portal.customer.getMyAccount.useQuery(
        undefined,
        { enabled: isCustomer }
    );

    useEffect(() => {
        if (customerAccount) {
            setHideShipperAddress(customerAccount.hideShipperAddress === 1);
        }
    }, [customerAccount]);

    const updateWaybillSettingsMutation = trpc.portal.customer.updateAccountSettings.useMutation({
        onSuccess: () => {
            toast.success('Waybill settings saved!');
            setIsSavingWaybillSettings(false);
            utils.portal.customer.getMyOrders.invalidate();
            utils.portal.customer.getMyIntlOrders.invalidate();
            utils.portal.customer.getMyReturnsExchanges.invalidate();
        },
        onError: (error: { message?: string }) => {
            toast.error(error.message || 'Failed to save settings');
            setIsSavingWaybillSettings(false);
        },
    });

    const handleToggleHideAddress = (checked: boolean) => {
        setHideShipperAddress(checked);
        setIsSavingWaybillSettings(true);
        updateWaybillSettingsMutation.mutate({
            hideShipperAddress: checked ? 1 : 0,
        });
    };

    const changePasswordMutation = trpc.portal.auth.changePassword.useMutation({
        onSuccess: () => {
            toast.success('Password changed successfully');
            setPasswordDialogOpen(false);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to change password');
        },
    });

    const handleChangePassword = () => {
        if (newPassword !== confirmPassword) {
            toast.error('New passwords do not match');
            return;
        }
        if (newPassword.length < 8) {
            toast.error('Password must be at least 8 characters');
            return;
        }
        changePasswordMutation.mutate({
            currentPassword,
            newPassword,
        });
    };

    const [searchQuery, setSearchQuery] = useState('');

    const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && searchQuery.trim()) {
            // Send user to their portal's tracking dashboard view
            // and pass the search query if the handler supports it
            onItemClick('tracking', searchQuery.trim());
            setSearchQuery('');
        }
    };

    if (loading) {
        return <DashboardLayoutSkeleton />
    }

    if (!user) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
                    <div className="flex flex-col items-center gap-6">
                        <div className="relative group">
                            <div className="relative">
                                <img
                                    src="/favicon.png"
                                    alt={title}
                                    className="h-20 w-20 rounded-xl object-contain shadow"
                                />
                            </div>
                        </div>
                        <div className="text-center space-y-2">
                            <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
                            <p className="text-sm text-muted-foreground">
                                Please sign in to continue
                            </p>
                        </div>
                    </div>
                    <Button
                        onClick={() => {
                            window.location.href = getLoginUrl();
                        }}
                        size="lg"
                        className="w-full shadow-lg hover:shadow-xl transition-all"
                    >
                        Sign in
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <ThemeProvider defaultTheme="dark" switchable storageKey="portal-theme" targetRef={portalRef}>
        <div ref={portalRef} className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
            {topBanner}
            <div className="flex flex-1 overflow-hidden">
            {/* Mobile overlay backdrop */}
            {isMobile && mobileMenuOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50"
                    onClick={() => setMobileMenuOpen(false)}
                />
            )}
            {/* Sidebar */}
            <aside className={`
                ${isMobile
                    ? `fixed inset-y-0 left-0 z-50 w-72 transition-transform duration-300 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`
                    : `${isCollapsed ? 'w-[72px]' : 'w-60'} transition-all duration-300 flex-shrink-0`
                }
                border-r border-border bg-card flex flex-col justify-between p-3 overflow-y-auto
            `}>
                <div className="space-y-6">
                    {/* Brand */}
                    <div className={`flex items-center gap-3 px-2 pt-2 pb-1 ${isCollapsed && !isMobile ? 'justify-center' : ''}`}>
                        <img src="/favicon.png" alt={title} className="h-8 w-8 object-contain rounded-lg shrink-0" />
                        {(!isCollapsed || isMobile) && (
                            <div className="overflow-hidden">
                                <h1 className="text-[13px] font-bold tracking-tight truncate">{title}</h1>
                                <p className="font-mono text-[10px] text-primary uppercase tracking-widest truncate">{user.role}</p>
                            </div>
                        )}
                    </div>

                    {/* Navigation */}
                    <nav className="space-y-0.5">
                        {menuItems.map((item, index) => {
                            const isActive = activeItem === item.value;
                            const showSection = item.section && (index === 0 || menuItems[index - 1].section !== item.section);
                            return (
                                <div key={item.value}>
                                    {showSection && (!isCollapsed || isMobile) && (
                                        <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground px-2.5 pt-4 pb-1.5 select-none">
                                            {item.section}
                                        </p>
                                    )}
                                    {showSection && isCollapsed && !isMobile && index !== 0 && (
                                        <div className="border-t border-border my-2 mx-2" />
                                    )}
                                    <button
                                        onClick={() => {
                                            onItemClick(item.value);
                                            if (isMobile) setMobileMenuOpen(false);
                                        }}
                                        className={`w-full flex items-center px-2.5 py-2 rounded-lg transition-colors text-left relative ${isCollapsed && !isMobile ? 'justify-center' : 'gap-2.5'} ${isActive
                                            ? 'bg-primary/10 text-primary font-semibold'
                                            : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                                            }`}
                                        title={isCollapsed ? item.label : undefined}
                                    >
                                        {isActive && !isCollapsed && (
                                            <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-primary" />
                                        )}
                                        <span className="material-symbols-outlined shrink-0 text-[20px]">{item.icon}</span>
                                        {(!isCollapsed || isMobile) && <span className="text-[13.5px] truncate flex-1">{item.label}</span>}
                                        {(!isCollapsed || isMobile) && typeof item.badge === 'number' && item.badge > 0 && (
                                            <span className="font-mono text-[10.5px] font-bold bg-primary text-white rounded-full px-[7px] py-px shrink-0">
                                                {item.badge}
                                            </span>
                                        )}
                                    </button>
                                </div>
                            );
                        })}
                    </nav>
                </div>

                {/* Sidebar Footer */}
                <div className="mt-auto space-y-3 pt-4 border-t border-border">
                    {!isMobile && (
                        <button
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className={`w-full flex items-center px-2.5 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground rounded-lg transition-colors ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}
                        >
                            <span className="material-symbols-outlined text-[20px]">
                                {isCollapsed ? 'chevron_right' : 'chevron_left'}
                            </span>
                            {!isCollapsed && <span className="text-[13px]">Collapse</span>}
                        </button>
                    )}

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className={`flex items-center px-2 py-2 bg-secondary rounded-xl w-full text-left hover:bg-secondary/80 transition-colors ${isCollapsed && !isMobile ? 'justify-center' : 'gap-2.5'}`}>
                                <Avatar className="size-8 shrink-0 border border-border">
                                    <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                                        {user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                {(!isCollapsed || isMobile) && (
                                    <>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] font-semibold truncate">
                                                {user?.name || user?.email?.split('@')[0] || "-"}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground truncate">
                                                {user?.email || "-"}
                                            </p>
                                        </div>
                                        <span className="material-symbols-outlined text-muted-foreground text-[18px] shrink-0">unfold_more</span>
                                    </>
                                )}
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 bg-card border-border">
                            <DropdownMenuLabel className="font-normal">
                                <div className="flex flex-col space-y-0.5">
                                    <p className="text-[13px] font-semibold leading-none">{user?.name || user?.email?.split('@')[0]}</p>
                                    <p className="text-[11px] leading-none text-muted-foreground">{user?.email}</p>
                                </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {isCustomer && (
                                <DropdownMenuItem onClick={() => setWaybillSettingsOpen(true)} className="cursor-pointer">
                                    <FileText className="mr-2 h-4 w-4" />
                                    <span>Waybill Settings</span>
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setPasswordDialogOpen(true)} className="cursor-pointer">
                                <Key className="mr-2 h-4 w-4" />
                                <span>Change Password</span>
                            </DropdownMenuItem>
                            <ThemeToggleItem />
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
                                <LogOut className="mr-2 h-4 w-4" />
                                <span>Sign out</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden bg-background">
                {/* Topbar */}
                <header className="h-[68px] bg-card border-b border-border px-4 md:px-6 flex items-center justify-between shrink-0 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        {isMobile && (
                            <button
                                onClick={() => setMobileMenuOpen(true)}
                                className="p-2 -ml-1 rounded-lg hover:bg-muted transition-colors shrink-0"
                                aria-label="Open menu"
                            >
                                <span className="material-symbols-outlined">menu</span>
                            </button>
                        )}
                        <div className="relative w-full max-w-xs md:max-w-sm lg:w-80">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[18px]">search</span>
                            <input
                                className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-full focus:outline-none focus:ring-2 focus:ring-primary/30 text-[13.5px] transition-all text-foreground"
                                placeholder="Press Enter to Track..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={handleSearch}
                                type="text"
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {isCustomer && <NotificationBell />}
                        <div className="h-6 w-px bg-border hidden sm:block" />
                        <div className="text-right hidden sm:block">
                            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">System Status</p>
                            <p className="text-[12.5px] font-bold text-[var(--st-green)] flex items-center gap-1 justify-end">
                                <span className="size-1.5 rounded-full bg-[var(--st-green)]" />
                                Operational
                            </p>
                        </div>
                    </div>
                </header>

                {/* Dashboard Body */}
                <div className="flex-1 overflow-y-auto p-5">
                    <div className="w-full max-w-[1920px] mx-auto min-h-full">
                        {children}
                    </div>
                </div>
            </main>
            </div>{/* end flex-1 row (sidebar + main) */}

            {/* Change Password Dialog */}
            <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
                <DialogContent className="sm:max-w-md bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Key className="h-5 w-5 text-primary" />
                            Change Password
                        </DialogTitle>
                        <DialogDescription>
                            Enter your current password and choose a new one.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="current-password">Current Password</Label>
                            <Input
                                id="current-password"
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                placeholder="Enter current password"
                                className="bg-background border-border"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="new-password">New Password</Label>
                            <Input
                                id="new-password"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Enter new password (min 8 characters)"
                                className="bg-background border-border"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirm-password">Confirm New Password</Label>
                            <Input
                                id="confirm-password"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Confirm new password"
                                className="bg-background border-border"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleChangePassword}
                            disabled={changePasswordMutation.isPending}
                        >
                            {changePasswordMutation.isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Change Password
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Waybill Settings Dialog (for customers) */}
            {isCustomer && (
                <Dialog open={waybillSettingsOpen} onOpenChange={setWaybillSettingsOpen}>
                    <DialogContent className="sm:max-w-md bg-card border-border">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <FileText className="h-5 w-5 text-primary" />
                                Waybill Settings
                            </DialogTitle>
                            <DialogDescription>
                                Configure how your shipping labels are generated.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="flex items-start justify-between p-4 rounded-xl border border-border bg-secondary hover:bg-muted transition-colors">
                                <div className="space-y-1 flex-1 pr-4">
                                    <Label htmlFor="hideShipperAddressToggle" className="text-base font-medium cursor-pointer">
                                        Hide Shipper Address
                                    </Label>
                                    <p className="text-sm text-muted-foreground">
                                        When enabled, your phone number will not appear on the shipping label.
                                        Only your company name and city will be shown.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {isSavingWaybillSettings && (
                                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                    )}
                                    <Checkbox
                                        id="hideShipperAddressToggle"
                                        checked={hideShipperAddress}
                                        onCheckedChange={handleToggleHideAddress}
                                        disabled={isSavingWaybillSettings}
                                        className="h-5 w-5 border-border data-[state=checked]:bg-primary"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <Button variant="outline" onClick={() => setWaybillSettingsOpen(false)}>
                                Close
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
        </ThemeProvider>
    );
}
