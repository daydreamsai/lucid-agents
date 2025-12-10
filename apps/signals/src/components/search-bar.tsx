import { Search, X, Loader2, ChevronDown, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useRef, useCallback } from 'react';

export interface SearchFilter {
  id: string;
  label: string;
  checked: boolean;
}

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  isLoading?: boolean;
  className?: string;
  autoFocus?: boolean;
  filters?: SearchFilter[];
  onFilterChange?: (filterId: string, checked: boolean) => void;
  filterLabel?: string;
}

export function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search...',
  isLoading = false,
  className,
  autoFocus = false,
  filters,
  onFilterChange,
  filterLabel = 'Filter by',
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClear = useCallback(() => {
    onChange('');
    inputRef.current?.focus();
  }, [onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && onSubmit) {
        onSubmit(value);
      }
      if (e.key === 'Escape') {
        handleClear();
      }
    },
    [onSubmit, value, handleClear]
  );

  const activeFilterCount = filters?.filter((f) => f.checked).length ?? 0;

  return (
    <div className={cn('flex', className)}>
      <ButtonGroup className="w-full">
        {/* Search Input */}
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
            {isLoading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <Search className="size-5 text-muted-foreground" />
            )}
          </div>
          <Input
            ref={inputRef}
            type="search"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoFocus={autoFocus}
            className="h-12 pl-12 pr-10 text-base rounded-r-none border-r-0"
          />
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="absolute inset-y-0 right-0 h-full px-3 hover:bg-transparent"
            >
              <X className="size-5 text-muted-foreground" />
              <span className="sr-only">Clear search</span>
            </Button>
          )}
        </div>

        {/* Filter Dropdown */}
        {filters && filters.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="lg"
                className="h-12 px-4 gap-2 rounded-none border-r-0"
              >
                <Filter className="size-4" />
                <span className="hidden sm:inline">Filters</span>
                {activeFilterCount > 0 && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
                    {activeFilterCount}
                  </span>
                )}
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>{filterLabel}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {filters.map((filter) => (
                <DropdownMenuCheckboxItem
                  key={filter.id}
                  checked={filter.checked}
                  onCheckedChange={(checked) =>
                    onFilterChange?.(filter.id, checked as boolean)
                  }
                >
                  {filter.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Search Button */}
        <Button
          type="button"
          size="lg"
          className="h-12 px-6"
          onClick={() => onSubmit?.(value)}
          disabled={isLoading}
        >
          Search
        </Button>
      </ButtonGroup>
    </div>
  );
}
