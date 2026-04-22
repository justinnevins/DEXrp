import KeystoneSDK from '@keystonehq/keystone-sdk';
import { URDecoder, UR } from '@ngraveio/bc-ur';
import { Buffer } from 'buffer';

interface XrpTransaction {
  TransactionType: string;
  Account: string;
  Fee: string | number;
  Sequence: number;
  LastLedgerSequence: number;
  Flags?: number;
  Amount?: string | { currency: string; value: string; issuer: string };
  Destination?: string;
  DestinationTag?: number;
  LimitAmount?: { currency: string; value: string; issuer: string };
  TakerGets?: string | { currency: string; value: string; issuer: string };
  TakerPays?: string | { currency: string; value: string; issuer: string };
  OfferSequence?: number;
  SigningPubKey?: string;
}

interface SignRequestResult {
  type: string;
  cbor: string;
  requestId: string;
}

interface SignatureResult {
  signature: string;
  requestId: string;
}

/**
 * Prepares an XRP transaction for signing by Keystone hardware wallet.
 * Generates a UR-encoded sign request that can be displayed as an animated QR code.
 * 
 * @param transaction - The XRP transaction to prepare for signing
 * @returns SignRequestResult containing the UR type, CBOR hex data, and a unique request ID
 * @throws Error if transaction formatting fails
 * 
 * @example
 * const { type, cbor, requestId } = prepareXrpSignRequest({
 *   TransactionType: 'Payment',
 *   Account: 'rXXXXX...',
 *   Destination: 'rYYYYY...',
 *   Amount: '1000000',
 *   Fee: '12',
 *   Sequence: 100,
 *   LastLedgerSequence: 50000
 * });
 */
export function prepareXrpSignRequest(transaction: XrpTransaction): SignRequestResult {
  // Validate SigningPubKey is present - required for Keystone 3 Pro
  if (!transaction.SigningPubKey) {
    throw new Error('SigningPubKey is required for Keystone signing. The wallet may be missing its public key - please reconnect your Keystone device.');
  }

  const keystoneSDK = new KeystoneSDK();
  
  const xrpTransaction: any = {
    ...transaction,
    Fee: String(transaction.Fee),
    Sequence: Number(transaction.Sequence),
    LastLedgerSequence: Number(transaction.LastLedgerSequence)
  };

  // Ensure numeric types for fields that Keystone requires as numbers
  if (transaction.OfferSequence !== undefined) {
    xrpTransaction.OfferSequence = Number(transaction.OfferSequence);
  }
  if (transaction.DestinationTag !== undefined) {
    xrpTransaction.DestinationTag = Number(transaction.DestinationTag);
  }
  if ((transaction as any).Expiration !== undefined) {
    xrpTransaction.Expiration = Number((transaction as any).Expiration);
  }

  if (transaction.Flags !== undefined && transaction.Flags !== null) {
    // Ensure Flags is an unsigned 32-bit integer (XRPL requires positive flag values)
    xrpTransaction.Flags = Number(transaction.Flags) >>> 0;
  }

  if (transaction.TransactionType === 'Payment' && transaction.Amount) {
    if (typeof transaction.Amount === 'object') {
      xrpTransaction.Amount = transaction.Amount;
    } else {
      xrpTransaction.Amount = String(transaction.Amount);
    }
  }
  
  // Handle OfferCreate TakerGets and TakerPays fields
  if (transaction.TransactionType === 'OfferCreate') {
    if (transaction.TakerGets) {
      if (typeof transaction.TakerGets === 'object') {
        xrpTransaction.TakerGets = {
          currency: transaction.TakerGets.currency,
          value: String(transaction.TakerGets.value),
          issuer: transaction.TakerGets.issuer
        };
      } else {
        xrpTransaction.TakerGets = String(transaction.TakerGets);
      }
    }
    if (transaction.TakerPays) {
      if (typeof transaction.TakerPays === 'object') {
        xrpTransaction.TakerPays = {
          currency: transaction.TakerPays.currency,
          value: String(transaction.TakerPays.value),
          issuer: transaction.TakerPays.issuer
        };
      } else {
        xrpTransaction.TakerPays = String(transaction.TakerPays);
      }
    }
  }
  
  const ur = keystoneSDK.xrp.generateSignRequest(xrpTransaction);
  
  return {
    type: ur.type,
    cbor: ur.cbor.toString('hex'),
    requestId: crypto.randomUUID()
  };
}

