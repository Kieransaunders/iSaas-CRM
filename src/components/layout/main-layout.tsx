// src/components/layout/main-layout.tsx
import { useCallback, useEffect, useState } from 'react';
import { useQuery } from 'convex/react';
import { Search } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { AppSidebar } from './app-sidebar';
import { ImpersonationBanner } from './impersonation-banner';
import type { ReactNode } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { CommandPalette, type EntitySelection } from '@/components/crm/command-palette';
import { DealDetailModal } from '@/components/crm/deal-detail-modal';
import { ContactDetailModal } from '@/components/crm/contact-detail-modal';
import { CompanyDetailModal } from '@/components/crm/company-detail-modal';

interface MainLayoutProps {
  children: ReactNode;
  breadcrumbs?: Array<{
    label: string;
    href?: string;
  }>;
}

export function MainLayout({ children, breadcrumbs }: MainLayoutProps) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [modalStack, setModalStack] = useState<EntitySelection[]>([]);

  // Stages needed by DealDetailModal
  const defaultPipeline = useQuery(api.crm.pipelines.getDefaultPipeline);
  const stages = useQuery(
    api.crm.pipelines.listStagesByPipeline,
    defaultPipeline ? { pipelineId: defaultPipeline._id } : 'skip',
  );

  // Cmd-K / Ctrl-K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const pushSelection = useCallback((selection: EntitySelection) => {
    setModalStack((prev) => {
      const current = prev[prev.length - 1];
      if (current && current.type === selection.type && current.id === selection.id) {
        return prev;
      }
      return [...prev, selection];
    });
  }, []);

  const handleCommandSelect = useCallback((selection: EntitySelection) => {
    setModalStack([selection]);
    setCommandOpen(false);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : []));
  }, []);

  const handleNavigateToPathIndex = useCallback((index: number) => {
    setModalStack((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      return prev.slice(0, index + 1);
    });
  }, []);

  const currentSelection = modalStack[modalStack.length - 1];
  const selectedDealId: Id<'deals'> | null = currentSelection?.type === 'deal' ? currentSelection.id : null;
  const selectedContactId: Id<'contacts'> | null = currentSelection?.type === 'contact' ? currentSelection.id : null;
  const selectedCompanyId: Id<'companies'> | null = currentSelection?.type === 'company' ? currentSelection.id : null;

  return (
    <TooltipProvider>
      <SidebarProvider>
        {/* Skip to content link for accessibility */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:top-4 focus:left-4"
        >
          Skip to main content
        </a>
        <AppSidebar />
        <SidebarInset id="main-content">
          <ImpersonationBanner />
          <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
            <div className="flex items-center gap-2 px-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarTrigger className="-ml-1 hover:bg-accent" />
                </TooltipTrigger>
                <TooltipContent side="bottom">Toggle sidebar</TooltipContent>
              </Tooltip>
              <Separator orientation="vertical" className="mr-2 h-4" />
              {breadcrumbs && breadcrumbs.length > 0 && (
                <Breadcrumb>
                  <BreadcrumbList>
                    {breadcrumbs.map((crumb, index) => (
                      <BreadcrumbItem
                        key={crumb.label}
                        className={index === breadcrumbs.length - 1 ? 'hidden md:block' : ''}
                      >
                        {index === breadcrumbs.length - 1 ? (
                          <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink href={crumb.href || '#'}>{crumb.label}</BreadcrumbLink>
                        )}
                        {index < breadcrumbs.length - 1 && <BreadcrumbSeparator className="hidden md:block" />}
                      </BreadcrumbItem>
                    ))}
                  </BreadcrumbList>
                </Breadcrumb>
              )}
            </div>
            <div className="ml-auto px-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-muted-foreground"
                    onClick={() => setCommandOpen(true)}
                  >
                    <Search className="h-4 w-4" />
                    <span className="hidden sm:inline">Search</span>
                    <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
                      <span className="text-xs">⌘</span>K
                    </kbd>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Search everything (Cmd+K)</TooltipContent>
              </Tooltip>
            </div>
          </header>
          <main className="flex flex-1 flex-col gap-4 p-4 pt-0">{children}</main>
        </SidebarInset>

        {/* Global Command Palette */}
        <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} onSelect={handleCommandSelect} />

        {/* Global Detail Modals — opened from command palette search results */}
        <DealDetailModal
          dealId={selectedDealId}
          onClose={handleModalClose}
          stages={stages ?? []}
          onOpenContact={(contactId) => pushSelection({ type: 'contact', id: contactId })}
          onOpenCompany={(companyId) => pushSelection({ type: 'company', id: companyId })}
          navigationPath={modalStack}
          onNavigateToPathIndex={handleNavigateToPathIndex}
        />
        <ContactDetailModal
          contactId={selectedContactId}
          onClose={handleModalClose}
          onOpenDeal={(dealId) => pushSelection({ type: 'deal', id: dealId })}
          onOpenCompany={(companyId) => pushSelection({ type: 'company', id: companyId })}
          navigationPath={modalStack}
          onNavigateToPathIndex={handleNavigateToPathIndex}
        />
        <CompanyDetailModal
          companyId={selectedCompanyId}
          onClose={handleModalClose}
          onOpenDeal={(dealId) => pushSelection({ type: 'deal', id: dealId })}
          onOpenContact={(contactId) => pushSelection({ type: 'contact', id: contactId })}
          navigationPath={modalStack}
          onNavigateToPathIndex={handleNavigateToPathIndex}
        />
      </SidebarProvider>
    </TooltipProvider>
  );
}
