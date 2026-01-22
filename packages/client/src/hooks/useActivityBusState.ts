import { useEffect, useState } from "react";
import { activityBus } from "../lib/activityBus";

/**
 * Hook to get the current activity bus connection state.
 * Updates when connection status changes (reconnect events) or periodically.
 */
export function useActivityBusState(): { connected: boolean } {
  const [connected, setConnected] = useState(activityBus.connected);

  useEffect(() => {
    // Update on reconnect event
    const unsubReconnect = activityBus.on("reconnect", () => {
      setConnected(true);
    });

    // Check periodically since we don't have a disconnect event
    const interval = setInterval(() => {
      setConnected(activityBus.connected);
    }, 1000);

    return () => {
      unsubReconnect();
      clearInterval(interval);
    };
  }, []);

  return { connected };
}
