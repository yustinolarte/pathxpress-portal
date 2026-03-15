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
        <DropdownMenuItem onClick={toggleTheme} className="cursor-pointer hover:bg-primary/10">
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
}: ModernDashboardLayoutProps) {
    const [, setLocation] = useLocation();
    const portalRef = useRef<HTMLDivElement>(null);

    // Sidebar collapse state
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Password change state
    const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Waybill settings state (for customers only)
    const [waybillSettingsOpen, setWaybillSettingsOpen] = useState(false);
    const [hideShipperAddress, setHideShipperAddress] = useState(false);
    const [isSavingWaybillSettings, setIsSavingWaybillSettings] = useState(false);

    const token = localStorage.getItem('pathxpress_portal_token') || '';
    const isCustomer = user?.role === 'customer';

    const { data: customerAccount } = trpc.portal.customer.getMyAccount.useQuery(
        { token },
        { enabled: !!token && isCustomer }
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
            token,
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
            token,
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
                            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
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
        <div ref={portalRef} className="flex h-screen overflow-hidden bg-background">
            {/* Sidebar */}
            <aside className={`${isCollapsed ? 'w-20' : 'w-64'} transition-all duration-300 flex-shrink-0 border-r border-primary/10 bg-card flex flex-col justify-between p-4 overflow-y-auto`}>
                <div className="space-y-8">
                    <div className={`flex items-center gap-3 px-2 mb-2 ${isCollapsed ? 'justify-center' : ''}`}>
                        <img src="/favicon.png" alt={title} className="h-10 w-10 object-contain rounded-lg shrink-0" />
                        {!isCollapsed && (
                            <div className="overflow-hidden">
                                <h1 className="text-sm font-bold tracking-tight truncate">{title}</h1>
                                <p className="text-[10px] text-red-500 font-medium uppercase tracking-wider truncate">{user.role}</p>
                            </div>
                        )}
                    </div>
                    <nav className="space-y-1">
                        {menuItems.map((item) => {
                            const isActive = activeItem === item.value;
                            return (
                                <button
                                    key={item.value}
                                    onClick={() => onItemClick(item.value)}
                                    className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-colors text-left ${isCollapsed ? 'justify-center' : 'gap-3'} ${isActive
                                        ? 'bg-red-500/10 text-red-600 dark:text-red-500 font-medium'
                                        : 'text-muted-foreground hover:bg-red-500/5 hover:text-red-600 dark:hover:text-red-500'
                                        }`}
                                    title={isCollapsed ? item.label : undefined}
                                >
                                    <span className="material-symbols-outlined shrink-0">{item.icon}</span>
                                    {!isCollapsed && <span className="text-sm truncate">{item.label}</span>}
                                </button>
                            );
                        })}
                    </nav>
                </div>
                <div className="mt-auto space-y-4 pt-4 border-t border-primary/10">
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className={`w-full flex items-center p-2 text-muted-foreground hover:bg-primary/5 hover:text-primary rounded-xl transition-colors ${isCollapsed ? 'justify-center' : 'gap-3'}`}
                    >
                        <span className="material-symbols-outlined">
                            {isCollapsed ? 'chevron_right' : 'chevron_left'}
                        </span>
                        {!isCollapsed && <span className="text-sm font-medium">Collapse</span>}
                    </button>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className={`flex items-center p-2 bg-primary/5 rounded-xl w-full text-left hover:bg-primary/10 transition-colors ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                                <Avatar className="size-10 shrink-0 border border-primary/20">
                                    <AvatarFallback className="text-xs font-medium bg-primary/20 text-primary">
                                        {user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                {!isCollapsed && (
                                    <>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold truncate text-foreground">
                                                {user?.name || user?.email?.split('@')[0] || "-"}
                                            </p>
                                            <p className="text-xs text-muted-foreground truncate">
                                                {user?.email || "-"}
                                            </p>
                                        </div>
                                        <span className="material-symbols-outlined text-muted-foreground text-sm shrink-0">unfold_more</span>
                                    </>
                                )}
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 glass-strong border-primary/20">
                            <DropdownMenuLabel className="font-normal">
                                <div className="flex flex-col space-y-1">
                                    <p className="text-sm font-medium leading-none">{user?.name || user?.email?.split('@')[0]}</p>
                                    <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                                </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator className="bg-primary/10" />
                            {isCustomer && (
                                <DropdownMenuItem onClick={() => setWaybillSettingsOpen(true)} className="cursor-pointer hover:bg-primary/10">
                                    <FileText className="mr-2 h-4 w-4" />
                                    <span>Waybill Settings</span>
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setPasswordDialogOpen(true)} className="cursor-pointer hover:bg-primary/10">
                                <Key className="mr-2 h-4 w-4" />
                                <span>Change Password</span>
                            </DropdownMenuItem>
                            <ThemeToggleItem />
                            <DropdownMenuSeparator className="bg-primary/10" />
                            <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive hover:bg-destructive/10">
                                <LogOut className="mr-2 h-4 w-4" />
                                <span>Sign out</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden bg-background">
                {/* Header */}
                <header className="h-20 bg-card border-b border-primary/10 px-8 flex items-center justify-between shrink-0">
                    <div className="relative w-96 max-w-full">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">search</span>
                        <input
                            className="w-full pl-10 pr-4 py-2.5 bg-background border border-primary/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition-all text-foreground"
                            placeholder="Press Enter to Track..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={handleSearch}
                            type="text"
                        />
                    </div>
                    <div className="flex items-center gap-4">
                        {isCustomer && token && (
                            <NotificationBell token={token} />
                        )}
                        <div className="h-8 w-[1px] bg-border mx-2"></div>
                        <div className="text-right hidden sm:block">
                            <p className="text-xs font-medium text-muted-foreground">System Status</p>
                            <p className="text-sm font-bold text-green-500 flex items-center gap-1 justify-end">
                                <span className="size-2 rounded-full bg-green-500 animate-pulse"></span>
                                All Systems Operational
                            </p>
                        </div>
                    </div>
                </header>

                {/* Dashboard Body */}
                <div className="flex-1 overflow-y-auto p-8 relative">
                    <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop')] bg-cover bg-center opacity-[0.03] pointer-events-none mix-blend-overlay" />
                    <div className="relative z-10 w-full max-w-[1600px] mx-auto min-h-full">
                        {children}
                    </div>
                </div>
            </main>

            {/* Change Password Dialog */}
            <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
                <DialogContent className="sm:max-w-md glass-strong border-primary/20">
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
                                className="bg-background/50 border-primary/20"
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
                                className="bg-background/50 border-primary/20"
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
                                className="bg-background/50 border-primary/20"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setPasswordDialogOpen(false)} className="border-primary/20 hover:bg-primary/10">
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
                    <DialogContent className="sm:max-w-md glass-strong border-primary/20">
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
                            <div className="flex items-start justify-between p-4 rounded-xl border border-primary/20 bg-background/50 hover:bg-primary/5 transition-colors">
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
                                        className="h-5 w-5 border-primary/50 data-[state=checked]:bg-primary"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <Button variant="outline" onClick={() => setWaybillSettingsOpen(false)} className="border-primary/20 hover:bg-primary/10">
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
