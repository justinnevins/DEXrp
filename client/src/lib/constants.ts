export const XRPL_ENDPOINTS = {
  MAINNET_WS: import.meta.env.VITE_XRPL_MAINNET_WS || 'wss://xrplcluster.com',
  TESTNET_WS: import.meta.env.VITE_XRPL_TESTNET_WS || 'wss://s.altnet.rippletest.net:51233',
  MAINNET_WS_FULL_HISTORY: import.meta.env.VITE_XRPL_MAINNET_WS_FULL_HISTORY || 'wss://s1.ripple.com:51234',
  TESTNET_WS_FULL_HISTORY: import.meta.env.VITE_XRPL_TESTNET_WS_FULL_HISTORY || 'wss://s.altnet.rippletest.net:51233',
};

export const EXPLORER_URLS = {
  XRPSCAN_MAINNET: import.meta.env.VITE_XRPSCAN_MAINNET_URL || 'https://xrpscan.com',
  XRPSCAN_TESTNET: import.meta.env.VITE_XRPSCAN_TESTNET_URL || 'https://testnet.xrpscan.com',
};

export const RLUSD_ISSUERS = {
  MAINNET: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
  TESTNET: 'rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV',
};

export const GATEHUB_ISSUERS = {
  USD_MAINNET: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq',
};

export const BITSTAMP_ISSUERS = {
  MAINNET: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B',
};

export const XRPL_RESERVES = {
  BASE_RESERVE: 10,
  INCREMENT_RESERVE: 2,
};

export const DEX_DEFAULTS = {
  SLIPPAGE_TOLERANCE: 0.02,
  DEFAULT_EXPIRATION_DAYS: 7,
};

export const CURRENCY_CODES = {
  RLUSD_HEX: '524C555344000000000000000000000000000000',
  USDC_HEX: '5553444300000000000000000000000000000000',
  SOLO_HEX: '534F4C4F00000000000000000000000000000000',
  CORE_HEX: '434F524500000000000000000000000000000000',
  FUZZY_HEX: '46555A5A59000000000000000000000000000000',
  PHNIX_HEX: '50484E4958000000000000000000000000000000',
  ARMY_HEX: '41524D5900000000000000000000000000000000',
  REAL_HEX: '5245414C00000000000000000000000000000000',
  XRPH_HEX: '5852504800000000000000000000000000000000',
};

export const TOKEN_ISSUERS = {
  USDC_MAINNET: 'rGm7WCVp9gb4jZHWTEtGUr4dd74z2XuWhE',
  USDC_TESTNET: 'rHuGNhqTG32mfmAvWA8hUyWRLV3tCSwKQt',
  SOLO_MAINNET: 'rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz',
  CORE_MAINNET: 'rcoreNywaoz2ZCQ8Lg2EbSLnGuRBmun6D',
  FUZZY_MAINNET: 'rhCAT4hRdi2Y9puNdkpMzxrdKa5wkppR62',
  PHNIX_MAINNET: 'rDFXbW2ZZCG5WgPtqwNiA2xZokLMm9ivmN',
  ARMY_MAINNET: 'rGG3wQ4KUzd7jnMk1n5nwPZjjuT62kcbfc',
  REAL_MAINNET: 'rKVyXn1AhqMTvNA9hS6XkFjQNn2VE8Nz88',
  XRPH_MAINNET: 'rM8hNqA3jRJ5Zgp3Xf3xzdZcx2G37guiZk',
};

interface CommonToken {
  name: string;
  currency: string;
  mainnetIssuer?: string;
  testnetIssuer?: string;
}

export const COMMON_TOKENS: CommonToken[] = [
  {
    name: 'Ripple USD (RLUSD)',
    currency: CURRENCY_CODES.RLUSD_HEX,
    mainnetIssuer: RLUSD_ISSUERS.MAINNET,
    testnetIssuer: RLUSD_ISSUERS.TESTNET,
  },
  {
    name: 'USD Coin (USDC)',
    currency: CURRENCY_CODES.USDC_HEX,
    mainnetIssuer: TOKEN_ISSUERS.USDC_MAINNET,
    testnetIssuer: TOKEN_ISSUERS.USDC_TESTNET,
  },
  {
    name: 'Bitstamp USD',
    currency: 'USD',
    mainnetIssuer: BITSTAMP_ISSUERS.MAINNET,
  },
  {
    name: 'Bitstamp BTC',
    currency: 'BTC',
    mainnetIssuer: BITSTAMP_ISSUERS.MAINNET,
  },
  {
    name: 'Bitstamp ETH',
    currency: 'ETH',
    mainnetIssuer: BITSTAMP_ISSUERS.MAINNET,
  },
  {
    name: 'GateHub EUR',
    currency: 'EUR',
    mainnetIssuer: GATEHUB_ISSUERS.USD_MAINNET,
  },
  {
    name: 'GateHub USD',
    currency: 'USD',
    mainnetIssuer: GATEHUB_ISSUERS.USD_MAINNET,
  },
  {
    name: 'GateHub GBP',
    currency: 'GBP',
    mainnetIssuer: GATEHUB_ISSUERS.USD_MAINNET,
  },
  {
    name: 'Sologenic (SOLO)',
    currency: CURRENCY_CODES.SOLO_HEX,
    mainnetIssuer: TOKEN_ISSUERS.SOLO_MAINNET,
  },
  {
    name: 'Coreum (CORE)',
    currency: CURRENCY_CODES.CORE_HEX,
    mainnetIssuer: TOKEN_ISSUERS.CORE_MAINNET,
  },
  {
    name: 'FUZZY',
    currency: CURRENCY_CODES.FUZZY_HEX,
    mainnetIssuer: TOKEN_ISSUERS.FUZZY_MAINNET,
  },
  {
    name: 'Phoenix (PHNIX)',
    currency: CURRENCY_CODES.PHNIX_HEX,
    mainnetIssuer: TOKEN_ISSUERS.PHNIX_MAINNET,
  },
  {
    name: 'ARMY',
    currency: CURRENCY_CODES.ARMY_HEX,
    mainnetIssuer: TOKEN_ISSUERS.ARMY_MAINNET,
  },
  {
    name: 'REAL',
    currency: CURRENCY_CODES.REAL_HEX,
    mainnetIssuer: TOKEN_ISSUERS.REAL_MAINNET,
  },
  {
    name: 'XRP Healthcare (XRPH)',
    currency: CURRENCY_CODES.XRPH_HEX,
    mainnetIssuer: TOKEN_ISSUERS.XRPH_MAINNET,
  },
];
