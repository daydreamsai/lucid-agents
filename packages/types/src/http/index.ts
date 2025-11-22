/**
 * HTTP extension options.
 */
export type HttpExtensionOptions = {
  /**
   * Whether to enable the landing page route.
   * @default true
   */
  landingPage?: boolean;
};

/**
 * HTTP handlers type for agent runtime.
 * Added to runtime by the http() extension.
 */
export type AgentHttpHandlers = {
  /**
   * Health check endpoint handler.
   */
  health: (req: Request) => Promise<Response>;

  /**
   * List all entrypoints handler.
   */
  entrypoints: (req: Request) => Promise<Response>;

  /**
   * Agent manifest/card endpoint handler.
   */
  manifest: (req: Request) => Promise<Response>;

  /**
   * Landing page handler (optional, depends on extension options).
   */
  landing?: (req: Request) => Promise<Response>;

  /**
   * Favicon handler.
   */
  favicon: (req: Request) => Promise<Response>;

  /**
   * Invoke an entrypoint handler.
   */
  invoke: (req: Request, params: { key: string }) => Promise<Response>;

  /**
   * Stream from an entrypoint handler.
   */
  stream: (req: Request, params: { key: string }) => Promise<Response>;

  /**
   * Create a new task (A2A Protocol).
   */
  tasks: (req: Request) => Promise<Response>;

  /**
   * Get a task by ID (A2A Protocol).
   */
  getTask: (req: Request, params: { taskId: string }) => Promise<Response>;

  /**
   * List tasks (A2A Protocol).
   */
  listTasks: (req: Request) => Promise<Response>;

  /**
   * Cancel a task (A2A Protocol).
   */
  cancelTask: (req: Request, params: { taskId: string }) => Promise<Response>;

  /**
   * Subscribe to task updates via SSE (A2A Protocol).
   */
  subscribeTask: (
    req: Request,
    params: { taskId: string }
  ) => Promise<Response>;
};

