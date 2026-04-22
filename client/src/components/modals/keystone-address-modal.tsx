import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Camera, QrCode } from 'lucide-react';
import { xrplClient } from '@/lib/xrpl-client';
import { GeneralQRScanner } from '@/components/general-qr-scanner';

interface KeystoneAddressModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (address: string) => void;
}

export function KeystoneAddressModal({ isOpen, onClose, onConfirm }: KeystoneAddressModalProps) {
  const [address, setAddress] = useState('');
  const [isValid, setIsValid] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);

  const validateAddress = (addr: string) => {
    const trimmed = addr.trim();
    const valid = xrplClient.isValidAddress(trimmed);
    setIsValid(valid);
    return valid;
  };

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newAddress = e.target.value;
    setAddress(newAddress);
    validateAddress(newAddress);
  };

  const handleConfirm = () => {
    const trimmed = address.trim();
    if (validateAddress(trimmed)) {
      onConfirm(trimmed);
      setAddress('');
      onClose();
    } else {
      alert('Please enter a valid XRPL address (must be a properly formatted classic address starting with "r")');
    }
  };

  const handleCancel = () => {
    setAddress('');
    setIsValid(false);
    onClose();
  };

  const handleQRScan = (validatedAddress: string) => {
    setAddress(validatedAddress);
    setIsValid(true);
    setShowQRScanner(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="max-w-md mx-auto">
        <DialogHeader>
          <DialogTitle>Connect Keystone 3 Pro</DialogTitle>
          <DialogDescription>
            Enter your XRP address from your Keystone 3 Pro device to complete the connection.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* QR Scanner Option */}
          <div className="space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <QrCode className="h-4 w-4" />
              Scan QR Code
            </h4>
            <p className="text-sm text-muted-foreground">
              Scan a QR code containing your Keystone 3 Pro account address
            </p>
            <Button 
              onClick={() => setShowQRScanner(true)}
              variant="outline"
              className="w-full"
            >
              <Camera className="h-4 w-4 mr-2" />
              Open Camera Scanner
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or enter manually
              </span>
            </div>
          </div>

          {/* Manual Entry Option */}
          <div className="space-y-2">
            <Label htmlFor="xrp-address">XRP Address from Device</Label>
            <p className="text-sm text-muted-foreground">
              1. Go to your Keystone 3 Pro device<br />
              2. Navigate to XRP → Accounts<br />
              3. Copy the address for path m/44'/144'/0'/0/0<br />
              4. Enter the address below
            </p>
          </div>

          <div className="space-y-2">
            <Input
              id="xrp-address"
              type="text"
              placeholder="Enter XRP address (starts with 'r')"
              value={address}
              onChange={handleAddressChange}
              onKeyPress={handleKeyPress}
              className={`${isValid ? 'border-green-500' : ''}`}
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
            {address && !isValid && (
              <p className="text-sm text-red-500">
                Address must start with 'r' and be at least 25 characters
              </p>
            )}
            {isValid && (
              <p className="text-sm text-green-600">
                Valid XRP address format
              </p>
            )}
          </div>

          <div className="flex space-x-2">
            <Button 
              onClick={handleConfirm} 
              disabled={!isValid}
              className="flex-1"
            >
              Confirm Address
            </Button>
            <Button 
              onClick={handleCancel} 
              variant="outline"
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
      
      {/* QR Scanner Modal */}
      {showQRScanner && (
        <GeneralQRScanner
          mode="address"
          onScan={handleQRScan}
          onClose={() => setShowQRScanner(false)}
          title="Scan Account Address"
          description="Position the QR code containing your account address within the camera view"
          showKeystoneInstructions
        />
      )}
    </Dialog>
  );
}