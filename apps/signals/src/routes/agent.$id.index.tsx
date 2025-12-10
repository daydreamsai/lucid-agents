import { createFileRoute, Link } from '@tanstack/react-router';
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
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Send,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  useAgent,
  useAgentEntrypoints,
  useInvokeEntrypoint,
  isApiError,
  type InvokeResponse,
} from '@/api';

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

interface SchemaProperty {
  type?: string;
  description?: string;
}

interface InputSchema {
  type?: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

interface EntrypointCardProps {
  agentId: string;
  entrypoint: {
    key: string;
    description?: string;
    handlerType?: string;
    handlerConfig: Record<string, unknown>;
    price?: string;
    inputSchema?: InputSchema;
  };
}

function EntrypointCard({ agentId, entrypoint }: EntrypointCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [result, setResult] = useState<InvokeResponse | null>(null);
  const [invokeError, setInvokeError] = useState<string | null>(null);

  // Get schema fields or fall back to raw JSON mode
  const schemaFields = entrypoint.inputSchema?.properties
    ? Object.entries(entrypoint.inputSchema.properties)
    : null;
  const requiredFields = entrypoint.inputSchema?.required || [];

  // Form values for schema-based input
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  // Raw JSON for fallback mode
  const [rawJson, setRawJson] = useState('{}');

  const invoke = useInvokeEntrypoint({
    onSuccess: data => {
      setResult(data);
      setInvokeError(null);
    },
    onError: error => {
      setInvokeError(error.error || 'Invocation failed');
      setResult(null);
    },
  });

  const handlerType = entrypoint.handlerType || 'builtin';
  const invokeUrl = `/agents/${agentId}/entrypoints/${entrypoint.key}/invoke`;

  const updateFormValue = (fieldName: string, value: string) => {
    setFormValues(prev => ({ ...prev, [fieldName]: value }));
  };

  const buildInputFromForm = (): Record<string, unknown> => {
    const input: Record<string, unknown> = {};

    if (!schemaFields) return input;

    for (const [fieldName, fieldDef] of schemaFields) {
      const value = formValues[fieldName];
      if (value === undefined || value === '') continue;

      // Convert based on type
      switch (fieldDef.type) {
        case 'number':
          input[fieldName] = parseFloat(value);
          break;
        case 'boolean':
          input[fieldName] = value === 'true';
          break;
        case 'object':
        case 'array':
          try {
            input[fieldName] = JSON.parse(value);
          } catch {
            input[fieldName] = value;
          }
          break;
        default:
          input[fieldName] = value;
      }
    }

    return input;
  };

  const handleInvoke = () => {
    try {
      let parsedInput: unknown;

      if (schemaFields) {
        parsedInput = buildInputFromForm();
      } else {
        parsedInput = rawJson.trim() ? JSON.parse(rawJson) : undefined;
      }

      invoke.mutate({
        path: {
          agentId,
          key: entrypoint.key,
        },
        body: {
          input: parsedInput,
        },
      });
    } catch {
      setInvokeError('Invalid input');
    }
  };

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
    if (!isExpanded) {
      // Reset state when opening
      setResult(null);
      setInvokeError(null);
    }
  };

  return (
    <div className="rounded-lg border">
      {/* Header row */}
      <div className="flex items-start justify-between p-4">
        <div className="space-y-1 flex-1">
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
        <Button
          variant={isExpanded ? 'default' : 'outline'}
          size="sm"
          onClick={toggleExpanded}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="size-4" />
              Close
            </>
          ) : (
            <>
              <Play className="size-4" />
              Test
            </>
          )}
        </Button>
      </div>

      {/* Expandable test panel */}
      {isExpanded && (
        <div className="border-t bg-muted/30 p-4 space-y-4">
          {/* Input section - Schema-based or raw JSON */}
          {schemaFields && schemaFields.length > 0 ? (
            <div className="space-y-3">
              <Label>Input</Label>
              <div className="space-y-3">
                {schemaFields.map(([fieldName, fieldDef]) => {
                  const isRequired = requiredFields.includes(fieldName);
                  const fieldType = fieldDef.type || 'string';

                  return (
                    <div key={fieldName} className="space-y-1">
                      <label className="text-sm font-medium flex items-center gap-1">
                        {fieldName}
                        {isRequired && (
                          <span className="text-destructive">*</span>
                        )}
                        <span className="text-muted-foreground font-normal text-xs">
                          ({fieldType})
                        </span>
                      </label>
                      {fieldDef.description && (
                        <p className="text-muted-foreground text-xs">
                          {fieldDef.description}
                        </p>
                      )}
                      {fieldType === 'boolean' ? (
                        <select
                          value={formValues[fieldName] || ''}
                          onChange={e => updateFormValue(fieldName, e.target.value)}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="">Select...</option>
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : fieldType === 'object' || fieldType === 'array' ? (
                        <Textarea
                          value={formValues[fieldName] || ''}
                          onChange={e => updateFormValue(fieldName, e.target.value)}
                          placeholder={
                            fieldType === 'array' ? '["item1", "item2"]' : '{"key": "value"}'
                          }
                          className="font-mono text-sm bg-background"
                          rows={3}
                        />
                      ) : (
                        <Input
                          type={fieldType === 'number' ? 'number' : 'text'}
                          value={formValues[fieldName] || ''}
                          onChange={e => updateFormValue(fieldName, e.target.value)}
                          placeholder={`Enter ${fieldName}`}
                          required={isRequired}
                          className="bg-background"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor={`input-${entrypoint.key}`}>Input (JSON)</Label>
              <Textarea
                id={`input-${entrypoint.key}`}
                value={rawJson}
                onChange={e => setRawJson(e.target.value)}
                placeholder="{}"
                className="font-mono text-sm min-h-[100px] bg-background"
                rows={4}
              />
              <p className="text-muted-foreground text-xs">
                No input schema defined. Enter raw JSON or leave empty.
              </p>
            </div>
          )}

          {/* Invoke button */}
          <div className="flex justify-end">
            <Button
              onClick={handleInvoke}
              disabled={invoke.isPending}
              size="sm"
            >
              {invoke.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Invoke
            </Button>
          </div>

          {/* Results section */}
          {(result || invokeError) && (
            <div className="space-y-2">
              <Label>Result</Label>
              {invokeError ? (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
                  <div className="flex items-center gap-2 text-destructive text-sm font-medium">
                    <AlertCircle className="size-4" />
                    Error
                  </div>
                  <p className="text-destructive text-sm mt-1">{invokeError}</p>
                </div>
              ) : result ? (
                <div className="rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm font-medium">
                    <CheckCircle2 className="size-4" />
                    Success
                  </div>

                  {/* Output */}
                  <div className="space-y-1 max-w-auto">
                    <span className="text-xs text-muted-foreground">
                      Output
                    </span>
                    <pre className="text-xs bg-background p-3 rounded-md  overflow-y-auto max-h-[200px] max-w-scroll border whitespace-pre">
                      {JSON.stringify(result.output, null, 2)}
                    </pre>
                  </div>

                  {/* Metadata row */}
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <div>
                      <span className="font-medium">Session:</span>{' '}
                      <code className="bg-muted px-1 rounded">
                        {result.sessionId}
                      </code>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
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
