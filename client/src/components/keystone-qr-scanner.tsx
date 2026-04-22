import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Camera, X } from 'lucide-react';
import { URDecoder } from '@ngraveio/bc-ur';
import jsQR from 'jsqr';

const isDev = import.meta.env.DEV;
const log = (...args: any[]) => isDev && console.log('[KeystoneQRScanner]', ...args);

interface KeystoneQRScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
  title?: string;
  description?: string;
}

export function KeystoneQRScanner({ onScan, onClose, title = "Scan Signed Transaction", description = "Scan the signed transaction QR code from your Keystone 3 Pro" }: KeystoneQRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const decoderRef = useRef<URDecoder | null>(null);
  const hasSubmittedRef = useRef<boolean>(false);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.playsInline = true;
        videoRef.current.muted = true;
        
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play().then(() => {
              setIsActive(true);
              setError(null);
              startQRScanning();
            }).catch(() => {
              setError('Failed to play video stream');
            });
          }
        };
      }

    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Camera permission denied. Please allow camera access.');
        } else if (err.name === 'NotFoundError') {
          setError('No camera found on this device.');
        } else {
          setError(`Camera error: ${err.message}`);
        }
      } else {
        setError('Failed to access camera.');
      }
    }
  };

  const startQRScanning = async () => {
    try {
      if (videoRef.current && canvasRef.current) {
        setIsScanning(true);
        decoderRef.current = new URDecoder();
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        scanIntervalRef.current = setInterval(() => {
          if (videoRef.current && ctx && videoRef.current.readyState >= 2 && videoRef.current.videoWidth > 0) {
            try {
              canvas.width = videoRef.current.videoWidth;
              canvas.height = videoRef.current.videoHeight;
              ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
              
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert'
              });
              
              if (code && code.data) {
                const qrData = code.data.trim();
                
                if (qrData.toUpperCase().startsWith('UR:')) {
                  const upperQR = qrData.toUpperCase();
                  const multiPartMatch = upperQR.match(/UR:[^/]+\/(\d+)-(\d+)\//);
                  
                  if (multiPartMatch) {
                    const seqLen = parseInt(multiPartMatch[2]);
                    
                    if (decoderRef.current && !hasSubmittedRef.current) {
                      try {
                        decoderRef.current.receivePart(qrData.toLowerCase());
                        
                        const receivedIndexes = decoderRef.current.receivedPartIndexes();
                        const receivedCount = receivedIndexes ? receivedIndexes.length : 0;
                        
                        setScanProgress({ current: receivedCount, total: seqLen });
                        
                        if (decoderRef.current.isComplete()) {
                          hasSubmittedRef.current = true;
                          
                          if (scanIntervalRef.current) {
                            clearInterval(scanIntervalRef.current);
                            scanIntervalRef.current = null;
                          }
                          
                          try {
                            const completeUR = decoderRef.current.resultUR();
                            const completeURString = `ur:${completeUR.type}/${completeUR.cbor.toString('hex')}`;
                            
                            stopCamera();
                            onScan(completeURString);
                          } catch {
                            hasSubmittedRef.current = false;
                          }
                          return;
                        }
                      } catch {
                      }
                    }
                  } else {
                    if (!hasSubmittedRef.current) {
                      hasSubmittedRef.current = true;
                      
                      if (scanIntervalRef.current) {
                        clearInterval(scanIntervalRef.current);
                        scanIntervalRef.current = null;
                      }
                      
                      stopCamera();
                      onScan(qrData);
                    }
                    return;
                  }
                }
              }
            } catch {
            }
          }
        }, 200);
      }
    } catch {
      setError('QR scanning not available. Please ensure you have a modern browser.');
    }
  };

  const stopCamera = () => {
    setIsScanning(false);
    
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsActive(false);
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription className="text-sm">{description}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={handleClose} data-testid="button-close-scanner">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="text-center space-y-4">
              <div className="text-red-600 text-sm">{error}</div>
              <Button onClick={startCamera} className="w-full">
                <Camera className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative bg-black rounded-lg overflow-hidden" style={{ width: '100%', height: '256px' }}>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  style={{ 
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    backgroundColor: '#000'
                  }}
                />
                
                {!isActive && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-white text-center">
                      <Camera className="h-8 w-8 mx-auto mb-2" />
                      <div className="text-sm">Starting camera...</div>
                    </div>
                  </div>
                )}
                
                {/* Scanning overlay */}
                {isActive && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="border-2 border-green-400 border-dashed w-48 h-48 rounded-lg flex items-center justify-center">
                      <div className="text-green-400 text-center text-sm font-medium">
                        {isScanning ? 'Scanning for QR code...' : 'Position QR code here'}
                      </div>
                    </div>
                    
                    {/* Scanning indicator */}
                    {isScanning && !scanProgress && (
                      <div className="absolute top-4 right-4 bg-green-500 text-white px-2 py-1 rounded text-xs">
                        🔍 Scanning...
                      </div>
                    )}
                    
                    {/* Multi-part progress indicator */}
                    {scanProgress && (
                      <div className="absolute top-4 left-4 right-4 bg-blue-500 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-lg">
                        <div className="flex items-center justify-between">
                          <span>Scanning parts...</span>
                          <span className="font-bold">{scanProgress.current}/{scanProgress.total}</span>
                        </div>
                        <div className="mt-1 w-full bg-blue-300 rounded-full h-2">
                          <div 
                            className="bg-white rounded-full h-2 transition-all duration-300"
                            style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              
              {isActive && (
                <div className="text-center space-y-2">
                  <div className="text-sm text-green-600 font-medium">
                    {scanProgress 
                      ? `Collecting QR parts: ${scanProgress.current}/${scanProgress.total}`
                      : 'Camera is active and scanning for QR codes'
                    }
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {scanProgress
                      ? 'Keep the camera steady. The Keystone will cycle through multiple QR codes.'
                      : 'Hold your Keystone device\'s screen steady in front of the camera'
                    }
                  </p>
                </div>
              )}
            </div>
          )}
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} className="flex-1" data-testid="button-cancel-scanner">
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}