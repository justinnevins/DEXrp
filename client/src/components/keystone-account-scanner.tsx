import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Camera, X } from 'lucide-react';
import jsQR from 'jsqr';

interface KeystoneAccountScannerProps {
  onScan: (address: string, publicKey: string) => void;
  onClose: () => void;
}

export function KeystoneAccountScanner({ onScan, onClose }: KeystoneAccountScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const hasScannedRef = useRef(false);

  // Don't auto-start camera - iOS requires user gesture
  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, []);

  const startScanning = async () => {
    console.log('[KeystoneScanner] startScanning called');
    if (!videoRef.current || !canvasRef.current) {
      console.log('[KeystoneScanner] ERROR: refs not available');
      return;
    }

    try {
      setError(null);
      hasScannedRef.current = false;
      setCameraReady(false);

      console.log('[KeystoneScanner] Requesting camera access...');
      
      // Try environment camera first, fall back to any camera
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
      } catch (envError) {
        console.log('[KeystoneScanner] Environment camera failed, trying any camera:', envError);
        stream = await navigator.mediaDevices.getUserMedia({
          video: true
        });
      }

      console.log('[KeystoneScanner] Camera stream obtained:', stream.getVideoTracks().length, 'video tracks');
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      
      // iOS requires these attributes set before play
      videoRef.current.setAttribute('playsinline', 'true');
      videoRef.current.setAttribute('webkit-playsinline', 'true');
      videoRef.current.playsInline = true;
      videoRef.current.muted = true;

      // Wait for video to be ready
      await new Promise<void>((resolve, reject) => {
        const video = videoRef.current!;
        
        const onCanPlay = () => {
          video.removeEventListener('canplay', onCanPlay);
          video.removeEventListener('error', onError);
          resolve();
        };
        
        const onError = (e: Event) => {
          video.removeEventListener('canplay', onCanPlay);
          video.removeEventListener('error', onError);
          reject(new Error('Video failed to load'));
        };
        
        video.addEventListener('canplay', onCanPlay);
        video.addEventListener('error', onError);
        
        // Also check if already ready
        if (video.readyState >= 3) {
          video.removeEventListener('canplay', onCanPlay);
          video.removeEventListener('error', onError);
          resolve();
        }
      });

      console.log('[KeystoneScanner] Video ready, attempting to play');
      
      // Play the video (this should work now that it's from a user gesture)
      await videoRef.current.play();
      
      console.log('[KeystoneScanner] Video playing, starting jsQR scanning');
      setCameraReady(true);
      setIsScanning(true);
      startJsQRScanning();
      
    } catch (err: any) {
      console.log('[KeystoneScanner] Camera access failed:', err);
      
      let errorMessage = 'Failed to access camera.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMessage = 'Camera permission denied. Please allow camera access in your browser settings and try again.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMessage = 'No camera found on this device.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMessage = 'Camera is in use by another application. Please close other apps using the camera.';
      } else if (err.name === 'OverconstrainedError') {
        errorMessage = 'Camera does not support the required settings.';
      } else if (err.message) {
        errorMessage = `Camera error: ${err.message}`;
      }
      
      setError(errorMessage);
      setIsScanning(false);
      setCameraReady(false);
    }
  };

  const startJsQRScanning = () => {
    console.log('[KeystoneScanner] startJsQRScanning called - using jsQR (no web worker)');
    let scanCount = 0;
    
    const tick = () => {
      if (hasScannedRef.current) return;
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if (!video || !canvas) {
        animationFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          animationFrameRef.current = requestAnimationFrame(tick);
          return;
        }
        
        // Set canvas size to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Get image data for jsQR
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Scan with jsQR (pure JavaScript, no web worker)
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });
        
        scanCount++;
        if (scanCount % 30 === 1) {
          console.log('[KeystoneScanner] jsQR scanning, frame:', scanCount, 'dimensions:', canvas.width, 'x', canvas.height);
        }
        
        if (code) {
          console.log('[KeystoneScanner] jsQR detected QR:', code.data?.substring(0, 50) + '...');
          if (!hasScannedRef.current) {
            handleScanResult(code.data);
          }
          return; // Stop scanning after detection
        }
      }
      
      animationFrameRef.current = requestAnimationFrame(tick);
    };
    
    animationFrameRef.current = requestAnimationFrame(tick);
  };

  const stopScanning = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
    setCameraReady(false);
  };

  const handleScanResult = async (data: string) => {
    console.log('[KeystoneScanner] handleScanResult called with data:', data?.substring(0, 80) + '...');
    if (hasScannedRef.current) {
      console.log('[KeystoneScanner] Already scanned, ignoring');
      return;
    }

    try {
      // Handle Keystone UR format (case insensitive)
      const upperData = data.toUpperCase();
      console.log('[KeystoneScanner] Checking if data starts with UR:BYTES/ or UR:XRP-ACCOUNT/');
      
      if (upperData.startsWith('UR:BYTES/') || upperData.startsWith('UR:XRP-ACCOUNT/')) {
        console.log('[KeystoneScanner] Valid UR format detected, parsing...');
        const urData = await parseKeystoneAccountUR(data);
        if (urData) {
          console.log('[KeystoneScanner] Successfully parsed UR data:', urData.address);
          hasScannedRef.current = true;
          stopScanning();
          onScan(urData.address, urData.publicKey);
          return;
        } else {
          console.log('[KeystoneScanner] Failed to parse UR data');
          setError('Could not parse the Keystone UR data. Please ensure your device is displaying the account QR code.');
          return;
        }
      }

      console.log('[KeystoneScanner] Data does not match expected UR format');
      setError('Please scan the account QR code from your Keystone 3 Pro device. Looking for UR:BYTES/ format.');
    } catch (err) {
      console.log('[KeystoneScanner] Error in handleScanResult:', err);
      setError('Invalid QR code format. Please scan the account QR from Keystone 3 Pro.');
    }
  };

  const parseKeystoneAccountUR = async (urData: string): Promise<{ address: string; publicKey: string } | null> => {
    try {
      const upperData = urData.toUpperCase();
      
      if (upperData.startsWith('UR:BYTES/') || upperData.startsWith('UR:XRP-ACCOUNT/')) {
        const urContent = urData.substring(urData.indexOf('/') + 1);
        
        // @ts-ignore - cbor-web doesn't have TypeScript types
        const { decode: cborDecode } = await import('cbor-web');
        
        // BC-UR Bytewords - complete 256-word table (BCR-2020-012 official specification)
        const bytewords = [
          "able", "acid", "also", "apex", "aqua", "arch", "atom", "aunt",  // 0x00-0x07
          "away", "axis", "back", "bald", "barn", "belt", "beta", "bias",  // 0x08-0x0F
          "blue", "body", "brag", "brew", "bulb", "buzz", "calm", "cash",  // 0x10-0x17
          "cats", "chef", "city", "claw", "code", "cola", "cook", "cost",  // 0x18-0x1F
          "crux", "curl", "cusp", "cyan", "dark", "data", "days", "deli",  // 0x20-0x27
          "dice", "diet", "door", "down", "draw", "drop", "drum", "dull",  // 0x28-0x2F
          "duty", "each", "easy", "echo", "edge", "epic", "even", "exam",  // 0x30-0x37
          "exit", "eyes", "fact", "fair", "fern", "figs", "film", "fish",  // 0x38-0x3F
          "fizz", "flap", "flew", "flux", "foxy", "free", "frog", "fuel",  // 0x40-0x47
          "fund", "gala", "game", "gear", "gems", "gift", "girl", "glow",  // 0x48-0x4F
          "good", "gray", "grim", "guru", "gush", "gyro", "half", "hang",  // 0x50-0x57
          "hard", "hawk", "heat", "help", "high", "hill", "holy", "hope",  // 0x58-0x5F
          "horn", "huts", "iced", "idea", "idle", "inch", "inky", "into",  // 0x60-0x67
          "iris", "iron", "item", "jade", "jazz", "join", "jolt", "jowl",  // 0x68-0x6F
          "judo", "jugs", "jump", "junk", "jury", "keep", "keno", "kept",  // 0x70-0x77
          "keys", "kick", "kiln", "king", "kite", "kiwi", "knob", "lamb",  // 0x78-0x7F
          "lava", "lazy", "leaf", "legs", "liar", "limp", "lion", "list",  // 0x80-0x87
          "logo", "loud", "love", "luau", "luck", "lung", "main", "many",  // 0x88-0x8F
          "math", "maze", "memo", "menu", "meow", "mild", "mint", "miss",  // 0x90-0x97
          "monk", "nail", "navy", "need", "news", "next", "noon", "note",  // 0x98-0x9F
          "numb", "obey", "oboe", "omit", "onyx", "open", "oval", "owls",  // 0xA0-0xA7
          "paid", "part", "peck", "play", "plus", "poem", "pool", "pose",  // 0xA8-0xAF
          "puff", "puma", "purr", "quad", "quiz", "race", "ramp", "real",  // 0xB0-0xB7
          "redo", "rich", "road", "rock", "roof", "ruby", "ruin", "runs",  // 0xB8-0xBF
          "rust", "safe", "saga", "scar", "sets", "silk", "skew", "slot",  // 0xC0-0xC7
          "soap", "solo", "song", "stub", "surf", "swan", "taco", "task",  // 0xC8-0xCF
          "taxi", "tent", "tied", "time", "tiny", "toil", "tomb", "toys",  // 0xD0-0xD7
          "trip", "tuna", "twin", "ugly", "undo", "unit", "urge", "user",  // 0xD8-0xDF
          "vast", "very", "veto", "vial", "vibe", "view", "visa", "void",  // 0xE0-0xE7
          "vows", "wall", "wand", "warm", "wasp", "wave", "waxy", "webs",  // 0xE8-0xEF
          "what", "when", "whiz", "wolf", "work", "yank", "yawn", "yell",  // 0xF0-0xF7
          "yoga", "yurt", "zaps", "zero", "zest", "zinc", "zone", "zoom"   // 0xF8-0xFF
        ];
        
        // Build minimal bytewords lookup (first + last letter → byte value)
        const minimalLookup: Record<string, number> = {};
        for (let i = 0; i < bytewords.length; i++) {
          const word = bytewords[i];
          const minimal = word[0] + word[word.length - 1];
          minimalLookup[minimal] = i;
        }
        
        // Decode bytewords minimal format (2 chars per byte)
        const urContentLower = urContent.toLowerCase();
        const bytes: number[] = [];
        
        for (let i = 0; i < urContentLower.length; i += 2) {
          const pair = urContentLower.substring(i, i + 2);
          const byteValue = minimalLookup[pair];
          
          if (byteValue === undefined) {
            continue;
          }
          
          bytes.push(byteValue);
        }
        
        const decodedBytes = new Uint8Array(bytes);
        
        const dataWithoutCRC = decodedBytes.length >= 4 
          ? decodedBytes.slice(0, -4) 
          : decodedBytes;
        
        try {
          const textDecoder = new TextDecoder();
          let jsonString = textDecoder.decode(dataWithoutCRC);
          
          const jsonStart = jsonString.indexOf('{');
          if (jsonStart > 0) {
            jsonString = jsonString.substring(jsonStart);
          }
          
          const parsed = JSON.parse(jsonString);
          
          const address = parsed.address || parsed.Address || parsed.classic_address;
          const publicKey = parsed.pubkey || parsed.publicKey || parsed.PublicKey || parsed.pubKey || parsed.public_key || parsed.key;
          
          if (address && publicKey) {
            return { address, publicKey };
          }
        } catch {
        }
        
        try {
          const cborData = cborDecode(dataWithoutCRC);
          const extractFromData = (data: any): { address: string; publicKey: string } | null => {
            if (!data) return null;
            
            // Direct properties (check various naming conventions)
            const address = data.address || data.Address || data.addr || data.classic_address;
            const publicKey = data.publicKey || data.PublicKey || data.pubKey || data.key || data.public_key;
            
            // Try to extract from Uint8Array if present
            let addressStr = address;
            let publicKeyStr = publicKey;
            
            if (address instanceof Uint8Array) {
              addressStr = new TextDecoder().decode(address);
            }
            
            if (publicKey instanceof Uint8Array) {
              publicKeyStr = Array.from(publicKey).map(b => b.toString(16).padStart(2, '0')).join('');
            }
            
            if (addressStr && publicKeyStr) {
              return { address: addressStr, publicKey: publicKeyStr };
            }
            
            // Check arrays
            if (Array.isArray(data)) {
              for (const item of data) {
                const result = extractFromData(item);
                if (result) return result;
              }
            }
            
            // Check nested objects
            if (typeof data === 'object') {
              for (const key in data) {
                const result = extractFromData(data[key]);
                if (result) return result;
              }
            }
            
            return null;
          };
          
          const extracted = extractFromData(cborData);
          if (extracted) {
            return extracted;
          }
        } catch {
        }
      }

      return null;
    } catch {
      return null;
    }
  };

  const extractAccountInfo = (decoded: any): { address: string; publicKey: string } | null => {
    let address = null;
    let publicKey = null;
    
    // Search for address and public key in the decoded structure
    const searchObject = (obj: any): void => {
      if (typeof obj === 'object' && obj !== null) {
        if (Array.isArray(obj)) {
          obj.forEach(searchObject);
        } else {
          for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
              // Check for XRP address pattern
              if (value.match(/^r[1-9A-HJ-NP-Za-km-z]{25,34}$/)) {
                address = value;
              }
              // Check for public key pattern
              if (value.match(/^[0-9a-fA-F]{66}$/)) {
                publicKey = value;
              }
            } else if (typeof value === 'object') {
              searchObject(value);
            }
          }
        }
      }
    };
    
    searchObject(decoded);
    
    if (address && publicKey) {
      return { address, publicKey };
    }
    
    return null;
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-semibold">Scan Keystone Account</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 w-8 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          <p><strong>Step 1:</strong> On your Keystone 3 Pro, go to "..." select "Connect Software Wallet"</p>
          <p><strong>Step 2:</strong> Select "XRP Toolkit"</p>
          <p><strong>Step 3:</strong> Select the account/address from the list to display the account QR code</p>
          <p><strong>Step 4:</strong> Scan that QR code with the camera below</p>
          <p className="text-xs mt-2 text-amber-600">Note: You must follow these instructions exactly. The simple account address QR code will not work.</p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="relative">
          <video
            ref={videoRef}
            className="w-full h-64 bg-black rounded-lg object-cover"
            playsInline
            muted
            autoPlay={false}
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          {!cameraReady && !isScanning && (
            <button
              onClick={startScanning}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-lg cursor-pointer hover:bg-black/70 transition-colors"
            >
              <Camera className="h-12 w-12 text-white mb-2" />
              <span className="text-white font-medium">Tap to Start Camera</span>
              <span className="text-white/70 text-sm mt-1">Camera access required</span>
            </button>
          )}
          {cameraReady && isScanning && (
            <div className="absolute bottom-2 left-2 right-2 bg-green-500/80 text-white text-center py-1 px-2 rounded text-sm">
              Scanning... Point at QR code
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {cameraReady ? (
            <Button
              onClick={stopScanning}
              variant="outline"
              className="flex-1"
            >
              Stop Camera
            </Button>
          ) : (
            <Button
              onClick={startScanning}
              disabled={isScanning}
              variant="outline"
              className="flex-1"
            >
              <Camera className="h-4 w-4 mr-2" />
              {isScanning ? 'Starting...' : 'Start Camera'}
            </Button>
          )}
          <Button onClick={onClose} variant="secondary" className="flex-1">
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
