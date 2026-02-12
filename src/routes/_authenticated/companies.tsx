import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const Route = createFileRoute('/_authenticated/companies')({
  component: CompaniesPage,
});

function CompaniesPage() {
  const companies = useQuery(api.crm.companies.listCompanies);
  const createCompany = useMutation(api.crm.companies.createCompany);

  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;

    await createCompany({
      name: name.trim(),
      website: website.trim() || undefined,
    });

    setName('');
    setWebsite('');
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Companies</h1>
        <p className="text-muted-foreground">Manage account companies for your CRM workspace.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New company</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="company-name">Name</Label>
              <Input id="company-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-website">Website</Label>
              <Input
                id="company-website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.com"
              />
            </div>
            <div className="md:col-span-3">
              <Button type="submit" disabled={!name.trim()}>
                Create company
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All companies</CardTitle>
          <CardDescription>{companies?.length ?? 0} companies</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {companies === undefined || companies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No companies yet.</p>
          ) : (
            companies.map((company: { _id: string; name: string; website?: string }) => (
              <div key={company._id} className="rounded-md border p-3">
                <p className="font-medium">{company.name}</p>
                <p className="text-sm text-muted-foreground">{company.website || 'No website'}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
