import * as SDK from "azure-devops-extension-sdk";
import { PdfDiffViewer } from './pr-diff-viewer';
import { CommonServiceIds, IProjectPageService, IHostNavigationService } from "azure-devops-extension-api";

declare const EXTENSION_VERSION: string;

// Capture version safely — DefinePlugin substitutes this at build time
const _EXT_VERSION: string = (typeof EXTENSION_VERSION !== 'undefined') ? EXTENSION_VERSION : 'UNKNOWN';

// Use console.warn so it appears in yellow and is impossible to miss in DevTools
console.warn(`>>> PDF Diff Viewer version: ${_EXT_VERSION} <<<`);

let diffViewer: PdfDiffViewer | null = null;
let overridePath: string | null = null;

function showDebug(lines: string[]): void {
    const debugDiv = document.getElementById('debug-info');
    if (debugDiv) {
        debugDiv.style.display = 'block';
        debugDiv.textContent = lines.join('\n');
    }
    lines.forEach(l => console.log('[PDF-DIFF DEBUG]', l));
}
// Keep showDebug available for error diagnostics
void showDebug;

function trySetVersionDisplay(): void {
    const versionEl = document.getElementById('ext-version');
    if (versionEl) {
        versionEl.textContent = `v${_EXT_VERSION}`;
        versionEl.title = `PDF Diff Viewer v${_EXT_VERSION}`;
    }
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
        loadingEl.textContent = `Loading PDF files... (v${_EXT_VERSION})`;
    }
}

