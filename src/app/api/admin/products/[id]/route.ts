import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { hasWcCredentials, wcAdminFetch } from "@/lib/wcAdmin";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  if (!hasWcCredentials()) {
    return NextResponse.json(
      { error: "WC_CREDS_MISSING" },
      { status: 503 },
    );
  }
  const { id } = await params;
  const body = (await req.json()) as {
    regular_price?: string;
    sale_price?: string;
  };
  try {
    const result = await wcAdminFetch(`/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    );
  }
}
