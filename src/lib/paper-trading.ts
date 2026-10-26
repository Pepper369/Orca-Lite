/**
 * Paper Trading Engine — Hệ thống giao dịch cổ phiếu giả lập (500M VNĐ).
 * Mô phỏng thực tế thị trường chứng khoán Việt Nam:
 * - Vốn ban đầu: 500,000,000 VND
 * - Lô 100 cổ phiếu
 * - Phí giao dịch (0.1%), Thuế TNCN khi bán (0.1%)
 * - Loại lệnh: MP (Thị trường) & LO (Giới hạn)
 * - Quản lý giá vốn bình quân, lãi/lỗ tạm tính (Unrealized) & lãi/lỗ thực nhận (Realized)
 * - Chế độ thanh toán: T+0 (linh hoạt tập luyện) & T+2.5 (chuẩn quy định UBCKNN)
 */

export const DEFAULT_INITIAL_CASH = 500_000_000;
export const DEFAULT_TRADE_FEE_RATE = 0.001; // 0.1% phí giao dịch
export const DEFAULT_SELL_TAX_RATE = 0.001;  // 0.1% thuế TNCN khi bán

export type OrderSide = "BUY" | "SELL";
export type OrderType = "MP" | "LO";
export type OrderStatus = "FILLED" | "PENDING" | "CANCELLED" | "REJECTED";
export type TPlusRule = "T0" | "T2_5";

export interface PaperHolding {
  symbol: string;
  shares: number;          // Tổng số lượng đang giữ
  availableShares: number; // Số lượng khả dụng để bán (đã thanh toán T+)
  avgCost: number;         // Giá vốn bình quân (VND)
  totalInvested: number;   // Tổng tiền vốn đã bỏ ra
  updatedAt: number;
}

export interface PaperOrder {
  id: string;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  price: number;           // Giá đặt lệnh (LO) hoặc giá khớp (MP)
  shares: number;          // Khối lượng
  status: OrderStatus;
  grossValue: number;      // Giá trị lệnh (price * shares)
  fee: number;             // Phí giao dịch
  tax: number;             // Thuế TNCN (nếu bán)
  placedAt: number;
  filledAt: number | null;
  rejectReason?: string;
}

export interface PaperTradeRecord {
  id: string;
  orderId: string;
  symbol: string;
  side: OrderSide;
  price: number;
  shares: number;
  grossValue: number;
  fee: number;
  tax: number;
  netValue: number;        // BUY: gross + fee; SELL: gross - fee - tax
  realizedPnl?: number | null;
  realizedPnlPct?: number | null;
  executedAt: number;
}

export interface PaperAccount {
  id: string;
  initialCash: number;
  availableCash: number;
  lockedCash: number;      // Tiền bị phong toả bởi lệnh LO Mua đang chờ khớp
  holdings: Record<string, PaperHolding>;
  orders: PaperOrder[];
  history: PaperTradeRecord[];
  tPlusRule: TPlusRule;
  createdAt: number;
  updatedAt: number;
}

export interface EnrichedHolding extends PaperHolding {
  currentPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  weightPct: number;
  changePercent?: number | null;
}

export interface PortfolioMetrics {
  initialCash: number;
  availableCash: number;
  lockedCash: number;
  totalCash: number;
  stockValue: number;
  nav: number;             // Net Asset Value = totalCash + stockValue
  totalInvested: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  realizedPnl: number;
  totalPnl: number;        // unrealized + realized
  totalPnlPct: number;
  winTrades: number;
  lossTrades: number;
  totalTrades: number;
  winRate: number;
  holdings: EnrichedHolding[];
}

const STORAGE_KEY = "orca_paper_trading_account_v2";
const STORAGE_EVENT = "orca_paper_trading_updated";

function createNewAccount(initialCash = DEFAULT_INITIAL_CASH, tPlusRule: TPlusRule = "T0"): PaperAccount {
  const now = Date.now();
  return {
    id: `acc_${now}`,
    initialCash,
    availableCash: initialCash,
    lockedCash: 0,
    holdings: {},
    orders: [],
    history: [],
    tPlusRule,
    createdAt: now,
    updatedAt: now,
  };
}

