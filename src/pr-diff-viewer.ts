import { PdfRenderer } from './pdf-renderer';
import pixelmatch from 'pixelmatch';

export type ViewMode = 'side-by-side' | 'inline' | 'pixel-diff';

export class PdfDiffViewer {
    private baseRenderer: PdfRenderer;
    private headRenderer: PdfRenderer;
    private currentPage: number = 1;
    private viewMode: ViewMode = 'side-by-side';
    private maxPages: number = 0;

    constructor() {
        this.baseRenderer = new PdfRenderer();
        this.headRenderer = new PdfRenderer();
    }

    async loadPdfs(baseUrl: string, headUrl: string): Promise<void> {
        await Promise.all([
            this.baseRenderer.loadPdf(baseUrl),
            this.headRenderer.loadPdf(headUrl)
        ]);

        const basePages = this.baseRenderer.getPageCount();
        const headPages = this.headRenderer.getPageCount();
        this.maxPages = Math.max(basePages, headPages);
    }

    async loadPdfsFromData(baseData: Uint8Array, headData: Uint8Array): Promise<void> {
        await Promise.all([
            this.baseRenderer.loadPdfFromData(baseData),
            this.headRenderer.loadPdfFromData(headData)
        ]);

        const basePages = this.baseRenderer.getPageCount();
        const headPages = this.headRenderer.getPageCount();
        this.maxPages = Math.max(basePages, headPages);
    }

    async renderSideBySide(container: HTMLElement): Promise<void> {
        container.innerHTML = '';

        const baseContainer = document.getElementById('base-container');
        const headContainer = document.getElementById('head-container');

        if (!baseContainer || !headContainer) {
            throw new Error('Side-by-side containers not found');
        }

        baseContainer.innerHTML = '';
        headContainer.innerHTML = '';

        const basePages = this.baseRenderer.getPageCount();
        const headPages = this.headRenderer.getPageCount();

        if (this.currentPage <= basePages) {
            const basePage = await this.baseRenderer.renderPage(this.currentPage);
            baseContainer.appendChild(basePage.canvas);
        } else {
            baseContainer.innerHTML = '<p style="padding: 20px; color: #666;">Page not in original</p>';
        }

        if (this.currentPage <= headPages) {
            const headPage = await this.headRenderer.renderPage(this.currentPage);
            headContainer.appendChild(headPage.canvas);
        } else {
            headContainer.innerHTML = '<p style="padding: 20px; color: #666;">Page not in modified</p>';
        }
    }

    async renderInline(container: HTMLElement): Promise<void> {
        container.innerHTML = '';

        const basePages = this.baseRenderer.getPageCount();
        const headPages = this.headRenderer.getPageCount();

        if (this.currentPage <= basePages) {
            const pageDiv = document.createElement('div');
            pageDiv.className = 'page-diff removed-page';
            
            const label = document.createElement('div');
            label.className = 'page-label';
            label.textContent = `− Page ${this.currentPage} (Original)`;
            pageDiv.appendChild(label);

            const basePage = await this.baseRenderer.renderPage(this.currentPage);
            pageDiv.appendChild(basePage.canvas);
            container.appendChild(pageDiv);
        }

        if (this.currentPage <= headPages) {
            const pageDiv = document.createElement('div');
            pageDiv.className = 'page-diff added-page';
            
            const label = document.createElement('div');
            label.className = 'page-label';
            label.textContent = `+ Page ${this.currentPage} (Modified)`;
            pageDiv.appendChild(label);

            const headPage = await this.headRenderer.renderPage(this.currentPage);
            pageDiv.appendChild(headPage.canvas);
            container.appendChild(pageDiv);
        }
    }

