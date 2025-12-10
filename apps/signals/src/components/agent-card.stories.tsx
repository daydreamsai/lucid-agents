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
import { AgentCard, type AgentCardProps } from './agent-card';
import { useMemo } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

// Wrapper that renders AgentCard inside router context
function AgentCardWrapper(props: AgentCardProps) {
  const router = useMemo(() => {
    const rootRoute = createRootRoute({
      component: () => (
        <>
          <Outlet />
          <AgentCard {...props} />
        </>
      ),
    });

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    });

    const agentRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/agent/$id',
    });

    const routeTree = rootRoute.addChildren([indexRoute, agentRoute]);

    return createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });
  }, [props]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="max-w-sm p-4">
        <RouterProvider router={router} />
      </div>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Components/AgentCard',
  component: AgentCardWrapper,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AgentCardWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {
  args: {
    agent: {
      id: 'agent-123',
      name: 'Trading Bot',
      slug: 'trading-bot',
      description:
        'An automated trading agent that monitors market conditions and executes trades based on predefined strategies.',
      enabled: true,
      entrypoints: [
        { key: 'execute-trade' },
        { key: 'analyze-market' },
        { key: 'get-portfolio' },
      ],
    },
  },
};

export const Disabled: Story = {
  args: {
    agent: {
      id: 'agent-456',
      name: 'Data Analyzer',
      slug: 'data-analyzer',
      description: 'Processes and analyzes large datasets.',
      enabled: false,
      entrypoints: [{ key: 'analyze' }],
    },
  },
};

export const NoDescription: Story = {
  args: {
    agent: {
      id: 'agent-789',
      name: 'Simple Agent',
      slug: 'simple-agent',
      enabled: true,
      entrypoints: [{ key: 'run' }, { key: 'status' }],
    },
  },
};

export const SingleEntrypoint: Story = {
  args: {
    agent: {
      id: 'agent-101',
      name: 'Notification Service',
      slug: 'notification-service',
      description: 'Sends notifications to users via multiple channels.',
      enabled: true,
      entrypoints: [{ key: 'send' }],
    },
  },
};

export const LongDescription: Story = {
  args: {
    agent: {
      id: 'agent-202',
      name: 'Complex Workflow Agent',
      slug: 'complex-workflow-agent',
      description:
        'This agent handles extremely complex multi-step workflows that involve coordinating between multiple services, managing state across distributed systems, and ensuring data consistency throughout the entire process. It also provides detailed logging and monitoring capabilities.',
      enabled: true,
      entrypoints: [
        { key: 'start-workflow' },
        { key: 'check-status' },
        { key: 'cancel-workflow' },
        { key: 'get-logs' },
        { key: 'retry-step' },
      ],
    },
  },
};

export const ManyEntrypoints: Story = {
  args: {
    agent: {
      id: 'agent-303',
      name: 'API Gateway',
      slug: 'api-gateway',
      description: 'Central API gateway with multiple endpoints.',
      enabled: true,
      entrypoints: [
        { key: 'auth' },
        { key: 'users' },
        { key: 'products' },
        { key: 'orders' },
        { key: 'payments' },
        { key: 'notifications' },
        { key: 'analytics' },
        { key: 'reports' },
        { key: 'settings' },
        { key: 'webhooks' },
      ],
    },
  },
};

export const WithPricing: Story = {
  args: {
    agent: {
      id: 'agent-404',
      name: 'Premium AI Assistant',
      slug: 'premium-ai-assistant',
      description: 'A powerful AI assistant with premium features and capabilities.',
      enabled: true,
      entrypoints: [
        { key: 'chat', price: '0.05' },
        { key: 'analyze', price: '0.10' },
        { key: 'generate', price: '0.25' },
      ],
    },
  },
};

export const WithPriceRange: Story = {
  args: {
    agent: {
      id: 'agent-505',
      name: 'Multi-tier Service',
      slug: 'multi-tier-service',
      description: 'Service with different pricing tiers for various operations.',
      enabled: true,
      entrypoints: [
        { key: 'basic', price: '0.01' },
        { key: 'standard', price: '0.50' },
        { key: 'premium', price: '2.00' },
        { key: 'enterprise', price: '5.00' },
      ],
    },
  },
};

export const MixedPricing: Story = {
  args: {
    agent: {
      id: 'agent-606',
      name: 'Freemium Agent',
      slug: 'freemium-agent',
      description: 'Some features are free, others are paid.',
      enabled: true,
      entrypoints: [
        { key: 'free-tier' },
        { key: 'basic', price: '0.10' },
        { key: 'pro', price: '1.00' },
      ],
    },
  },
};
