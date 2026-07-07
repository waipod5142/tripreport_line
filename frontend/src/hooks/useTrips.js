import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTrips, getTripSummary, deleteTrip } from "../lib/api";

export const useTrips = (params) =>
  useQuery({
    queryKey: ["trips", params],
    queryFn: () => getTrips(params),
    refetchInterval: 30_000, // new LINE reports appear without a manual refresh
  });

export const useTripSummary = (date) =>
  useQuery({ queryKey: ["tripSummary", date], queryFn: () => getTripSummary(date) });

export const useDeleteTrip = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTrip,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      queryClient.invalidateQueries({ queryKey: ["tripSummary"] });
    },
  });
};
