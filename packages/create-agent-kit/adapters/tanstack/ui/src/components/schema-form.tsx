import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

type JSONSchema = {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: JSONSchema;
  enum?: any[];
};

type SchemaFormProps = {
  schema: JSONSchema | null;
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

function getDefaultValue(schema: JSONSchema): any {
  if (!schema.type) return '';

  switch (schema.type) {
    case 'string':
      return '';
    case 'number':
    case 'integer':
      return schema.minimum ?? 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object':
      if (schema.properties) {
        const obj: Record<string, any> = {};
        Object.entries(schema.properties).forEach(([key, propSchema]) => {
          obj[key] = getDefaultValue(propSchema);
        });
        return obj;
      }
      return {};
    default:
      return '';
  }
}

function renderField(
  name: string,
  schema: JSONSchema,
  value: any,
  onChange: (value: any) => void,
  required: boolean
): JSX.Element {
  const fieldId = `field-${name}`;
  const description = schema.description;

  const renderInput = () => {
    switch (schema.type) {
      case 'string':
        if (schema.enum) {
          return (
            <select
              id={fieldId}
              value={value || ''}
              onChange={e => onChange(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/40"
            >
              <option value="">Select...</option>
              {schema.enum.map(option => (
                <option key={String(option)} value={String(option)}>
                  {String(option)}
                </option>
              ))}
            </select>
          );
        }
        return (
          <input
            id={fieldId}
            type="text"
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            placeholder={description}
            minLength={schema.minLength}
            maxLength={schema.maxLength}
            pattern={schema.pattern}
            required={required}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/40"
          />
        );

      case 'number':
      case 'integer':
        return (
          <input
            id={fieldId}
            type="number"
            value={value ?? ''}
            onChange={e =>
              onChange(e.target.value === '' ? null : Number(e.target.value))
            }
            min={schema.minimum}
            max={schema.maximum}
            step={schema.type === 'integer' ? 1 : 'any'}
            required={required}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/40"
          />
        );

      case 'boolean':
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              id={fieldId}
              type="checkbox"
              checked={!!value}
              onChange={e => onChange(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
            />
            <span className="text-sm text-zinc-300">
              {description || 'Enable'}
            </span>
          </label>
        );

      case 'array':
        return (
          <div className="space-y-2">
            <div className="text-xs text-zinc-400">
              Array (edit JSON below or add items)
            </div>
            <textarea
              value={JSON.stringify(value || [], null, 2)}
              onChange={e => {
                try {
                  onChange(JSON.parse(e.target.value));
                } catch {
                  // Invalid JSON, don't update
                }
              }}
              rows={3}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/40"
            />
          </div>
        );

      default:
        return (
          <input
            id={fieldId}
            type="text"
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/40"
          />
        );
    }
  };

  return (
    <div key={name} className="space-y-1.5">
      <label
        htmlFor={fieldId}
        className="block text-sm font-medium text-zinc-300"
      >
        {name}
        {required && <span className="ml-1 text-rose-400">*</span>}
      </label>
      {description && schema.type !== 'boolean' && (
        <p className="text-xs text-zinc-500">{description}</p>
      )}
      {renderInput()}
    </div>
  );
}

export function SchemaForm({
  schema,
  value,
  onChange,
  className,
}: SchemaFormProps) {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [isManualMode, setIsManualMode] = useState(false);

  // Initialize form data from schema
  useEffect(() => {
    if (!schema || !schema.properties) return;

    try {
      const parsed = JSON.parse(value);
      if (parsed.input && typeof parsed.input === 'object') {
        setFormData(parsed.input);
      } else {
        // Initialize with default values
        const defaults: Record<string, any> = {};
        Object.entries(schema.properties).forEach(([key, propSchema]) => {
          defaults[key] = getDefaultValue(propSchema);
        });
        setFormData(defaults);
      }
    } catch {
      // Initialize with default values
      const defaults: Record<string, any> = {};
      Object.entries(schema.properties).forEach(([key, propSchema]) => {
        defaults[key] = getDefaultValue(propSchema);
      });
      setFormData(defaults);
    }
  }, [schema, value]);

  // Update parent whenever formData changes
  useEffect(() => {
    if (!isManualMode && Object.keys(formData).length > 0) {
      onChange(JSON.stringify({ input: formData }, null, 2));
    }
  }, [formData, isManualMode]);

  if (!schema || !schema.properties) {
    return (
      <div className={cn('space-y-2', className)}>
        <label className="block text-sm font-medium text-zinc-300">
          JSON Payload
        </label>
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          className="h-32 w-full rounded-xl border border-zinc-800 bg-black/50 px-3 py-2 font-mono text-sm text-zinc-200 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/40"
        />
      </div>
    );
  }

  const required = schema.required || [];
  const properties = schema.properties;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-zinc-300">
          Input Parameters
        </label>
        <button
          type="button"
          onClick={() => setIsManualMode(!isManualMode)}
          className="text-xs text-zinc-400 hover:text-zinc-200 transition"
        >
          {isManualMode ? 'Use Form' : 'Edit JSON'}
        </button>
      </div>

      {isManualMode ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          className="h-48 w-full rounded-xl border border-zinc-800 bg-black/50 px-3 py-2 font-mono text-sm text-zinc-200 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/40"
        />
      ) : (
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-black/50 p-4">
          {Object.entries(properties).map(([name, propSchema]) =>
            renderField(
              name,
              propSchema,
              formData[name],
              newValue => setFormData({ ...formData, [name]: newValue }),
              required.includes(name)
            )
          )}
        </div>
      )}
    </div>
  );
}
