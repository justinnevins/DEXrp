import { createPortal } from 'react-dom';
import { useEffect } from 'react';

interface FullscreenQRViewerProps {
  onClose: () => void;
  children: React.ReactNode;
}

export function FullscreenQRViewer({ onClose, children }: FullscreenQRViewerProps) {
  useEffect(() => {
    const handleClose = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    
    const timeoutId = setTimeout(() => {
      document.addEventListener('touchend', handleClose, { capture: true, once: true });
      document.addEventListener('click', handleClose, { capture: true, once: true });
    }, 100);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('touchend', handleClose, { capture: true });
      document.removeEventListener('click', handleClose, { capture: true });
    };
  }, [onClose]);

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] bg-white flex items-center justify-center"
      data-testid="fullscreen-qr-viewer"
    >
      <div 
        className="flex items-center justify-center p-4"
        style={{
          width: 'min(calc(100vw - 32px), calc(100vh - 32px))',
          height: 'min(calc(100vw - 32px), calc(100vh - 32px))',
        }}
      >
        <div className="w-full h-full flex items-center justify-center [&>*]:!w-full [&>*]:!h-full [&>*]:!max-w-full [&>*]:!max-h-full [&_img]:!w-full [&_img]:!h-full [&_img]:!object-contain [&_svg]:!w-full [&_svg]:!h-full [&_canvas]:!w-full [&_canvas]:!h-full">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
