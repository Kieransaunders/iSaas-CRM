import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { Building2, Loader2, Mail, Phone, Plus, Trash2, User } from 'lucide-react';
import type { Id } from '../../../convex/_generated/dataModel';
import { api } from '../../../convex/_generated/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ActivityTimeline } from './activity-timeline';

type ContactDetailModalProps = {
  contactId: Id<'contacts'> | null;
  onClose: () => void;
};

function InfoField({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2 text-sm">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span>{value || '—'}</span>
      </div>
    </div>
  );
}

export function ContactDetailModal({ contactId, onClose }: ContactDetailModalProps) {
  const contact = useQuery(api.crm.contacts.getContact, contactId ? { contactId } : 'skip');
  const activities = useQuery(api.crm.activities.listContactActivities, contactId ? { contactId } : 'skip');
  const companies = useQuery(api.crm.companies.listCompanies);

  const updateContact = useMutation(api.crm.contacts.updateContact);
  const deleteContact = useMutation(api.crm.contacts.deleteContact);
  const createActivity = useMutation(api.crm.activities.createActivity);

  const [isEditing, setIsEditing] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editCompanyId, setEditCompanyId] = useState<string>('');

  const [activityTitle, setActivityTitle] = useState('');
  const [activityType, setActivityType] = useState<'note' | 'call' | 'email' | 'meeting' | 'task'>('note');

  if (!contactId) return null;

  const companyName = contact?.companyId
    ? companies?.find((c) => c._id === contact.companyId)?.name
    : undefined;

  const handleStartEdit = () => {
    if (!contact) return;
    setEditFirstName(contact.firstName);
    setEditLastName(contact.lastName ?? '');
    setEditEmail(contact.email ?? '');
    setEditPhone(contact.phone ?? '');
    setEditTitle(contact.title ?? '');
    setEditCompanyId(contact.companyId ?? '');
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!editFirstName.trim()) return;
    await updateContact({
      contactId,
      firstName: editFirstName.trim(),
      lastName: editLastName.trim() || undefined,
      email: editEmail.trim() || undefined,
      phone: editPhone.trim() || undefined,
      title: editTitle.trim() || undefined,
      companyId: editCompanyId ? (editCompanyId as Id<'companies'>) : undefined,
    });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    await deleteContact({ contactId });
    onClose();
  };

  const handleLogActivity = async () => {
    if (!activityTitle.trim()) return;
    await createActivity({
      contactId,
      type: activityType,
      title: activityTitle.trim(),
    });
    setActivityTitle('');
  };

  return (
    <Dialog open={!!contactId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {!contact ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-xl">
                  {contact.firstName}
                  {contact.lastName ? ` ${contact.lastName}` : ''}
                </DialogTitle>
                {contact.title ? (
                  <Badge variant="secondary" className="text-xs">
                    {contact.title}
                  </Badge>
                ) : null}
                <div className="ml-auto">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete contact</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete {contact.firstName}
                          {contact.lastName ? ` ${contact.lastName}` : ''}? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={handleDelete}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              <DialogDescription>
                <span className="mt-2 flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    {contact.email ?? 'No email'}
                  </span>
                  {contact.phone ? (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" />
                      {contact.phone}
                    </span>
                  ) : null}
                  {companyName ? (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />
                      {companyName}
                    </span>
                  ) : null}
                </span>
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="info" className="mt-4">
              <TabsList>
                <TabsTrigger value="info">Info</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="mt-4 space-y-4">
                {isEditing ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="edit-firstName">First Name</Label>
                        <Input
                          id="edit-firstName"
                          value={editFirstName}
                          onChange={(event) => setEditFirstName(event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-lastName">Last Name</Label>
                        <Input
                          id="edit-lastName"
                          value={editLastName}
                          onChange={(event) => setEditLastName(event.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="edit-email">Email</Label>
                        <Input
                          id="edit-email"
                          type="email"
                          value={editEmail}
                          onChange={(event) => setEditEmail(event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-phone">Phone</Label>
                        <Input
                          id="edit-phone"
                          value={editPhone}
                          onChange={(event) => setEditPhone(event.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="edit-title">Title</Label>
                        <Input
                          id="edit-title"
                          value={editTitle}
                          onChange={(event) => setEditTitle(event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Company</Label>
                        <Select value={editCompanyId} onValueChange={setEditCompanyId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a company" />
                          </SelectTrigger>
                          <SelectContent>
                            {companies?.map((company) => (
                              <SelectItem key={company._id} value={company._id}>
                                {company.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={handleSave} disabled={!editFirstName.trim()}>
                        Save
                      </Button>
                      <Button variant="outline" onClick={handleCancelEdit}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <InfoField icon={User} label="First Name" value={contact.firstName} />
                      <InfoField icon={User} label="Last Name" value={contact.lastName} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <InfoField icon={Mail} label="Email" value={contact.email} />
                      <InfoField icon={Phone} label="Phone" value={contact.phone} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <InfoField icon={User} label="Title" value={contact.title} />
                      <InfoField icon={Building2} label="Company" value={companyName} />
                    </div>
                    <Button variant="outline" onClick={handleStartEdit}>
                      Edit
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="activity" className="mt-4">
                {activities === undefined ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : (
                  <ActivityTimeline activities={activities} />
                )}
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-4">
              <div className="flex w-full items-center gap-2">
                <Select value={activityType} onValueChange={(value) => setActivityType(value as typeof activityType)}>
                  <SelectTrigger className="w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="note">Note</SelectItem>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="task">Task</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Log an activity..."
                  value={activityTitle}
                  onChange={(event) => setActivityTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleLogActivity();
                  }}
                  className="flex-1"
                />
                <Button
                  onClick={handleLogActivity}
                  disabled={!activityTitle.trim()}
                  className="bg-orange-500 text-white hover:bg-orange-600"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
