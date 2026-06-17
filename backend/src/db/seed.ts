import "../config/env"; // loads dotenv
import { db } from ".";
import { concreteProducts } from "./schema";

const GRADES = [
  { name: "คอนกรีตผสมเสร็จ 180 ksc",    grade: "180", slump: "7.5", useCase: "งานเทพื้น เทหล่อทั่วไป งานเบา",           pricePerCubicMeter: "1850.00", minOrderM3: "1.00" },
  { name: "คอนกรีตผสมเสร็จ 210 ksc",    grade: "210", slump: "10",  useCase: "พื้น คาน เสาบ้านพักอาศัย",               pricePerCubicMeter: "1980.00", minOrderM3: "1.00" },
  { name: "คอนกรีตผสมเสร็จ 240 ksc",    grade: "240", slump: "10",  useCase: "งานโครงสร้างทั่วไป อาคาร 2–3 ชั้น",     pricePerCubicMeter: "2120.00", minOrderM3: "1.00" },
  { name: "คอนกรีตผสมเสร็จ 280 ksc",    grade: "280", slump: "12.5",useCase: "โครงสร้างรับน้ำหนัก อาคารสูง",          pricePerCubicMeter: "2290.00", minOrderM3: "1.50" },
  { name: "คอนกรีตผสมเสร็จ 320 ksc",    grade: "320", slump: "12.5",useCase: "เสาเข็ม ฐานราก งานรับแรงสูง",            pricePerCubicMeter: "2480.00", minOrderM3: "1.50" },
  { name: "คอนกรีตกำลังอัดสูง 350 ksc", grade: "350", slump: "15",  useCase: "งานพิเศษ พื้น Post-tension",            pricePerCubicMeter: "2640.00", minOrderM3: "2.00" },
  { name: "คอนกรีตกำลังอัดสูง 400 ksc", grade: "400", slump: "15",  useCase: "โครงสร้างพิเศษ สะพาน เสาสูง",          pricePerCubicMeter: "2880.00", minOrderM3: "2.00" },
];

async function seed() {
  const existing = await db.select().from(concreteProducts);
  if (existing.length > 0) {
    console.log(`Already seeded (${existing.length} products). Nothing to do.`);
    process.exit(0);
  }
  const inserted = await db.insert(concreteProducts).values(GRADES).returning();
  console.log(`✅ Seeded ${inserted.length} concrete products.`);
  process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });
