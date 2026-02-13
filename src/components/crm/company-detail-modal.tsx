import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { ArrowUpRight, DollarSign, Globe, Loader2, Phone, Plus, Trash2 } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { ActivityTimeline } from './activity-timeline';

const INDUSTRIES = ['Technology', 'Healthcare', 'Finance', 'Retail', 'Manufacturing', 'Services', 'Other'];

type CompanyDetailModalProps = {
  companyId: Id<'companies'> | null;
  onClose: () => void;
  onOpenDeal?: (dealId: Id<'deals'>) => void;
  onOpenContact?: (contactId: Id<'contacts'>) => void;
  navigationPath?: Array<{ type: 'deal' | 'contact' | 'company'; id: string }>;
  onNavigateToPathIndex?: (index: number) => void;
};

const getPathLabel = (type: 'deal' | 'contact' | 'company') => {
  if (type === 'deal') return 'Deal';
  if (type === 'contact') return 'Contact';
  return 'Company';
};

export function CompanyDetailModal({
  companyId,
  onClose,
  onOpenDeal,
  onOpenContact,
  navigationPath,
  onNavigateToPathIndex,
}: CompanyDetailModalProps) {
  const company = useQuery(api.crm.companies.getCompany, companyId ? { companyId } : 'skip');
  const activities = useQuery(api.crm.activities.listCompanyActivities, companyId ? { companyId } : 'skip');
  const contacts = useQuery(api.crm.contacts.listContacts);
  const companyDeals = useQuery(api.crm.relationships.listCompanyDeals, companyId ? { companyId } : 'skip');

  const updateCompany = useMutation(api.crm.companies.updateCompany);
  const deleteCompany = useMutation(api.crm.companies.deleteCompany);
  const createActivity = useMutation(api.crm.activities.createActivity);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editIndustry, setEditIndustry] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [activityTitle, setActivityTitle] = useState('');
  const [activityType, setActivityType] = useState<'note' | 'call' | 'email' | 'meeting' | 'task'>('note');

  if (!companyId) return null;

  const companyContacts = contacts?.filter((c) => c.companyId === companyId) ?? [];

  const handleStartEditing = () => {
    if (!company) return;
    setEditName(company.name);
    setEditWebsite(company.website ?? '');
    setEditPhone(company.phone ?? '');
    setEditIndustry(company.industry ?? '');
    setEditNotes(company.notes ?? '');
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!editName.trim()) return;
    await updateCompany({
      companyId,
      name: editName.trim(),
      website: editWebsite.trim() || undefined,
      phone: editPhone.trim() || undefined,
      industry: editIndustry || undefined,
      notes: editNotes.trim() || undefined,
    });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    await deleteCompany({ companyId });
    onClose();
  };

  const handleLogActivity = async () => {
    if (!activityTitle.trim()) return;
    await createActivity({
      companyId,
      type: activityType,
      title: activityTitle.trim(),
    });
    setActivityTitle('');
  };

  return (
    <Dialog open={!!companyId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="h-[82vh] overflow-hidden p-0 sm:max-w-6xl">
        {!company ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col lg:flex-row">
            <aside className="w-full shrink-0 border-b bg-muted/20 p-5 lg:w-80 lg:border-b-0 lg:border-r">
              <div className="space-y-4">
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold leading-tight">{company.name}</h2>
                  {company.industry ? (
                    <Badge variant="secondary" className="text-xs">
                      {company.industry}
                    </Badge>
                  ) : null}
                </div>

                <div className="space-y-2 rounded-md border bg-background p-4 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Website</span>
                    <span className="text-right font-medium">{company.website ?? 'Not set'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Phone</span>
                    <span className="text-right font-medium">{company.phone ?? 'Not set'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Contacts</span>
                    <span className="font-medium">{companyContacts.length}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Deals</span>
                    <span className="font-medium">{companyDeals?.length ?? 0}</span>
                  </div>
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-destructive hover:text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete company
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete company</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete &quot;{company.name}&quot;? This action cannot be undone.
                        Contacts linked to this company will be unlinked.
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
                <DialogTitle className="text-xl">Company workspace</DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-4">
                  {company.website ? (
                    <span className="flex items-center gap-1">
                      <Globe className="h-3.5 w-3.5" />
                      <a
                        href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-foreground"
                      >
                        {company.website}
                      </a>
                    </span>
                  ) : null}
                  {company.phone ? (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" />
                      {company.phone}
                    </span>
                  ) : null}
                </DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="info" className="mt-4 flex min-h-0 flex-1 flex-col">
                <TabsList>
                  <TabsTrigger value="info">Info</TabsTrigger>
                  <TabsTrigger value="contacts">Contacts ({companyContacts.length})</TabsTrigger>
                  <TabsTrigger value="deals">Deals</TabsTrigger>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                </TabsList>

                <TabsContent value="info" className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                  {isEditing ? (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Name</Label>
                          <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Website</Label>
                          <Input
                            value={editWebsite}
                            onChange={(e) => setEditWebsite(e.target.value)}
                            placeholder="https://example.com"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Phone</Label>
                          <Input
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            placeholder="+1 (555) 000-0000"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Industry</Label>
                          <Select value={editIndustry} onValueChange={setEditIndustry}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select industry" />
                            </SelectTrigger>
                            <SelectContent>
                              {INDUSTRIES.map((industry) => (
                                <SelectItem key={industry} value={industry}>
                                  {industry}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Notes</Label>
                        <Textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Add notes about this company..."
                          rows={3}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleSave} disabled={!editName.trim()}>
                          Save
                        </Button>
                        <Button variant="outline" onClick={handleCancelEditing}>
                          Cancel
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Name</Label>
                          <p className="py-2 text-sm font-medium">{company.name}</p>
                        </div>
                        <div className="space-y-2">
                          <Label>Website</Label>
                          <p className="py-2 text-sm font-medium">{company.website ?? '—'}</p>
                        </div>
                        <div className="space-y-2">
                          <Label>Phone</Label>
                          <p className="py-2 text-sm font-medium">{company.phone ?? '—'}</p>
                        </div>
                        <div className="space-y-2">
                          <Label>Industry</Label>
                          <p className="py-2 text-sm font-medium">{company.industry ?? '—'}</p>
                        </div>
                      </div>
                      {company.notes ? (
                        <div className="space-y-2">
                          <Label>Notes</Label>
                          <p className="rounded-md border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
                            {company.notes}
                          </p>
                        </div>
                      ) : null}
                      <Button variant="outline" onClick={handleStartEditing}>
                        Edit
                      </Button>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="contacts" className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                  {contacts === undefined ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : companyContacts.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">No contacts at this company.</p>
                  ) : (
                    <div className="space-y-2">
                      {companyContacts.map((contact) => (
                        <div
                          key={contact._id}
                          className="flex items-start justify-between gap-2 rounded-md border border-border/70 bg-muted/20 p-3 text-sm text-foreground"
                        >
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              className="font-medium text-foreground hover:text-orange-600 hover:underline"
                              onClick={() => onOpenContact?.(contact._id)}
                            >
                              {contact.firstName}
                              {contact.lastName ? ` ${contact.lastName}` : ''}
                            </button>
                            {contact.email ? <p className="text-xs text-muted-foreground">{contact.email}</p> : null}
                            {contact.title ? <p className="text-xs text-muted-foreground">{contact.title}</p> : null}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => onOpenContact?.(contact._id)}
                            aria-label="Open linked contact"
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="deals" className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                  {companyDeals === undefined ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : companyDeals.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">No deals linked to this company.</p>
                  ) : (
                    <div className="space-y-2">
                      {companyDeals.map((deal) => (
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
                            {deal.relationshipType ? (
                              <Badge variant="secondary" className="text-xs">
                                {deal.relationshipType}
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