// Try immediately, then again after DOMContentLoaded, then at 500ms intervals until it sticks
trySetVersionDisplay();
document.addEventListener('DOMContentLoaded', trySetVersionDisplay);
const _versionInterval = setInterval(() => {
    trySetVersionDisplay();
    const el = document.getElementById('ext-version');
    if (el && el.textContent) clearInterval(_versionInterval);
}, 500);

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
                errorDiv.textContent = `[v${_EXT_VERSION}] Error loading PDF files: ${error}`;
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
        const config = SDK.getConfiguration();
        const projectService = await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService);
        const project = await projectService.getProject();

        if (!project) throw new Error('Could not get project context from SDK');

        const pullRequestId: number = (config as any).pullRequestId;
        const repositoryId: string = (config as any).repositoryId;
        const pullRequest = (config as any).pullRequest;

        if (!pullRequestId) throw new Error('Pull Request ID not found. Please ensure this tab is opened in a Pull Request context.');
        if (!repositoryId) throw new Error(`Repository ID not found. PR ID: ${pullRequestId}`);
        if (!pullRequest) throw new Error(`Pull Request data not found in config. PR ID: ${pullRequestId}`);

        console.log(`Loading PDF diff for PR ${pullRequestId} in repository ${repositoryId}`);

        // Compute base URI — needed for all API calls
        const repoUrl = pullRequest?.repository?.url || pullRequest?.repository?.remoteUrl || '';
        let baseUri = 'https://dev.azure.com';
        if (repoUrl) {
            const m = repoUrl.match(/(https?:\/\/[^\/]+\/[^\/]+)/);
            if (m) baseUri = m[1];
        }
        if (baseUri === 'https://dev.azure.com') {
            const parentUrl = document.referrer || window.location.href;
            const m = parentUrl.match(/https?:\/\/[^\/]+\/([^\/]+)\//);
            if (m) baseUri = `https://dev.azure.com/${m[1]}`;
        }
        console.log(`Base URI: ${baseUri}`);

        // Read all URL query params from the host page in one call
        let navParams: { [key: string]: string } = {};
        let referrerParams: { [key: string]: string } = {};
        try {
            if (document.referrer) {
                new URLSearchParams(new URL(document.referrer).search)
                    .forEach((v, k) => referrerParams[k] = v);
            }
        } catch (_) { /* ignore */ }
        try {
            type NavResult = { ok: true; params: { [key: string]: string } } | { ok: false };
            const navResult = await Promise.race<NavResult>([
                (async (): Promise<NavResult> => {
                    const nav = await SDK.getService<IHostNavigationService>(CommonServiceIds.HostNavigationService);
                    return { ok: true, params: await nav.getQueryParams() };
                })(),
                new Promise<NavResult>(resolve => setTimeout(() => resolve({ ok: false }), 5000)),
            ]);
            if (navResult.ok) navParams = navResult.params;
        } catch (_) { /* ignore */ }

        const iframeParams = new URLSearchParams(window.location.search);
        const getParam = (key: string): string | null =>
            navParams[key] || referrerParams[key] || iframeParams.get(key) || null;

        // Resolve selected path
        const selectedPath = overridePath || getParam('path');
        console.log(`Selected path: ${selectedPath}`);
        updatePathDisplay(selectedPath);

        // Determine commit IDs — start with PR's lastMerge commits as fallback
        let headCommitId: string = pullRequest.lastMergeSourceCommit?.commitId;
        let baseCommitId: string = pullRequest.lastMergeTargetCommit?.commitId;

        if (!headCommitId || !baseCommitId) {
            throw new Error('Could not determine source and target commits for this Pull Request');
        }

        // Override with iteration-specific commits when iteration params are present in the URL
        const iterationParam = getParam('iteration');
        const baseIterParam = getParam('base');

        if (iterationParam) {
            const iterNum = parseInt(iterationParam, 10);
            if (!isNaN(iterNum) && iterNum > 0) {
                try {
                    const iter = await fetchPrIteration(baseUri, project.name, repositoryId, pullRequestId, iterNum);
                    if (iter.sourceCommitId) {
                        headCommitId = iter.sourceCommitId;
                        console.log(`Using iteration ${iterNum} source commit as head: ${headCommitId}`);
                    }
                } catch (err) {
                    console.warn(`Failed to fetch iteration ${iterNum}, falling back to lastMergeSourceCommit:`, err);
                }
            }
        }

        if (baseIterParam) {
            const baseNum = parseInt(baseIterParam, 10);
            if (!isNaN(baseNum) && baseNum > 0) {
                // base=N (N>0): compare against the state at that PR iteration
                try {
                    const iter = await fetchPrIteration(baseUri, project.name, repositoryId, pullRequestId, baseNum);
                    if (iter.sourceCommitId) {
                        baseCommitId = iter.sourceCommitId;
                        console.log(`Using iteration ${baseNum} source commit as base: ${baseCommitId}`);
                    }
                } catch (err) {
                    console.warn(`Failed to fetch base iteration ${baseNum}, falling back to lastMergeTargetCommit:`, err);
                }
            }
            // base=0 means compare against the original target branch — keep lastMergeTargetCommit
        }

        console.log(`Head commit: ${headCommitId}`);
        console.log(`Base commit: ${baseCommitId}`);

        // If no path or not a PDF, show the file picker
        if (!selectedPath || !selectedPath.toLowerCase().endsWith('.pdf')) {
            const loading = document.getElementById('loading');
            if (loading) loading.style.display = 'none';

            let changedPdfs: string[] = [];
            try {
                changedPdfs = await fetchChangedPdfFiles(baseUri, project.name, repositoryId, headCommitId, baseCommitId);
            } catch (err) {
                console.error('Failed to fetch changed PDF files:', err);
            }
            showFilePicker(changedPdfs, selectedPath);
            SDK.notifyLoadSucceeded();
            return;
        }

        // Load and render the diff for the selected PDF
        console.log(`Loading PDF diff for: ${selectedPath}`);
        let baseData: Uint8Array | null = null;
        try {
            baseData = await fetchPdfFile(baseUri, project.name, repositoryId, selectedPath, baseCommitId);
            console.log('Base PDF fetched successfully');
        } catch (err) {
            console.log('Base PDF not found (file might be new in this PR):', err);
        }

        let headData: Uint8Array | null = null;
        try {
            headData = await fetchPdfFile(baseUri, project.name, repositoryId, selectedPath, headCommitId);
            console.log('Head PDF fetched successfully');
        } catch (err) {
            console.log('Head PDF not found (file might be deleted in this PR):', err);
        }

        if (!baseData && !headData) {
            throw new Error(`PDF file not found in either commit: ${selectedPath}`);
        }

        if (diffViewer) {
            const baseLabel = baseIterParam && parseInt(baseIterParam, 10) > 0
                ? `Iteration ${baseIterParam}`
                : 'Base';
            const headLabel = iterationParam ? `Iteration ${iterationParam}` : 'Head';
            diffViewer.setLabels(baseLabel, headLabel);
            await diffViewer.loadPdfsFromData(baseData, headData);
            await diffViewer.render('side-by-side');
            console.log('PDF diff rendered successfully');
        }

    } catch (error) {
        console.error('Error loading PDFs from context:', error);
        throw error;
    }
}

