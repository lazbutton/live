"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface MobileTableViewProps {
  children?: React.ReactNode;
  className?: string;
  /**
   * Desktop table component (will be hidden on mobile)
   */
  desktopView?: React.ReactNode;
  /**
   * Mobile card views (will be hidden on desktop)
   */
  mobileView?: React.ReactNode;
}

/**
 * Wrapper component that shows table on desktop/tablet and card view on mobile
 * Usage:
 * <MobileTableView
 *   desktopView={<Table>...</Table>}
 *   mobileView={<MobileCard>...</MobileCard>}
 * />
 */
export function MobileTableView({ 
  children, 
  className,
  desktopView,
  mobileView 
}: MobileTableViewProps) {
  const isMobile = useIsMobile();
  
  // If using the new API with desktopView and mobileView
  if (desktopView !== undefined || mobileView !== undefined) {
    return (
      <>
        {/* Desktop/Tablet view with horizontal scroll */}
        <div className={cn("hidden md:block", className)}>
          {desktopView}
        </div>
        {/* Mobile card view */}
        <div className={cn("block md:hidden space-y-3", className)}>
          {mobileView}
        </div>
      </>
    );
  }
  
  // Legacy API - show cards on mobile, table on desktop
  if (isMobile) {
    return (
      <div className={cn("space-y-3", className)}>
        {children}
      </div>
    );
  }
  
  return <>{children}</>;
}

interface MobileCardProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export function MobileCard({ children, onClick, className }: MobileCardProps) {
  const isMobile = useIsMobile();
  
  if (!isMobile) return null;
  
  return (
    <Card
      className={cn(
        "transition-all duration-200 hover:shadow-md active:scale-[0.98]",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">{children}</CardContent>
    </Card>
  );
}

interface MobileCardRowProps {
  label: string;
  value: React.ReactNode;
  className?: string;
}

export function MobileCardRow({ label, value, className }: MobileCardRowProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

interface MobileCardActionsProps {
  children: React.ReactNode;
  className?: string;
}

export function MobileCardActions({ children, className }: MobileCardActionsProps) {
  return (
    <div className={cn("flex gap-2 pt-2 border-t border-border/20", className)}>
      {children}
    </div>
  );
}

