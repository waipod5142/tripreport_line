import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAllOrders, updateOrderStatus,
  getTrucks, seedTrucks,
  getDrivers, getSchedules, createSchedule, replaceSchedule, updateScheduleStatus,
  updateSelfRole,
} from "../lib/api";

export const useAllOrders = () =>
  useQuery({ queryKey: ["allOrders"], queryFn: getAllOrders });

export const useConfirmOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => updateOrderStatus({ id, status: "confirmed" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["allOrders"] }),
  });
};

export const useTrucks = () =>
  useQuery({ queryKey: ["trucks"], queryFn: getTrucks });

export const useSeedTrucks = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: seedTrucks,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trucks"] }),
  });
};

export const useDrivers = () =>
  useQuery({ queryKey: ["drivers"], queryFn: getDrivers });

export const useSchedules = () =>
  useQuery({ queryKey: ["schedules"], queryFn: getSchedules });

export const useCreateSchedule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createSchedule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["allOrders"] });
      qc.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
};

export const useReplaceSchedule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: replaceSchedule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["allOrders"] });
      qc.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
};

export const useUpdateScheduleStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateScheduleStatus,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["allOrders"] });
    },
  });
};

export const useSwitchRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateSelfRole,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["allOrders"] });
    },
  });
};
