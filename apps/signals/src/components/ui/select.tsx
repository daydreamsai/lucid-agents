import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"

interface SelectProps extends React.ComponentProps<"select"> {
  placeholder?: string
}

function Select({ className, children, placeholder, ...props }: SelectProps) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        className={cn(
          "appearance-none bg-transparent dark:bg-input/30 border-input h-9 w-full rounded-md border px-3 py-1 pr-8 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          className
        )}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 opacity-50" />
    </div>
  )
}

function SelectOption({ className, ...props }: React.ComponentProps<"option">) {
  return <option className={cn(className)} {...props} />
}

export { Select, SelectOption }
