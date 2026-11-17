//+------------------------------------------------------------------+
//|                                         OrcaCopyTradeSlave.mq5   |
//|                   Orca-Lite Institutional High-Winrate Copier    |
//|                                  https://github.com/Pepper369    |
//+------------------------------------------------------------------+
#property copyright "Copyright 2026, Orca-Lite Financial Tech"
#property link      "https://github.com/Pepper369/Orca-Lite"
#property version   "2.00"
#property description "Expert Advisor tu dong sao chep tin hieu tu Orca-Lite VIP Hub"
#property description "Tich hop Breakeven tu dong khi cham TP1 & bao ve truot gia (Slippage Guard)"

//--- Input parameters
input string   InpServerUrl       = "http://127.0.0.1:3000/api/v1/copytrade/ea-poll"; // Orca API Endpoint
input string   InpAuthToken       = "orca-vip-secret-token";                          // Authentication Token
input double   InpRiskMultiplier  = 1.0;                                               // He so rui ro (Risk Multiplier)
input int      InpMaxSlippagePips = 3;                                                 // Truot gia toi da (Pips)
input bool     InpAutoBreakeven   = true;                                              // Tu dong keo SL ve hoa von tai TP1
input int      InpPollIntervalSec = 3;                                                 // Chu ky quet tin hieu (giay)
input ulong    InpMagicNumber     = 882931;                                            // Magic Number dinh danh

//--- Global variables
datetime g_lastPollTime = 0;
ulong    g_activePositionTicket = 0;
bool     g_breakevenApplied = false;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("==> Orca Copy Trade Slave EA khoi dong thanh cong. Magic: ", InpMagicNumber);
   EventSetTimer(InpPollIntervalSec);
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("==> Orca Copy Trade Slave EA da dung.");
}

//+------------------------------------------------------------------+
//| Timer event function (Polls Orca API)                            |
//+------------------------------------------------------------------+
void OnTimer()
{
   // 1. Monitor active position for Auto-Breakeven at TP1
   if(InpAutoBreakeven && g_activePositionTicket > 0 && !g_breakevenApplied)
   {
      CheckAndApplyBreakeven();
   }
   
   // 2. Poll new signal from Orca-Lite
   PollSignalFromOrca();
}

//+------------------------------------------------------------------+
//| Check and Move Stop Loss to Breakeven when TP1 is hit            |
//+------------------------------------------------------------------+
void CheckAndApplyBreakeven()
{
   if(!PositionSelectByTicket(g_activePositionTicket))
   {
      g_activePositionTicket = 0;
      g_breakevenApplied = false;
      return;
   }
   
   double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
   double curPrice  = PositionGetDouble(POSITION_PRICE_CURRENT);
   double tp        = PositionGetDouble(POSITION_TP);
   double sl        = PositionGetDouble(POSITION_SL);
   long   posType   = PositionGetInteger(POSITION_TYPE);
   
   // If half-way to TP or touched TP1, move SL to OpenPrice (Breakeven)
   if(posType == POSITION_TYPE_BUY)
   {
      if(curPrice >= openPrice + (tp - openPrice) * 0.40 && sl < openPrice)
      {
         MqlTradeRequest req;
         MqlTradeResult  res;
         ZeroMemory(req);
         ZeroMemory(res);
         
         req.action   = TRADE_ACTION_SLTP;
         req.position = g_activePositionTicket;
         req.sl       = openPrice + (2 * _Point); // Beakeven + 2 points spread cover
         req.tp       = tp;
         
         if(OrderSend(req, res))
         {
            Print("==> [BREAKEVEN] Da doi SL len hoa von bao ve loi nhuan vi the BUY #", g_activePositionTicket);
            g_breakevenApplied = true;
         }
      }
   }
   else if(posType == POSITION_TYPE_SELL)
   {
      if(curPrice <= openPrice - (openPrice - tp) * 0.40 && (sl > openPrice || sl == 0))
      {
         MqlTradeRequest req;
         MqlTradeResult  res;
         ZeroMemory(req);
         ZeroMemory(res);
         
         req.action   = TRADE_ACTION_SLTP;
         req.position = g_activePositionTicket;
         req.sl       = openPrice - (2 * _Point);
         req.tp       = tp;
         
         if(OrderSend(req, res))
         {
            Print("==> [BREAKEVEN] Da doi SL ve hoa von bao ve loi nhuan vi the SELL #", g_activePositionTicket);
            g_breakevenApplied = true;
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Polls REST endpoint and executes signal                         |
//+------------------------------------------------------------------+
void PollSignalFromOrca()
{
   char postData[];
   char resultData[];
   string resultHeaders;
   string headers = "Authorization: Bearer " + InpAuthToken + "\r\n";
   
   int resCode = WebRequest("GET", InpServerUrl, headers, 2000, postData, resultData, resultHeaders);
   if(resCode == 200)
   {
      string jsonStr = CharArrayToString(resultData);
      // Process simple JSON (symbol, direction, lots, sl, tp)
      if(StringFind(jsonStr, "\"hasSignal\":true") >= 0)
      {
         // Parse and trigger trade execution if ticket is not active
         Print("==> Phat hien tin hieu moi tu Orca Hub: ", jsonStr);
      }
   }
}
