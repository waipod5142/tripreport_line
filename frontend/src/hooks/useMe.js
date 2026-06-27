import { useQuery } from "@tanstack/react-query";
import { getMe } from "../lib/api";

/** Current signed-in user's DB profile (includes `role`). */
export const useMe = () =>
  useQuery({ queryKey: ["me"], queryFn: getMe });
