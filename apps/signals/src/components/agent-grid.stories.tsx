import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createRouter,
  createRootRoute,
  createRoute,
  createMemoryHistory,
  Outlet,
} from '@tanstack/react-router';
import { AgentGrid, type AgentGridProps } from './agent-grid';
import { useMemo } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

// Wrapper that renders AgentGrid inside router context
function AgentGridWrapper(props: AgentGridProps) {
  const router = useMemo(() => {
    const rootRoute = createRootRoute({
      component: () => (
        <>
          <Outlet />
          <AgentGrid {...props} />
        </>
      ),
    });

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    });

    const createAgentRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/create',
    });

    const agentRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/agent/$id',
    });

    const routeTree = rootRoute.addChildren([indexRoute, createAgentRoute, agentRoute]);

    return createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });
  }, [props]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="w-full max-w-4xl p-4">
        <RouterProvider router={router} />
      </div>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Components/AgentGrid',
  component: AgentGridWrapper,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AgentGridWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleAgents: AgentGridProps['agents'] = [
  {
    id: 'agent-1',
    name: 'Trading Bot',
    slug: 'trading-bot',
    description: 'Automated trading agent for market analysis.',
    enabled: true,
    entrypoints: [
      { key: 'execute', price: '0.50' },
      { key: 'analyze', price: '0.25' },
    ],
  },
  {
    id: 'agent-2',
    name: 'Data Processor',
    slug: 'data-processor',
    description: 'Processes and transforms large datasets.',
    enabled: true,
    entrypoints: [{ key: 'process' }],
  },
  {
    id: 'agent-3',
    name: 'Notification Service',
    slug: 'notification-service',
    description: 'Sends notifications across multiple channels.',
    enabled: false,
    entrypoints: [
      { key: 'send', price: '0.01' },
      { key: 'schedule', price: '0.01' },
      { key: 'cancel' },
    ],
  },
  {
    id: 'agent-4',
    name: 'API Gateway',
    slug: 'api-gateway',
    description: 'Central gateway for API management.',
    enabled: true,
    entrypoints: [{ key: 'route' }],
  },
  {
    id: 'agent-5',
    name: 'Analytics Engine',
    slug: 'analytics-engine',
    description: 'Real-time analytics and reporting.',
    enabled: true,
    entrypoints: [
      { key: 'query', price: '0.10' },
      { key: 'report', price: '1.00' },
    ],
  },
  {
    id: 'agent-6',
    name: 'Auth Service',
    slug: 'auth-service',
    description: 'User authentication and authorization.',
    enabled: false,
    entrypoints: [{ key: 'login' }, { key: 'logout' }, { key: 'refresh' }],
  },
];

export const Default: Story = {
  args: {
    agents: sampleAgents,
    total: 12,
  },
};

export const Loading: Story = {
  args: {
    agents: [],
    isLoading: true,
  },
};

export const Error: Story = {
  args: {
    agents: [],
    error: 'Failed to load agents. Please try again later.',
  },
};

export const Empty: Story = {
  args: {
    agents: [],
  },
};

export const EmptyCustomMessage: Story = {
  args: {
    agents: [],
    emptyState: {
      title: 'No matching agents',
      description: 'Try adjusting your search filters',
      showCreateButton: false,
    },
  },
};

export const SingleAgent: Story = {
  args: {
    agents: [sampleAgents[0]],
    total: 1,
  },
};

export const TwoAgents: Story = {
  args: {
    agents: sampleAgents.slice(0, 2),
    total: 2,
  },
};

export const WithoutCount: Story = {
  args: {
    agents: sampleAgents,
    showCount: false,
  },
};

export const PaginatedView: Story = {
  args: {
    agents: sampleAgents.slice(0, 3),
    total: 50,
  },
};
