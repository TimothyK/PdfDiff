import * as SDK from "azure-devops-extension-sdk";
import { PdfDiffViewer } from './pr-diff-viewer';
import { CommonServiceIds, IProjectPageService, getClient } from "azure-devops-extension-api";
import { GitRestClient, VersionControlRecursionType, GitVersionType } from "azure-devops-extension-api/Git";

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
        console.log('Pull request commits:', pullRequest.commits);

        // Get commit IDs from the pull request object
        const baseCommitId = pullRequest.lastMergeSourceCommit?.commitId;
        const headCommitId = pullRequest.lastMergeTargetCommit?.commitId;

        console.log(`Base commit: ${baseCommitId}, Head commit: ${headCommitId}`);
        
        if (!baseCommitId || !headCommitId) {
            throw new Error('Could not determine source and target commits for this Pull Request');
        }

        // For now, let's hardcode a PDF path to test if fetching works
        // TODO: Need to find a way to get the list of changed files without hanging API calls
        const pdfPath = '/116U005299-03-BOL.pdf'; // Replace with actual path from your PR
        
        console.log(`Testing with PDF path: ${pdfPath}`);

        // Get Git client
        const gitClient = getClient(GitRestClient);
        
        console.log('Fetching PDF files from commits...');
        try {
            // Fetch the PDF files
            console.log('About to fetch base PDF...');
            const baseData = await fetchPdfFile(gitClient, repositoryId, pdfPath, baseCommitId, project.id!);
            console.log('Base PDF fetched successfully');
            
            console.log('About to fetch head PDF...');
            const headData = await fetchPdfFile(gitClient, repositoryId, pdfPath, headCommitId, project.id!);
            console.log('Head PDF fetched successfully');

            console.log('PDF files fetched, rendering diff...');
            if (diffViewer) {
                await diffViewer.loadPdfsFromData(baseData, headData);
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

async function fetchPdfFile(gitClient: GitRestClient, repositoryId: string, path: string, commitId: string, projectId: string): Promise<Uint8Array> {
    try {
        console.log(`Fetching PDF: repo=${repositoryId}, path=${path}, commit=${commitId}, project=${projectId}`);
        
        // Fetch the file content at the specific commit
        console.log('Calling gitClient.getItem...');
        const item = await gitClient.getItem(
            repositoryId,
            path,
            projectId, // project
            undefined, // scopePath
            VersionControlRecursionType.None,
            false, // includeContentMetadata
            false, // latestProcessedChange
            false, // download
            {
                version: commitId,
                versionType: GitVersionType.Commit,
                versionOptions: 0
            }
        );

        console.log('gitClient.getItem returned:', item ? 'item received' : 'null');
        
        if (!item || !item.content) {
            throw new Error(`Could not fetch file content for ${path}`);
        }

        console.log('Converting base64 content to Uint8Array...');

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
