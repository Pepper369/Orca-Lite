import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { env, isProd } from "../env";

const DEV_ONLY_VAULT_SECRET = "orca-financial-dev-vault-key-do-not-use-in-prod-32bytes";
const VAULT_PREFIX = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function resolveEncryptionKey(keyOverride?: string): Buffer {
  const raw = keyOverride?.trim() || env.brokerEncryptionKey || env.jwtSecret;
  if (!raw || raw.length < 16) {
    if (isProd && !keyOverride) {
      throw new Error(
        "BROKER_ENCRYPTION_KEY (hoặc JWT_SECRET tối thiểu 16 ký tự) bắt buộc phải được cấu hình trong production để bảo vệ API Key sàn.",
      );
    }
    return createHash("sha256").update(`orca-broker-vault-dev:${raw || DEV_ONLY_VAULT_SECRET}`).digest();
  }
  return createHash("sha256").update(`orca-broker-vault-v1:${raw}`).digest();
}

/** Mã hóa API Key / Secret / Passphrase bằng AES-256-GCM với IV ngẫu nhiên 96-bit. */
export function encryptSecret(plaintext: string, keyOverride?: string): string {
  const clean = plaintext.trim();
  if (!clean) {
    throw new Error("Không thể mã hóa chuỗi rỗng");
  }
  const key = resolveEncryptionKey(keyOverride);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(clean, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VAULT_PREFIX}:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

/** Giải mã payload AES-256-GCM. Throw nếu dữ liệu bị sửa đổi hoặc sai khóa. */
export function decryptSecret(payload: string, keyOverride?: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VAULT_PREFIX) {
    throw new Error("Định dạng mật khẩu mã hóa không hợp lệ");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const ciphertext = Buffer.from(dataB64, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("IV hoặc Auth Tag của Vault không hợp lệ");
  }
  const key = resolveEncryptionKey(keyOverride);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

/** Che bí mật trước khi trả ra UI (giữ tối đa 4 ký tự đầu/cuối, không bao giờ lộ raw key). */
export function maskSecret(secret?: string | null): string {
  const s = (secret ?? "").trim();
  if (!s) return "";
  if (s.length <= 8) {
    return s.length >= 4 ? `****${s.slice(-2)}` : "****";
  }
  return `${s.slice(0, 4)}****${s.slice(-4)}`;
}

/** Sinh Bearer token ngẫu nhiên cho MT5 EA Bridge (trả plaintext 1 lần duy nhất lúc tạo). */
export function generateEaToken(): string {
  return `orca_ea_${randomBytes(24).toString("base64url")}`;
}

/** Băm SHA-256 để lưu trữ trong DB thay cho plaintext EA token. */
export function hashEaToken(token: string): string {
  return createHash("sha256").update(`orca-ea-token-v1:${token.trim()}`).digest("hex");
}

/** So sánh hằng thời gian chống Timing Attack (dài tùy ý). */
export function timingSafeTokenEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
