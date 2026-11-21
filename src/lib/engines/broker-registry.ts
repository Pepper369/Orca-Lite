/**
 * SSOT BROKER & EXCHANGE REGISTRY + API KEY PATTERN RECOGNITION
 *
 * Pure module (zero "server-only") shared across Client UI, API Routes, Vault Store,
 * Live Telemetry, and Exchange Execution Client.
 *
 * Cleanly separates:
 * - CRYPTO Exchanges & Decentralized Liquidity Venues
 * - FOREX Brokers, ECN Hubs, Prop Firms & Liquidity Bridges
 */

export type CryptoBrokerPlatform =
  | "BINANCE_FUTURES"
  | "OKX_FUTURES"
  | "BYBIT_FUTURES"
  | "BITGET_FUTURES"
  | "GATE_FUTURES"
  | "KUCOIN_FUTURES"
  | "MEXC_FUTURES"
  | "BINGX_FUTURES"
  | "HYPERLIQUID";

export type ForexBrokerPlatform =
  | "OANDA_V20"
  | "MT5_EXNESS"
  | "MT5_XM"
  | "MT5_ICMARKETS"
  | "MT5_PEPPERSTONE"
  | "MT5_TICKMILL"
  | "MT5_VANTAGE"
  | "MT5_FP_MARKETS"
  | "MT5_FXPRO"
  | "MT5_FTMO"
  | "MT5_EA"
  | "CTRADER_OPENAPI";

export type BrokerPlatform = CryptoBrokerPlatform | ForexBrokerPlatform | "TELEGRAM_1CLICK";

export type BrokerCategory = "CRYPTO" | "FOREX" | "NOTIFICATION";

export type BrokerAuthMode =
  | "HMAC_KEY_SECRET"
  | "HMAC_KEY_SECRET_PASSPHRASE"
  | "BEARER_TOKEN_ACCOUNT"
  | "MT5_METAAPI_OR_EA"
  | "WALLET_ADDRESS_OR_AGENT"
  | "WEBHOOK_BOT";

export interface BrokerFieldSpec {
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  apiSecretLabel: string;
  apiSecretPlaceholder: string;
  passphraseLabel?: string;
  passphrasePlaceholder?: string;
  requiresPassphrase: boolean;
  requiresSecret: boolean;
}

export interface BrokerCatalogItem {
  platform: BrokerPlatform;
  category: BrokerCategory;
  name: string;
  shortName: string;
  venueType: string; // e.g. "CEX USDT-M Perp", "Tier-1 FX ECN", "Prop / Funded MT5", "Perp DEX"
  tierLabel: string;
  authMode: BrokerAuthMode;
  supportsDirectRestVerify: boolean;
  supportsDirectOrderExecution: boolean;
  supportsDualEnv: boolean;
  isMt5Broker: boolean;
  defaultSymbolSuffix?: string;
  realEndpointLabel: string;
  demoEndpointLabel: string;
  keyFormatHintVi: string;
  fields: BrokerFieldSpec;
}

