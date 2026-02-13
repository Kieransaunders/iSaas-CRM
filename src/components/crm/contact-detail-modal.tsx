import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { ArrowUpRight, Building2, DollarSign, Loader2, Mail, Phone, Plus, Trash2, User } from 'lucide-react';
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
  onOpenDeal?: (dealId: Id<'deals'>) => void;
  onOpenCompany?: (companyId: Id<'companies'>) => void;
  navigationPath?: Array<{ type: 'deal' | 'contact' | 'company'; id: string }>;
  onNavigateToPathIndex?: (index: number) => void;
};

const getPathLabel = (type: 'deal' | 'contact' | 'company') => {
  if (type === 'deal') return 'Deal';
  if (type === 'contact') return 'Contact';
  return 'Company';
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

function toTelHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function ContactDetailModal({
  contactId,
  onClose,
  onOpenDeal,
  onOpenCompany,
  navigationPath,
  onNavigateToPathIndex,
}: ContactDetailModalProps) {
  const contact = useQuery(api.crm.contacts.getContact, contactId ? { contactId } : 'skip');
  const activities = useQuery(api.crm.activities.listContactActivities, contactId ? { contactId } : 'skip');
  const companies = useQuery(api.crm.companies.listCompanies);
  const contactDeals = useQuery(api.crm.relationships.listContactDeals, contactId ? { contactId } : 'skip');

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

  const companyName = contact?.companyId ? companies?.find((c) => c._id === contact.companyId)?.name : undefined;

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
      <DialogContent className="h-[82vh] overflow-hidden p-0 sm:max-w-6xl">
        {!contact ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col lg:flex-row">
            <aside className="w-full shrink-0 border-b bg-muted/20 p-5 lg:w-80 lg:border-b-0 lg:border-r">
              <div className="space-y-4">
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold leading-tight">
                    {contact.firstName}
                    {contact.lastName ? ` ${contact.lastName}` : ''}
                  </h2>
                  {contact.title ? (
                    <Badge variant="secondary" className="text-xs">
                      {contact.title}
                    </Badge>
                  ) : null}
                </div>

                <div className="space-y-2 rounded-md border bg-background p-4 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Email</span>
                    {contact.email ? (
                      <a
                        href={`mailto:${contact.email}`}
                        className="text-right font-medium hover:text-orange-600 hover:underline"
                      >
                        {contact.email}
                      </a>
                    ) : (
                      <span className="text-right font-medium">Not set</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Phone</span>
                    {contact.phone ? (
                      <a
                        href={toTelHref(contact.phone)}
                        className="text-right font-medium hover:text-orange-600 hover:underline"
                      >
                        {contact.phone}
                      </a>
                    ) : (
                      <span className="text-right font-medium">Not set</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Company</span>
                    {companyName && contact.companyId ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-right font-medium hover:text-orange-600 hover:underline"
                        onClick={() => onOpenCompany?.(contact.companyId as Id<'companies'>)}
                      >
                        {companyName}
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <span className="text-right font-medium">Not linked</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Deals</span>
                    <span className="font-medium">{contactDeals?.length ?? 0}</span>
                  </div>
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-destructive hover:text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete contact
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
            </aside>

            <div className="flex min-h-0 flex-1 flex-col p-5">
              <DialogHeader className="space-y-2">
                {navigationPath && navigationPath.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    {navigationPath.map((item, index) => {
                      const isCurrent = index === navigationPath.length - 1;
                      return (
                        <div key={`${item.type}-${item.id}-${index}`} className="flex items-center gap-1">
                          {isCurrent || !onNavigateToPathIndex ? (
                            <span className="font-medium text-foreground">{getPathLabel(item.type)}</span>
                          ) : (
                            <button
                              type="button"
                              className="rounded px-1 py-0.5 hover:bg-muted hover:text-foreground"
                              onClick={() => onNavigateToPathIndex(index)}
                            >
                              {getPathLabel(item.type)}
                            </button>
                          )}
                          {!isCurrent && <span>/</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
                <DialogTitle className="text-xl">Contact workspace</DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-4">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    {contact.email ? (
                      <a href={`mailto:${contact.email}`} className="hover:text-orange-600 hover:underline">
                        {contact.email}
                      </a>
                    ) : (
                      'No email'
                    )}
                  </span>
                  {contact.phone ? (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" />
                      <a href={toTelHref(contact.phone)} className="hover:text-orange-600 hover:underline">
                        {contact.phone}
                      </a>
                    </span>
                  ) : null}
                  {companyName && contact.companyId ? (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        className="flex items-center gap-1 hover:text-orange-600 hover:underline"
                        onClick={() => {
                          if (contact.companyId) {
                            onOpenCompany?.(contact.companyId);
                          }
                        }}
                      >
                        <Building2 className="h-3.5 w-3.5" />
                        {companyName}
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          if (contact.companyId) {
                            onOpenCompany?.(contact.companyId);
                          }
                        }}
                        aria-label="Open linked company"
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  ) : null}
                </DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="info" className="mt-4 flex min-h-0 flex-1 flex-col">
                <TabsList>
                  <TabsTrigger value="info">Info</TabsTrigger>
                  <TabsTrigger value="deals">Deals</TabsTrigger>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                </TabsList>

                <TabsContent value="info" className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
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

                <TabsContent value="deals" className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                  {contactDeals === undefined ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : contactDeals.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">No deals linked to this contact.</p>
                  ) : (
                    <div className="space-y-2">
                      {contactDeals.map((deal) => (
                        <div
                          key={deal._id}
                          className="flex items-center justify-between rounded-md border border-border/70 bg-muted/20 p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              className="text-sm font-medium text-foreground hover:text-orange-600 hover:underline"
                              onClick={() => onOpenDeal?.(deal._id)}
                            >
                              {deal.title}
                            </button>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {deal.value ? (
                                <span className="flex items-center gap-0.5">
                                  <DollarSign className="h-3 w-3" />
                                  {deal.value.toLocaleString()} {deal.currency ?? 'USD'}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => onOpenDeal?.(deal._id)}
                              aria-label="Open linked deal"
                            >
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </Button>
                            {deal.role ? (
                              <Badge variant="secondary" className="text-xs">
                                {deal.role}
                              </Badge>
                            ) : null}
                            <Badge
                              variant={
                                deal.status === 'won' ? 'default' : deal.status === 'lost' ? 'destructive' : 'secondary'
                              }
                              className="text-xs"
                            >
                              {deal.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="activity" className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                  {activities === undefined ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : (
                    <ActivityTimeline activities={activities} />
                  )}
                </TabsContent>
              </Tabs>

              <DialogFooter className="mt-4 border-t pt-4">
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
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
