import { Outlet, createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { getAuth, getSignInUrl } from '@workos/authkit-tanstack-react-start';
import { useAction, useQuery } from 'convex/react';
import { useEffect } from 'react';
import { api } from '../../convex/_generated/api';
import { MainLayout } from '@/components/layout/main-layout';

export const Route = createFileRoute('/_authenticated')({
  loader: async ({ context, location }) => {
    const { user } = await getAuth();
    if (!user) {
      const href = await getSignInUrl({ data: { returnPathname: location.pathname } });
      throw redirect({ href });
    }

    const hasOrg = await context.queryClient.fetchQuery(
      context.convexQueryClient.queryOptions(api.orgs.get.hasOrg, {}),
    );
    if (!hasOrg.isAuthenticated) {
      return { user, needsClientOrgCheck: true };
    }

    if (!hasOrg.hasOrg) {
      throw redirect({ to: '/onboarding' });
    }

    return { user, needsClientOrgCheck: false };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { needsClientOrgCheck } = Route.useLoaderData();
  const navigate = useNavigate();
  const syncCurrentUser = useAction(api.users.syncActions.syncCurrentUserFromWorkOS);
  const hasOrgCheck = useQuery(api.orgs.get.hasOrg, needsClientOrgCheck ? {} : 'skip');

  useEffect(() => {
    syncCurrentUser().catch((error) => {
      console.error('Failed to sync user from WorkOS:', error);
    });
  }, [syncCurrentUser]);

  useEffect(() => {
    if (!needsClientOrgCheck || !hasOrgCheck?.isAuthenticated) {
      return;
    }

    if (!hasOrgCheck.hasOrg) {
      void navigate({ to: '/onboarding', replace: true });
    }
  }, [hasOrgCheck?.hasOrg, hasOrgCheck?.isAuthenticated, navigate, needsClientOrgCheck]);

  return (
    <MainLayout breadcrumbs={[{ label: 'Dashboard' }]}>
      <Outlet />
    </MainLayout>
  );
}
