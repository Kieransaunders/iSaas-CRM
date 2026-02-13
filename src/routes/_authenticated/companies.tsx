import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CompanyDetailModal } from '@/components/crm/company-detail-modal';
import { DealDetailModal } from '@/components/crm/deal-detail-modal';
import { ContactDetailModal } from '@/components/crm/contact-detail-modal';

export const Route = createFileRoute('/_authenticated/companies')({
  component: CompaniesPage,
});

function CompaniesPage() {
  const companies = useQuery(api.crm.companies.listCompanies);
  const createCompany = useMutation(api.crm.companies.createCompany);

  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<Id<'companies'> | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<Id<'deals'> | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<Id<'contacts'> | null>(null);

  const defaultPipeline = useQuery(api.crm.pipelines.getDefaultPipeline);
  const stages = useQuery(
    api.crm.pipelines.listStagesByPipeline,
    defaultPipeline ? { pipelineId: defaultPipeline._id } : 'skip',
  );

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
        <CardContent>
          {!companies || companies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No companies yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((company) => (
                  <TableRow
                    key={company._id}
                    className="cursor-pointer"
                    onClick={() => setSelectedCompanyId(company._id)}
                  >
                    <TableCell className="font-medium">{company.name}</TableCell>
                    <TableCell>
                      {company.website ? <span className="text-muted-foreground">{company.website}</span> : '—'}
                    </TableCell>
                    <TableCell>{company.industry ?? '—'}</TableCell>
                    <TableCell>{company.phone ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(company.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CompanyDetailModal
        companyId={selectedCompanyId}
        onClose={() => setSelectedCompanyId(null)}
        onOpenDeal={(dealId) => {
          setSelectedCompanyId(null);
          setSelectedDealId(dealId);
        }}
        onOpenContact={(contactId) => {
          setSelectedCompanyId(null);
          setSelectedContactId(contactId);
        }}
      />

      <DealDetailModal
        dealId={selectedDealId}
        onClose={() => setSelectedDealId(null)}
        stages={stages ?? []}
        onOpenContact={(contactId) => {
          setSelectedDealId(null);
          setSelectedContactId(contactId);
        }}
        onOpenCompany={(companyId) => {
          setSelectedDealId(null);
          setSelectedCompanyId(companyId);
        }}
      />

      <ContactDetailModal
        contactId={selectedContactId}
        onClose={() => setSelectedContactId(null)}
        onOpenDeal={(dealId) => {
          setSelectedContactId(null);
          setSelectedDealId(dealId);
        }}
        onOpenCompany={(companyId) => {
          setSelectedContactId(null);
          setSelectedCompanyId(companyId);
        }}
      />
    </div>
  );
}
