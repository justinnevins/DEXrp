import { useState, useEffect, useRef } from 'react';
import { Copy, Share2, QrCode, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useWallet } from '@/hooks/use-wallet';
import { useToast } from '@/hooks/use-toast';
import { FullscreenQRViewer } from '@/components/fullscreen-qr-viewer';
import QRCodeLib from 'qrcode';

interface ReceiveModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ReceiveModal({ isOpen, onClose }: ReceiveModalProps) {
  const { currentWallet } = useWallet();
  const { toast } = useToast();
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const closeTimestampRef = useRef<number>(0);

  const handleOpenFullscreen = () => {
    if (Date.now() - closeTimestampRef.current < 300) return;
    if (qrCodeUrl) setShowFullscreen(true);
  };

  const handleCloseFullscreen = () => {
    closeTimestampRef.current = Date.now();
    setShowFullscreen(false);
  };

  useEffect(() => {
    const generateQRCode = async () => {
      if (!currentWallet?.address || !isOpen) {
        setQrCodeUrl(null);
        return;
      }

      setIsGenerating(true);
      try {
        const url = await QRCodeLib.toDataURL(currentWallet.address, {
          width: 256,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        });
        setQrCodeUrl(url);
      } catch {
        toast({
          title: "QR Code Error",
          description: "Unable to generate QR code",
          variant: "destructive",
        });
      } finally {
        setIsGenerating(false);
      }
    };

    generateQRCode();
  }, [currentWallet?.address, isOpen, toast]);

  const copyAddress = async () => {
    if (!currentWallet?.address) return;
    
    try {
      await navigator.clipboard.writeText(currentWallet.address);
      toast({
        title: "Address Copied",
        description: "Your XRP address has been copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Unable to copy address to clipboard",
        variant: "destructive",
      });
    }
  };

  const shareAddress = async () => {
    if (!currentWallet?.address) return;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My XRP Address',
          text: `Send XRP to this address: ${currentWallet.address}`,
        });
      } catch (error) {
        // User cancelled sharing or error occurred
        copyAddress(); // Fallback to copy
      }
    } else {
      copyAddress(); // Fallback for browsers without Web Share API
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md mx-auto">
          <DialogHeader className="pb-4 border-b border-border">
            <DialogTitle className="text-lg font-semibold">Receive</DialogTitle>
            <DialogDescription className="sr-only">
              Share your XRP address with others to receive payments.
            </DialogDescription>
          </DialogHeader>
          
          <div className="pt-4 text-center pb-6">
            {/* QR Code */}
            <div 
              className="w-64 h-64 mx-auto bg-white rounded-xl mb-4 flex items-center justify-center p-4 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
              onClick={handleOpenFullscreen}
              title="Tap to view fullscreen"
            >
              {isGenerating ? (
                <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
              ) : qrCodeUrl ? (
                <img 
                  src={qrCodeUrl} 
                  alt="Account Address QR Code" 
                  className="w-full h-full"
                  data-testid="qr-code-image"
                />
              ) : (
                <QrCode className="w-16 h-16 text-muted-foreground" />
              )}
            </div>
            
            <p className="text-sm text-muted-foreground mb-4">Scan to send XRP or trusted tokens to this address</p>
            
            <div className="bg-muted rounded-xl p-4 mb-4">
              <p className="font-mono text-sm break-all">
                {currentWallet?.address || 'No account selected'}
              </p>
            </div>
            
            <div className="flex space-x-3">
              <Button
                onClick={copyAddress}
                variant="outline"
                className="flex-1 py-3 touch-target"
                disabled={!currentWallet?.address}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy Address
              </Button>
              <Button
                onClick={shareAddress}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground py-3 touch-target"
                disabled={!currentWallet?.address}
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {showFullscreen && (
        <FullscreenQRViewer onClose={handleCloseFullscreen}>
          {qrCodeUrl && (
            <img 
              src={qrCodeUrl} 
              alt="Account Address QR Code" 
              className="w-full h-full object-contain"
              data-testid="fullscreen-qr-image"
            />
          )}
        </FullscreenQRViewer>
      )}
    </>
  );
}
