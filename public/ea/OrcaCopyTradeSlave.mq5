//+------------------------------------------------------------------+
//|                                          OrcaCopyTradeSlave.mq5  |
//|                                   Orca Quant Auto-Trade Bridge   |
//|           Supports Exness & XM MT5 (Authenticated Bearer Token)  |
//|    v2.10: Limit Pullback Engine + TP1 Partial Close + BE Sync    |
//+------------------------------------------------------------------+
#property copyright "Orca Financial Quant"
#property link      "https://orca-lite.local"
#property version   "2.10"
#property strict

input string InpServerUrl           = "http://127.0.0.1:3000/api/v1/copytrade/ea-poll";
input string InpAckUrl              = "http://127.0.0.1:3000/api/v1/copytrade/ea-ack";
input string InpEaBearerToken       = "";            // Dán Bearer Token lấy 1 lần từ /copytrade
input double InpRiskMultiplier      = 1.0;           // Hệ số lot (0.5x | 1.0x | 2.0x)
input int    InpMaxSlippagePoints   = 25;            // Độ trượt giá tối đa cho phép (points)
input double InpMaxSpreadPips       = 2.8;           // Chặn vào lệnh nếu spread XM/Exness giãn quá cao
input bool   InpAutoPartialCloseTp1 = true;          // Tự động chốt 50% khối lượng khi đạt TP1
input bool   InpUseAutoBreakeven    = true;          // Tự động dời SL về Entry (+1 point) khi đạt TP1
input int    InpPollIntervalSec     = 3;             // Chu kỳ poll (giây)
input ulong  InpMagicNumber         = 889900;        // Magic Number định danh lệnh Orca

string g_lastProcessedTicket = "";

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   if(StringLen(InpEaBearerToken) < 10)
   {
      Print("⚠️ [Orca-EA] Vui lòng nhập InpEaBearerToken hợp lệ từ trang /copytrade!");
   }
   EventSetTimer(MathMax(1, InpPollIntervalSec));
   Print("🐋 [Orca-EA v2.10] Initialized | Server=", InpServerUrl, " | LimitPullback=ACTIVE | TP1Close50%=", InpAutoPartialCloseTp1);
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("🛑 [Orca-EA v2.10] Stopped. Reason=", reason);
}

void OnTimer()
{
   PollSignalFromOrca();
   if(InpUseAutoBreakeven || InpAutoPartialCloseTp1)
   {
      CheckAndApplyBreakeven();
   }
}

//+------------------------------------------------------------------+
//| Minimal JSON field extractors (zero external dependencies)       |
//+------------------------------------------------------------------+
string JsonGetString(const string &json, const string key)
{
   string pattern = "\"" + key + "\":\"";
   int start = StringFind(json, pattern);
   if(start < 0) return "";
   start += StringLen(pattern);
   int end = StringFind(json, "\"", start);
   if(end < 0) return "";
   return StringSubstr(json, start, end - start);
}

double JsonGetNumber(const string &json, const string key)
{
   string pattern = "\"" + key + "\":";
   int start = StringFind(json, pattern);
   if(start < 0) return 0.0;
   start += StringLen(pattern);
   int len = StringLen(json);
   int end = start;
   while(end < len)
   {
      ushort ch = StringGetCharacter(json, end);
      if(ch == ',' || ch == '}' || ch == ' ') break;
      end++;
   }
   string raw = StringSubstr(json, start, end - start);
   return StringToDouble(raw);
}

bool JsonGetBool(const string &json, const string key)
{
   string pattern = "\"" + key + "\":true";
   return StringFind(json, pattern) >= 0;
}

//+------------------------------------------------------------------+
//| Map symbol for Exness/XM suffixes (e.g. EURUSD -> EURUSDm)       |
//+------------------------------------------------------------------+
string ResolveBrokerSymbol(string baseSymbol)
{
   if(SymbolSelect(baseSymbol, true)) return baseSymbol;
   string suffixes[] = {"m", ".m", "c", ".raw", ".pro", "_SB", ".r"};
   for(int i = 0; i < ArraySize(suffixes); i++)
   {
      string candidate = baseSymbol + suffixes[i];
      if(SymbolSelect(candidate, true)) return candidate;
   }
   return baseSymbol;
}