/**
 * Parses a signed transaction response from Keystone hardware wallet.
 * Decodes UR-encoded data scanned from Keystone's QR display.
 * 
 * Supports both single-part and multi-part URs, as well as hex and Bytewords encodings.
 * Keystone returns complete XRPL serialized signed transaction blobs (starting with 
 * transaction type prefix like `1200`), which can be submitted directly to XRPL nodes.
 * 
 * @param urString - The UR-encoded string scanned from Keystone (format: ur:bytes/...)
 * @returns SignatureResult containing the signed transaction blob and request ID
 * @throws Error if UR format is invalid or decoding fails
 * 
 * @example
 * const { signature, requestId } = parseKeystoneSignature('ur:bytes/5820abc123...');
 * await xrplClient.submitTransaction(signature);
 */
export function parseKeystoneSignature(urString: string): SignatureResult {
  try {
    const keystoneSDK = new KeystoneSDK();
    
    const isSinglePart = !urString.match(/ur:[^/]+\/\d+-\d+\//i);
    
    let decodedUR: any;
    
    if (isSinglePart) {
      const match = urString.toLowerCase().match(/^ur:([^/]+)\/(.+)$/);
      if (!match) {
        throw new Error('Invalid UR format');
      }
      
      const [, type, payload] = match;
      
      const isHex = /^[0-9a-f]+$/i.test(payload);
      
      if (isHex) {
        const cborBytes = new Uint8Array(payload.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
        decodedUR = {
          type: type,
          cbor: cborBytes
        };
      } else {
        const decoder = new URDecoder();
        decoder.receivePart(urString.toUpperCase());
        
        if (!decoder.isComplete()) {
          throw new Error('UR decoding incomplete');
        }
        
        decodedUR = decoder.resultUR();
      }
    } else {
      const decoder = new URDecoder();
      decoder.receivePart(urString.toUpperCase());
      
      if (!decoder.isComplete()) {
        throw new Error('UR decoding incomplete - multi-part UR requires all fragments');
      }
      
      decodedUR = decoder.resultUR();
    }
    
    // Get type as string
    let typeString: string;
    if (typeof decodedUR.type === 'string') {
      typeString = decodedUR.type;
    } else if (decodedUR.type instanceof Uint8Array || ArrayBuffer.isView(decodedUR.type)) {
      typeString = new TextDecoder().decode(decodedUR.type);
    } else {
      typeString = String(decodedUR.type);
    }
    
    // Get CBOR as Uint8Array
    let cborBytes: Uint8Array;
    if (decodedUR.cbor instanceof Uint8Array) {
      cborBytes = decodedUR.cbor;
    } else if (ArrayBuffer.isView(decodedUR.cbor)) {
      cborBytes = new Uint8Array(decodedUR.cbor.buffer, decodedUR.cbor.byteOffset, decodedUR.cbor.byteLength);
    } else {
      cborBytes = new Uint8Array(decodedUR.cbor);
    }
    
    const cborHex = Array.from(cborBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    
    const cborBuffer = Buffer.from(cborHex, 'hex');
    const ur = new UR(cborBuffer, typeString);
    
    try {
      const signature = keystoneSDK.xrp.parseSignature(ur);
      
      const parsedSignature: any = signature;
      return {
        signature: typeof parsedSignature === 'string' ? parsedSignature : parsedSignature.signature,
        requestId: typeof parsedSignature === 'object' && parsedSignature.requestId ? parsedSignature.requestId : crypto.randomUUID()
      };
    } catch {
      if (cborHex.startsWith('58') || cborHex.startsWith('59')) {
        let signedTxBlob: string;
        if (cborHex.startsWith('58')) {
          const length = parseInt(cborHex.substring(2, 4), 16);
          signedTxBlob = cborHex.substring(4, 4 + length * 2);
        } else {
          const length = parseInt(cborHex.substring(2, 6), 16);
          signedTxBlob = cborHex.substring(6, 6 + length * 2);
        }
        
        return {
          signature: signedTxBlob,
          requestId: crypto.randomUUID()
        };
      }
      
      return {
        signature: cborHex,
        requestId: crypto.randomUUID()
      };
    }
  } catch (error) {
    throw error;
  }
}
