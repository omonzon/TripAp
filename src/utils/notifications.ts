export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('This browser does not support desktop notification');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

export async function sendLocalNotification(title: string, options?: NotificationOptions) {
  const hasPermission = await requestNotificationPermission();
  if (hasPermission) {
    const notification = new Notification(title, {
      icon: '/vite.svg',
      badge: '/vite.svg',
      ...options
    });
    
    // Play a gentle sound (Optional, browsers often handle notification sounds natively, 
    // but we can enforce a small beep if requested)
    try {
      const audio = new Audio('/notification-sound.mp3'); // Fallback if exists
      audio.volume = 0.5;
      audio.play().catch(e => {
         // Ignore play errors (usually due to lack of user interaction)
      });
    } catch (e) {}

    return notification;
  }
  return null;
}
