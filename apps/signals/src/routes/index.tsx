import { createFileRoute } from '@tanstack/react-router';
import { AgentGrid } from '@/components/agent-grid';
import { useAgents, isApiError } from '@/api';

interface SearchParams {
  q?: string;
  filters?: string;
}

export const Route = createFileRoute('/')({
  component: HomePage,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    q: typeof search.q === 'string' ? search.q : undefined,
    filters: typeof search.filters === 'string' ? search.filters : undefined,
  }),
});

function HomePage() {
  const { q, filters } = Route.useSearch();

  // Parse filters string into individual filter flags
  const filterList = filters?.split(',') ?? [];
  const filterEnabled = filterList.includes('active')
    ? true
    : filterList.includes('disabled')
      ? false
      : undefined;

  const { data, isLoading, error } = useAgents({
    search: q,
    filterEnabled,
  });

  return (
    <div className="flex flex-1 flex-col gap-6 px-4">
      <AgentGrid
        agents={data?.agents ?? []}
        total={data?.total}
        isLoading={isLoading}
        error={
          error
            ? isApiError(error)
              ? error.error
              : 'Failed to load agents'
            : null
        }
      />
    </div>
  );
}
