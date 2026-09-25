import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium whitespace-nowrap transition-colors outline-none select-none [&_svg]:size-3.5",
  {
    variants: {
      variant: {
        default: "bg-ink text-bg",
        secondary: "bg-fill text-ink",
        accent: "bg-accent/15 text-accent",
        destructive: "bg-bad/15 text-bad",
        outline: "border border-hairline text-ink",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
