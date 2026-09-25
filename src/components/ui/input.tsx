import * as React from "react";
import { Input as BaseInput } from "@base-ui/react/input";

import { cn } from "@/lib/utils";

function Input({
  className,
  type,
  ...props
}: React.ComponentProps<typeof BaseInput>) {
  return (
    <BaseInput
      type={type}
      className={cn(
        "h-12 w-full rounded-xl border border-transparent bg-fill px-4 text-[15px] text-ink shadow-inset outline-none transition-all duration-150 placeholder:text-muted/60 focus-visible:border-accent focus-visible:bg-surface focus-visible:shadow-none focus-visible:ring-4 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Input };
