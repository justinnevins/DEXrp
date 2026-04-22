import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Camera, X, Scan } from 'lucide-react';
import QrScanner from 'qr-scanner';
import jsQR from 'jsqr';
import { xrplClient } from '@/lib/xrpl-client';

const isDev = import.meta.env.DEV;
const log = (...args: any[]) => isDev && console.log('[GeneralQRScanner]', ...args);

type ScanMode = 'address' | 'generic' | 'ur-code';

interface GeneralQRScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
  mode?: ScanMode;
  title?: string;
  description?: string;
  showKeystoneInstructions?: boolean;
}

function extractAddressFromQRData(data: string): string | null {
  let trimmed = data.trim();
  
  if (trimmed.toLowerCase().startsWith('ripple:')) {
    trimmed = trimmed.substring(7);
    const questionMarkIndex = trimmed.indexOf('?');
    if (questionMarkIndex > 0) {
      trimmed = trimmed.substring(0, questionMarkIndex);
    }
  }
  
  if (trimmed.startsWith('r') && trimmed.length >= 25 && trimmed.length <= 35) {
    return trimmed;
  }
  
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.address && typeof parsed.address === 'string' && parsed.address.startsWith('r')) {
        return parsed.address;
      }
    } catch {
    }
  }
  
  return null;
}

function validateXrplAddress(address: string): boolean {
  return xrplClient.isValidAddress(address);
}

const MODE_CONFIG: Record<ScanMode, {
  defaultTitle: string;
  defaultDescription: string;
  manualEntryLabel: string;
  manualEntryPrompt: string;
  errorMessage: string;
}> = {
  address: {
    defaultTitle: 'Scan Account Address',
    defaultDescription: 'Use your camera to scan the QR code or enter manually',
    manualEntryLabel: 'Enter Address Manually',
    manualEntryPrompt: 'Enter XRPL account address (starting with "r"):',
    errorMessage: 'Please enter a valid XRPL address starting with "r"'
  },
  generic: {
    defaultTitle: 'Scan QR Code',
    defaultDescription: 'Position the QR code within the camera view',
    manualEntryLabel: 'Enter Data Manually',
    manualEntryPrompt: 'Enter the QR code data:',
    errorMessage: 'Invalid data'
  },
  'ur-code': {
    defaultTitle: 'Scan Signed Transaction',
    defaultDescription: 'Scan the signed transaction QR from your hardware wallet',
    manualEntryLabel: 'Enter Signed Data Manually',
    manualEntryPrompt: 'Paste the signed transaction UR code (format: UR:BYTES/...):',
    errorMessage: 'Invalid format. Please enter the complete UR code starting with "UR:"'
  }
};

