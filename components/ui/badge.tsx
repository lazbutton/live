import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 shadow-sm",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary/95 backdrop-blur-sm text-primary-foreground hover:bg-primary hover:shadow-md hover:shadow-primary/20",
        secondary:
          "border-transparent bg-secondary/90 backdrop-blur-sm text-secondary-foreground hover:bg-secondary hover:shadow-md",
        destructive:
          "border-transparent bg-destructive/95 backdrop-blur-sm text-destructive-foreground hover:bg-destructive hover:shadow-md hover:shadow-destructive/20",
        outline: "text-foreground border-border/40 bg-background/50 backdrop-blur-sm hover:border-border/60",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

