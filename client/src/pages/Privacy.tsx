import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';

export default function Privacy() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6 sm:py-12">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation('/')}
          className="mb-6 text-gray-400 hover:text-white"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <h1 className="text-3xl sm:text-4xl font-bold mb-8">Privacy Policy</h1>

        <div className="space-y-8 text-gray-300">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Overview</h2>
            <p className="leading-relaxed">
              DEXrp is designed with privacy as a core principle. We believe your financial data belongs to you alone. 
              This policy explains how we handle (or rather, don't handle) your information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Data We Don't Collect</h2>
            <p className="leading-relaxed mb-3">
              DEXrp is a client-side application. We do not collect, store, or transmit:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-400">
              <li>Private keys or seed phrases</li>
              <li>Wallet addresses you manage</li>
              <li>Transaction history or details</li>
              <li>Personal information or identifiers</li>
              <li>Usage analytics or tracking data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">How DEXrp Works</h2>
            <p className="leading-relaxed">All wallet data is stored locally in your browser's storage. Your private keys never leave your Keystone 3 Pro hardware wallet. Transactions are signed offline via QR codes, ensuring complete air-gapped security. Your browser connects directly to XRPL nodes to fetch public blockchain data — no intermediary servers are involved.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Local Storage</h2>
            <p className="leading-relaxed">
              DEXrp stores the following data locally in your browser:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-400 mt-3">
              <li>Wallet addresses (public addresses only, for watch-only functionality)</li>
              <li>Custom XRPL node preferences</li>
              <li>Application settings and preferences</li>
            </ul>
            <p className="leading-relaxed mt-3">
              This data never leaves your device and can be cleared at any time by clearing your browser data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Third-Party Services</h2>
            <p className="leading-relaxed">
              DEXrp connects to XRPL network nodes to retrieve public blockchain data such as account balances, 
              transaction history, and order book information. These are public blockchain queries and do not 
              transmit any private information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Affiliate Links</h2>
            <p className="leading-relaxed">
              This site contains affiliate links to Keystone hardware wallets. If you purchase through these links, 
              we may receive a commission. This does not affect the price you pay or our commitment to your privacy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Contact</h2>
            <p className="leading-relaxed">
              If you have questions about this privacy policy, you can reach us on X (Twitter) at{' '}
              <a 
                href="https://x.com/JustinNevins" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300"
              >
                @JustinNevins
              </a>.
            </p>
          </section>

          <section className="pt-4 border-t border-gray-800">
            <p className="text-sm text-gray-500">
              Last updated: December 2025
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
