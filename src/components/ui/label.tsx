import * as React from "react";

import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn(
        "text-sm leading-none font-semibold tracking-tight select-none",
        className
      )}
      {...props}
    />
  );
}

export { Label };
