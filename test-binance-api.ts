// Script de test pour vérifier les appels API Binance
// Usage: npx tsx test-binance-api.ts

import HmacSHA256 from "crypto-js/hmac-sha256";

const API_KEY = process.env.BINANCE_API_KEY;
const API_SECRET = process.env.API_SECRET;

if (!API_KEY || !API_SECRET) {
  console.error("BINANCE_API_KEY et API_SECRET doivent être définis");
  process.exit(1);
}

async function signedGet(
  path: string,
  params: Record<string, string>
) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, value);
  }

  searchParams.set("timestamp", Date.now().toString());
  searchParams.set("recvWindow", "60000");

  const signature = HmacSHA256(searchParams.toString(), API_SECRET!).toString();
  searchParams.set("signature", signature);

  const url = `https://api.binance.com${path}?${searchParams.toString()}`;
  console.log(`\nRequête: ${path}`);
  console.log(`Paramètres:`, Object.fromEntries(searchParams.entries()));

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-MBX-APIKEY": API_KEY!,
    },
  });

  const raw = await response.text();

  if (!response.ok) {
    console.error(`❌ Erreur ${response.status}:`, raw.slice(0, 500));
    return null;
  }

  console.log(`✅ Succès (${raw.length} caractères)`);
  const data = JSON.parse(raw);
  console.log("Type de réponse:", Array.isArray(data) ? "array" : typeof data);
  if (typeof data === "object" && !Array.isArray(data)) {
    console.log("Clés:", Object.keys(data));
  }
  return data;
}

async function testConvertTrades() {
  console.log("\n=== Test Convert Trades ===");

  // Test avec une fenêtre de 30 jours
  const endTime = Date.now();
  const startTime = endTime - (30 * 24 * 60 * 60 * 1000);

  const result = await signedGet("/sapi/v1/convert/tradeFlow", {
    startTime: startTime.toString(),
    endTime: endTime.toString(),
    limit: "100",
  });

  if (result) {
    if (Array.isArray(result)) {
      console.log(`📊 ${result.length} conversions (array direct)`);
      if (result.length > 0) {
        console.log("Premier élément:", JSON.stringify(result[0], null, 2));
      }
    } else if (result.list) {
      console.log(`📊 ${result.list.length} conversions (dans result.list)`);
      console.log("Total:", result.total);
      console.log("MoreData:", result.moreData);
      if (result.list.length > 0) {
        console.log("Premier élément:", JSON.stringify(result.list[0], null, 2));
      }
    } else {
      console.log("Structure inattendue:", result);
    }
  }
}

async function testWithdrawals() {
  console.log("\n=== Test Withdrawals ===");

  const endTime = Date.now();
  const startTime = endTime - (90 * 24 * 60 * 60 * 1000);

  const result = await signedGet("/sapi/v1/capital/withdraw/history", {
    startTime: startTime.toString(),
    endTime: endTime.toString(),
    limit: "100",
  });

  if (result && Array.isArray(result)) {
    console.log(`📊 ${result.length} retraits`);
    if (result.length > 0) {
      console.log("Premier élément:", JSON.stringify(result[0], null, 2));
    }
  } else {
    console.log("Structure inattendue:", result);
  }
}

async function testDeposits() {
  console.log("\n=== Test Deposits ===");

  const endTime = Date.now();
  const startTime = endTime - (90 * 24 * 60 * 60 * 1000);

  const result = await signedGet("/sapi/v1/capital/deposit/hisrec", {
    startTime: startTime.toString(),
    endTime: endTime.toString(),
    limit: "100",
  });

  if (result && Array.isArray(result)) {
    console.log(`📊 ${result.length} dépôts`);
    if (result.length > 0) {
      console.log("Premier élément:", JSON.stringify(result[0], null, 2));
    }
  } else {
    console.log("Structure inattendue:", result);
  }
}

async function main() {
  await testConvertTrades();
  await testWithdrawals();
  await testDeposits();
}

main().catch(console.error);
