import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { Loader2, Plus } from 'lucide-react';
import { useEffect } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { ContactDetailModal } from '@/components/crm/contact-detail-modal';
import { CompanyDetailModal } from '@/components/crm/company-detail-modal';
import { DealDetailModal } from '@/components/crm/deal-detail-modal';
import { PipelineBoard } from '@/components/crm/pipeline-board';
import { useModalTransition } from '@/hooks/use-modal-transition';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/_authenticated/pipeline')({
  component: PipelinePage,
});

type ActiveModal =
  | { type: 'deal'; id: Id<'deals'> }
  | { type: 'contact'; id: Id<'contacts'> }
  | { type: 'company'; id: Id<'companies'> }
  | null;

function PipelinePage() {
  const ensureDefaultPipeline = useMutation(api.crm.pipelines.ensureDefaultPipeline);
  const defaultPipeline = useQuery(api.crm.pipelines.getDefaultPipeline);
  const board = useQuery(
    api.crm.pipelines.getPipelineBoard,
    defaultPipeline ? { pipelineId: defaultPipeline._id } : 'skip',
  );
  const stages = useQuery(
    api.crm.pipelines.listStagesByPipeline,
    defaultPipeline ? { pipelineId: defaultPipeline._id } : 'skip',
  );

  const { activeModal, openModal, closeModal } = useModalTransition<ActiveModal>();

  const selectedDealId = activeModal?.type === 'deal' ? activeModal.id : null;
  const selectedContactId = activeModal?.type === 'contact' ? activeModal.id : null;
  const selectedCompanyId = activeModal?.type === 'company' ? activeModal.id : null;

  useEffect(() => {
    if (defaultPipeline === null) {
      ensureDefaultPipeline().catch((error) => {
        console.error('Failed to create default pipeline:', error);
      });
    }
  }, [defaultPipeline, ensureDefaultPipeline]);

  if (defaultPipeline === undefined || board === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{board.pipeline?.name ?? 'Pipeline'}</h1>
          <p className="text-sm text-muted-foreground">
            {board.columns.reduce((sum, column) => sum + column.deals.length, 0)} deals across {board.columns.length}{' '}
            stages
          </p>
        </div>
        <Button className="bg-orange-500 text-white hover:bg-orange-600" asChild>
          <a href="/deals">
            <Plus className="mr-1 h-4 w-4" />
            Add Deal
          </a>
        </Button>
      </div>

      <div className="-mx-4 flex-1 px-4">
        <div className="py-4">
          <PipelineBoard columns={board.columns} onDealClick={(dealId) => openModal({ type: 'deal', id: dealId })} />
        </div>
      </div>

      <DealDetailModal
        dealId={selectedDealId}
        onClose={closeModal}
        stages={stages ?? []}
        onOpenContact={(contactId) => openModal({ type: 'contact', id: contactId })}
        onOpenCompany={(companyId) => openModal({ type: 'company', id: companyId })}
      />

      <ContactDetailModal
        contactId={selectedContactId}
        onClose={closeModal}
        onOpenDeal={(dealId) => openModal({ type: 'deal', id: dealId })}
        onOpenCompany={(companyId) => openModal({ type: 'company', id: companyId })}
      />

      <CompanyDetailModal
        companyId={selectedCompanyId}
        onClose={closeModal}
        onOpenDeal={(dealId) => openModal({ type: 'deal', id: dealId })}
        onOpenContact={(contactId) => openModal({ type: 'contact', id: contactId })}
      />
    </div>
  );
}
