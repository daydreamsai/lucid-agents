/**
 * HTTP handlers type for agent runtime.
 * Added to runtime by the http() extension.
 */
export type AgentHttpHandlers = {
  health: (req: Request) => Promise<Response>;
  entrypoints: (req: Request) => Promise<Response>;
  manifest: (req: Request) => Promise<Response>;
  landing?: (req: Request) => Promise<Response>;
  favicon: (req: Request) => Promise<Response>;
  invoke: (req: Request, params: { key: string }) => Promise<Response>;
  stream: (req: Request, params: { key: string }) => Promise<Response>;
  tasks: (req: Request) => Promise<Response>;
  getTask: (req: Request, params: { taskId: string }) => Promise<Response>;
  listTasks: (req: Request) => Promise<Response>;
  cancelTask: (req: Request, params: { taskId: string }) => Promise<Response>;
  subscribeTask: (
    req: Request,
    params: { taskId: string }
  ) => Promise<Response>;
};
