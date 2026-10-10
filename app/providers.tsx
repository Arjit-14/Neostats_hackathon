"use client";

import { AuthProvider, useAuth } from "@/lib/auth";
import { SocketProvider } from "@/lib/socket";

function SocketWrapper({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  return <SocketProvider token={token}>{children}</SocketProvider>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SocketWrapper>{children}</SocketWrapper>
    </AuthProvider>
  );
}
