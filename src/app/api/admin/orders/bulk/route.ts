import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { bulkUpdateOrderStatus, getOrder, ORDER_STATUSES } from "@/lib/orders";
import { notifyStatusChange } from "@/lib/notify";

/** Bulk status change for the admin orders list's row-select bar — mirrors the
 *  shape of /api/admin/products/bulk ({ ids, action } -> { count, skipped }),
 *  except "action" here is just the target status since orders don't have the
 *  variety of bulk actions products do. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { ids, status } = (await req.json()) as { ids?: (string | number)[]; status?: string };
  if (!Array.isArray(ids) || ids.length === 0 || !status) {
    return NextResponse.json({ error: "Некоректні дані" }, { status: 400 });
  }
  if (!ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])) {
    return NextResponse.json({ error: "Невірний статус" }, { status: 400 });
  }

  const nums = ids.map(Number).filter(Number.isFinite);
  const { count, errors } = await bulkUpdateOrderStatus(nums, status);

  // Same customer/admin notifications a single-order status change already
  // triggers via PATCH /api/admin/orders — best-effort, never blocks the response.
  for (const id of nums) {
    const order = await getOrder(id).catch(() => null);
    if (order) await notifyStatusChange(order, status).catch(() => {});
  }

  return NextResponse.json({ ok: true, count, errors });
}
