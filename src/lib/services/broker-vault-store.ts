import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, databaseConfigured } from "@/db";
import { auditLogs, botExecutionOrders, brokerConnections } from "@/db/schema";
import type {
  BrokerPlatform,
  ConnectionStatus,
  CopyExecutionOrder,
  CopyOrderStatus,
  FollowerAccount,
} from "@/lib/engines/copy-trade-engine";
import {
  decryptSecret,
  encryptSecret,
  generateEaToken,
  hashEaToken,
  maskSecret,
  timingSafeTokenEqual,
} from "@/lib/security/credential-vault";

interface StoredConnectionInternal extends FollowerAccount {
  userId: string | null;
  apiKeyEnc: string | null;
  apiSecretEnc: string | null;
  passphraseEnc: string | null;
  eaTokenHash: string | null;
}

export interface CreateBrokerConnectionInput {
  userId?: string | null;
  name: string;
  platform: BrokerPlatform;
  accountNumber?: string;
  balanceUsd: number;
  riskMultiplier: number;
  maxAllowedSlippagePips?: number;
  leverageCap?: number;
  isTestnet?: boolean;
  autoExecuteEnabled?: boolean;
  maxDailyLossUsd?: number;
  maxOpenPositions?: number;
  apiKey?: string;
  apiSecret?: string;
  passphrase?: string;
}

export interface DecryptedBrokerSecrets {
  apiKey: string;
  apiSecret: string;
  passphrase: string | null;
  isTestnet: boolean;
}

function getTodayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Tài khoản Paper mặc định khi hệ thống mới khởi tạo (không giả lập kết nối thật). */
const DEFAULT_DEV_CONNECTIONS: StoredConnectionInternal[] = [
  {
    id: "paper-binance-sandbox",
    userId: null,
    name: "Binance Futures Paper Sandbox",
    platform: "BINANCE_FUTURES",
    accountNumberMasked: "PAPER-BN-01",
    balanceUsd: 10000,
    riskMultiplier: 1.0,
    maxAllowedSlippagePips: 3.0,
    leverageCap: 5,
    isTestnet: true,
    isActive: true,
    autoExecuteEnabled: true,
    killSwitched: false,
    connectionStatus: "PAPER_SIMULATED",
    maxDailyLossUsd: 500,
    dailyRealizedPnlUsd: 0,
    dailyPnlDate: getTodayUtcDate(),
    maxOpenPositions: 5,
    hasApiKey: false,
    hasPassphrase: false,
    hasEaToken: false,
    lastVerifiedAt: null,
    lastError: null,
    totalCopiedTrades: 0,
    winratePct: 0,
    totalPnlUsd: 0,
    createdAt: Date.now() - 86_400_000,
    apiKeyEnc: null,
    apiSecretEnc: null,
    passphraseEnc: null,
    eaTokenHash: null,
  },
  {
    id: "paper-exness-mt5-demo",
    userId: null,
    name: "Exness MT5 Paper Demo",
    platform: "MT5_EXNESS",
    accountNumberMasked: "PAPER-EX-01",
    balanceUsd: 10000,
    riskMultiplier: 1.0,
    maxAllowedSlippagePips: 1.5,
    leverageCap: 5,
    isTestnet: true,
    isActive: true,
    autoExecuteEnabled: true,
    killSwitched: false,
    connectionStatus: "PAPER_SIMULATED",
    maxDailyLossUsd: 400,
    dailyRealizedPnlUsd: 0,
    dailyPnlDate: getTodayUtcDate(),
    maxOpenPositions: 5,
    hasApiKey: false,
    hasPassphrase: false,
    hasEaToken: false,
    lastVerifiedAt: null,
    lastError: null,
    totalCopiedTrades: 0,
    winratePct: 0,
    totalPnlUsd: 0,
    createdAt: Date.now() - 86_400_000,
    apiKeyEnc: null,
    apiSecretEnc: null,
    passphraseEnc: null,
    eaTokenHash: null,
  },
];