/** Tải tài khoản từ localStorage (hoặc khởi tạo mặc định 500M) */
export function loadPaperAccount(): PaperAccount {
  if (typeof window === "undefined") {
    return createNewAccount();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const def = createNewAccount();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(def));
      return def;
    }
    const acc = JSON.parse(raw) as PaperAccount;
    // Đảm bảo các cấu trúc không bị undefined nếu di chuyển phiên bản
    if (!acc.holdings) acc.holdings = {};
    if (!acc.orders) acc.orders = [];
    if (!acc.history) acc.history = [];
    if (typeof acc.lockedCash !== "number") acc.lockedCash = 0;
    if (!acc.tPlusRule) acc.tPlusRule = "T0";
    return acc;
  } catch {
    const def = createNewAccount();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(def));
    return def;
  }
}

/** Lưu tài khoản và phát sự kiện đồng bộ cho toàn bộ tab/component */
export function savePaperAccount(account: PaperAccount): void {
  if (typeof window === "undefined") return;
  try {
    account.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
    window.dispatchEvent(new Event(STORAGE_EVENT));
  } catch (e) {
    console.error("[PaperTrading] Lỗi lưu tài khoản:", e);
  }
}

/** Đặt lại tài khoản về trạng thái ban đầu */
export function resetPaperAccount(initialCash = DEFAULT_INITIAL_CASH, tPlusRule: TPlusRule = "T0"): PaperAccount {
  const acc = createNewAccount(initialCash, tPlusRule);
  savePaperAccount(acc);
  return acc;
}

/** Nạp thêm hoặc điều chỉnh vốn ảo */
export function adjustPaperCash(amount: number): PaperAccount {
  const acc = loadPaperAccount();
  acc.availableCash = Math.max(0, acc.availableCash + amount);
  if (amount > 0) acc.initialCash += amount;
  savePaperAccount(acc);
  return acc;
}

/** Chuyển đổi chế độ T+0 / T+2.5 */
export function setTPlusRule(rule: TPlusRule): PaperAccount {
  const acc = loadPaperAccount();
  acc.tPlusRule = rule;
  // Nếu chuyển sang T0, giải phóng toàn bộ số cổ phiếu thành khả dụng
  if (rule === "T0") {
    for (const sym of Object.keys(acc.holdings)) {
      acc.holdings[sym].availableShares = acc.holdings[sym].shares;
    }
  }
  savePaperAccount(acc);
  return acc;
}

