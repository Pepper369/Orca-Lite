// Next.js Root Types compatibility shim

export type Metadata = {
  title?: string | { default: string; template?: string };
  description?: string;
  keywords?: string[];
  icons?: any;
  manifest?: string;
  openGraph?: any;
  twitter?: any;
  [key: string]: any;
};

export type Viewport = {
  themeColor?: string | Array<{ media?: string; color: string }>;
  width?: string;
  initialScale?: number;
  maximumScale?: number;
  userScalable?: boolean;
  [key: string]: any;
};

export default {
  Metadata: {} as Metadata,
  Viewport: {} as Viewport,
};
