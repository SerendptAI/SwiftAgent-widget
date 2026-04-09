import { useEffect, useState } from "react";

/**
 * Simple hook that tracks elapsed seconds while a call is ongoing.
 * Resets to 0 when the call ends.
 */
export function useCallTimer(isOngoing: boolean) {
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    if (!isOngoing) {
      setElapsedTime(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isOngoing]);

  return elapsedTime;
}
