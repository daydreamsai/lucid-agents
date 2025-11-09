import { createFileRoute } from "@tanstack/react-router";
import { getNetworkInfo } from "@/lib/network";

export const Route = createFileRoute("/")({
  loader: async () => {
    "use server";
    const { agent } = await import("@/agent");
    const manifest = agent.resolveManifest("http://localhost", "/api/agent");
    const entrypoints = agent.listEntrypoints().map((entry) => ({
      key: String(entry.key),
      description: entry.description ? String(entry.description) : null,
      streaming: Boolean(entry.stream),
      price: entry.price ?? manifest.entrypoints?.find(
        (e: any) => e.key === entry.key
      )?.price,
    }));

    return {
      meta: {
        name: manifest.name,
        version: manifest.version,
        description: manifest.description ?? null,
      },
      entrypoints,
    };
  },
  component: HeadlessDashboard,
});

function HeadlessDashboard({
  loaderData,
}: {
  loaderData: Awaited<ReturnType<typeof Route.loader>>;
}) {
  const network = getNetworkInfo();

  return (
    <section className="space-y-4">
      <header>
        <p className="text-sm uppercase tracking-widest text-slate-400">
          Lucid Agent · API Runtime
        </p>
        <h1 className="text-3xl font-semibold">
          {loaderData.meta?.name ?? "Headless Agent"}
        </h1>
        {loaderData.meta?.description ? (
          <p className="text-slate-300">{loaderData.meta.description}</p>
        ) : null}
      </header>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-200">
        <p>
          This project scaffolds the TanStack runtime without a UI shell. Invoke
          entrypoints via HTTP:
        </p>
        <pre className="mt-3 rounded bg-slate-950/70 p-3 text-xs text-slate-100">
{`curl -X POST https://<host>/api/agent/entrypoints/<key>/invoke \\
  -H "Content-Type: application/json" \\
  -d '{ "input": { ... } }'`}
        </pre>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-400">Entrypoints</p>
        <ol className="space-y-2 text-sm text-slate-100">
          {loaderData.entrypoints.map((entry) => (
            <li
              key={entry.key}
              className="rounded border border-slate-800/80 bg-slate-900/40 p-3"
            >
              <p className="font-medium">{entry.key}</p>
              {entry.description ? (
                <p className="text-slate-400">{entry.description}</p>
              ) : null}
              <p className="text-xs text-slate-500">
                Streaming: {entry.streaming ? "yes" : "no"} · Price:{" "}
                {entry.price ?? "free"}
              </p>
            </li>
          ))}
        </ol>
      </div>

      <footer className="text-xs text-slate-500">
        Serving from {network.label} · Update `src/routes/index.tsx` to expose
        your own status page.
      </footer>
    </section>
  );
}
