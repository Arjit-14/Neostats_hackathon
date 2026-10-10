"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Task } from "@/types";
import { useSocket } from "@/lib/socket";
import { toast } from "sonner";

export function useTasks(projectId: number) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { socket, joinProject, leaveProject } = useSocket();

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.tasks.list(projectId);
      setTasks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    const fetchTimer = window.setTimeout(() => {
      void fetch();
    }, 0);
    joinProject(projectId);

    return () => {
      window.clearTimeout(fetchTimer);
      leaveProject(projectId);
    };
  }, [fetch, projectId, socket, joinProject, leaveProject]);

  // Real-time updates from Socket.IO
  useEffect(() => {
    if (!socket) return;

    function handleTaskUpdated(payload: {
      projectId: number;
      task: Task;
      changes: Record<string, unknown>;
    }) {
      if (payload.projectId !== projectId) return;
      setTasks((prev) =>
        prev.map((t) => (t.id === payload.task.id ? payload.task : t))
      );
      toast.info("A task was updated by someone else");
    }

    socket.on("task.updated", handleTaskUpdated);
    return () => {
      socket.off("task.updated", handleTaskUpdated);
    };
  }, [socket, projectId]);

  useEffect(() => {
    if (!socket) return;
    function handleTaskDeleted(payload: { projectId: number; taskId: number }) {
      if (payload.projectId !== projectId) return;
      setTasks((prev) => prev.filter((task) => task.id !== payload.taskId));
      toast.info("A task was deleted");
    }
    socket.on("task.deleted", handleTaskDeleted);
    return () => {
      socket.off("task.deleted", handleTaskDeleted);
    };
  }, [socket, projectId]);

  return { tasks, setTasks, isLoading, error, refetch: fetch };
}
