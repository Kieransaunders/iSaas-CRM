import { Link, createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { api } from '../../../convex/_generated/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
});

function DashboardPage() {
  const ensureDefaultPipeline = useMutation(api.crm.pipelines.ensureDefaultPipeline);
  const defaultPipeline = useQuery(api.crm.pipelines.getDefaultPipeline);
  const deals = useQuery(api.crm.deals.listDeals, { ownerFilter: 'all' });
  const activities = useQuery(api.crm.activities.listOrgActivities);
  const companies = useQuery(api.crm.companies.listCompanies, { ownerFilter: 'all' });
  const contacts = useQuery(api.crm.contacts.listContacts, { ownerFilter: 'all' });

  useEffect(() => {
    if (defaultPipeline === null) {
      ensureDefaultPipeline().catch((error) => {
        console.error('Failed to create default pipeline:', error);
      });
    }
  }, [defaultPipeline, ensureDefaultPipeline]);

  if (
    defaultPipeline === undefined ||
    deals === undefined ||
    activities === undefined ||
    companies === undefined ||
    contacts === undefined
  ) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const openDeals = deals.filter((deal: { status: string }) => deal.status === 'open').length;
  const wonDeals = deals.filter((deal: { status: string }) => deal.status === 'won').length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">CRM Dashboard</h1>
          <p className="text-muted-foreground">Overview of your pipeline, deals, and activity.</p>
        </div>
        <Badge variant="secondary">MVP v1</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Open Deals" value={openDeals} description="Current opportunities" />
        <MetricCard title="Won Deals" value={wonDeals} description="Closed successfully" />
        <MetricCard title="Companies" value={companies.length} description="Account records" />
        <MetricCard title="Contacts" value={contacts.length} description="People records" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
            <CardDescription>Jump into your most common CRM workflows.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <QuickAction to="/pipeline" label="Open Pipeline" />
            <QuickAction to="/deals" label="Manage Deals" />
            <QuickAction to="/companies" label="View Companies" />
            <QuickAction to="/contacts" label="View Contacts" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activities</CardTitle>
            <CardDescription>Latest timeline events across deals.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activities yet.</p>
            ) : (
              activities.slice(0, 6).map((activity: { _id: string; title: string; createdAt: number }) => (
                <div key={activity._id} className="rounded-md border p-3">
                  <p className="font-medium text-sm">{activity.title}</p>
                  <p className="text-xs text-muted-foreground">{new Date(activity.createdAt).toLocaleString()}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ title, value, description }: { title: string; value: number; description: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function QuickAction({ to, label }: { to: '/pipeline' | '/deals' | '/companies' | '/contacts'; label: string }) {
  return (
    <Button asChild variant="outline" className="justify-between">
      <Link to={to}>
        {label}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </Button>
  );
}
