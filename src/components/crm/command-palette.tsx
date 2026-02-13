// src/components/crm/command-palette.tsx
import { useCallback, useEffect, useState } from 'react';
import { useQuery } from 'convex/react';
import { Building2, CircleDollarSign, Search, User } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';

type EntitySelection =
  | { type: 'deal'; id: Id<'deals'> }
  | { type: 'contact'; id: Id<'contacts'> }
  | { type: 'company'; id: Id<'companies'> };

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (selection: EntitySelection) => void;
};

export type { EntitySelection };

export function CommandPalette({ open, onOpenChange, onSelect }: CommandPaletteProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Debounce: only search after user types at least 1 character
  const results = useQuery(
    api.crm.search.globalSearch,
    searchQuery.trim().length > 0 ? { query: searchQuery.trim() } : 'skip',
  );

  // Reset search when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchQuery('');
    }
  }, [open]);

  const handleSelect = useCallback(
    (selection: EntitySelection) => {
      onSelect(selection);
      onOpenChange(false);
    },
    [onSelect, onOpenChange],
  );

  const hasResults =
    results && (results.deals.length > 0 || results.contacts.length > 0 || results.companies.length > 0);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search deals, contacts, companies..."
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList>
        <CommandEmpty>
          {searchQuery.trim().length === 0 ? 'Start typing to search...' : 'No results found.'}
        </CommandEmpty>

        {results && results.deals.length > 0 && (
          <CommandGroup heading="Deals">
            {results.deals.map((deal) => (
              <CommandItem
                key={deal._id}
                value={`deal-${deal._id}-${deal.title}`}
                onSelect={() => handleSelect({ type: 'deal', id: deal._id })}
              >
                <CircleDollarSign className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="flex-1">{deal.title}</span>
                {deal.value != null && (
                  <span className="text-xs text-muted-foreground">${deal.value.toLocaleString()}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results && results.deals.length > 0 && results.contacts.length > 0 && <CommandSeparator />}

        {results && results.contacts.length > 0 && (
          <CommandGroup heading="Contacts">
            {results.contacts.map((contact) => (
              <CommandItem
                key={contact._id}
                value={`contact-${contact._id}-${contact.firstName} ${contact.lastName ?? ''}`}
                onSelect={() => handleSelect({ type: 'contact', id: contact._id })}
              >
                <User className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="flex-1">
                  {contact.firstName}
                  {contact.lastName ? ` ${contact.lastName}` : ''}
                </span>
                {contact.email && <span className="text-xs text-muted-foreground">{contact.email}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results && results.contacts.length > 0 && results.companies.length > 0 && <CommandSeparator />}

        {results && results.companies.length > 0 && (
          <CommandGroup heading="Companies">
            {results.companies.map((company) => (
              <CommandItem
                key={company._id}
                value={`company-${company._id}-${company.name}`}
                onSelect={() => handleSelect({ type: 'company', id: company._id })}
              >
                <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="flex-1">{company.name}</span>
                {company.industry && <span className="text-xs text-muted-foreground">{company.industry}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
