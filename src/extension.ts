import * as SDK from "azure-devops-extension-sdk";
import { PdfDiffViewer } from './pr-diff-viewer';
import { CommonServiceIds, IProjectPageService, IHostNavigationService } from "azure-devops-extension-api";

declare const EXTENSION_VERSION: string;

// Log version immediately on script load, before any SDK calls
console.log(`PDF Diff Viewer version: ${EXTENSION_VERSION}`);

let diffViewer: PdfDiffViewer | null = null;

function showDebug(lines: string[]): void {
    const debugDiv = document.getElementById('debug-info');
    if (debugDiv) {
        debugDiv.style.display = 'block';
        debugDiv.textContent = lines.join('\n');
    }
    lines.forEach(l => console.log('[PDF-DIFF DEBUG]', l));
}

function setVersionDisplay(): void {
    const versionEl = document.getElementById('ext-version');
    if (versionEl) {
        versionEl.textContent = `v${EXTENSION_VERSION}`;
    } else {
        // Element not ready yet — retry once the DOM is fully parsed
        document.addEventListener('DOMContentLoaded', () => {
            const el = document.getElementById('ext-version');
            if (el) el.textContent = `v${EXTENSION_VERSION}`;
        });
    }
}
setVersionDisplay();

async function initialize() {
    console.log('Initialize function called');
    try {
        console.log('Calling SDK.init()...');
        // Try to init SDK, ignore error if already initialized
        try {
            SDK.init();
            console.log('SDK.init() completed');
        } catch (initError) {
            console.log('SDK.init() threw error (expected if already loaded):', initError);
        }
        
        console.log('Calling SDK.ready()...');
        await SDK.ready();
        
        console.log('SDK.ready() completed');
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
                    config.onBuildChanged(async () => {
                        await loadPdfsFromContext();
                    });
                }
                
                if (config.onViewDisplayed) {
                    config.onViewDisplayed(async () => {
                        await loadPdfsFromContext();
                    });
                }
            } else {
                // Try to load from current context
                await loadPdfsFromContext();
            }

            if (loading) {
                loading.style.display = 'none';
            }

            // Set up event listeners
            setupEventListeners();
            
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