const DEV_CONNECTIONS_STORE: StoredConnectionInternal[] = DEFAULT_DEV_CONNECTIONS.map((c) => ({ ...c }));
const DEV_ORDERS_STORE: CopyExecutionOrder[] = [];

// Circuit-breaker when Postgres broker_connections / bot_execution_orders tables are not migrated or unreachable
let dbVaultCooldownUntil = 0;
function shouldUseVaultDb(): boolean {
  return databaseConfigured() && Date.now() >= dbVaultCooldownUntil;
}
function tripVaultDbCooldown(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  // Missing table (42P01) -> cool down 5 minutes; transient network -> cool down 30s
  const cooldownMs = /does not exist|42P01|relation/i.test(msg) ? 5 * 60_000 : 30_000;
  dbVaultCooldownUntil = Date.now() + cooldownMs;
}

function stripSecrets(row: StoredConnectionInternal): FollowerAccount {
  const today = getTodayUtcDate();
  const dailyPnl = row.dailyPnlDate === today ? row.dailyRealizedPnlUsd ?? 0 : 0;
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    accountNumberMasked: row.accountNumberMasked,
    balanceUsd: row.balanceUsd,
    riskMultiplier: row.riskMultiplier,
    maxAllowedSlippagePips: row.maxAllowedSlippagePips,
    leverageCap: row.leverageCap ?? 5,
    isTestnet: row.isTestnet ?? true,
    isActive: row.isActive,
    autoExecuteEnabled: row.autoExecuteEnabled ?? false,
    killSwitched: row.killSwitched ?? false,
    connectionStatus: row.connectionStatus ?? "PAPER_SIMULATED",
    maxDailyLossUsd: row.maxDailyLossUsd ?? 500,
    dailyRealizedPnlUsd: dailyPnl,
    dailyPnlDate: today,
    maxOpenPositions: row.maxOpenPositions ?? 3,
    hasApiKey: Boolean(row.apiKeyEnc),
    hasPassphrase: Boolean(row.passphraseEnc),
    hasEaToken: Boolean(row.eaTokenHash),
    lastVerifiedAt: row.lastVerifiedAt ?? null,
    lastError: row.lastError ?? null,
    totalCopiedTrades: row.totalCopiedTrades,
    winratePct: row.winratePct,
    totalPnlUsd: row.totalPnlUsd,
    createdAt: row.createdAt,
  };
}

function mapDbRowToInternal(r: typeof brokerConnections.$inferSelect): StoredConnectionInternal {
  return {
    id: r.id,
    userId: r.userId ?? null,
    name: r.name,
    platform: r.platform as BrokerPlatform,
    accountNumberMasked: r.accountNumberMasked,
    balanceUsd: Number(r.balanceUsd ?? 0),
    riskMultiplier: Number(r.riskMultiplier ?? 1),
    maxAllowedSlippagePips: Number(r.maxAllowedSlippagePips ?? 2),
    leverageCap: r.leverageCap ?? 5,
    isTestnet: r.isTestnet,
    isActive: r.isActive,
    autoExecuteEnabled: r.autoExecuteEnabled,
    killSwitched: r.killSwitched,
    connectionStatus: r.connectionStatus as ConnectionStatus,
    maxDailyLossUsd: Number(r.maxDailyLossUsd ?? 500),
    dailyRealizedPnlUsd: Number(r.dailyRealizedPnlUsd ?? 0),
    dailyPnlDate: r.dailyPnlDate || getTodayUtcDate(),
    maxOpenPositions: r.maxOpenPositions ?? 3,
    hasApiKey: Boolean(r.apiKeyEnc),
    hasPassphrase: Boolean(r.passphraseEnc),
    hasEaToken: Boolean(r.eaTokenHash),
    lastVerifiedAt: r.lastVerifiedAt ? r.lastVerifiedAt.getTime() : null,
    lastError: r.lastError ?? null,
    totalCopiedTrades: r.totalCopiedTrades,
    winratePct: Number(r.winratePct ?? 0),
    totalPnlUsd: Number(r.totalPnlUsd ?? 0),
    createdAt: r.createdAt.getTime(),
    apiKeyEnc: r.apiKeyEnc ?? null,
    apiSecretEnc: r.apiSecretEnc ?? null,
    passphraseEnc: r.passphraseEnc ?? null,
    eaTokenHash: r.eaTokenHash ?? null,
  };
}

