import AES from "crypto-js/aes";
import Utf8 from "crypto-js/enc-utf8";

function resolveKey(): string {
  const secret = process.env.ORACLY_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("ORACLY_ENCRYPTION_KEY is not set.");
  }
  return secret;
}

export function encryptSecret(plainText: string): string {
  return AES.encrypt(plainText, resolveKey()).toString();
}

export function decryptSecret(payload: string): string {
  const bytes = AES.decrypt(payload, resolveKey());
  return bytes.toString(Utf8);
}
