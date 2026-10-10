"use client";

/**
 * Socket.IO provider — one shared connection per authenticated session.
 *
 * – Connects only when a JWT token is available.
 * – Authenticates via socket.handshake.auth.token (as required by server.js).
 * – Joins/leaves project rooms when `currentProjectId` changes.
 * – Exposes the socket instance so consumers can subscribe to events.
 * – Disconnects on logout (triggered by token becoming null).
 */

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { io, Socket } from "socket.io-client";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://localhost:5000";

interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  currentProjectId: number | null;
  joinProject: (projectId: number) => void;
  leaveProject: (projectId: number) => void;
}

const SocketContext = createContext<SocketState>({
  socket: null,
  isConnected: false,
  currentProjectId: null,
  joinProject: () => undefined,
  leaveProject: () => undefined,
});

export function SocketProvider({
  children,
  token,
}: {
  children: React.ReactNode;
  token: string | null;
}) {
  const socketRef = useRef<Socket | null>(null);
  const projectIdRef = useRef<number | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);

  useEffect(() => {
    if (!token) {
      // No token — disconnect any existing socket.
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    // Create a new connection.
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setSocket(socket);
      setIsConnected(true);
      if (projectIdRef.current !== null) {
        socket.emit("join-project", projectIdRef.current);
      }
    });
    socket.on("disconnect", () => setIsConnected(false));
    socket.on("connect_error", (err) => {
      // Do not log tokens; only log the error description.
      console.warn("Socket connection error:", err.message);
      setIsConnected(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocket(null);
      projectIdRef.current = null;
      setIsConnected(false);
      setCurrentProjectId(null);
    };
  }, [token]);

  const joinProject = useCallback((projectId: number) => {
    const activeSocket = socketRef.current;
    if (!activeSocket) return;

    // Leave previous room if different.
    if (projectIdRef.current !== null && projectIdRef.current !== projectId) {
      activeSocket.emit("leave-project", projectIdRef.current);
    }

    activeSocket.emit("join-project", projectId);
    projectIdRef.current = projectId;
    setCurrentProjectId(projectId);
  }, []);

  const leaveProject = useCallback((projectId: number) => {
    const activeSocket = socketRef.current;
    if (!activeSocket) return;
    activeSocket.emit("leave-project", projectId);
    if (projectIdRef.current === projectId) {
      projectIdRef.current = null;
      setCurrentProjectId(null);
    }
  }, []);

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        currentProjectId,
        joinProject,
        leaveProject,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketState {
  return useContext(SocketContext);
}
