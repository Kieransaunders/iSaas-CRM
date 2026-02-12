import { Outlet, createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { getAuth, getSignInUrl } from '@workos/authkit-tanstack-react-start';
import { useAction, useQuery } from 'convex/react';
import { useEffect } from 'react';
import { api } from '../../convex/_generated/api';
import { MainLayout } from '@/components/layout/main-layout';

export const Route = createFileRoute('/_authenticated')({
  loader: async ({ context }) => {
    const { user } = await getAuth();
    if (!user) {
      const href = await getSignInUrl();
      throw redirect({ href });
    }

    // For now, let the component handle org checking
    // In production, you'd want to check Convex here and redirect to /onboarding if needed
    return { user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  Route.useLoaderData();
  const navigate = useNavigate();
  const syncCurrentUser = useAction(api.users.syncActions.syncCurrentUserFromWorkOS);

  const hasOrgCheck = useQuery(api.orgs.get.hasOrg);

  useEffect(() => {
    syncCurrentUser().catch((error) => {
      console.error('Failed to sync user from WorkOS:', error);
    });
  }, [syncCurrentUser]);

  useEffect(() => {
    if (hasOrgCheck && !hasOrgCheck.hasOrg) {
      navigate({ to: '/onboarding', replace: true });
    }
  }, [hasOrgCheck, navigate]);

  return (
    <MainLayout breadcrumbs={[{ label: 'Dashboard' }]}>
      <Outlet />
    </MainLayout>
  );
}
