import { createFileRoute, notFound } from '@tanstack/react-router';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { createServerFn } from '@tanstack/react-start';
import { source } from '@/lib/source';
import type * as PageTree from 'fumadocs-core/page-tree';
import {
  Children,
  isValidElement,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import browserCollections from 'fumadocs-mdx:collections/browser';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { baseOptions } from '@/lib/layout.shared';
import { LLMCopyButton, ViewOptions } from '@/components/page-actions';

export const Route = createFileRoute('/docs/$')({
  component: Page,
  loader: async ({ params }) => {
    const slugs = params._splat?.split('/') ?? [];
    const data = await loader({ data: slugs });
    await clientLoader.preload(data.path);
    return data;
  },
});

const loader = createServerFn({
  method: 'GET',
})
  .inputValidator((slugs: string[]) => slugs)
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs);
    if (!page) throw notFound();

    return {
      tree: source.pageTree as object,
      path: page.path,
    };
  });

type DocsPageProps = {
  markdownUrl: string;
};

type TabsProps = {
  items?: string[];
  children?: ReactNode;
};

type TabProps = {
  value?: string;
  children?: ReactNode;
};

function Tab(_props: TabProps): null {
  return null;
}

function Tabs({ items, children }: TabsProps) {
  const tabs = useMemo(() => {
    return Children.toArray(children)
      .filter((child): child is ReactElement<TabProps> => isValidElement(child))
      .map((child, index) => ({
        label: child.props.value ?? items?.[index] ?? `Tab ${index + 1}`,
        content: child.props.children,
      }));
  }, [children, items]);

  const [activeTab, setActiveTab] = useState(0);

  if (tabs.length === 0) {
    return null;
  }

  const safeActiveTab = Math.min(activeTab, tabs.length - 1);

  return (
    <div className="my-6 overflow-hidden rounded-lg border border-fd-border bg-fd-card">
      <div className="flex flex-wrap gap-2 border-b border-fd-border bg-fd-muted/30 p-2">
        {tabs.map((tab, index) => (
          <button
            key={tab.label + index}
            type="button"
            onClick={() => setActiveTab(index)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              index === safeActiveTab
                ? 'bg-fd-primary text-fd-primary-foreground'
                : 'bg-fd-secondary text-fd-secondary-foreground hover:bg-fd-accent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="p-4">{tabs[safeActiveTab]?.content}</div>
    </div>
  );
}

type StepsProps = {
  children?: ReactNode;
};

function Steps({ children }: StepsProps) {
  return <ol className="my-6 list-decimal space-y-2 pl-6">{children}</ol>;
}

type StepProps = {
  children?: ReactNode;
};

function Step({ children }: StepProps) {
  return <li>{children}</li>;
}

const clientLoader = browserCollections.docs.createClientLoader<DocsPageProps>({
  component({ toc, frontmatter, default: MDX }, { markdownUrl }) {
    return (
      <DocsPage toc={toc}>
        <div className="flex flex-row gap-2 items-center border-b pt-2 pb-6">
          <LLMCopyButton markdownUrl={markdownUrl} />
          <ViewOptions
            markdownUrl={`${markdownUrl}.mdx`}
            githubUrl={`https://github.com/daydreamsai/lucid-agents/blob/master/lucid-docs/content/${markdownUrl}`}
          />
        </div>
        <DocsTitle>{frontmatter.title}</DocsTitle>
        <DocsDescription>{frontmatter.description}</DocsDescription>
        <DocsBody>
          <MDX
            components={{
              ...defaultMdxComponents,
              Tabs,
              Tab,
              Steps,
              Step,
            }}
          />
        </DocsBody>
      </DocsPage>
    );
  },
});

function Page() {
  const data = Route.useLoaderData();
  const params = Route.useParams();
  const slugPath = params._splat ?? '';
  const markdownUrl = `/docs/${slugPath}.mdx`;
  const Content = clientLoader.getComponent(data.path);
  const tree = useMemo(
    () => transformPageTree(data.tree as PageTree.Folder),
    [data.tree]
  );

  return (
    <DocsLayout {...baseOptions()} tree={tree}>
      <Content markdownUrl={markdownUrl} />
    </DocsLayout>
  );
}

function transformPageTree(root: PageTree.Root): PageTree.Root {
  function mapNode<T extends PageTree.Node>(item: T): T {
    if (typeof item.icon === 'string') {
      item = {
        ...item,
        icon: (
          <span
            dangerouslySetInnerHTML={{
              __html: item.icon,
            }}
          />
        ),
      };
    }

    if (item.type === 'folder') {
      return {
        ...item,
        index: item.index ? mapNode(item.index) : undefined,
        children: item.children.map(mapNode),
      };
    }

    return item;
  }

  return {
    ...root,
    children: root.children.map(mapNode),
    fallback: root.fallback ? transformPageTree(root.fallback) : undefined,
  };
}
