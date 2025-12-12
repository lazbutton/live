"use client";

import { useEffect, useState, Suspense } from "react";
import { OrganizerLayout } from "../components/organizer-layout";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Bell, CheckCircle2, XCircle, Calendar, Check, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatDateWithoutTimezone } from "@/lib/date-utils";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";

interface Notification {
  id: string;
  user_id: string;
  event_id: string | null;
  type: "event_approved" | "event_rejected" | "event_created" | "event_updated" | "team_invitation" | "team_role_changed";
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  metadata: any;
}

function NotificationsContent() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingAsRead, setMarkingAsRead] = useState<string | null>(null);

  useEffect(() => {
    loadNotifications();
  }, []);

  async function loadNotifications() {
    try {
      setError(null);
      const response = await fetch("/api/organizer/notifications");
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `Erreur ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      const { notifications: notifs } = await response.json();
      setNotifications(notifs || []);
    } catch (error: any) {
      console.error("Erreur lors du chargement des notifications:", error);
      setError(error.message || "Erreur lors du chargement des notifications");
      // Ne pas bloquer l'interface, juste afficher un message
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(notificationId: string) {
    setMarkingAsRead(notificationId);
    try {
      const response = await fetch("/api/organizer/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId, read: true }),
      });

      if (!response.ok) throw new Error("Erreur lors de la mise à jour");

      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setMarkingAsRead(null);
    }
  }

  async function markAllAsRead() {
    try {
      const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
      
      await Promise.all(
        unreadIds.map((id) =>
          fetch("/api/organizer/notifications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notificationId: id, read: true }),
          })
        )
      );

      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (error) {
      console.error("Erreur:", error);
    }
  }

  function getNotificationIcon(type: string) {
    switch (type) {
      case "event_approved":
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case "event_rejected":
        return <XCircle className="h-5 w-5 text-red-600" />;
      case "event_created":
      case "event_updated":
        return <Calendar className="h-5 w-5 text-blue-600" />;
      default:
        return <Bell className="h-5 w-5 text-gray-600" />;
    }
  }

  function getNotificationVariant(type: string) {
    switch (type) {
      case "event_approved":
        return "default";
      case "event_rejected":
        return "destructive";
      default:
        return "secondary";
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (loading) {
    return (
      <OrganizerLayout title="Notifications">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </OrganizerLayout>
    );
  }

  return (
    <OrganizerLayout title="Notifications">
      <div className="space-y-6">
        {/* Message d'erreur */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>
              {error}
              <Button
                variant="link"
                size="sm"
                className="ml-2 h-auto p-0"
                onClick={loadNotifications}
              >
                Réessayer
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* En-tête avec bouton "Tout marquer comme lu" */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              {unreadCount > 0 ? `${unreadCount} notification${unreadCount > 1 ? "s" : ""} non lue${unreadCount > 1 ? "s" : ""}` : "Aucune notification non lue"}
            </h2>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllAsRead}>
              <Check className="h-4 w-4 mr-2" />
              Tout marquer comme lu
            </Button>
          )}
        </div>

        {/* Liste des notifications */}
        {notifications.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Bell className="h-12 w-12 text-muted-foreground opacity-20 mb-4" />
              <p className="text-muted-foreground">Aucune notification</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <Card
                key={notification.id}
                className={notification.read ? "opacity-60" : ""}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="mt-0.5">{getNotificationIcon(notification.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold">{notification.title}</h3>
                            <Badge variant={getNotificationVariant(notification.type)}>
                              {notification.type === "event_approved"
                                ? "Approuvé"
                                : notification.type === "event_rejected"
                                  ? "Rejeté"
                                  : notification.type}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {notification.message}
                          </p>
                        </div>
                        {!notification.read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => markAsRead(notification.id)}
                            disabled={markingAsRead === notification.id}
                          >
                            {markingAsRead === notification.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <span className="text-xs text-muted-foreground">
                          {formatDateWithoutTimezone(notification.created_at)}
                        </span>
                        {notification.event_id && (
                          <Link href={`/organizer/events/${notification.event_id}/edit`}>
                            <Button variant="link" size="sm" className="h-auto p-0">
                              Voir l'événement
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </OrganizerLayout>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense
      fallback={
        <OrganizerLayout title="Notifications">
          <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </OrganizerLayout>
      }
    >
      <NotificationsContent />
    </Suspense>
  );
}