export const BROKER_CATALOG: readonly BrokerCatalogItem[] = [
  // =========================================================================
  // CRYPTO EXCHANGES & LIQUIDITY CENTERS
  // =========================================================================
  {
    platform: "BINANCE_FUTURES",
    category: "CRYPTO",
    name: "Binance Futures (USDT-M)",
    shortName: "Binance",
    venueType: "Tier-1 CEX Perpetuals",
    tierLabel: "Top #1 Crypto Liquidity",
    authMode: "HMAC_KEY_SECRET",
    supportsDirectRestVerify: true,
    supportsDirectOrderExecution: true,
    supportsDualEnv: true,
    isMt5Broker: false,
    realEndpointLabel: "fapi.binance.com",
    demoEndpointLabel: "demo-fapi.binance.com / testnet.binancefuture.com",
    keyFormatHintVi: "API Key & Secret 64 ký tự chữ-số (Enable Futures Trading). Hỗ trợ quét song song REAL + DEMO.",
    fields: {
      apiKeyLabel: "Binance API Key (64 ký tự)",
      apiKeyPlaceholder: "64 ký tự chữ-số từ Binance API Management",
      apiSecretLabel: "Binance Secret Key",
      apiSecretPlaceholder: "Secret Key 64 ký tự",
      requiresPassphrase: false,
      requiresSecret: true,
    },
  },
  {
    platform: "OKX_FUTURES",
    category: "CRYPTO",
    name: "OKX Perpetual Swap (v5)",
    shortName: "OKX",
    venueType: "Tier-1 CEX Unified",
    tierLabel: "Top Global Crypto Derivatives",
    authMode: "HMAC_KEY_SECRET_PASSPHRASE",
    supportsDirectRestVerify: true,
    supportsDirectOrderExecution: true,
    supportsDualEnv: true,
    isMt5Broker: false,
    realEndpointLabel: "www.okx.com/api/v5",
    demoEndpointLabel: "www.okx.com (x-simulated-trading: 1)",
    keyFormatHintVi: "API Key dạng UUID + Secret + Passphrase bắt buộc. Tự kiểm tra cả LIVE và Simulated Demo.",
    fields: {
      apiKeyLabel: "OKX API Key (UUID)",
      apiKeyPlaceholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      apiSecretLabel: "OKX Secret Key",
      apiSecretPlaceholder: "32 ký tự hex/chữ hoa",
      passphraseLabel: "OKX Passphrase (Bắt buộc)",
      passphrasePlaceholder: "Passphrase lúc tạo API",
      requiresPassphrase: true,
      requiresSecret: true,
    },
  },
  {
    platform: "BYBIT_FUTURES",
    category: "CRYPTO",
    name: "Bybit Unified v5 (USDT Perp)",
    shortName: "Bybit",
    venueType: "Tier-1 CEX Unified v5",
    tierLabel: "Top Liquidity Perps",
    authMode: "HMAC_KEY_SECRET",
    supportsDirectRestVerify: true,
    supportsDirectOrderExecution: true,
    supportsDualEnv: true,
    isMt5Broker: false,
    realEndpointLabel: "api.bybit.com/v5",
    demoEndpointLabel: "api-testnet.bybit.com / api-demo.bybit.com",
    keyFormatHintVi: "API Key Unified v5 (18–24 ký tự) + Secret Key. Tự nhận diện & quét Mainnet + Testnet/Demo.",
    fields: {
      apiKeyLabel: "Bybit API Key (18-24 ký tự)",
      apiKeyPlaceholder: "VD: k9X2p... (Unified Trading Account)",
      apiSecretLabel: "Bybit Secret Key",
      apiSecretPlaceholder: "Secret Key Bybit v5",
      requiresPassphrase: false,
      requiresSecret: true,
    },
  },
  {
    platform: "BITGET_FUTURES",
    category: "CRYPTO",
    name: "Bitget v2 Mix (USDT-M Futures)",
    shortName: "Bitget",
    venueType: "CEX Futures & Copy Hub",
    tierLabel: "Top Global Futures",
    authMode: "HMAC_KEY_SECRET_PASSPHRASE",
    supportsDirectRestVerify: true,
    supportsDirectOrderExecution: true,
    supportsDualEnv: true,
    isMt5Broker: false,
    realEndpointLabel: "api.bitget.com/api/v2/mix",
    demoEndpointLabel: "api.bitget.com (paptrading: 1)",
    keyFormatHintVi: "API Key (thường bắt đầu bg_ hoặc chuỗi 32-40 ký tự) + Secret + Passphrase bắt buộc.",
    fields: {
      apiKeyLabel: "Bitget API Key",
      apiKeyPlaceholder: "bg_xxxxxxxx... hoặc Bitget Access Key",
      apiSecretLabel: "Bitget Secret Key",
      apiSecretPlaceholder: "64 ký tự hex/Secret",
      passphraseLabel: "Bitget Passphrase (Bắt buộc)",
      passphrasePlaceholder: "Passphrase lúc tạo API v2",
      requiresPassphrase: true,
      requiresSecret: true,
    },
  },
  {
    platform: "GATE_FUTURES",
    category: "CRYPTO",
    name: "Gate.io Futures v4 (USDT Perp)",
    shortName: "Gate.io",
    venueType: "CEX Altcoin & Perp Liquidity",
    tierLabel: "Deep Altcoin Liquidity",
    authMode: "HMAC_KEY_SECRET",
    supportsDirectRestVerify: true,
    supportsDirectOrderExecution: true,
    supportsDualEnv: true,
    isMt5Broker: false,
    realEndpointLabel: "api.gateio.ws/api/v4",
    demoEndpointLabel: "fx-api-testnet.gateio.ws/api/v4",
    keyFormatHintVi: "Gate v4 API Key (32 hex) + Secret (64 hex). Hỗ trợ quét REAL + Futures Testnet.",
    fields: {
      apiKeyLabel: "Gate.io APIv4 Key (32 hex)",
      apiKeyPlaceholder: "32 ký tự hex (Futures v4)",
      apiSecretLabel: "Gate.io Secret Key (64 hex)",
      apiSecretPlaceholder: "64 ký tự hex Secret",
      requiresPassphrase: false,
      requiresSecret: true,
    },
  },
  {
    platform: "KUCOIN_FUTURES",
    category: "CRYPTO",
    name: "KuCoin Futures (USDT-M)",
    shortName: "KuCoin",
    venueType: "CEX Perpetual Futures",
    tierLabel: "Global Crypto Hub",
    authMode: "HMAC_KEY_SECRET_PASSPHRASE",
    supportsDirectRestVerify: true,
    supportsDirectOrderExecution: false,
    supportsDualEnv: false,
    isMt5Broker: false,
    realEndpointLabel: "api-futures.kucoin.com",
    demoEndpointLabel: "api-sandbox-futures.kucoin.com",
    keyFormatHintVi: "KuCoin Futures API Key (24 hex) + Secret UUID + Passphrase bắt buộc.",
    fields: {
      apiKeyLabel: "KuCoin API Key (24 hex)",
      apiKeyPlaceholder: "24 ký tự hex KuCoin Futures",
      apiSecretLabel: "KuCoin Secret (UUID)",
      apiSecretPlaceholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      passphraseLabel: "KuCoin API Passphrase",
      passphrasePlaceholder: "Passphrase API KuCoin",
      requiresPassphrase: true,
      requiresSecret: true,
    },
  },
  {
    platform: "MEXC_FUTURES",
    category: "CRYPTO",
    name: "MEXC Futures (USDT-M)",
    shortName: "MEXC",
    venueType: "Zero/Low-Fee Perp CEX",
    tierLabel: "Low-Spread Derivatives",
    authMode: "HMAC_KEY_SECRET",
    supportsDirectRestVerify: false,
    supportsDirectOrderExecution: false,
    supportsDualEnv: false,
    isMt5Broker: false,
    realEndpointLabel: "contract.mexc.com",
    demoEndpointLabel: "Paper Sandbox",
    keyFormatHintVi: "MEXC Access Key (bắt đầu mx0...) + Secret Key 32-64 ký tự.",
    fields: {
      apiKeyLabel: "MEXC Access Key (mx0...)",
      apiKeyPlaceholder: "mx0vgl...",
      apiSecretLabel: "MEXC Secret Key",
      apiSecretPlaceholder: "Secret Key MEXC",
      requiresPassphrase: false,
      requiresSecret: true,
    },
  },
  {
    platform: "BINGX_FUTURES",
    category: "CRYPTO",
    name: "BingX Perpetual Swap (v2)",
    shortName: "BingX",
    venueType: "CEX Perp & Crypto/Index CFDs",
    tierLabel: "Cross-Asset Crypto Hub",
    authMode: "HMAC_KEY_SECRET",
    supportsDirectRestVerify: true,
    supportsDirectOrderExecution: false,
    supportsDualEnv: true,
    isMt5Broker: false,
    realEndpointLabel: "open-api.bingx.com",
    demoEndpointLabel: "open-api-vst.bingx.com (VST Demo)",
    keyFormatHintVi: "BingX OpenAPI Key + Secret Key (hỗ trợ cả tài khoản Real USDT và VST Demo).",
    fields: {
      apiKeyLabel: "BingX API Key",
      apiKeyPlaceholder: "API Key từ BingX API Management",
      apiSecretLabel: "BingX Secret Key",
      apiSecretPlaceholder: "Secret Key BingX",
      requiresPassphrase: false,
      requiresSecret: true,
    },
  },
  {
    platform: "HYPERLIQUID",
    category: "CRYPTO",
    name: "Hyperliquid On-Chain Perps",
    shortName: "Hyperliquid",
    venueType: "Tier-1 On-Chain Orderbook DEX",
    tierLabel: "Decentralized L1 Perp",
    authMode: "WALLET_ADDRESS_OR_AGENT",
    supportsDirectRestVerify: true,
    supportsDirectOrderExecution: false,
    supportsDualEnv: true,
    isMt5Broker: false,
    realEndpointLabel: "api.hyperliquid.xyz/info",
    demoEndpointLabel: "api.hyperliquid-testnet.xyz/info",
    keyFormatHintVi: "Nhập Địa chỉ Ví EVM (0x...40 hex) để đồng bộ số dư & vị thế On-chain (Mainnet + Testnet).",
    fields: {
      apiKeyLabel: "Hyperliquid Wallet Address (0x...)",
      apiKeyPlaceholder: "0x71C... (Địa chỉ ví chính / Subaccount)",
      apiSecretLabel: "Agent Key / Read-Only Marker (tùy chọn)",
      apiSecretPlaceholder: "Để trống hoặc nhập Agent Label",
      requiresPassphrase: false,
      requiresSecret: false,
    },
  },

  // =========================================================================
  // FOREX BROKERS & LIQUIDITY CENTERS
  // =========================================================================
  {
    platform: "OANDA_V20",
    category: "FOREX",
    name: "OANDA v20 REST Liquidity Hub",
    shortName: "OANDA v20",
    venueType: "Regulated Tier-1 FX Market Maker",
    tierLabel: "Direct Native FX REST API",
    authMode: "BEARER_TOKEN_ACCOUNT",
    supportsDirectRestVerify: true,
    supportsDirectOrderExecution: true,
    supportsDualEnv: true,
    isMt5Broker: false,
    realEndpointLabel: "api-fxtrade.oanda.com/v3",
    demoEndpointLabel: "api-fxpractice.oanda.com/v3",
    keyFormatHintVi: "OANDA API Token (dạng hex32-hex32) + Account ID (vd: 101-001-xxxx). Quét song song fxTrade + fxPractice.",
    fields: {
      apiKeyLabel: "OANDA Personal Access Token",
      apiKeyPlaceholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      apiSecretLabel: "OANDA Account ID",
      apiSecretPlaceholder: "VD: 101-001-12345678-001",
      passphraseLabel: "Environment Note (tùy chọn)",
      passphrasePlaceholder: "Mặc định tự quét Live + Practice",
      requiresPassphrase: false,
      requiresSecret: true,
    },
  },
  {
    platform: "MT5_EXNESS",
    category: "FOREX",
    name: "Exness (MT5 Hub · Suffix m)",
    shortName: "Exness",
    venueType: "Retail & Pro ECN FX Broker",
    tierLabel: "Instant Liquidity · Raw/Zero",
    authMode: "MT5_METAAPI_OR_EA",
    supportsDirectRestVerify: true,
    supportsDirectOrderExecution: true,
    supportsDualEnv: false,
    isMt5Broker: true,
    defaultSymbolSuffix: "m",
    realEndpointLabel: "MetaApi Cloud / MT5 Real",
    demoEndpointLabel: "MetaApi Cloud / MT5 Trial EA",
    keyFormatHintVi: "Dán MetaApi JWT + Account UUID để chạy Cloud 24/7, hoặc bỏ trống để dùng OrcaCopyTradeSlave.mq5 (tự gắn đuôi 'm').",
    fields: {
      apiKeyLabel: "MetaApi Cloud Token (JWT · bỏ trống nếu dùng EA)",
      apiKeyPlaceholder: "eyJhbGci... (từ app.metaapi.cloud)",
      apiSecretLabel: "MetaApi Account UUID",
      apiSecretPlaceholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      passphraseLabel: "Symbol Suffix trên sàn (mặc định: m)",
      passphrasePlaceholder: "m (hoặc c / z nếu Raw/Zero)",
      requiresPassphrase: false,
      requiresSecret: false,
    },
  },
  {
    platform: "MT5_XM",
    category: "FOREX",
    name: "XM Global (MT5 Hub · Suffix #)",
    shortName: "XM Global",
    venueType: "Global Multi-Regulated FX Broker",
    tierLabel: "Ultra Low / Standard MT5",
    authMode: "MT5_METAAPI_OR_EA",
    supportsDirectRestVerify: true,
    supportsDirectOrderExecution: true,
    supportsDualEnv: false,
    isMt5Broker: true,
    defaultSymbolSuffix: "#",
    realEndpointLabel: "MetaApi Cloud / XMReal-MT5",
    demoEndpointLabel: "MetaApi Cloud / XMDemo-MT5",
    keyFormatHintVi: "MetaApi JWT + Account UUID hoặc XM MT5 EA Bridge (tự chuẩn hóa hậu tố '#' của XM Ultra Low).",
    fields: {
      apiKeyLabel: "MetaApi Cloud Token (JWT · bỏ trống nếu dùng EA)",
      apiKeyPlaceholder: "eyJhbGci...",
      apiSecretLabel: "MetaApi Account UUID",
      apiSecretPlaceholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      passphraseLabel: "Symbol Suffix trên XM (mặc định: #)",
      passphrasePlaceholder: "# (Ultra Low) hoặc để trống",
      requiresPassphrase: false,
      requiresSecret: false,
    },
  },
  {
    platform: "MT5_ICMARKETS",
    category: "FOREX",
    name: "IC Markets (Raw Spread ECN)",
    shortName: "IC Markets",
    venueType: "Tier-1 True ECN Liquidity Hub",
    tierLabel: "0.0 Pip Raw Spread ECN",
    authMode: "MT5_METAAPI_OR_EA",
    supportsDirectRestVerify: true,
    supportsDirectOrderExecution: true,
    supportsDualEnv: false,
    isMt5Broker: true,
    defaultSymbolSuffix: "",
    realEndpointLabel: "MetaApi Cloud / ICMarketsSC-MT5",
    demoEndpointLabel: "MetaApi Cloud / ICMarkets-Demo",
    keyFormatHintVi: "MetaApi JWT + Account ID cho IC Markets Raw ECN MT5 hoặc kết nối EA MT5 Bridge trực tiếp.",
    fields: {
      apiKeyLabel: "MetaApi Cloud Token (JWT · bỏ trống nếu dùng EA)",
      apiKeyPlaceholder: "eyJhbGci...",
      apiSecretLabel: "MetaApi Account UUID",
      apiSecretPlaceholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      passphraseLabel: "Symbol Suffix (mặc định không có)",
      passphrasePlaceholder: "Để trống hoặc .r",
      requiresPassphrase: false,
      requiresSecret: false,
    },
  },
  {
    platform: "MT5_PEPPERSTONE",
    category: "FOREX",
    name: "Pepperstone (Razor ECN MT5)",
    shortName: "Pepperstone",
    venueType: "Tier-1 FCA/ASIC Liquidity Hub",
    tierLabel: "Razor Institutional Spread",
    authMode: "MT5_METAAPI_OR_EA",
    supportsDirectRestVerify: true,
    supportsDirectOrderExecution: true,
    supportsDualEnv: false,
    isMt5Broker: true,
    defaultSymbolSuffix: "",
    realEndpointLabel: "MetaApi Cloud / Pepperstone-MT5-Live",
    demoEndpointLabel: "MetaApi Cloud / Pepperstone-MT5-Demo",
    keyFormatHintVi: "MetaApi JWT + Account UUID hoặc EA Bridge trên Pepperstone Razor MT5.",
    fields: {
      apiKeyLabel: "MetaApi Cloud Token (JWT · bỏ trống nếu dùng EA)",
      apiKeyPlaceholder: "eyJhbGci...",
      apiSecretLabel: "MetaApi Account UUID",
      apiSecretPlaceholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      passphraseLabel: "Symbol Suffix (nếu có)",
      passphrasePlaceholder: "VD: để trống hoặc .p",
      requiresPassphrase: false,
      requiresSecret: false,
    },
  },
  {
    platform: "MT5_TICKMILL",
    category: "FOREX",
    name: "Tickmill (Pro / VIP MT5)",
    shortName: "Tickmill",
    venueType: "FCA/CySEC ECN Liquidity Hub",
    tierLabel: "Low Commission Pro FX",
    authMode: "MT5_METAAPI_OR_EA",
    supportsDirectRestVerify: true,
    supportsDirectOrderExecution: true,
    supportsDualEnv: false,
    isMt5Broker: true,
    defaultSymbolSuffix: "",
    realEndpointLabel: "MetaApi Cloud / Tickmill-Live",
    demoEndpointLabel: "MetaApi Cloud / Tickmill-Demo",
    keyFormatHintVi: "MetaApi JWT + Account UUID hoặc EA Bridge cho Tickmill MT5 Pro/VIP.",
    fields: {
      apiKeyLabel: "MetaApi Cloud Token (JWT · bỏ trống nếu dùng EA)",
      apiKeyPlaceholder: "eyJhbGci...",
      apiSecretLabel: "MetaApi Account UUID",
      apiSecretPlaceholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      passphraseLabel: "Symbol Suffix (nếu có)",
      passphrasePlaceholder: "Để trống",
      requiresPassphrase: false,
      requiresSecret: false,
    },
  },
  {
    platform: "MT5_VANTAGE",
    category: "FOREX",
    name: "Vantage Markets (RAW ECN MT5)",
    shortName: "Vantage",
    venueType: "Multi-LP Prime ECN Broker",
    tierLabel: "RAW ECN Liquidity",
    authMode: "MT5_METAAPI_OR_EA",
    supportsDirectRestVerify: true,
    supportsDirectOrderExecution: true,
    supportsDualEnv: false,
    isMt5Broker: true,
    defaultSymbolSuffix: "",
    realEndpointLabel: "MetaApi Cloud / VantageFX-Live",
    demoEndpointLabel: "MetaApi Cloud / VantageFX-Demo",
    keyFormatHintVi: "MetaApi JWT + Account UUID hoặc EA Bridge cho Vantage RAW ECN MT5.",
    fields: {
      apiKeyLabel: "MetaApi Cloud Token (JWT · bỏ trống nếu dùng EA)",
      apiKeyPlaceholder: "eyJhbGci...",
      apiSecretLabel: "MetaApi Account UUID",
      apiSecretPlaceholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      passphraseLabel: "Symbol Suffix (nếu có)",
      passphrasePlaceholder: "Để trống hoặc +",
      requiresPassphrase: false,
      requiresSecret: false,
    },
  },
  {
    platform: "MT5_FP_MARKETS",
    category: "FOREX",
    name: "FP Markets (Raw ECN MT5)",
    shortName: "FP Markets",
    venueType: "ASIC Raw Pricing ECN",
    tierLabel: "DMA & Raw FX",
    authMode: "MT5_METAAPI_OR_EA",
    supportsDirectRestVerify: true,
    supportsDirectOrderExecution: true,
    supportsDualEnv: false,
    isMt5Broker: true,
    defaultSymbolSuffix: "",
    realEndpointLabel: "MetaApi Cloud / FPMarkets-Live",
    demoEndpointLabel: "MetaApi Cloud / FPMarkets-Demo",
    keyFormatHintVi: "MetaApi JWT + Account UUID hoặc EA Bridge cho FP Markets Raw MT5.",
    fields: {
      apiKeyLabel: "MetaApi Cloud Token (JWT · bỏ trống nếu dùng EA)",
      apiKeyPlaceholder: "eyJhbGci...",
      apiSecretLabel: "MetaApi Account UUID",
      apiSecretPlaceholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      passphraseLabel: "Symbol Suffix (nếu có)",
      passphrasePlaceholder: "Để trống hoặc .r",
      requiresPassphrase: false,
      requiresSecret: false,
    },
  },
  {
    platform: "MT5_FXPRO",
    category: "FOREX",
    name: "FxPro (NDD Execution MT5)",
    shortName: "FxPro",
    venueType: "Global NDD Liquidity Center",
    tierLabel: "Institutional No-Dealing-Desk",
    authMode: "MT5_METAAPI_OR_EA",
    supportsDirectRestVerify: true,
    supportsDirectOrderExecution: true,
    supportsDualEnv: false,
    isMt5Broker: true,
    defaultSymbolSuffix: "",
    realEndpointLabel: "MetaApi Cloud / FxPro-MT5",
    demoEndpointLabel: "MetaApi Cloud / FxPro-Demo",
    keyFormatHintVi: "MetaApi JWT + Account UUID hoặc EA Bridge cho FxPro MT5.",
    fields: {
      apiKeyLabel: "MetaApi Cloud Token (JWT · bỏ trống nếu dùng EA)",
      apiKeyPlaceholder: "eyJhbGci...",
      apiSecretLabel: "MetaApi Account UUID",
      apiSecretPlaceholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      passphraseLabel: "Symbol Suffix (nếu có)",
      passphrasePlaceholder: "Để trống",
      requiresPassphrase: false,
      requiresSecret: false,
    },
  },
  {
    platform: "MT5_FTMO",
    category: "FOREX",
    name: "FTMO / Prop Firm (MT5 Funded)",
    shortName: "FTMO Prop",
    venueType: "Prop Trading Liquidity Hub",
    tierLabel: "Challenge & Funded MT5",
    authMode: "MT5_METAAPI_OR_EA",
    supportsDirectRestVerify: true,
    supportsDirectOrderExecution: true,
    supportsDualEnv: false,
    isMt5Broker: true,
    defaultSymbolSuffix: "",
    realEndpointLabel: "MetaApi Cloud / FTMO-Server",
    demoEndpointLabel: "MetaApi Cloud / FTMO-Demo",
    keyFormatHintVi: "MetaApi JWT + Account UUID hoặc EA Bridge trên máy chủ FTMO (hệ thống tự bảo vệ Max Daily Loss).",
    fields: {
      apiKeyLabel: "MetaApi Cloud Token (JWT · bỏ trống nếu dùng EA)",
      apiKeyPlaceholder: "eyJhbGci...",
      apiSecretLabel: "MetaApi Account UUID",
      apiSecretPlaceholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      passphraseLabel: "Symbol Suffix (thường để trống)",
      passphrasePlaceholder: "Để trống hoặc .sim",
      requiresPassphrase: false,
      requiresSecret: false,
    },
  },
  {
    platform: "MT5_EA",
    category: "FOREX",
    name: "Custom Broker / Generic MT5 Bridge",
    shortName: "Custom MT5",
    venueType: "Universal MT5 Terminal Bridge",
    tierLabel: "Mọi sàn MT5 / Liquidity Center",
    authMode: "MT5_METAAPI_OR_EA",
    supportsDirectRestVerify: true,
    supportsDirectOrderExecution: true,
    supportsDualEnv: false,
    isMt5Broker: true,
    defaultSymbolSuffix: "",
    realEndpointLabel: "MetaApi Cloud / Universal EA",
    demoEndpointLabel: "OrcaCopyTradeSlave.mq5 Local EA",
    keyFormatHintVi: "Kết nối bất kỳ sàn MT5 nào (HFM, FBS, Octa, Axi, Eightcap, Blueberry...) qua MetaApi hoặc EA .mq5.",
    fields: {
      apiKeyLabel: "MetaApi Token (bỏ trống nếu dùng EA Token)",
      apiKeyPlaceholder: "eyJhbGci...",
      apiSecretLabel: "MetaApi Account UUID (tùy chọn)",
      apiSecretPlaceholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      passphraseLabel: "Symbol Suffix trên sàn của bạn",
      passphrasePlaceholder: "VD: .a / .i / pro / c / #",
      requiresPassphrase: false,
      requiresSecret: false,
    },
  },
  {
    platform: "CTRADER_OPENAPI",
    category: "FOREX",
    name: "cTrader Open API (Spotware Hub)",
    shortName: "cTrader",
    venueType: "Multi-Broker cTrader ECN Hub",
    tierLabel: "Spotware Institutional FX",
    authMode: "BEARER_TOKEN_ACCOUNT",
    supportsDirectRestVerify: false,
    supportsDirectOrderExecution: false,
    supportsDualEnv: false,
    isMt5Broker: false,
    realEndpointLabel: "openapi.ctrader.com (Live)",
    demoEndpointLabel: "demo.ctraderapi.com (Demo)",
    keyFormatHintVi: "Spotware OAuth Access Token + cTrader Account ID (hỗ trợ Pepperstone/IC Markets/FxPro bản cTrader).",
    fields: {
      apiKeyLabel: "cTrader OAuth Access Token",
      apiKeyPlaceholder: "Token từ Spotware Open API",
      apiSecretLabel: "cTrader Account ID / Client ID",
      apiSecretPlaceholder: "Số ctidTraderAccountId",
      requiresPassphrase: false,
      requiresSecret: true,
    },
  },

  // =========================================================================
  // SIGNAL DELIVERY
  // =========================================================================
  {
    platform: "TELEGRAM_1CLICK",
    category: "NOTIFICATION",
    name: "Telegram 1-Click Signal Bot",
    shortName: "Telegram",
    venueType: "Real-Time Signal Relay",
    tierLabel: "Instant Mobile Alert",
    authMode: "WEBHOOK_BOT",
    supportsDirectRestVerify: false,
    supportsDirectOrderExecution: false,
    supportsDualEnv: false,
    isMt5Broker: false,
    realEndpointLabel: "api.telegram.org",
    demoEndpointLabel: "Telegram Webhook",
    keyFormatHintVi: "Chỉ nhận tín hiệu kèm entry/SL/TP và nút bấm xác nhận qua Telegram.",
    fields: {
      apiKeyLabel: "Telegram Bot Token (tùy chọn)",
      apiKeyPlaceholder: "123456:ABC-DEF...",
      apiSecretLabel: "Chat ID",
      apiSecretPlaceholder: "-100...",
      requiresPassphrase: false,
      requiresSecret: false,
    },
  },
];

