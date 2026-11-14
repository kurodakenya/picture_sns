"use client";

import { useEffect, useState } from "react";

export default function AmplifyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    import("@/lib/amplify-config").then(() => setReady(true));
  }, []);

  if (!ready) return null;

  return <>{children}</>;
}