export async function recordVaultAuditLog(
  userId: string | null | undefined,
  action: string,
  meta: Record<string, unknown>,
): Promise<void> {
  if (!shouldUseVaultDb()) return;
  try {
    await db.insert(auditLogs).values({
      userId: userId ?? null,
      action,
      meta,
    });
  } catch (err) {
    tripVaultDbCooldown(err);
  }
}

export async function listBrokerConnections(userId?: string | null): Promise<FollowerAccount[]> {
  if (shouldUseVaultDb()) {
    try {
      const rows = userId
        ? await db.select().from(brokerConnections).where(eq(brokerConnections.userId, userId)).orderBy(desc(brokerConnections.createdAt))
        : await db.select().from(brokerConnections).orderBy(desc(brokerConnections.createdAt));

      if (rows.length > 0) {
        return rows.map((r) => stripSecrets(mapDbRowToInternal(r)));
      }
      if (!userId) {
        return DEV_CONNECTIONS_STORE.map(stripSecrets);
      }
      return [];
    } catch (err) {
      tripVaultDbCooldown(err);
      return DEV_CONNECTIONS_STORE.map(stripSecrets);
    }
  }

  return DEV_CONNECTIONS_STORE
    .filter((c) => !userId || !c.userId || c.userId === userId)
    .map(stripSecrets);
}

export async function getBrokerConnectionById(id: string): Promise<FollowerAccount | null> {
  if (shouldUseVaultDb()) {
    try {
      const [row] = await db.select().from(brokerConnections).where(eq(brokerConnections.id, id)).limit(1);
      if (row) return stripSecrets(mapDbRowToInternal(row));
    } catch (err) {
      tripVaultDbCooldown(err);
    }
  }
  const found = DEV_CONNECTIONS_STORE.find((c) => c.id === id);
  return found ? stripSecrets(found) : null;
}

export async function getBrokerConnectionSecrets(id: string): Promise<DecryptedBrokerSecrets | null> {
  let internal: StoredConnectionInternal | undefined;
  if (shouldUseVaultDb()) {
    try {
      const [row] = await db.select().from(brokerConnections).where(eq(brokerConnections.id, id)).limit(1);
      if (row) internal = mapDbRowToInternal(row);
    } catch (err) {
      tripVaultDbCooldown(err);
    }
  }
  if (!internal) {
    internal = DEV_CONNECTIONS_STORE.find((c) => c.id === id);
  }
  if (!internal || !internal.apiKeyEnc || !internal.apiSecretEnc) {
    return null;
  }
  return {
    apiKey: decryptSecret(internal.apiKeyEnc),
    apiSecret: decryptSecret(internal.apiSecretEnc),
    passphrase: internal.passphraseEnc ? decryptSecret(internal.passphraseEnc) : null,
    isTestnet: internal.isTestnet ?? true,
  };
}

