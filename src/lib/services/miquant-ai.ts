/**
 * Miquant AI Chatbot & Financial Intelligence Service for Orca-FA
 * Reverse-engineered from https://app.miquant.vn/chatbot using REA & OpenCLI
 * 
 * Capabilities:
 * 1. MiquantChatbotClient: Authenticated/Session streaming SSE chatbot client (/chatbot/submit, /chatbot/chats, etc.)
 * 2. MiquantFinancialIntelligence: Public AI quantitative analytics (AI Valuation, Catalysts, Risks, Sentiment Timeline, Money Flow)
 * 3. generateMiquantAiAnswer: Comprehensive AI synthesis for Vietnamese stock tickers
 */

export interface MiquantOverviewData {
  symbol: string;
  organname: string;
  comgroupcode: string;
  close: number;
  daily_change: number;
  daily_pct_change: number;
  weekly_change?: number;
  weekly_pct_change?: number;
  pe?: number;
  pe_pct_change?: number;
  pb?: number;
  pb_pct_change?: number;
  technical_perf?: string;
  volatility_perf?: string;
  recommendation?: string;
  ai_url?: string;
  ai_valuation?: number;
  valuation_gap?: number;
  sentiment?: string;
  timestamp?: string;
}

export interface MiquantSourceArticle {
  title: string;
  url: string;
}

export interface MiquantSourceSite {
  domain: string;
  favicon?: string;
  articles: MiquantSourceArticle[];
}

export interface MiquantAnalysisItem {
  description: string;
  sites?: MiquantSourceSite[];
}

export interface MiquantCatalystsResponse {
  symbol: string;
  updatedDate?: string;
  totalCatalysts: number;
  summary: MiquantAnalysisItem[];
}

export interface MiquantRisksResponse {
  symbol: string;
  last_updated?: string;
  total: number;
  summary: MiquantAnalysisItem[];
}

export interface MiquantNewsEvent {
  unique_id: string;
  alert_level: string[];
  event_date: string;
  news_count: number;
  reason_for_alert: string;
  sentiment: string;
  summary: string;
  symbol: string;
  sources: Array<{ title: string; url: string }>;
}

export interface MiquantSentimentScoreResponse {
  timestamp: number[];
  close: Array<number | null>;
  scores: number[];
}

export interface MiquantMoneyFlowResponse {
  timestamp: number[];
  total_net_money_flow: number[];
  cumulative_net_money_flow: number[];
}

export interface MiquantStreamEvent {
  typeResponse: "update_status" | "thinking" | "answer" | "follow_up";
  status?: string;
  detail: {
    id?: string;
    agentId?: string;
    agentName?: string;
    content?: any;
    type?: "text" | "chart" | "citation" | "tool_call";
  };
}

export class MiquantFinancialIntelligence {
  private static readonly API_ROOT = "https://backend.miquant.vn";

