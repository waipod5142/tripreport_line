import api from "./axios";

// USERS
export const syncUser = async (userData) => {
  const { data } = await api.post("/users/sync", userData);
  return data;
};

export const getMe = async () => {
  const { data } = await api.get("/users/me");
  return data;
};

export const getAllUsers = async () => {
  const { data } = await api.get("/users");
  return data;
};

export const updateUserRole = async ({ id, role }) => {
  const { data } = await api.patch(`/users/${id}/role`, { role });
  return data;
};

// TRIPS
export const getTrips = async (params) => {
  const { data } = await api.get("/trips", { params });
  return data;
};

export const getTripSummary = async (date) => {
  const { data } = await api.get("/trips/summary", { params: { date } });
  return data;
};

export const deleteTrip = async (id) => {
  const { data } = await api.delete(`/trips/${id}`);
  return data;
};

// LINE MESSAGES (full conversation archive)
export const getLineMessages = async (params) => {
  const { data } = await api.get("/line-messages", { params });
  return data;
};

// LINE DRIVERS
export const getLineDrivers = async () => {
  const { data } = await api.get("/line-drivers");
  return data;
};

export const updateLineDriver = async ({ lineUserId, manualName, defaultTruck }) => {
  const { data } = await api.patch(`/line-drivers/${lineUserId}`, { manualName, defaultTruck });
  return data;
};
