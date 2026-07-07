import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAllUsers, updateUserRole } from "../lib/api";

export const useUsers = () => useQuery({ queryKey: ["users"], queryFn: getAllUsers });

export const useUpdateUserRole = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateUserRole,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
};