export function GeneralQRScanner({ 
  onScan, 
  onClose, 
  mode = 'generic',
  title,
  description,
  showKeystoneInstructions = false
}: GeneralQRScannerProps) {
  const config = MODE_CONFIG[mode];
  const displayTitle = title || config.defaultTitle;
  const displayDescription = description || config.defaultDescription;

  const validateAndProcessData = useCallback((data: string): string | null => {
    if (mode === 'address') {
      const address = extractAddressFromQRData(data);
      if (address && validateXrplAddress(address)) {
        return address;
      }
      return null;
    }
    
    if (mode === 'ur-code') {
      if (data.toUpperCase().startsWith('UR:')) {
        return data;
      }
      return null;
    }
    
    return data;
  }, [mode]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const frameAnalysisRef = useRef<number | null>(null);
  const hasScannedRef = useRef<boolean>(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraStarted, setCameraStarted] = useState(false);

  const handleSuccessfulScan = useCallback((validatedData: string) => {
    if (hasScannedRef.current) return;
    hasScannedRef.current = true;
    onScan(validatedData);
    cleanup();
  }, [onScan]);

  // Don't auto-start camera - iOS requires user gesture
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const initCamera = async () => {
    try {
      setCameraStarted(true);
      
      // Try environment camera first, fall back to any camera
      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
      } catch (envError) {
        console.log('[GeneralQRScanner] Environment camera failed, trying any camera');
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true
        });
      }

      setStream(mediaStream);
      
      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = mediaStream;
        
        // iOS requires these attributes
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.playsInline = true;
        video.muted = true;
        
        // Wait for video to be ready
        await new Promise<void>((resolve, reject) => {
          const onCanPlay = () => {
            video.removeEventListener('canplay', onCanPlay);
            video.removeEventListener('error', onError);
            resolve();
          };
          
          const onError = () => {
            video.removeEventListener('canplay', onCanPlay);
            video.removeEventListener('error', onError);
            reject(new Error('Video failed to load'));
          };
          
          video.addEventListener('canplay', onCanPlay);
          video.addEventListener('error', onError);
          
          if (video.readyState >= 3) {
            video.removeEventListener('canplay', onCanPlay);
            video.removeEventListener('error', onError);
            resolve();
          }
        });
        
        await video.play();
        setIsActive(true);
        setError(null);
        
        setTimeout(() => {
          startQRDetection();
        }, 300);
      }

    } catch (err: any) {
      let errorMessage = 'Failed to access camera.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMessage = 'Camera permission denied. Please allow camera access in your browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMessage = 'No camera found on this device.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMessage = 'Camera is in use by another application.';
      } else if (err.message) {
        errorMessage = `Camera error: ${err.message}`;
      }
      setError(errorMessage);
      setCameraStarted(false);
    }
  };

  const startCanvasAnalysis = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    log('Starting canvas analysis with jsQR');
    let frameCount = 0;

    const analyzeFrame = () => {
      if (!videoRef.current || !canvasRef.current || hasScannedRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      if (!ctx || video.readyState < 2 || video.videoWidth === 0) {
        frameAnalysisRef.current = requestAnimationFrame(analyzeFrame);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      frameCount++;
      
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert'
        });
        
        if (code && code.data) {
          log('jsQR detected code:', code.data.substring(0, 50));
          const validatedData = validateAndProcessData(code.data);
          if (validatedData) {
            handleSuccessfulScan(validatedData);
            return;
          }
        }
      } catch (err) {
        if (frameCount % 100 === 0) {
          log('jsQR analysis error:', err);
        }
      }

      if (!hasScannedRef.current) {
        frameAnalysisRef.current = requestAnimationFrame(analyzeFrame);
      }
    };

    frameAnalysisRef.current = requestAnimationFrame(analyzeFrame);
  };

  const startQRDetection = () => {
    if (!videoRef.current) return;

    try {
      scannerRef.current = new QrScanner(
        videoRef.current,
        (result: any) => {
          if (hasScannedRef.current) return;
          
          const qrData = (typeof result === 'string' ? result : (result.data || String(result))).trim();
          const validatedData = validateAndProcessData(qrData);
          if (validatedData) {
            handleSuccessfulScan(validatedData);
          }
        },
        {
          returnDetailedScanResult: true,
          maxScansPerSecond: 5,
          highlightScanRegion: true,
          highlightCodeOutline: true
        }
      );

      if (scannerRef.current) {
        scannerRef.current.setInversionMode('both');
      }

      scannerRef.current.start().then(() => {
        setIsScanning(true);
        startCanvasAnalysis();
      }).catch(() => {
        startCanvasAnalysis();
      });

    } catch {
      setError('Failed to setup QR detection');
      startCanvasAnalysis();
    }
  };

  const cleanup = () => {
    if (frameAnalysisRef.current) {
      cancelAnimationFrame(frameAnalysisRef.current);
      frameAnalysisRef.current = null;
    }
    if (scannerRef.current) {
      scannerRef.current.stop();
      scannerRef.current.destroy();
      scannerRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    setStream(null);
    setIsActive(false);
    setIsScanning(false);
  };

  const handleManualEntry = () => {
    const input = prompt(config.manualEntryPrompt);
    if (input && input.trim()) {
      const validatedData = validateAndProcessData(input.trim());
      if (validatedData) {
        handleSuccessfulScan(validatedData);
      } else {
        alert(config.errorMessage);
      }
    }
  };

  const handleClose = () => {
    cleanup();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[9999] p-4" style={{ pointerEvents: 'auto' }}>
      <Card className="w-full max-w-md bg-white dark:bg-gray-900">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-lg">{displayTitle}</CardTitle>
            <CardDescription className="text-sm">{displayDescription}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={handleClose} data-testid="button-close-scanner">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        
        <CardContent>
          {error ? (
            <div className="space-y-4">
              <div className="text-red-600 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded">{error}</div>
              <Button onClick={initCamera} className="w-full">
                <Camera className="h-4 w-4 mr-2" />
                Try Camera Again
              </Button>
              <Button onClick={handleManualEntry} variant="outline" className="w-full">
                {config.manualEntryLabel}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div 
                className="relative border-2 border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden mx-auto"
                style={{ 
                  width: '280px', 
                  height: '280px',
                  backgroundColor: '#000'
                }}
              >
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay={false}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block'
                  }}
                />
                
                {!cameraStarted && !isActive && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      initCamera();
                    }}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-80 cursor-pointer hover:bg-opacity-70 transition-colors"
                    style={{ pointerEvents: 'auto' }}
                  >
                    <Camera className="h-10 w-10 text-white mb-2" />
                    <span className="text-white font-medium">Tap to Start Camera</span>
                    <span className="text-white/70 text-xs mt-1">Camera access required</span>
                  </button>
                )}
                
                {cameraStarted && !isActive && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="text-white text-center">
                      <Camera className="h-8 w-8 mx-auto mb-2 animate-pulse" />
                      <div className="text-sm">Starting camera...</div>
                    </div>
                  </div>
                )}

                {isActive && (
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-4 border-2 border-green-400 border-dashed rounded-lg flex items-center justify-center">
                      <span className="text-green-400 text-xs bg-black bg-opacity-50 px-2 py-1 rounded">
                        {isScanning ? 'Scanning...' : 'Position QR code here'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <canvas ref={canvasRef} style={{ display: 'none' }} />

              {showKeystoneInstructions && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 rounded-lg">
                  <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                    On your Keystone Pro 3:
                  </p>
                  <ol className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                    <li>1. Navigate to XRP account</li>
                    <li>2. Display account address QR code</li>
                    <li>3. Position QR code in camera view</li>
                  </ol>
                </div>
              )}

              {isActive && (
                <div className="text-center mb-3">
                  {isScanning ? (
                    <div className="text-green-600 dark:text-green-400 text-sm">
                      Actively scanning for QR codes...
                    </div>
                  ) : (
                    <div className="text-blue-600 dark:text-blue-400 text-sm">
                      Camera ready
                    </div>
                  )}
                </div>
              )}

              {isActive && (
                <Button onClick={handleManualEntry} variant="outline" className="w-full">
                  <Scan className="h-4 w-4 mr-2" />
                  {config.manualEntryLabel}
                </Button>
              )}
            </div>
          )}
          
          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={handleClose} className="flex-1" data-testid="button-cancel-scanner">
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