const BROKER_MAP = new Map<BrokerPlatform, BrokerCatalogItem>(
  BROKER_CATALOG.map((item) => [item.platform, item]),
);

export const ALL_ALLOWED_PLATFORMS: BrokerPlatform[] = BROKER_CATALOG.map((b) => b.platform);

export function getBrokerMeta(platform: BrokerPlatform): BrokerCatalogItem {
  return (
    BROKER_MAP.get(platform) ??
    BROKER_MAP.get("MT5_EA")!
  );
}

export function isCryptoPlatform(platform: BrokerPlatform): boolean {
  return getBrokerMeta(platform).category === "CRYPTO";
}

export function isForexPlatform(platform: BrokerPlatform): boolean {
  return getBrokerMeta(platform).category === "FOREX";
}

export function isMt5BrokerPlatform(platform: BrokerPlatform): boolean {
  return getBrokerMeta(platform).isMt5Broker;
}

export function isRestDirectVerifyPlatform(platform: BrokerPlatform): boolean {
  const meta = getBrokerMeta(platform);
  return !meta.isMt5Broker && meta.supportsDirectRestVerify;
}

export function getCryptoBrokerCatalog(): BrokerCatalogItem[] {
  return BROKER_CATALOG.filter((b) => b.category === "CRYPTO");
}

