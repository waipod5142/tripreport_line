import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getLineDrivers, updateLineDriver } from "../lib/api";

export const useLineDrivers = () =>
  useQuery({ queryKey: ["lineDrivers"], queryFn: getLineDrivers });

export const useUpdateLineDriver = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateLineDriver,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lineDrivers"] });
      queryClient.invalidateQueries({ queryKey: ["trips"] }); // renames retroactively change driverName
      queryClient.invalidateQueries({ queryKey: ["tripSummary"] });
    },
  });
};