//+------------------------------------------------------------------+
//| Normalize Lot size to Broker VOLUME_MIN / VOLUME_MAX / VOLUME_STEP|
//+------------------------------------------------------------------+
double NormalizeLotSize(const string symbol, double rawLots)
{
   double minLot  = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double maxLot  = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
   double stepLot = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
   if(minLot <= 0) minLot = 0.01;
   if(stepLot <= 0) stepLot = 0.01;
   double scaled = rawLots * InpRiskMultiplier;
   double floored = MathFloor((scaled + 1e-9) / stepLot) * stepLot;
   if(floored < minLot) floored = minLot;
   if(maxLot > 0 && floored > maxLot) floored = maxLot;
   return NormalizeDouble(floored, 2);
}

//+------------------------------------------------------------------+
//| Acknowledge Order execution status back to Orca Server           |
//+------------------------------------------------------------------+
void SendAckToOrca(string ticketId, ulong mt5Ticket, string status, double execPrice, double lots, string msg)
{
   if(StringLen(InpAckUrl) == 0 || StringLen(InpEaBearerToken) == 0) return;

   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   string payload = StringFormat(
      "{\"ticketId\":\"%s\",\"mt5Ticket\":\"%I64u\",\"status\":\"%s\",\"executionPrice\":%.6f,\"lots\":%.2f,\"balanceUsd\":%.2f,\"message\":\"%s\"}",
      ticketId, mt5Ticket, status, execPrice, lots, balance, msg
   );

   char postData[];
   char result[];
   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + InpEaBearerToken + "\r\n";
   string resultHeaders;
   StringToCharArray(payload, postData, 0, StringLen(payload));
   WebRequest("POST", InpAckUrl, headers, 3000, postData, result, resultHeaders);
}

