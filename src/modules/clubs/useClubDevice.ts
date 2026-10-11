import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { loadDevice, saveDevice } from "./device";
import { myMemberships } from "./clubs.functions";

export function useClubDevice() {
  const [dev, setDev] = useState<ReturnType<typeof loadDevice> | null>(null);
  useEffect(() => setDev(loadDevice()), []);
  const fetchMine = useServerFn(myMemberships);
  const qc = useQueryClient();

  const memberships = useQuery({
    queryKey: ["club-memberships", dev?.deviceToken],
    queryFn: () => fetchMine({ data: { deviceToken: dev!.deviceToken } }),
    enabled: !!dev,
  });

  const update = useCallback((patch: Partial<ReturnType<typeof loadDevice>>) => {
    setDev((d) => {
      if (!d) return d;
      const next = { ...d, ...patch };
      saveDevice(next);
      return next;
    });
  }, []);

  const toggleStar = useCallback(
    (clubId: string) => {
      if (!dev) return;
      update({ starred: dev.starred.includes(clubId) ? dev.starred.filter((s) => s !== clubId) : [...dev.starred, clubId] });
    },
    [dev, update],
  );

  return {
    device: dev,
    memberships: memberships.data ?? [],
    refreshMemberships: () => qc.invalidateQueries({ queryKey: ["club-memberships"] }),
    setDisplayName: (displayName: string) => update({ displayName }),
    toggleStar,
  };
}