  /**
   * Lấy tổng quan định giá AI, khuyến nghị và định lượng cơ bản của cổ phiếu
   */
  static async getOverview(symbol: string): Promise<MiquantOverviewData | null> {
    try {
      const res = await fetch(`${this.API_ROOT}/finance/overview?symbol=${encodeURIComponent(symbol.toUpperCase())}`, {
        headers: { "Accept": "application/json" },
        next: { revalidate: 60 },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.warn(`[Miquant] Error fetching overview for ${symbol}:`, err);
      return null;
    }
  }

  /**
   * Lấy danh sách chất xúc tác tăng trưởng (Catalysts) được AI tổng hợp từ BCTC & báo cáo phân tích
   */
  static async getCatalysts(symbol: string): Promise<MiquantCatalystsResponse | null> {
    try {
      const res = await fetch(`${this.API_ROOT}/api/v1/stock/catalyst?symbol=${encodeURIComponent(symbol.toUpperCase())}`, {
        headers: { "Accept": "application/json" },
        next: { revalidate: 300 },
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json?.data ?? null;
    } catch (err) {
      console.warn(`[Miquant] Error fetching catalysts for ${symbol}:`, err);
      return null;
    }
  }

  /**
   * Lấy danh sách rủi ro hoạt động & định giá (Risks) được AI bóc tách
   */
  static async getRisks(symbol: string): Promise<MiquantRisksResponse | null> {
    try {
      const res = await fetch(`${this.API_ROOT}/api/v1/stock/risk?symbol=${encodeURIComponent(symbol.toUpperCase())}`, {
        headers: { "Accept": "application/json" },
        next: { revalidate: 300 },
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json?.data ?? null;
    } catch (err) {
      console.warn(`[Miquant] Error fetching risks for ${symbol}:`, err);
      return null;
    }
  }

  /**
   * Lấy dòng sự kiện tin tức AI và cảnh báo định lượng (News Sentiment Timeline)
   */
  static async getNewsTimeline(symbol: string, limit = 5): Promise<MiquantNewsEvent[]> {
    try {
      const res = await fetch(
        `${this.API_ROOT}/api/v1/stock/sentiment/news-timeline?symbol=${encodeURIComponent(symbol.toUpperCase())}&limit=${limit}`,
        {
          headers: { "Accept": "application/json" },
          next: { revalidate: 180 },
        }
      );
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json?.data) ? json.data : [];
    } catch (err) {
      console.warn(`[Miquant] Error fetching news timeline for ${symbol}:`, err);
      return [];
    }
  }

  /**
   * Lấy lịch sử điểm cảm xúc thị trường (Sentiment Score) kết hợp biến động giá đóng cửa
   */
  static async getSentimentScores(symbol: string, fromDate?: string, toDate?: string): Promise<MiquantSentimentScoreResponse | null> {
    try {
      const to = toDate || new Date().toISOString();
      const from = fromDate || new Date(Date.now() - 90 * 86400000).toISOString();
      const res = await fetch(
        `${this.API_ROOT}/api/v1/stock/sentiment/score?symbol=${encodeURIComponent(symbol.toUpperCase())}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        {
          headers: { "Accept": "application/json" },
          next: { revalidate: 300 },
        }
      );
      if (!res.ok) return null;
      const json = await res.json();
      return json?.data ?? null;
    } catch (err) {
      console.warn(`[Miquant] Error fetching sentiment scores for ${symbol}:`, err);
      return null;
    }
  }

  /**
   * Lấy dòng tiền ròng định lượng (Money Flow & Cumulative Net Flow)
   */
  static async getMoneyFlow(symbol: string, fromDate?: string, toDate?: string): Promise<MiquantMoneyFlowResponse | null> {
    try {
      const to = toDate || new Date().toISOString();
      const from = fromDate || new Date(Date.now() - 30 * 86400000).toISOString();
      const res = await fetch(
        `${this.API_ROOT}/api/v1/stock/money-flow?symbol=${encodeURIComponent(symbol.toUpperCase())}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        {
          headers: { "Accept": "application/json" },
          next: { revalidate: 300 },
        }
      );
      if (!res.ok) return null;
      const json = await res.json();
      return json?.data ?? null;
    } catch (err) {
      console.warn(`[Miquant] Error fetching money flow for ${symbol}:`, err);
      return null;
    }
  }

  /**
   * Lấy thông tin các chỉ số chứng khoán chính (VN-Index, UPCoM-Index)
   */
  static async getMarketIndexes(): Promise<any[]> {
    try {
      const res = await fetch(`${this.API_ROOT}/finance/indexes`, {
        headers: { "Accept": "application/json" },
        next: { revalidate: 60 },
      });
      if (!res.ok) return [];
      const json = await res.json();
      return json?.data ?? [];
    } catch (err) {
      console.warn("[Miquant] Error fetching market indexes:", err);
      return [];
    }
  }

  /**
   * TỔNG HỢP CÂU TRẢ LỜI AI MIQUANT (Miquant AI Answer Generator)
   * Tạo bản tin phân tích tài chính hoàn chỉnh theo định dạng chuyên gia của MIQuant AI
   */
  static async generateMiquantAiAnswer(symbol: string): Promise<{
    symbol: string;
    answer: string;
    overview: MiquantOverviewData | null;
    catalysts: MiquantCatalystsResponse | null;
    risks: MiquantRisksResponse | null;
    newsTimeline: MiquantNewsEvent[];
    citations: Array<{ title: string; url: string; domain?: string }>;
    followUps: string[];
  }> {
    const sym = symbol.toUpperCase();
    const [overview, catalysts, risks, newsTimeline] = await Promise.all([
      this.getOverview(sym),
      this.getCatalysts(sym),
      this.getRisks(sym),
      this.getNewsTimeline(sym, 3),
    ]);

    const citationsMap = new Map<string, { title: string; url: string; domain?: string }>();

    // Trích xuất trích dẫn nguồn
    if (catalysts?.summary) {
      for (const cat of catalysts.summary) {
        if (cat.sites) {
          for (const site of cat.sites) {
            for (const art of site.articles) {
              if (art.url && !citationsMap.has(art.url)) {
                citationsMap.set(art.url, { title: art.title || art.url, url: art.url, domain: site.domain });
              }
            }
          }
        }
      }
    }

    if (risks?.summary) {
      for (const rsk of risks.summary) {
        if (rsk.sites) {
          for (const site of rsk.sites) {
            for (const art of site.articles) {
              if (art.url && !citationsMap.has(art.url)) {
                citationsMap.set(art.url, { title: art.title || art.url, url: art.url, domain: site.domain });
              }
            }
          }
        }
      }
    }

    if (newsTimeline) {
      for (const item of newsTimeline) {
        for (const src of item.sources || []) {
          if (src.url && !citationsMap.has(src.url)) {
            citationsMap.set(src.url, { title: src.title, url: src.url });
          }
        }
      }
    }

    const citations = Array.from(citationsMap.values());

    // Biên soạn Markdown Narrative theo phong cách MIQuant Chatbot
    const sections: string[] = [];

    // Header & Tóm tắt định lượng
    if (overview) {
      const upside = overview.valuation_gap ? (overview.valuation_gap * 100).toFixed(1) : null;
      const upsideText = upside ? ` (Tiềm năng tăng giá: +${upside}%)` : "";
      const recoBadge = overview.recommendation ? `【${overview.recommendation.toUpperCase()}】` : "";
      
      sections.push(
        `### 🤖 MIQUANT AI: BÁO CÁO PHÂN TÍCH & ĐỊNH LƯỢNG ${overview.symbol} (${overview.organname || sym})\n` +
        `• **Thị giá hiện tại**: **${overview.close?.toLocaleString("vi-VN")} đ** (${overview.daily_pct_change >= 0 ? "+" : ""}${overview.daily_pct_change}%)\n` +
        `• **Khuyến nghị AI**: **${recoBadge}** | Tâm lý thị trường: **${overview.sentiment || "Trung lập"}**\n` +
        (overview.ai_valuation ? `• **Giá trị hợp lý AI (Target Price)**: **${overview.ai_valuation.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} đ**${upsideText}\n` : "") +
        `• **Chỉ số cơ bản**: P/E: **${overview.pe ?? "—"}** | P/B: **${overview.pb ?? "—"}** | Đánh giá kỹ thuật: **${overview.technical_perf || "—"}**\n` +
        (overview.ai_url ? `• 📄 [Tải Báo cáo Định giá Chi tiết PDF](${overview.ai_url})` : "")
      );
    } else {
      sections.push(`### 🤖 MIQUANT AI: PHÂN TÍCH ĐỊNH LƯỢNG ${sym}`);
    }

    // Catalysts (Động lực tăng trưởng)
    if (catalysts && catalysts.summary && catalysts.summary.length > 0) {
      const catLines = catalysts.summary.map((c, i) => `${i + 1}. ${c.description}`);
      sections.push(`#### 🚀 ĐỘNG LỰC TĂNG TRƯỞNG & CHẤT XÚC TÁC (CATALYSTS)\n${catLines.join("\n\n")}`);
    }

    // Risks (Rủi ro trọng yếu)
    if (risks && risks.summary && risks.summary.length > 0) {
      const riskLines = risks.summary.map((r, i) => `${i + 1}. ${r.description}`);
      sections.push(`#### ⚠️ RỦI RO HOẠT ĐỘNG & ĐỊNH GIÁ (RISKS)\n${riskLines.join("\n\n")}`);
    }

    // News Timeline Alerts
    if (newsTimeline && newsTimeline.length > 0) {
      const alertLines = newsTimeline.map((item) => {
        const dateStr = item.event_date ? new Date(item.event_date).toLocaleDateString("vi-VN") : "";
        const badges = item.alert_level?.join(" · ") || "Tin tức";
        return `• **[${badges}] (${dateStr})**: ${item.summary || item.reason_for_alert}`;
      });
      sections.push(`#### 📰 CẢNH BÁO TIN TỨC & DÒNG TIỀN GẦN NHẤT\n${alertLines.join("\n")}`);
    }

    // Danh mục nguồn dẫn chứng (Citations)
    if (citations.length > 0) {
      const citeLines = citations.slice(0, 5).map((c, idx) => `[${idx + 1}] [${c.title}](${c.url})`);
      sections.push(`#### 📚 NGUỒN TÀI LIỆU & BÁO CÁO PHÂN TÍCH THẨM ĐỊNH\n${citeLines.join("\n")}`);
    }

    const followUps = [
      `So sánh định giá giữa ${sym} và cổ phiếu đầu ngành cùng kỳ`,
      `Bóc tách dòng tiền cá mập và tự doanh tại ${sym} trong 10 phiên gần nhất`,
      `Phân tích rủi ro chi tiết của ${sym} theo chuẩn MIQuant Expert`,
      `Triển vọng biên lợi nhuận của ${sym} trong quý tới`
    ];

    return {
      symbol: sym,
      answer: sections.join("\n\n---\n\n"),
      overview,
      catalysts,
      risks,
      newsTimeline,
      citations,
      followUps,
    };
  }
}

/**
 * MiquantChatbotClient
 * Kết nối phiên trò chuyện streaming và quản lý hội thoại với hệ thống multi-agent MIQuant
 */
export class MiquantChatbotClient {
  private apiRoot = "https://backend.miquant.vn";

  constructor(private cookieOrToken?: string) {
    this.cookieOrToken = cookieOrToken || process.env.MIQUANT_COOKIE || process.env.MIQUANT_SESSION_TOKEN;
  }

  /**
   * Tạo phiên hội thoại mới
   */
  async createChat(agentId = "phin_agent"): Promise<{ chat_his_id: string }> {
    const res = await fetch(`${this.apiRoot}/chatbot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...(this.cookieOrToken ? { "Cookie": this.cookieOrToken } : {}),
      },
      body: JSON.stringify({ agent_id: agentId }),
    });

    if (!res.ok) {
      throw new Error(`Failed to create chat: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  /**
   * Stream câu trả lời qua Server-Sent Events (SSE)
   */
  async streamMessage(params: {
    message: string;
    agentId?: string;
    chatHisId?: string;
    toggle?: string;
    onChunk?: (event: MiquantStreamEvent) => void;
    onTextDelta?: (text: string) => void;
  }): Promise<{ fullText: string; charts?: any; citations?: any[]; followUps?: string[] }> {
    const agentId = params.agentId || "phin_agent";
    const chatHisId = params.chatHisId || (await this.createChat(agentId)).chat_his_id;

    const res = await fetch(`${this.apiRoot}/chatbot/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        ...(this.cookieOrToken ? { "Cookie": this.cookieOrToken } : {}),
      },
      body: JSON.stringify({
        agent_id: agentId,
        toggle: params.toggle || "",
        message: params.message,
        context: { screener_id: null, topic_id: null },
        chat_his_id: chatHisId,
        attachments: [],
      }),
    });

    if (!res.ok) {
      throw new Error(`Chat stream failed with status ${res.status}: ${res.statusText}`);
    }

    if (!res.body) {
      throw new Error("No response body available for streaming");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let fullText = "";
    let charts: any = null;
    let citations: any[] = [];
    let followUps: string[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && trimmed.startsWith("data:")) {
          try {
            const rawData = trimmed.replace(/^data:\s*/, "").trim();
            if (!rawData) continue;
            const parsed = JSON.parse(rawData) as MiquantStreamEvent;

            params.onChunk?.(parsed);

            if (parsed.typeResponse === "answer" && parsed.detail?.type === "text" && parsed.detail.content) {
              fullText += parsed.detail.content;
              params.onTextDelta?.(parsed.detail.content);
            }

            if (parsed.typeResponse === "answer" && parsed.detail?.type === "chart") {
              charts = parsed.detail.content;
            }

            if (parsed.typeResponse === "answer" && parsed.detail?.type === "citation") {
              citations.push(parsed.detail.content);
            }

            if (parsed.typeResponse === "follow_up" && Array.isArray(parsed.detail?.content)) {
              followUps = parsed.detail.content;
            }
          } catch (parseErr) {
            // Ignore partial SSE chunk parse error
          }
        }
      }
    }

    return { fullText, charts, citations, followUps };
  }
}

