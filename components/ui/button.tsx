"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium outline-none transition-[color,background-color,border-color,box-shadow,opacity] duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/88 active:bg-primary/80",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 active:bg-destructive/85 focus-visible:ring-destructive/30 dark:bg-destructive/75 dark:hover:bg-destructive/85",
        outline:
          "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground active:bg-accent/80 dark:bg-input/25 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70 active:bg-secondary/60 dark:hover:bg-secondary/80",
        ghost:
          "text-foreground/80 hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
        link: "text-foreground underline-offset-4 hover:underline",
        accent:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70 active:bg-secondary/60",
      },
      size: {
        default: "h-9 px-4 has-[>svg]:px-3 max-md:h-10",
        sm: "h-8 gap-1.5 px-3 text-[13px] has-[>svg]:px-2.5 max-md:h-9",
        xs: "h-7 gap-1 rounded-md px-2 text-xs [&_svg]:size-3.5",
        lg: "h-10 px-6 has-[>svg]:px-4 max-md:h-11",
        icon: "size-9 max-md:size-10",
        "icon-sm": "size-8 max-md:size-9",
        "icon-xs": "size-7 [&_svg]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
