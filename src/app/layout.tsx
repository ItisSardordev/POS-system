import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'StorePOS — касса магазина', description: 'Локальная POS-система магазина с поддержкой штрихкодов и офлайн-режима', applicationName: 'StorePOS' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#111827' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ru"><body>{children}</body></html>; }