export async function createBrokerConnection(
  input: CreateBrokerConnectionInput,
): Promise<{ connection: FollowerAccount; oneTimeEaToken: string | null }> {
  const id = `conn_${randomUUID().slice(0, 12)}`;
  const isMt5 = input.platform === "MT5_EXNESS" || input.platform === "MT5_XM" || input.platform === "MT5_EA";
  const isRestExchange = input.platform === "BINANCE_FUTURES" || input.platform === "OKX_FUTURES";

  const hasApiCreds = Boolean(input.apiKey?.trim() && input.apiSecret?.trim());
  const apiKeyEnc = hasApiCreds ? encryptSecret(input.apiKey!) : null;
  const apiSecretEnc = hasApiCreds ? encryptSecret(input.apiSecret!) : null;
  const passphraseEnc = input.passphrase?.trim() ? encryptSecret(input.passphrase) : null;

  let oneTimeEaToken: string | null = null;
  let eaTokenHash: string | null = null;
  if (isMt5 && !hasApiCreds) {
    oneTimeEaToken = generateEaToken();
    eaTokenHash = hashEaToken(oneTimeEaToken);
  }

  let initialStatus: ConnectionStatus = "PAPER_SIMULATED";
  if (hasApiCreds && (isRestExchange || isMt5)) {
    initialStatus = "UNVERIFIED";
  } else if (isMt5) {
    initialStatus = "AWAITING_EA";
  }

  const maskedAccount = hasApiCreds
    ? maskSecret(input.apiKey)
    : input.accountNumber?.trim()
      ? maskSecret(input.accountNumber)
      : isMt5
        ? `MT5-${id.slice(-4).toUpperCase()}`
        : `PAPER-${id.slice(-4).toUpperCase()}`;

  const now = Date.now();
  const internal: StoredConnectionInternal = {
    id,
    userId: input.userId ?? null,
    name: input.name.trim(),
    platform: input.platform,
    accountNumberMasked: maskedAccount,
    balanceUsd: Math.max(0, input.balanceUsd),
    riskMultiplier: Math.max(0.1, Math.min(5, input.riskMultiplier)),
    maxAllowedSlippagePips: Math.max(0.1, Math.min(25, input.maxAllowedSlippagePips ?? 2)),
    leverageCap: Math.max(1, Math.min(20, Math.round(input.leverageCap ?? 5))),
    isTestnet: input.isTestnet ?? true,
    isActive: true,
    autoExecuteEnabled: Boolean(input.autoExecuteEnabled ?? false),
    killSwitched: false,
    connectionStatus: initialStatus,
    maxDailyLossUsd: Math.max(10, input.maxDailyLossUsd ?? 500),
    dailyRealizedPnlUsd: 0,
    dailyPnlDate: getTodayUtcDate(),
    maxOpenPositions: Math.max(1, Math.min(20, input.maxOpenPositions ?? 3)),
    hasApiKey: hasApiCreds,
    hasPassphrase: Boolean(passphraseEnc),
    hasEaToken: Boolean(eaTokenHash),
    lastVerifiedAt: null,
    lastError: null,
    totalCopiedTrades: 0,
    winratePct: 0,
    totalPnlUsd: 0,
    createdAt: now,
    apiKeyEnc,
    apiSecretEnc,
    passphraseEnc,
    eaTokenHash,
  };

  if (shouldUseVaultDb()) {
    try {
      await db.insert(brokerConnections).values({
        id: internal.id,
        userId: internal.userId,
        name: internal.name,
        platform: internal.platform,
        accountNumberMasked: internal.accountNumberMasked,
        balanceUsd: String(internal.balanceUsd),
        riskMultiplier: String(internal.riskMultiplier),
        maxAllowedSlippagePips: String(internal.maxAllowedSlippagePips),
        leverageCap: internal.leverageCap ?? 5,
        isTestnet: internal.isTestnet ?? true,
        isActive: internal.isActive,
        autoExecuteEnabled: internal.autoExecuteEnabled ?? false,
        killSwitched: false,
        connectionStatus: initialStatus,
        maxDailyLossUsd: String(internal.maxDailyLossUsd ?? 500),
        dailyRealizedPnlUsd: "0",
        dailyPnlDate: getTodayUtcDate(),
        maxOpenPositions: internal.maxOpenPositions ?? 3,
        apiKeyEnc,
        apiSecretEnc,
        passphraseEnc,
        eaTokenHash,
      });
      await recordVaultAuditLog(input.userId, "BROKER_CONNECTION_CREATED", {
        connectionId: id,
        platform: input.platform,
        isTestnet: internal.isTestnet,
        hasApiCreds,
        isMt5,
      });
      return { connection: stripSecrets(internal), oneTimeEaToken };
    } catch (err) {
      tripVaultDbCooldown(err);
    }
  }

  DEV_CONNECTIONS_STORE.unshift(internal);
  return { connection: stripSecrets(internal), oneTimeEaToken };
}

