import * as pdfjsLib from 'pdfjs-dist';
import * as SDK from "azure-devops-extension-sdk";

// Configure PDF.js worker - will be set after SDK initializes
let workerInitialized = false;

function ensureWorkerInitialized() {
    if (!workerInitialized) {
        // Get the base URI for the extension and construct the worker path
        const baseUri = SDK.getExtensionContext().baseUri || '';
        pdfjsLib.GlobalWorkerOptions.workerSrc = `${baseUri}dist/pdf.worker.min.mjs`;
        workerInitialized = true;
    }
}

export interface PdfPage {
    pageNumber: number;
    canvas: HTMLCanvasElement;
    width: number;
    height: number;
}

export class PdfRenderer {
    private pdfDocument: pdfjsLib.PDFDocumentProxy | null = null;
    private scale: number = 1.5;

    async loadPdf(url: string): Promise<void> {
        ensureWorkerInitialized();
        try {
            this.pdfDocument = await pdfjsLib.getDocument(url).promise;
        } catch (error) {
            console.error('Error loading PDF:', error);
            throw new Error(`Failed to load PDF: ${error}`);
        }
    }

    async loadPdfFromData(data: Uint8Array): Promise<void> {
        ensureWorkerInitialized();
        try {
            this.pdfDocument = await pdfjsLib.getDocument({ data }).promise;
        } catch (error) {
            console.error('Error loading PDF from data:', error);
            throw new Error(`Failed to load PDF from data: ${error}`);
        }
    }

    getPageCount(): number {
        return this.pdfDocument?.numPages || 0;
    }

    async renderPage(pageNumber: number): Promise<PdfPage> {
        if (!this.pdfDocument) {
            throw new Error('PDF document not loaded');
        }

        if (pageNumber < 1 || pageNumber > this.pdfDocument.numPages) {
            throw new Error(`Invalid page number: ${pageNumber}`);
        }

        const page = await this.pdfDocument.getPage(pageNumber);
        const viewport = page.getViewport({ scale: this.scale });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Failed to get canvas 2D context');
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        await page.render(renderContext).promise;

        return {
            pageNumber,
            canvas,
            width: viewport.width,
            height: viewport.height
        };
    }

    async renderAllPages(): Promise<PdfPage[]> {
        if (!this.pdfDocument) {
            throw new Error('PDF document not loaded');
        }

        const pages: PdfPage[] = [];
        for (let i = 1; i <= this.pdfDocument.numPages; i++) {
            const page = await this.renderPage(i);
            pages.push(page);
        }
        return pages;
    }

    setScale(scale: number): void {
        this.scale = scale;
    }

    getScale(): number {
        return this.scale;
    }

    destroy(): void {
        if (this.pdfDocument) {
            this.pdfDocument.destroy();
            this.pdfDocument = null;
        }
    }
}
