import * as React from "react";
import { Button as BaseButton } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl text-[15px] font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-lg hover:brightness-110 active:scale-[0.98]",
        accent:
          "bg-accent text-accent-foreground shadow-lg hover:brightness-110 active:scale-[0.98]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-md hover:brightness-110 active:scale-[0.98]",
        outline:
          "border border-border bg-background shadow-sm hover:bg-muted active:scale-[0.98]",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:brightness-95 active:scale-[0.98] dark:hover:brightness-110",
        ghost: "hover:bg-muted active:scale-[0.98]",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 [&_svg]:size-4.5",
        sm: "h-9 gap-1.5 rounded-lg px-3.5 text-sm [&_svg]:size-4",
        lg: "h-12 px-7 text-base [&_svg]:size-5",
        icon: "size-11 [&_svg]:size-5",
        "icon-sm": "size-8 rounded-lg [&_svg]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ComponentProps<typeof BaseButton>,
    VariantProps<typeof buttonVariants> {}

function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <BaseButton
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
