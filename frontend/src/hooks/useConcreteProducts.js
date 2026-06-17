import { useQuery } from "@tanstack/react-query";
import { getConcreteProducts } from "../lib/api";

export const useConcreteProducts = () =>
  useQuery({ queryKey: ["concreteProducts"], queryFn: getConcreteProducts });