//+------------------------------------------------------------------+
//| Poll authenticated Orca Server and execute MT5 OrderSend         |
//+------------------------------------------------------------------+
void PollSignalFromOrca()
{
   if(StringLen(InpEaBearerToken) < 8) return;

   char postData[];
   char result[];
   string headers = "Authorization: Bearer " + InpEaBearerToken + "\r\n";

   // Reverse Price Bridge: Attach sub-second broker quote telemetry so server matches broker prices
   string curChartSym = ResolveBrokerSymbol(_Symbol);
   double liveChartBid = SymbolInfoDouble(curChartSym, SYMBOL_BID);
   double liveChartAsk = SymbolInfoDouble(curChartSym, SYMBOL_ASK);
   if(liveChartBid > 0 && liveChartAsk > 0)
   {
      headers += "x-orca-broker-tick: " + curChartSym + "," + DoubleToString(liveChartBid, _Digits) + "," + DoubleToString(liveChartAsk, _Digits) + "\r\n";
   }

   string resultHeaders;
   int res = WebRequest("GET", InpServerUrl, headers, 3500, postData, result, resultHeaders);
   if(res != 200)
   {
      if(res == 401) Print("🔒 [Orca-EA] 401 Unauthorized — Kiểm tra lại InpEaBearerToken!");
      else if(res == -1) Print("⚠️ [Orca-EA] WebRequest bị chặn. Thêm URL vào Tools -> Options -> Expert Advisors -> Allow WebRequest!");
      return;
   }

   string json = CharArrayToString(result);
   if(!JsonGetBool(json, "hasSignal")) return;

   string ticketId  = JsonGetString(json, "ticketId");
   string rawSymbol = JsonGetString(json, "symbol");
   string direction = JsonGetString(json, "direction");
   string entryMode = JsonGetString(json, "entryMode");
   double entry     = JsonGetNumber(json, "entry");
   double sl        = JsonGetNumber(json, "stopLoss");
   double tp1       = JsonGetNumber(json, "takeProfit1");
   double tp2       = JsonGetNumber(json, "takeProfit2");
   double tp3       = JsonGetNumber(json, "takeProfit3");
   double rawLots   = JsonGetNumber(json, "recommendedLots");
   double finalTp   = (tp2 > 0) ? tp2 : ((tp1 > 0) ? tp1 : 0.0);

   if(ticketId == "" || ticketId == g_lastProcessedTicket) return;
   if(GlobalVariableCheck("ORCA_DONE_" + ticketId)) return;

   string symbol = ResolveBrokerSymbol(rawSymbol);
   if(!SymbolInfoInteger(symbol, SYMBOL_SELECT))
   {
      SendAckToOrca(ticketId, 0, "REJECTED", entry, 0, "Symbol not found on broker: " + symbol);
      g_lastProcessedTicket = ticketId;
      return;
   }

   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
   double pipFactor = (digits == 3 || digits == 5) ? 10.0 : 1.0;
   double spreadPoints = (double)SymbolInfoInteger(symbol, SYMBOL_SPREAD);
   double spreadPips = spreadPoints / pipFactor;

   if(spreadPips > InpMaxSpreadPips)
   {
      string err = StringFormat("Spread %.2f pips > Max %.2f pips", spreadPips, InpMaxSpreadPips);
      Print("🛡️ [Orca-EA] Skipped ", symbol, ": ", err);
      SendAckToOrca(ticketId, 0, "REJECTED", entry, 0, err);
      g_lastProcessedTicket = ticketId;
      return;
   }

   double lots = NormalizeLotSize(symbol, rawLots);
   double ask  = SymbolInfoDouble(symbol, SYMBOL_ASK);
   double bid  = SymbolInfoDouble(symbol, SYMBOL_BID);

   MqlTradeRequest req;
   MqlTradeResult  tradeRes;
   ZeroMemory(req);
   ZeroMemory(tradeRes);

   req.symbol    = symbol;
   req.volume    = lots;
   req.sl        = (sl > 0) ? NormalizeDouble(sl, digits) : 0.0;
   req.tp        = (finalTp > 0) ? NormalizeDouble(finalTp, digits) : 0.0;
   req.deviation = InpMaxSlippagePoints;
   req.magic     = InpMagicNumber;
   req.comment   = "Orca_" + ticketId;

   // Exness/XM Raw & Standard filling policy compatibility
   long fillingMode = SymbolInfoInteger(symbol, SYMBOL_FILLING_MODE);
   if((fillingMode & SYMBOL_FILLING_FOK) != 0)      req.type_filling = ORDER_FILLING_FOK;
   else if((fillingMode & SYMBOL_FILLING_IOC) != 0) req.type_filling = ORDER_FILLING_IOC;
   else                                             req.type_filling = ORDER_FILLING_RETURN;

   bool isLimitMode = (entryMode == "LIMIT_PULLBACK") && (entry > 0);

   if(isLimitMode)
   {
      if(direction == "BUY")
      {
         if(ask > entry)
         {
            // Pending Buy Limit at discount price
            req.action    = TRADE_ACTION_PENDING;
            req.type      = ORDER_TYPE_BUY_LIMIT;
            req.price     = NormalizeDouble(entry, digits);
            req.type_time = ORDER_TIME_GTC;
         }
         else
         {
            // Current Ask already reached or dipped slightly below entry
            if(sl > 0 && ask <= sl)
            {
               string err = "Price already below SL, setup invalidated";
               Print("🛡️ [Orca-EA] Skipped ", symbol, ": ", err);
               SendAckToOrca(ticketId, 0, "REJECTED", ask, lots, err);
               g_lastProcessedTicket = ticketId;
               return;
            }
            // Execute Market DEAL at better discount price
            req.action = TRADE_ACTION_DEAL;
            req.type   = ORDER_TYPE_BUY;
            req.price  = NormalizeDouble(ask, digits);
         }
      }
      else // SELL
      {
         if(bid < entry)
         {
            // Pending Sell Limit at premium price
            req.action    = TRADE_ACTION_PENDING;
            req.type      = ORDER_TYPE_SELL_LIMIT;
            req.price     = NormalizeDouble(entry, digits);
            req.type_time = ORDER_TIME_GTC;
         }
         else
         {
            // Current Bid already reached or rallied slightly above entry
            if(sl > 0 && bid >= sl)
            {
               string err = "Price already above SL, setup invalidated";
               Print("🛡️ [Orca-EA] Skipped ", symbol, ": ", err);
               SendAckToOrca(ticketId, 0, "REJECTED", bid, lots, err);
               g_lastProcessedTicket = ticketId;
               return;
            }
            // Execute Market DEAL at better premium price
            req.action = TRADE_ACTION_DEAL;
            req.type   = ORDER_TYPE_SELL;
            req.price  = NormalizeDouble(bid, digits);
         }
      }
   }
   else
   {
      // MARKET_CONFIRMED: Instant execution with slippage protection
      double mktPrice = (direction == "BUY") ? ask : bid;
      if(entry > 0)
      {
         double slipDist = MathAbs(mktPrice - entry) / (pipFactor * point);
         if(slipDist > (double)InpMaxSlippagePoints / pipFactor)
         {
            string err = StringFormat("Market slip %.1f pips > Max %.1f pips", slipDist, (double)InpMaxSlippagePoints / pipFactor);
            Print("🛡️ [Orca-EA] Slippage rejected ", symbol, ": ", err);
            SendAckToOrca(ticketId, 0, "REJECTED", mktPrice, lots, err);
            g_lastProcessedTicket = ticketId;
            return;
         }
      }
      req.action = TRADE_ACTION_DEAL;
      req.type   = (direction == "BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
      req.price  = NormalizeDouble(mktPrice, digits);
   }

   bool sent = OrderSend(req, tradeRes);
   g_lastProcessedTicket = ticketId;
   GlobalVariableSet("ORCA_DONE_" + ticketId, (double)TimeCurrent());

   if(sent && (tradeRes.retcode == TRADE_RETCODE_DONE || tradeRes.retcode == TRADE_RETCODE_PLACED))
   {
      ulong orderRef = (tradeRes.order > 0) ? tradeRes.order : tradeRes.deal;
      Print("✅ [Orca-EA] Sent ", direction, " ", lots, " ", symbol, " @ ", req.price, " | RetCode=", tradeRes.retcode, " | Ref #", orderRef);

      // Save ticket metadata for TP1 partial close & Breakeven tracking
      if(tp1 > 0)     GlobalVariableSet("ORCA_TP1_" + ticketId, tp1);
      if(finalTp > 0) GlobalVariableSet("ORCA_FINALTP_" + ticketId, finalTp);
      if(entry > 0)   GlobalVariableSet("ORCA_ENTRY_" + ticketId, entry);

      string statusMsg = (req.action == TRADE_ACTION_PENDING) ? "PENDING_LIMIT_PLACED" : "FILLED";
      SendAckToOrca(ticketId, orderRef, statusMsg, tradeRes.price > 0 ? tradeRes.price : req.price, lots, "MT5 OrderSend OK");
   }
   else
   {
      string failMsg = StringFormat("OrderSend failed retcode=%d (%s)", tradeRes.retcode, tradeRes.comment);
      Print("❌ [Orca-EA] ", failMsg);
      SendAckToOrca(ticketId, 0, "REJECTED", req.price, lots, failMsg);
   }
}

//+------------------------------------------------------------------+
//| Auto-Partial Close 50% at TP1 & Move SL to Breakeven (+1 point)  |
//+------------------------------------------------------------------+
void CheckAndApplyBreakeven()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) != (long)InpMagicNumber) continue;

      string symbol    = PositionGetString(POSITION_SYMBOL);
      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double currentSL = PositionGetDouble(POSITION_SL);
      double currentTP = PositionGetDouble(POSITION_TP);
      double currentVol= PositionGetDouble(POSITION_VOLUME);
      long   type      = PositionGetInteger(POSITION_TYPE);
      string comment   = PositionGetString(POSITION_COMMENT);

      int digits   = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
      double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
      double currentPrice = (type == POSITION_TYPE_BUY)
         ? SymbolInfoDouble(symbol, SYMBOL_BID)
         : SymbolInfoDouble(symbol, SYMBOL_ASK);

      // Extract ticketId from comment ("Orca_" + ticketId)
      string ticketId = "";
      if(StringFind(comment, "Orca_") == 0)
      {
         ticketId = StringSubstr(comment, 5);
      }

      double tp1 = 0.0;
      if(ticketId != "" && GlobalVariableCheck("ORCA_TP1_" + ticketId))
      {
         tp1 = GlobalVariableGet("ORCA_TP1_" + ticketId);
      }
      else if(currentTP > 0)
      {
         // Fallback: estimate TP1 at 50% distance to final TP
         tp1 = (type == POSITION_TYPE_BUY)
            ? openPrice + (currentTP - openPrice) * 0.50
            : openPrice - (openPrice - currentTP) * 0.50;
      }

      if(tp1 <= 0) continue;

      bool tp1Reached = (type == POSITION_TYPE_BUY) ? (currentPrice >= tp1) : (currentPrice <= tp1);
      string doneKey  = "ORCA_TP1_DONE_" + (string)ticket;

      if(tp1Reached && !GlobalVariableCheck(doneKey))
      {
         Print("🎯 [Orca-EA] TP1 Reached for position #", ticket, " (", symbol, ") @ ", currentPrice, " | TP1 Target=", tp1);

         // 1. Partial close 50% position
         if(InpAutoPartialCloseTp1)
         {
            double minLot  = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
            if(minLot <= 0) minLot = 0.01;
            double stepLot = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
            if(stepLot <= 0) stepLot = 0.01;
            double halfLots = MathFloor(((currentVol * 0.50) + 1e-9) / stepLot) * stepLot;
            halfLots = NormalizeDouble(halfLots, 2);

            if(halfLots >= minLot && halfLots < currentVol)
            {
               MqlTradeRequest closeReq;
               MqlTradeResult  closeRes;
               ZeroMemory(closeReq);
               ZeroMemory(closeRes);
               closeReq.action   = TRADE_ACTION_DEAL;
               closeReq.position = ticket;
               closeReq.symbol   = symbol;
               closeReq.volume   = halfLots;
               closeReq.type     = (type == POSITION_TYPE_BUY) ? ORDER_TYPE_SELL : ORDER_TYPE_BUY;
               closeReq.price    = (type == POSITION_TYPE_BUY) ? SymbolInfoDouble(symbol, SYMBOL_BID) : SymbolInfoDouble(symbol, SYMBOL_ASK);
               closeReq.deviation= InpMaxSlippagePoints;
               closeReq.magic    = InpMagicNumber;
               closeReq.comment  = "Orca_TP1_50Pct";

               long fillingMode = SymbolInfoInteger(symbol, SYMBOL_FILLING_MODE);
               if((fillingMode & SYMBOL_FILLING_FOK) != 0)      closeReq.type_filling = ORDER_FILLING_FOK;
               else if((fillingMode & SYMBOL_FILLING_IOC) != 0) closeReq.type_filling = ORDER_FILLING_IOC;
               else                                             closeReq.type_filling = ORDER_FILLING_RETURN;

               if(OrderSend(closeReq, closeRes))
               {
                  Print("✅ [Orca-EA] Closed 50% volume (", halfLots, " lots) at TP1 for #", ticket, " @ ", closeRes.price);
                  SendAckToOrca(ticketId, ticket, "PARTIAL_CLOSED", closeRes.price, halfLots, "TP1 reached: 50% closed");
               }
               else
               {
                  Print("⚠️ [Orca-EA] Partial close failed retcode=", closeRes.retcode, " (", closeRes.comment, ")");
               }
            }
         }

         // 2. Move SL to Breakeven (+ 1 point buffer)
         if(InpUseAutoBreakeven)
         {
            double bePrice = (type == POSITION_TYPE_BUY)
               ? NormalizeDouble(openPrice + 1.0 * point, digits)
               : NormalizeDouble(openPrice - 1.0 * point, digits);

            bool needMoveSl = (type == POSITION_TYPE_BUY)
               ? (currentSL < bePrice || currentSL == 0)
               : (currentSL > bePrice || currentSL == 0);

            if(needMoveSl)
            {
               MqlTradeRequest modReq;
               MqlTradeResult  modRes;
               ZeroMemory(modReq);
               ZeroMemory(modRes);
               modReq.action   = TRADE_ACTION_SLTP;
               modReq.position = ticket;
               modReq.symbol   = symbol;
               modReq.sl       = bePrice;
               modReq.tp       = currentTP;

               if(OrderSend(modReq, modRes))
               {
                  Print("🛡️ [Orca-EA] SL moved to Breakeven @ ", bePrice, " for #", ticket);
               }
               else
               {
                  Print("⚠️ [Orca-EA] Breakeven SL modification failed retcode=", modRes.retcode);
               }
            }
         }

         GlobalVariableSet(doneKey, (double)TimeCurrent());
      }
   }
}
//+------------------------------------------------------------------+