export async function updateBrokerConnectionState(
  id: string,
  patch: Partial<{
    isActive: boolean;
    autoExecuteEnabled: boolean;
    killSwitched: boolean;
    connectionStatus: ConnectionStatus;
    balanceUsd: number;
    lastVerifiedAt: number | null;
    lastError: string | null;
    totalCopiedTrades: number;
    totalPnlUsd: number;
    dailyRealizedPnlUsd: number;
    dailyPnlDate: string;
    maxDailyLossUsd: number;
    leverageCap: number;
  }>,
): Promise<FollowerAccount | null> {
  if (databaseConfigured()) {
    try {
      const dbPatch: Record<string, unknown> = { updatedAt: new Date() };
      if (patch.isActive !== undefined) dbPatch.isActive = patch.isActive;
      if (patch.autoExecuteEnabled !== undefined) dbPatch.autoExecuteEnabled = patch.autoExecuteEnabled;
      if (patch.killSwitched !== undefined) dbPatch.killSwitched = patch.killSwitched;
      if (patch.connectionStatus !== undefined) dbPatch.connectionStatus = patch.connectionStatus;
      if (patch.balanceUsd !== undefined) dbPatch.balanceUsd = String(patch.balanceUsd);
      if (patch.lastVerifiedAt !== undefined) {
        dbPatch.lastVerifiedAt = patch.lastVerifiedAt ? new Date(patch.lastVerifiedAt) : null;
      }
      if (patch.lastError !== undefined) dbPatch.lastError = patch.lastError;
      if (patch.totalCopiedTrades !== undefined) dbPatch.totalCopiedTrades = patch.totalCopiedTrades;
      if (patch.totalPnlUsd !== undefined) dbPatch.totalPnlUsd = String(patch.totalPnlUsd);
      if (patch.dailyRealizedPnlUsd !== undefined) dbPatch.dailyRealizedPnlUsd = String(patch.dailyRealizedPnlUsd);
      if (patch.dailyPnlDate !== undefined) dbPatch.dailyPnlDate = patch.dailyPnlDate;
      if (patch.maxDailyLossUsd !== undefined) dbPatch.maxDailyLossUsd = String(patch.maxDailyLossUsd);
      if (patch.leverageCap !== undefined) dbPatch.leverageCap = patch.leverageCap;

      const [updated] = await db
        .update(brokerConnections)
        .set(dbPatch)
        .where(eq(brokerConnections.id, id))
        .returning();
      if (updated) return stripSecrets(mapDbRowToInternal(updated));
    } catch {
      // Fallback below
    }
  }

  const target = DEV_CONNECTIONS_STORE.find((c) => c.id === id);
  if (!target) return null;
  Object.assign(target, patch);
  return stripSecrets(target);
}