async function fetchPrIteration(
    baseUri: string, projectName: string, repositoryId: string,
    pullRequestId: number, iterationId: number
): Promise<{ sourceCommitId: string; targetCommitId: string }> {
    const apiUrl = `${baseUri}/${projectName}/_apis/git/repositories/${repositoryId}/pullRequests/${pullRequestId}/iterations/${iterationId}?api-version=7.0`;
    console.log(`Fetching PR iteration ${iterationId}: ${apiUrl}`);

    const accessToken = await SDK.getAccessToken();
    const response = await fetch(apiUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log(`Iteration ${iterationId} data:`, JSON.stringify(data));
    return {
        sourceCommitId: data.sourceRefCommit?.commitId,
        targetCommitId: data.targetRefCommit?.commitId,
    };
}

function updatePathDisplay(path: string | null): void {
    const el = document.getElementById('path-display');
    if (el) el.textContent = path ? `File: ${path}` : 'No file selected';
}

async function fetchChangedPdfFiles(
    baseUri: string, projectName: string, repositoryId: string,
    sourceCommitId: string, targetCommitId: string
): Promise<string[]> {
    const apiUrl = `${baseUri}/${projectName}/_apis/git/repositories/${repositoryId}/diffs/commits` +
        `?baseVersion=${targetCommitId}&baseVersionType=commit` +
        `&targetVersion=${sourceCommitId}&targetVersionType=commit` +
        `&$top=1000&api-version=7.0`;
    console.log(`Fetching changed files: ${apiUrl}`);

    const accessToken = await SDK.getAccessToken();
    const response = await fetch(apiUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch changed files: HTTP ${response.status}`);
    }

    const data = await response.json();
    const changes: any[] = data.changes || [];
    return changes
        .filter(c => !c.item?.isFolder && c.item?.path?.toLowerCase().endsWith('.pdf'))
        .map(c => c.item.path as string)
        .sort();
}

function showFilePicker(pdfs: string[], currentPath: string | null): void {
    // Remove any existing picker
    document.getElementById('file-picker')?.remove();

    const container = document.getElementById('viewer-container');
    if (!container) return;

    const picker = document.createElement('div');
    picker.id = 'file-picker';
    picker.className = 'file-picker';

    const msg = document.createElement('p');
    msg.className = 'file-picker-message';
    if (currentPath && !currentPath.toLowerCase().endsWith('.pdf')) {
        msg.textContent = `"${currentPath}" is not a PDF file. Select a PDF changed in this pull request:`;
    } else {
        msg.textContent = 'Select a PDF file changed in this pull request:';
    }
    picker.appendChild(msg);

    if (pdfs.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'file-picker-empty';
        empty.textContent = 'No PDF files were changed in this pull request.';
        picker.appendChild(empty);
    } else {
        const list = document.createElement('ul');
        list.className = 'file-picker-list';
        pdfs.forEach(path => {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.className = 'file-picker-item';
            btn.textContent = path;
            btn.addEventListener('click', async () => {
                // Update the host page URL so the path is reflected in the address bar
                try {
                    const nav = await SDK.getService<IHostNavigationService>(CommonServiceIds.HostNavigationService);
                    nav.setQueryParams({ path });
                } catch (e) {
                    console.warn('Could not update URL query params:', e);
                }
                overridePath = path;
                picker.remove();
                const loading = document.getElementById('loading');
                if (loading) {
                    loading.textContent = `Loading ${path}...`;
                    loading.style.display = 'block';
                }
                loadPdfsFromContext();
            });
            li.appendChild(btn);
            list.appendChild(li);
        });
        picker.appendChild(list);
    }

    container.insertBefore(picker, container.firstChild);
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
