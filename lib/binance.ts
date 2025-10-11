import crypto from "crypto";

const DEFAULT_RECV_WINDOW = 5000;
const DEFAULT_BASE_URL = process.env.NEXT_PUBLIC_BINANCE_API_URL ?? "https://api.binance.com";

type SignedRequestOptions = {
  params?: Record<string, string | number | boolean | undefined>;
  recvWindow?: number;
};

type SignedGetOptions = SignedRequestOptions & {
  endpoint: string;
  apiKey: string;
  apiSecret: string;
};

export type BinanceAccountBalance = {
  asset: string;
  free: string;
  locked: string;
};

export type BinanceAccountResponse = {
  makerCommission: number;
  takerCommission: number;
  buyerCommission: number;
  sellerCommission: number;
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  updateTime: number;
  accountType: string;
  balances: BinanceAccountBalance[];
};

export type BinanceTrade = {
  symbol: string;
  id: number;
  orderId: number;
  price: string;
  qty: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  isBuyer: boolean;
  isMaker: boolean;
  isBestMatch: boolean;
};

function signQuery(payload: string, apiSecret: string) {
  return crypto.createHmac("sha256", apiSecret).update(payload).digest("hex");
}

function buildQuery(params: Record<string, string | number | boolean | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    query.set(key, String(value));
  });
  return query;
}

async function signedGet<T>({ endpoint, apiKey, apiSecret, params, recvWindow }: SignedGetOptions): Promise<T> {
  if (!apiKey || !apiSecret) {
    throw new Error("Binance API credentials are required.");
  }

  const payload = buildQuery({
    timestamp: Date.now(),
    recvWindow: recvWindow ?? DEFAULT_RECV_WINDOW,
    ...params,
  });

  const signature = signQuery(payload.toString(), apiSecret);
  payload.set("signature", signature);

  const url = `${DEFAULT_BASE_URL}${endpoint}?${payload.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-MBX-APIKEY": apiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Binance API error (${response.status}): ${errorText}`);
  }

  return (await response.json()) as T;
}

export async function fetchAccountSnapshot(apiKey: string, apiSecret: string) {
  return signedGet<BinanceAccountResponse>({
    endpoint: "/api/v3/account",
    apiKey,
    apiSecret,
  });
}

export type FetchTradesOptions = {
  symbol: string;
  startTime?: number;
  endTime?: number;
  fromId?: number;
  limit?: number;
};

export async function fetchTradeHistory(apiKey: string, apiSecret: string, options: FetchTradesOptions) {
  return signedGet<BinanceTrade[]>({
    endpoint: "/api/v3/myTrades",
    apiKey,
    apiSecret,
    params: options,
  });
}