export async function triggerGlobalKillSwitch(opts: {
  engage: boolean;
  reason?: string;
  userId?: string | null;
}): Promise<FollowerAccount[]> {
  const conns = await listBrokerConnections(opts.userId);
  const updated: FollowerAccount[] = [];
  for (const conn of conns) {
    const nextStatus: ConnectionStatus = opts.engage
      ? "KILL_SWITCHED"
      : conn.hasApiKey
        ? "CONNECTED_VERIFIED"
        : conn.hasEaToken
          ? "AWAITING_EA"
          : "PAPER_SIMULATED";

    const res = await updateBrokerConnectionState(conn.id, {
      killSwitched: opts.engage,
      autoExecuteEnabled: opts.engage ? false : conn.autoExecuteEnabled,
      connectionStatus: nextStatus,
      lastError: opts.engage ? opts.reason || "Kill-Switch khẩn cấp được kích hoạt" : null,
    });
    if (res) updated.push(res);
  }
  await recordVaultAuditLog(opts.userId, opts.engage ? "KILL_SWITCH_ENGAGED" : "KILL_SWITCH_RELEASED", {
    count: updated.length,
    reason: opts.reason ?? null,
  });
  return updated;
}

export async function verifyEaBearerToken(bearerToken: string): Promise<FollowerAccount | null> {
  const clean = bearerToken.trim();
  if (!clean) return null;
  const candidateHash = hashEaToken(clean);

  if (databaseConfigured()) {
    try {
      const [row] = await db
        .select()
        .from(brokerConnections)
        .where(eq(brokerConnections.eaTokenHash, candidateHash))
        .limit(1);
      if (row && row.eaTokenHash && timingSafeTokenEqual(candidateHash, row.eaTokenHash)) {
        return stripSecrets(mapDbRowToInternal(row));
      }
    } catch {
      // Fallback
    }
  }

  const found = DEV_CONNECTIONS_STORE.find(
    (c) => c.eaTokenHash && timingSafeTokenEqual(candidateHash, c.eaTokenHash),
  );
  return found ? stripSecrets(found) : null;
}

export async function hasExecutionOrderByIdempotency(idempotencyKey: string): Promise<boolean> {
  if (databaseConfigured()) {
    try {
      const [row] = await db
        .select({ id: botExecutionOrders.id, status: botExecutionOrders.status })
        .from(botExecutionOrders)
        .where(eq(botExecutionOrders.idempotencyKey, idempotencyKey))
        .limit(1);
      if (row) {
        return row.status === "FILLED" || row.status === "FILLED_PAPER" || row.status === "PENDING_EA";
      }
    } catch {
      // Fallback
    }
  }
  const existing = DEV_ORDERS_STORE.find((o) => o.idempotencyKey === idempotencyKey);
  return Boolean(
    existing &&
      (existing.status === "FILLED" || existing.status === "FILLED_PAPER" || existing.status === "PENDING_EA"),
  );
}

export async function saveBotExecutionOrder(
  order: CopyExecutionOrder,
  userId?: string | null,
): Promise<CopyExecutionOrder> {
  const idempotencyKey = order.idempotencyKey ?? `${order.followerId}:${order.orderId}`;
  if (shouldUseVaultDb()) {
    try {
      let resolvedUserId = userId ?? null;
      if (!resolvedUserId) {
        const [conn] = await db
          .select({ userId: brokerConnections.userId })
          .from(brokerConnections)
          .where(eq(brokerConnections.id, order.followerId))
          .limit(1);
        resolvedUserId = conn?.userId ?? null;
      }
      await db
        .insert(botExecutionOrders)
        .values({
          id: order.orderId,
          userId: resolvedUserId,
          connectionId: order.followerId,
          signalId: order.signalId ?? order.orderId,
          idempotencyKey,
          symbol: order.symbol,
          platform: order.platform,
          direction: order.direction,
          qtyOrLots: String(order.copiedLotsOrQty),
          entryPrice: String(order.entryPrice),
          executionPrice: String(order.executionPrice),
          stopLossPrice: String(order.stopLossPrice),
          takeProfit1: String(order.takeProfit1),
          slippagePips: String(order.slippagePips),
          status: order.status,
          exchangeOrderId: order.exchangeOrderId ?? null,
          slOrderId: order.slOrderId ?? null,
          tpOrderId: order.tpOrderId ?? null,
          message: order.message,
          isTestnet: order.isTestnet ?? true,
        })
        .onConflictDoUpdate({
          target: botExecutionOrders.id,
          set: {
            status: order.status,
            executionPrice: String(order.executionPrice),
            exchangeOrderId: order.exchangeOrderId ?? null,
            slOrderId: order.slOrderId ?? null,
            tpOrderId: order.tpOrderId ?? null,
            message: order.message,
            updatedAt: new Date(),
          },
        });
      return order;
    } catch (err) {
      tripVaultDbCooldown(err);
    }
  }

  const idx = DEV_ORDERS_STORE.findIndex((o) => o.orderId === order.orderId);
  if (idx >= 0) {
    DEV_ORDERS_STORE[idx] = order;
  } else {
    DEV_ORDERS_STORE.unshift(order);
    if (DEV_ORDERS_STORE.length > 200) DEV_ORDERS_STORE.length = 200;
  }
  return order;
}

