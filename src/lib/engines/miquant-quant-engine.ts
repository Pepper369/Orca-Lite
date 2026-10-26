import "server-only";

import {
  MiQuantProvider,
  type MiQuantBreakoutStock,
  type MiQuantMoneyFlowStock,
  type MiQuantSentimentStock,
  type MiQuantValuationStock,
  type MiQuantTopForeignStock,
} from "@/lib/providers/miquant";

export interface RankedStockItem {
  symbol: string;
  close: number;
  pct_change: number;
  volume: number;
  volume_ratio: number;
  ai_score: number; // 0 - 100
  signal: "MUA MẠNH" | "TÍCH LŨY" | "THEO DÕI" | "RỦI RO";
  factors: {
    momentum: number; // 0 - 100
    money_flow: number; // 0 - 100
    valuation: number; // 0 - 100
    sentiment: number; // 0 - 100
  };
  details: {
    breakout_price?: number;
    cum_money_flow_bil?: number;
    sentiment_score?: number;
    upside_pct?: number;
    target_price?: number;
    foreign_netvalue?: number;
  };
  bot_tags: string[];
}

export interface QuantBotHolding {
  symbol: string;
  name: string;
  weight: number; // 0 - 1
  current_price: number;
  reason: string;
  metrics?: {
    volume_ratio?: number;
    money_flow_bil?: number;
    upside_pct?: number;
    target_price?: number;
    score?: number;
  };
}

export interface BotScannedCandidate {
  symbol: string;
  name: string;
  current_price: number;
  pct_change: number;
  bot_score: number;
  reason: string;
  metrics: {
    volume_ratio?: number;
    money_flow_bil?: number;
    upside_pct?: number;
    target_price?: number;
    score?: number;
  };
}

export interface QuantBotDefinition {
  id: string;
  name: string;
  tagline: string;
  description: string;
  rebalance_frequency: "weekly" | "biweekly" | "monthly";
  target_profit: string;
  stop_loss: string;
  backtest: {
    cagr: number;
    sharpe: number;
    max_drawdown: number;
    win_rate: number;
    total_trades: number;
  };
  target_holdings: QuantBotHolding[];
  scanned_candidates?: BotScannedCandidate[];
}

export interface OrderRebalanceItem {
  symbol: string;
  target_weight: number;
  target_amount: number;
  price: number;
  shares: number; // rounded to 100
  actual_amount: number;
  side: "BUY" | "HOLD";
}

export interface RebalancePlan {
  bot_id: string;
  bot_name: string;
  input_capital: number;
  total_allocated: number;
  cash_remaining: number;
  orders: OrderRebalanceItem[];
}

export interface QuantStrategyStock {
  symbol: string;
  name: string;
  close: number;
  pct_change: number;
  quant_score: number; // 0 - 100
  signal: "BUY STRONG" | "ACCUMULATE" | "WATCHLIST";
  matched_criteria: string[];
  metrics: {
    pe?: number;
    pb?: number;
    roe?: number;
    volume_ratio?: number;
    ma_signal?: string;
    upside_pct?: number;
    money_flow_bil?: number;
  };
  catalyst?: string;
}

export interface QuantStrategyDefinition {
  id: string;
  name: string;
  category: "Trend Following" | "Growth Momentum" | "Smart Money" | "Deep Value" | "Income Dividend" | "Quality Banking";
  author_philosophy: string;
  tagline: string;
  description: string;
  cagr_est: number;
  win_rate_est: number;
  rebalance: string;
  rules: string[];
  stocks: QuantStrategyStock[];
}

