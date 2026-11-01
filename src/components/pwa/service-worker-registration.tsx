'use client';

import { useEffect } from 'react';
import { isNativeApp } from '@/utils/native';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    // No APK o conteúdo já vem do servidor publicado; o SW não acrescenta nada
    // e só criaria cache paralelo dentro do WebView.
    if (isNativeApp()) return;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('Service Worker registered:', registration.scope);
        })
        .catch((error) => {
          console.log('Service Worker registration failed:', error);
        });
    }
  }, []);

  return null;
}