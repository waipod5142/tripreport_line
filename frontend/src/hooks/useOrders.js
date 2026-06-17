import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createOrder, getMyOrders, deleteOrder } from "../lib/api";

export const useMyOrders = () =>
  useQuery({ queryKey: ["myOrders"], queryFn: getMyOrders });

export const useCreateOrder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createOrder,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["myOrders"] }),
  });
};

export const useDeleteOrder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteOrder,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["myOrders"] }),
  });
};