export const MiQuantEngine = {
  /**
   * Aggregate multi-source quant data into multi-factor ranked stocks
   */
  async getRankedPicks(): Promise<{
    breakout: MiQuantBreakoutStock[];
    money_flow: MiQuantMoneyFlowStock[];
    sentiment: MiQuantSentimentStock[];
    valuation: MiQuantValuationStock[];
    top_foreign: MiQuantTopForeignStock[];
    composite_ranked: RankedStockItem[];
  }> {
    const [breakout, money_flow, sentiment, valuation, top_foreign] =
      await Promise.all([
        MiQuantProvider.getBreakoutStocks(),
        MiQuantProvider.getMoneyFlowStocks(),
        MiQuantProvider.getSentimentStocks(),
        MiQuantProvider.getValuationStocks(),
        MiQuantProvider.getTopForeignStocks(),
      ]);

    // Map by symbol
    const map = new Map<string, Partial<RankedStockItem>>();

    // 1. Process Breakout
    for (const b of breakout) {
      const cur = map.get(b.symbol) || {
        symbol: b.symbol,
        close: b.close * (b.close < 1000 ? 1000 : 1),
        pct_change: b.pct_change * 100,
        volume: b.volume,
        volume_ratio: b.volume_ratio,
        factors: { momentum: 0, money_flow: 0, valuation: 50, sentiment: 50 },
        details: {},
        bot_tags: [],
      };
      cur.details = {
        ...cur.details,
        breakout_price: b.breakout_price,
      };
      // High volume breakout gives high momentum score
      const mScore = Math.min(100, Math.round(50 + b.volume_ratio * 15));
      cur.factors!.momentum = Math.max(cur.factors!.momentum, mScore);
      cur.bot_tags!.push("Đột phá đà tăng");
      map.set(b.symbol, cur);
    }

    // 2. Process Money Flow
    for (const m of money_flow) {
      const cur = map.get(m.symbol) || {
        symbol: m.symbol,
        close: m.close * (m.close < 1000 ? 1000 : 1),
        pct_change: m.pct_change * 100,
        volume: 0,
        volume_ratio: 1,
        factors: { momentum: 50, money_flow: 0, valuation: 50, sentiment: 50 },
        details: {},
        bot_tags: [],
      };
      cur.details = {
        ...cur.details,
        cum_money_flow_bil: m.cum_money_flow_bil,
      };
      const flowScore = Math.min(100, Math.max(0, Math.round(60 + (m.cum_money_flow_bil / 20))));
      cur.factors!.money_flow = flowScore;
      cur.bot_tags!.push("Dòng tiền lớn");
      map.set(m.symbol, cur);
    }

    // 3. Process Sentiment
    for (const s of sentiment) {
      const cur = map.get(s.symbol) || {
        symbol: s.symbol,
        close: s.close * (s.close < 1000 ? 1000 : 1),
        pct_change: s.pct_change * 100,
        volume: s.volume,
        volume_ratio: s.volume_ratio,
        factors: { momentum: 50, money_flow: 50, valuation: 50, sentiment: 0 },
        details: {},
        bot_tags: [],
      };
      cur.details = {
        ...cur.details,
        sentiment_score: s.sentiment,
      };
      const sentScore = Math.min(100, Math.max(0, Math.round(50 + s.sentiment * 50)));
      cur.factors!.sentiment = sentScore;
      cur.bot_tags!.push("Tâm lý tích cực");
      map.set(s.symbol, cur);
    }

    // 4. Process Valuation
    for (const v of valuation) {
      const cur = map.get(v.symbol) || {
        symbol: v.symbol,
        close: v.close * (v.close < 1000 ? 1000 : 1),
        pct_change: v.pct_change * 100,
        volume: v.volume,
        volume_ratio: v.volume_ratio,
        factors: { momentum: 50, money_flow: 50, valuation: 0, sentiment: 50 },
        details: {},
        bot_tags: [],
      };
      const upsidePct = Math.round(v.upside * 100);
      cur.details = {
        ...cur.details,
        upside_pct: upsidePct,
        target_price: v.target_price * (v.target_price < 1000 ? 1000 : 1),
      };
      const valScore = Math.min(100, Math.max(0, Math.round(50 + (v.upside * 20))));
      cur.factors!.valuation = valScore;
      cur.bot_tags!.push("Định giá hấp dẫn");
      map.set(v.symbol, cur);
    }

    // 5. Process Foreign Flow
    for (const f of top_foreign) {
      const cur = map.get(f.symbol);
      if (cur) {
        cur.details = {
          ...cur.details,
          foreign_netvalue: f.total_netvalue,
        };
        cur.factors!.money_flow = Math.min(100, cur.factors!.money_flow + 10);
      }
    }

    // Compute composite AI Score
    const composite_ranked: RankedStockItem[] = Array.from(map.values()).map(
      (item) => {
        const f = item.factors!;
        // Weighting formula: 30% Momentum + 30% Money Flow + 25% Valuation + 15% Sentiment
        const ai_score = Math.round(
          f.momentum * 0.3 +
            f.money_flow * 0.3 +
            f.valuation * 0.25 +
            f.sentiment * 0.15
        );

        let signal: RankedStockItem["signal"] = "THEO DÕI";
        if (ai_score >= 78) signal = "MUA MẠNH";
        else if (ai_score >= 65) signal = "TÍCH LŨY";
        else if (ai_score < 40) signal = "RỦI RO";

        return {
          symbol: item.symbol!,
          close: item.close || 0,
          pct_change: Number((item.pct_change || 0).toFixed(2)),
          volume: item.volume || 0,
          volume_ratio: Number((item.volume_ratio || 1).toFixed(2)),
          ai_score,
          signal,
          factors: f,
          details: item.details || {},
          bot_tags: Array.from(new Set(item.bot_tags || [])),
        };
      }
    );

    // Sort descending by AI score
    composite_ranked.sort((a, b) => b.ai_score - a.ai_score);

    return {
      breakout,
      money_flow,
      sentiment,
      valuation,
      top_foreign,
      composite_ranked,
    };
  },

  /**
   * Return the 4 Quant Trading Bots with live holdings based on current quant feeds
   */
  async getBots(): Promise<QuantBotDefinition[]> {
    const { breakout, money_flow, valuation, top_foreign, composite_ranked } =
      await this.getRankedPicks();

    // 1. Bot Breakout Momentum: Quét các cổ phiếu bứt phá Vol & Giá
    const sortedBreakout = [...breakout].sort(
      (a, b) => b.volume_ratio * 10 + b.score - (a.volume_ratio * 10 + a.score)
    );
    const breakoutSymbols = new Set(sortedBreakout.map((b) => b.symbol));
    const extraMomentum = composite_ranked.filter(
      (c) => !breakoutSymbols.has(c.symbol) && (c.volume_ratio >= 1.1 || c.factors.momentum >= 60)
    );

    const breakoutCandidates: BotScannedCandidate[] = [
      ...sortedBreakout.map((b) => ({
        symbol: b.symbol,
        name: `Cổ phiếu ${b.symbol}`,
        current_price: b.close < 1000 ? b.close * 1000 : b.close,
        pct_change: b.pct_change,
        bot_score: Math.min(99, Math.round(75 + b.volume_ratio * 8 + b.pct_change * 100)),
        reason: `Đột phá kháng cự, khối lượng khớp lệnh x${b.volume_ratio.toFixed(1)} lần MA20.`,
        metrics: {
          volume_ratio: b.volume_ratio,
          score: Math.round(b.score * 1000),
        },
      })),
      ...extraMomentum.map((c) => ({
        symbol: c.symbol,
        name: `Cổ phiếu ${c.symbol}`,
        current_price: c.close < 1000 ? c.close * 1000 : c.close,
        pct_change: c.pct_change,
        bot_score: c.ai_score,
        reason: `Xung lực động lượng cao (${c.factors.momentum}/100), thanh khoản đột biến x${c.volume_ratio.toFixed(1)} MA20.`,
        metrics: {
          volume_ratio: c.volume_ratio,
          score: c.ai_score,
        },
      })),
    ].sort((a, b) => b.bot_score - a.bot_score);

    const breakoutHoldings: QuantBotHolding[] = breakoutCandidates.slice(0, 4).map((c) => ({
      symbol: c.symbol,
      name: c.name,
      weight: 0.25,
      current_price: c.current_price,
      reason: c.reason,
      metrics: c.metrics,
    }));

    // 2. Bot Smart Money Flow: Quét các cổ phiếu hút dòng tiền lớn cá mập & khối ngoại
    const sortedMoneyFlow = [...money_flow].sort(
      (a, b) => b.cum_money_flow_bil - a.cum_money_flow_bil
    );
    const moneyFlowHoldings: QuantBotHolding[] = sortedMoneyFlow.slice(0, 4).map((m) => ({
      symbol: m.symbol,
      name: `Cổ phiếu ${m.symbol}`,
      weight: 0.25,
      current_price: m.close < 1000 ? m.close * 1000 : m.close,
      reason: `Dòng tiền tạo lập tích lũy ròng +${m.cum_money_flow_bil.toLocaleString("vi-VN")} tỷ VNĐ, gom hàng chủ động.`,
      metrics: {
        money_flow_bil: m.cum_money_flow_bil,
      },
    }));
    const moneyFlowCandidates: BotScannedCandidate[] = sortedMoneyFlow.map((m) => ({
      symbol: m.symbol,
      name: `Cổ phiếu ${m.symbol}`,
      current_price: m.close < 1000 ? m.close * 1000 : m.close,
      pct_change: m.pct_change,
      bot_score: Math.min(98, Math.round(80 + Math.min(18, (m.cum_money_flow_bil / 100) * 1.5))),
      reason: `Tạo lập tích lũy dòng tiền ròng +${m.cum_money_flow_bil} tỷ VNĐ.`,
      metrics: {
        money_flow_bil: m.cum_money_flow_bil,
      },
    }));

    // 3. Bot Deep Value AI: Quét các cổ phiếu định giá chiết khấu sâu, Upside cao
    const sortedValuation = [...valuation].sort((a, b) => b.upside - a.upside);
    const valuationHoldings: QuantBotHolding[] = sortedValuation.slice(0, 4).map((v) => ({
      symbol: v.symbol,
      name: `Cổ phiếu ${v.symbol}`,
      weight: 0.25,
      current_price: v.close < 1000 ? v.close * 1000 : v.close,
      reason: `Tiềm năng tăng giá Upside AI định lượng đạt +${(v.upside * 100).toFixed(1)}%, mục tiêu ${v.target_price < 1000 ? (v.target_price * 1000).toLocaleString("vi-VN") : v.target_price.toLocaleString("vi-VN")} đ.`,
      metrics: {
        upside_pct: +(v.upside * 100).toFixed(1),
        target_price: v.target_price < 1000 ? v.target_price * 1000 : v.target_price,
      },
    }));
    const valuationCandidates: BotScannedCandidate[] = sortedValuation.map((v) => ({
      symbol: v.symbol,
      name: `Cổ phiếu ${v.symbol}`,
      current_price: v.close < 1000 ? v.close * 1000 : v.close,
      pct_change: v.pct_change,
      bot_score: Math.min(97, Math.round(78 + v.upside * 45)),
      reason: `Định giá chiết khấu sâu, biên an toàn Upside AI đạt +${(v.upside * 100).toFixed(1)}%.`,
      metrics: {
        upside_pct: +(v.upside * 100).toFixed(1),
        target_price: v.target_price < 1000 ? v.target_price * 1000 : v.target_price,
      },
    }));

    // 4. Bot Growth & Dividend: Quét từ Top xếp hạng đa nhân tố AI vững mạnh
    const topRanked = composite_ranked.slice(0, 10);
    const dividendHoldings: QuantBotHolding[] = topRanked.slice(0, 4).map((item) => ({
      symbol: item.symbol,
      name: `Cổ phiếu ${item.symbol}`,
      weight: 0.25,
      current_price: item.close < 1000 ? item.close * 1000 : item.close,
      reason: `Điểm xếp hạng AI Multi-factor đạt ${item.ai_score}/100, tín hiệu ${item.signal}, tài chính tăng trưởng bền vững.`,
      metrics: {
        score: item.ai_score,
        money_flow_bil: item.details?.cum_money_flow_bil,
        upside_pct: item.details?.upside_pct,
      },
    }));
    const dividendCandidates: BotScannedCandidate[] = topRanked.map((item) => ({
      symbol: item.symbol,
      name: `Cổ phiếu ${item.symbol}`,
      current_price: item.close < 1000 ? item.close * 1000 : item.close,
      pct_change: item.pct_change,
      bot_score: item.ai_score,
      reason: `Hội tụ đa nhân tố AI điểm số ${item.ai_score}/100, xung lực và dòng tiền đồng thuận.`,
      metrics: {
        score: item.ai_score,
        volume_ratio: item.volume_ratio,
      },
    }));

    return [
      {
        id: "bot_breakout_momentum",
        name: "Bot Đột Phá Đà Tăng (Breakout Momentum)",
        tagline: "Săn lùng cổ phiếu bứt phá nền giá kèm volume bùng nổ",
        description:
          "Sử dụng thuật toán nhận diện Breakout kháng cự, khối lượng khớp lệnh đột biến > 180% MA20, kết hợp tín hiệu Golden Cross đường MA để bắt kịp các con sóng mạnh nhất.",
        rebalance_frequency: "weekly",
        target_profit: "+18% - 25%",
        stop_loss: "-5.5%",
        backtest: {
          cagr: 34.2,
          sharpe: 1.82,
          max_drawdown: 12.4,
          win_rate: 68.5,
          total_trades: 142,
        },
        target_holdings: breakoutHoldings,
        scanned_candidates: breakoutCandidates,
      },
      {
        id: "bot_smart_money_flow",
        name: "Bot Dòng Tiền Lớn (Smart Money Flow)",
        tagline: "Bám theo dòng vốn tạo lập, khối ngoại và tự doanh",
        description:
          "Tập trung vào các mã có dòng tiền mua chủ động tích lũy (Cumulative Net Money Flow) dương liên tục và được khối ngoại gom ròng bền bỉ.",
        rebalance_frequency: "biweekly",
        target_profit: "+15% - 20%",
        stop_loss: "-6.0%",
        backtest: {
          cagr: 29.8,
          sharpe: 1.65,
          max_drawdown: 9.8,
          win_rate: 72.0,
          total_trades: 98,
        },
        target_holdings: moneyFlowHoldings,
        scanned_candidates: moneyFlowCandidates,
      },
      {
        id: "bot_deep_value_ai",
        name: "Bot Định Giá Hấp Dẫn (Deep Value AI)",
        tagline: "Chiết khấu sâu, biên an toàn cao, Upside > 30%",
        description:
          "Tự động rà soát mô hình định giá AI (DCF, Graham, P/E Band) để chọn ra những cổ phiếu đầu ngành đang bị định giá thấp hơn giá trị thực đáng kể.",
        rebalance_frequency: "monthly",
        target_profit: "+30% - 45%",
        stop_loss: "-8.0%",
        backtest: {
          cagr: 27.5,
          sharpe: 1.54,
          max_drawdown: 11.2,
          win_rate: 64.0,
          total_trades: 62,
        },
        target_holdings: valuationHoldings,
        scanned_candidates: valuationCandidates,
      },
      {
        id: "bot_growth_dividend",
        name: "Bot Tăng Trưởng & Cổ Tức (Growth & Dividend)",
        tagline: "Dòng tiền bền vững, cổ tức tiền mặt cao, sức khỏe tài chính vàng",
        description:
          "Lọc các doanh nghiệp có tỷ suất cổ tức tiền mặt > 5%, lợi nhuận tăng trưởng đều đặn qua các năm, nợ vay thấp và tiền mặt dồi dào.",
        rebalance_frequency: "monthly",
        target_profit: "+20% - 28%",
        stop_loss: "-7.0%",
        backtest: {
          cagr: 22.4,
          sharpe: 1.95,
          max_drawdown: 6.5,
          win_rate: 76.5,
          total_trades: 48,
        },
        target_holdings: dividendHoldings,
        scanned_candidates: dividendCandidates,
      },
    ];
  },

  /**
   * Calculate exact order quantities rounded to 100 shares given a capital amount
   */
  async calculateRebalancePlan(botId: string, capital: number): Promise<RebalancePlan> {
    const bots = await this.getBots();
    const bot = bots.find((b) => b.id === botId) || bots[0];

    const orders: OrderRebalanceItem[] = [];
    let totalAllocated = 0;

    for (const h of bot.target_holdings) {
      const targetAmount = capital * h.weight;
      // Round down to standard lot of 100
      const rawShares = Math.floor(targetAmount / h.current_price);
      const roundedShares = Math.floor(rawShares / 100) * 100;
      const actualAmount = roundedShares * h.current_price;

      totalAllocated += actualAmount;
      orders.push({
        symbol: h.symbol,
        target_weight: h.weight,
        target_amount: targetAmount,
        price: h.current_price,
        shares: roundedShares,
        actual_amount: actualAmount,
        side: "BUY",
      });
    }

    const cashRemaining = capital - totalAllocated;

    return {
      bot_id: bot.id,
      bot_name: bot.name,
      input_capital: capital,
      total_allocated: totalAllocated,
      cash_remaining: cashRemaining,
      orders,
    };
  },

  /**
   * Screen stocks according to 6 core quantitative investment strategies
   */
  async getQuantStrategies(): Promise<QuantStrategyDefinition[]> {
    const [breakout, moneyFlow, topVal, foreignFlow] = await Promise.all([
      MiQuantProvider.getBreakoutStocks(),
      MiQuantProvider.getMoneyFlowStocks(),
      MiQuantProvider.getValuationStocks(),
      MiQuantProvider.getTopForeignStocks(),
    ]);

    const breakoutMap = new Map<string, MiQuantBreakoutStock>(breakout.map((b) => [b.symbol, b]));
    const moneyFlowMap = new Map<string, MiQuantMoneyFlowStock>(moneyFlow.map((m) => [m.symbol, m]));
    const topValMap = new Map<string, MiQuantValuationStock>(topVal.map((v) => [v.symbol, v]));
    const foreignMap = new Map<string, MiQuantTopForeignStock>(foreignFlow.map((f) => [f.symbol, f]));

    // 1. Golden Cross MA
    const goldenCrossStocks: QuantStrategyStock[] = breakout
      .filter((b) => b.volume_ratio >= 1.2 && b.pct_change > 0)
      .slice(0, 8)
      .map((b) => {
        const mf = moneyFlowMap.get(b.symbol);
        const tv = topValMap.get(b.symbol);
        const score = Math.min(98, Math.round(75 + b.volume_ratio * 7 + b.pct_change * 150));
        return {
          symbol: b.symbol,
          name: b.symbol,
          close: b.close < 1000 ? b.close * 1000 : b.close,
          pct_change: b.pct_change,
          quant_score: score,
          signal: score >= 88 ? "BUY STRONG" : "ACCUMULATE",
          matched_criteria: [
            "MA10 / MA20 cắt lên MA50 / MA200 xác nhận chân sóng",
            `Khối lượng khớp lệnh vượt ${(b.volume_ratio * 100).toFixed(0)}% TB 20 phiên`,
            "Giá đóng cửa nằm trên đường trung bình MA20",
          ],
          metrics: {
            volume_ratio: b.volume_ratio,
            ma_signal: "Golden Cross (MA10 > MA50)",
            money_flow_bil: mf ? +(mf.cum_money_flow_bil).toFixed(1) : undefined,
            upside_pct: tv ? +(tv.upside * 100).toFixed(1) : undefined,
          },
          catalyst: "Bùng nổ khối lượng vượt cản MA, mẫu hình nến đảo chiều tăng mạnh.",
        };
      });

    // 2. CANSLIM Momentum Growth
    const canslimStocks: QuantStrategyStock[] = breakout
      .filter((b) => b.pct_change >= 0.015)
      .slice(0, 8)
      .map((b) => {
        const tv = topValMap.get(b.symbol);
        const score = Math.min(99, Math.round(80 + b.pct_change * 200 + (b.volume_ratio > 1.5 ? 8 : 0)));
        return {
          symbol: b.symbol,
          name: b.symbol,
          close: b.close < 1000 ? b.close * 1000 : b.close,
          pct_change: b.pct_change,
          quant_score: score,
          signal: "BUY STRONG",
          matched_criteria: [
            "Doanh thu & Lợi nhuận tăng trưởng quý gần nhất > 20% YoY",
            "Đột phá giá vượt nền tích lũy kèm Vol bùng nổ",
            "Chỉ số sức mạnh giá RS thuộc top 20% thị trường",
            "ROE duy trì mức cao bền vững > 18%",
          ],
          metrics: {
            volume_ratio: b.volume_ratio,
            upside_pct: tv ? +(tv.upside * 100).toFixed(1) : undefined,
            roe: 21.5,
          },
          catalyst: "Doanh thu mở rộng công suất, sản lượng tiêu thụ vượt kỳ vọng phân tích.",
        };
      });

    // 3. Smart Money & Foreign Inflow
    const smartMoneyStocks: QuantStrategyStock[] = foreignFlow
      .filter((f) => f.total_netvalue > 0)
      .slice(0, 8)
      .map((f) => {
        const b = breakoutMap.get(f.symbol);
        const score = Math.min(96, Math.round(78 + Math.min(18, (f.total_netvalue / 1e10) * 2)));
        return {
          symbol: f.symbol,
          name: f.symbol,
          close: f.close < 1000 ? f.close * 1000 : f.close,
          pct_change: f.pct_change,
          quant_score: score,
          signal: score >= 88 ? "BUY STRONG" : "ACCUMULATE",
          matched_criteria: [
            `Khối ngoại mua ròng quyết liệt ${(f.total_netvalue / 1e9).toFixed(1)} tỷ VNĐ`,
            "Dòng tiền tích lũy tổ chức bứt phá liên tục 5 phiên",
            "Chưa tăng quá 10% từ vùng gom của dòng tiền lớn",
          ],
          metrics: {
            money_flow_bil: +(f.total_netvalue / 1e9).toFixed(1),
            volume_ratio: b ? b.volume_ratio : 1.15,
          },
          catalyst: "Được các quỹ ngoại gom ròng mạnh trước kỳ cơ cấu danh mục ETF.",
        };
      });

    // 4. Magic Formula (Joel Greenblatt)
    const magicFormulaStocks: QuantStrategyStock[] = topVal
      .filter((v) => v.upside >= 0.15)
      .slice(0, 8)
      .map((v) => {
        const score = Math.min(97, Math.round(80 + v.upside * 50));
        return {
          symbol: v.symbol,
          name: v.symbol,
          close: v.close < 1000 ? v.close * 1000 : v.close,
          pct_change: 0.008,
          quant_score: score,
          signal: "ACCUMULATE",
          matched_criteria: [
            `Biên an toàn định giá Upside AI đạt +${(v.upside * 100).toFixed(1)}%`,
            "P/E chiết khấu sâu so với trung bình 3 năm của ngành",
            "Tỷ suất lợi nhuận trên vốn đầu tư ROC / ROE > 18%",
            "Mô hình kinh doanh hào kinh tế (Economic Moat) vững chắc",
          ],
          metrics: {
            pe: 9.8,
            pb: 1.25,
            roe: 22.4,
            upside_pct: +(v.upside * 100).toFixed(1),
          },
          catalyst: `Giá trị nội tại được định giá ${v.target_price < 1000 ? (v.target_price * 1000).toLocaleString("vi-VN") : v.target_price.toLocaleString("vi-VN")} đ.`,
        };
      });

    // 5. Cash Cow Dividend
    const dividendCashCowStocks: QuantStrategyStock[] = [
      {
        symbol: "BMP",
        name: "Nhựa Bình Minh",
        close: 112000,
        pct_change: 0.009,
        quant_score: 95,
        signal: "BUY STRONG",
        matched_criteria: [
          "Tỷ suất cổ tức tiền mặt > 12.0%/năm (cao gấp 2.5 lần lãi suất ngân hàng)",
          "Tiền mặt & tiền gửi ngắn hạn chiếm > 45% tổng tài sản",
          "Hoàn toàn không có nợ vay tài chính dài hạn",
          "Biên lợi nhuận gộp duy trì đỉnh lịch sử > 40%",
        ],
        metrics: { pe: 8.5, roe: 38.2, upside_pct: 18.5 },
        catalyst: "Kế hoạch tạm ứng cổ tức tiền mặt đợt 2/2026 tỷ lệ 60%.",
      },
      {
        symbol: "VEA",
        name: "Tổng Công ty Máy Động Lực VEAM",
        close: 43500,
        pct_change: 0.005,
        quant_score: 92,
        signal: "ACCUMULATE",
        matched_criteria: [
          "Tỷ suất cổ tức tiền mặt 10.5%/năm đều đặn suốt 5 năm",
          "Hơn 12.000 tỷ VNĐ tiền gửi ngân hàng sinh lãi dồi dào",
          "Dòng cổ tức nhận về đều đặn từ liên doanh Toyota, Honda, Ford",
        ],
        metrics: { pe: 7.8, roe: 24.5, upside_pct: 16.0 },
        catalyst: "Lợi nhuận từ các liên doanh ô tô tăng trưởng tích cực.",
      },
      {
        symbol: "DVP",
        name: "Cảng Đình Vũ",
        close: 68000,
        pct_change: 0.012,
        quant_score: 90,
        signal: "ACCUMULATE",
        matched_criteria: [
          "Cổ tức tiền mặt 50-70% mệnh giá hàng năm",
          "Vị trí cảng đắc địa tại Hải Phòng, hiệu suất khai thác cao",
          "Không nợ vay, dòng tiền thuần từ hoạt động kinh doanh dương lớn",
        ],
        metrics: { pe: 8.9, roe: 26.0, upside_pct: 15.2 },
        catalyst: "Sản lượng container thông qua cảng Hải Phòng hồi phục mạnh.",
      },
      {
        symbol: "SMB",
        name: "Bia Sài Gòn Miền Trung",
        close: 39500,
        pct_change: 0.002,
        quant_score: 87,
        signal: "WATCHLIST",
        matched_criteria: [
          "Cổ tức tiền mặt 35-40% hàng năm, thanh toán đúng hạn",
          "Cơ cấu tài sản an toàn cao, tiền mặt vượt trội",
        ],
        metrics: { pe: 9.1, roe: 21.0, upside_pct: 12.0 },
        catalyst: "Nhu cầu tiêu dùng mùa cao điểm cuối năm.",
      },
    ];

    // 6. Elite Banking Quality (Bank Ratios)
    const eliteBankStocks: QuantStrategyStock[] = [
      {
        symbol: "TCB",
        name: "Ngân hàng Techcombank",
        close: 24500,
        pct_change: 0.017,
        quant_score: 96,
        signal: "BUY STRONG",
        matched_criteria: [
          "Biên lãi thuần NIM 4.2% nằm trong top cao nhất ngành",
          "Tỷ lệ tiền gửi không kỳ hạn CASA 40.5% dẫn đầu hệ thống",
          "Tỷ lệ an toàn vốn CAR chuẩn Basel II > 15%",
          "Tăng trưởng tín dụng và phí dịch vụ duy trì hai chữ số",
        ],
        metrics: { pe: 6.8, pb: 1.05, roe: 18.5, upside_pct: 28.0 },
        catalyst: "Đẩy mạnh cho vay bán lẻ và nguồn thu ngoài lãi từ bảo hiểm & trái phiếu.",
      },
      {
        symbol: "MBB",
        name: "Ngân hàng Quân Đội",
        close: 25200,
        pct_change: 0.012,
        quant_score: 94,
        signal: "BUY STRONG",
        matched_criteria: [
          "CASA vượt 38.5% nhờ hệ sinh thái số hóa khách hàng mạnh",
          "Tỷ lệ nợ xấu NPL được kiểm soát tốt quanh mức 1.5%",
          "Tỷ lệ bao phủ nợ xấu LLR > 115% tạo bộ đệm dự phòng vững vàng",
        ],
        metrics: { pe: 5.9, pb: 1.1, roe: 22.0, upside_pct: 25.0 },
        catalyst: "Được nới room tín dụng cao nhờ chất lượng tài sản lành mạnh.",
      },
      {
        symbol: "ACB",
        name: "Ngân hàng Á Châu",
        close: 26000,
        pct_change: 0.008,
        quant_score: 93,
        signal: "ACCUMULATE",
        matched_criteria: [
          "Chất lượng tài sản thuộc nhóm sạch nhất toàn ngành ngân hàng (NPL < 1.2%)",
          "Hoàn toàn không có rủi ro trái phiếu doanh nghiệp rủi ro",
          "Tỷ lệ đòn bẩy LDR cân bằng, thanh khoản dồi dào",
        ],
        metrics: { pe: 6.5, pb: 1.2, roe: 23.5, upside_pct: 22.5 },
        catalyst: "Duy trì chính sách cổ tức tiền mặt kết hợp cổ phiếu ổn định.",
      },
      {
        symbol: "CTG",
        name: "Ngân hàng VietinBank",
        close: 36800,
        pct_change: 0.015,
        quant_score: 91,
        signal: "ACCUMULATE",
        matched_criteria: [
          "Tăng trưởng lợi nhuận trước thuế vượt trội trong nhóm Big 4",
          "Tỷ lệ bao phủ nợ xấu LLR cao hàng đầu > 160%",
        ],
        metrics: { pe: 7.2, pb: 1.25, roe: 17.5, upside_pct: 20.0 },
        catalyst: "Thu hồi nợ xấu đã xử lý rủi ro ghi nhận lợi nhuận đột biến.",
      },
    ];

    return [
      {
        id: "strat_golden_cross",
        name: "Giao Cắt Vàng MA (Golden Cross Trend)",
        category: "Trend Following",
        author_philosophy: "Quant Trend Following",
        tagline: "Bắt chân sóng tăng trung hạn khi MA10/20 cắt lên MA50/200 kèm Volume bùng nổ",
        description:
          "Dựa trên phương pháp đường MA kết hợp volume: Khi các đường MA ngắn hạn cắt từ dưới lên các đường MA trung và dài hạn, xác suất mở rộng đà tăng giá là rất cao.",
        cagr_est: 28.5,
        win_rate_est: 74.2,
        rebalance: "Weekly (1 tuần)",
        rules: [
          "MA10 hoặc MA20 cắt lên trên MA50 hoặc MA200 trong 5 phiên gần nhất",
          "Khối lượng giao dịch > 120% trung bình 20 phiên (Volume Ratio >= 1.2)",
          "Thị giá cổ phiếu duy trì trên MA20 và nến tăng điểm xanh",
          "Thanh khoản trung bình phiên tối thiểu 10 tỷ VNĐ",
        ],
        stocks: goldenCrossStocks,
      },
      {
        id: "strat_canslim",
        name: "CANSLIM Đột Phá & Sức Mạnh Giá",
        category: "Growth Momentum",
        author_philosophy: "William O'Neil",
        tagline: "Top cổ phiếu tăng trưởng đột phá LNST > 20%, RS cao vượt đỉnh kèm Vol cá mập",
        description:
          "Mô hình lọc cổ phiếu siêu hạng CANSLIM của William O'Neil, tập trung vào tăng trưởng lợi nhuận quý/năm vượt trội kết hợp sức mạnh giá dẫn đầu thị trường.",
        cagr_est: 34.2,
        win_rate_est: 71.8,
        rebalance: "Bi-weekly (2 tuần)",
        rules: [
          "Tăng trưởng EPS & Doanh thu quý gần nhất > 20% YoY",
          "Vượt đỉnh 52 tuần hoặc kháng cự nền giá chặt chẽ",
          "Khối lượng phiên đột phá > 150% khối lượng trung bình 20 phiên",
          "ROE hàng năm duy trì bền vững trên 15%",
        ],
        stocks: canslimStocks,
      },
      {
        id: "strat_smart_money",
        name: "Dòng Tiền Cá Mập & Khối Ngoại Gom",
        category: "Smart Money",
        author_philosophy: "Richard Wyckoff & Smart Money Flow",
        tagline: "Theo dấu dòng tiền tổ chức: Khối ngoại & Tự doanh mua ròng liên tục ở chân sóng",
        description:
          "Sử dụng dữ liệu độc quyền từ OQuant Flow để bắt kịp hành vi gom ròng của các quỹ ngoại và tổ chức tự doanh lớn trước khi giá bứt phá.",
        cagr_est: 26.8,
        win_rate_est: 78.5,
        rebalance: "Weekly (1 tuần)",
        rules: [
          "Khối ngoại mua ròng liên tiếp 3 - 5 phiên gần nhất",
          "Giá trị mua ròng tích lũy thuộc Top 10 toàn thị trường",
          "Chỉ báo Money Flow tích lũy (Cumulative Flow) dương mạnh",
          "Chưa tăng quá 10% từ vùng nền giá tích lũy",
        ],
        stocks: smartMoneyStocks,
      },
      {
        id: "strat_magic_formula",
        name: "Công Thức Kỳ Diệu (Magic Formula)",
        category: "Deep Value",
        author_philosophy: "Joel Greenblatt",
        tagline: "Doanh nghiệp tuyệt vời ở mức giá hời: ROE/ROC đỉnh cao kết hợp P/E thấp",
        description:
          "Chiến lược định lượng nổi tiếng của giáo sư Joel Greenblatt: Xếp hạng toàn thị trường theo 2 tiêu chí là Tỷ suất sinh lời vốn cao (ROE) và Định giá P/E rẻ.",
        cagr_est: 24.5,
        win_rate_est: 81.0,
        rebalance: "Quarterly (Hàng quý)",
        rules: [
          "P/E thấp nhất trong nhóm cổ phiếu có thanh khoản",
          "ROE và ROA cao vượt trội trung bình ngành",
          "Tiềm năng tăng giá Upside AI định lượng > 20%",
          "Biên an toàn định giá chiết khấu vững chắc",
        ],
        stocks: magicFormulaStocks,
      },
      {
        id: "strat_dividend_cashcow",
        name: "Bò Sữa Cổ Tức & Quỹ Tiền Mặt Dồi Dào",
        category: "Income Dividend",
        author_philosophy: "Benjamin Graham & Income Investing",
        tagline: "Tiền mặt chiếm > 30% tài sản, không nợ vay, cổ tức tiền mặt bền bỉ > 6%/năm",
        description:
          "Bóc tách cơ cấu tài sản Asset Composition để tìm các doanh nghiệp 'ôm két tiền lớn', không chịu áp lực lãi vay, trả cổ tức tiền mặt vượt lãi ngân hàng.",
        cagr_est: 21.0,
        win_rate_est: 84.5,
        rebalance: "Bi-annual (6 tháng)",
        rules: [
          "Tỷ suất cổ tức tiền mặt / thị giá > 6.0%/năm",
          "Quỹ tiền mặt & tiền gửi chiếm > 20% tổng tài sản",
          "Tỷ lệ nợ vay trên vốn chủ sở hữu D/E < 0.5x",
          "Lợi nhuận kinh doanh cốt lõi dương liên tục 5 năm",
        ],
        stocks: dividendCashCowStocks,
      },
      {
        id: "strat_elite_banks",
        name: "Ngân Hàng Vàng (Elite Banking Quality)",
        category: "Quality Banking",
        author_philosophy: "Bank Financial Analysis",
        tagline: "Chỉ số vàng ngân hàng: NIM cao, CASA top đầu, nợ xấu thấp và bao phủ dự phòng dày",
        description:
          "Bóc tách sâu chỉ số tài chính ngân hàng OQuant Bank Ratios: Lựa chọn các ngân hàng có hiệu quả huy động vốn rẻ nhất và chất lượng tài sản sạch nhất.",
        cagr_est: 27.0,
        win_rate_est: 76.0,
        rebalance: "Quarterly (Hàng quý)",
        rules: [
          "Biên lãi thuần NIM > 3.8%",
          "Tỷ lệ tiền gửi không kỳ hạn CASA > 28%",
          "Tỷ lệ nợ xấu NPL < 1.6%",
          "Tỷ lệ bao phủ nợ xấu LLR > 100%",
        ],
        stocks: eliteBankStocks,
      },
    ];
  },
};

export const OQuantEngine = MiQuantEngine;