export async function listBotExecutionOrders(
  limit = 50,
  userId?: string | null,
): Promise<CopyExecutionOrder[]> {
  if (shouldUseVaultDb()) {
    try {
      const conns = await listBrokerConnections(userId);
      const nameById = new Map(conns.map((c) => [c.id, c.name]));
      const rows = userId
        ? await db
            .select()
            .from(botExecutionOrders)
            .where(eq(botExecutionOrders.userId, userId))
            .orderBy(desc(botExecutionOrders.createdAt))
            .limit(limit)
        : await db
            .select()
            .from(botExecutionOrders)
            .orderBy(desc(botExecutionOrders.createdAt))
            .limit(limit);
      if (rows.length > 0) {
        return rows.map((r) => ({
          orderId: r.id,
          followerId: r.connectionId,
          followerName: nameById.get(r.connectionId) ?? r.connectionId,
          platform: r.platform as BrokerPlatform,
          symbol: r.symbol,
          direction: r.direction as "BUY" | "SELL",
          copiedLotsOrQty: Number(r.qtyOrLots),
          entryPrice: Number(r.entryPrice),
          executionPrice: Number(r.executionPrice),
          slippagePips: Number(r.slippagePips),
          status: r.status as CopyOrderStatus,
          stopLossPrice: Number(r.stopLossPrice),
          takeProfit1: Number(r.takeProfit1),
          timestamp: r.createdAt.getTime(),
          message: r.message,
          signalId: r.signalId,
          idempotencyKey: r.idempotencyKey,
          exchangeOrderId: r.exchangeOrderId,
          slOrderId: r.slOrderId,
          tpOrderId: r.tpOrderId,
          isTestnet: r.isTestnet,
        }));
      }
      if (userId) return [];
    } catch (err) {
      tripVaultDbCooldown(err);
    }
  }
  return DEV_ORDERS_STORE.slice(0, limit);
}

export async function listPendingEaOrdersForConnection(connectionId: string): Promise<CopyExecutionOrder[]> {
  const orders = await listBotExecutionOrders(100);
  return orders.filter((o) => o.followerId === connectionId && o.status === "PENDING_EA");
}

export async function deleteBrokerConnection(id: string, userId?: string | null): Promise<boolean> {
  let deleted = false;
  if (shouldUseVaultDb()) {
    try {
      const cond = userId
        ? and(eq(brokerConnections.id, id), eq(brokerConnections.userId, userId))
        : eq(brokerConnections.id, id);
      const rows = await db
        .delete(brokerConnections)
        .where(cond)
        .returning({ id: brokerConnections.id });
      if (rows.length > 0) deleted = true;
    } catch (err) {
      tripVaultDbCooldown(err);
    }
  }
  const idx = DEV_CONNECTIONS_STORE.findIndex((c) => c.id === id);
  if (idx >= 0) {
    DEV_CONNECTIONS_STORE.splice(idx, 1);
    deleted = true;
  }
  if (deleted) {
    await recordVaultAuditLog(userId, "BROKER_CONNECTION_DELETED", { connectionId: id });
  }
  return deleted;
}

