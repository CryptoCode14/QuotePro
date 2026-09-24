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
        "h-12 w-full rounded-xl border border-input bg-background px-4 text-[15px] shadow-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Input };
