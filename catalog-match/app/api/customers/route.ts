import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { Customer } from "@/lib/types";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("order_history")
      .select("customer_id, customer_name")
      .order("customer_name");

    if (error) {
      return NextResponse.json({ error: "Failed to fetch customers" }, { status: 500 });
    }

    // Deduplicate by customer_id
    const seen = new Set<string>();
    const customers: Customer[] = [];
    for (const row of data ?? []) {
      if (!seen.has(row.customer_id)) {
        seen.add(row.customer_id);
        customers.push({ customer_id: row.customer_id, customer_name: row.customer_name });
      }
    }

    return NextResponse.json({ customers });
  } catch (err) {
    console.error("Customers error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
