import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** 激活码字母表：去掉了易混淆的 0/O/1/I/L，32 个字符，每位 5 bit。 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** 激活码长度：20 位（5 组 × 4），约 100 bit 随机空间，防猜足够。 */
export const CODE_LENGTH = 20;

/** 生成一个激活码（未格式化，20 位裸串）。 */
export function generateRawCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return code;
}

/** 归一化用户输入：大写、去掉横线/空格等分隔符。 */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** 展示格式：XXXX-XXXX-XXXX-XXXX-XXXX。 */
export function formatCode(raw: string): string {
  return raw.replace(/(.{4})(?=.)/g, "$1-");
}

/** 校验归一化后的激活码形状（长度 + 字符集）。 */
export function isValidCodeShape(normalized: string): boolean {
  return normalized.length === CODE_LENGTH && /^[A-Z2-9]+$/.test(normalized);
}

/** 生成一个随机令牌（hex）。 */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

/** 批次号：B + 时间戳36进制 + 随机4位。 */
export function generateBatchId(): string {
  return `B${Date.now().toString(36)}${randomBytes(2).toString("hex").toUpperCase()}`;
}

/** 恒定时间字符串比较（管理后台登录用）。 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** 简单滑动窗口限流器（进程内，小规模足够；更大规模换 Redis）。 */
export class RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  /** 返回 true 表示放行。 */
  allow(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= limit;
  }

  /** 清理过期桶（定期调用防止内存增长）。 */
  sweep(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
