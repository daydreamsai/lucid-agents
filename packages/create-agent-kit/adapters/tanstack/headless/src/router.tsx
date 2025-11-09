import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { QueryClient } from "@tanstack/react-query";

/*import { DefaultCatchBoundary } from "./components/DefaultCatchBoundary";
import { NotFound } from "./components/NotFound";*/
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

export function getRouter() {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    defaultPreload: "intent",
    defaultErrorComponent: () => <div>Error</div>,
    defaultNotFoundComponent: () => <div>Not Found</div>,
    /*defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,*/
    scrollRestoration: true,
  });
  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  });
  return router;
}
