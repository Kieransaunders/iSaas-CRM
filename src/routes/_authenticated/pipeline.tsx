import { Link, createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { api } from '../../../convex/_generated/api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createFileRoute('/_authenticated/pipeline')({
  component: PipelinePage,
});

function PipelinePage() {
  const ensureDefaultPipeline = useMutation(api.crm.pipelines.ensureDefaultPipeline);
  const defaultPipeline = useQuery(api.crm.pipelines.getDefaultPipeline);
  const board = useQuery(
    api.crm.pipelines.getPipelineBoard,
    defaultPipeline ? { pipelineId: defaultPipeline._id } : 'skip',
  );

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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pipeline</h1>
        <p className="text-muted-foreground">Track deals as they move through each stage.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {board.columns.map(
          (column: {
            stage: { _id: string; name: string };
            deals: Array<{ _id: string; title: string; value?: number }>;
          }) => (
            <Card key={column.stage._id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span>{column.stage.name}</span>
                  <Badge variant="secondary">{column.deals.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {column.deals.length === 0 && <p className="text-sm text-muted-foreground">No deals in this stage.</p>}
                {column.deals.map((deal: { _id: string; title: string; value?: number }) => (
                  <Link
                    key={deal._id}
                    to="/deals/$dealId"
                    params={{ dealId: deal._id }}
                    className="block rounded-md border p-3 text-sm hover:bg-muted"
                  >
                    <p className="font-medium">{deal.title}</p>
                    <p className="text-muted-foreground">
                      {deal.value ? `$${deal.value.toLocaleString()}` : 'No value set'}
                    </p>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ),
        )}
      </div>
    </div>
  );
}
