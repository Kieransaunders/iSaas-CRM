import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const Route = createFileRoute('/_authenticated/contacts')({
  component: ContactsPage,
});

function ContactsPage() {
  const contacts = useQuery(api.crm.contacts.listContacts);
  const createContact = useMutation(api.crm.contacts.createContact);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');

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
        <CardContent className="space-y-2">
          {contacts === undefined || contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contacts yet.</p>
          ) : (
            contacts.map((contact: { _id: string; firstName: string; lastName?: string; email?: string }) => (
              <div key={contact._id} className="rounded-md border p-3">
                <p className="font-medium">{[contact.firstName, contact.lastName].filter(Boolean).join(' ')}</p>
                <p className="text-sm text-muted-foreground">{contact.email || 'No email'}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
