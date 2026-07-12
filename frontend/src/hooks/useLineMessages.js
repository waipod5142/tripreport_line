import { useQuery } from "@tanstack/react-query";
import { getLineMessages } from "../lib/api";

export const useLineMessages = (params) =>
  useQuery({
    queryKey: ["lineMessages", params],
    queryFn: () => getLineMessages(params),
    refetchInterval: 30_000, // new LINE messages appear without a manual refresh
  });
