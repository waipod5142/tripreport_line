import api from "./axios";

// USERS API
export const syncUser = async (userData) => {
  const { data } = await api.post("/users/sync", userData);
  return data;
};

// Products API
export const getAllProducts = async () => {
  const { data } = await api.get("/products");
  return data;
};

export const getProductById = async (id) => {
  const { data } = await api.get(`/products/${id}`);
  return data;
};

export const getMyProducts = async () => {
  const { data } = await api.get("/products/my");
  return data;
};

export const createProduct = async (productData) => {
  const { data } = await api.post("/products", productData);
  return data;
};

export const updateProduct = async ({ id, ...productData }) => {
  const { data } = await api.put(`/products/${id}`, productData);
  return data;
};

export const deleteProduct = async (id) => {
  const { data } = await api.delete(`/products/${id}`);
  return data;
};

// Concrete Products API
export const getConcreteProducts = async () => {
  const { data } = await api.get("/concrete-products");
  return data;
};

// Orders API
export const createOrder = async (orderData) => {
  const { data } = await api.post("/orders", orderData);
  return data;
};

export const getMyOrders = async () => {
  const { data } = await api.get("/orders/my");
  return data;
};

export const deleteOrder = async (id) => {
  const { data } = await api.delete(`/orders/${id}`);
  return data;
};

// Dispatcher API
export const getAllOrders = async () => {
  const { data } = await api.get("/orders");
  return data;
};

export const updateOrderStatus = async ({ id, status }) => {
  const { data } = await api.patch(`/orders/${id}/status`, { status });
  return data;
};

export const getTrucks = async () => {
  const { data } = await api.get("/trucks");
  return data;
};

export const seedTrucks = async () => {
  const { data } = await api.post("/trucks/seed");
  return data;
};

export const getDrivers = async () => {
  const { data } = await api.get("/users/drivers");
  return data;
};

export const getSchedules = async () => {
  const { data } = await api.get("/schedule");
  return data;
};

export const createSchedule = async (scheduleData) => {
  const { data } = await api.post("/schedule", scheduleData);
  return data;
};

export const replaceSchedule = async (scheduleData) => {
  const { data } = await api.put("/schedule", scheduleData);
  return data;
};

export const updateScheduleStatus = async ({ id, status }) => {
  const { data } = await api.patch(`/schedule/${id}/status`, { status });
  return data;
};

export const updateSelfRole = async (role) => {
  const { data } = await api.patch("/users/me", { role });
  return data;
};

// Comments API
export const createComment = async ({ productId, content }) => {
  const { data } = await api.post(`/comments/${productId}`, { content });
  return data;
};

export const deleteComment = async ({ commentId }) => {
  const { data } = await api.delete(`/comments/${commentId}`);
  return data;
};
