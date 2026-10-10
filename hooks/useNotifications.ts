"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSocket } from "@/lib/socket";
import type { Notification } from "@/types";
import { toast } from "sonner";

export function useNotificationCount() {
  const [unreadCount, setUnreadCount] = useState(0);
  const { socket } = useSocket();

  const fetchCount = useCallback(async () => {
    try {
      const data = await api.notifications.list(1, 0);
      setUnreadCount(data.unreadCount);
    } catch {
      // silently ignore – will retry on next render
    }
  }, []);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  // Real-time: increment count when a new notification arrives
  useEffect(() => {
    if (!socket) return;

    function handleNew() {
      setUnreadCount((c) => c + 1);
      toast.info("You have a new notification");
    }

    socket.on("notification.created", handleNew);
    return () => {
      socket.off("notification.created", handleNew);
    };
  }, [socket]);

  return { unreadCount, setUnreadCount, refetch: fetchCount };
}

export function useNotifications(limit = 20) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { socket } = useSocket();

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.notifications.list(limit, 0);
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(data.unreadCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  // Real-time: reload when a new notification arrives
  useEffect(() => {
    if (!socket) return;

    function handleNew() {
      fetch();
    }

    socket.on("notification.created", handleNew);
    return () => {
      socket.off("notification.created", handleNew);
    };
  }, [socket, fetch]);

  const markRead = useCallback(async (notificationId: number) => {
    try {
      await api.notifications.markRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark as read");
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await api.notifications.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark all as read");
    }
  }, []);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    markRead,
    markAllRead,
    refetch: fetch,
  };
}
