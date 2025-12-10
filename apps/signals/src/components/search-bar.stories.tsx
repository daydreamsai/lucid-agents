import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SearchBar, type SearchBarProps, type SearchFilter } from './search-bar';

// Wrapper to handle state for interactive stories
function SearchBarWithState(
  props: Omit<SearchBarProps, 'value' | 'onChange' | 'filters' | 'onFilterChange'> & {
    initialValue?: string;
    initialFilters?: SearchFilter[];
  }
) {
  const { initialValue = '', initialFilters, ...rest } = props;
  const [value, setValue] = useState(initialValue);
  const [filters, setFilters] = useState<SearchFilter[]>(initialFilters ?? []);

  const handleFilterChange = (filterId: string, checked: boolean) => {
    setFilters((prev) =>
      prev.map((f) => (f.id === filterId ? { ...f, checked } : f))
    );
  };

  return (
    <SearchBar
      {...rest}
      value={value}
      onChange={setValue}
      filters={filters.length > 0 ? filters : undefined}
      onFilterChange={handleFilterChange}
      onSubmit={(v) => {
        console.log('Search submitted:', v);
        console.log('Active filters:', filters.filter((f) => f.checked));
      }}
    />
  );
}

const meta = {
  title: 'Components/SearchBar',
  component: SearchBarWithState,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[600px] p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SearchBarWithState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: 'Search agents...',
  },
};

export const WithFilters: Story = {
  args: {
    placeholder: 'Search agents...',
    initialFilters: [
      { id: 'active', label: 'Active only', checked: false },
      { id: 'disabled', label: 'Disabled only', checked: false },
      { id: 'with-pricing', label: 'With pricing', checked: false },
    ],
    filterLabel: 'Status',
  },
};

export const WithActiveFilters: Story = {
  args: {
    placeholder: 'Search agents...',
    initialFilters: [
      { id: 'active', label: 'Active only', checked: true },
      { id: 'disabled', label: 'Disabled only', checked: false },
      { id: 'with-pricing', label: 'With pricing', checked: true },
    ],
    filterLabel: 'Status',
  },
};

export const WithInitialValue: Story = {
  args: {
    placeholder: 'Search agents...',
    initialValue: 'trading bot',
    initialFilters: [
      { id: 'active', label: 'Active only', checked: true },
      { id: 'disabled', label: 'Disabled only', checked: false },
    ],
  },
};

export const Loading: Story = {
  args: {
    placeholder: 'Searching...',
    isLoading: true,
    initialValue: 'analytics',
  },
};

export const NoFilters: Story = {
  args: {
    placeholder: 'Search without filters...',
  },
};

export const ManyFilters: Story = {
  args: {
    placeholder: 'Search agents...',
    initialFilters: [
      { id: 'active', label: 'Active', checked: false },
      { id: 'disabled', label: 'Disabled', checked: false },
      { id: 'with-pricing', label: 'Paid', checked: false },
      { id: 'free', label: 'Free', checked: false },
      { id: 'recent', label: 'Recently updated', checked: false },
    ],
    filterLabel: 'Filter agents',
  },
};

export const FullWidth: Story = {
  args: {
    placeholder: 'Search across all agents...',
    initialFilters: [
      { id: 'active', label: 'Active only', checked: false },
      { id: 'with-pricing', label: 'With pricing', checked: false },
    ],
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-4xl p-4">
        <Story />
      </div>
    ),
  ],
};
