"use client";

import { useState, useCallback } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface AlertDialogOptions {
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
}

export function useAlertDialog() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<AlertDialogOptions | null>(null);
  const [loading, setLoading] = useState(false);

  const showAlert = useCallback((options: AlertDialogOptions) => {
    setOptions(options);
    setOpen(true);
  }, []);

  const showConfirm = useCallback((options: AlertDialogOptions) => {
    setOptions({
      ...options,
      variant: options.variant || "default",
    });
    setOpen(true);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (options?.onConfirm) {
      setLoading(true);
      try {
        await options.onConfirm();
        setOpen(false);
      } catch (error) {
        console.error("Erreur lors de la confirmation:", error);
      } finally {
        setLoading(false);
      }
    } else {
      setOpen(false);
    }
  }, [options]);

  const handleCancel = useCallback(() => {
    if (options?.onCancel) {
      options.onCancel();
    }
    setOpen(false);
  }, [options]);

  const AlertDialogComponent = () => {
    if (!options) return null;

    return (
      <AlertDialog open={open} onOpenChange={(isOpen) => {
        if (!isOpen && !loading) {
          handleCancel();
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options.title}</AlertDialogTitle>
            <AlertDialogDescription>{options.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {options.onConfirm ? (
              <>
                <AlertDialogCancel onClick={handleCancel} disabled={loading}>
                  {options.cancelText || "Annuler"}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleConfirm}
                  disabled={loading}
                  className={options.variant === "destructive" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
                >
                  {loading ? "..." : options.confirmText || "Confirmer"}
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction
                onClick={handleCancel}
                disabled={loading}
              >
                {options.confirmText || "OK"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  };

  return {
    showAlert,
    showConfirm,
    AlertDialogComponent,
  };
}