/** Đăng ký lắng nghe thay đổi tài khoản */
export function subscribePaperAccount(listener: (acc: PaperAccount) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => {
    listener(loadPaperAccount());
  };
  window.addEventListener(STORAGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(STORAGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export interface PlaceOrderInput {
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  shares: number;
  price?: number;            // Cần thiết nếu là LO; nếu MP có thể bỏ qua hoặc truyền marketPrice
  currentMarketPrice: number; // Giá thị trường hiện tại để khớp lệnh
  ceilingPrice?: number;     // Giá trần
  floorPrice?: number;       // Giá sàn
}

export interface PlaceOrderResult {
  success: boolean;
  message: string;
  order?: PaperOrder;
  account?: PaperAccount;
}

/**
 * Đặt lệnh giao dịch cổ phiếu giả lập (Mua / Bán)
 */
export function placePaperOrder(input: PlaceOrderInput): PlaceOrderResult {
  const acc = loadPaperAccount();
  const sym = input.symbol.trim().toUpperCase();
  const shares = Math.floor(input.shares);
  const now = Date.now();

  // 1. Kiểm tra đầu vào hợp lệ
  if (!sym || !/^[A-Z0-9]{3,8}$/.test(sym)) {
    return { success: false, message: "Mã cổ phiếu không hợp lệ." };
  }
  if (shares <= 0 || shares % 100 !== 0) {
    return { success: false, message: "Khối lượng đặt phải là bội số của 100 (chuẩn sàn VN)." };
  }
  if (input.currentMarketPrice <= 0) {
    return { success: false, message: "Chưa có dữ liệu giá thị trường cho mã này." };
  }

  const execPrice = input.orderType === "MP" ? input.currentMarketPrice : (input.price ?? input.currentMarketPrice);

  if (execPrice <= 0) {
    return { success: false, message: "Mức giá đặt lệnh không hợp lệ." };
  }

  // Kiểm tra biên độ trần sàn đối với lệnh LO
  if (input.orderType === "LO") {
    if (input.ceilingPrice && execPrice > input.ceilingPrice) {
      return { success: false, message: `Giá đặt (${execPrice.toLocaleString("vi-VN")}) vượt quá giá trần (${input.ceilingPrice.toLocaleString("vi-VN")}).` };
    }
    if (input.floorPrice && execPrice < input.floorPrice) {
      return { success: false, message: `Giá đặt (${execPrice.toLocaleString("vi-VN")}) thấp hơn giá sàn (${input.floorPrice.toLocaleString("vi-VN")}).` };
    }
  }

  const grossValue = execPrice * shares;
  const fee = Math.round(grossValue * DEFAULT_TRADE_FEE_RATE);
  const tax = input.side === "SELL" ? Math.round(grossValue * DEFAULT_SELL_TAX_RATE) : 0;

  // 2. Xử lý LỆNH MUA (BUY)
  if (input.side === "BUY") {
    const totalRequired = grossValue + fee;
    if (acc.availableCash < totalRequired) {
      return {
        success: false,
        message: `Không đủ tiền mặt khả dụng. Cần ${totalRequired.toLocaleString("vi-VN")} đ (gồm phí), hiện có ${Math.round(acc.availableCash).toLocaleString("vi-VN")} đ.`,
      };
    }

    // Xác định xem lệnh có khớp ngay không:
    // - MP: Khớp ngay
    // - LO: Khớp nếu giá đặt >= giá thị trường hiện tại
    const shouldFillImmediately = input.orderType === "MP" || execPrice >= input.currentMarketPrice;

    if (shouldFillImmediately) {
      // Trừ tiền mặt
      acc.availableCash -= totalRequired;

      // Cập nhật vị thế nắm giữ
      const holding = acc.holdings[sym] ?? {
        symbol: sym,
        shares: 0,
        availableShares: 0,
        avgCost: 0,
        totalInvested: 0,
        updatedAt: now,
      };

      const newShares = holding.shares + shares;
      const newInvested = holding.totalInvested + grossValue; // Giá vốn tính trên gross
      const newAvgCost = Math.round(newInvested / newShares);
      const newAvailable = acc.tPlusRule === "T0" ? newShares : holding.availableShares;

      acc.holdings[sym] = {
        symbol: sym,
        shares: newShares,
        availableShares: newAvailable,
        avgCost: newAvgCost,
        totalInvested: newInvested,
        updatedAt: now,
      };

      const order: PaperOrder = {
        id: `ord_${now}_${Math.random().toString(36).slice(2, 7)}`,
        symbol: sym,
        side: "BUY",
        orderType: input.orderType,
        price: execPrice,
        shares,
        status: "FILLED",
        grossValue,
        fee,
        tax: 0,
        placedAt: now,
        filledAt: now,
      };

      const record: PaperTradeRecord = {
        id: `trd_${now}_${Math.random().toString(36).slice(2, 7)}`,
        orderId: order.id,
        symbol: sym,
        side: "BUY",
        price: execPrice,
        shares,
        grossValue,
        fee,
        tax: 0,
        netValue: totalRequired,
        realizedPnl: null,
        realizedPnlPct: null,
        executedAt: now,
      };

      acc.orders.unshift(order);
      acc.history.unshift(record);
      savePaperAccount(acc);

      return {
        success: true,
        message: `Khớp lệnh MUA thành công ${shares.toLocaleString("vi-VN")} cổ phiếu ${sym} giá ${execPrice.toLocaleString("vi-VN")} đ.`,
        order,
        account: acc,
      };
    } else {
      // Lệnh LO treo chờ giá: Phong toả tiền mặt
      acc.availableCash -= totalRequired;
      acc.lockedCash += totalRequired;

      const order: PaperOrder = {
        id: `ord_${now}_${Math.random().toString(36).slice(2, 7)}`,
        symbol: sym,
        side: "BUY",
        orderType: "LO",
        price: execPrice,
        shares,
        status: "PENDING",
        grossValue,
        fee,
        tax: 0,
        placedAt: now,
        filledAt: null,
      };

      acc.orders.unshift(order);
      savePaperAccount(acc);

      return {
        success: true,
        message: `Đã đặt lệnh MUA chờ khớp ${shares.toLocaleString("vi-VN")} ${sym} giá ${execPrice.toLocaleString("vi-VN")} đ. Tiền đã được tạm phong toả.`,
        order,
        account: acc,
      };
    }
  }

  // 3. Xử lý LỆNH BÁN (SELL)
  if (input.side === "SELL") {
    const holding = acc.holdings[sym];
    if (!holding || holding.shares <= 0) {
      return { success: false, message: `Bạn không có cổ phiếu ${sym} trong danh mục để bán.` };
    }

    const availableToSell = acc.tPlusRule === "T0" ? holding.shares : holding.availableShares;
    if (availableToSell < shares) {
      return {
        success: false,
        message: `Số lượng khả dụng để bán không đủ (${availableToSell.toLocaleString("vi-VN")} / cần ${shares.toLocaleString("vi-VN")}). Có thể cổ phiếu đang chờ về (T+2.5).`,
      };
    }

    // Xác định xem lệnh có khớp ngay không:
    // - MP: Khớp ngay
    // - LO: Khớp nếu giá đặt <= giá thị trường hiện tại
    const shouldFillImmediately = input.orderType === "MP" || execPrice <= input.currentMarketPrice;

    if (shouldFillImmediately) {
      const netReceived = grossValue - fee - tax;
      acc.availableCash += netReceived;

      // Tính lãi lỗ thực nhận của phần bán này
      const costOfSold = Math.round(holding.avgCost * shares);
      const realizedPnl = grossValue - costOfSold - fee - tax;
      const realizedPnlPct = costOfSold > 0 ? (realizedPnl / costOfSold) * 100 : 0;

      // Giảm khối lượng nắm giữ
      const remainingShares = holding.shares - shares;
      if (remainingShares <= 0) {
        delete acc.holdings[sym];
      } else {
        const remainingInvested = Math.max(0, holding.totalInvested - costOfSold);
        holding.shares = remainingShares;
        holding.availableShares = Math.max(0, holding.availableShares - shares);
        holding.totalInvested = remainingInvested;
        holding.updatedAt = now;
      }

      const order: PaperOrder = {
        id: `ord_${now}_${Math.random().toString(36).slice(2, 7)}`,
        symbol: sym,
        side: "SELL",
        orderType: input.orderType,
        price: execPrice,
        shares,
        status: "FILLED",
        grossValue,
        fee,
        tax,
        placedAt: now,
        filledAt: now,
      };

      const record: PaperTradeRecord = {
        id: `trd_${now}_${Math.random().toString(36).slice(2, 7)}`,
        orderId: order.id,
        symbol: sym,
        side: "SELL",
        price: execPrice,
        shares,
        grossValue,
        fee,
        tax,
        netValue: netReceived,
        realizedPnl,
        realizedPnlPct,
        executedAt: now,
      };

      acc.orders.unshift(order);
      acc.history.unshift(record);
      savePaperAccount(acc);

      const pnlSign = realizedPnl >= 0 ? "+" : "";
      return {
        success: true,
        message: `Khớp lệnh BÁN thành công ${shares.toLocaleString("vi-VN")} ${sym} giá ${execPrice.toLocaleString("vi-VN")} đ. Lãi/Lỗ: ${pnlSign}${realizedPnl.toLocaleString("vi-VN")} đ (${pnlSign}${realizedPnlPct.toFixed(2)}%).`,
        order,
        account: acc,
      };
    } else {
      // LO Bán chờ giá: Tạm khoá số cổ phiếu khả dụng để không bán trùng
      holding.availableShares = Math.max(0, holding.availableShares - shares);

      const order: PaperOrder = {
        id: `ord_${now}_${Math.random().toString(36).slice(2, 7)}`,
        symbol: sym,
        side: "SELL",
        orderType: "LO",
        price: execPrice,
        shares,
        status: "PENDING",
        grossValue,
        fee,
        tax,
        placedAt: now,
        filledAt: null,
      };

      acc.orders.unshift(order);
      savePaperAccount(acc);

      return {
        success: true,
        message: `Đã đặt lệnh BÁN chờ khớp ${shares.toLocaleString("vi-VN")} ${sym} giá ${execPrice.toLocaleString("vi-VN")} đ. Số cổ phiếu này đã được khoá.`,
        order,
        account: acc,
      };
    }
  }

  return { success: false, message: "Lệnh không hợp lệ." };
}

/**
 * Huỷ lệnh chờ khớp (Pending LO) và hoàn lại tiền/cổ phiếu bị phong toả
 */
export function cancelPaperOrder(orderId: string): { success: boolean; message: string; account?: PaperAccount } {
  const acc = loadPaperAccount();
  const order = acc.orders.find((o) => o.id === orderId);
  if (!order) {
    return { success: false, message: "Không tìm thấy lệnh." };
  }
  if (order.status !== "PENDING") {
    return { success: false, message: "Chỉ có thể huỷ lệnh đang ở trạng thái Chờ khớp." };
  }

  order.status = "CANCELLED";

  // Hoàn tiền nếu là MUA
  if (order.side === "BUY") {
    const lockedAmount = order.grossValue + order.fee;
    acc.lockedCash = Math.max(0, acc.lockedCash - lockedAmount);
    acc.availableCash += lockedAmount;
  }

  // Hoàn cổ phiếu nếu là BÁN
  if (order.side === "SELL") {
    const holding = acc.holdings[order.symbol];
    if (holding) {
      holding.availableShares += order.shares;
    }
  }

  savePaperAccount(acc);
  return { success: true, message: "Đã huỷ lệnh thành công. Tiền/Cổ phiếu đã được mở khoá.", account: acc };
}

/**
 * Tự động kiểm tra và khớp các lệnh PENDING khi có giá thị trường mới
 */
export function matchPendingOrdersWithPrices(priceMap: Record<string, number>): number {
  const acc = loadPaperAccount();
  let matchedCount = 0;
  const now = Date.now();

  for (const order of acc.orders) {
    if (order.status !== "PENDING") continue;
    const currentPrice = priceMap[order.symbol];
    if (!currentPrice || currentPrice <= 0) continue;

    if (order.side === "BUY" && order.price >= currentPrice) {
      // Khớp lệnh Mua
      const execPrice = order.price;
      const lockedAmount = order.grossValue + order.fee;
      acc.lockedCash = Math.max(0, acc.lockedCash - lockedAmount);

      const holding = acc.holdings[order.symbol] ?? {
        symbol: order.symbol,
        shares: 0,
        availableShares: 0,
        avgCost: 0,
        totalInvested: 0,
        updatedAt: now,
      };

      const newShares = holding.shares + order.shares;
      const newInvested = holding.totalInvested + order.grossValue;
      const newAvgCost = Math.round(newInvested / newShares);
      const newAvailable = acc.tPlusRule === "T0" ? newShares : holding.availableShares;

      acc.holdings[order.symbol] = {
        symbol: order.symbol,
        shares: newShares,
        availableShares: newAvailable,
        avgCost: newAvgCost,
        totalInvested: newInvested,
        updatedAt: now,
      };

      order.status = "FILLED";
      order.filledAt = now;

      acc.history.unshift({
        id: `trd_${now}_${Math.random().toString(36).slice(2, 7)}`,
        orderId: order.id,
        symbol: order.symbol,
        side: "BUY",
        price: execPrice,
        shares: order.shares,
        grossValue: order.grossValue,
        fee: order.fee,
        tax: 0,
        netValue: lockedAmount,
        realizedPnl: null,
        realizedPnlPct: null,
        executedAt: now,
      });

      matchedCount++;
    } else if (order.side === "SELL" && order.price <= currentPrice) {
      // Khớp lệnh Bán
      const execPrice = order.price;
      const netReceived = order.grossValue - order.fee - order.tax;
      acc.availableCash += netReceived;

      const holding = acc.holdings[order.symbol];
      if (holding) {
        const costOfSold = Math.round(holding.avgCost * order.shares);
        const realizedPnl = order.grossValue - costOfSold - order.fee - order.tax;
        const realizedPnlPct = costOfSold > 0 ? (realizedPnl / costOfSold) * 100 : 0;

        const remainingShares = holding.shares - order.shares;
        if (remainingShares <= 0) {
          delete acc.holdings[order.symbol];
        } else {
          holding.shares = remainingShares;
          holding.totalInvested = Math.max(0, holding.totalInvested - costOfSold);
          holding.updatedAt = now;
        }

        order.status = "FILLED";
        order.filledAt = now;

        acc.history.unshift({
          id: `trd_${now}_${Math.random().toString(36).slice(2, 7)}`,
          orderId: order.id,
          symbol: order.symbol,
          side: "SELL",
          price: execPrice,
          shares: order.shares,
          grossValue: order.grossValue,
          fee: order.fee,
          tax: order.tax,
          netValue: netReceived,
          realizedPnl,
          realizedPnlPct,
          executedAt: now,
        });

        matchedCount++;
      }
    }
  }

  if (matchedCount > 0) {
    savePaperAccount(acc);
  }

  return matchedCount;
}

/**
 * Tính toán số liệu hiệu suất và NAV danh mục dựa trên giá thị trường hiện tại
 */
export function calculatePortfolioMetrics(
  account: PaperAccount,
  priceMap: Record<string, { price: number; changePercent?: number | null }>,
): PortfolioMetrics {
  let stockValue = 0;
  let totalInvested = 0;
  const enrichedHoldings: EnrichedHolding[] = [];

  for (const [sym, holding] of Object.entries(account.holdings)) {
    if (holding.shares <= 0) continue;
    const quote = priceMap[sym];
    const currentPrice = quote?.price && quote.price > 0 ? quote.price : holding.avgCost;
    const marketVal = currentPrice * holding.shares;
    const invested = holding.avgCost * holding.shares;
    const pnl = marketVal - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;

    stockValue += marketVal;
    totalInvested += invested;

    enrichedHoldings.push({
      ...holding,
      currentPrice,
      marketValue: marketVal,
      unrealizedPnl: pnl,
      unrealizedPnlPct: pnlPct,
      weightPct: 0, // sẽ tính sau khi có tổng stockValue + cash
      changePercent: quote?.changePercent ?? null,
    });
  }

  const totalCash = account.availableCash + account.lockedCash;
  const nav = totalCash + stockValue;

  // Tính tỷ trọng từng mã theo NAV
  for (const h of enrichedHoldings) {
    h.weightPct = nav > 0 ? (h.marketValue / nav) * 100 : 0;
  }

  // Sắp xếp danh mục theo giá trị thị trường lớn nhất trước
  enrichedHoldings.sort((a, b) => b.marketValue - a.marketValue);

  const unrealizedPnl = stockValue - totalInvested;
  const unrealizedPnlPct = totalInvested > 0 ? (unrealizedPnl / totalInvested) * 100 : 0;

  // Tổng hợp Lãi/Lỗ đã chốt từ lịch sử
  let realizedPnl = 0;
  let winTrades = 0;
  let lossTrades = 0;

  for (const rec of account.history) {
    if (rec.side === "SELL" && typeof rec.realizedPnl === "number") {
      realizedPnl += rec.realizedPnl;
      if (rec.realizedPnl > 0) winTrades++;
      else if (rec.realizedPnl < 0) lossTrades++;
    }
  }

  const totalTrades = winTrades + lossTrades;
  const winRate = totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0;

  const totalPnl = unrealizedPnl + realizedPnl;
  const totalPnlPct = account.initialCash > 0 ? (totalPnl / account.initialCash) * 100 : 0;

  return {
    initialCash: account.initialCash,
    availableCash: account.availableCash,
    lockedCash: account.lockedCash,
    totalCash,
    stockValue,
    nav,
    totalInvested,
    unrealizedPnl,
    unrealizedPnlPct,
    realizedPnl,
    totalPnl,
    totalPnlPct,
    winTrades,
    lossTrades,
    totalTrades,
    winRate,
    holdings: enrichedHoldings,
  };
}
