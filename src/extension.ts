import * as SDK from "azure-devops-extension-sdk";
import { PdfDiffViewer, ViewMode } from './pr-diff-viewer';

// Initialize the Azure DevOps SDK
SDK.init();

let diffViewer: PdfDiffViewer | null = null;

async function initialize() {
    try {
        await SDK.ready();

        const loading = document.getElementById('loading');
        const errorDiv = document.getElementById('error');

        if (loading) {
            loading.style.display = 'block';
        }

        // Get the current context
        const context = SDK.getConfiguration();
        
        // For demo purposes, we'll use sample PDFs
        // In a real implementation, this would fetch the actual PDF files from the PR
        const basePdfUrl = getSamplePdfUrl('base');
        const headPdfUrl = getSamplePdfUrl('head');

        // Initialize the diff viewer
        diffViewer = new PdfDiffViewer();

        try {
            // In a real implementation, fetch the actual files from Azure DevOps API
            // For now, we'll use sample URLs or create demo PDFs
            await loadSamplePdfs(diffViewer);

            if (loading) {
                loading.style.display = 'none';
            }

            // Set up event listeners
            setupEventListeners();

            // Render the initial view
            await diffViewer.render('side-by-side');

        } catch (error) {
            console.error('Error loading PDFs:', error);
            if (errorDiv) {
                errorDiv.textContent = `Error loading PDF files: ${error}`;
                errorDiv.style.display = 'block';
            }
            if (loading) {
                loading.style.display = 'none';
            }
        }

    } catch (error) {
        console.error('Error initializing extension:', error);
        const errorDiv = document.getElementById('error');
        if (errorDiv) {
            errorDiv.textContent = `Error initializing extension: ${error}`;
            errorDiv.style.display = 'block';
        }
    }
}

function setupEventListeners() {
    // View mode buttons
    const sideBySideBtn = document.getElementById('side-by-side-btn');
    const inlineBtn = document.getElementById('inline-btn');
    const pixelDiffBtn = document.getElementById('pixel-diff-btn');

    if (sideBySideBtn) {
        sideBySideBtn.addEventListener('click', () => {
            setActiveButton('side-by-side-btn');
            if (diffViewer) {
                diffViewer.render('side-by-side');
            }
        });
    }

    if (inlineBtn) {
        inlineBtn.addEventListener('click', () => {
            setActiveButton('inline-btn');
            if (diffViewer) {
                diffViewer.render('inline');
            }
        });
    }

    if (pixelDiffBtn) {
        pixelDiffBtn.addEventListener('click', () => {
            setActiveButton('pixel-diff-btn');
            if (diffViewer) {
                diffViewer.render('pixel-diff');
            }
        });
    }

    // Page navigation
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');

    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => {
            if (diffViewer) {
                diffViewer.previousPage();
            }
        });
    }

    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
            if (diffViewer) {
                diffViewer.nextPage();
            }
        });
    }
}

function setActiveButton(activeId: string) {
    const buttons = ['side-by-side-btn', 'inline-btn', 'pixel-diff-btn'];
    buttons.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            if (id === activeId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });
}

function getSamplePdfUrl(type: 'base' | 'head'): string {
    // In a real implementation, this would construct the URL to fetch the PDF from Azure DevOps
    // For now, return placeholder URLs
    return `https://example.com/sample-${type}.pdf`;
}

async function loadSamplePdfs(viewer: PdfDiffViewer): Promise<void> {
    // Create sample PDF data for demonstration
    // In a real implementation, this would fetch actual PDF files from the PR
    
    // For demo purposes, we'll create simple PDFs using canvas
    const basePdfData = await createSamplePdf('Original PDF Content', 3);
    const headPdfData = await createSamplePdf('Modified PDF Content', 3);

    await viewer.loadPdfsFromData(basePdfData, headPdfData);
}

async function createSamplePdf(text: string, numPages: number): Promise<Uint8Array> {
    // This is a simplified demo implementation
    // In a real scenario, PDFs would be fetched from the PR files
    
    // For now, we'll create a minimal PDF structure
    // This is just for demonstration and won't work with real PDF.js
    // You would need to fetch actual PDF files from Azure DevOps API
    
    const pdfHeader = '%PDF-1.4\n';
    const pdfContent = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
    
    // Create a basic PDF structure (this is simplified and may not work with pdf.js)
    // In production, you'd fetch real PDFs from the repository
    const content = pdfHeader + pdfContent;
    
    return new Uint8Array(Array.from(content).map(c => c.charCodeAt(0)));
}

// Cleanup on unload
window.addEventListener('beforeunload', () => {
    if (diffViewer) {
        diffViewer.destroy();
    }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