export function getForexBrokerCatalog(): BrokerCatalogItem[] {
  return BROKER_CATALOG.filter((b) => b.category === "FOREX");
}

export function getBrokerDisplayLabel(platform: BrokerPlatform): string {
  return getBrokerMeta(platform).name;
}

export function getBrokerShortLabel(platform: BrokerPlatform): string {
  return getBrokerMeta(platform).shortName;
}

export function resolveBrokerDefaultSuffix(platform: BrokerPlatform, explicitSuffix?: string | null): string {
  const clean = explicitSuffix?.trim();
  if (clean) return clean;
  return getBrokerMeta(platform).defaultSymbolSuffix ?? "";
}

// ============================================================================
// INTELLIGENT API KEY & TOKEN PATTERN RECOGNITION
// ============================================================================

export interface BrokerDetectionMatch {
  platform: BrokerPlatform;
  category: BrokerCategory;
  name: string;
  confidence: number; // 0..100
  detectedFormatLabel: string;
  reasonsVi: string[];
}

export interface CredentialRecognitionReport {
  bestMatch: BrokerDetectionMatch | null;
  candidates: BrokerDetectionMatch[];
  warningsVi: string[];
  detectedHints: {
    hasWhitespace: boolean;
    hasPassphrase: boolean;
    looksLikeJwt: boolean;
    looksLikeUuid: boolean;
    looksLikeEvmAddress: boolean;
    looksLikeOandaToken: boolean;
    apiKeyLength: number;
    apiSecretLength: number;
  };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OANDA_TOKEN_REGEX = /^[0-9a-f]{32}-[0-9a-f]{32}$/i;
const OANDA_ACCOUNT_REGEX = /^\d{3}-\d{3}-\d{5,12}-\d{3}$/;
const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
const JWT_REGEX = /^eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;
const HEX_32_REGEX = /^[0-9a-f]{32}$/i;
const HEX_64_REGEX = /^[0-9a-f]{64}$/i;
const HEX_24_REGEX = /^[0-9a-f]{24}$/i;
const ALNUM_64_REGEX = /^[A-Za-z0-9]{64}$/;
const BYBIT_KEY_REGEX = /^[A-Za-z0-9]{16,24}$/;
const BYBIT_SECRET_REGEX = /^[A-Za-z0-9]{32,48}$/;

/**
 * Inspects user-pasted API Key / Token / Secret / Passphrase formats and detects
 * the most compatible Crypto Exchange or Forex Liquidity Hub with diagnostics.
 */
export function detectBrokerCredentialsPattern(input: {
  apiKey?: string | null;
  apiSecret?: string | null;
  passphrase?: string | null;
  preferredCategory?: "CRYPTO" | "FOREX" | "ALL";
}): CredentialRecognitionReport {
  const rawKey = input.apiKey ?? "";
  const rawSecret = input.apiSecret ?? "";
  const rawPass = input.passphrase ?? "";

  const apiKey = rawKey.trim();
  const apiSecret = rawSecret.trim();
  const passphrase = rawPass.trim();

  const hasWhitespace = rawKey !== apiKey || rawSecret !== apiSecret;
  const hasPassphrase = passphrase.length > 0;
  const looksLikeJwt = JWT_REGEX.test(apiKey);
  const looksLikeUuid = UUID_REGEX.test(apiKey);
  const looksLikeEvmAddress = EVM_ADDRESS_REGEX.test(apiKey);
  const looksLikeOandaToken = OANDA_TOKEN_REGEX.test(apiKey);

  const warningsVi: string[] = [];
  if (hasWhitespace) {
    warningsVi.push("Phát hiện khoảng trắng/xuống dòng thừa ở đầu hoặc cuối API Key/Secret — hệ thống sẽ tự cắt gọn.");
  }

  const candidates: BrokerDetectionMatch[] = [];
  const pushMatch = (
    platform: BrokerPlatform,
    confidence: number,
    detectedFormatLabel: string,
    reasonsVi: string[],
  ) => {
    const meta = getBrokerMeta(platform);
    if (input.preferredCategory === "CRYPTO" && meta.category !== "CRYPTO") return;
    if (input.preferredCategory === "FOREX" && meta.category !== "FOREX") return;
    candidates.push({
      platform,
      category: meta.category,
      name: meta.name,
      confidence: Math.max(0, Math.min(99, Math.round(confidence))),
      detectedFormatLabel,
      reasonsVi,
    });
  };

  if (apiKey.length >= 6) {
    // 1. MetaApi Cloud JWT for MT5 Forex Brokers
    if (looksLikeJwt) {
      const secretIsUuid = UUID_REGEX.test(apiSecret);
      pushMatch(
        "MT5_EXNESS",
        secretIsUuid ? 93 : 86,
        "MetaApi Cloud JWT + Account UUID",
        [
          "API Key có cấu trúc chuẩn JWT (eyJ...) của MetaApi Cloud cho hệ sinh thái MT5 Forex.",
          ...(secretIsUuid ? ["Secret khớp UUID Account ID MetaApi."] : ["Hãy nhập Account UUID MT5 vào ô MetaApi Account UUID."]),
        ],
      );
      pushMatch(
        "MT5_ICMARKETS",
        secretIsUuid ? 90 : 83,
        "MetaApi Cloud JWT (IC Markets / ECN)",
        ["Chuẩn token MetaApi Cloud dùng cho IC Markets, XM, Pepperstone, Tickmill, FTMO."],
      );
      pushMatch(
        "MT5_XM",
        secretIsUuid ? 89 : 82,
        "MetaApi Cloud JWT (XM Global)",
        ["Tương thích hoàn toàn kết nối MT5 XM Global (tự thêm hậu tố # nếu cần)."],
      );
      pushMatch(
        "MT5_FTMO",
        secretIsUuid ? 87 : 80,
        "MetaApi Cloud JWT (FTMO / Prop MT5)",
        ["Tương thích kết nối Prop Firm MT5 qua MetaApi Cloud."],
      );
    }

    // 2. OANDA v20 Personal Access Token (hex32-hex32)
    if (looksLikeOandaToken) {
      const hasOandaAccount = OANDA_ACCOUNT_REGEX.test(apiSecret);
      pushMatch(
        "OANDA_V20",
        hasOandaAccount ? 99 : 95,
        "OANDA v20 Access Token (32-hex-32-hex)",
        [
          "Token khớp chuẩn 32-hex + '-' + 32-hex đặc trưng của OANDA fxTrade / fxPractice v20.",
          ...(hasOandaAccount
            ? ["Account ID khớp định dạng XXX-XXX-XXXXXXXX-XXX của OANDA."]
            : ["Nhập OANDA Account ID (dạng 101-001-xxxxxxxx-001) để kích hoạt xác thực kép Live + Demo."]),
        ],
      );
    }

    // 3. Hyperliquid EVM Wallet Address (0x + 40 hex)
    if (looksLikeEvmAddress) {
      pushMatch(
        "HYPERLIQUID",
        96,
        "On-Chain EVM Address (0x...40 hex)",
        ["Khớp chuẩn địa chỉ ví Arbitrum/L1 của Hyperliquid Perp DEX (hỗ trợ cả Mainnet & Testnet)."],
      );
    }

    // 4. Explicit Vendor Prefix Patterns
    if (/^bg_[A-Za-z0-9]{16,}$/.test(apiKey)) {
      pushMatch(
        "BITGET_FUTURES",
        hasPassphrase ? 98 : 91,
        "Bitget v2 API Key (prefix bg_)",
        [
          "Tiền tố 'bg_' là định dạng chuẩn của Bitget API v2.",
          ...(!hasPassphrase ? ["Thiếu Passphrase — Bitget v2 yêu cầu bắt buộc Passphrase."] : []),
        ],
      );
    }
    if (/^mx0[A-Za-z0-9]{12,}$/.test(apiKey)) {
      pushMatch(
        "MEXC_FUTURES",
        97,
        "MEXC Futures Access Key (prefix mx0)",
        ["Tiền tố 'mx0' khớp định dạng API Key của sàn MEXC."],
      );
    }

    // 5. UUID v4 Keys -> OKX v5 (main), KuCoin / Bitget
    if (looksLikeUuid) {
      const okxConf = hasPassphrase ? 95 : 83;
      pushMatch(
        "OKX_FUTURES",
        okxConf,
        "UUID v4 + Passphrase API (OKX v5)",
        [
          "API Key dạng UUID v4 (8-4-4-4-12) chuẩn của OKX Unified v5.",
          ...(hasPassphrase
            ? ["Đã có Passphrase — sẵn sàng quét song song REAL và Simulated Demo OKX."]
            : ["Lưu ý: OKX v5 bắt buộc nhập thêm Passphrase."]),
        ],
      );
      if (hasPassphrase) {
        pushMatch("BITGET_FUTURES", 78, "UUID API + Passphrase (Bitget)", [
          "API Key + Passphrase tương thích Bitget nếu tạo trước chuẩn bg_.",
        ]);
      }
    }

    // 6. Gate.io v4: 32-char lowercase hex Key + 64-char hex Secret
    if (HEX_32_REGEX.test(apiKey) && (!apiSecret || HEX_64_REGEX.test(apiSecret))) {
      pushMatch(
        "GATE_FUTURES",
        apiSecret && HEX_64_REGEX.test(apiSecret) ? 93 : 82,
        "Gate.io v4 Hex Key (32 hex + 64 hex)",
        ["Chuỗi 32 ký tự hex + Secret 64 ký tự hex khớp chuẩn APIv4 của Gate.io Futures."],
      );
    }

    // 7. KuCoin Futures: 24-hex API Key + UUID Secret + Passphrase
    if (HEX_24_REGEX.test(apiKey) && (!apiSecret || UUID_REGEX.test(apiSecret))) {
      pushMatch(
        "KUCOIN_FUTURES",
        hasPassphrase && UUID_REGEX.test(apiSecret) ? 94 : 84,
        "KuCoin Futures Key (24 hex + UUID Secret)",
        [
          "API Key 24 ký tự hex (Mongo ObjectId) là chuẩn định dạng của KuCoin Futures.",
          ...(!hasPassphrase ? ["Cần nhập thêm KuCoin API Passphrase."] : []),
        ],
      );
    }

    // 8. 64-char Alphanumeric Keys -> Binance Futures (primary), BingX Futures
    if (ALNUM_64_REGEX.test(apiKey) && !looksLikeOandaToken) {
      const secretIs64Alnum = ALNUM_64_REGEX.test(apiSecret);
      const hasPassWarning = hasPassphrase;
      pushMatch(
        "BINANCE_FUTURES",
        hasPassWarning ? 72 : secretIs64Alnum ? 94 : 88,
        "HMAC 64-Alphanumeric Key (Binance USDT-M)",
        [
          "Chuỗi 64 ký tự chữ-số là chuẩn Binance Futures API (hỗ trợ quét cả fapi.binance.com và demo-fapi.binance.com).",
          ...(secretIs64Alnum ? ["Secret Key 64 ký tự khớp chuẩn HMAC-SHA256 Binance."] : []),
        ],
      );
      pushMatch(
        "BINGX_FUTURES",
        hasPassWarning ? 68 : 79,
        "64-Alphanumeric OpenAPI Key (BingX)",
        ["Khớp cấu trúc 64 ký tự của BingX OpenAPI v2 (Real USDT & VST Demo)."],
      );
    }

    // 9. 16-24 char Mixed Alphanumeric -> Bybit Unified v5
    if (BYBIT_KEY_REGEX.test(apiKey) && !HEX_24_REGEX.test(apiKey)) {
      const secretOk = !apiSecret || BYBIT_SECRET_REGEX.test(apiSecret);
      pushMatch(
        "BYBIT_FUTURES",
        secretOk ? 89 : 76,
        "Unified v5 Key (16-24 chars · Bybit)",
        [
          `Độ dài ${apiKey.length} ký tự chữ-số khớp chuẩn Bybit Unified v5 Trading API.`,
          "Tự động quét song song Mainnet (api.bybit.com) và Testnet/Demo.",
        ],
      );
    }

    // 10. Telegram Bot Token sanity
    if (/^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(apiKey)) {
      pushMatch("TELEGRAM_1CLICK", 98, "Telegram Bot Token", [
        "Định dạng <digits>:<hash> là Bot Token của Telegram.",
      ]);
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  const bestMatch = candidates[0] ?? null;

  if (bestMatch) {
    const meta = getBrokerMeta(bestMatch.platform);
    if (meta.fields.requiresPassphrase && !hasPassphrase) {
      warningsVi.push(`${meta.shortName} yêu cầu bắt buộc nhập Passphrase mới có thể xác thực API.`);
    }
    if (meta.fields.requiresSecret && !apiSecret) {
      warningsVi.push(`${meta.shortName} yêu cầu nhập Secret Key / Account ID đi kèm.`);
    }
  }

  return {
    bestMatch,
    candidates: candidates.slice(0, 4),
    warningsVi,
    detectedHints: {
      hasWhitespace,
      hasPassphrase,
      looksLikeJwt,
      looksLikeUuid,
      looksLikeEvmAddress,
      looksLikeOandaToken,
      apiKeyLength: apiKey.length,
      apiSecretLength: apiSecret.length,
    },
  };
}
