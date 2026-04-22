import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Globe, TestTube, Wifi } from 'lucide-react';

export type XRPLNetwork = 'mainnet' | 'testnet';

interface NetworkSettingsProps {
  currentNetwork: XRPLNetwork;
  onNetworkChange: (network: XRPLNetwork) => void;
  isConnected: boolean;
}

export function NetworkSettings({ currentNetwork, onNetworkChange, isConnected }: NetworkSettingsProps) {
  const [isChanging, setIsChanging] = useState(false);

  const handleNetworkChange = async (network: XRPLNetwork) => {
    if (network === currentNetwork) return;
    
    setIsChanging(true);
    try {
      await onNetworkChange(network);
    } finally {
      setIsChanging(false);
    }
  };

  const networks = [
    {
      id: 'mainnet' as XRPLNetwork,
      name: 'XRPL Mainnet',
      description: 'Live network with real XRP',
      icon: Globe,
      color: 'bg-green-500',
      textColor: 'text-green-700 dark:text-green-300',
    },
    {
      id: 'testnet' as XRPLNetwork,
      name: 'XRPL Testnet',
      description: 'Test network with free test XRP',
      icon: TestTube,
      color: 'bg-orange-500',
      textColor: 'text-orange-700 dark:text-orange-300',
    }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Wifi className="w-5 h-5" />
          <span>Network Settings</span>
          <Badge variant={isConnected ? "default" : "secondary"}>
            {isConnected ? "Connected" : "Disconnected"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {networks.map((network) => {
          const Icon = network.icon;
          const isActive = currentNetwork === network.id;
          
          return (
            <div
              key={network.id}
              className={`p-4 border rounded-lg transition-colors ${
                isActive 
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                  : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${network.color}`} />
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-gray-100">
                      {network.name}
                    </h3>
                    <p className={`text-sm ${network.textColor}`}>
                      {network.description}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  {isActive && (
                    <Badge variant="default" className="text-xs">
                      Active
                    </Badge>
                  )}
                  <Button
                    variant={isActive ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => handleNetworkChange(network.id)}
                    disabled={isActive || isChanging}
                  >
                    {isActive ? 'Connected' : 'Switch'}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
        
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">
            <strong>Warning:</strong> Do not use the same account address on both Mainnet and Testnet. 
            Using the same address on both networks can lead to confusion and potential errors.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}