async function loadPdfsFromContext(): Promise<void> {
    try {
        // Get configuration and project context from Azure DevOps
        const config = SDK.getConfiguration();
        const projectService = await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService);
        const project = await projectService.getProject();

        if (!project) {
            throw new Error('Could not get project context from SDK');
        }

        // Get PR ID and repository ID from config
        const pullRequestId: number = (config as any).pullRequestId;
        const repositoryId: string = (config as any).repositoryId;
        const pullRequest = (config as any).pullRequest;
        
        console.log('Full pullRequest object:', JSON.stringify(pullRequest, null, 2));
        
        if (!pullRequestId) {
            throw new Error('Pull Request ID not found. Please ensure this tab is opened in a Pull Request context.');
        }
        
        if (!repositoryId) {
            throw new Error(`Repository ID not found. PR ID: ${pullRequestId}`);
        }
        
        if (!pullRequest) {
            throw new Error(`Pull Request data not found in config. PR ID: ${pullRequestId}`);
        }
        
        console.log(`Loading PDF diff for PR ${pullRequestId} in repository ${repositoryId}`);
        console.log(`Project: ${project.name} (${project.id})`);
        console.log('Pull request object:', JSON.stringify(pullRequest, null, 2));

        // Get commit IDs - use sourceRefName tip (latest changes) vs targetRefName tip (merge destination)
        // lastMergeSourceCommit is the source branch tip at last merge attempt
        // lastMergeTargetCommit is the target branch tip at last merge attempt
        const sourceCommitId = pullRequest.lastMergeSourceCommit?.commitId;
        const targetCommitId = pullRequest.lastMergeTargetCommit?.commitId;

        console.log(`Source commit (changes): ${sourceCommitId}`);
        console.log(`Target commit (merge into): ${targetCommitId}`);
        
        if (!sourceCommitId || !targetCommitId) {
            throw new Error('Could not determine source and target commits for this Pull Request');
        }

        // Extract the PDF path from the host page URL query parameters.
        // Log synchronous info immediately so it always appears even if async calls hang.
        const iframeParams = new URLSearchParams(window.location.search);
        let referrerPath: string | null = null;
        let referrerParseError = '';
        try {
            if (document.referrer) {
                const referrerParams = new URLSearchParams(new URL(document.referrer).search);
                referrerPath = referrerParams.get('path');
            }
        } catch (e) {
            referrerParseError = String(e);
        }

        const syncDebug = [
            '=== URL Diagnostics (sync) ===',
            `window.location.href: ${window.location.href}`,
            `window.location.search: ${window.location.search}`,
            `document.referrer: ${document.referrer}`,
            `iframe path param: ${iframeParams.get('path') ?? '(not found)'}`,
            `referrer path param: ${referrerPath ?? '(not found)'}`,
            referrerParseError ? `referrer parse error: ${referrerParseError}` : '',
            'Calling getQueryParams()...',
        ].filter(Boolean);
        showDebug(syncDebug);

        // Try IHostNavigationService.getQueryParams() with a 5-second timeout
        let navPath: string | null = null;
        let queryParams: { [key: string]: string } = {};
        try {
            type NavResult = { ok: true; params: { [key: string]: string } } | { ok: false; error: string };
            const navResult = await Promise.race<NavResult>([
                (async (): Promise<NavResult> => {
                    const navigationService = await SDK.getService<IHostNavigationService>(CommonServiceIds.HostNavigationService);
                    const params = await navigationService.getQueryParams();
                    return { ok: true, params };
                })(),
                new Promise<NavResult>(resolve =>
                    setTimeout(() => resolve({ ok: false, error: 'timed out after 5s' }), 5000)
                ),
            ]);
            if (navResult.ok) {
                queryParams = navResult.params;
                navPath = queryParams['path'] || null;
            }
            showDebug([
                ...syncDebug,
                navResult.ok
                    ? `getQueryParams() result: ${JSON.stringify(queryParams)}`
                    : `getQueryParams() ${navResult.error}`,
                `getQueryParams() path: ${navPath ?? '(not found)'}`,
            ]);
        } catch (navError) {
            showDebug([...syncDebug, `getQueryParams() error: ${navError}`]);
        }

        // Pick best available path value
        const pdfPath = navPath || referrerPath || iframeParams.get('path');

        if (!pdfPath) {
            throw new Error('No PDF file selected. Please select a PDF file from the Files tab. (See debug panel)');
        }

        console.log(`PDF path from URL: ${pdfPath}`);

        // Get base URI for API calls
        // Try to extract from pullRequest object which might have repository URL
        const repoUrl = pullRequest?.repository?.url || pullRequest?.repository?.remoteUrl || '';
        console.log('Repository URL from pullRequest:', repoUrl);
        
        // Extract base URL from repository URL if available
        // Format: https://dev.azure.com/{org}/_apis/git/repositories/{id}
        let baseUri = 'https://dev.azure.com';
        if (repoUrl) {
            const repoUrlMatch = repoUrl.match(/(https?:\/\/[^\/]+\/[^\/]+)/);
            if (repoUrlMatch) {
                baseUri = repoUrlMatch[1];
            }
        }
        
        // Fallback: try document.referrer
        if (baseUri === 'https://dev.azure.com') {
            const parentUrl = document.referrer || window.location.href;
            console.log('Parent URL:', parentUrl);
            const urlMatch = parentUrl.match(/https?:\/\/[^\/]+\/([^\/]+)\//);
            const organization = urlMatch ? urlMatch[1] : '';
            if (organization) {
                baseUri = `https://dev.azure.com/${organization}`;
            }
        }
        
        console.log(`Base URI: ${baseUri}`);
        
        console.log('Fetching PDF files from commits...');
        try {
            // Fetch the PDF files using fetch directly
            // Try both commits - if one fails, the file might not exist in that commit
            console.log('About to fetch target PDF (before changes)...');
            let targetData: Uint8Array | null = null;
            try {
                targetData = await fetchPdfFile(baseUri, project.name, repositoryId, pdfPath, targetCommitId);
                console.log('Target PDF fetched successfully');
            } catch (err) {
                console.log('Target PDF not found (file might be new in this PR):', err);
            }
            
            console.log('About to fetch source PDF (with changes)...');
            let sourceData: Uint8Array | null = null;
            try {
                sourceData = await fetchPdfFile(baseUri, project.name, repositoryId, pdfPath, sourceCommitId);
                console.log('Source PDF fetched successfully');
            } catch (err) {
                console.log('Source PDF not found (file might be deleted in this PR):', err);
            }

            if (!targetData && !sourceData) {
                throw new Error('PDF file not found in either commit');
            }

            console.log('PDF files fetched, rendering diff...');
            if (diffViewer) {
                // If only one file exists, show it (new file or deleted file case)
                const baseData = targetData || sourceData!;
                const headData = sourceData || targetData!;
                await diffViewer.loadPdfsFromData(baseData, headData);
                console.log('PDFs loaded, now rendering side-by-side view...');
                await diffViewer.render('side-by-side');
                console.log('PDF diff rendered successfully');
            }
        } catch (apiError) {
            console.error('API Error details:', apiError);
            throw apiError;
        }

    } catch (error) {
        console.error('Error loading PDFs from context:', error);
        throw error;
    }
}

async function fetchPdfFile(baseUri: string, projectName: string, repositoryId: string, path: string, commitId: string): Promise<Uint8Array> {
    // Use $format=octetStream to get binary data directly instead of base64 JSON
    const apiUrl = `${baseUri}/${projectName}/_apis/git/repositories/${repositoryId}/items?path=${encodeURIComponent(path)}&versionType=commit&version=${commitId}&$format=octetStream&api-version=7.0`;
    
    console.log(`Fetching: ${apiUrl}`);
    
    // Get access token from SDK
    const accessToken = await SDK.getAccessToken();
    console.log('Got access token:', accessToken ? 'Yes' : 'No');
    
    const response = await fetch(apiUrl, {
        headers: {
            'Accept': 'application/octet-stream',
            'Authorization': `Bearer ${accessToken}`
        }
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    // Get binary data directly
    const arrayBuffer = await response.arrayBuffer();
    console.log(`Got binary data, ${arrayBuffer.byteLength} bytes`);
    
    return new Uint8Array(arrayBuffer);
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

// Cleanup on unload
window.addEventListener('beforeunload', () => {
    if (diffViewer) {
        diffViewer.destroy();
    }
});

// Initialize when DOM is ready
console.log('Extension script loaded, readyState:', document.readyState);
if (document.readyState === 'loading') {
    console.log('Waiting for DOMContentLoaded');
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    console.log('DOM already ready, initializing immediately');
    initialize();
}
