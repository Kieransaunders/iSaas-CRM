import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, UserCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";

export function ImpersonationBanner() {
    // Check local (admin-to-staff) impersonation
    const impersonatedUser = useQuery(api.users.impersonate.getImpersonationStatus);
    const stopImpersonating = useMutation(api.users.impersonate.stopImpersonating);

    // Check WorkOS AuthKit impersonation (platform admin)
    const workosImpersonation = useQuery(api.users.impersonate.getWorkosImpersonationStatus);

    // WorkOS AuthKit impersonation takes priority
    if (workosImpersonation) {
        const user = workosImpersonation.impersonatedUser;
        const displayName = user.firstName
            ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`
            : user.email;

        const handleStopSession = () => {
            // WorkOS AuthKit impersonation session can be ended by navigating to
            // the WorkOS session end URL or by clearing the session cookie.
            // The standard approach is to redirect to the auth provider's logout
            // endpoint which terminates the impersonation session.
            window.location.href = '/api/auth/signout';
        };

        return (
            <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between animate-in fade-in slide-in-from-top duration-300">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                    <span>
                        Platform admin session — viewing as{' '}
                        <span className="font-bold">{displayName}</span> ({user.role})
                    </span>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStopSession}
                    className="h-8 gap-2 bg-background border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                >
                    <XCircle className="h-4 w-4" />
                    Stop Session
                </Button>
            </div>
        );
    }

    // Local impersonation (admin impersonating another org member)
    if (!impersonatedUser) return null;

    const handleStop = async () => {
        try {
            await stopImpersonating();
            toast.success("Stopped impersonating");
            // Refresh the page to reset all states
            window.location.reload();
        } catch (error) {
            toast.error("Failed to stop impersonating");
        }
    };

    return (
        <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between animate-in fade-in slide-in-from-top duration-300">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <UserCheck className="h-4 w-4" />
                <span>
                    Viewing as{' '}
                    <span className="font-bold">
                        {impersonatedUser.firstName || impersonatedUser.email}
                    </span>{' '}
                    ({impersonatedUser.role})
                </span>
            </div>
            <Button
                variant="outline"
                size="sm"
                onClick={handleStop}
                className="h-8 gap-2 bg-background border-primary/30 hover:bg-primary/5 hover:text-primary transition-colors"
            >
                <XCircle className="h-4 w-4" />
                Stop Impersonating
            </Button>
        </div>
    );
}
