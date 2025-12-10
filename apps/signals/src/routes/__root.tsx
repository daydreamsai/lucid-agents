import { useState, useCallback, useEffect, useRef } from 'react';
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useNavigate,
  useLocation,
} from '@tanstack/react-router';
import { AppSidebar } from '@/components/app-sidebar';
import { Separator } from '@/components/ui/separator';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { SearchBar, type SearchFilter } from '@/components/search-bar';
import { ThemeProvider } from '@/providers/theme-provider';

import appCss from '../styles.css?url';

import type { QueryClient } from '@tanstack/react-query';
import { ModeToggle } from '@/components/mode-toggle';

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'TanStack Start Starter',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),

  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
                <div className="flex items-center gap-2 px-4">
                  <SidebarTrigger className="-ml-1" />
                  <Separator
                    orientation="vertical"
                    className="mr-2 data-[orientation=vertical]:h-4"
                  />
                </div>
                <div className="flex-1 pr-4">
                  <GlobalSearchBar />
                </div>
                <ModeToggle />
              </header>
              <div className="p-4">{children}</div>
            </SidebarInset>
          </SidebarProvider>
        </ThemeProvider>

        <Scripts />
      </body>
    </html>
  );
}

function GlobalSearchBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get current search params from URL (works on any page)
  const urlParams = new URLSearchParams(location.search);
  const urlQuery = urlParams.get('q') ?? '';
  const urlFilters = urlParams.get('filters')?.split(',') ?? [];

  const [searchValue, setSearchValue] = useState(urlQuery);
  const [filters, setFilters] = useState<SearchFilter[]>([
    {
      id: 'active',
      label: 'Active only',
      checked: urlFilters.includes('active'),
    },
    {
      id: 'disabled',
      label: 'Disabled only',
      checked: urlFilters.includes('disabled'),
    },
  ]);

  // Sync search value with URL when navigating (but not from our own debounced updates)
  const isInternalUpdate = useRef(false);
  useEffect(() => {
    if (!isInternalUpdate.current) {
      setSearchValue(urlQuery);
      setFilters([
        {
          id: 'active',
          label: 'Active only',
          checked: urlFilters.includes('active'),
        },
        {
          id: 'disabled',
          label: 'Disabled only',
          checked: urlFilters.includes('disabled'),
        },
      ]);
    }
    isInternalUpdate.current = false;
  }, [urlQuery, urlFilters.join(',')]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const doSearch = useCallback(
    (value: string, currentFilters: SearchFilter[]) => {
      const activeFilters = currentFilters.filter(f => f.checked);
      isInternalUpdate.current = true;

      navigate({
        to: '/',
        search: {
          q: value || undefined,
          filters:
            activeFilters.length > 0
              ? activeFilters.map(f => f.id).join(',')
              : undefined,
        },
      });
    },
    [navigate]
  );

  const handleChange = useCallback(
    (value: string) => {
      setSearchValue(value);

      // Debounce the search
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        doSearch(value, filters);
      }, 300);
    },
    [doSearch, filters]
  );

  const handleFilterChange = useCallback(
    (filterId: string, checked: boolean) => {
      const newFilters = filters.map(f =>
        f.id === filterId ? { ...f, checked } : f
      );
      setFilters(newFilters);

      // Immediately search when filter changes
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      doSearch(searchValue, newFilters);
    },
    [filters, searchValue, doSearch]
  );

  const handleSubmit = useCallback(
    (value: string) => {
      // Cancel any pending debounce and search immediately
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      doSearch(value, filters);
    },
    [doSearch, filters]
  );

  return (
    <SearchBar
      value={searchValue}
      onChange={handleChange}
      onSubmit={handleSubmit}
      placeholder="Search agents..."
      filters={filters}
      onFilterChange={handleFilterChange}
      filterLabel="Filter by"
    />
  );
}
