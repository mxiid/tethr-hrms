import { PdfRendererService } from './pdf-renderer.service';

jest.mock('puppeteer', () => ({
  __esModule: true,
  default: { launch: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { default: puppeteerMock } = require('puppeteer') as {
  default: { launch: jest.Mock };
};

const connectionClosedError = (): Error =>
  Object.assign(new Error('Connection closed.'), { name: 'ConnectionClosedError' });

const fakePage = (pdfBytes = 'PDF-BYTES') => ({
  setContent: jest.fn().mockResolvedValue(undefined),
  addStyleTag: jest.fn().mockResolvedValue(undefined),
  pdf: jest.fn().mockResolvedValue(Buffer.from(pdfBytes)),
  close: jest.fn().mockResolvedValue(undefined),
});

const fakeBrowser = (page: ReturnType<typeof fakePage>, connected = true) => ({
  connected,
  newPage: jest.fn().mockResolvedValue(page),
  close: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
});

describe('PdfRendererService', () => {
  beforeEach(() => {
    puppeteerMock.launch.mockReset();
  });

  it('renders through a freshly launched browser', async () => {
    const page = fakePage();
    const browser = fakeBrowser(page);
    puppeteerMock.launch.mockResolvedValue(browser);

    const service = new PdfRendererService();
    const pdf = await service.renderHtmlToPdf('<p>hi</p>');

    expect(pdf.toString()).toBe('PDF-BYTES');
    expect(puppeteerMock.launch).toHaveBeenCalledTimes(1);
    expect(page.setContent).toHaveBeenCalledTimes(1);
    await service.onModuleDestroy();
  });

  it('relaunches once and retries when the cached browser connection dies', async () => {
    const liveBrowser = fakeBrowser(fakePage('RENDERED'));
    // The cached browser still reports connected, but every page op fails —
    // exactly what a killed Chromium looks like from here.
    liveBrowser.newPage.mockRejectedValueOnce(connectionClosedError());
    const freshBrowser = fakeBrowser(fakePage('RECOVERED'));
    puppeteerMock.launch.mockResolvedValueOnce(liveBrowser).mockResolvedValueOnce(freshBrowser);

    const service = new PdfRendererService();
    const pdf = await service.renderHtmlToPdf('<p>hi</p>');
    expect(pdf.toString()).toBe('RECOVERED');
    expect(puppeteerMock.launch).toHaveBeenCalledTimes(2);
    await service.onModuleDestroy();
  });

  it('rethrows non-connection errors without relaunching', async () => {
    const page = fakePage();
    page.pdf.mockRejectedValueOnce(new Error('print failed'));
    puppeteerMock.launch.mockResolvedValue(fakeBrowser(page));

    const service = new PdfRendererService();
    await expect(service.renderHtmlToPdf('<p>hi</p>')).rejects.toThrow('print failed');
    expect(puppeteerMock.launch).toHaveBeenCalledTimes(1);
    await service.onModuleDestroy();
  });

  it('drops a disconnected cached browser before rendering', async () => {
    const stale = fakeBrowser(fakePage(), false);
    const fresh = fakeBrowser(fakePage('FRESH'));
    puppeteerMock.launch.mockResolvedValueOnce(stale).mockResolvedValueOnce(fresh);

    const service = new PdfRendererService();
    await service.renderHtmlToPdf('<p>warmup</p>');
    const pdf = await service.renderHtmlToPdf('<p>again</p>');
    expect(pdf.toString()).toBe('FRESH');
    await service.onModuleDestroy();
  });
});
