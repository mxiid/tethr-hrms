import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { Browser } from 'puppeteer';

import { PDF_STYLESHEET } from './pdf-styles.generated';

// Rendering bounds: the page is local content only (no network requests), so
// the content load is quick; the PDF protocol call and the number of pages
// alive at once are capped so a burst of exports cannot pin every Chromium
// resource.
const CONTENT_LOAD_TIMEOUT_MS = 10_000;
const PDF_TIMEOUT_MS = 30_000;
const MAX_CONCURRENT_RENDERS = 2;
const SHUTDOWN_ERROR_MESSAGE = 'PDF renderer is shutting down';

type QueuedRender = {
  readonly grant: () => void;
  readonly reject: (error: Error) => void;
};

// Generic HTML → PDF rendering over a lazily-launched, reused headless Chromium.
// Knows nothing about documents or domains (core/ rule): callers hand it markup,
// they get bytes back. Templates live with the modules that own the documents.
@Injectable()
export class PdfRendererService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfRendererService.name);
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private activeRenders = 0;
  private shuttingDown = false;
  private readonly waitingRenders: QueuedRender[] = [];

  async renderHtmlToPdf(html: string): Promise<Buffer> {
    const release = await this.acquireRenderSlot();
    try {
      try {
        return await this.renderOnce(html);
      } catch (error) {
        // The shared browser can die underneath us (OOM, external kill, crash).
        // Drop it and retry exactly once against a fresh launch instead of
        // failing every render from here on. During shutdown the browser is
        // intentionally gone: propagate instead of relaunching it.
        if (!isConnectionError(error) || this.shuttingDown) throw error;
        this.logger.warn('PDF browser connection lost; relaunching for retry');
        await this.discardBrowser();
        return await this.renderOnce(html);
      }
    } finally {
      release();
    }
  }

  private async renderOnce(html: string): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      // No remote requests are made — the stylesheet below is local — so
      // `load` is the right settle signal and there is no network-idle stall.
      await page.setContent(html, { waitUntil: 'load', timeout: CONTENT_LOAD_TIMEOUT_MS });
      await page.addStyleTag({ content: PDF_STYLESHEET });
      const pdf = await page.pdf({
        format: 'a4',
        printBackground: true,
        preferCSSPageSize: true,
        timeout: PDF_TIMEOUT_MS,
      });
      return Buffer.from(pdf);
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  // A tiny FIFO semaphore: renders beyond the limit wait their turn instead of
  // opening another page on the shared browser. Once shutdown starts, new
  // renders are rejected and queued ones are released with an error.
  private acquireRenderSlot(): Promise<() => void> {
    if (this.shuttingDown) {
      return Promise.reject(new Error(SHUTDOWN_ERROR_MESSAGE));
    }
    return new Promise<() => void>((resolve, reject) => {
      const grant = (): void => {
        this.activeRenders += 1;
        resolve(() => this.releaseRenderSlot());
      };
      if (this.activeRenders < MAX_CONCURRENT_RENDERS) {
        grant();
      } else {
        this.waitingRenders.push({ grant, reject });
      }
    });
  }

  private releaseRenderSlot(): void {
    this.activeRenders -= 1;
    this.waitingRenders.shift()?.grant();
  }

  // Launch once on first use so booting/tests never pay the Chromium cost.
  // A cached browser that has since disconnected is discarded — callers must
  // never hold a dead connection.
  private async getBrowser(): Promise<Browser> {
    if (this.shuttingDown) {
      throw new Error(SHUTDOWN_ERROR_MESSAGE);
    }
    if (this.browser && this.browser.connected) {
      return this.browser;
    }
    if (this.browser) {
      await this.discardBrowser();
    }
    this.launching ??= (async () => {
      const puppeteer = (await import('puppeteer')).default;
      const launched = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        headless: true,
      });
      launched.on('disconnected', () => {
        if (this.browser === launched) {
          this.browser = null;
          this.launching = null;
        }
      });
      this.logger.log('Headless browser ready for PDF rendering');
      return launched;
    })();
    try {
      this.browser = await this.launching;
      return this.browser;
    } catch (error) {
      this.launching = null;
      throw error;
    }
  }

  private async discardBrowser(): Promise<void> {
    this.launching = null;
    const stale = this.browser;
    this.browser = null;
    if (stale) {
      await stale.close().catch(() => undefined);
    }
  }

  // Shutdown starts here: no new render may start or wait, and an in-flight
  // render that loses its connection must not relaunch a browser we are about
  // to tear down.
  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    for (const waiter of this.waitingRenders.splice(0)) {
      waiter.reject(new Error(SHUTDOWN_ERROR_MESSAGE));
    }
    await this.discardBrowser();
  }
}

// Puppeteer surfaces dead connections as ConnectionClosedError, or as generic
// errors mentioning the closed connection/target/session.
const isConnectionError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  if (error.name === 'ConnectionClosedError') return true;
  return /connection closed|target closed|session closed/i.test(error.message);
};
