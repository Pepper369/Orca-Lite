//+------------------------------------------------------------------+
//|                                          OrcaCopyTradeSlave.mq5  |
//|                                   Orca Quant Auto-Trade Bridge   |
//|           Supports Exness & XM MT5 (Authenticated Bearer Token)  |
//+------------------------------------------------------------------+
#property copyright "Orca Financial Quant"
#property link      "https://orca-lite.local"
#property version   "2.00"
#property strict

input string InpServerUrl          = "http://127.0.0.1:3000/api/v1/copytrade/ea-poll";
input string InpAckUrl             = "http://127.0.0.1:3000/api/v1/copytrade/ea-ack";
input string InpEaBearerToken      = "";            // Dán Bearer Token lấy 1 lần từ /copytrade
input double InpRiskMultiplier     = 1.0;           // Hệ số lot (0.5x | 1.0x | 2.0x)
input int    InpMaxSlippagePoints  = 25;            // Độ trượt giá tối đa cho phép (points)
input double InpMaxSpreadPips      = 2.8;           // Chặn vào lệnh nếu spread XM/Exness giãn quá cao
input bool   InpUseAutoBreakeven   = true;          // Tự động dời SL về Entry khi đạt TP1
input int    InpPollIntervalSec    = 3;             // Chu kỳ poll (giây)
input ulong  InpMagicNumber        = 889900;        // Magic Number định danh lệnh Orca

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
   Print("🐋 [Orca-EA v2.0] Initialized | Server=", InpServerUrl, " | Risk=", InpRiskMultiplier);
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("🛑 [Orca-EA v2.0] Stopped. Reason=", reason);
}

void OnTimer()
{
   PollSignalFromOrca();
   if(InpUseAutoBreakeven)
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
   double entry     = JsonGetNumber(json, "entry");
   double sl        = JsonGetNumber(json, "stopLoss");
   double tp1       = JsonGetNumber(json, "takeProfit1");
   double rawLots   = JsonGetNumber(json, "recommendedLots");

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
   double price = (direction == "BUY") ? ask : bid;

   MqlTradeRequest req;
   MqlTradeResult  tradeRes;
   ZeroMemory(req);
   ZeroMemory(tradeRes);

   req.action       = TRADE_ACTION_DEAL;
   req.symbol       = symbol;
   req.volume       = lots;
   req.type         = (direction == "BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   req.price        = NormalizeDouble(price, digits);
   req.sl           = (sl > 0) ? NormalizeDouble(sl, digits) : 0.0;
   req.tp           = (tp1 > 0) ? NormalizeDouble(tp1, digits) : 0.0;
   req.deviation    = InpMaxSlippagePoints;
   req.magic        = InpMagicNumber;
   req.comment      = "Orca_" + ticketId;

   // Exness/XM Raw & Standard filling policy compatibility
   long fillingMode = SymbolInfoInteger(symbol, SYMBOL_FILLING_MODE);
   if((fillingMode & SYMBOL_FILLING_FOK) != 0)      req.type_filling = ORDER_FILLING_FOK;
   else if((fillingMode & SYMBOL_FILLING_IOC) != 0) req.type_filling = ORDER_FILLING_IOC;
   else                                             req.type_filling = ORDER_FILLING_RETURN;

   bool sent = OrderSend(req, tradeRes);
   g_lastProcessedTicket = ticketId;
   GlobalVariableSet("ORCA_DONE_" + ticketId, (double)TimeCurrent());

   if(sent && (tradeRes.retcode == TRADE_RETCODE_DONE || tradeRes.retcode == TRADE_RETCODE_PLACED))
   {
      Print("✅ [Orca-EA] Filled ", direction, " ", lots, " ", symbol, " @ ", tradeRes.price, " | Deal #", tradeRes.deal);
      SendAckToOrca(ticketId, tradeRes.order, "FILLED", tradeRes.price, lots, "MT5 OrderSend OK");
   }
   else
   {
      string failMsg = StringFormat("OrderSend failed retcode=%d (%s)", tradeRes.retcode, tradeRes.comment);
      Print("❌ [Orca-EA] ", failMsg);
      SendAckToOrca(ticketId, 0, "REJECTED", price, lots, failMsg);
   }
}

//+------------------------------------------------------------------+
//| Auto-Move SL to Breakeven at +0.6 * TP distance                  |
//+------------------------------------------------------------------+
void CheckAndApplyBreakeven()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) != (long)InpMagicNumber) continue;

      string symbol = PositionGetString(POSITION_SYMBOL);
      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double currentSL = PositionGetDouble(POSITION_SL);
      double currentTP = PositionGetDouble(POSITION_TP);
      long type = PositionGetInteger(POSITION_TYPE);

      if(currentTP <= 0) continue;
      double currentPrice = (type == POSITION_TYPE_BUY)
         ? SymbolInfoDouble(symbol, SYMBOL_BID)
         : SymbolInfoDouble(symbol, SYMBOL_ASK);

      double tpDist = MathAbs(currentTP - openPrice);
      double profitDist = (type == POSITION_TYPE_BUY) ? (currentPrice - openPrice) : (openPrice - currentPrice);

      if(profitDist >= tpDist * 0.6)
      {
         bool needMove = (type == POSITION_TYPE_BUY)
            ? (currentSL < openPrice || currentSL == 0)
            : (currentSL > openPrice || currentSL == 0);
         if(needMove)
         {
            MqlTradeRequest modReq;
            MqlTradeResult  modRes;
            ZeroMemory(modReq);
            ZeroMemory(modRes);
            modReq.action   = TRADE_ACTION_SLTP;
            modReq.position = ticket;
            modReq.symbol   = symbol;
            modReq.sl       = openPrice;
            modReq.tp       = currentTP;
            if(!OrderSend(modReq, modRes))
            {
               Print("⚠️ [Orca-EA] Breakeven failed ticket #", ticket, " retcode=", modRes.retcode);
            }
         }
      }
   }
}
//+------------------------------------------------------------------+
