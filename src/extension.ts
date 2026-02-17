import * as SDK from "azure-devops-extension-sdk";
import { PdfDiffViewer } from './pr-diff-viewer';
import { CommonServiceIds, IProjectPageService } from "azure-devops-extension-api";

let diffViewer: PdfDiffViewer | null = null;

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
            console.log('Inline button clicked');
            setActiveButton('inline-btn');
            if (diffViewer) {
                console.log('Calling diffViewer.render(inline)');
                diffViewer.render('inline');
            }
        });
    }

    if (pixelDiffBtn) {
        pixelDiffBtn.addEventListener('click', () => {
            console.log('Pixel diff button clicked');
            setActiveButton('pixel-diff-btn');
            if (diffViewer) {
                console.log('Calling diffViewer.render(pixel-diff)');
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

        // For now, let's hardcode a PDF path to test if fetching works
        // TODO: Need to find a way to get the list of changed files without hanging API calls
        const pdfPath = '/116U005299-03-BOL.pdf'; // Replace with actual path from your PR
        
        console.log(`Testing with PDF path: ${pdfPath}`);

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
                
                // Debug: Check if containers exist
                const baseContainer = document.getElementById('base-container');
                const headContainer = document.getElementById('head-container');
                console.log('Base container exists:', !!baseContainer);
                console.log('Head container exists:', !!headContainer);
                console.log('Document body innerHTML length:', document.body?.innerHTML?.length || 0);
                
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
