import * as SDK from "azure-devops-extension-sdk";
import { PdfDiffViewer } from './pr-diff-viewer';
import { CommonServiceIds, IProjectPageService, getClient } from "azure-devops-extension-api";
import { GitRestClient, VersionControlRecursionType, GitVersionType } from "azure-devops-extension-api/Git";

// Initialize the Azure DevOps SDK
SDK.init();

let diffViewer: PdfDiffViewer | null = null;

async function initialize() {
    try {
        await SDK.ready();
        
        console.log('PDF Diff Viewer extension loaded');

        const loading = document.getElementById('loading');
        const errorDiv = document.getElementById('error');

        if (loading) {
            loading.style.display = 'block';
        }

        // Get the configuration context from Azure DevOps
        const config = SDK.getConfiguration();
        console.log('Configuration:', config);

        // Initialize the diff viewer
        diffViewer = new PdfDiffViewer();

        try {
            // Check if we have file context (content handler scenario)
            if (config.onBuildChanged || config.onViewDisplayed) {
                // This is a content handler - wait for file information
                if (config.onBuildChanged) {
                    config.onBuildChanged(async (args: any) => {
                        await loadPdfsFromContext(args);
                    });
                }
                
                if (config.onViewDisplayed) {
                    config.onViewDisplayed(async (args: any) => {
                        await loadPdfsFromContext(args);
                    });
                }
            } else {
                // Try to load from current context
                await loadPdfsFromContext(config);
            }

            if (loading) {
                loading.style.display = 'none';
            }

            // Set up event listeners
            setupEventListeners();

            // Render the initial view
            await diffViewer.render('side-by-side');
            
            // Notify Azure DevOps that the extension has loaded successfully
            SDK.notifyLoadSucceeded();

        } catch (error) {
            console.error('Error loading PDFs:', error);
            if (errorDiv) {
                errorDiv.textContent = `Error loading PDF files: ${error}`;
                errorDiv.style.display = 'block';
            }
            if (loading) {
                loading.style.display = 'none';
            }
            
            // Still notify load succeeded even if PDF loading failed
            SDK.notifyLoadSucceeded();
        }

    } catch (error) {
        console.error('Error initializing extension:', error);
        const errorDiv = document.getElementById('error');
        if (errorDiv) {
            errorDiv.textContent = `Error initializing extension: ${error}`;
            errorDiv.style.display = 'block';
        }
        
        // Notify load succeeded to prevent Azure DevOps from waiting indefinitely
        SDK.notifyLoadSucceeded();
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

async function loadPdfsFromContext(context: any): Promise<void> {
    try {
        console.log('Loading PDFs from context:', context);

        // Get the file paths from the context
        let basePath: string | undefined;
        let headPath: string | undefined;
        let repositoryId: string | undefined;
        let baseVersion: string | undefined;
        let headVersion: string | undefined;

        // Try different context formats
        if (context.originalFile && context.modifiedFile) {
            // Content handler format
            basePath = context.originalFile.path;
            headPath = context.modifiedFile.path;
            repositoryId = context.repositoryId;
            baseVersion = context.originalFile.version || context.baseVersion;
            headVersion = context.modifiedFile.version || context.targetVersion;
        } else if (context.item) {
            // Alternative format
            basePath = context.item.path;
            headPath = context.item.path;
            repositoryId = context.repositoryId;
            baseVersion = context.baseVersion;
            headVersion = context.targetVersion;
        } else if (context.path) {
            // Simple path format
            basePath = context.path;
            headPath = context.path;
            repositoryId = context.repositoryId;
            baseVersion = context.baseCommitId || context.originalCommitId;
            headVersion = context.targetCommitId || context.modifiedCommitId;
        }

        if (!basePath || !headPath) {
            console.warn('No file paths found in context, using sample PDFs');
            await loadSamplePdfs(diffViewer!);
            return;
        }

        // Get project context
        const projectService = await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService);
        const project = await projectService.getProject();

        if (!project) {
            throw new Error('Could not get project context');
        }

        // Get Git client
        const gitClient = getClient(GitRestClient);

        // Fetch the PDF files
        const baseData = await fetchPdfFile(gitClient, repositoryId || '', basePath, baseVersion || 'GB' + (baseVersion || ''));
        const headData = await fetchPdfFile(gitClient, repositoryId || '', headPath, headVersion || 'GT' + (headVersion || ''));

        if (diffViewer) {
            await diffViewer.loadPdfsFromData(baseData, headData);
        }

    } catch (error) {
        console.error('Error loading PDFs from context:', error);
        // Fallback to sample PDFs
        await loadSamplePdfs(diffViewer!);
    }
}

async function fetchPdfFile(gitClient: GitRestClient, repositoryId: string, path: string, version: string): Promise<Uint8Array> {
    try {
        // Fetch the file content
        const item = await gitClient.getItem(
            repositoryId,
            path,
            undefined, // project
            undefined, // scopePath
            VersionControlRecursionType.None,
            false, // includeContentMetadata
            false, // latestProcessedChange
            false, // download
            {
                version: version.replace(/^G[BT]/, ''), // Remove GB or GT prefix
                versionType: version.startsWith('GB') ? GitVersionType.Branch : (version.startsWith('GT') ? GitVersionType.Tag : GitVersionType.Commit),
                versionOptions: 0
            }
        );

        if (!item || !item.content) {
            throw new Error(`Could not fetch file content for ${path}`);
        }

        // Convert base64 content to Uint8Array
        const base64Content = item.content;
        const binaryString = atob(base64Content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        return bytes;
    } catch (error) {
        console.error(`Error fetching PDF file ${path}:`, error);
        throw error;
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

// Commented out - currently unused but may be needed for real implementation
// function getSamplePdfUrl(type: 'base' | 'head'): string {
//     // In a real implementation, this would construct the URL to fetch the PDF from Azure DevOps
//     // For now, return placeholder URLs
//     return `https://example.com/sample-${type}.pdf`;
// }

async function loadSamplePdfs(viewer: PdfDiffViewer): Promise<void> {
    // Create sample PDF data for demonstration
    // In a real implementation, this would fetch actual PDF files from the PR
    
    // For demo purposes, we'll create simple PDFs using canvas
    const basePdfData = await createSamplePdf('Original PDF Content', 3);
    const headPdfData = await createSamplePdf('Modified PDF Content', 3);

    await viewer.loadPdfsFromData(basePdfData, headPdfData);
}

async function createSamplePdf(_text: string, _numPages: number): Promise<Uint8Array> {
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
