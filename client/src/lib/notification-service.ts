import { AddressFormat } from './format-address';

class NotificationService {
  private isEnabled: boolean = false;
  private previousTransactionCount: number = 0;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.isEnabled = localStorage.getItem('notifications_enabled') === 'true';
  }

  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      throw new Error('This browser does not support desktop notifications');
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission === 'denied') {
      throw new Error('Notifications are blocked. Please enable them in browser settings.');
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      return true;
    } else if (permission === 'denied') {
      throw new Error('Notification permission was denied');
    } else {
      throw new Error('Notification permission was dismissed');
    }
  }

  async enable(): Promise<void> {
    await this.requestPermission();
    this.isEnabled = true;
    localStorage.setItem('notifications_enabled', 'true');
    
    // Show confirmation notification
    this.showNotification('XRPL Wallet', {
      body: 'Push notifications enabled successfully',
      icon: '/favicon.ico',
      tag: 'notification-enabled'
    });
  }

  disable() {
    this.isEnabled = false;
    localStorage.setItem('notifications_enabled', 'false');
    this.stopTransactionMonitoring();
  }

  isNotificationEnabled(): boolean {
    return this.isEnabled && Notification.permission === 'granted';
  }

  showNotification(title: string, options: NotificationOptions = {}) {
    if (!this.isNotificationEnabled()) {
      return null;
    }

    const notification = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      requireInteraction: false,
      ...options,
    });

    // Auto-close after 5 seconds
    setTimeout(() => {
      notification.close();
    }, 5000);

    return notification;
  }

  showTransactionNotification(type: 'sent' | 'received', amount: string, address: string) {
    const isReceived = type === 'received';
    const title = isReceived ? 'XRP Received' : 'XRP Sent';
    const body = isReceived 
      ? `Received ${amount} XRP from ${AddressFormat.short(address)}`
      : `Sent ${amount} XRP to ${AddressFormat.short(address)}`;

    this.showNotification(title, {
      body,
      tag: 'transaction',
      icon: '/favicon.ico',
    });
  }

  startTransactionMonitoring(walletAddress: string) {
    if (!this.isNotificationEnabled() || this.monitoringInterval) {
      return;
    }

    this.initializeTransactionCount();

    // Check for new transactions every 30 seconds
    this.monitoringInterval = setInterval(async () => {
      try {
        const { apiFetch } = await import('./queryClient');
        const response = await apiFetch('/api/transactions');
        if (response.ok) {
          const transactions = await response.json();
          
          if (transactions.length > this.previousTransactionCount) {
            const newTransactions = transactions.slice(0, transactions.length - this.previousTransactionCount);
            
            newTransactions.forEach((tx: any) => {
              this.showTransactionNotification(
                tx.type,
                tx.amount,
                tx.toAddress || tx.fromAddress || 'Unknown'
              );
            });
          }
          
          this.previousTransactionCount = transactions.length;
        }
      } catch {
      }
    }, 30000);
  }

  private async initializeTransactionCount() {
    try {
      const { apiFetch } = await import('./queryClient');
      const response = await apiFetch('/api/transactions');
      if (response.ok) {
        const transactions = await response.json();
        this.previousTransactionCount = transactions.length;
      }
    } catch {
    }
  }

  stopTransactionMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }
}

export const notificationService = new NotificationService();