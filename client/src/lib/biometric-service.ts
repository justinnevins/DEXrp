class BiometricService {
  private isEnabled: boolean = false;
  private credentialId: string | null = null;

  constructor() {
    this.isEnabled = localStorage.getItem('biometric_enabled') === 'true';
    this.credentialId = localStorage.getItem('biometric_credential_id');
  }

  async isAvailable(): Promise<boolean> {
    if (!window.PublicKeyCredential) {
      return false;
    }

    try {
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      return available;
    } catch {
      return false;
    }
  }

  async register(): Promise<void> {
    const isAvailable = await this.isAvailable();
    if (!isAvailable) {
      throw new Error('Biometric authentication is not available on this device');
    }

    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      const userId = new Uint8Array(32);
      window.crypto.getRandomValues(userId);

      const createCredentialOptions: CredentialCreationOptions = {
        publicKey: {
          challenge,
          rp: {
            name: "XRPL Wallet",
            id: window.location.hostname,
          },
          user: {
            id: userId,
            name: "wallet-user",
            displayName: "Wallet User",
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" }, // ES256
            { alg: -257, type: "public-key" }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            requireResidentKey: false,
          },
          timeout: 60000,
          attestation: "none",
        },
      };

      const credential = await navigator.credentials.create(createCredentialOptions) as PublicKeyCredential;

      if (!credential) {
        throw new Error('Failed to create credential');
      }

      this.credentialId = credential.id;
      this.isEnabled = true;
      localStorage.setItem('biometric_enabled', 'true');
      localStorage.setItem('biometric_credential_id', credential.id);
    } catch {
      throw new Error('Failed to register biometric authentication. Please try again.');
    }
  }

  async authenticate(): Promise<boolean> {
    if (!this.isEnabled || !this.credentialId) {
      throw new Error('Biometric authentication not set up');
    }

    const isAvailable = await this.isAvailable();
    if (!isAvailable) {
      throw new Error('Biometric authentication is not available');
    }

    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      const getCredentialOptions: CredentialRequestOptions = {
        publicKey: {
          challenge,
          allowCredentials: [
            {
              id: new TextEncoder().encode(this.credentialId),
              type: "public-key",
            },
          ],
          userVerification: "required",
          timeout: 60000,
        },
      };

      const assertion = await navigator.credentials.get(getCredentialOptions);
      return assertion !== null;
    } catch {
      return false;
    }
  }

  enable() {
    this.isEnabled = true;
    localStorage.setItem('biometric_enabled', 'true');
  }

  disable() {
    this.isEnabled = false;
    this.credentialId = null;
    localStorage.setItem('biometric_enabled', 'false');
    localStorage.removeItem('biometric_credential_id');
  }

  isSetup(): boolean {
    return this.isEnabled && this.credentialId !== null;
  }

  getStatus(): 'available' | 'not-supported' | 'not-setup' | 'enabled' {
    if (!window.PublicKeyCredential) {
      return 'not-supported';
    }
    
    if (!this.isEnabled || !this.credentialId) {
      return 'not-setup';
    }
    
    return 'enabled';
  }
}

export const biometricService = new BiometricService();