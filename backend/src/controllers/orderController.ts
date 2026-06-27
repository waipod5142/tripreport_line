import { Request, Response } from "express";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db } from "../db";
import { orders, orderItems, concreteProducts, deliverySchedules, users } from "../db/schema";
import { uploadImages, deleteImages } from "../services/cloudinaryUpload";
import { notifyOrderCancelled } from "../services/lineNotify";

function todayRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const dateStr = `${y}${m}${d}`;
  const start = new Date(`${y}-${m}-${d}T00:00:00.000Z`);
  const end   = new Date(`${y}-${m}-${d}T23:59:59.999Z`);
  return { dateStr, start, end };
}

async function nextOrderNumber() {
  const { dateStr, start, end } = todayRange();
  const [row] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(gte(orders.createdAt, start), lte(orders.createdAt, end)));
  const seq = ((row?.cnt ?? 0) + 1).toString().padStart(4, "0");
  return `ORD-${dateStr}-${seq}`;
}

export const createOrder = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const {
      productId, quantityM3,
      deliveryArea, deliveryLabel,
      deliveryLat, deliveryLng, deliveryGeoLink, deliveryGeoMethod,
      preferredDate, preferredTimeSlot, specialInstructions,
      contactName, contactPhone,
      sitePhotoUrls = [],
    } = req.body;

    if (!productId || !quantityM3 || !contactName || !contactPhone) {
      return res.status(400).json({ error: "Missing required fields: productId, quantityM3, contactName, contactPhone" });
    }

    const [product] = await db
      .select()
      .from(concreteProducts)
      .where(eq(concreteProducts.id, productId));
    if (!product) return res.status(404).json({ error: "Concrete product not found" });

    const qty = Number(quantityM3);
    const unitPrice = Number(product.pricePerCubicMeter);
    const lineTotal = +(qty * unitPrice).toFixed(2);
    const orderNumber = await nextOrderNumber();

    const uploadedPhotoUrls = sitePhotoUrls.length
      ? await uploadImages(sitePhotoUrls)
      : [];

    const [newOrder] = await db
      .insert(orders)
      .values({
        orderNumber,
        customerId: userId,
        status: "pending",
        deliveryArea,
        deliveryLabel,
        deliveryLat: deliveryLat ? String(deliveryLat) : null,
        deliveryLng: deliveryLng ? String(deliveryLng) : null,
        deliveryGeoLink,
        deliveryGeoMethod,
        contactName,
        contactPhone,
        sitePhotoUrls: uploadedPhotoUrls,
        preferredDate,
        preferredTimeSlot,
        specialInstructions,
        totalAmount: String(lineTotal),
      })
      .returning();

    await db.insert(orderItems).values({
      orderId: newOrder.id,
      productId,
      quantityM3: String(qty),
      unitPrice: String(unitPrice),
      lineTotal: String(lineTotal),
    });

    res.status(201).json(newOrder);
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
};

export const getMyOrders = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const rows = await db.query.orders.findMany({
      where: eq(orders.customerId, userId),
      orderBy: [desc(orders.createdAt)],
      with: {
        items: { with: { product: true } },
        schedules: { with: { truck: true } },
      },
    });

    res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
};

export const getAllOrders = async (_req: Request, res: Response) => {
  try {
    const rows = await db.query.orders.findMany({
      orderBy: [desc(orders.createdAt)],
      with: {
        customer: true,
        items: { with: { product: true } },
        schedules: { with: { truck: true } },
      },
    });
    res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching all orders:", error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
};

export const deleteOrder = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const [order] = await db.select().from(orders).where(eq(orders.id, id));

    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.customerId !== userId) return res.status(403).json({ error: "Forbidden" });

    // Customers may cancel an order up until a truck is actually on the road.
    // Once any assigned truck is in_transit (or has completed), deletion is blocked.
    const deletableStatuses = ["pending", "confirmed", "scheduled"];
    if (!deletableStatuses.includes(order.status)) {
      return res.status(400).json({ error: "This order can no longer be deleted" });
    }

    // delivery_schedules has no ON DELETE CASCADE on order_id, so remove any
    // assigned truck rows first — but refuse if a delivery is already under way.
    const scheduleRows = await db
      .select()
      .from(deliverySchedules)
      .where(eq(deliverySchedules.orderId, id));
    const activeRow = scheduleRows.find(
      (s) => s.status === "in_transit" || s.status === "completed",
    );
    if (activeRow) {
      return res.status(400).json({ error: "Cannot delete — a truck is already delivering this order" });
    }
    if (scheduleRows.length) {
      await db.delete(deliverySchedules).where(eq(deliverySchedules.orderId, id));
    }

    // Capture details for the cancellation notice before the rows are gone.
    const [item] = await db
      .select({ name: concreteProducts.name, qty: orderItems.quantityM3 })
      .from(orderItems)
      .leftJoin(concreteProducts, eq(orderItems.productId, concreteProducts.id))
      .where(eq(orderItems.orderId, id));
    const [customer] = await db
      .select({ lineUserId: users.lineUserId })
      .from(users)
      .where(eq(users.id, userId));

    const photoUrls: string[] = Array.isArray(order.sitePhotoUrls) ? order.sitePhotoUrls as string[] : [];
    if (photoUrls.length) {
      await deleteImages(photoUrls);
    }

    // order_items cascade-deletes automatically
    await db.delete(orders).where(eq(orders.id, id));

    // Fire LINE cancellation notice — best-effort, never blocks the response.
    notifyOrderCancelled({
      to: customer?.lineUserId,
      orderNumber: order.orderNumber,
      productName: item?.name ?? undefined,
      quantityM3: item?.qty ?? undefined,
      siteLabel: order.deliveryLabel ?? order.deliveryArea ?? undefined,
    }).catch((err) => console.error("[LINE] cancellation notice failed:", err));

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error deleting order:", error);
    res.status(500).json({ error: "Failed to delete order" });
  }
};

export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, preferredDate, preferredTimeSlot } = req.body;
    const validStatuses = ["pending", "confirmed", "scheduled", "in_transit", "delivered", "cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const updateFields: Record<string, unknown> = { status };
    if (preferredDate)     updateFields.preferredDate     = preferredDate;
    if (preferredTimeSlot) updateFields.preferredTimeSlot = preferredTimeSlot;
    const [updated] = await db
      .update(orders)
      .set(updateFields)
      .where(eq(orders.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Order not found" });
    res.status(200).json(updated);
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ error: "Failed to update order status" });
  }
};
