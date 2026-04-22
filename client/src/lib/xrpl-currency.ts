export function formatXRPAmount(drops: string): string {
  return (parseInt(drops) / 1000000).toFixed(6);
}

export function convertXRPToDrops(xrp: string): string {
  // Drops must be integers - round to avoid floating point issues
  return Math.round(parseFloat(xrp) * 1000000).toString();
}

export function encodeCurrency(currencyCode: string): string {
  if (currencyCode.length === 40 && /^[0-9A-F]+$/i.test(currencyCode)) {
    return currencyCode.toUpperCase();
  }
  
  if (currencyCode === 'XRP') {
    return currencyCode;
  }
  
  if (currencyCode.length <= 3 && /^[A-Z]{1,3}$/i.test(currencyCode)) {
    const paddedCode = currencyCode.toUpperCase().padEnd(3, '\0');
    let hex = '';
    for (let i = 0; i < paddedCode.length; i++) {
      hex += paddedCode.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return '00000000000000000000000' + hex.toUpperCase() + '0000000000000000000000';
  }
  
  if (currencyCode.length <= 20) {
    let hex = '';
    for (let i = 0; i < currencyCode.length; i++) {
      hex += currencyCode.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return hex.toUpperCase().padEnd(40, '0');
  }
  
  return currencyCode;
}

export function decodeCurrency(currencyCode: string): string {
  if (!currencyCode) return '';
  
  if (currencyCode.length === 3 && /^[A-Z]{3}$/.test(currencyCode)) {
    return currencyCode;
  }
  
  if (currencyCode === 'XRP') {
    return currencyCode;
  }
  
  if (currencyCode.length === 40 && /^[0-9A-F]+$/i.test(currencyCode)) {
    try {
      const hex = currencyCode.toUpperCase();
      
      let decoded = '';
      for (let i = 0; i < hex.length; i += 2) {
        const byte = parseInt(hex.substr(i, 2), 16);
        if (byte === 0) continue;
        if (byte >= 32 && byte <= 126) {
          decoded += String.fromCharCode(byte);
        }
      }
      
      decoded = decoded.trim().replace(/\0/g, '');
      
      if (decoded.length > 0 && decoded.length <= 20 && /^[A-Za-z0-9]+$/.test(decoded)) {
        return decoded;
      }
      
      return currencyCode.slice(0, 8) + '...';
    } catch {
      return currencyCode.slice(0, 8) + '...';
    }
  }
  
  if (currencyCode.length > 10) {
    return currencyCode.slice(0, 8) + '...';
  }
  
  return currencyCode;
}

export function getAmountValue(amount: any, formatXRP: (drops: string) => string): number {
  if (typeof amount === 'string') {
    return parseFloat(formatXRP(amount));
  }
  return parseFloat(amount.value);
}