export async function rotateBrokerCredentials(
  id: string,
  input: {
    apiKey?: string;
    apiSecret?: string;
    passphrase?: string;
    isTestnet?: boolean;
    regenerateEaToken?: boolean;
    userId?: string | null;
  },
): Promise<{ connection: FollowerAccount | null; oneTimeEaToken: string | null }> {
  const hasApiCreds = Boolean(input.apiKey?.trim() && input.apiSecret?.trim());
  const apiKeyEnc = hasApiCreds ? encryptSecret(input.apiKey!) : undefined;
  const apiSecretEnc = hasApiCreds ? encryptSecret(input.apiSecret!) : undefined;
  const passphraseEnc =
    input.passphrase !== undefined
      ? input.passphrase.trim()
        ? encryptSecret(input.passphrase)
        : null
      : undefined;

  let oneTimeEaToken: string | null = null;
  let eaTokenHash: string | undefined;
  if (input.regenerateEaToken) {
    oneTimeEaToken = generateEaToken();
    eaTokenHash = hashEaToken(oneTimeEaToken);
  }

  const nextMasked = hasApiCreds ? maskSecret(input.apiKey) : undefined;
  const nextStatus: ConnectionStatus | undefined = hasApiCreds
    ? "UNVERIFIED"
    : input.regenerateEaToken
      ? "AWAITING_EA"
      : undefined;

  if (databaseConfigured()) {
    try {
      const dbPatch: Record<string, unknown> = { updatedAt: new Date() };
      if (apiKeyEnc !== undefined) dbPatch.apiKeyEnc = apiKeyEnc;
      if (apiSecretEnc !== undefined) dbPatch.apiSecretEnc = apiSecretEnc;
      if (passphraseEnc !== undefined) dbPatch.passphraseEnc = passphraseEnc;
      if (eaTokenHash !== undefined) dbPatch.eaTokenHash = eaTokenHash;
      if (nextMasked !== undefined) dbPatch.accountNumberMasked = nextMasked;
      if (nextStatus !== undefined) dbPatch.connectionStatus = nextStatus;
      if (input.isTestnet !== undefined) dbPatch.isTestnet = input.isTestnet;

      const [updated] = await db
        .update(brokerConnections)
        .set(dbPatch)
        .where(eq(brokerConnections.id, id))
        .returning();
      if (updated) {
        await recordVaultAuditLog(input.userId, "BROKER_CREDENTIALS_ROTATED", {
          connectionId: id,
          rotatedApiKey: hasApiCreds,
          regeneratedEaToken: Boolean(oneTimeEaToken),
        });
        return { connection: stripSecrets(mapDbRowToInternal(updated)), oneTimeEaToken };
      }
    } catch {
      // Fallback below
    }
  }

  const target = DEV_CONNECTIONS_STORE.find((c) => c.id === id);
  if (!target) return { connection: null, oneTimeEaToken: null };
  if (apiKeyEnc !== undefined) {
    target.apiKeyEnc = apiKeyEnc;
    target.hasApiKey = true;
  }
  if (apiSecretEnc !== undefined) target.apiSecretEnc = apiSecretEnc;
  if (passphraseEnc !== undefined) {
    target.passphraseEnc = passphraseEnc;
    target.hasPassphrase = Boolean(passphraseEnc);
  }
  if (eaTokenHash !== undefined) {
    target.eaTokenHash = eaTokenHash;
    target.hasEaToken = true;
  }
  if (nextMasked !== undefined) target.accountNumberMasked = nextMasked;
  if (nextStatus !== undefined) target.connectionStatus = nextStatus;
  if (input.isTestnet !== undefined) target.isTestnet = input.isTestnet;

  return { connection: stripSecrets(target), oneTimeEaToken };
}
