import { NextResponse } from "next/server";
import { fetchAccountSnapshot, fetchTradeHistory, FetchTradesOptions } from "@/lib/binance";

type RequestPayload =
  | {
      type: "account";
    }
  | ({
      type: "trades";
    } & FetchTradesOptions);

export async function POST(request: Request) {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;

  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: "Binance credentials are not configured." }, { status: 500 });
  }

  const payload = (await request.json()) as RequestPayload;

  if (payload.type === "account") {
    const account = await fetchAccountSnapshot(apiKey, apiSecret);
    return NextResponse.json(account);
  }

  if (payload.type === "trades") {
    if (!payload.symbol) {
      return NextResponse.json({ error: "Symbol is required." }, { status: 400 });
    }
    const trades = await fetchTradeHistory(apiKey, apiSecret, payload);
    return NextResponse.json(trades);
  }

  return NextResponse.json({ error: "Unsupported request type." }, { status: 400 });
}
