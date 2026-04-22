# DEXrp - XRPL DEX Trading App

A secure, mobile-optimized XRP Ledger (XRPL) DEX trading app with Keystone 3 Pro hardware wallet integration using QR code-based air-gapped transaction signing. More air-gapped wallet support coming soon!

**Web Domain**: [dexrp.me](https://dexrp.me)

## Features

### Core Functionality
- **Hardware Wallet Security**: Integration with Keystone 3 Pro for air-gapped transaction signing
- **Watch-Only Wallets**: View any XRPL address balance and transactions without signing capabilities
- **Multi-Network Support**: Per-wallet configuration for both Mainnet and Testnet
- **Custom Node Configuration**: Support for custom WebSocket (ws/wss) XRPL endpoints
- **Full Transaction History**: Dedicated full-history server support with automatic fallback
- **Real-Time DEX Pricing**: Live XRP/RLUSD price sourced directly from XRPL DEX order book

### Wallet Management
- **Multiple Wallets**: Add both hardware-secured and watch-only accounts
- **Send & Receive XRP**: Secure payment functionality with QR code-based signing for supported hardware wallets
- **Transaction History**: Complete transaction tracking with detailed status information
- **Balance Overview**: Real-time account balance with RLUSD conversion from DEX
- **Reserve Calculation**: Automatic XRPL reserve and fee accounting (from the XRPL)

### Token Management
- **Trustlines**: Add, view, and remove token trustlines
- **Token Balances**: Track all token holdings in one place
- **Custom Tokens**: Support for any XRPL-based token

### DEX Trading
- **Create Offers**: Place buy/sell orders on the XRPL DEX
- **Active Offer Tracking**: Monitor your open offers with fill percentages and per-unit pricing
- **Fill History**: Track partial fills with detailed history persistence
- **Quick Amount Selection**: 25%, 50%, 75%, and Max buttons with smart reserve calculations
- **Enhanced Currency Selection**: Easy-to-use currency picker for trading pairs

### Data Management
- **Backup & Restore**: Export all wallet data, transactions, and settings to a ZIP file
- **Cross-Browser Portability**: Import backups to migrate between browsers or devices
- **Merge Mode**: Intelligently merge imported data without duplicating existing records

## Technology Stack

### Frontend
- **Framework**: React with TypeScript
- **Build Tool**: Vite
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS
- **State Management**: TanStack Query
- **Routing**: Wouter
- **Data Storage**: Browser localStorage by default — no account required
- **Optional Cloud Sync**: Sign in to sync encrypted wallet data across devices
- **Mobile Apps**: Capacitor for native Android and iOS builds

### Backend
- **Server**: Express.js with TypeScript
- **API**: RESTful endpoints for wallet operations and optional cloud sync
- **XRPL Integration**: xrpl JavaScript library with custom connection management
- **Optional Auth**: Google or X (Twitter) sign-in for encrypted cross-device wallet sync; fully optional — the app works entirely without an account

### Hardware Wallet Integration
- **SDK**: @keystonehq/keystone-sdk
- **QR Codes**: @ngraveio/bc-ur for multi-part animated QR codes
- **Camera**: qr-scanner for QR code reading
- **Encoding**: ripple-binary-codec for transaction serialization

## Architecture Highlights

### WebSocket Connections
All XRPL communication uses WebSocket connections for real-time updates and efficient data transfer.

### Full-History Server Strategy
Ensures complete transaction history with intelligent fallback:
1. Try custom full-history endpoint (if configured)
2. Fall back to default full-history server
3. Final fallback to primary endpoint if needed

### Per-Wallet Network Configuration
Each wallet maintains its own network setting (Mainnet/Testnet), enabling:
- Multiple wallets on different networks simultaneously
- Independent custom node configuration per wallet
- Network-specific transaction history and balance tracking

## Getting Started

### Prerequisites
- Node.js 18+ installed
- A Keystone 3 Pro hardware wallet (required for transaction signing)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/justinnevins/DEXrp.git
cd DEXrp
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to the provided local URL

### Configuration

#### Custom XRPL Nodes
Configure custom WebSocket endpoints in Settings:
- **Mainnet Node**: Your preferred mainnet WebSocket endpoint
- **Testnet Node**: Your preferred testnet WebSocket endpoint
- **Full-History Servers**: Optional dedicated servers for complete transaction history

#### Default Endpoints
- **Mainnet**: wss://xrplcluster.com
- **Testnet**: wss://s.altnet.rippletest.net:51233
- **Mainnet Full-History**: wss://s1.ripple.com:51234
- **Testnet Full-History**: wss://s.altnet.rippletest.net:51234

## Usage

### Adding Accounts
1. Navigate to Accounts & Settings (Profile page)
2. Click the + button in the XRPL Accounts section
3. Choose one of two options:
   - **Connect Keystone 3 Pro**: Scan your hardware wallet and select network (Mainnet/Testnet)
   - **Watch-Only Address**: Enter any XRPL address to monitor without signing capability

### Sending Transactions (Hardware Wallets Only)
1. Go to Wallet tab
2. Click "Send"
3. Enter destination address and amount
4. Use percentage buttons for quick amount selection
5. Scan the transaction QR code with your Keystone 3 Pro
6. Sign the transaction on your hardware wallet
7. Scan the signed QR code back into the app
8. Transaction is submitted to your configured XRPL node

### Managing Tokens (Hardware Wallets Only)
1. Navigate to Tokens tab
2. View existing trustlines and balances
3. Add new trustlines by currency code and issuer
4. Remove unwanted trustlines (requires QR signing)

### DEX Trading (Hardware Wallets Only)
1. Go to DEX tab
2. Select your trading pair currencies
3. Enter offer amount and price
4. Sign with Keystone 3 Pro via QR code
5. Monitor offer status in transaction history

### Viewing Watch-Only Accounts
1. Select a watch-only wallet from the account switcher
2. View real-time balance and transaction history
3. Track token holdings and trustlines
4. Access same information as hardware wallets, but without signing capability

## Security Features

- **Air-Gapped Signing**: All transactions signed offline on hardware wallet
- **No Private Key Exposure**: Keys never leave the Keystone device
- **Client-Side Storage**: Wallet data stored locally, not on servers
- **Custom Node Support**: Connect to your own trusted XRPL validators
- **Protocol Verification**: Transaction details displayed for verification before signing
- **Watch-Only Protection**: Multiple layers prevent accidental signing with watch-only addresses

## Development

### Project Structure
```
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── lib/           # XRPL client and utilities
│   │   ├── pages/         # Application pages
│   │   └── App.tsx        # Main application component
├── server/                # Backend Express server
│   ├── routes.ts          # API endpoints
│   └── index.ts           # Server entry point
├── shared/                # Shared types and schemas
└── replit.md             # Project documentation
```

### Key Files
- `client/src/lib/xrpl-client.ts` - XRPL WebSocket connection management
- `client/src/lib/browser-storage.ts` - Client-side data persistence
- `client/src/lib/keystone-client.ts` - Keystone hardware wallet SDK operations
- `client/src/components/keystone-transaction-signer.tsx` - Hardware wallet integration
- `client/src/components/modals/watch-only-address-modal.tsx` - Watch-only wallet management
- `server/routes.ts` - Backend API endpoints

## Contributing

Contributions are welcome! Please ensure:
- Code follows existing patterns and conventions
- TypeScript types are properly defined
- Mobile-first design is maintained
- Hardware wallet integration remains functional

## License

This project is licensed under the **Sustainable Use License 1.0** (SUL-1.0).

This is a source-available license that allows:
- Personal and non-commercial use
- Studying and modifying the code
- Non-commercial distribution

Commercial use requires a separate license. See the [LICENSE](LICENSE) file for full terms.

For commercial licensing inquiries, contact: justin@dexrp.me

## Support

For issues or questions:
- Open an issue on GitHub
- Review the XRPL documentation at https://xrpl.org
- Check Keystone 3 Pro documentation at https://keyst.one

### Tips

If you find DEXrp useful, consider sending a tip to support development:

**XRP Address**: `rMVRPENEPfhwht1RkQp6Emw13DeAp2PtLv`

### Get a Keystone 3 Pro

Purchase a Keystone 3 Pro hardware wallet using our affiliate link:
[keyst.one](https://keyst.one/?rfsn=8924031.c9a3ff&utm_source=refersion&utm_medium=affiliate&utm_campaign=8924031.c9a3ff)

## Acknowledgments

- XRPL Foundation for the XRPL JavaScript library
- Keystone Team for the hardware wallet SDK
- shadcn for the amazing UI component library
- Replit for the development platform
