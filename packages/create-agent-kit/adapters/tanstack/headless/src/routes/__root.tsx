import {
  HeadContent,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Lucid Agent API",
      },
      {
        name: "description",
        content: "Headless TanStack runtime for Lucid Agents",
      },
    ],
  }),
  component: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-slate-950 text-slate-100">
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-10">
          {children}
        </main>
        <Scripts />
      </body>
    </html>
  );
}