    async renderPixelDiff(container: HTMLElement): Promise<void> {
        container.innerHTML = '';

        const basePages = this.baseRenderer.getPageCount();
        const headPages = this.headRenderer.getPageCount();

        if (this.currentPage > basePages || this.currentPage > headPages) {
            container.innerHTML = '<p style="padding: 20px; color: #666;">Cannot compare - page missing in one version</p>';
            return;
        }

        const basePage = await this.baseRenderer.renderPage(this.currentPage);
        const headPage = await this.headRenderer.renderPage(this.currentPage);

        // Create comparison container
        const comparisonDiv = document.createElement('div');
        comparisonDiv.className = 'page-comparison';

        const label = document.createElement('div');
        label.className = 'page-label';
        label.textContent = `Page ${this.currentPage} - Pixel Difference`;
        comparisonDiv.appendChild(label);

        const diffContainer = document.createElement('div');
        diffContainer.className = 'diff-canvas-container';

        // Ensure both canvases are the same size
        const width = Math.max(basePage.width, headPage.width);
        const height = Math.max(basePage.height, headPage.height);

        // Resize canvases if needed
        const baseCanvas = this.resizeCanvas(basePage.canvas, width, height);
        const headCanvas = this.resizeCanvas(headPage.canvas, width, height);

        // Create diff canvas
        const diffCanvas = document.createElement('canvas');
        diffCanvas.width = width;
        diffCanvas.height = height;

        const baseCtx = baseCanvas.getContext('2d');
        const headCtx = headCanvas.getContext('2d');
        const diffCtx = diffCanvas.getContext('2d');

        if (!baseCtx || !headCtx || !diffCtx) {
            throw new Error('Failed to get canvas contexts');
        }

        const baseImageData = baseCtx.getImageData(0, 0, width, height);
        const headImageData = headCtx.getImageData(0, 0, width, height);
        const diffImageData = diffCtx.createImageData(width, height);

        // Perform pixel diff
        const numDiffPixels = pixelmatch(
            baseImageData.data,
            headImageData.data,
            diffImageData.data,
            width,
            height,
            { threshold: 0.1 }
        );

        diffCtx.putImageData(diffImageData, 0, 0);

        // Add canvases to container
        const baseWrapper = document.createElement('div');
        const baseTitle = document.createElement('div');
        baseTitle.textContent = 'Original';
        baseTitle.style.fontWeight = 'bold';
        baseTitle.style.marginBottom = '5px';
        baseWrapper.appendChild(baseTitle);
        baseWrapper.appendChild(baseCanvas);

        const headWrapper = document.createElement('div');
        const headTitle = document.createElement('div');
        headTitle.textContent = 'Modified';
        headTitle.style.fontWeight = 'bold';
        headTitle.style.marginBottom = '5px';
        headWrapper.appendChild(headTitle);
        headWrapper.appendChild(headCanvas);

        const diffWrapper = document.createElement('div');
        const diffTitle = document.createElement('div');
        diffTitle.textContent = `Differences (${numDiffPixels} pixels)`;
        diffTitle.style.fontWeight = 'bold';
        diffTitle.style.marginBottom = '5px';
        diffWrapper.appendChild(diffTitle);
        diffWrapper.appendChild(diffCanvas);

        diffContainer.appendChild(baseWrapper);
        diffContainer.appendChild(headWrapper);
        diffContainer.appendChild(diffWrapper);

        comparisonDiv.appendChild(diffContainer);
        container.appendChild(comparisonDiv);
    }

    private resizeCanvas(sourceCanvas: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
        if (sourceCanvas.width === width && sourceCanvas.height === height) {
            return sourceCanvas;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(sourceCanvas, 0, 0);
        }
        return canvas;
    }

    async render(mode: ViewMode): Promise<void> {
        this.viewMode = mode;

        const sideBySideView = document.getElementById('side-by-side-view');
        const inlineView = document.getElementById('inline-view');
        const pixelDiffView = document.getElementById('pixel-diff-view');
        const inlineContainer = document.getElementById('inline-container');
        const pixelDiffContainer = document.getElementById('pixel-diff-container');

        if (!sideBySideView || !inlineView || !pixelDiffView || !inlineContainer || !pixelDiffContainer) {
            throw new Error('View containers not found');
        }

        // Hide all views
        sideBySideView.classList.remove('active');
        inlineView.classList.remove('active');
        pixelDiffView.classList.remove('active');

        // Show and render the selected view
        switch (mode) {
            case 'side-by-side':
                sideBySideView.classList.add('active');
                await this.renderSideBySide(sideBySideView);
                break;
            case 'inline':
                inlineView.classList.add('active');
                await this.renderInline(inlineContainer);
                break;
            case 'pixel-diff':
                pixelDiffView.classList.add('active');
                await this.renderPixelDiff(pixelDiffContainer);
                break;
        }

        this.updatePageInfo();
    }

    nextPage(): void {
        if (this.currentPage < this.maxPages) {
            this.currentPage++;
            this.render(this.viewMode);
        }
    }

    previousPage(): void {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.render(this.viewMode);
        }
    }

    getCurrentPage(): number {
        return this.currentPage;
    }

    getMaxPages(): number {
        return this.maxPages;
    }

    private updatePageInfo(): void {
        const pageInfo = document.getElementById('page-info');
        if (pageInfo) {
            pageInfo.textContent = `Page ${this.currentPage} of ${this.maxPages}`;
        }

        const prevBtn = document.getElementById('prev-page') as HTMLButtonElement;
        const nextBtn = document.getElementById('next-page') as HTMLButtonElement;

        if (prevBtn) {
            prevBtn.disabled = this.currentPage <= 1;
        }

        if (nextBtn) {
            nextBtn.disabled = this.currentPage >= this.maxPages;
        }
    }

    destroy(): void {
        this.baseRenderer.destroy();
        this.headRenderer.destroy();
    }
}
