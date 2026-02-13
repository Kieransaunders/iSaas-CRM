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
import { ContactDetailModal } from '@/components/crm/contact-detail-modal';
import { DealDetailModal } from '@/components/crm/deal-detail-modal';
import { CompanyDetailModal } from '@/components/crm/company-detail-modal';

export const Route = createFileRoute('/_authenticated/contacts')({
  component: ContactsPage,
});

function ContactsPage() {
  const contacts = useQuery(api.crm.contacts.listContacts);
  const companies = useQuery(api.crm.companies.listCompanies);
  const createContact = useMutation(api.crm.contacts.createContact);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<Id<'contacts'> | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<Id<'deals'> | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<Id<'companies'> | null>(null);

  const defaultPipeline = useQuery(api.crm.pipelines.getDefaultPipeline);
  const stages = useQuery(
    api.crm.pipelines.listStagesByPipeline,
    defaultPipeline ? { pipelineId: defaultPipeline._id } : 'skip',
  );

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!firstName.trim()) return;

    await createContact({
      firstName: firstName.trim(),
      lastName: lastName.trim() || undefined,
      email: email.trim() || undefined,
    });

    setFirstName('');
    setLastName('');
    setEmail('');
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
        <p className="text-muted-foreground">People linked to your deals and companies.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New contact</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="first-name">First name</Label>
              <Input id="first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last-name">Last name</Label>
              <Input id="last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="md:col-span-3">
              <Button type="submit" disabled={!firstName.trim()}>
                Create contact
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All contacts</CardTitle>
          <CardDescription>{contacts?.length ?? 0} contacts</CardDescription>
        </CardHeader>
        <CardContent>
          {!contacts || contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contacts yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow
                    key={contact._id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedContactId(contact._id)}
                  >
                    <TableCell className="font-medium">
                      {contact.firstName}
                      {contact.lastName ? ` ${contact.lastName}` : ''}
                    </TableCell>
                    <TableCell>{contact.email ?? '—'}</TableCell>
                    <TableCell>{contact.phone ?? '—'}</TableCell>
                    <TableCell>
                      {contact.companyId ? (companies?.find((c) => c._id === contact.companyId)?.name ?? '—') : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(contact.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
    </div>
  );
}
