import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import {
  ArrowLeft,
  Bot,
  Code,
  Globe,
  Loader2,
  Play,
  Settings,
  Wallet,
  CreditCard,
  Network,
  Copy,
  Check,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAgent, useAgentEntrypoints, isApiError } from '@/api';

export const Route = createFileRoute('/agent/$id/')({
  component: AgentDetailPage,
});

function AgentDetailPage() {
  const { id } = Route.useParams();
  const { data: agent, isLoading, error } = useAgent(id);
  const { data: entrypoints } = useAgentEntrypoints(id);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <div className="text-destructive">
          <Bot className="size-12" />
        </div>
        <h2 className="text-lg font-semibold">Agent not found</h2>
        <p className="text-muted-foreground text-sm">
          {isApiError(error) ? error.error : 'Failed to load agent'}
        </p>
        <Button asChild variant="outline">
          <Link to="/agents">Back to Agents</Link>
        </Button>
      </div>
    );
  }

  if (!agent) return null;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/agents">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10">
              <Bot className="size-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{agent.name}</h1>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    agent.enabled
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                  }`}
                >
                  {agent.enabled ? 'Active' : 'Disabled'}
                </span>
              </div>
              <p className="text-muted-foreground text-sm font-mono">
                {agent.slug}
              </p>
            </div>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link to="/agent/$id/edit" params={{ id }}>
            <Settings className="size-4" />
            Edit
          </Link>
        </Button>
      </div>

      {/* Description */}
      {agent.description && (
        <p className="text-muted-foreground">{agent.description}</p>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Entrypoints</CardDescription>
            <CardTitle className="text-2xl">
              {agent.entrypoints.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Version</CardDescription>
            <CardTitle className="text-2xl font-mono">
              {agent.version}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Created</CardDescription>
            <CardTitle className="text-lg">
              {new Date(agent.createdAt).toLocaleDateString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Updated</CardDescription>
            <CardTitle className="text-lg">
              {new Date(agent.updatedAt).toLocaleDateString()}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Entrypoints */}
      <Card>
        <CardHeader>
          <CardTitle>Entrypoints</CardTitle>
          <CardDescription>
            Available endpoints for invoking this agent
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(entrypoints || agent.entrypoints).map(ep => (
            <EntrypointCard key={ep.key} agentId={agent.id} entrypoint={ep} />
          ))}
        </CardContent>
      </Card>

      {/* Configuration Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Payments Config */}
        {agent.paymentsConfig && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCard className="size-5 text-muted-foreground" />
                <CardTitle className="text-base">Payments</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pay To</span>
                <CopyableText text={agent.paymentsConfig.payTo} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Network</span>
                <span className="font-mono">
                  {agent.paymentsConfig.network}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Facilitator</span>
                <span className="font-mono text-xs truncate max-w-[200px]">
                  {agent.paymentsConfig.facilitatorUrl}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Wallet Config */}
        {agent.walletsConfig?.agent && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Wallet className="size-5 text-muted-foreground" />
                <CardTitle className="text-base">Agent Wallet</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="font-mono">
                  {agent.walletsConfig.agent.type}
                </span>
              </div>
              {agent.walletsConfig.agent.chainId && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Chain ID</span>
                  <span className="font-mono">
                    {agent.walletsConfig.agent.chainId}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* A2A Config */}
        {agent.a2aConfig?.enabled && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Network className="size-5 text-muted-foreground" />
                <CardTitle className="text-base">A2A Protocol</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Manifest URL</span>
                <CopyableText
                  text={`/agents/${agent.id}/.well-known/agent.json`}
                  display="/.well-known/agent.json"
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Metadata */}
      {agent.metadata && Object.keys(agent.metadata).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Metadata</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto">
              {JSON.stringify(agent.metadata, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface EntrypointCardProps {
  agentId: string;
  entrypoint: {
    key: string;
    description?: string;
    handlerType?: string;
    handlerConfig: Record<string, unknown>;
    price?: string;
  };
}

function EntrypointCard({ agentId, entrypoint }: EntrypointCardProps) {
  const handlerType = entrypoint.handlerType || 'builtin';
  const invokeUrl = `/agents/${agentId}/entrypoints/${entrypoint.key}/invoke`;

  return (
    <div className="flex items-start justify-between rounded-lg border p-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-mono font-medium">{entrypoint.key}</span>
          <HandlerTypeBadge type={handlerType} />
          {entrypoint.price && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              ${entrypoint.price}
            </span>
          )}
        </div>
        {entrypoint.description && (
          <p className="text-muted-foreground text-sm">
            {entrypoint.description}
          </p>
        )}
        <div className="pt-1">
          <CopyableText
            text={invokeUrl}
            display={`POST ${invokeUrl}`}
            className="text-xs"
          />
        </div>
      </div>
      <Button variant="outline" size="sm">
        <Play className="size-4" />
        Test
      </Button>
    </div>
  );
}

function HandlerTypeBadge({ type }: { type: string }) {
  const config: Record<
    string,
    { icon: typeof Code; label: string; className: string }
  > = {
    builtin: {
      icon: Settings,
      label: 'Built-in',
      className:
        'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    },
    js: {
      icon: Code,
      label: 'JavaScript',
      className:
        'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    },
    url: {
      icon: Globe,
      label: 'HTTP',
      className:
        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    },
  };

  const { icon: Icon, label, className } = config[type] || config.builtin;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      <Icon className="size-3" />
      {label}
    </span>
  );
}

function CopyableText({
  text,
  display,
  className = '',
}: {
  text: string;
  display?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 font-mono text-muted-foreground hover:text-foreground transition-colors ${className}`}
    >
      <span className="truncate max-w-[200px]">{display || text}</span>
      {copied ? (
        <Check className="size-3 text-green-500" />
      ) : (
        <Copy className="size-3" />
      )}
    </button>
  );
}
